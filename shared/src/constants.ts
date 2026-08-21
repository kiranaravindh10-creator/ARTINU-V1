/** Roles, lifecycle states and the frame catalogue. */

export const ROLES = [
  'guest',
  'space_owner',
  'artist',
  'ceo',
  'manager',
  'accounts',
  'operations',
  'it_team',
] as const;

/** Internal staff roles — everything inside the ARTINU Console. */
export const INTERNAL_ROLES = ['ceo', 'manager', 'accounts', 'operations', 'it_team'] as const;

export const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  guest: 'Guest',
  space_owner: 'Space Owner',
  artist: 'Artist',
  ceo: 'CEO',
  manager: 'Manager',
  accounts: 'Accounts',
  operations: 'Operations',
  it_team: 'IT Team',
};

/**
 * Console modules each internal role may reach (SDD §6, requirements §15).
 * The client uses this for navigation, the server for authorisation —
 * one source of truth so they cannot drift apart.
 */
export const ROLE_MODULES: Record<string, string[]> = {
  ceo: [
    'overview',
    'orders',
    'moderation',
    'artists',
    'spaces',
    'printing',
    'payments',
    'accounts',
    'reports',
    'users',
    'content',
    'system',
  ],
  // `content` is the homepage — the carousel, the collaborations, the featured
  // photographs. It used to sit inside `system`, which meant the two roles that
  // actually maintain the homepage (manager and IT) could not both reach it:
  // the console linked it under `system` (CEO and IT only) while the API asked
  // for the manager role, so whoever could see the page could not save from it.
  manager: [
    'overview',
    'orders',
    'moderation',
    'artists',
    'spaces',
    'printing',
    'reports',
    'content',
  ],
  accounts: ['overview', 'payments', 'accounts', 'reports'],
  operations: ['overview', 'orders', 'printing', 'spaces'],
  it_team: ['overview', 'users', 'content', 'system'],
};

/**
 * Account lifecycle (SDD §20).
 *
 * `banned` is the permanent end state from Community Guidelines §12 and is
 * deliberately distinct from `suspended`: a suspension is reversible and the
 * console offers a Restore action for it, a ban is not offered one. Both keep
 * the account row and its work — neither deletes anything (§16, §17).
 */
export const USER_STATUSES = [
  'pending_verification',
  'pending_ceo_approval',
  'verified',
  'suspended',
  'banned',
] as const;

/**
 * The Community Guidelines version a photographer accepts at registration.
 *
 * Stored against the profile with the timestamp, so publishing a revision is a
 * matter of changing this string — accounts on the older version can then be
 * asked to acknowledge the new one without losing the record that they agreed
 * to the previous text.
 */
export const COMMUNITY_GUIDELINES_VERSION = '1.0';

/** Why a warning was issued. Kept short; the free-text reason carries detail. */
export const WARNING_CATEGORIES = [
  'guidelines',
  'copyright',
  'content',
  'quality',
  'impersonation',
  'duplicate_account',
  'manipulation',
  'harassment',
  'inactivity',
  'other',
] as const;

export type WarningCategory = (typeof WARNING_CATEGORIES)[number];

export const WARNING_CATEGORY_LABELS: Record<WarningCategory, string> = {
  guidelines: 'Community Guidelines',
  copyright: 'Copyright or ownership',
  content: 'Unsuitable content',
  quality: 'Print quality',
  impersonation: 'Impersonation',
  duplicate_account: 'Duplicate or fake account',
  manipulation: 'Engagement manipulation',
  harassment: 'Harassment',
  inactivity: 'Account inactivity',
  other: 'Other',
};

/**
 * Three warnings make an account eligible for serious enforcement (§12).
 *
 * "May result in" — so reaching three does not ban anyone automatically. It
 * surfaces the account for admin review, and the decision stays with a person.
 */
export const WARNING_LIMIT = 3;

/** §13 — a new account with no upload after this many days may be warned. */
export const NEW_ACCOUNT_GRACE_DAYS = 10;

/** §14 — no activity and no upload for this long makes an account reviewable. */
export const INACTIVITY_DAYS = 96;

/** §11 — once a photograph is physically down, removal is processed within this. */
export const REMOVAL_PROCESSING_DAYS = 5;

/** Where a removal request has got to. */
export const REMOVAL_REQUEST_STATUSES = [
  'requested',
  'under_review',
  'awaiting_installation_removal',
  'approved',
  'completed',
  'rejected',
] as const;

export type RemovalRequestStatus = (typeof REMOVAL_REQUEST_STATUSES)[number];

export const REMOVAL_REQUEST_STATUS_LABELS: Record<RemovalRequestStatus, string> = {
  requested: 'Requested',
  under_review: 'Under review',
  awaiting_installation_removal: 'Awaiting installation removal',
  approved: 'Approved',
  completed: 'Completed',
  rejected: 'Declined',
};

/** Artwork moderation lifecycle (SDD §11). */
export const ARTWORK_STATUSES = [
  'draft',
  'processing',
  'pending_review',
  'approved',
  'rejected',
  'archived',
] as const;

/** Automated checks every upload passes through (requirements §5). */
export const VALIDATION_CHECKS = [
  'ai_generated',
  'nsfw',
  'quality',
  'duplicate',
  'metadata',
] as const;

export const VALIDATION_CHECK_LABELS: Record<(typeof VALIDATION_CHECKS)[number], string> = {
  ai_generated: 'AI-Generated Detection',
  nsfw: 'Content Safety',
  quality: 'Quality Assessment',
  duplicate: 'Duplicate Detection',
  metadata: 'Metadata Validation',
};

/** Order lifecycle (SDD §13, §20). */
export const ORDER_STATUSES = [
  'pending_payment',
  'payment_failed',
  'confirmed',
  'printing',
  'framing',
  'dispatched',
  'out_for_delivery',
  'installation_scheduled',
  'completed',
  'cancelled',
] as const;

export const ORDER_STATUS_LABELS: Record<(typeof ORDER_STATUSES)[number], string> = {
  pending_payment: 'Awaiting Payment',
  payment_failed: 'Payment Failed',
  confirmed: 'Order Confirmed',
  printing: 'Printing',
  framing: 'Framing',
  dispatched: 'Dispatched',
  out_for_delivery: 'Out for Delivery',
  installation_scheduled: 'Installation Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** The stages a space owner sees on the tracking timeline (requirements §12). */
export const ORDER_TRACKING_STAGES = [
  'confirmed',
  'printing',
  'framing',
  'dispatched',
  'out_for_delivery',
  'installation_scheduled',
  'completed',
] as const;

export const PAYMENT_STATUSES = [
  'created',
  'awaiting_payment',
  'verifying',
  'succeeded',
  'failed',
  'expired',
  'refunded',
] as const;

export const INSTALLATION_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;

export const ROTATION_STATUSES = [
  'active',
  'due',
  'curating',
  'awaiting_approval',
  'approved',
  'installed',
] as const;

export const NOTIFICATION_TYPES = [
  'artwork_selected',
  'upload_approved',
  'upload_rejected',
  'payment_received',
  'payment_failed',
  'installation_scheduled',
  'rotation_reminder',
  'order_completed',
  'order_update',
  'payout_processed',
  'application_update',
  'system',
] as const;

/**
 * Who a staff announcement can be addressed to.
 *
 * Deliberately a short list of audiences rather than "pick any users": the
 * point of the feature is telling a whole group something at once, and a
 * per-user picker would be a mailing tool with a different set of problems
 * (consent, unsubscribes, someone quietly messaging one artist from an
 * official-looking channel).
 */
export const ANNOUNCEMENT_AUDIENCES = ['artists', 'space_owners', 'everyone'] as const;

export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  artists: 'Artists',
  space_owners: 'Space owners',
  everyone: 'Everyone (artists and space owners)',
};

/**
 * The roles that may send one.
 *
 * Manager, IT and CEO — the three named in the 20 Aug review. Accounts and
 * operations are staff but have no reason to address the whole platform, and
 * this is the one feature in the console that writes to every user at once.
 */
export const ANNOUNCEMENT_SENDER_ROLES = ['ceo', 'manager', 'it_team'] as const;

export const SPACE_TYPES = [
  'cafe',
  'restaurant',
  'hotel',
  'office',
  'home_decor',
  'clinic',
  'retail',
  'other',
] as const;

export const SPACE_TYPE_LABELS: Record<(typeof SPACE_TYPES)[number], string> = {
  cafe: 'Café',
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  office: 'Office',
  home_decor: 'Home Decor',
  clinic: 'Clinic / Hospital',
  retail: 'Retail',
  other: 'Other',
};

export const GALLERY_CATEGORIES = [
  'people',
  'places',
  'nature',
  'street',
  'travel',
  'black_white',
  'abstract',
  'architecture',
  'lifestyle',
  'minimal',
] as const;

export const GALLERY_CATEGORY_LABELS: Record<(typeof GALLERY_CATEGORIES)[number], string> = {
  people: 'People',
  places: 'Places',
  nature: 'Nature',
  street: 'Street',
  travel: 'Travel',
  black_white: 'Black & White',
  abstract: 'Abstract',
  architecture: 'Architecture',
  lifestyle: 'Lifestyle',
  minimal: 'Minimal',
};

/** The first six show by default in the gallery sidebar; the rest sit behind "View more". */
export const PRIMARY_GALLERY_CATEGORIES = [
  'architecture',
  'nature',
  'abstract',
  'lifestyle',
  'travel',
] as const;

export const ORIENTATIONS = ['landscape', 'portrait', 'square'] as const;

export const ORIENTATION_LABELS: Record<(typeof ORIENTATIONS)[number], string> = {
  landscape: 'Landscape',
  portrait: 'Portrait',
  square: 'Square',
};

/**
 * Offered as one-tap chips on the upload form. Tags are free text — this is a
 * starting point, not a closed list — but a shared vocabulary makes gallery
 * search far more useful than everyone inventing their own words.
 */
export const SUGGESTED_TAGS = [
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
  'portrait',
  'architecture',
  'nature',
  'street',
] as const;

/** Mood facet in the gallery sidebar. */
export const MOODS = ['warm', 'moody', 'bright', 'minimal', 'dramatic', 'serene', 'nostalgic'] as const;

export const MOOD_LABELS: Record<(typeof MOODS)[number], string> = {
  warm: 'Warm',
  moody: 'Moody',
  bright: 'Bright',
  minimal: 'Minimal',
  dramatic: 'Dramatic',
  serene: 'Serene',
  nostalgic: 'Nostalgic',
};

/** Colour facet — swatches shown as circles under "Colors". */
export const ARTWORK_COLORS = [
  { value: 'black', label: 'Black', hex: '#141210' },
  { value: 'sienna', label: 'Sienna', hex: '#8A4B23' },
  { value: 'sand', label: 'Sand', hex: '#D8BE94' },
  { value: 'stone', label: 'Stone', hex: '#B4B0AA' },
  { value: 'forest', label: 'Forest', hex: '#3B4B3F' },
  { value: 'indigo', label: 'Indigo', hex: '#2F4A6B' },
  { value: 'multi', label: 'Multicolour', hex: 'conic' },
] as const;

/** Primary art style an artist picks during registration. */
export const ART_STYLES = [
  'architecture',
  'documentary',
  'fine_art',
  'landscape',
  'portrait',
  'street',
  'travel',
  'wildlife',
  'abstract',
  'food',
] as const;

export const ART_STYLE_LABELS: Record<(typeof ART_STYLES)[number], string> = {
  architecture: 'Architecture',
  documentary: 'Documentary',
  fine_art: 'Fine Art',
  landscape: 'Landscape',
  portrait: 'Portrait',
  street: 'Street',
  travel: 'Travel',
  wildlife: 'Wildlife',
  abstract: 'Abstract',
  food: 'Food & Still Life',
};

/** How artists hear about ARTINU — the referral select on the application form. */
export const REFERRAL_SOURCES = [
  'instagram',
  'friend',
  'search',
  'artinus_team',
  'exhibition',
  'other',
] as const;

export const REFERRAL_SOURCE_LABELS: Record<(typeof REFERRAL_SOURCES)[number], string> = {
  instagram: 'Instagram',
  friend: 'A friend or fellow photographer',
  search: 'Search',
  artinus_team: 'Someone from the ARTINU team',
  exhibition: 'An exhibition or event',
  other: 'Somewhere else',
};

/** Sign-in OTP step (artist login flow, screen 3). */
export const OTP = {
  LENGTH: 4,
  /** Seconds before the code expires — the countdown reads "Code expires in 01:45". */
  TTL_SECONDS: 120,
  RESEND_COOLDOWN_SECONDS: 30,
} as const;

/** Consultation slots offered on Let's Talk. */
export const CONSULTATION_SLOTS = [
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
] as const;

// ── Frame catalogue (requirements §8) ────────────────────────────────────────
// Prices are in paise-free rupees; the pricing engine multiplies them out.

export interface FrameOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  /** Multiplier applied to the base frame cost. */
  multiplier: number;
  /** Flat rupee add-on. */
  addon?: number;
}

export const FRAME_SIZES = [
  { value: 'a3_landscape', label: 'A3 — 16:9', description: '420 × 236 mm', multiplier: 1, ratio: 16 / 9 },
  { value: 'a3_classic', label: 'A3 — 4:3', description: '420 × 315 mm', multiplier: 1.1, ratio: 4 / 3 },
  { value: 'a2_landscape', label: 'A2 — 16:9', description: '594 × 334 mm', multiplier: 1.6, ratio: 16 / 9 },
  { value: 'square_large', label: 'Square', description: '500 × 500 mm', multiplier: 1.35, ratio: 1 },
  { value: 'portrait_tall', label: 'Portrait', description: '400 × 600 mm', multiplier: 1.45, ratio: 2 / 3 },
] as const;

export const FRAME_MATERIALS = [
  { value: 'wood', label: 'Wood', description: 'Warm, classic, hand-finished', multiplier: 1 },
  { value: 'aluminium', label: 'Aluminium', description: 'Slim, modern, lightweight', multiplier: 1.2 },
  { value: 'premium_metal', label: 'Premium Metal', description: 'Weighted profile, gallery grade', multiplier: 1.55 },
] as const;

export const FRAME_COLORS = [
  { value: 'black', label: 'Black', hex: '#141210', multiplier: 1 },
  { value: 'white', label: 'White', hex: '#F4F1EC', multiplier: 1 },
  { value: 'walnut', label: 'Walnut', hex: '#5A4130', multiplier: 1.08 },
  { value: 'natural', label: 'Natural', hex: '#C0A582', multiplier: 1.05 },
] as const;

export const GLASS_TYPES = [
  { value: 'normal', label: 'Normal', description: 'Clear float glass', multiplier: 1 },
  { value: 'matte', label: 'Matte', description: 'Softens reflections', multiplier: 1.18 },
  { value: 'anti_reflective', label: 'Anti-Reflective', description: 'Museum grade clarity', multiplier: 1.4 },
] as const;

export const PRINT_FINISHES = [
  { value: 'matte', label: 'Matte', description: 'Soft, non-reflective, archival', multiplier: 1 },
  { value: 'glossy', label: 'Glossy', description: 'Deep contrast, vivid tone', multiplier: 1.08 },
] as const;

/** Minimum order quantity — three frames (requirements §7). */
export const MIN_ORDER_QUANTITY = 3;

// ── Pricing constants (requirements §9) ──────────────────────────────────────

export const PRICING = {
  /**
   * Base frame cost before size/material/colour multipliers.
   * These three add up to ₹3,299 for the entry configuration, which is the
   * "Starting price" quoted on the artwork detail screen.
   */
  BASE_FRAME_COST: 1400,
  /** Base printing cost before size/finish multipliers. */
  BASE_PRINT_COST: 699,
  /** Licensing fee per photograph, paid through to the artist. */
  ARTWORK_LICENSE_FEE: 1200,
  /** Share of the artwork licence fee that reaches the artist. */
  ARTIST_COMMISSION_RATE: 0.6,
  GST_RATE: 0.18,
  DELIVERY_CHARGE: 450,
  /** Waived above this order subtotal. */
  FREE_DELIVERY_THRESHOLD: 25000,
  INSTALLATION_CHARGE_PER_FRAME: 250,
  /** Refundable deposit charged on rotation subscriptions. */
  SECURITY_DEPOSIT_PER_FRAME: 500,
  CURRENCY: 'INR',
  CURRENCY_SYMBOL: '₹',
} as const;

/** Rotation cadence offered to spaces (months). */
export const ROTATION_INTERVALS = [1, 2, 3] as const;

// ── Brand / contact ──────────────────────────────────────────────────────────

/*
 * ARTINU publishes no physical address.
 *
 * There used to be an `address` object here with every field set to an empty
 * string. That is worse than not having one: six call sites went on rendering
 * it, so the help page showed a blank line where a street should be, the legal
 * page offered to take post "by post to , ,  " and every transactional email
 * footer carried a stray comma. An empty field is still a field, and callers
 * treat it as one.
 *
 * The key is gone rather than blanked, so TypeScript fails the build at any
 * call site that tries to print an address instead of letting one quietly
 * reappear. Contact is phone, email and WhatsApp — all of which are real.
 */
export const CONTACT = {
  phone: '+91 96060 10193',
  phoneRaw: '919606010193',
  email: 'hello@artinu.in',
  supportEmail: 'support@artinu.in',
  hours: [
    { days: 'Monday — Friday', time: '9:30 AM — 6:30 PM' },
    { days: 'Saturday', time: '10:00 AM — 4:00 PM' },
    { days: 'Sunday', time: 'Closed' },
  ],
  /**
   * Live social channels. These are the exact URLs the footer links to, so
   * they must be the real profiles — an empty string removes the button
   * rather than rendering one that goes nowhere.
   */
  social: {
    instagram: 'https://www.instagram.com/artinu.in/',
    linkedin: 'https://www.linkedin.com/company/artinu/',
  },
} as const;

export const API_ROUTES = [
  'auth',
  'users',
  'spaces',
  'artworks',
  'orders',
  'payments',
  'uploads',
  'notifications',
  'rotation',
  'invoices',
  'admin',
] as const;

/**
 * The homepage slideshow as it plays with no settings record saved.
 *
 * These are the values that were hardcoded in the homepage before the console
 * could reach them, so an untouched install behaves exactly as it did.
 */
export const DEFAULT_SLIDESHOW_SETTINGS = {
  autoPlay: true,
  intervalMs: 6000,
  transition: 'fade',
  transitionMs: 1200,
  kenBurns: true,
  pauseOnHover: true,
  showThumbnails: true,
  showArrows: true,
  showCounter: true,
  caption: 'Photography on rotation, for rooms people actually sit in.',
} as const;

/** Bounds the console enforces, and the API re-checks. */
export const SLIDESHOW_LIMITS = {
  intervalMs: { min: 2000, max: 30000, step: 500 },
  transitionMs: { min: 200, max: 3000, step: 100 },
  caption: { max: 160 },
} as const;
