import { randomUUID } from 'node:crypto';
import { logger } from '@/utils/logger';
import { UniqueViolationError } from '@/utils/errors';

/**
 * A tiny table interface with two implementations.
 *
 * Services talk to `Table<T>` only, so switching DATA_DRIVER between the
 * seeded in-process store and Supabase/PostgreSQL changes nothing above this
 * file. That is the same idea the tech stack applies to payments: the provider
 * moves, the workflow does not.
 */

export type Where<T> = Partial<Record<keyof T, unknown>>;

export interface FindOptions<T> {
  where?: Where<T>;
  /** Predicate applied after `where` — for anything equality can't express. */
  filter?: (record: T) => boolean;
  orderBy?: { field: keyof T; direction?: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

export interface Table<T extends { id: string }> {
  readonly name: string;
  find(options?: FindOptions<T>): Promise<T[]>;
  findOne(where: Where<T>): Promise<T | null>;
  byId(id: string): Promise<T | null>;
  insert(record: Omit<T, 'id'> & { id?: string }): Promise<T>;
  insertMany(records: (Omit<T, 'id'> & { id?: string })[]): Promise<T[]>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<boolean>;
  count(where?: Where<T>, filter?: (record: T) => boolean): Promise<number>;
  /** Deletes every row. Callers must clear children before parents. */
  clear(): Promise<void>;
  /** Replaces all rows — used by the seeder. */
  reset(records: T[]): Promise<void>;
}

function matches<T>(record: T, where?: Where<T>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    const actual = (record as Record<string, unknown>)[key];
    if (Array.isArray(expected)) return (expected as unknown[]).includes(actual);
    return actual === expected;
  });
}

function sortRecords<T>(records: T[], orderBy?: FindOptions<T>['orderBy']): T[] {
  if (!orderBy) return records;
  const direction = orderBy.direction === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    const left = (a as Record<string, unknown>)[orderBy.field as string];
    const right = (b as Record<string, unknown>)[orderBy.field as string];
    if (left === right) return 0;
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    return left > right ? direction : -direction;
  });
}

// ── In-memory ────────────────────────────────────────────────────────────────

export class MemoryTable<T extends { id: string }> implements Table<T> {
  private rows = new Map<string, T>();

  constructor(
    public readonly name: string,
    private onChange?: () => void,
  ) {}

  private touch() {
    this.onChange?.();
  }

  async find(options: FindOptions<T> = {}): Promise<T[]> {
    let records = [...this.rows.values()].filter((record) => matches(record, options.where));
    if (options.filter) records = records.filter(options.filter);
    records = sortRecords(records, options.orderBy);
    const offset = options.offset ?? 0;
    return options.limit === undefined
      ? records.slice(offset)
      : records.slice(offset, offset + options.limit);
  }

  async findOne(where: Where<T>): Promise<T | null> {
    for (const record of this.rows.values()) {
      if (matches(record, where)) return record;
    }
    return null;
  }

  async byId(id: string): Promise<T | null> {
    return this.rows.get(id) ?? null;
  }

  async insert(record: Omit<T, 'id'> & { id?: string }): Promise<T> {
    const withId = { ...record, id: record.id ?? randomUUID() } as T;
    this.rows.set(withId.id, withId);
    this.touch();
    return withId;
  }

  async insertMany(records: (Omit<T, 'id'> & { id?: string })[]): Promise<T[]> {
    const inserted: T[] = [];
    for (const record of records) {
      const withId = { ...record, id: record.id ?? randomUUID() } as T;
      this.rows.set(withId.id, withId);
      inserted.push(withId);
    }
    this.touch();
    return inserted;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error(`${this.name}: no record with id ${id}`);
    const next = { ...existing, ...patch, id } as T;
    this.rows.set(id, next);
    this.touch();
    return next;
  }

  async remove(id: string): Promise<boolean> {
    const removed = this.rows.delete(id);
    if (removed) this.touch();
    return removed;
  }

  async count(where?: Where<T>, filter?: (record: T) => boolean): Promise<number> {
    let records = [...this.rows.values()].filter((record) => matches(record, where));
    if (filter) records = records.filter(filter);
    return records.length;
  }

  async clear(): Promise<void> {
    this.rows.clear();
    this.touch();
  }

  async reset(records: T[]): Promise<void> {
    this.rows.clear();
    for (const record of records) this.rows.set(record.id, record);
    this.touch();
  }

  /** Snapshot / restore, used by the optional dev-time file persistence. */
  snapshot(): T[] {
    return [...this.rows.values()];
  }

  restore(records: T[]): void {
    this.rows.clear();
    for (const record of records) this.rows.set(record.id, record);
  }

  get size(): number {
    return this.rows.size;
  }
}

// ── Supabase / PostgreSQL ────────────────────────────────────────────────────

/** `spaceId` ⇄ `space_id`. Shallow only — nested jsonb payloads are untouched. */
const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const rowToRecord = <T>(row: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])) as T;

const recordToRow = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [toSnake(key), value]));

/** Structural type for the slice of supabase-js this table uses. */
export interface SupabaseLike {
  from(table: string): any;
}

/** One page per round trip. 1000 is PostgREST's usual ceiling. */
const PAGE_SIZE = 1000;

/**
 * A backstop, not a business rule: it exists so a runaway loop cannot try to
 * pull an unbounded table into memory. Crossing it is logged rather than
 * silently truncated, because a silent cap is the bug this whole path fixes.
 */
const MAX_ROWS = 100_000;

/** PostgREST surfaces the Postgres SQLSTATE on the error object. */
interface PostgrestError {
  message: string;
  code?: string;
  details?: string;
  constraint?: string;
}

/**
 * Turns a PostgREST error into the right kind of exception.
 *
 * A unique violation is a normal outcome of a contended write — two people
 * booking the same consultation slot, the same photograph wishlisted twice —
 * not a fault. Collapsing it into a generic `Error` sent it to the 500 handler
 * and told the visitor the server was broken. Everything else keeps the old
 * behaviour.
 */
function raise(table: string, error: PostgrestError): never {
  if (error.code === '23505') {
    throw new UniqueViolationError(
      table,
      error.constraint,
      `${table}: ${error.message}`,
    );
  }
  throw new Error(`${table}: ${error.message}`);
}

/**
 * supabase-js query builders are thenables rather than plain objects, so this
 * takes `any` deliberately — the structural `SupabaseLike` above already keeps
 * the SDK's types out of the rest of the file.
 */
async function runQuery(table: string, query: any): Promise<Record<string, unknown>[]> {
  const { data, error } = (await query) as {
    data: Record<string, unknown>[] | null;
    error: PostgrestError | null;
  };
  if (error) raise(table, error);
  return data ?? [];
}

export class SupabaseTable<T extends { id: string }> implements Table<T> {
  constructor(
    public readonly name: string,
    private client: SupabaseLike,
  ) {}

  private query() {
    return this.client.from(this.name);
  }

  /** Walks the result set a page at a time until it is exhausted. */
  private async fetchAllPages(query: any): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];

    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      const page = await runQuery(this.name, query.range(from, from + PAGE_SIZE - 1));
      all.push(...page);

      // A short page means there is nothing after it.
      if (page.length < PAGE_SIZE) return all;
    }

    logger.warn(
      `${this.name}: stopped reading at ${MAX_ROWS} rows. Results are truncated - ` +
        `this query needs a limit or a narrower filter.`,
    );
    return all;
  }

  async find(options: FindOptions<T> = {}): Promise<T[]> {
    let query = this.query().select('*');

    for (const [key, value] of Object.entries(options.where ?? {})) {
      if (value === undefined) continue;
      query = Array.isArray(value)
        ? query.in(toSnake(key), value)
        : query.eq(toSnake(key), value as never);
    }

    if (options.orderBy) {
      query = query.order(toSnake(options.orderBy.field as string), {
        ascending: options.orderBy.direction === 'asc',
      });
    }

    // `filter` is a JS predicate, so it cannot be pushed into SQL. Paginate
    // after filtering when one is supplied, otherwise let Postgres do it.
    if (!options.filter && options.limit !== undefined) {
      const offset = options.offset ?? 0;
      query = query.range(offset, offset + options.limit - 1);
    }

    // An unbounded select is silently capped by PostgREST's `max-rows`, so a
    // caller asking for "every approved artwork" would quietly receive only the
    // first page once the gallery outgrows that ceiling — no error, just
    // missing photographs. Page through explicitly instead, so correctness
    // does not depend on a server setting nobody here controls.
    const unbounded = options.limit === undefined || Boolean(options.filter);
    const rows = unbounded ? await this.fetchAllPages(query) : await runQuery(this.name, query);

    let records = rows.map((row: Record<string, unknown>) => rowToRecord<T>(row));
    if (options.filter) {
      records = records.filter(options.filter);
      const offset = options.offset ?? 0;
      records =
        options.limit === undefined
          ? records.slice(offset)
          : records.slice(offset, offset + options.limit);
    }
    return records;
  }

  async findOne(where: Where<T>): Promise<T | null> {
    const [record] = await this.find({ where, limit: 1 });
    return record ?? null;
  }

  async byId(id: string): Promise<T | null> {
    const { data, error } = await this.query().select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`${this.name}: ${error.message}`);
    return data ? rowToRecord<T>(data) : null;
  }

  async insert(record: Omit<T, 'id'> & { id?: string }): Promise<T> {
    const payload = recordToRow({ ...record, id: record.id ?? randomUUID() });
    const { data, error } = await this.query().insert(payload).select().single();
    if (error) raise(this.name, error);
    return rowToRecord<T>(data);
  }

  async insertMany(records: (Omit<T, 'id'> & { id?: string })[]): Promise<T[]> {
    if (records.length === 0) return [];
    const payload = records.map((record) => recordToRow({ ...record, id: record.id ?? randomUUID() }));
    const { data, error } = await this.query().insert(payload).select();
    if (error) raise(this.name, error);
    return (data ?? []).map((row: Record<string, unknown>) => rowToRecord<T>(row));
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const { data, error } = await this.query()
      .update(recordToRow(patch as Record<string, unknown>))
      .eq('id', id)
      .select()
      .single();
    if (error) raise(this.name, error);
    return rowToRecord<T>(data);
  }

  async remove(id: string): Promise<boolean> {
    const { error } = await this.query().delete().eq('id', id);
    if (error) throw new Error(`${this.name}: ${error.message}`);
    return true;
  }

  async count(where?: Where<T>, filter?: (record: T) => boolean): Promise<number> {
    if (filter) return (await this.find({ where, filter })).length;

    let query = this.query().select('id', { count: 'exact', head: true });
    for (const [key, value] of Object.entries(where ?? {})) {
      if (value === undefined) continue;
      query = Array.isArray(value)
        ? query.in(toSnake(key), value)
        : query.eq(toSnake(key), value as never);
    }
    const { count, error } = await query;
    if (error) throw new Error(`${this.name}: ${error.message}`);
    return count ?? 0;
  }

  async clear(): Promise<void> {
    // PostgREST refuses an unfiltered delete, so match every row explicitly.
    // The error must be surfaced: a foreign key can block this, and silently
    // continuing would leave the table populated and fail later on a duplicate.
    const { error } = await this.query()
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(`${this.name}: could not clear - ${error.message}`);
  }

  async reset(records: T[]): Promise<void> {
    await this.clear();
    await this.insertMany(records);
  }
}

/** Page a list the same way everywhere. */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}
