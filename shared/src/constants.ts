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

/** Account lifecycle (SDD §20). */
export const USER_STATUSES = ['pending_verification', 'pending_ceo_approval', 'verified', 'suspended'] as const;

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

export const CONTACT = {
  phone: '+91 96060 10193',
  phoneRaw: '919606010193',
  email: 'hello@artinu.in',
  supportEmail: 'support@artinu.in',
  address: {
    line1: '',
    line2: '',
    city: '',
    state: '',
    pin: '',
    country: '',
  },
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
