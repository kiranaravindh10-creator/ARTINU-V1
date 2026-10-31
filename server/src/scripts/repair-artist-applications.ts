/**
 * Repair artist applications whose setup never finished: photographs that
 * were submitted but never became photograph records (every application
 * accepted before automatic setup existed), and a missing photographer code.
 *
 *   npm run repair:applications --workspace server -- --application <id> [--application <id> ...]
 *       DRY RUN. Reads only - safe with READ_ONLY_MODE=true. Prints the plan,
 *       and the exact --expect values to execute it with.
 *
 *   npm run repair:applications --workspace server -- --report
 *       DRY RUN for every application, plus every artist account without a code.
 *
 *   READ_ONLY_MODE=false npx tsx src/scripts/repair-artist-applications.ts --execute \
 *       --application <id> --expect <id>:<CODE>:<photographs> [...]
 *       Applies the plan for the named applications only, then verifies it.
 *       --expect restates what the reviewed dry run showed; if the live data
 *       no longer matches it exactly, nothing is written.
 *
 * What execution changes - and nothing else:
 *   1. a photographer code where the profile has none (written only while it
 *      is still empty; an existing code is never touched);
 *   2. the profile's photo counter, advanced by the number of photographs
 *      (only if nobody allocated a number since the check - reserved first, so
 *      an upload running at the same moment cannot collide);
 *   3. one photograph record per submitted file that has none, all of an
 *      artist's in ONE insert statement (they all land or none do), each
 *      pointing at the file already in storage - nothing uploaded, moved or
 *      renamed - and published the way a Studio upload is: the automated
 *      checks run, and what clears them is `approved`;
 *   4. an audit entry for each of the above.
 * No email is sent. No account, password, profile field or other photograph
 * is changed. A second run finds nothing to do.
 */
import { artistSlug, listPublicArtists, findArtistBySlug } from '@/services/user.service';
import { buildApplicationArtwork, sizeOf } from '@/services/artist-onboarding.service';
import { recordAudit } from '@/services/audit.service';
import { codeVariants, ensurePhotographerCode, photographerCodeFromName } from '@/services/photo-id.service';
import { assertWritable, db, flushPersistedStore, supabaseClient, writesAreLocked } from '@/database/db';
import { env } from '@/config/env';
import { now } from '@/utils/ids';

const args = process.argv.slice(2);
const valuesOf = (flag: string) => args.flatMap((arg, index) => (arg === flag ? [args[index + 1] ?? ''] : [])).filter(Boolean);
const ids = valuesOf('--application');
const expectations = new Map(
  valuesOf('--expect').map((value) => {
    const [id, code, count] = value.split(':');
    return [id!, { code: code ?? '', count: Number(count) }];
  }),
);
const execute = args.includes('--execute');
const reportAll = args.includes('--report');
const SOURCE = 'repair-artist-applications';

const mask = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, c: string) => `${a}${'*'.repeat(Math.min(b.length, 6))}${c}`);
const fileName = (url: string) => url.split('/').pop() ?? url;

async function headOf(url: string): Promise<{ ok: boolean | null; status: number | null; bytes: number | null; type: string | null }> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return {
      ok: response.ok && (response.headers.get('content-type') ?? '').startsWith('image/'),
      status: response.status,
      bytes: Number(response.headers.get('content-length') ?? 0) || null,
      type: response.headers.get('content-type'),
    };
  } catch {
    return { ok: null, status: null, bytes: null, type: null };
  }
}

type Plan = NonNullable<Awaited<ReturnType<typeof plan>>>;

async function plan(applicationId: string) {
  const application = await db.applications.byId(applicationId);
  if (!application) return null;

  const email = application.email.trim().toLowerCase();
  const [users, profiles, artworks] = await Promise.all([db.users.find(), db.profiles.find(), db.artworks.find()]);
  const sameEmail = users.filter((entry) => entry.email.trim().toLowerCase() === email);
  const user = sameEmail[0] ?? null;
  const userProfiles = user ? profiles.filter((entry) => entry.userId === user.id) : [];
  const profile = userProfiles[0] ?? null;
  const blocked: string[] = [];
  if (sameEmail.length > 1) blocked.push(`${sameEmail.length} accounts share this email - ambiguous.`);
  if (!user) blocked.push('No account on this email - this repair only completes existing accounts.');
  else if (user.role !== 'artist') blocked.push(`The account on this email is a ${user.role}, not an artist.`);
  if (user && userProfiles.length !== 1) blocked.push(`The account has ${userProfiles.length} profiles - expected exactly one.`);

  // The code: the existing one, or exactly what ensurePhotographerCode would pick.
  const taken = new Set(profiles.map((entry) => entry.photographerCode).filter(Boolean) as string[]);
  const proposedCode = profile?.photographerCode
    ? null
    : (codeVariants(photographerCodeFromName(profile?.displayName?.trim() || profile?.fullName || application.fullName)).find(
        (candidate) => !taken.has(candidate),
      ) ?? null);
  const code = profile?.photographerCode ?? proposedCode;
  if (!code) blocked.push('No photographer code is available.');

  // The files.
  const urls = [...new Set(application.portfolioUrls)];
  let next = profile?.nextPhotoNumber ?? 1;
  const usedPhotoIds = new Set(artworks.map((artwork) => artwork.photoId).filter(Boolean));
  const files = [];
  for (const [index, url] of urls.entries()) {
    const head = await headOf(url);
    const records = artworks.filter((artwork) => artwork.originalUrl === url || artwork.imageUrl === url || artwork.thumbnailUrl === url);
    const mine = user ? records.find((record) => record.artistId === user.id) : undefined;
    const elsewhere = records.filter((record) => record.artistId !== user?.id);
    let action: 'keep' | 'create' | 'missing' | 'unreachable' | 'ambiguous';
    if (mine) action = 'keep';
    else if (elsewhere.length > 0) action = 'ambiguous';
    else if (head.ok === null) action = 'unreachable';
    else if (!head.ok) action = 'missing';
    else action = 'create';
    let photoId: string | null = mine?.photoId ?? null;
    if (action === 'create' && code) {
      photoId = `${code}${String(next).padStart(3, '0')}`;
      if (usedPhotoIds.has(photoId)) blocked.push(`Photo ID ${photoId} is already used by another photograph.`);
      next += 1;
    }
    if (action === 'missing') blocked.push(`File ${index + 1} (${fileName(url)}) is not in storage (HTTP ${head.status}).`);
    if (action === 'unreachable') blocked.push(`File ${index + 1} (${fileName(url)}) could not be reached to check it.`);
    if (action === 'ambiguous') blocked.push(`File ${index + 1} (${fileName(url)}) is already a photograph owned by another account.`);
    files.push({ index, url, file: fileName(url), storage: head, action, photoId, existingRecordId: mine?.id ?? elsewhere[0]?.id ?? null });
  }
  // Numbers at or above the counter would collide with what the counter hands out.
  const ownNumbers = user ? artworks.filter((artwork) => artwork.artistId === user.id).map((artwork) => artwork.photoNumber ?? 0) : [];
  if (profile && ownNumbers.some((number) => number >= (profile.nextPhotoNumber ?? 1))) {
    blocked.push('The profile photo counter is behind the photographs it already numbered.');
  }

  const toCreate = files.filter((file) => file.action === 'create');
  const kept = files.filter((file) => file.action === 'keep');
  const approvedNow = user ? artworks.filter((artwork) => artwork.artistId === user.id && artwork.status === 'approved').length : 0;
  const avatar = profile?.avatarUrl ? await headOf(profile.avatarUrl) : null;

  return {
    ready: blocked.length === 0,
    blocked,
    applicationId: application.id,
    name: application.fullName,
    email: mask(email),
    applied: application.createdAt,
    genres: application.genres,
    userId: user?.id ?? null,
    accountStatus: user?.status ?? null,
    profileId: profile?.id ?? null,
    photographerCode: { current: profile?.photographerCode ?? null, proposed: proposedCode },
    code,
    nextPhotoNumber: profile?.nextPhotoNumber ?? 1,
    publicSlug: profile && user ? artistSlug(profile, user.id) : null,
    avatar: profile?.avatarUrl ? { file: fileName(profile.avatarUrl), inStorage: avatar?.ok ?? null } : null,
    submitted: urls.length,
    confirmedInStorage: files.filter((file) => file.storage.ok).length,
    alreadyLinked: kept.length,
    toCreate: toCreate.length,
    approvedPhotographsNow: approvedNow,
    onPublicArtistsPageNow: approvedNow > 0,
    onPublicArtistsPageAfter: approvedNow + toCreate.length > 0,
    files,
    expect: code ? `${application.id}:${code}:${toCreate.length}` : null,
  };
}

function printPlan(entry: Plan | null, id: string) {
  if (!entry) {
    console.log(`\n${id}: no application with that ID.`);
    return;
  }
  console.log(`\n── ${entry.name} · application ${entry.applicationId}`);
  console.log(`   account ${entry.userId} (${entry.accountStatus}) · profile ${entry.profileId} · ${entry.email}`);
  console.log(`   photographer code: ${entry.photographerCode.current ?? `none - will assign ${entry.photographerCode.proposed}`}`);
  console.log(`   public page: /artists/${entry.publicSlug} · on the Artists page now: ${entry.onPublicArtistsPageNow ? 'yes' : 'no'}, after: ${entry.onPublicArtistsPageAfter ? 'yes' : 'no'}`);
  console.log(`   profile picture: ${entry.avatar ? `${entry.avatar.file} (${entry.avatar.inStorage ? 'in storage' : 'NOT FOUND'})` : 'none (the cover falls back to their first photograph)'}`);
  console.log(`   submitted ${entry.submitted} · in storage ${entry.confirmedInStorage} · already linked ${entry.alreadyLinked} · to create ${entry.toCreate}`);
  for (const file of entry.files) {
    console.log(`     ${String(file.index + 1).padStart(2)}. ${file.file}  ${file.storage.status} ${file.storage.type ?? ''} ${file.storage.bytes ?? '?'} bytes  -> ${file.action}${file.photoId ? ` ${file.photoId}` : ''}`);
  }
  console.log(entry.blocked.length ? `   BLOCKED: ${entry.blocked.join(' | ')}` : `   ready · execute with --expect ${entry.expect}`);
}

async function reportEverything() {
  const [applications, users, profiles] = await Promise.all([
    db.applications.find({ orderBy: { field: 'createdAt', direction: 'asc' } }),
    db.users.find({ where: { role: 'artist' } }),
    db.profiles.find(),
  ]);
  const missing = users.filter((user) => !profiles.find((profile) => profile.userId === user.id)?.photographerCode);
  console.log(`Artist accounts without a photographer code: ${missing.length}`);
  for (const user of missing) console.log(`   ${user.id} ${profiles.find((profile) => profile.userId === user.id)?.fullName ?? '(no profile)'}`);
  for (const application of applications) printPlan(await plan(application.id), application.id);
}

/** Reserves `count` photo numbers from `from` - only if nobody took one since the check. */
async function reserveNumbers(profileId: string, from: number, count: number): Promise<boolean> {
  assertWritable('reserving photo numbers');
  const client = env.DATA_DRIVER === 'supabase' ? supabaseClient() : null;
  if (client) {
    const { data, error } = await client
      .from('profiles')
      .update({ next_photo_number: from + count, updated_at: now() })
      .eq('id', profileId)
      .eq('next_photo_number', from)
      .select('id');
    if (error) throw new Error(`profiles: ${error.message}`);
    return (data ?? []).length === 1;
  }
  const current = await db.profiles.byId(profileId);
  if (!current || (current.nextPhotoNumber ?? 1) !== from) return false;
  await db.profiles.update(profileId, { nextPhotoNumber: from + count, updatedAt: now() });
  return true;
}

async function executeOne(reviewed: Plan): Promise<boolean> {
  const label = `${reviewed.name} (${reviewed.applicationId})`;
  const expected = expectations.get(reviewed.applicationId);
  const fresh = await plan(reviewed.applicationId);
  if (!fresh || !fresh.ready) {
    console.error(`STOPPED ${label}: ${fresh ? fresh.blocked.join(' | ') : 'the application has gone'}`);
    return false;
  }
  // Run again after it succeeded: the code is set, every file is linked, and
  // there is nothing to write - check it and say so.
  if (expected && fresh.toCreate === 0 && fresh.photographerCode.current === expected.code && fresh.alreadyLinked >= expected.count) {
    console.log(`   Nothing to do for ${label} - already complete.`);
    return verify(fresh, fresh);
  }
  if (!expected || expected.code !== fresh.code || expected.count !== fresh.toCreate) {
    console.error(
      `STOPPED ${label}: the data no longer matches the reviewed plan (expected ${expected ? `${expected.code}:${expected.count}` : 'nothing - pass --expect'}, ` +
        `found ${fresh.code}:${fresh.toCreate}). Run the dry run again and review it.`,
    );
    return false;
  }

  const before = { artworks: await db.artworks.count(), files: new Map(fresh.files.map((file) => [file.url, file.storage.bytes])) };
  const profile = (await db.profiles.byId(fresh.profileId!))!;

  // 1. The code - written only while the profile has none.
  const code = await ensurePhotographerCode(profile);
  if (code !== fresh.code) {
    console.error(`STOPPED ${label}: the profile now has code ${code}, not ${fresh.code} as reviewed. No photographs were created.`);
    return false;
  }
  if (!fresh.photographerCode.current) {
    await recordAudit({
      action: 'profile.photographer_code_assigned',
      entity: 'user',
      entityId: fresh.userId!,
      meta: { applicationId: fresh.applicationId, code, source: SOURCE },
    });
  }

  // 2. Photo numbers, reserved before anything uses them.
  const creating = fresh.files.filter((file) => file.action === 'create');
  const first = fresh.nextPhotoNumber;
  if (!(await reserveNumbers(fresh.profileId!, first, creating.length))) {
    console.error(`STOPPED ${label}: a photo number was allocated since the check. Nothing was created; run the dry run again.`);
    return false;
  }

  // 3. The records - one statement for all of this artist's photographs.
  const application = (await db.applications.byId(fresh.applicationId))!;
  const rows = [];
  for (const [offset, file] of creating.entries()) {
    const size = await sizeOf(file.url);
    if (size === 'missing') throw new Error(`File ${file.file} disappeared during the repair.`);
    rows.push(
      await buildApplicationArtwork({
        application,
        artistId: fresh.userId!,
        url: file.url,
        index: file.index,
        size: size ?? { width: 2400, height: 1600 },
        photoId: `${code}${String(first + offset).padStart(3, '0')}`,
        photoNumber: first + offset,
      }),
    );
  }
  const created = await db.artworks.insertMany(rows);

  // 4. The trail.
  for (const artwork of created) {
    await recordAudit({
      action: 'artwork.linked_from_application',
      entity: 'artwork',
      entityId: artwork.id,
      meta: { applicationId: fresh.applicationId, userId: fresh.userId, photoId: artwork.photoId, file: artwork.originalUrl, status: artwork.status, source: SOURCE },
    });
  }
  await recordAudit({
    action: 'application.repaired',
    entity: 'application',
    entityId: fresh.applicationId,
    meta: { userId: fresh.userId, code, created: created.length, photoIds: created.map((artwork) => artwork.photoId), source: SOURCE },
  });

  const after = (await plan(fresh.applicationId))!;
  const artworksAfter = await db.artworks.count();
  console.log(`   created ${created.length} records; photographs in the database ${before.artworks} -> ${artworksAfter}`);
  return (await verify(fresh, after)) && artworksAfter - before.artworks === creating.length;
}

/** The final state, checked with the same code the public pages run. */
async function verify(reviewed: Plan, after: Plan): Promise<boolean> {
  const checks: [string, boolean][] = [];
  const owned = (await db.artworks.find({ where: { artistId: after.userId! } })).filter((artwork) =>
    after.files.some((file) => file.url === artwork.originalUrl),
  );
  checks.push(['every submitted file has exactly one record, owned by this account', after.files.every((file) => owned.filter((artwork) => artwork.originalUrl === file.url).length === 1)]);
  checks.push(['no file is now owned by another account', after.files.every((file) => file.action === 'keep')]);
  checks.push(['the photographer code is set, and unchanged if it existed', Boolean(after.photographerCode.current) && (!reviewed.photographerCode.current || after.photographerCode.current === reviewed.photographerCode.current)]);
  checks.push(['the account and profile are the same ones', after.userId === reviewed.userId && after.profileId === reviewed.profileId]);
  checks.push(['every file is still in storage, at the same size', after.files.every((file) => file.storage.ok && reviewed.files.find((r) => r.url === file.url)?.storage.bytes === file.storage.bytes)]);
  const approved = owned.filter((artwork) => artwork.status === 'approved');
  checks.push([`published: ${approved.length} of ${owned.length} are approved (the gallery shows status approved only)`, approved.length === owned.length]);
  const gallery = new Set((await db.artworks.find({ where: { status: 'approved' } })).map((artwork) => artwork.id));
  checks.push(['all of them pass the public gallery query', owned.every((artwork) => gallery.has(artwork.id))]);
  const artists = (await listPublicArtists()).filter((artist) => artist.artworkCount > 0);
  const listed = artists.find((artist) => artist.id === after.userId);
  checks.push([`listed on the public Artists page (${listed?.artworkCount ?? 0} photographs)`, Boolean(listed) && listed!.artworkCount >= approved.length]);
  const page = listed ? await findArtistBySlug(listed.slug).catch(() => null) : null;
  checks.push([`the public profile /artists/${listed?.slug ?? '?'} resolves to this account`, page?.id === after.userId]);
  for (const [name, ok] of checks) console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  return checks.every(([, ok]) => ok);
}

async function main() {
  console.log(`\nArtist application repair - ${execute ? 'EXECUTE' : 'DRY RUN (reads only)'} - data driver: ${env.DATA_DRIVER}`);

  if (reportAll) return reportEverything();
  if (ids.length === 0) {
    console.log('Name the applications: --application <id> (repeatable), or --report for all of them.');
    process.exitCode = 2;
    return;
  }

  const plans = [];
  for (const id of ids) {
    const entry = await plan(id);
    printPlan(entry, id);
    if (!entry) {
      process.exitCode = 1;
      return;
    }
    plans.push(entry);
  }

  if (!execute) {
    const ready = plans.filter((entry) => entry.ready && entry.expect);
    console.log(`\nDry run only - nothing was written.`);
    if (ready.length === plans.length) {
      console.log(
        `To apply exactly this plan:\n  READ_ONLY_MODE=false npx tsx src/scripts/repair-artist-applications.ts --execute ` +
          plans.map((entry) => `--application ${entry.applicationId}`).join(' ') +
          ' ' +
          ready.map((entry) => `--expect ${entry.expect}`).join(' '),
      );
    }
    return;
  }

  if (writesAreLocked() || env.READ_ONLY_MODE) {
    console.error('\nREAD_ONLY_MODE is on, so nothing was written. Run with READ_ONLY_MODE=false once the plan is approved.\n');
    process.exitCode = 1;
    return;
  }

  let allGood = true;
  for (const entry of plans) {
    console.log(`\nExecuting ${entry.name}`);
    const ok = await executeOne(entry);
    console.log(ok ? '   VERIFIED' : '   NOT VERIFIED - see above');
    allGood = allGood && ok;
  }
  if (!allGood) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    flushPersistedStore();
    setTimeout(() => process.exit(process.exitCode ?? 0), 300);
  });
