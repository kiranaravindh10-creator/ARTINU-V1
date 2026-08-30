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
    'announcements',
    'system',
  ],
  // `content` is the homepage — the carousel, the collaborations, the featured
  // photographs. It used to sit inside `system`, which meant the two roles that
  // actually maintain the homepage (manager and IT) could not both reach it:
  // the console linked it under `system` (CEO and IT only) while the API asked
  // for the manager role, so whoever could see the page could not save from it.
  /*
    `announcements` is sending a notification to a whole audience — every artist,
    every space owner, all staff.

    It is a module of its own rather than a corner of an existing one because no
    existing module fits the three roles who need it. The obvious home was
    `users`, but the manager does not hold `users` — only the CEO and IT do — so
    putting it there would have locked out one of the three roles that asked for
    it. The only modules all three already share are `overview` and `content`,
    and a broadcast is neither a dashboard nor the homepage.
  */
  manager: [
    'overview',
    'orders',
    'moderation',
    'artists',
    'spaces',
    'printing',
    'reports',
    'content',
    'announcements',
  ],
  accounts: ['overview', 'payments', 'accounts', 'reports'],
  operations: ['overview', 'orders', 'printing', 'spaces'],
  it_team: ['overview', 'users', 'content', 'announcements', 'system'],
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

/*
  THE FRAME CATALOGUE
  ===================

  What a space owner can choose was cut back hard, to the spec dictated in the
  review call: three paper sizes, two colours, and nothing else. Glass is always
  glass, the print is always the same finish, the material follows from the
  colour, and the orientation follows the photograph rather than being picked.

  Each list is therefore split in two.

    FRAME_SIZES / FRAME_COLORS / ...          what the configurator OFFERS today
    RETIRED_FRAME_SIZES / ...                 what it used to offer
    ALL_FRAME_SIZES / ...                     both, for reading old data

  The retired half is not dead code and must not be deleted. Orders already
  placed carry values like `a3_landscape` and `anti_reflective` in the database,
  and three separate things still read them: `priceLine` looks up their
  multipliers, `frameConfigurationSchema` validates them on the way back in, and
  the printing console, the cart and the invoice all print their labels. Drop
  them and every historical order either fails validation or renders a blank
  spec line on a real invoice.

  So: anything a HUMAN PICKS FROM renders the offered list. Anything that READS
  A STORED VALUE uses the ALL_ list.
*/

export const FRAME_SIZES = [
  { value: 'a4', label: 'A4', description: '210 × 297 mm', multiplier: 0.8, ratio: 1 / Math.SQRT2 },
  { value: 'a3', label: 'A3', description: '297 × 420 mm', multiplier: 1, ratio: 1 / Math.SQRT2 },
] as const;

/**
 * Sizes withdrawn from sale. Kept so historical orders still price and print.
 *
 * The old catalogue baked an aspect ratio into the size - "A3 - 16:9", "Square",
 * "Portrait" - which asked the owner to choose a shape for a photograph whose
 * shape was already decided when it was taken. A portrait photograph in a 16:9
 * frame is a cropping decision, and it is not the buyer's to make. The three
 * sizes above are just paper; the frame follows the photograph.
 */
export const RETIRED_FRAME_SIZES = [
  /*
    A2 is no longer sold. Two sizes are what ARTINU prints today - A4 and A3 -
    and a third option that is never chosen is a third decision asked of every
    buyer for nothing.

    Retired rather than deleted, which is the whole point of this list: an order
    already placed at A2 still has to price, validate on the way back in, and
    print its spec line on a real invoice. Deleting the row would break every
    one of those. Moving it here removes it from the configurator and leaves it
    readable forever.
  */
  { value: 'a2', label: 'A2', description: '420 × 594 mm', multiplier: 1.6, ratio: 1 / Math.SQRT2 },
  { value: 'a3_landscape', label: 'A3 - 16:9', description: '420 × 236 mm', multiplier: 1, ratio: 16 / 9 },
  { value: 'a3_classic', label: 'A3 - 4:3', description: '420 × 315 mm', multiplier: 1.1, ratio: 4 / 3 },
  { value: 'a2_landscape', label: 'A2 - 16:9', description: '594 × 334 mm', multiplier: 1.6, ratio: 16 / 9 },
  { value: 'square_large', label: 'Square', description: '500 × 500 mm', multiplier: 1.35, ratio: 1 },
  { value: 'portrait_tall', label: 'Portrait', description: '400 × 600 mm', multiplier: 1.45, ratio: 2 / 3 },
] as const;

export const ALL_FRAME_SIZES = [...FRAME_SIZES, ...RETIRED_FRAME_SIZES] as const;

/**
 * The material is no longer chosen. It is decided by the colour - white comes in
 * metal, brown comes in wood - so it is derived through FRAME_COLOR_MATERIAL
 * below rather than offered as a second question that can contradict the first.
 * Both carry a multiplier of 1: the colour does not change the price.
 */
export const FRAME_MATERIALS = [
  { value: 'wood', label: 'Wood', description: 'Warm wooden profile', multiplier: 1 },
  { value: 'metal', label: 'Metal', description: 'Slim metal profile', multiplier: 1 },
] as const;

export const RETIRED_FRAME_MATERIALS = [
  { value: 'aluminium', label: 'Aluminium', description: 'Slim, modern, lightweight', multiplier: 1.2 },
  { value: 'premium_metal', label: 'Premium Metal', description: 'Weighted profile, gallery grade', multiplier: 1.55 },
] as const;

export const ALL_FRAME_MATERIALS = [...FRAME_MATERIALS, ...RETIRED_FRAME_MATERIALS] as const;

/**
 * Two colours, and the label says what you actually receive.
 *
 * `brown` is a new value rather than a relabelled `black`. The old black frame
 * was black, orders were placed for black frames, and a stored `black` that
 * silently starts printing the word "Brown" on an invoice is a lie about what
 * someone bought. Old orders keep saying Black; new ones say Brown.
 */
export const FRAME_COLORS = [
  { value: 'white', label: 'White', hex: '#F4F1EC', multiplier: 1 },
  { value: 'brown', label: 'Brown', hex: '#5A3F2C', multiplier: 1 },
] as const;

export const RETIRED_FRAME_COLORS = [
  { value: 'black', label: 'Black', hex: '#141210', multiplier: 1 },
  { value: 'walnut', label: 'Walnut', hex: '#5A4130', multiplier: 1.08 },
  { value: 'natural', label: 'Natural', hex: '#C0A582', multiplier: 1.05 },
] as const;

export const ALL_FRAME_COLORS = [...FRAME_COLORS, ...RETIRED_FRAME_COLORS] as const;

/**
 * Colour decides material. White is a metal frame, brown is a wooden one.
 *
 * This is the single place that mapping lives. The configurator writes the
 * material from it so a cart line can never claim a white wooden frame, and the
 * cart, invoice and printing console all print the result.
 */
export const FRAME_COLOR_MATERIAL: Record<string, 'wood' | 'metal'> = {
  white: 'metal',
  brown: 'wood',
  // Retired colours, so an old order still names a material.
  black: 'wood',
  walnut: 'wood',
  natural: 'wood',
};

/** Every frame is glazed with the same clear glass, so it is not a question. */
export const GLASS_TYPES = [
  { value: 'normal', label: 'Glass', description: 'Clear float glass', multiplier: 1 },
] as const;

export const RETIRED_GLASS_TYPES = [
  { value: 'matte', label: 'Matte', description: 'Softens reflections', multiplier: 1.18 },
  { value: 'anti_reflective', label: 'Anti-Reflective', description: 'Museum grade clarity', multiplier: 1.4 },
] as const;

export const ALL_GLASS_TYPES = [...GLASS_TYPES, ...RETIRED_GLASS_TYPES] as const;

/** One print finish, so it is not a question either. */
export const PRINT_FINISHES = [
  { value: 'matte', label: 'Matte', description: 'Soft, non-reflective, archival', multiplier: 1 },
] as const;

export const RETIRED_PRINT_FINISHES = [
  { value: 'glossy', label: 'Glossy', description: 'Deep contrast, vivid tone', multiplier: 1.08 },
] as const;

export const ALL_PRINT_FINISHES = [...PRINT_FINISHES, ...RETIRED_PRINT_FINISHES] as const;

/**
 * One print per photograph. Always.
 *
 * A quantity stepper on a photograph asks how many copies of the same picture
 * you want on one wall, and the answer is one - that is the whole premise of a
 * curated collection. The stepper is gone from the configurator and the cart,
 * and this is the constant that says so.
 */
export const QUANTITY_PER_PHOTOGRAPH = 1;

/**
 * The smallest collection ARTINU will print - three photographs.
 *
 * With one print per photograph this is now a count of DIFFERENT PHOTOGRAPHS in
 * the cart, not a count of copies, so the wording that goes with it changed too:
 * "add two more photographs", never "increase the quantity".
 */
export const MIN_ORDER_QUANTITY = 3;

/**
 * ── The rental tariff ───────────────────────────────────────────────────────
 *
 * ARTINU does not sell frames. A space subscribes, the frame is installed and
 * stays, the PHOTOGRAPH inside it is changed every month, and when the
 * subscription ends both the frame and the print come back. So the price is a
 * MONTHLY RATE PER FRAME, not a one-off cost of goods.
 *
 * Transcribed from the CEO's pricing documents (A3/A4 space tariff and A3/A4
 * home-decor tariff). Those documents are the authority; nothing here is
 * derived or rounded.
 *
 * ── How a rate is chosen ────────────────────────────────────────────────────
 *
 *   book   'standard' for a café, restaurant, hotel, office - anywhere the
 *          frames hang in a business. 'home_decor' is its own, cheaper book
 *          with no commitment terms and no tier past four frames.
 *   size   'a3' or 'a4'. Adding a size later is a row here, not a code change.
 *   term   how long the space commits for. A longer commitment buys a lower
 *          monthly rate; it does NOT change how often the photograph rotates,
 *          which is monthly in every case. Only 'monthly' is sold today.
 *   count  how many frames the space takes.
 *
 * ── The tier applies to EVERY frame ─────────────────────────────────────────
 *
 * Not graduated. Four A3 frames on the home tariff are 4 x 259, not
 * 289+279+269+259. The documents pin this down by printing both the per-frame
 * rate and the total, and all eight rows agree with uniform pricing.
 *
 * Index is (count - 1). Beyond the end of a row the last (best) rate holds,
 * because the alternative - refusing to price a thirteenth frame - is worse
 * than charging the twelfth-frame rate for it.
 */
export const RENTAL_TARIFF = {
  standard: {
    a3: {
      monthly:   [429, 399, 369, 359, 329, 316.5, 310, 305, 299.89, 289, 282, 274.92],
      quarterly: [429, 399, 369, 349, 319, 299, 289, 284, 279, 269, 264, 259],
      biannual:  [429, 399, 369, 339, 304, 283.17, 273, 267, 261, 254, 247, 241.58],
    },
    a4: {
      monthly:   [299, 269, 239, 219, 215, 211, 207, 203, 199, 195, 192, 189],
      quarterly: [289, 259, 229, 209, 205, 201, 197, 193, 189, 185, 182, 179],
      biannual:  [279, 249, 219, 199, 195, 191, 187, 183, 179, 175, 172, 169],
    },
  },
  /*
    The home tariff has one column. The documents give no 3-month or 6-month
    rate for a home, so none is invented - a term other than 'monthly' falls
    back to the monthly column rather than guessing a discount.
  */
  home_decor: {
    a3: { monthly: [289, 279, 269, 259] },
    a4: { monthly: [229, 219, 209, 199] },
  },
} as const;

/**
 * Commitment terms. Only month-to-month is sold today - "every one month we are
 * starting it right now" - but the rates for the longer two are documented and
 * transcribed, so switching one on is a change here and nowhere else.
 */
export const SUBSCRIPTION_TERMS = [
  { value: 'monthly', label: 'Month to month', months: 1, offered: true },
  { value: 'quarterly', label: '3 months', months: 3, offered: false },
  { value: 'biannual', label: '6 months', months: 6, offered: false },
] as const;

/** Spaces priced from the home book. Everything else uses 'standard'. */
export const HOME_TARIFF_SPACE_TYPES = ['home_decor'] as const;

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
  /**
   * A component of the frame price. NOT paid to anyone.
   *
   * It was named for a licence fee that was passed through to the
   * photographer. ARTINU does not pay photographers - there is no fee, no
   * share and no payout - so nothing is passed through and the name is all
   * that is left of that idea.
   *
   * The amount is deliberately unchanged. It is ₹1,200 of the ₹3,299 a frame
   * currently costs, and zeroing it here would quietly cut every price by a
   * third on the next deploy. It goes away with the switch to the rental
   * tariff, which replaces this whole calculation rather than editing it.
   */
  ARTWORK_LICENSE_FEE: 1200,
  /**
   * Zero, and it stays zero.
   *
   * What a photographer gets is their work printed, framed, hung on a real
   * wall, and an email telling them which wall and under which Photo ID.
   * There is no money in it, in either direction, and nothing in the system
   * should compute a sum that implies otherwise.
   */
  ARTIST_COMMISSION_RATE: 0,
  /**
   * GST is NOT charged yet, and this rate is not what decides that -
   * GST_REGISTERED below is. ARTINU has applied for a GSTIN and does not have
   * one, and adding tax to an invoice you cannot legally issue tax on is worse
   * than quoting a price that later goes up. Flip the flag on the day the
   * number arrives and every quote, cart, checkout and invoice picks it up.
   */
  GST_RATE: 0.18,
  /**
   * Registered for GST? Until this is true no order carries tax and no total
   * shows a GST line. Turning it on is the whole change.
   */
  GST_REGISTERED: false,
  /**
   * Delivery is included in the quoted price, so no line is added and none is
   * shown. The old behaviour - ₹450, waived over ₹25,000 - stayed in the
   * codebase long enough to appear on a quote as "exclusive of delivery", which
   * is the opposite of what a space owner is now told.
   */
  DELIVERY_CHARGE: 0,
  DELIVERY_INCLUDED: true,
  /** Retained only so an existing order that was charged delivery still reads back. */
  LEGACY_DELIVERY_CHARGE: 450,
  /** Waived above this order subtotal. Unused while delivery is included. */
  FREE_DELIVERY_THRESHOLD: 25000,
  /**
   * Installation is not billed. It is a day in the calendar, not a line on the
   * invoice: the crew hangs the collection when it is delivered, and the price
   * already covers it.
   */
  /**
   * Installation is charged ONCE PER ORDER, never per frame.
   *
   * The old constant was named `_PER_FRAME` and multiplied by the total
   * quantity, which is the whole trap: it reads as correct, and it was
   * harmless only because the rate was zero. Set that rate to 149 and an order
   * of three photographs is billed 447 for one visit by one person to one
   * wall. The crew goes to the space once; the charge follows the visit, not
   * the frame count.
   *
   * Keyed by where they are going, because the two are priced differently.
   * A space with no type recorded is not charged rather than guessed at.
   */
  INSTALLATION_CHARGE_PER_ORDER: {
    cafe: 149,
    home: 99,
  } as Record<string, number>,
  /** Retained so an order that WAS charged per frame still reads back. */
  LEGACY_INSTALLATION_CHARGE_PER_FRAME: 250,
  /** Refundable deposit charged on rotation subscriptions. */
  SECURITY_DEPOSIT_PER_FRAME: 500,
  CURRENCY: 'INR',
  CURRENCY_SYMBOL: '₹',
} as const;

/**
 * Rotation cadence offered to spaces, in months.
 *
 * Monthly only. Two and three months were offered from the start and neither is
 * being sold: every space ARTINU is signing rotates every month, and a choice
 * nobody makes is a choice that only slows the sign-up down. The array shape is
 * kept - RegisterSpacePage maps over it and the zod schema validates against it
 * - so putting a cadence back is a one-line change here and nowhere else.
 */
export const ROTATION_INTERVALS = [1] as const;

/**
 * How far a space owner may move a rotation date, in days, either way.
 *
 * The point is a small courtesy, not a booking system: a café that is closed on
 * a Tuesday, or has a private event on the day the crew was coming, can nudge
 * it. Anything larger than this is a conversation, because it means re-planning
 * a route and a print run, and it should go through the team rather than
 * through a button.
 *
 * The bound is measured from the date the cycle was ORIGINALLY due, not from
 * wherever it currently sits - see `rescheduledFrom` on RotationCycle. Without
 * that anchor, five taps of "+2 days" is a fortnight.
 */
export const ROTATION_RESCHEDULE_WINDOW_DAYS = 2;

/**
 * Cadences withdrawn but still valid for spaces already on them, so an existing
 * record does not fail validation the moment it is edited.
 */
export const LEGACY_ROTATION_INTERVALS = [2, 3] as const;
export const ALL_ROTATION_INTERVALS = [...ROTATION_INTERVALS, ...LEGACY_ROTATION_INTERVALS] as const;

// ── Brand / contact ──────────────────────────────────────────────────────────

export const CONTACT = {
  phone: '+91 96060 10193',
  phoneRaw: '919606010193',
  email: 'hello@artinu.in',
  /*
    One inbox, not two.

    support@ was a second address nobody was reading - a space owner writing to
    it from the dashboard got no reply, which is worse than showing no address
    at all. Everything now goes to hello@, which is monitored.
  */
  supportEmail: 'hello@artinu.in',
  address: {
    line1: '',
    line2: '',
    city: '',
    state: '',
    pin: '',
    country: '',
  },
  hours: [
    { days: 'Monday - Friday', time: '9:30 AM - 6:30 PM' },
    { days: 'Saturday', time: '10:00 AM - 4:00 PM' },
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

/**
 * Who a broadcast can be addressed to.
 *
 * Either one role, or one of the two groupings below. Deliberately not free-form
 * — a notification sent to the wrong audience cannot be recalled, so the choice
 * is a fixed list rather than a query somebody assembles in a text box.
 *
 * Suspended accounts are excluded from every audience by the server.
 */
export const ANNOUNCEMENT_AUDIENCES = [
  'artist',
  'space_owner',
  'guest',
  'ceo',
  'manager',
  'accounts',
  'operations',
  'it_team',
  'all_customers',
  'all_internal',
  'everyone',
] as const;

export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  artist: 'Artists',
  space_owner: 'Space owners',
  guest: 'ArtPhiles',
  ceo: 'CEO',
  manager: 'Managers',
  accounts: 'Accounts',
  operations: 'Operations',
  it_team: 'IT team',
  all_customers: 'Everyone outside the company',
  all_internal: 'All staff',
  everyone: 'Every account',
};

/** Which roles each audience expands to. Kept here so both sides agree. */
export const ANNOUNCEMENT_AUDIENCE_ROLES: Record<AnnouncementAudience, readonly string[]> = {
  artist: ['artist'],
  space_owner: ['space_owner'],
  guest: ['guest'],
  ceo: ['ceo'],
  manager: ['manager'],
  accounts: ['accounts'],
  operations: ['operations'],
  it_team: ['it_team'],
  all_customers: ['artist', 'space_owner', 'guest'],
  all_internal: ['ceo', 'manager', 'accounts', 'operations', 'it_team'],
  everyone: [
    'artist',
    'space_owner',
    'guest',
    'ceo',
    'manager',
    'accounts',
    'operations',
    'it_team',
  ],
};

export const ANNOUNCEMENT_LIMITS = {
  title: { min: 3, max: 90 },
  body: { min: 3, max: 600 },
} as const;
