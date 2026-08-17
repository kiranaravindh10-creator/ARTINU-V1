import { z } from 'zod';
import {
  ART_STYLES,
  ARTWORK_COLORS,
  FRAME_COLORS,
  FRAME_MATERIALS,
  FRAME_SIZES,
  GALLERY_CATEGORIES,
  GLASS_TYPES,
  MIN_ORDER_QUANTITY,
  MOODS,
  OTP,
  PRINT_FINISHES,
  ROTATION_INTERVALS,
  SPACE_TYPES,
} from './constants.js';

/** Zod `enum` needs a non-empty tuple of literals; this rebuilds one from a readonly const array. */
const enumOf = <T extends readonly string[]>(values: T) =>
  z.enum(values as unknown as [T[number], ...T[number][]]);

/** Same idea for `{ value, label }` catalogues — keeps the literal union intact. */
const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((o) => o.value) as unknown as [T[number]['value'], ...T[number]['value'][]];

// ── Auth ────────────────────────────────────────────────────────────────────

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const signUpSchema = z
  .object({
    fullName: z.string().min(2, 'Enter your full name').max(120),
    email: z.string().email('Enter a valid email address'),
    password: passwordSchema,
    confirmPassword: z.string(),
    role: z.enum(['space_owner', 'artist', 'guest']),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'Please accept the terms to continue' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const phoneSignInSchema = z.object({
  phone: z.string().regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
});

/** Step 3 of the artist login flow — the emailed code on the diamond screen. */
export const otpVerifySchema = z.object({
  challengeId: z.string().min(1),
  code: z
    .string()
    .length(OTP.LENGTH, `Enter all ${OTP.LENGTH} digits`)
    .regex(/^\d+$/, 'Digits only'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

// ── Artist registration wizard (4 steps) ────────────────────────────────────

export const registerStep1Schema = z
  .object({
    fullName: z.string().min(2, 'Enter your full name').max(120),
    email: z.string().email('Enter a valid email address'),
    password: passwordSchema,
  })
  .describe('Create your account');

export const registerStep2Schema = z.object({
  artistName: z.string().min(2, 'Enter your professional name').max(120),
  location: z.string().min(2, 'Enter your city and country').max(160),
  website: z.string().url('Enter a valid URL').optional().nullable().or(z.literal('')),
  artStyle: enumOf(ART_STYLES),
});

export const registerStep3Schema = z.object({
  bio: z.string().max(500, 'Keep your bio under 500 characters').optional().nullable(),
  avatarBase64: z.string().optional().nullable(),
});

export const registerStep4Schema = z.object({
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Please accept the terms to create your account' }),
  }),
});

/** The whole wizard, submitted in one call once step 4 is confirmed. */
export const artistRegistrationSchema = registerStep1Schema
  .merge(registerStep2Schema)
  .merge(registerStep3Schema)
  .merge(registerStep4Schema);

/** Same wizard shape for a space owner signing up from the Spaces side. */
/**
 * No password field: ARTINU issues the space owner an ID and a password when
 * the space is registered (requirements §1), and hands both back once in the
 * registration response. Adding a password box here would be asking for a
 * credential the system is about to overwrite.
 */
export const spaceOwnerRegistrationSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name').max(120),
  email: z.string().email('Enter a valid email address'),
  spaceName: z.string().min(2, 'Enter your space name').max(160),
  spaceType: enumOf(SPACE_TYPES),
  city: z.string().min(2, 'Enter your city').max(120),
  phone: z.string().regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Please accept the terms to create your account' }),
  }),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ── Profile ─────────────────────────────────────────────────────────────────

export const profileUpdateSchema = z.object({
  fullName: z.string().min(2).max(120),
  displayName: z.string().max(120).optional().nullable(),
  phone: z
    .string()
    .regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number')
    .optional()
    .nullable()
    .or(z.literal('')),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  website: z.string().url('Enter a valid URL').optional().nullable().or(z.literal('')),
  instagram: z.string().max(60).optional().nullable(),
  genres: z.array(z.string()).max(3, 'Choose up to 3 genres').optional(),
  avatarUrl: z.string().optional().nullable(),
});

// ── Spaces ──────────────────────────────────────────────────────────────────

export const spaceSchema = z.object({
  name: z.string().min(2, 'Enter your space name').max(160),
  type: enumOf(SPACE_TYPES),
  theme: z.string().max(160).optional().nullable(),
  cuisine: z.string().max(160).optional().nullable(),
  wallColor: z.string().max(80).optional().nullable(),
  lighting: z.string().max(80).optional().nullable(),
  addressLine1: z.string().min(4, 'Enter the street address').max(200),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().min(2, 'Enter the city').max(120),
  state: z.string().max(120).optional().nullable(),
  pin: z
    .string()
    .regex(/^\d{6}$/, 'Enter a 6-digit PIN code')
    .optional()
    .nullable()
    .or(z.literal('')),
  contactName: z.string().min(2, 'Enter a contact name').max(120),
  contactPhone: z.string().regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
  contactEmail: z.string().email('Enter a valid email address'),
  wallCount: z.coerce.number().int().min(1).max(200).optional().nullable(),
  imageUrls: z.array(z.string()).max(12).optional(),
  rotationIntervalMonths: z.coerce
    .number()
    .refine((n) => (ROTATION_INTERVALS as readonly number[]).includes(n), 'Choose a rotation cadence')
    .default(3),
});

// ── Artwork upload ──────────────────────────────────────────────────────────

export const artworkUploadSchema = z.object({
  title: z.string().min(2, 'Give this photograph a title').max(160),
  description: z.string().max(600).optional().nullable(),
  story: z.string().max(1500).optional().nullable(),
  category: enumOf(GALLERY_CATEGORIES).optional().default('street'),
  mood: z.array(enumOf(MOODS)).max(3, 'Choose up to 3 moods').default([]),
  colors: z.array(z.enum(values(ARTWORK_COLORS))).max(3).default([]),
  tags: z
    .array(z.string().min(2).max(30))
    .max(10, 'Up to 10 tags')
    .default([]),
  location: z.string().min(2, 'Enter the location where this was photographed').max(160),
  capturedAt: z.string().optional().nullable(),
  /** data:image/...;base64,... — the SDD's base64 upload flow. */
  imageBase64: z.string().min(32, 'Attach a photograph'),
  fileName: z.string().max(200).optional(),
});

export const artworkReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(600).optional().nullable(),
});

// ── Frames, cart, orders ────────────────────────────────────────────────────

export const frameConfigurationSchema = z.object({
  size: z.enum(values(FRAME_SIZES)),
  material: z.enum(values(FRAME_MATERIALS)),
  color: z.enum(values(FRAME_COLORS)),
  glass: z.enum(values(GLASS_TYPES)),
  finish: z.enum(values(PRINT_FINISHES)),
});

export const cartItemSchema = z.object({
  artworkId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(50),
  frame: frameConfigurationSchema,
});

export const createOrderSchema = z
  .object({
    spaceId: z.string().min(1, 'Choose which space this is for'),
    items: z.array(cartItemSchema).min(1, 'Your cart is empty'),
    couponCode: z.string().max(40).optional().nullable(),
    includeSecurityDeposit: z.boolean().default(false),
    notes: z.string().max(600).optional().nullable(),
  })
  .refine(
    (order) => order.items.reduce((sum, item) => sum + item.quantity, 0) >= MIN_ORDER_QUANTITY,
    {
      message: `A minimum of ${MIN_ORDER_QUANTITY} frames is required`,
      path: ['items'],
    },
  );

export const updateOrderStatusSchema = z.object({
  status: z.string().min(1),
  note: z.string().max(400).optional().nullable(),
});

export const updateOrderCostSchema = z.object({
  frame: z.number().min(0),
  printing: z.number().min(0),
  logistics: z.number().min(0),
  misc: z.number().min(0),
});

// ── Payments ────────────────────────────────────────────────────────────────

export const createPaymentSchema = z.object({
  orderId: z.string().min(1),
});

export const verifyPaymentSchema = z.object({
  paymentId: z.string().min(1),
  /** Provider reference — the UTR for UPI, the gateway payment id otherwise. */
  reference: z.string().max(120).optional().nullable(),
  /** Dev affordance so the QR flow can be walked end-to-end without a real payment. */
  simulate: z.enum(['success', 'failure']).optional(),
});

// ── Consultation & artist application (public forms) ────────────────────────

export const consultationSchema = z.object({
  name: z.string().min(2, 'Enter your name').max(120),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
  spaceType: enumOf(SPACE_TYPES),
  location: z.string().min(2, 'Enter your city or area').max(160),
  message: z.string().max(1000).optional().nullable(),
  mode: z.enum(['video', 'in_person']),
  preferredDate: z.string().min(1, 'Choose a date'),
  preferredSlot: z.string().min(1, 'Choose a time slot'),
});

export const artistApplicationSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name').max(120),
  email: z.string().email('Enter a valid email address'),
  location: z.string().min(2, 'Enter your city, state or country').max(160),
  website: z.string().url('Enter a valid URL').optional().nullable().or(z.literal('')),
  instagram: z.string().max(60).optional().nullable(),
  journey: z
    .string()
    .min(40, 'Tell us a little more — at least 40 characters')
    .max(1000, 'Keep this under 1000 characters'),
  genres: z.array(z.string()).min(1, 'Choose at least one genre').max(3, 'Choose up to 3 genres'),
  goals: z.string().max(500).optional().nullable(),
  referral: z.string().max(120).optional().nullable(),
  portfolioUrls: z
    .array(z.string())
    .min(6, 'Upload at least 6 photographs')
    .max(15, 'Upload no more than 15 photographs'),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm before submitting' }),
  }),
});

export const supportTicketSchema = z.object({
  subject: z.string().min(4, 'Enter a subject').max(160),
  category: z.enum(['order', 'installation', 'billing', 'account', 'other']),
  message: z.string().min(10, 'Tell us what happened').max(2000),
});

// ── Gallery query ───────────────────────────────────────────────────────────

/**
 * Facets arrive as `?mood=warm,moody` or repeated `?mood=warm&mood=moody`.
 * Both normalise to a string[] so the client can build either form.
 */
const facetList = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(','));
  return String(value).split(',');
}, z.array(z.string().min(1)).default([]));

export const galleryQuerySchema = z.object({
  q: z.string().max(120).optional(),
  category: facetList,
  mood: facetList,
  colors: facetList,
  orientation: facetList,
  suitableFor: facetList,
  artistId: z.string().optional(),
  ids: facetList,
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  sort: z.enum(['latest', 'popular', 'price_asc', 'price_desc']).default('latest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

// ── Inferred form types ─────────────────────────────────────────────────────

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type PhoneSignInInput = z.infer<typeof phoneSignInSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type RegisterStep1Input = z.infer<typeof registerStep1Schema>;
export type RegisterStep2Input = z.infer<typeof registerStep2Schema>;
export type RegisterStep3Input = z.infer<typeof registerStep3Schema>;
export type ArtistRegistrationInput = z.infer<typeof artistRegistrationSchema>;
export type SpaceOwnerRegistrationInput = z.infer<typeof spaceOwnerRegistrationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type SpaceInput = z.infer<typeof spaceSchema>;
export type ArtworkUploadInput = z.infer<typeof artworkUploadSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ConsultationInput = z.infer<typeof consultationSchema>;
export type ArtistApplicationInput = z.infer<typeof artistApplicationSchema>;
export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
export type GalleryQuery = z.infer<typeof galleryQuerySchema>;
