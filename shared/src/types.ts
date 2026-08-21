import type {
  WarningCategory,
  RemovalRequestStatus,
  ART_STYLES,
  ARTWORK_COLORS,
  ARTWORK_STATUSES,
  MOODS,
  FRAME_COLORS,
  FRAME_MATERIALS,
  FRAME_SIZES,
  GALLERY_CATEGORIES,
  GLASS_TYPES,
  INSTALLATION_STATUSES,
  NOTIFICATION_TYPES,
  ORDER_STATUSES,
  ORIENTATIONS,
  PAYMENT_STATUSES,
  PRINT_FINISHES,
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

export type FrameSize = (typeof FRAME_SIZES)[number]['value'];
export type FrameMaterial = (typeof FRAME_MATERIALS)[number]['value'];
export type FrameColor = (typeof FRAME_COLORS)[number]['value'];
export type GlassType = (typeof GLASS_TYPES)[number]['value'];
export type PrintFinish = (typeof PRINT_FINISHES)[number]['value'];

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
  /** Why the account was suspended or banned, shown to the person it happened to. */
  statusReason?: string | null;
  statusChangedAt?: string | null;
  statusChangedBy?: string | null;
  /** Set when the 10-day or 96-day sweep has already warned this account, so it is not warned again. */
  inactivityWarnedAt?: string | null;
  inactivityReviewedAt?: string | null;
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
  /**
   * Which Community Guidelines version this photographer accepted, and when.
   * Null on accounts created before acceptance was recorded.
   */
  guidelinesVersion?: string | null;
  guidelinesAcceptedAt?: string | null;
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
  /** Watermarked / display resolution — safe to show publicly. */
  imageUrl: string;
  thumbnailUrl: string;
  /** Only served after a successful order (requirements: watermarking). */
  originalUrl?: string | null;
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
  provider: 'mock_qr' | 'razorpay' | 'stripe';
  amount: number;
  currency: string;
  status: PaymentStatus;
  /** Payload encoded into the dynamic QR (UPI intent string). */
  qrPayload?: string | null;
  qrImageDataUrl?: string | null;
  reference: string;
  expiresAt?: string | null;
  attempts: number;
  failureReason?: string | null;
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
   * Where the photographer is based, resolved from their profile by the same
   * endpoint. Shown under the credit in the hero. Null when the profile has no
   * city set — the line then carries the name alone rather than a placeholder.
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

/**
 * One warning against a photographer's account (Community Guidelines §12).
 *
 * A row rather than a counter: "three warnings" is only meaningful if each one
 * can be shown to the person who received it and to whoever reviews the account
 * later. `number` is fixed at issue time so the sequence reads correctly even
 * if an earlier warning is withdrawn.
 */
export interface Warning {
  id: string;
  userId: string;
  number: number;
  category: WarningCategory;
  reason: string;
  notes?: string | null;
  /** The submission that prompted it, when there was one. */
  artworkId?: string | null;
  issuedBy?: string | null;
  issuedByEmail?: string | null;
  acknowledged: boolean;
  createdAt: string;
}

/**
 * A request to take a photograph down, or to close an account (§11, §19–21).
 *
 * `installationActive` and `physicallyRemovedAt` exist because the guideline
 * ties the deadline to a physical event: a piece that is hanging in a café
 * stays up until it comes down, and only then does the five-day clock
 * (`processBy`) start.
 */
export interface RemovalRequest {
  id: string;
  userId: string;
  artworkId?: string | null;
  kind: 'artwork' | 'account';
  status: RemovalRequestStatus;
  reason?: string | null;
  installationActive: boolean;
  physicallyRemovedAt?: string | null;
  processBy?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  notes?: string | null;
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
