import {
  ROTATION_INTERVALS,
  type Client,
  type ClientInput,
  type ClientSearchResult,
  type Space,
} from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { recordAudit } from '@/services/audit.service';
import { notify } from '@/services/notification.service';
import { ensureSpaceCode } from '@/services/space-code.service';
import { badRequest, conflict, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';

/**
 * Clients: the businesses ARTINU works with, whether or not anyone there ever
 * signs in. See console-orders.ts for the model.
 */

type Actor = Pick<StoredUser, 'id' | 'email' | 'role'>;

const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '').slice(-10);
const lower = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** Find existing clients and registered spaces in one list. */
export async function searchClients(q: string): Promise<ClientSearchResult[]> {
  const needle = lower(q);
  const phone = digits(q);
  const [clients, spaces, users] = await Promise.all([
    db.clients.find({ where: { status: 'active' } }),
    db.spaces.find(),
    db.users.find({ where: { role: 'space_owner' } }),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));

  const matches = (...values: (string | null | undefined)[]) =>
    !needle ||
    values.some((value) => lower(value).includes(needle)) ||
    (phone.length >= 6 && values.some((value) => digits(value).includes(phone)));

  const results: ClientSearchResult[] = [];

  for (const client of clients) {
    if (!matches(client.name, client.contactName, client.email, client.phone, client.code, client.city)) continue;
    const locations = spaces.filter((space) => space.clientId === client.id);
    results.push({
      kind: 'client',
      clientId: client.id,
      spaceId: locations.length === 1 ? locations[0]!.id : null,
      name: client.name,
      city: client.city,
      contactName: client.contactName,
      email: client.email ?? null,
      phone: client.phone,
      spaceType: client.type,
      hasAccount: Boolean(client.linkedUserId),
      spaces: locations.map((space) => ({ id: space.id, name: space.name, city: space.city })),
    });
  }

  for (const space of spaces) {
    // A client's own location is listed under the client, above.
    if (space.clientId && !space.ownerId) continue;
    if (!matches(space.name, space.contactName, space.contactEmail, space.contactPhone, space.city, space.code)) continue;
    const owner = space.ownerId ? userById.get(space.ownerId) : null;
    results.push({
      kind: 'space',
      clientId: space.clientId ?? null,
      spaceId: space.id,
      name: space.name,
      city: space.city,
      contactName: space.contactName,
      email: space.contactEmail || owner?.email || null,
      phone: space.contactPhone,
      spaceType: space.type,
      hasAccount: Boolean(owner),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
}

/**
 * The same business entered twice is the commonest way client records rot.
 * A new client is refused when its phone number or email is already on file,
 * or its name in the same city - staff pick the existing record instead.
 */
export async function findDuplicateClient(input: ClientInput): Promise<string | null> {
  const [clients, spaces] = await Promise.all([db.clients.find(), db.spaces.find()]);
  const phone = digits(input.phone);
  const email = lower(input.email);
  const nameCity = `${lower(input.name)}|${lower(input.city)}`;

  for (const client of clients) {
    if (phone && digits(client.phone) === phone) return `${client.name} (${client.city}) already has this phone number.`;
    if (email && lower(client.email) === email) return `${client.name} (${client.city}) already has this email address.`;
    if (`${lower(client.name)}|${lower(client.city)}` === nameCity) return `${client.name} in ${client.city} is already a client.`;
  }
  for (const space of spaces) {
    if (phone && digits(space.contactPhone) === phone) return `${space.name} (${space.city}) is a registered space with this phone number.`;
    if (email && lower(space.contactEmail) === email) return `${space.name} (${space.city}) is a registered space with this email address.`;
  }
  return null;
}

async function nextClientCode(): Promise<string> {
  const clients = await db.clients.find();
  const highest = clients.reduce((max, client) => {
    const match = /(\d+)$/.exec(client.code ?? '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const taken = new Set(clients.map((client) => client.code));
  let next = highest + 1;
  while (taken.has(`CLT-${String(next).padStart(4, '0')}`)) next += 1;
  return `CLT-${String(next).padStart(4, '0')}`;
}

/** A location for a client: where the frames are installed. No owner account. */
export async function createClientLocation(client: Client, installAddress?: ClientInput['installAddress']): Promise<Space> {
  const address = installAddress ?? {
    addressLine1: client.addressLine1,
    addressLine2: client.addressLine2,
    city: client.city,
    pin: client.pin,
  };
  const space = await db.spaces.insert({
    ownerId: null,
    clientId: client.id,
    name: client.name,
    type: client.type,
    theme: null,
    cuisine: null,
    wallColor: null,
    lighting: null,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? null,
    city: address.city,
    state: client.state ?? null,
    pin: address.pin || null,
    contactName: client.contactName,
    contactPhone: client.phone,
    // The column is NOT NULL; a client with no email simply has none to show.
    contactEmail: client.email ?? '',
    wallCount: null,
    imageUrls: [],
    rotationIntervalMonths: ROTATION_INTERVALS[0],
    verified: false,
    createdAt: now(),
    updatedAt: now(),
  });
  await ensureSpaceCode(space).catch((error) => logger.error(`Could not allocate a space ID for ${space.name}`, error));
  return (await db.spaces.byId(space.id)) ?? space;
}

export async function createClient(actor: Actor, input: ClientInput): Promise<{ client: Client; space: Space }> {
  const duplicate = await findDuplicateClient(input);
  if (duplicate) throw conflict(`${duplicate} Choose them as an existing client instead.`);

  const client = await db.clients.insert({
    code: await nextClientCode(),
    name: input.name.trim(),
    type: input.type,
    contactName: input.contactName.trim(),
    email: input.email ? input.email.trim().toLowerCase() : null,
    phone: input.phone.trim(),
    addressLine1: input.addressLine1.trim(),
    addressLine2: input.addressLine2?.trim() || null,
    city: input.city.trim(),
    state: input.state?.trim() || null,
    pin: input.pin || null,
    gstin: input.gstin || null,
    notes: input.notes?.trim() || null,
    linkedUserId: null,
    linkedAt: null,
    linkedBy: null,
    status: 'active',
    createdBy: actor.id,
    createdAt: now(),
    updatedAt: now(),
  });
  const space = await createClientLocation(client, input.installAddress);

  await recordAudit({
    actor,
    action: 'client.created',
    entity: 'client',
    entityId: client.id,
    meta: { code: client.code, name: client.name, spaceId: space.id, hasEmail: Boolean(client.email) },
  });
  return { client, space };
}

export async function getClient(id: string) {
  const client = await db.clients.byId(id);
  if (!client) throw notFound('That client');
  const [spaces, orders] = await Promise.all([
    db.spaces.find({ where: { clientId: id } }),
    db.orders.find({ where: { clientId: id }, orderBy: { field: 'placedAt', direction: 'desc' } }),
  ]);
  return {
    client,
    spaces,
    orders: orders.map((order) => ({
      id: order.id,
      reference: order.reference,
      status: order.status,
      total: order.pricing.total,
      placedAt: order.placedAt,
    })),
  };
}

/**
 * Attach a client's history to a registered account.
 *
 * Never automatic, and never on a matching email alone: a member of staff does
 * it, says how they confirmed it is the same business, and the account must
 * have proved it owns its address. From then on the client's locations,
 * orders and invoices belong to that account, so the owner sees their history
 * on their own dashboard.
 */
export async function linkClientAccount(
  actor: Actor,
  clientId: string,
  account: { userId?: string; email?: string },
  reason: string,
) {
  const client = await db.clients.byId(clientId);
  if (!client) throw notFound('That client');
  if (client.linkedUserId) throw conflict('This client is already linked to an account.');

  // An exact sign-in address, typed by staff who confirmed it - never a fuzzy match.
  const user = account.userId
    ? await db.users.byId(account.userId)
    : (await db.users.find({ where: { role: 'space_owner' } })).find(
        (candidate) => candidate.email.toLowerCase() === account.email?.trim().toLowerCase(),
      );
  if (!user) throw notFound('A space owner account with that email');
  if (user.role !== 'space_owner') throw badRequest('Only a space owner account can take over a client.');
  if (!user.emailVerified) throw badRequest('That account has not verified its email address yet.');

  const linkedAt = now();
  await db.clients.update(client.id, { linkedUserId: user.id, linkedAt, linkedBy: actor.id, updatedAt: linkedAt } as never);

  const spaces = (await db.spaces.find({ where: { clientId: client.id } })).filter((space) => !space.ownerId);
  for (const space of spaces) await db.spaces.update(space.id, { ownerId: user.id, updatedAt: linkedAt });

  const orders = (await db.orders.find({ where: { clientId: client.id } })).filter((order) => !order.ownerId);
  for (const order of orders) {
    await db.orders.update(order.id, { ownerId: user.id, updatedAt: linkedAt });
    const invoice = await db.invoices.findOne({ orderId: order.id });
    if (invoice && !invoice.ownerId) await db.invoices.update(invoice.id, { ownerId: user.id });
  }

  await recordAudit({
    actor,
    action: 'client.linked_to_account',
    entity: 'client',
    entityId: client.id,
    meta: { userId: user.id, email: user.email, reason, spaces: spaces.length, orders: orders.length },
  });
  await notify({
    userId: user.id,
    type: 'system',
    title: `${client.name} is now on your account`,
    body: `Your ${orders.length} order${orders.length === 1 ? '' : 's'} with ARTINU and ${spaces.length} location${spaces.length === 1 ? '' : 's'} now appear here.`,
    link: '/space/orders',
  });

  return getClient(client.id);
}
