/**
 * Photograph details: who may change them, what may be said, the camera's date
 * as a suggestion, and whether a change reaches the public pages.
 *
 *   cd server && DATA_DRIVER=memory MEMORY_PERSIST=false READ_ONLY_MODE=false \
 *     STORAGE_DRIVER=local MAIL_PROVIDER=console PORT=4200 npx tsx src/index.ts
 *   node scripts/metadata-check.mjs 4200
 *
 * Validation refusals are 422 with a message, as everywhere in the API.
 *
 * Point it at a THROWAWAY instance: it registers artists and publishes
 * photographs. It refuses to run against anything that is not the in-memory
 * store. Exits non-zero if any check fails.
 */
import sharp from 'sharp';

const BASE = `http://localhost:${process.argv[2] ?? 4200}/api`;
const results = [];
const stamp = Date.now();

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

const health = await call('/health');
if (health.body?.drivers?.data !== 'memory') {
  console.error(`Refusing to run: the API reports data driver "${health.body?.drivers?.data}". Use an in-memory instance.`);
  process.exit(2);
}

// ── A JPEG with exactly the EXIF a phone writes ──────────────────────────────

/** A little-endian TIFF block: IFD0 -> EXIF directory holding ASCII tags. */
function exifBlock(tags) {
  const entries = Object.entries(tags).map(([tag, value]) => [Number(tag), Buffer.from(`${value}\0`, 'latin1')]);
  const exifStart = 8 + 2 + 12 + 4;
  const dataStart = exifStart + 2 + entries.length * 12 + 4;
  const out = Buffer.alloc(dataStart + entries.reduce((sum, [, bytes]) => sum + bytes.length, 0));
  out.write('II', 0, 'latin1');
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(8, 4);
  out.writeUInt16LE(1, 8);
  out.writeUInt16LE(0x8769, 10);
  out.writeUInt16LE(4, 12);
  out.writeUInt32LE(1, 14);
  out.writeUInt32LE(exifStart, 18);
  out.writeUInt16LE(entries.length, exifStart);
  let at = exifStart + 2;
  let data = dataStart;
  for (const [tag, bytes] of entries.sort((a, b) => a[0] - b[0])) {
    out.writeUInt16LE(tag, at);
    out.writeUInt16LE(2, at + 2);
    out.writeUInt32LE(bytes.length, at + 4);
    out.writeUInt32LE(data, at + 8);
    bytes.copy(out, data);
    data += bytes.length;
    at += 12;
  }
  return out;
}

async function jpeg(tags) {
  const plain = await sharp({ create: { width: 160, height: 120, channels: 3, background: '#335577' } }).jpeg().toBuffer();
  if (!tags) return plain;
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exifBlock(tags)]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([plain.subarray(0, 2), head, payload, plain.subarray(2)]);
}

const dataUrl = (buffer, type = 'image/jpeg') => `data:${type};base64,${buffer.toString('base64')}`;
const STORY = 'Taken on the walk home, when the market lights came on.';

// Unique per run: two artists with one display name share a public slug, and
// the profile URL then opens whichever was registered first.
async function registerArtist(label, artistName = `QA ${label} ${stamp}`) {
  const email = `qa.meta.${label.toLowerCase()}.${stamp}@example.com`;
  const res = await call('/auth/register/artist', {
    method: 'POST',
    body: {
      fullName: `QA ${label}`,
      email,
      phone: '+91 98765 43210',
      dateOfBirth: '1992-07-14',
      password: 'TestPass@2026',
      artistName,
      location: 'Bengaluru, India',
      artStyle: 'street',
      acceptTerms: true,
      acceptGuidelines: true,
    },
  });
  return { token: res.body?.accessToken, id: res.body?.user?.id, status: res.status };
}

async function upload(token, title, image) {
  return call('/artworks', {
    method: 'POST',
    token,
    body: { title, story: STORY, category: 'street', mood: [], colors: [], tags: [], location: 'Pune, India', imageBase64: image },
  });
}

console.log('\n── Setup ───────────────────────────────────────────────────');
const owner = await registerArtist('Owner');
const other = await registerArtist('Other');
check('Two artists registered', owner.status === 201 && other.status === 201, `${owner.status}/${other.status}`);
const withExif = await upload(owner.token, 'QA Night Market', dataUrl(await jpeg({ 0x9003: '2024:03:09 23:45:10', 0x9004: '2024:03:09 23:45:10', 0x9011: '-08:00' })));
const withoutExif = await upload(owner.token, 'QA No Exif', dataUrl(await jpeg(null)));
const pngUpload = await upload(owner.token, 'QA Png', dataUrl(await sharp({ create: { width: 80, height: 80, channels: 3, background: '#aa3311' } }).png().toBuffer(), 'image/png'));
check('Three photographs published', [withExif, withoutExif, pngUpload].every((res) => res.status === 201), [withExif, withoutExif, pngUpload].map((res) => res.status).join('/'));
const photo = withExif.body;

console.log('\n── The camera date is a suggestion ─────────────────────────');
const suggestion = await call(`/artworks/${photo.id}/capture-date`, { token: owner.token });
check('The owner gets the camera date from the original file', suggestion.status === 200 && suggestion.body.status === 'found' && suggestion.body.date === '2024-03-09', JSON.stringify(suggestion.body).slice(0, 160));
check('...on its own day, though 23:45 at -08:00 is already the 10th in UTC', suggestion.body.date === '2024-03-09' && suggestion.body.offset === '-08:00');
check('...and asking for it stores nothing', (await call(`/artworks/${photo.id}`)).body.capturedAt == null);
const noDate = await call(`/artworks/${withoutExif.body.id}/capture-date`, { token: owner.token });
check('No EXIF: no suggestion, and the reason', noDate.body.status === 'missing' && noDate.body.date === null && /does not record/.test(noDate.body.message), noDate.body.message);
const fromPng = await call(`/artworks/${pngUpload.body.id}/capture-date`, { token: owner.token });
check('A PNG: no suggestion, and why', fromPng.body.status === 'missing' && /not a JPEG/.test(fromPng.body.message), fromPng.body.message);
check("Another artist cannot read it", (await call(`/artworks/${photo.id}/capture-date`, { token: other.token })).status === 403);
check('Nor can a visitor', (await call(`/artworks/${photo.id}/capture-date`)).status === 401);
check('An unknown photograph is a 404', (await call('/artworks/00000000-0000-0000-0000-000000000000/capture-date', { token: owner.token })).status === 404);

console.log('\n── Who may edit, and what ──────────────────────────────────');
// The state a photograph carried over from an application arrives in.
const carried = await call(`/artworks/${photo.id}`, { method: 'PATCH', token: owner.token, body: { title: 'Untitled 1', story: '' } });
check('A placeholder title and an empty story can be saved (that is how carried-over work looks)', carried.status === 200 && carried.body.title === 'Untitled 1', `HTTP ${carried.status}`);
const stolen = await call(`/artworks/${photo.id}`, { method: 'PATCH', token: other.token, body: { title: 'Mine now' } });
check('Another artist cannot edit it', stolen.status === 403, `HTTP ${stolen.status}`);
check('A visitor cannot edit it', (await call(`/artworks/${photo.id}`, { method: 'PATCH', body: { title: 'Anon' } })).status === 401);
const refused = [
  [{ capturedAt: '2024-02-30' }, 'a day that does not exist'],
  [{ capturedAt: '2099-01-01' }, 'a future day'],
  [{ capturedAt: '09/03/2024' }, 'another date format'],
  [{ story: 'Nice light' }, 'a story under 20 characters'],
  [{ category: 'sunsets' }, 'a category that does not exist'],
  [{ photoId: 'QAX999' }, 'the Photo ID'],
  [{ imageUrl: 'https://example.com/other.jpg' }, 'the image itself'],
  [{ artistId: other.id }, 'the owner'],
  [{}, 'nothing at all'],
];
for (const [body, what] of refused) {
  const res = await call(`/artworks/${photo.id}`, { method: 'PATCH', token: owner.token, body });
  check(`Refused with a reason: ${what}`, res.status === 422 && typeof res.body?.message === 'string', `HTTP ${res.status} ${res.body?.message ?? ''}`.slice(0, 120));
}
const untouched = (await call(`/artworks/${photo.id}`)).body;
check('...and none of them changed anything', untouched.title === 'Untitled 1' && untouched.capturedAt == null && untouched.artistId === owner.id && untouched.photoId === photo.photoId);

console.log('\n── Completing it ───────────────────────────────────────────');
const completed = await call(`/artworks/${photo.id}`, {
  method: 'PATCH',
  token: owner.token,
  body: { title: '  Night market, Pune  ', story: STORY, category: 'lifestyle', capturedAt: suggestion.body.date, location: 'Pune, India' },
});
check('The owner saves title, story, category and the confirmed date', completed.status === 200, `HTTP ${completed.status} ${completed.body?.message ?? ''}`);
check('The date is stored as midnight UTC of that day', completed.body?.capturedAt === '2024-03-09T00:00:00.000Z', completed.body?.capturedAt);
const publicPage = (await call(`/artworks/${photo.id}`)).body;
check('The public photograph shows the new title (trimmed)', publicPage.title === 'Night market, Pune', publicPage.title);
check('...the story', publicPage.story === STORY);
check('...the corrected category', publicPage.category === 'lifestyle', publicPage.category);
check('...the confirmed date', String(publicPage.capturedAt).startsWith('2024-03-09'), publicPage.capturedAt);
check('...the same Photo ID, owner and files', publicPage.photoId === photo.photoId && publicPage.artistId === owner.id && publicPage.originalUrl === photo.originalUrl && publicPage.imageUrl === photo.imageUrl);
const slug = publicPage.artist?.slug;
const profileWorks = (await call(`/users/artists/${slug}/artworks?pageSize=50`)).body.items ?? [];
check('The artist profile lists it under the new title', profileWorks.some((art) => art.id === photo.id && art.title === 'Night market, Pune'), `${profileWorks.length} works`);
const gallery = (await call('/artworks?sort=latest&pageSize=60')).body.items ?? [];
check('So does the gallery', gallery.some((art) => art.id === photo.id && art.title === 'Night market, Pune'));
const cleared = await call(`/artworks/${photo.id}`, { method: 'PATCH', token: owner.token, body: { capturedAt: null } });
check('The date can be cleared again', cleared.status === 200 && (await call(`/artworks/${photo.id}`)).body.capturedAt == null);

console.log('\n── Names ───────────────────────────────────────────────────');
const spaced = await registerArtist('Spaced', '  Meera  Nair  ');
const spacedMe = (await call('/auth/session', { token: spaced.token })).body;
const storedName = spacedMe?.profile?.displayName ?? spacedMe?.profile?.fullName ?? '';
check('A name is saved without the spaces around it', spaced.status === 201 && storedName === storedName.trim(), JSON.stringify(storedName));
await upload(spaced.token, 'QA Spaced', dataUrl(await jpeg(null)));
const artists = (await call('/users/artists?pageSize=60')).body.items ?? [];
check('No public artist name starts or ends with a space', artists.length > 0 && artists.every((artist) => artist.name === artist.name.trim()), `${artists.length} artists`);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
