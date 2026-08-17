import {
  artworkImage,
  artworkThumb,
  calculatePricing,
  DEFAULT_FRAME,
  GALLERY_CATEGORIES,
  MOODS,
  priceLine,
  PRICING,
  seededPhoto,
  startingPrice,
  VALIDATION_CHECKS,
  type Artwork,
  type ArtworkStatus,
  type ArtworkValidationResult,
  type FrameConfiguration,
  type GalleryCategory,
  type Installation,
  type Invoice,
  type Notification,
  type Order,
  type OrderItem,
  type Orientation,
  type Payment,
  type Payout,
  type Profile,
  type RotationCycle,
  type Space,
  type SpaceType,
} from '@artinu/shared';
import bcrypt from 'bcryptjs';
import { env } from '@/config/env';
import { clearPersistedStore, db, type StoredUser } from '@/database/db';
import { photographerCodeFromName } from '@/services/photo-id.service';
import {
  daysFromNow,
  invoiceNumber,
  monthsFromNow,
  orderReference,
  paymentReference,
  uuid,
} from '@/utils/ids';
import { logger } from '@/utils/logger';

/**
 * The demo dataset.
 *
 * Everything here is deterministic: a small seeded PRNG stands in for
 * Math.random so the same photographs, prices and rankings appear on every
 * restart. Dashboards are only convincing when the numbers hang together, so
 * orders are priced with the real pricing engine and payouts, earnings and
 * "top artist" rankings are all derived from those orders rather than invented.
 */

// ── Deterministic randomness ─────────────────────────────────────────────────

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    // xorshift32 — small, fast, and stable across Node versions.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

const random = makeRandom(20260805);

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

const pickMany = <T>(items: readonly T[], count: number): T[] => {
  const pool = [...items];
  const chosen: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
  }
  return chosen;
};

const between = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;

/** ISO timestamp N days in the past. */
const daysAgo = (days: number) => daysFromNow(-days);

const password = (plain: string) => bcrypt.hashSync(plain, 10);

/** Accounts with a fixed password rather than the seed default. */
const FIXED_ARTIST_PASSWORDS: Record<string, string> = {
  'photographer.demo@artinu.in': 'ARTINU@Photo2026',
  // Real inboxes, for verifying live SMTP end to end.
  'vibhukrishnas7@gmail.com': 'ARTINU@Artist2026',
};

// ── People ───────────────────────────────────────────────────────────────────

interface ArtistSeed {
  email: string;
  name: string;
  city: string;
  country: string;
  genres: string[];
  bio: string;
  featured?: boolean;
}

const STAFF: { email: string; plain: string; role: StoredUser['role']; name: string }[] = [
  { email: 'ceo@artinu.in', plain: 'ARTINU@CEO2026', role: 'ceo', name: 'Ananya Rao' },
  { email: 'manager@artinu.in', plain: 'ARTINU@Mgr2026', role: 'manager', name: 'Vikram Sheth' },
  { email: 'accounts@artinu.in', plain: 'ARTINU@Acc2026', role: 'accounts', name: 'Priya Nair' },
  { email: 'it@artinu.in', plain: 'ARTINU@IT2026', role: 'it_team', name: 'Nikhil Menon' },
  { email: 'fieldops@artinu.in', plain: 'ARTINU@Ops2026', role: 'operations', name: 'Rahul Deshpande' },
];

const ARTISTS: ArtistSeed[] = [
  {
    // Real inbox, used for end-to-end SMTP testing.
    email: 'vibhukrishnas7@gmail.com',
    name: 'Vibhu Krishna',
    city: 'Bengaluru',
    country: 'India',
    genres: ['street', 'documentary'],
    bio: 'Vibhu photographs the ordinary hours of Indian cities — the walk to work, the last chai of the evening. His work is unhurried and completely unstaged.',
    featured: true,
  },
  {
    email: 'photographer.demo@artinu.in',
    name: 'Arjun Menon',
    city: 'Mumbai',
    country: 'India',
    genres: ['architecture', 'fine_art'],
    bio: 'Arjun is an architectural and fine art photographer who finds beauty in light, lines, and human stories. His work explores the relationship between spaces and emotions.',
    featured: true,
  },
  {
    email: 'meera.iyer@artinu.in',
    name: 'Meera Iyer',
    city: 'Chennai',
    country: 'India',
    genres: ['portrait', 'documentary'],
    bio: 'Meera photographs people the way she listens to them — patiently, and without interrupting. Her portrait work has followed weavers, fisherfolk and classical dancers across Tamil Nadu.',
    featured: true,
  },
  {
    email: 'karan.kulkarni@artinu.in',
    name: 'Karan Kulkarni',
    city: 'Pune',
    country: 'India',
    genres: ['landscape', 'travel'],
    bio: 'Karan spends most of the monsoon on the Western Ghats, waiting for the fog to do something interesting. He has been photographing the same three valleys for eleven years.',
    featured: true,
  },
  {
    email: 'rohit.verma@artinu.in',
    name: 'Rohit Verma',
    city: 'Delhi',
    country: 'India',
    genres: ['street', 'documentary'],
    bio: 'Rohit works almost entirely at first light, when Delhi belongs to tea sellers and pigeons. His street work is quiet, unhurried and completely unstaged.',
    featured: true,
  },
  {
    email: 'sneha.prabhu@artinu.in',
    name: 'Sneha Prabhu',
    city: 'Coorg',
    country: 'India',
    genres: ['landscape', 'wildlife'],
    bio: 'Sneha grew up on a coffee estate and photographs the plantation belt through the seasons. Her landscapes carry the particular green that only happens after rain.',
    featured: true,
  },
  {
    email: 'devika.rao@artinu.in',
    name: 'Devika Rao',
    city: 'Bengaluru',
    country: 'India',
    genres: ['abstract', 'minimal'],
    bio: 'Devika reduces the city to shape and shadow. She shoots on long lenses from rooftops, looking for the moment a building stops being a building.',
  },
  {
    email: 'imran.sheikh@artinu.in',
    name: 'Imran Sheikh',
    city: 'Hyderabad',
    country: 'India',
    genres: ['architecture', 'street'],
    bio: 'Imran documents the old city — its stairwells, doorways and the light that gets in sideways. He works exclusively in black and white.',
  },
  {
    email: 'tara.dsouza@artinu.in',
    name: 'Tara D’Souza',
    city: 'Goa',
    country: 'India',
    genres: ['travel', 'lifestyle'],
    bio: 'Tara photographs coastlines and the people who live off them. Her work is warm, slightly overexposed, and entirely unbothered by trends.',
  },
  {
    email: 'aditya.bose@artinu.in',
    name: 'Aditya Bose',
    city: 'Kolkata',
    country: 'India',
    genres: ['documentary', 'portrait'],
    bio: 'Aditya has photographed the same Kumartuli idol-makers every autumn since 2014. He believes the best photographs come from returning, not arriving.',
  },
  {
    email: 'nisha.gupta@artinu.in',
    name: 'Nisha Gupta',
    city: 'Jaipur',
    country: 'India',
    genres: ['architecture', 'fine_art'],
    bio: 'Nisha photographs courtyards, jaalis and the geometry of Rajasthani light. Her prints are unusually still — she waits for rooms to empty.',
  },
  {
    email: 'kabir.singh@artinu.in',
    name: 'Kabir Singh',
    city: 'Chandigarh',
    country: 'India',
    genres: ['minimal', 'architecture'],
    bio: 'Kabir works within Corbusier’s grid, finding softness in concrete. His minimal compositions suit rooms that already have enough going on.',
  },
  {
    email: 'lena.fischer@artinu.in',
    name: 'Lena Fischer',
    city: 'Berlin',
    country: 'Germany',
    genres: ['street', 'abstract'],
    bio: 'Lena photographs European cities at the hour when the offices empty. Her work is cool-toned, precise and quietly funny.',
  },
  {
    email: 'marco.rossi@artinu.in',
    name: 'Marco Rossi',
    city: 'Milan',
    country: 'Italy',
    genres: ['fine_art', 'portrait'],
    bio: 'Marco trained as a painter and never quite stopped. His photographs are lit like still lifes and printed warm.',
  },
  {
    email: 'yuki.tanaka@artinu.in',
    name: 'Yuki Tanaka',
    city: 'Kyoto',
    country: 'Japan',
    genres: ['minimal', 'landscape'],
    bio: 'Yuki photographs weather. Mist, snow, the specific grey of a Kyoto afternoon — her frames are mostly empty, on purpose.',
  },
  {
    email: 'sara.ahmed@artinu.in',
    name: 'Sara Ahmed',
    city: 'Dubai',
    country: 'UAE',
    genres: ['architecture', 'abstract'],
    bio: 'Sara shoots glass, steel and the desert light that bounces off them. Her work is graphic and reads well from across a room.',
  },
  {
    email: 'elias.moore@artinu.in',
    name: 'Elias Moore',
    city: 'Lisbon',
    country: 'Portugal',
    genres: ['travel', 'street'],
    bio: 'Elias walks. Everything in his portfolio is within four kilometres of his apartment, photographed over six years.',
  },
];

interface OwnerSeed {
  email: string;
  plain: string;
  name: string;
  spaces: {
    name: string;
    type: SpaceType;
    city: string;
    theme: string;
    cuisine?: string;
    wallColor: string;
    lighting: string;
    rotation: number;
    walls: number;
    verified?: boolean;
  }[];
}

const OWNERS: OwnerSeed[] = [
  {
    // Real inbox, used for end-to-end SMTP testing.
    email: '1853552.vibhukrishnas@gmail.com',
    plain: 'ARTINU@Space2026',
    name: 'Vibhu Krishna',
    spaces: [
      {
        name: 'The Test Kitchen — Bengaluru',
        type: 'restaurant',
        city: 'Bengaluru',
        theme: 'Warm modern bistro, exposed brick and brass',
        cuisine: 'Modern Indian',
        wallColor: 'Warm white',
        lighting: 'Large west-facing windows, warm pendants after dark',
        rotation: 3,
        walls: 5,
        verified: true,
      },
    ],
  },
  {
    email: 'restaurant.demo@artinu.in',
    plain: 'ARTINU@Rest2026',
    name: 'Ishaan Kapoor',
    spaces: [
      {
        name: 'Toast & Tonic — Bengaluru',
        type: 'restaurant',
        city: 'Bengaluru',
        theme: 'Industrial minimal with reclaimed wood',
        cuisine: 'Modern European',
        wallColor: 'Warm white',
        lighting: 'Large north-facing windows, warm pendants after dark',
        rotation: 3,
        walls: 4,
        verified: true,
      },
      {
        name: 'Toast & Tonic — Indiranagar',
        type: 'cafe',
        city: 'Bengaluru',
        theme: 'Bright and plant-filled',
        cuisine: 'Speciality coffee',
        wallColor: 'Off white',
        lighting: 'Bright daylight through a glass frontage',
        rotation: 2,
        walls: 3,
        verified: true,
      },
    ],
  },
  {
    email: 'aditi@fattybao.in',
    plain: 'SpaceOwner1',
    name: 'Aditi Malhotra',
    spaces: [
      {
        name: 'The Fatty Bao',
        type: 'restaurant',
        city: 'Bengaluru',
        theme: 'Moody Asian diner, dark timber',
        cuisine: 'Pan-Asian',
        wallColor: 'Deep charcoal',
        lighting: 'Low, warm, heavily shaded',
        rotation: 3,
        walls: 6,
        verified: true,
      },
    ],
  },
  {
    email: 'rohan@roastery.in',
    plain: 'SpaceOwner1',
    name: 'Rohan Iyer',
    spaces: [
      {
        name: 'Roastery Coffee House',
        type: 'cafe',
        city: 'Hyderabad',
        theme: 'Airy colonial with high ceilings',
        cuisine: 'Coffee and bakes',
        wallColor: 'Cream',
        lighting: 'Tall shuttered windows, very bright',
        rotation: 3,
        walls: 5,
        verified: true,
      },
    ],
  },
  {
    email: 'maya@thelalit.in',
    plain: 'SpaceOwner1',
    name: 'Maya Krishnan',
    spaces: [
      {
        name: 'Lalit Boutique — Lobby',
        type: 'hotel',
        city: 'Delhi',
        theme: 'Contemporary luxury, brass and stone',
        wallColor: 'Warm grey',
        lighting: 'Controlled gallery lighting',
        rotation: 2,
        walls: 8,
        verified: true,
      },
    ],
  },
  {
    email: 'sam@workbay.co',
    plain: 'SpaceOwner1',
    name: 'Samar Qureshi',
    spaces: [
      {
        name: 'Workbay Home Decor — Powai',
        type: 'home_decor',
        city: 'Mumbai',
        theme: 'Clean scandinavian, pale oak',
        wallColor: 'White',
        lighting: 'Even LED, daylight on one side',
        rotation: 1,
        walls: 12,
        verified: true,
      },
      {
        name: 'Workbay Home Decor — Baner',
        type: 'home_decor',
        city: 'Pune',
        theme: 'Concrete and green',
        wallColor: 'Light grey',
        lighting: 'Bright, north facing',
        rotation: 3,
        walls: 9,
      },
    ],
  },
  {
    email: 'neha@quiethours.in',
    plain: 'SpaceOwner1',
    name: 'Neha Bhatt',
    spaces: [
      {
        name: 'Quiet Hours Dental',
        type: 'clinic',
        city: 'Bengaluru',
        theme: 'Calm, clinical, soothing',
        wallColor: 'Pale sage',
        lighting: 'Soft diffused ceiling light',
        rotation: 3,
        walls: 5,
        verified: true,
      },
    ],
  },
  {
    email: 'faisal@northlight.co',
    plain: 'SpaceOwner1',
    name: 'Faisal Khan',
    spaces: [
      {
        name: 'Northlight Studios',
        type: 'office',
        city: 'Mumbai',
        theme: 'Creative agency loft',
        wallColor: 'Exposed brick and white',
        lighting: 'Skylights, very bright at midday',
        rotation: 2,
        walls: 7,
        verified: true,
      },
    ],
  },
  {
    email: 'anita@baga.house',
    plain: 'SpaceOwner1',
    name: 'Anita Fernandes',
    spaces: [
      {
        name: 'Baga House — Dining',
        type: 'restaurant',
        city: 'Goa',
        theme: 'Coastal Portuguese, blue and lime',
        cuisine: 'Goan seafood',
        wallColor: 'Lime white',
        lighting: 'Open sided, sea light all day',
        rotation: 3,
        walls: 6,
        verified: true,
      },
      {
        name: 'Baga House — Terrace Bar',
        type: 'restaurant',
        city: 'Goa',
        theme: 'Sunset terrace',
        cuisine: 'Cocktails and small plates',
        wallColor: 'Terracotta',
        lighting: 'Golden hour, then string lights',
        rotation: 2,
        walls: 4,
      },
    ],
  },
];

// ── Artwork vocabulary ───────────────────────────────────────────────────────

const TITLE_HEADS = [
  'Geometry of',
  'Study in',
  'Notes on',
  'First',
  'Last',
  'After the',
  'Before the',
  'Portrait of',
  'The Weight of',
  'Field of',
  'Harbour at',
  'Monsoon',
  'Winter',
  'A Quiet',
  'Two Minutes of',
  'Return to',
];

const TITLE_TAILS = [
  'Light',
  'Silence',
  'Rain',
  'Morning',
  'Distance',
  'Stone',
  'Water',
  'Shadow',
  'Concrete',
  'Green',
  'Dust',
  'Fog',
  'Salt',
  'Glass',
  'Passage',
  'Nightfall',
  'the Platform',
  'the Estuary',
];

const LOCATIONS = [
  'Mumbai, India',
  'Chennai, India',
  'Pune, India',
  'Delhi, India',
  'Coorg, India',
  'Bengaluru, India',
  'Hyderabad, India',
  'Goa, India',
  'Kolkata, India',
  'Jaipur, India',
  'Berlin, Germany',
  'Milan, Italy',
  'Kyoto, Japan',
  'Dubai, UAE',
  'Lisbon, Portugal',
];

const DESCRIPTIONS = [
  'A play of light and shadow on architectural curves. Perfect for modern and minimal spaces.',
  'Shot handheld at first light, before the street filled up.',
  'The last of the monsoon cloud sitting in the valley at dawn.',
  'A single figure, held still against a much larger structure.',
  'Reflected light doing most of the work, as it usually does.',
  'Taken on the third morning of waiting for this exact weather.',
  'Colour left almost untouched — the wall was really that shade.',
  'A long exposure that turned a crowd into weather.',
];

const STORIES = [
  'I had walked past this corridor a dozen times before noticing what the afternoon did to it. I came back at the same hour for a week until the light and the emptiness happened together.',
  'This was the end of a long, unproductive day. I had packed the camera away and then the cloud broke, and I unpacked it again in about four seconds.',
  'The people who live here see this every morning and think nothing of it. That gap — between the ordinary and the remarkable — is most of what I photograph.',
  'It rained for six days. On the seventh the fog lifted for maybe ninety seconds, and this is what was underneath it.',
  'I asked permission, then waited twenty minutes for them to forget I was there. The photograph is from the moment they did.',
];

const ORIENTATIONS: Orientation[] = ['landscape', 'portrait', 'square'];

const DIMENSIONS: Record<Orientation, { width: number; height: number }> = {
  landscape: { width: 4200, height: 2800 },
  portrait: { width: 2800, height: 4200 },
  square: { width: 3200, height: 3200 },
};

const DOMINANT_COLORS = ['#141210', '#8A4B23', '#D8BE94', '#B4B0AA', '#3B4B3F', '#2F4A6B'];

const TAGS = [
  'light',
  'shadow',
  'texture',
  'symmetry',
  'monsoon',
  'coastline',
  'urban',
  'quiet',
  'golden hour',
  'long exposure',
  'documentary',
  'monochrome',
];

const CHECK_DETAIL: Record<string, string> = {
  ai_generated: 'Capture metadata is consistent with a physical camera.',
  nsfw: 'No unsafe or abusive content detected in the title, description or tags.',
  quality: 'Resolution and compression are comfortably above print requirements.',
  duplicate: 'No visually or textually similar photograph found in this portfolio.',
  metadata: 'Title, category, tags and location are all present.',
};

const CHECK_FAILURE: Record<string, string> = {
  ai_generated: 'Metadata is missing and the dimensions are suspiciously exact — this may be a generated image.',
  nsfw: 'The description contains language that needs a human review.',
  quality: 'The long edge is below 1200px, which is not enough for an A2 print.',
  duplicate: 'This closely matches another photograph already in your portfolio.',
  metadata: 'Category or location is missing, so this cannot be curated accurately.',
};

const BLOCKING_CHECKS = new Set(['nsfw', 'quality', 'duplicate']);

function buildValidation(failing?: string): ArtworkValidationResult[] {
  return VALIDATION_CHECKS.map((check) => {
    const failed = check === failing;
    return {
      check,
      passed: !failed,
      severity: !failed ? 'pass' : BLOCKING_CHECKS.has(check) ? 'fail' : 'warning',
      detail: failed ? CHECK_FAILURE[check]! : CHECK_DETAIL[check]!,
    } satisfies ArtworkValidationResult;
  });
}

const FRAME_PRESETS: FrameConfiguration[] = [
  DEFAULT_FRAME,
  { size: 'a2_landscape', material: 'aluminium', color: 'black', glass: 'anti_reflective', finish: 'matte' },
  { size: 'portrait_tall', material: 'wood', color: 'walnut', glass: 'matte', finish: 'glossy' },
  { size: 'square_large', material: 'premium_metal', color: 'natural', glass: 'anti_reflective', finish: 'matte' },
  { size: 'a3_classic', material: 'wood', color: 'white', glass: 'normal', finish: 'matte' },
];

// ── Builders ─────────────────────────────────────────────────────────────────

interface Built {
  users: StoredUser[];
  profiles: Profile[];
  spaces: Space[];
  artworks: Artwork[];
  orders: Order[];
  payments: Payment[];
  invoices: Invoice[];
  installations: Installation[];
  rotations: RotationCycle[];
  notifications: Notification[];
  payouts: Payout[];
}

function buildPeople() {
  const users: StoredUser[] = [];
  const profiles: Profile[] = [];

  const makeUser = (
    email: string,
    plain: string,
    role: StoredUser['role'],
    createdDaysAgo: number,
  ): StoredUser => ({
    id: uuid(),
    email,
    role,
    status: 'verified',
    emailVerified: true,
    passwordHash: password(plain),
    createdAt: daysAgo(createdDaysAgo),
    lastLoginAt: daysAgo(between(0, 6)),
  });

  const makeProfile = (userId: string, fields: Partial<Profile> & { fullName: string }): Profile => ({
    id: uuid(),
    userId,
    displayName: null,
    phone: null,
    avatarUrl: null,
    city: null,
    country: 'India',
    bio: null,
    website: null,
    instagram: null,
    genres: [],
    createdAt: daysAgo(between(60, 400)),
    updatedAt: daysAgo(between(0, 30)),
    ...fields,
  });

  for (const [index, member] of STAFF.entries()) {
    const user = makeUser(member.email, member.plain, member.role, 420 - index * 10);
    users.push(user);
    profiles.push(
      makeProfile(user.id, {
        fullName: member.name,
        city: 'Bengaluru',
        phone: `+91 98${between(100, 999)}${between(10000, 99999)}`,
        avatarUrl: seededPhoto(`staff-${index}`, 400, 400),
      }),
    );
  }

  const artistUsers: StoredUser[] = [];
  for (const [index, artist] of ARTISTS.entries()) {
    const plain = FIXED_ARTIST_PASSWORDS[artist.email] ?? 'Artist123';
    const user = makeUser(artist.email, plain, 'artist', 380 - index * 12);
    users.push(user);
    artistUsers.push(user);
    profiles.push(
      makeProfile(user.id, {
        fullName: artist.name,
        displayName: artist.name,
        city: artist.city,
        country: artist.country,
        bio: artist.bio,
        genres: artist.genres,
        photographerCode: photographerCodeFromName(artist.name),
        nextPhotoNumber: 1,
        avatarUrl: seededPhoto(`artist-${index}`, 500, 500),
        website: `https://${artist.name.toLowerCase().replace(/[^a-z]/g, '')}.photo`,
        instagram: `@${artist.name.toLowerCase().replace(/[^a-z]/g, '')}`,
        phone: `+91 97${between(100, 999)}${between(10000, 99999)}`,
      }),
    );
  }

  const ownerUsers: StoredUser[] = [];
  const spaces: Space[] = [];
  for (const [ownerIndex, owner] of OWNERS.entries()) {
    const user = makeUser(owner.email, owner.plain, 'space_owner', 300 - ownerIndex * 15);
    users.push(user);
    ownerUsers.push(user);
    profiles.push(
      makeProfile(user.id, {
        fullName: owner.name,
        city: owner.spaces[0]?.city ?? 'Bengaluru',
        phone: `+91 90${between(100, 999)}${between(10000, 99999)}`,
        avatarUrl: seededPhoto(`owner-${ownerIndex}`, 400, 400),
      }),
    );

    for (const [spaceIndex, space] of owner.spaces.entries()) {
      spaces.push({
        id: uuid(),
        ownerId: user.id,
        name: space.name,
        type: space.type,
        theme: space.theme,
        cuisine: space.cuisine ?? null,
        wallColor: space.wallColor,
        lighting: space.lighting,
        addressLine1: `${between(1, 90)} ${pick(['1st Main', '4th Cross', 'MG Road', 'Hill Road', 'Church Street'])}`,
        addressLine2: pick(['Koramangala', 'Indiranagar', 'Bandra West', 'Banjara Hills', 'Calangute']),
        city: space.city,
        state: pick(['Karnataka', 'Maharashtra', 'Telangana', 'Delhi', 'Goa']),
        pin: String(between(110001, 560103)).slice(0, 6),
        contactName: owner.name,
        contactPhone: `+91 90${between(100, 999)}${between(10000, 99999)}`,
        contactEmail: owner.email,
        wallCount: space.walls,
        imageUrls: [
          seededPhoto(`space-${ownerIndex}-${spaceIndex}-a`, 1400, 900),
          seededPhoto(`space-${ownerIndex}-${spaceIndex}-b`, 1400, 900),
        ],
        rotationIntervalMonths: space.rotation,
        verified: space.verified ?? false,
        createdAt: daysAgo(between(120, 280)),
        updatedAt: daysAgo(between(1, 40)),
      });
    }
  }

  return { users, profiles, artistUsers, ownerUsers, spaces };
}

function buildArtworks(
  artistUsers: StoredUser[],
  profilesByUser: Map<string, Profile>,
): Artwork[] {
  const artworks: Artwork[] = [];
  const total = 140;

  const nextByUser = new Map<string, number>();
  const codeByUser = new Map<string, string>();
  for (const user of artistUsers) {
    const code = profilesByUser.get(user.id)?.photographerCode;
    if (code) codeByUser.set(user.id, code);
  }

  // 118 approved, 14 pending, 5 rejected, 3 draft.
  const statuses: ArtworkStatus[] = [
    ...Array<ArtworkStatus>(118).fill('approved'),
    ...Array<ArtworkStatus>(14).fill('pending_review'),
    ...Array<ArtworkStatus>(5).fill('rejected'),
    ...Array<ArtworkStatus>(3).fill('draft'),
  ];

  const basePrice = startingPrice();

  for (let index = 0; index < total; index += 1) {
    const artist = artistUsers[index % artistUsers.length]!;
    const code = codeByUser.get(artist.id) ?? 'ART';
    const photoNumber = nextByUser.get(artist.id) ?? 1;
    nextByUser.set(artist.id, photoNumber + 1);
    const photoId = `${code}${String(photoNumber).padStart(3, '0')}`;
    const orientation = ORIENTATIONS[index % ORIENTATIONS.length]!;
    const status = statuses[index]!;
    const seed = `art-${index}`;
    const category = GALLERY_CATEGORIES[index % GALLERY_CATEGORIES.length] as GalleryCategory;
    // Only two things belong in the review queue: a blocking failure (rejected)
    // or an advisory a photographer has to judge. A clean run is published, so a
    // "pending" seed row must carry a non-blocking flag or it would sit forever.
    const failing =
      status === 'rejected'
        ? pick(['nsfw', 'quality', 'duplicate'] as const)
        : status === 'pending_review'
          ? pick(['ai_generated', 'metadata'] as const)
          : undefined;
    const createdAt = daysAgo(between(3, 320));

    artworks.push({
      id: uuid(),
      artistId: artist.id,
      title: `${pick(TITLE_HEADS)} ${pick(TITLE_TAILS)}`,
      description: pick(DESCRIPTIONS),
      story: pick(STORIES),
      category,
      mood: pickMany(MOODS, between(1, 3)),
      colors: pickMany(
        ['black', 'sienna', 'sand', 'stone', 'forest', 'indigo', 'multi'] as const,
        between(1, 3),
      ),
      suitableFor: pickMany(
        ['cafe', 'restaurant', 'hotel', 'office', 'home_decor', 'clinic', 'retail'] as const,
        between(2, 5),
      ),
      tags: pickMany(TAGS, between(2, 5)),
      imageUrl: artworkImage(seed, orientation),
      thumbnailUrl: artworkThumb(seed, orientation),
      originalUrl: null,
      orientation,
      width: DIMENSIONS[orientation].width,
      height: DIMENSIONS[orientation].height,
      dominantColor: pick(DOMINANT_COLORS),
      location: pick(LOCATIONS),
      capturedAt: daysAgo(between(30, 900)),
      photoId,
      photoNumber,
      status,
      validation: status === 'draft' ? [] : buildValidation(failing),
      reviewNote:
        status === 'rejected'
          ? `We could not publish this one — ${CHECK_FAILURE[failing!]!.toLowerCase()}`
          : null,
      reviewedBy: status === 'approved' || status === 'rejected' ? 'Curation team' : null,
      reviewedAt: status === 'approved' || status === 'rejected' ? daysAgo(between(1, 300)) : null,
      views: status === 'approved' ? between(40, 9000) : between(0, 60),
      likes: status === 'approved' ? between(5, 2500) : between(0, 20),
      selections: 0,
      priceFrom: basePrice,
      featured: status === 'approved' && index % 11 === 0,
      createdAt,
      updatedAt: createdAt,
    });
  }

  return artworks;
}

interface OrderPlan {
  status: Order['status'];
  monthsAgo: number;
}

function buildCommerce(
  spaces: Space[],
  artworks: Artwork[],
  profilesByUser: Map<string, Profile>,
): Pick<Built, 'orders' | 'payments' | 'invoices' | 'installations' | 'payouts'> {
  const approved = artworks.filter((artwork) => artwork.status === 'approved');

  const plans: OrderPlan[] = [
    ...Array.from({ length: 12 }, (_, i) => ({ status: 'completed' as const, monthsAgo: 1 + (i % 8) })),
    ...Array.from({ length: 4 }, () => ({ status: 'installation_scheduled' as const, monthsAgo: 0 })),
    ...Array.from({ length: 3 }, () => ({ status: 'framing' as const, monthsAgo: 0 })),
    ...Array.from({ length: 2 }, () => ({ status: 'printing' as const, monthsAgo: 0 })),
    ...Array.from({ length: 2 }, () => ({ status: 'confirmed' as const, monthsAgo: 0 })),
    ...Array.from({ length: 2 }, () => ({ status: 'pending_payment' as const, monthsAgo: 0 })),
    { status: 'cancelled' as const, monthsAgo: 2 },
  ];

  const orders: Order[] = [];
  const payments: Payment[] = [];
  const invoices: Invoice[] = [];
  const installations: Installation[] = [];
  const payouts: Payout[] = [];

  const STAGE_SEQUENCE: Order['status'][] = [
    'confirmed',
    'printing',
    'framing',
    'dispatched',
    'out_for_delivery',
    'installation_scheduled',
    'completed',
  ];

  for (const [index, plan] of plans.entries()) {
    const space = spaces[index % spaces.length]!;
    const placedDaysAgo = plan.monthsAgo * 30 + between(1, 25);
    const placedAt = daysAgo(placedDaysAgo);

    const lineCount = between(1, 3);
    const items: OrderItem[] = [];

    for (let line = 0; line < lineCount; line += 1) {
      const artwork = approved[(index * 5 + line * 13) % approved.length]!;
      const frame = FRAME_PRESETS[(index + line) % FRAME_PRESETS.length]!;
      const quantity = line === 0 ? between(2, 4) : between(1, 2);
      const priced = priceLine(frame, quantity);
      const artistProfile = profilesByUser.get(artwork.artistId);

      items.push({
        id: uuid(),
        artworkId: artwork.id,
        quantity,
        frame,
        artworkTitle: artwork.title,
        artworkImageUrl: artwork.thumbnailUrl,
        artistId: artwork.artistId,
        artistName: artistProfile?.fullName ?? 'ARTINU artist',
        unitPrice: priced.unitPrice,
        framePrice: priced.framePrice,
        printPrice: priced.printPrice,
        licensePrice: priced.licensePrice,
        lineTotal: priced.lineTotal,
        artistCommission: priced.artistCommission,
      });

      artwork.selections += quantity;
    }

    const pricing = calculatePricing(
      items.map((item) => ({ frame: item.frame, quantity: item.quantity })),
      { includeSecurityDeposit: index % 4 === 0 },
    );

    const orderId = uuid();
    const reference = orderReference(1000 + index);

    // Build a timeline consistent with where the order actually is.
    const stageIndex = STAGE_SEQUENCE.indexOf(plan.status);
    const timeline: Order['timeline'] = [
      { status: 'pending_payment', at: placedAt, note: 'Order created, awaiting payment.' },
    ];

    if (plan.status === 'cancelled') {
      timeline.push({
        status: 'cancelled',
        at: daysAgo(placedDaysAgo - 1),
        note: 'Cancelled at the customer’s request before printing.',
      });
    } else if (plan.status !== 'pending_payment') {
      const reached = stageIndex >= 0 ? stageIndex : 0;
      for (let stage = 0; stage <= reached; stage += 1) {
        timeline.push({
          status: STAGE_SEQUENCE[stage]!,
          at: daysAgo(Math.max(0, placedDaysAgo - stage * 2 - 1)),
          note: null,
        });
      }
    }

    const paid = plan.status !== 'pending_payment' && plan.status !== 'cancelled';
    const paymentId = uuid();

    payments.push({
      id: paymentId,
      orderId,
      provider: 'mock_qr',
      amount: pricing.total,
      currency: PRICING.CURRENCY,
      status: paid ? 'succeeded' : plan.status === 'cancelled' ? 'expired' : 'awaiting_payment',
      qrPayload: null,
      qrImageDataUrl: null,
      reference: paymentReference(),
      expiresAt: daysAgo(placedDaysAgo),
      attempts: 1,
      failureReason: plan.status === 'cancelled' ? 'Payment window expired.' : null,
      createdAt: placedAt,
      updatedAt: placedAt,
    });

    let invoiceId: string | null = null;
    if (paid) {
      invoiceId = uuid();
      invoices.push({
        id: invoiceId,
        number: invoiceNumber(1000 + index),
        orderId,
        spaceId: space.id,
        ownerId: space.ownerId,
        amount: pricing.total,
        gst: pricing.gst,
        issuedAt: placedAt,
        pdfUrl: null,
      });
    }

    let installationId: string | null = null;
    if (plan.status === 'completed' || plan.status === 'installation_scheduled') {
      installationId = uuid();
      const scheduledFor =
        plan.status === 'completed' ? daysAgo(Math.max(1, placedDaysAgo - 12)) : daysFromNow(between(2, 16));
      installations.push({
        id: installationId,
        orderId,
        spaceId: space.id,
        scheduledFor,
        installationWindow: pick(['9:00 AM — 11:00 AM', '11:00 AM — 1:00 PM', '3:00 PM — 5:00 PM']),
        status: plan.status === 'completed' ? 'completed' : 'scheduled',
        technician: pick(['Rahul D.', 'Sana M.', 'Vivek P.', 'Joseph K.']),
        notes: null,
        completedAt: plan.status === 'completed' ? scheduledFor : null,
      });
    }

    orders.push({
      id: orderId,
      reference,
      spaceId: space.id,
      ownerId: space.ownerId,
      items,
      pricing,
      status: plan.status,
      timeline,
      paymentId,
      invoiceId,
      installationId,
      notes: null,
      placedAt,
      updatedAt: timeline[timeline.length - 1]?.at ?? placedAt,
      completedAt: plan.status === 'completed' ? timeline[timeline.length - 1]?.at ?? null : null,
    });

    // Payouts follow the money: an artist earns once the order is paid for.
    if (paid) {
      for (const item of items) {
        payouts.push({
          id: uuid(),
          artistId: item.artistId,
          orderId,
          amount: item.artistCommission,
          status: plan.status === 'completed' ? 'paid' : 'pending',
          periodLabel: new Date(placedAt).toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
          paidAt: plan.status === 'completed' ? daysAgo(Math.max(0, placedDaysAgo - 20)) : null,
          createdAt: placedAt,
        });
      }
    }
  }

  return { orders, payments, invoices, installations, payouts };
}

function buildRotations(spaces: Space[], orders: Order[]): RotationCycle[] {
  const cycles: RotationCycle[] = [];
  const statuses: RotationCycle['status'][] = [
    'active',
    'active',
    'due',
    'awaiting_approval',
    'curating',
    'installed',
  ];

  for (const [index, status] of statuses.entries()) {
    const space = spaces[index % spaces.length]!;
    const spaceOrders = orders.filter(
      (order) => order.spaceId === space.id && order.status === 'completed',
    );
    const current = spaceOrders.flatMap((order) => order.items.map((item) => item.artworkId)).slice(0, 4);

    cycles.push({
      id: uuid(),
      spaceId: space.id,
      cycleNumber: between(1, 4),
      currentArtworkIds: current,
      proposedArtworkIds: status === 'awaiting_approval' || status === 'installed' ? [] : [],
      status,
      dueAt: status === 'due' ? daysAgo(between(1, 9)) : monthsFromNow(space.rotationIntervalMonths),
      approvedAt: status === 'installed' ? daysAgo(between(10, 40)) : null,
      installedAt: status === 'installed' ? daysAgo(between(5, 30)) : null,
      createdAt: daysAgo(between(40, 200)),
    });
  }

  return cycles;
}

function buildNotifications(
  ownerUsers: StoredUser[],
  artistUsers: StoredUser[],
  orders: Order[],
): Notification[] {
  const notifications: Notification[] = [];

  const templates: { type: Notification['type']; title: string; body: string }[] = [
    {
      type: 'artwork_selected',
      title: 'Your photograph was selected',
      body: 'A space has chosen one of your photographs for their next collection.',
    },
    {
      type: 'upload_approved',
      title: 'Upload approved',
      body: 'Your photograph passed review and is now live in the gallery.',
    },
    {
      type: 'payment_received',
      title: 'Payment received',
      body: 'We have received your payment and your order is confirmed.',
    },
    {
      type: 'installation_scheduled',
      title: 'Installation scheduled',
      body: 'Our team will be at your space to install your collection.',
    },
    {
      type: 'rotation_reminder',
      title: 'Rotation coming up',
      body: 'Your next rotation is due. We are curating a fresh collection for you.',
    },
    {
      type: 'order_completed',
      title: 'Your collection is up',
      body: 'Installation is complete. We would love to hear what you think.',
    },
    {
      type: 'payout_processed',
      title: 'Payout processed',
      body: 'Your earnings for this period have been transferred.',
    },
  ];

  const recipients = [...ownerUsers, ...artistUsers.slice(0, 8)];

  for (let index = 0; index < 40; index += 1) {
    const user = recipients[index % recipients.length]!;
    const template = templates[index % templates.length]!;
    const order = orders[index % orders.length];

    notifications.push({
      id: uuid(),
      userId: user.id,
      type: template.type,
      title: template.title,
      body: template.body,
      link:
        user.role === 'space_owner' && order
          ? `/space/orders/${order.id}`
          : user.role === 'artist'
            ? '/studio/submissions'
            : null,
      read: index % 3 !== 0,
      archived: false,
      createdAt: daysAgo(between(0, 45)),
    });
  }

  return notifications;
}

// ── Seeding ──────────────────────────────────────────────────────────────────

export async function seedAll(options: { fresh?: boolean } = {}): Promise<void> {
  if (options.fresh) clearPersistedStore();

  const { users, profiles, artistUsers, ownerUsers, spaces } = buildPeople();
  const profilesByUser = new Map(profiles.map((profile) => [profile.userId, profile]));

  const artworks = buildArtworks(artistUsers, profilesByUser);
  const { orders, payments, invoices, installations, payouts } = buildCommerce(
    spaces,
    artworks,
    profilesByUser,
  );
  const rotations = buildRotations(spaces, orders);
  const notifications = buildNotifications(ownerUsers, artistUsers, orders);

  const applications = [
    'submitted',
    'submitted',
    'submitted',
    'under_review',
    'under_review',
    'accepted',
    'accepted',
    'rejected',
    'rejected',
  ].map((status, index) => ({
    id: uuid(),
    fullName: pick([
      'Ritika Sharma',
      'Joel Mathew',
      'Ananya Sen',
      'Hasan Ali',
      'Divya Menon',
      'Tom Whitfield',
      'Priyanka Das',
      'Arun Pillai',
      'Zoya Khan',
    ]),
    email: `applicant${index + 1}@example.com`,
    location: pick(LOCATIONS),
    website: index % 2 === 0 ? `https://portfolio${index + 1}.photo` : null,
    instagram: `@applicant${index + 1}`,
    journey:
      'I have been photographing for six years, mostly on weekends and mostly close to home. Recently I have been working on a long series about the neighbourhood I grew up in, and I would like to see that work somewhere other than a screen.',
    genres: pickMany(['street', 'documentary', 'landscape', 'portrait', 'architecture'], between(1, 3)),
    goals: 'I would like my work to be seen in real spaces, and to be paid fairly when it is.',
    referral: pick(['instagram', 'friend', 'search', 'exhibition']),
    portfolioUrls: Array.from({ length: 6 }, (_, i) => seededPhoto(`application-${index}-${i}`, 900, 600)),
    status: status as 'submitted' | 'under_review' | 'accepted' | 'rejected',
    reviewNote:
      status === 'rejected'
        ? 'Strong instincts, but the portfolio is not consistent enough yet. We would genuinely welcome a re-application in six months.'
        : null,
    createdAt: daysAgo(between(1, 90)),
    updatedAt: daysAgo(between(0, 30)),
  }));

  const consultations = Array.from({ length: 7 }, (_, index) => ({
    id: uuid(),
    name: pick(['Kiran Shetty', 'Farah Mistry', 'Dev Anand', 'Lakshmi R.', 'Naveen Kumar']),
    email: `enquiry${index + 1}@example.com`,
    phone: `+91 98${between(100, 999)}${between(10000, 99999)}`,
    spaceType: pick(['cafe', 'restaurant', 'hotel', 'office', 'home_decor', 'clinic'] as const),
    location: pick(['Bengaluru', 'Mumbai', 'Pune', 'Delhi', 'Goa']),
    message:
      'We are opening in about six weeks and the walls are completely bare. Would like to understand how the rotation works and what it costs.',
    mode: (index % 2 === 0 ? 'video' : 'in_person') as 'video' | 'in_person',
    preferredDate: daysFromNow(between(1, 21)).slice(0, 10),
    preferredSlot: pick(['10:00 AM', '11:00 AM', '2:00 PM', '4:00 PM']),
    status: (['new', 'new', 'new', 'scheduled', 'scheduled', 'completed', 'cancelled'] as const)[index]!,
    createdAt: daysAgo(between(0, 30)),
  }));

  const tickets = Array.from({ length: 5 }, (_, index) => {
    const owner = ownerUsers[index % ownerUsers.length]!;
    return {
      id: uuid(),
      userId: owner.id,
      subject: pick([
        'Installation timing clash',
        'Invoice needs our GST number',
        'One frame arrived with a scratch',
        'Can we bring the rotation forward?',
        'Adding a second wall',
      ]),
      message:
        'Hoping you can help with this — happy to be called on the number on our account if that is easier.',
      category: (['installation', 'billing', 'order', 'installation', 'account'] as const)[index]!,
      status: (['open', 'in_progress', 'resolved', 'resolved', 'open'] as const)[index]!,
      reply:
        index === 2 || index === 3
          ? 'Sorted — a replacement frame is on its way and will go up during the next visit.'
          : null,
      createdAt: daysAgo(between(1, 40)),
      updatedAt: daysAgo(between(0, 10)),
    };
  });

  const auditLogs = Array.from({ length: 30 }, (_, index) => {
    const actor = users[index % users.length]!;
    const action = pick([
      'order.status_changed',
      'artwork.approved',
      'artwork.rejected',
      'payment.verified',
      'space.verified',
      'user.role_changed',
      'application.accepted',
      'payout.paid',
      'rotation.proposed',
    ]);
    return {
      id: uuid(),
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      entity: action.split('.')[0]!,
      entityId: uuid(),
      meta: {},
      ip: `10.0.${between(0, 4)}.${between(2, 250)}`,
      createdAt: daysAgo(between(0, 60)),
    };
  });

  const firstOwner = ownerUsers[0]!;
  const approvedArtworks = artworks.filter((artwork) => artwork.status === 'approved');

  const wishlists = approvedArtworks.slice(0, 6).map((artwork) => ({
    id: uuid(),
    userId: firstOwner.id,
    artworkId: artwork.id,
    createdAt: daysAgo(between(1, 30)),
  }));

  const follows = artistUsers.slice(0, 4).map((artist) => ({
    id: uuid(),
    userId: firstOwner.id,
    artistId: artist.id,
    createdAt: daysAgo(between(1, 60)),
  }));

  // Foreign keys mean order matters on a real database: clear children before
  // parents, then insert parents before children. On the memory driver the
  // order is irrelevant, but doing it once keeps both drivers on one path.
  await db.tokens.clear();
  await db.otpChallenges.clear();
  await db.follows.clear();
  await db.wishlists.clear();
  await db.auditLogs.clear();
  await db.supportTickets.clear();
  await db.consultations.clear();
  await db.applications.clear();
  await db.payouts.clear();
  await db.notifications.clear();
  await db.rotations.clear();
  await db.installations.clear();
  await db.invoices.clear();
  await db.payments.clear();
  await db.orders.clear();
  await db.artworks.clear();
  await db.spaces.clear();
  await db.profiles.clear();
  await db.users.clear();

  await db.users.reset(users);
  await db.profiles.reset(profiles);
  await db.spaces.reset(spaces);
  await db.artworks.reset(artworks);
  await db.orders.reset(orders);
  await db.payments.reset(payments);
  await db.invoices.reset(invoices);
  await db.installations.reset(installations);
  await db.rotations.reset(rotations);
  await db.notifications.reset(notifications);
  await db.payouts.reset(payouts);
  await db.applications.reset(applications);
  await db.consultations.reset(consultations);
  await db.supportTickets.reset(tickets);
  await db.auditLogs.reset(auditLogs);
  await db.wishlists.reset(wishlists);
  await db.follows.reset(follows);
  await db.otpChallenges.reset([]);
  await db.tokens.reset([]);

  logger.info(
    `seeded ${users.length} users · ${spaces.length} spaces · ${artworks.length} artworks · ${orders.length} orders`,
  );
}

/** Seeds only an empty database, so a restart never overwrites real activity. */
export async function ensureSeeded(): Promise<boolean> {
  // An empty real database is a new deployment, not an invitation to fill it
  // with fictional people. `seedAll` also clears every table before inserting,
  // so leaving this unguarded made "start the server" a destructive operation
  // against anything it decided looked empty.
  if (!env.SEED_DEMO_DATA) return false;

  const existing = await db.users.count();
  if (existing > 0) return false;
  await seedAll();
  return true;
}
