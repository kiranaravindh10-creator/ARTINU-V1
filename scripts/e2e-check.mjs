/**
 * ARTINU end-to-end regression pass, run against a live API.
 *
 *   npm run dev:server                # or any running instance
 *   node scripts/e2e-check.mjs 4000
 *
 * Point it at a throwaway instance — it registers accounts, publishes
 * photographs and books consultation slots. Against DATA_DRIVER=memory with
 * MEMORY_PERSIST=false none of it survives the process:
 *
 *   cd server && DATA_DRIVER=memory MEMORY_PERSIST=false PORT=4200 \
 *     npx tsx src/index.ts
 *
 * Exits non-zero if any check fails, so it can gate a deploy.
 */
import zlib from 'node:zlib';

const BASE = `http://localhost:${process.argv[2] ?? 4200}/api`;
const results = [];
const stamp = Date.now();

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(path, options = {}) {
  const res = await fetch(BASE + path, options);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const json = (body, token) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

// A real PNG, large enough to clear the print-resolution gate.
function png(w, h, seed = 0) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 3;
      raw[p] = (x * 7 + y * 3 + seed * 37) % 255;
      raw[p + 1] = (y * 255) / h;
      raw[p + 2] = (x * x + y + seed * 91) % 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

console.log('\n── AUTHENTICATION ─────────────────────────────────────────');

const artistEmail = `qa.artist.${stamp}@example.com`;
const reg = await call(
  '/auth/register/artist',
  json({
    fullName: 'QA Artist',
    email: artistEmail,
    // Registration collects a phone number and a date of birth (migration 009).
    phone: '+91 98765 43210',
    dateOfBirth: '1992-07-14',
    password: 'TestPass@2026',
    artistName: 'QA Artist',
    location: 'Bengaluru, India',
    artStyle: 'street',
    acceptTerms: true,
    // Community Guidelines acknowledgement. Required at artist registration
    // since the guidelines became enforceable (warnings, lifecycle sweeps).
    acceptGuidelines: true,
  }),
);
check('Artist registration returns a session', reg.status === 201 && !!reg.body.accessToken, `HTTP ${reg.status}`);
check('Artist role assigned', reg.body?.user?.role === 'artist', reg.body?.user?.role);
check('Photographer code allocated', !!reg.body?.profile?.photographerCode, reg.body?.profile?.photographerCode);
const artistToken = reg.body.accessToken;

const dupe = await call(
  '/auth/register/artist',
  json({
    fullName: 'QA Artist',
    email: artistEmail,
    // Registration collects a phone number and a date of birth (migration 009).
    phone: '+91 98765 43210',
    dateOfBirth: '1992-07-14',
    password: 'TestPass@2026',
    artistName: 'QA Artist',
    location: 'Bengaluru, India',
    artStyle: 'street',
    acceptTerms: true,
    // Community Guidelines acknowledgement. Required at artist registration
    // since the guidelines became enforceable (warnings, lifecycle sweeps).
    acceptGuidelines: true,
  }),
);
check('Duplicate email rejected', dupe.status >= 400 && dupe.status < 500, `HTTP ${dupe.status}`);

const artFile = await call(
  '/auth/sign-up',
  json({
    fullName: 'QA Visitor',
    email: `qa.visitor.${stamp}@example.com`,
    phone: '+91 90000 12345',
    dateOfBirth: '1990-01-30',
    password: 'TestPass@2026',
    confirmPassword: 'TestPass@2026',
    role: 'space_owner',
    acceptTerms: true,
  }),
);
check('Art File / visitor registration works', artFile.status === 201 && !!artFile.body.accessToken, `HTTP ${artFile.status}`);

const badLogin = await call('/auth/sign-in', json({ email: artistEmail, password: 'WrongPass@2026' }));
check('Invalid credentials rejected', badLogin.status === 401, `HTTP ${badLogin.status}`);

const login = await call('/auth/sign-in', json({ email: artistEmail, password: 'TestPass@2026' }));
check('Sign in works', login.status === 200 && !!login.body.accessToken, `HTTP ${login.status}`);

const session = await call('/auth/session', { headers: { Authorization: `Bearer ${artistToken}` } });
check('Session persists and role survives', session.status === 200 && session.body?.user?.role === 'artist');

const noAuth = await call('/auth/session');
check('Unauthenticated session refused', noAuth.status === 401, `HTTP ${noAuth.status}`);

console.log('\n── UPLOAD PIPELINE ────────────────────────────────────────');

const blank = await call(
  '/artworks',
  json(
    {
      title: 'QA Blank',
      category: 'street',
      mood: [],
      colors: [],
      tags: [],
      location: 'Bengaluru',
      imageBase64: '',
    },
    artistToken,
  ),
);
check('Blank image rejected', blank.status >= 400, `HTTP ${blank.status}`);

// Any size, any resolution: a 64x64 thumbnail must publish like anything else.
const tiny = await call(
  '/artworks',
  json(
    {
      title: 'QA Tiny 64px',
      category: 'street',
      mood: [],
      colors: [],
      tags: [],
      location: 'Bengaluru',
      imageBase64: `data:image/png;base64,${png(64, 64).toString('base64')}`,
    },
    artistToken,
  ),
);
check('Tiny 64x64 image publishes', tiny.status === 201, `HTTP ${tiny.status}`);
check('Tiny image records its real dimensions', tiny.body?.width === 64 && tiny.body?.height === 64, `${tiny.body?.width}x${tiny.body?.height}`);

const oddRatio = await call(
  '/artworks',
  json(
    {
      title: 'QA Panorama',
      category: 'street',
      mood: [],
      colors: [],
      tags: [],
      location: 'Bengaluru',
      imageBase64: `data:image/png;base64,${png(2400, 200, 5).toString('base64')}`,
    },
    artistToken,
  ),
);
check('Extreme 12:1 panorama publishes', oddRatio.status === 201, `HTTP ${oddRatio.status}`);

const notAnImage = await call(
  '/artworks',
  json(
    {
      title: 'QA Corrupt',
      category: 'street',
      mood: [],
      colors: [],
      tags: [],
      location: 'Bengaluru',
      imageBase64: `data:image/png;base64,${Buffer.from('this is not a png at all, not even close').toString('base64')}`,
    },
    artistToken,
  ),
);
check('Corrupt / non-image rejected', notAnImage.status >= 400, `HTTP ${notAnImage.status}`);

const upload = await call(
  '/artworks',
  json(
    {
      title: 'QA Published Photo',
      description: 'regression run',
      category: 'street',
      mood: ['serene'],
      colors: [],
      tags: ['qa'],
      location: 'Bengaluru',
      imageBase64: `data:image/png;base64,${png(3000, 2000, 3).toString('base64')}`,
      fileName: 'qa.png',
    },
    artistToken,
  ),
);
check('Valid upload publishes', upload.status === 201, `HTTP ${upload.status}`);
check('Photo ID allocated', !!upload.body?.photoId, upload.body?.photoId);
check('Validation pipeline ran', Array.isArray(upload.body?.validation) && upload.body.validation.length > 0, `${upload.body?.validation?.length} checks`);
check(
  'Appears under Uploaded Works (no manual review gate)',
  upload.body?.status === 'approved',
  upload.body?.status,
);

const mine = await call('/artworks/mine', { headers: { Authorization: `Bearer ${artistToken}` } });
const mineItems = mine.body?.items ?? mine.body;
check('Uploaded work listed for the artist', Array.isArray(mineItems) && mineItems.length >= 1, `${mineItems?.length} items`);

console.log('\n── CONSULTATION BOOKING ───────────────────────────────────');

// A fresh weekday each run, so a re-run does not collide with its own
// bookings from last time (the slot really is taken — that is the feature).
function weekdayOffset(n) {
  const d = new Date('2026-10-13T00:00:00');
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++;
  }
  return d.toISOString().slice(0, 10);
}
// Random, not derived from the clock: two runs a round number of milliseconds
// apart landed on the same day and the second one collided with the first
// run's bookings, which reads as a failure but is the slot lock working.
const dayOffset = 1 + Math.floor(Math.random() * 600);
const day = weekdayOffset(dayOffset);
const slots = await call(`/consultations/slots?date=${day}`);
check('Slot availability endpoint works', slots.status === 200 && Array.isArray(slots.body.slots));

const sunday = await call('/consultations/slots?date=2026-10-11');
check('Sunday is closed', sunday.body?.slots?.every((s) => !s.available) === true);

const booking = (i, date, slot) =>
  json({
    name: `QA ${i}`,
    email: `qa.book.${stamp}.${i}@example.com`,
    phone: '9876543210',
    spaceType: 'cafe',
    location: 'Bengaluru',
    mode: 'video',
    preferredDate: date,
    preferredSlot: slot,
  });

const first = await call('/consultations', booking(1, day, '10:00 AM'));
check('Consultation booking works', first.status === 201, `HTTP ${first.status}`);

const second = await call('/consultations', booking(2, day, '10:00 AM'));
check('Same slot refused afterwards', second.status === 409, `HTTP ${second.status}`);

const after = await call(`/consultations/slots?date=${day}`);
check(
  'Booked slot shows unavailable globally',
  after.body.slots.find((s) => s.time === '10:00 AM')?.available === false,
);

const concurrent = await Promise.all(
  [...Array(6)].map((_, i) => call('/consultations', booking(100 + i, day, '3:00 PM'))),
);
const created = concurrent.filter((r) => r.status === 201).length;
const fivexx = concurrent.filter((r) => r.status >= 500).length;
check('Concurrent bookings produce exactly one winner', created === 1, `${created} created`);
check('No 5xx during contention', fivexx === 0, `${fivexx} server errors`);

const badSlot = await call('/consultations', booking(9, day, '9:99 ZZ'));
check('Unknown slot rejected', badSlot.status === 409, `HTTP ${badSlot.status}`);

// Cancelling has to give the time back, or the calendar bleeds slots.
const ceoEarly = await call('/auth/sign-in', json({ email: 'ceo@artinu.in', password: 'ARTINU@CEO2026' }));
const cancelDay = weekdayOffset(dayOffset + 700);
const toCancel = await call('/consultations', booking(200, cancelDay, '12:00 PM'));
await call(`/admin/consultations/${toCancel.body.id}`, json({ status: 'cancelled' }, ceoEarly.body.accessToken));
const reopened = await call(`/consultations/slots?date=${cancelDay}`);
check(
  'Cancelling reopens the slot',
  reopened.body.slots.find((s) => s.time === '12:00 PM')?.available === true,
);
const rebook = await call('/consultations', booking(201, cancelDay, '12:00 PM'));
check('A reopened slot can be rebooked', rebook.status === 201, `HTTP ${rebook.status}`);

console.log('\n── GALLERY ────────────────────────────────────────────────');

const p1 = await call('/artworks?page=1&pageSize=10');
const p2 = await call('/artworks?page=2&pageSize=10');
check('Gallery paginates', p1.body.items.length === 10 && p2.body.items.length > 0);
check('Pagination metadata present', typeof p1.body.totalPages === 'number' && p1.body.totalPages > 1, `${p1.body.total} artworks, ${p1.body.totalPages} pages`);
const overlap = p1.body.items.filter((a) => p2.body.items.some((b) => b.id === a.id));
check('No duplicates across pages', overlap.length === 0, `${overlap.length} overlapping`);
check('Page size is honoured (no full-catalogue fetch)', p1.body.items.length === 10);

const beyond = await call('/artworks?page=9999&pageSize=10');
check('Out-of-range page handled', beyond.status === 200, `HTTP ${beyond.status}`);

console.log('\n── ARTISTS & FOLLOW ───────────────────────────────────────');

const artists = await call('/users/artists?page=1&pageSize=5');
check('Artist directory works', artists.status === 200 && artists.body.items.length > 0);

const featured = await call('/users/artists?featured=true&pageSize=5');
check('Featured artists endpoint works', featured.status === 200, `${featured.body?.items?.length} featured`);

const target = artists.body.items[0];
const followNoAuth = await call('/users/follow', json({ targetId: target.id }));
check('Follow requires authentication', followNoAuth.status === 401, `HTTP ${followNoAuth.status}`);

const visitorToken = artFile.body.accessToken;
const before = target.followers ?? 0;

const follow = await call('/users/follow', json({ targetId: target.id }, visitorToken));
check('Authenticated follow works', follow.status === 200, `HTTP ${follow.status}`);
check(
  'Follower count is real and moved by one',
  follow.body?.followers === before + 1,
  `${before} → ${follow.body?.followers}`,
);

// Pressing follow twice must not count twice — the same button toggles.
const unfollow = await call('/users/follow', json({ targetId: target.id }, visitorToken));
check(
  'Pressing it again unfollows rather than double-counting',
  unfollow.body?.followers === before && unfollow.body?.following === false,
  `${unfollow.body?.followers}, following=${unfollow.body?.following}`,
);

const listed = await call('/users/artists?pageSize=50');
const listedTarget = listed.body.items.find((a) => a.id === target.id);
check(
  'Directory total agrees with the follow rows',
  listedTarget?.followers === before,
  `${listedTarget?.followers}`,
);

const selfFollow = await call('/users/follow', json({ targetId: artFile.body.user.id }, visitorToken));
check('Cannot follow yourself', selfFollow.status === 422, `HTTP ${selfFollow.status}`);

console.log('\n── AUTHORISATION ──────────────────────────────────────────');

const ceo = await call('/auth/sign-in', json({ email: 'ceo@artinu.in', password: 'ARTINU@CEO2026' }));
const ceoToken = ceo.body.accessToken;
check('Internal sign-in works', ceo.status === 200 && !!ceoToken);

const escalate = await call('/ops/employees', { headers: { Authorization: `Bearer ${artistToken}` } });
check('Artist cannot reach staff endpoints', escalate.status === 403 || escalate.status === 401, `HTTP ${escalate.status}`);

const staffOk = await call('/ops/employees', { headers: { Authorization: `Bearer ${ceoToken}` } });
check('Staff can reach staff endpoints', staffOk.status === 200, `HTTP ${staffOk.status}`);

const anonAdmin = await call('/admin/analytics');
check('Anonymous cannot reach admin', anonAdmin.status === 401 || anonAdmin.status === 403, `HTTP ${anonAdmin.status}`);

console.log('\n── DASHBOARDS (real data, not mock) ───────────────────────');

const health = await call('/ops/system/health', { headers: { Authorization: `Bearer ${ceoToken}` } });
check('IT system health reports live figures', health.status === 200 && typeof health.body.uptimeSeconds === 'number');
check('Mail quota tracked against the 3,000/month cap', health.body?.mail?.limit === 3000, `used ${health.body?.mail?.used}/${health.body?.mail?.limit}`);

const frames = await call('/ops/frames/summary', { headers: { Authorization: `Bearer ${ceoToken}` } });
check('Frame inventory summary works', frames.status === 200 && typeof frames.body.available === 'number');

const analytics = await call('/admin/analytics', { headers: { Authorization: `Bearer ${ceoToken}` } });
check('Manager analytics served', analytics.status === 200, `HTTP ${analytics.status}`);

console.log('\n── CONTENT (single source of truth) ───────────────────────');

const cafes = await call('/content-manager/cafes/active');
check('Collaborations come from the database', cafes.status === 200 && Array.isArray(cafes.body), `${cafes.body?.length} active`);

const hero = await call('/content-manager/hero-slides/active');
check('Hero slides endpoint works', hero.status === 200 && Array.isArray(hero.body));
check(
  'Hero slides carry a resolved photographer name field',
  hero.body.length === 0 || 'photographerName' in hero.body[0],
  hero.body.length ? String(hero.body[0].photographerName) : 'no slides',
);

console.log('\n───────────────────────────────────────────────────────────');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach((f) => console.log(`  · ${f.name} — ${f.detail}`));
  process.exitCode = 1;
}
