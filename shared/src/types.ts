import type {
  ART_STYLES,
  ARTWORK_COLORS,
  ARTWORK_STATUSES,
  MOODS,
  ALL_FRAME_COLORS,
  ALL_FRAME_MATERIALS,
  ALL_FRAME_SIZES,
  GALLERY_CATEGORIES,
  ALL_GLASS_TYPES,
  INSTALLATION_STATUSES,
  NOTIFICATION_TYPES,
  ORDER_STATUSES,
  ORIENTATIONS,
  PAYMENT_STATUSES,
  ALL_PRINT_FINISHES,
  ROLES,
  ROTATION_STATUSES,
  SPACE_TYPES,
  USER_STATUSES,
  VALIDATION_CHECKS,
} from './constants.js';

export type Role = (typeof ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number];
export type ValidationCheck = (typeof VALIDATION_CHECKS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type InstallationStatus = (typeof INSTALLATION_STATUSES)[number];
export type RotationStatus = (typeof ROTATION_STATUSES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type SpaceType = (typeof SPACE_TYPES)[number];
export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type Mood = (typeof MOODS)[number];
export type ArtworkColor = (typeof ARTWORK_COLORS)[number]['value'];
export type ArtStyle = (typeof ART_STYLES)[number];

/*
  These five unions are derived from the ALL_ lists, not from the offered ones.

  A FrameConfiguration is a record of what someone bought, and orders in the
  database hold sizes and finishes that are no longer for sale. Typing these
  against the offered lists would make every historical order a type error and
  would push the codebase towards `as` casts at each read site. Offered-only is
  a UI concern, and it belongs in the component that renders the choices.
*/
export type FrameSize = (typeof ALL_FRAME_SIZES)[number]['value'];
export type FrameMaterial = (typeof ALL_FRAME_MATERIALS)[number]['value'];
export type FrameColor = (typeof ALL_FRAME_COLORS)[number]['value'];
export type GlassType = (typeof ALL_GLASS_TYPES)[number]['value'];
export type PrintFinish = (typeof ALL_PRINT_FINISHES)[number]['value'];

// ── Identity ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  /**
   * True while the account is still on a password ARTINU generated rather than
   * one the person chose. A password we issued is a password we have seen, so
   * it is a hand-over credential and the first sign-in must replace it.
   */
  mustChangePassword?: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface Profile {
  id: string;
  userId: string;
  fullName: string;
  displayName?: string | null;
  phone?: string | null;
  /** YYYY-MM-DD, collected at registration. Absent on accounts created before it was asked for. */
  dateOfBirth?: string | null;
  avatarUrl?: string | null;
  /** Artist-only hero/backdrop image, stored independently from portfolio work. */
  coverUrl?: string | null;
  city?: string | null;
  country?: string | null;
  bio?: string | null;
  website?: string | null;
  instagram?: string | null;
  /** Artist-only: genres they shoot. */
  genres?: string[];
  /** Artist-only: public profile slug (e.g., "jane-doe-photography"). */
  slug?: string | null;
  /** Denormalized counters for follow system. */
  followersCount?: number;
  followingCount?: number;
  /**
   * Artist-only: permanent 3-letter photographer code (e.g. "KIR"). Backend
   * assigned once and never reused after an account is deactivated.
   */
  photographerCode?: string | null;
  /** Artist-only: next sequential photo number, starting at 1, never reset. */
  nextPhotoNumber?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  accessToken: string;
  expiresAt: string;
  user: User;
  profile: Profile | null;
}

// ── Spaces ──────────────────────────────────────────────────────────────────

export interface Space {
  id: string;
  ownerId: string;
  /**
   * The ID ARTINU issues when the space is registered, e.g. `SPC-0001`
   * (requirements §1). Permanent, unique, and quoted on paperwork and in
   * support. Null only on rows created before the code column existed and not
   * yet backfilled.
   */
  code?: string | null;
  name: string;
  type: SpaceType;
  /** Interior theme, used by the recommendation engine. */
  theme?: string | null;
  cuisine?: string | null;
  wallColor?: string | null;
  lighting?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state?: string | null;
  pin?: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  wallCount?: number | null;
  imageUrls: string[];
  rotationIntervalMonths: number;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Artworks ────────────────────────────────────────────────────────────────

export interface ArtworkValidationResult {
  check: ValidationCheck;
  passed: boolean;
  /**
   * What a failure means:
   *   pass    — nothing to do
   *   warning — publishable, but a human should look (advisory only)
   *   fail    — blocks publication outright
   * Deliberately not a confidence score: these checks are heuristics, and a
   * percentage nobody calibrated reads as precision that does not exist.
   */
  severity: 'pass' | 'warning' | 'fail';
  detail: string;
}

/**
 * Pixel width -> public url for a resized copy of a photograph.
 *
 * Keys are stringified numbers because this round-trips through JSON and a
 * jsonb column, where object keys are always strings. Read them with
 * `variantWidths()` in media.ts rather than parsing them at each call site.
 */
export type ImageVariants = Record<string, string>;

export interface Artwork {
  id: string;
  artistId: string;
  title: string;
  description?: string | null;
  story?: string | null;
  category: GalleryCategory;
  /** Gallery facets: mood, dominant palette, and the spaces it suits. */
  mood: Mood[];
  colors: ArtworkColor[];
  suitableFor: SpaceType[];
  tags: string[];
  /**
   * The largest screen-sized copy (1600px WebP). What the lightbox opens.
   *
   * Before variants existed this held the photographer's original file, so
   * rows created earlier still do until they are backfilled.
   */
  imageUrl: string;
  /** The smallest screen-sized copy (400px WebP). What a grid tile loads. */
  thumbnailUrl: string;
  /**
   * The photographer's file, untouched and full resolution.
   *
   * This is what gets PRINTED, so it is never replaced by a derivative. Null on
   * rows uploaded before variants existed, where `imageUrl` is the original.
   */
  originalUrl?: string | null;
  /**
   * Screen-sized copies, as pixel width -> public WebP url.
   *
   * Null or absent whenever derivatives could not be made - an old row, an
   * animated GIF, a source too small to be worth resizing, or sharp being
   * unavailable on the host. Every consumer must treat that as normal and fall
   * back to `thumbnailUrl`; it is not an error state.
   */
  imageVariants?: ImageVariants | null;
  orientation: Orientation;
  width: number;
  height: number;
  dominantColor: string;
  location?: string | null;
  capturedAt?: string | null;
  /** Public Photo ID (e.g. "KIR001") — photographer code + sequential number. */
  photoId?: string | null;
  /** The sequential component of photoId (001 → 1). Never reused. */
  photoNumber?: number | null;
  status: ArtworkStatus;
  validation: ArtworkValidationResult[];
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  views: number;
  likes: number;
  selections: number;
  /** Cheapest complete configuration — the "Starting price" on the detail screen. */
  priceFrom: number;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Artwork joined with the artist's public profile — what the gallery renders. */
export interface ArtworkWithArtist extends Artwork {
  artist: PublicArtist;
  /** Present only for signed-in space owners. */
  wishlisted?: boolean;
}

export interface PublicArtist {
  id: string;
  slug: string;
  name: string;
  city?: string | null;
  country?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  bio?: string | null;
  genres: string[];
  artworkCount: number;
  likes: number;
  spacesCount: number;
  followers: number;
  followingCount: number;
  verified: boolean;
  featured: boolean;
  website?: string | null;
  instagram?: string | null;
  /** Artist-only: permanent 3-letter photographer code (e.g. "KIR"). */
  photographerCode?: string | null;
  achievements?: ArtistAchievement[];
  collections?: ArtistCollection[];
  /** Present only for signed-in viewers. */
  following?: boolean;
}

export interface ArtistAchievement {
  id: string;
  title: string;
  detail: string;
  year: string;
}

export interface ArtistCollection {
  id: string;
  title: string;
  description?: string | null;
  coverUrl: string;
  artworkIds: string[];
}

export interface WishlistEntry {
  id: string;
  userId: string;
  artworkId: string;
  createdAt: string;
}

// ── Orders ──────────────────────────────────────────────────────────────────

export interface FrameConfiguration {
  size: FrameSize;
  material: FrameMaterial;
  color: FrameColor;
  glass: GlassType;
  finish: PrintFinish;
}

export interface CartItem {
  artworkId: string;
  quantity: number;
  frame: FrameConfiguration;
}

export interface OrderItem extends CartItem {
  id: string;
  artworkTitle: string;
  artworkImageUrl: string;
  artistId: string;
  artistName: string;
  unitPrice: number;
  framePrice: number;
  printPrice: number;
  licensePrice: number;
  lineTotal: number;
  artistCommission: number;
}

export interface PriceBreakdown {
  /** Artwork licence fees across all items. */
  artworkTotal: number;
  frameTotal: number;
  printingTotal: number;
  subtotal: number;
  discount: number;
  couponCode?: string | null;
  gst: number;
  delivery: number;
  installation: number;
  securityDeposit: number;
  total: number;
  quantity: number;
}

/** Cost tracking for admin margin analysis — filled in post-order. */
export interface CostBreakdown {
  frame: number;
  printing: number;
  logistics: number;
  misc: number;
  total: number;
  margin: number;
  marginPercent: number;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  at: string;
  note?: string | null;
  by?: string | null;
}

export interface Order {
  id: string;
  reference: string;
  spaceId: string;
  ownerId: string;
  items: OrderItem[];
  pricing: PriceBreakdown;
  cost?: CostBreakdown;
  status: OrderStatus;
  timeline: OrderTimelineEntry[];
  paymentId?: string | null;
  invoiceId?: string | null;
  installationId?: string | null;
  notes?: string | null;
  placedAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

// ── Payments ────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  orderId: string;
  /**
   * `manual` means the money did not come through a gateway - cash, a bank
   * transfer, a UPI payment straight to the account - and a member of staff
   * recorded it. It is a real, reconcilable state, not a test value, and it is
   * why `reference` matters more for these than for gateway payments: it is
   * the only handle finance has when matching the bank statement.
   */
  provider: 'mock_qr' | 'razorpay' | 'stripe' | 'manual';
  amount: number;
  currency: string;
  status: PaymentStatus;
  /** Payload encoded into the dynamic QR (UPI intent string). Mock provider only. */
  qrPayload?: string | null;
  qrImageDataUrl?: string | null;
  reference: string;
  /**
   * The gateway's own order identifier — `order_xxx` for Razorpay.
   *
   * Stored because signature verification needs it and the client must not be
   * the one to supply it: the signature is computed over
   * `gatewayOrderId|gatewayPaymentId`, so accepting the order id from the
   * request would let a caller present a matched pair from a different, cheaper
   * order and have it verify.
   */
  gatewayOrderId?: string | null;
  /** The gateway's payment identifier, known only once the customer has paid. */
  gatewayPaymentId?: string | null;
  /**
   * How the customer says they paid - 'gpay', 'upi' or 'bank'.
   *
   * Set by the customer when they submit their reference, and it exists for
   * one reason: whoever reconciles the payment has to know WHERE to look. A
   * transaction id on its own does not say whether it will appear in the
   * Google Pay ledger or on the bank statement.
   *
   * Optional because it is only ever present on a manually-verified payment,
   * and because rows written before this column existed do not have it.
   */
  paidVia?: string | null;
  expiresAt?: string | null;
  attempts: number;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A discount code, stored rather than compiled in.
 *
 * These used to be three entries in a `COUPONS` object in pricing.ts, which
 * meant a manager could not create one, change one or switch one off without a
 * deploy - and one of them still carried the old brand name in the code
 * customers typed. They live in the database now.
 *
 * ── On money ────────────────────────────────────────────────────────────────
 *
 * `value` is read against `type`: a percentage of the subtotal, or a flat
 * number of rupees off it. A flat discount is capped at the subtotal so an
 * order can never total less than zero, and a percentage is capped by
 * `maxDiscount` when one is set.
 */
export interface Coupon {
  id: string;
  /** Always upper case. What the customer types. */
  code: string;
  type: 'percent' | 'flat';
  /** Percent (0-100) when type is 'percent'; rupees when 'flat'. */
  value: number;
  /** Shown to the customer when it applies. */
  label: string;
  active: boolean;
  /** Optional window. Null on either side means unbounded that way. */
  startsAt?: string | null;
  expiresAt?: string | null;
  /** Order subtotal the coupon needs before it applies. */
  minOrderAmount?: number | null;
  /** Ceiling on a percentage discount. Ignored for flat coupons. */
  maxDiscount?: number | null;
  /** Space types it applies to. Empty means every category. */
  categories?: string[] | null;
  /** How many times it may be used in total. Null is unlimited. */
  usageLimit?: number | null;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  number: string;
  orderId: string;
  spaceId: string;
  ownerId: string;
  amount: number;
  gst: number;
  issuedAt: string;
  pdfUrl?: string | null;
}

// ── Installations & rotation ────────────────────────────────────────────────

export interface Installation {
  id: string;
  orderId: string;
  spaceId: string;
  scheduledFor: string;
  installationWindow?: string | null;
  status: InstallationStatus;
  technician?: string | null;
  notes?: string | null;
  completedAt?: string | null;
}

export interface RotationCycle {
  id: string;
  spaceId: string;
  cycleNumber: number;
  currentArtworkIds: string[];
  proposedArtworkIds: string[];
  status: RotationStatus;
  dueAt: string;
  /**
   * Where `dueAt` sat before the owner first moved it, or null if they never
   * have.
   *
   * This is the anchor the +/- window is measured against, so that repeated
   * shifts cannot walk the date away a couple of days at a time. It is also the
   * only record of what the date was supposed to be, which is what the
   * operations team needs when a route has already been planned around it.
   */
  rescheduledFrom?: string | null;
  approvedAt?: string | null;
  installedAt?: string | null;
  createdAt: string;
}

// ── Notifications, payouts, support ─────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  read: boolean;
  archived: boolean;
  createdAt: string;
}

export interface Payout {
  id: string;
  artistId: string;
  orderId?: string | null;
  amount: number;
  status: 'pending' | 'processing' | 'paid';
  periodLabel: string;
  paidAt?: string | null;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  message: string;
  category: 'order' | 'installation' | 'billing' | 'account' | 'other';
  status: 'open' | 'in_progress' | 'resolved';
  reply?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultationRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  spaceType: SpaceType;
  location: string;
  message?: string | null;
  mode: 'video' | 'in_person';
  preferredDate: string;
  preferredSlot: string;
  status: 'new' | 'scheduled' | 'completed' | 'cancelled';
  createdAt: string;
}

// ── UI Content ──────────────────────────────────────────────────────────────

export interface UiContentRecord {
  id: string; // 'homepage_hero', 'dashboard_cafes', 'featured_artists', 'gallery_top_20'
  data: any;
  updatedAt: string;
}

// ── Manager-Controlled Content ────────────────────────────────────────────────

export interface HeroSlide {
  id: string;
  imageUrl: string;
  /**
   * The photographer credited under the slide. Null when there is nobody to
   * credit — a room shot, a partner's photograph — in which case the homepage
   * shows no byline rather than an invented one.
   */
  photographerId: string | null;
  /**
   * Resolved by `/content-manager/hero-slides/active` so the homepage can
   * credit the photographer by name. Null when the profile no longer exists —
   * the credit is then omitted rather than falling back to the raw id.
   */
  photographerName?: string | null;
  /**
   * Where that photographer works, as "City, Country".
   *
   * Resolved by the same endpoint as the name and shown under it on the hero.
   * The field was live - the deployed API returns "Hosur, India" today - but had
   * fallen out of this interface, so the homepage could not read it without a
   * type error. Null when the profile is gone or has no city recorded, in which
   * case the second line is omitted rather than printed empty.
   */
  photographerLocation?: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * How the homepage slideshow plays.
 *
 * The photographs themselves are rows in `hero_slides`, which the console has
 * always been able to add to, reorder and hide. How they play was not editable
 * at all: the dwell was a `6000` in the homepage component, the cross-fade a
 * `1.2` next to it, and the slow zoom a hardcoded twenty-second scale. Asking
 * for a slower rotation meant a developer, a commit and a deploy.
 *
 * These live in `ui_content` under `homepage_slideshow` rather than in a table
 * of their own — one row of settings for one slideshow does not need a schema
 * migration, and `ui_content` is exactly the key/value store that already
 * exists for this. A missing or partial record falls back to
 * DEFAULT_SLIDESHOW_SETTINGS field by field, so the homepage plays correctly
 * before anyone has ever opened the settings panel.
 */
export interface SlideshowSettings {
  /** Advance on a timer. Off leaves the carousel entirely manual. */
  autoPlay: boolean;
  /** How long each photograph is held, in milliseconds. */
  intervalMs: number;
  /** Cross-fade, or push the next photograph in from the side. */
  transition: 'fade' | 'slide';
  /** Length of that transition, in milliseconds. */
  transitionMs: number;
  /** The slow push-in on the current photograph. */
  kenBurns: boolean;
  /** Hold the current photograph while the pointer is over the hero. */
  pauseOnHover: boolean;
  /** The row of upcoming photographs in the control strip. */
  showThumbnails: boolean;
  /** The previous/next arrows. */
  showArrows: boolean;
  /** The 01 / 08 counter and the photographer credit beside it. */
  showCounter: boolean;
  /** The line of copy in the right half of the control strip. */
  caption: string;
}

export interface FeaturedCollection {
  id: string;
  collectionId: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Cafe {
  id: string;
  name: string;
  photoUrl: string;
  description: string;
  /**
   * Where the collaboration card links to — the partner's own site. Null until
   * a manager enters one, and the card is then rendered as a plain card rather
   * than pointing anywhere. Never guessed from the name.
   */
  websiteUrl?: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CollaborationSlide {
  id: string;
  photographerId: string | null;
  imageUrl: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollaborationSlideInput {
  photographerId?: string | null;
  imageUrl: string;
  order?: number;
  isActive?: boolean;
}

export interface UpdateCollaborationSlideInput {
  photographerId?: string | null;
  imageUrl?: string;
  order?: number;
  isActive?: boolean;
}

export interface CreateHeroSlideInput {
  imageUrl: string;
  photographerId?: string | null;
  order?: number;
  isActive?: boolean;
}

export interface UpdateHeroSlideInput {
  imageUrl?: string;
  photographerId?: string | null;
  order?: number;
  isActive?: boolean;
}

export interface CreateFeaturedCollectionInput {
  collectionId: string;
  order?: number;
  isActive?: boolean;
}

export interface UpdateFeaturedCollectionInput {
  collectionId?: string;
  order?: number;
  isActive?: boolean;
}

export interface CreateCafeInput {
  name: string;
  photoUrl: string;
  description: string;
  websiteUrl?: string | null;
  order?: number;
  isActive?: boolean;
}

export interface UpdateCafeInput {
  name?: string;
  photoUrl?: string;
  description?: string;
  websiteUrl?: string | null;
  order?: number;
  isActive?: boolean;
}

export interface ArtistApplication {
  id: string;
  fullName: string;
  email: string;
  location: string;
  website?: string | null;
  instagram?: string | null;
  journey: string;
  genres: string[];
  goals?: string | null;
  referral?: string | null;
  portfolioUrls: string[];
  status: 'submitted' | 'under_review' | 'accepted' | 'rejected';
  reviewNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
  createdAt: string;
}

// ── Analytics ───────────────────────────────────────────────────────────────

export interface TrendPoint {
  label: string;
  value: number;
}

export interface SpaceOwnerAnalytics {
  activeInstallations: number;
  currentCollectionSize: number;
  nextRotationAt: string | null;
  daysToRotation: number | null;
  orderCount: number;
  totalSpend: number;
  recentOrders: Order[];
}

export interface ArtistAnalytics {
  selectedWorks: number;
  activeInstallations: number;
  pendingReviews: number;
  approvedWorks: number;
  totalEarnings: number;
  pendingEarnings: number;
  unreadNotifications: number;
  monthlyEarnings: TrendPoint[];
}

export interface ConsoleAnalytics {
  revenue: number;
  revenueThisMonth: number;
  orders: number;
  pendingOrders: number;
  installations: number;
  artistGrowth: number;
  spaceGrowth: number;
  averageOrderValue: number;
  conversionRate: number;
  repeatCustomerRate: number;
  revenueTrend: TrendPoint[];
  ordersTrend: TrendPoint[];
  topSpaces: { id: string; name: string; orders: number; revenue: number }[];
  topArtists: { id: string; name: string; selections: number; earnings: number }[];
  popularArtworks: { id: string; title: string; selections: number; views: number }[];
  recentActivity: AuditLogEntry[];
}

// ── Transport ───────────────────────────────────────────────────────────────

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, string[]>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
