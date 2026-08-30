import { z } from 'zod';
import type { Space } from './types.js';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_LIMITS,
  ART_STYLES,
  ARTWORK_COLORS,
  DEFAULT_SLIDESHOW_SETTINGS,
  ALL_FRAME_COLORS,
  ALL_FRAME_MATERIALS,
  ALL_FRAME_SIZES,
  GALLERY_CATEGORIES,
  ALL_GLASS_TYPES,
  MIN_ORDER_QUANTITY,
  MOODS,
  OTP,
  ALL_PRINT_FINISHES,
  QUANTITY_PER_PHOTOGRAPH,
  ALL_ROTATION_INTERVALS,
  ROTATION_RESCHEDULE_WINDOW_DAYS,
  SLIDESHOW_LIMITS,
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

/**
 * One phone rule for every form that asks for one.
 *
 * The pattern accepts the shapes people actually type — +91 98765 43210,
 * (080) 4567 8901, 9876543210 — and the digit count is checked separately so
 * "+++++++" cannot pass a character-class test.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number')
  .refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }, 'Enter a valid phone number');

/**
 * Date of birth, as an `<input type="date">` hands it over: YYYY-MM-DD.
 *
 * Checked as a real calendar date rather than a pattern, so 2005-02-31 is
 * rejected. The floor of 13 is the age at which an account can be held at all;
 * the ceiling exists only to catch a mistyped year (1091 rather than 1991).
 */
export const dateOfBirthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day!));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month! - 1 &&
      date.getUTCDate() === day
    );
  }, 'Enter a valid date')
  .refine((value) => new Date(`${value}T00:00:00Z`).getTime() <= Date.now(), {
    message: 'Date of birth cannot be in the future',
  })
  .refine((value) => yearsSince(value) >= 13, 'You need to be at least 13 to join ARTINU')
  .refine((value) => yearsSince(value) <= 120, 'Please check the year');

/** Whole years between a YYYY-MM-DD date and today, in UTC. */
function yearsSince(value: string): number {
  const birth = new Date(`${value}T00:00:00Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const signUpSchema = z
  .object({
    fullName: z.string().min(2, 'Enter your full name').max(120),
    email: z.string().email('Enter a valid email address'),
    phone: phoneSchema,
    dateOfBirth: dateOfBirthSchema,
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
  phone: phoneSchema,
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
    phone: phoneSchema,
    dateOfBirth: dateOfBirthSchema,
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
  /**
   * Community Guidelines acknowledgement, separate from the Terms box.
   *
   * Two boxes rather than one because they are two documents with different
   * consequences: the Terms are a contract, the Guidelines are the rules a
   * photographer is agreeing to be moderated against. Bundling them would mean
   * ARTINU could not honestly say a photographer had read the Guidelines when
   * enforcing §12 against them.
   *
   * `z.literal(true)` refuses `false` and refuses a missing field, so the box
   * cannot ship pre-checked and cannot be skipped.
   */
  acceptGuidelines: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm you have read the Community Guidelines' }),
  }),
});

/** The whole wizard, submitted in one call once step 4 is confirmed. */
export const artistRegistrationSchema = registerStep1Schema
  .merge(registerStep2Schema)
  .merge(registerStep3Schema)
  .merge(registerStep4Schema);

/**
 * Space owner sign-up.
 *
 * The owner sets their own password. It used to be generated by the server,
 * returned once in the response, and shown once on a hand-over screen — never
 * emailed, never stored. Anyone who navigated away from that screen was locked
 * out permanently with no way back except a password reset, which is not a
 * sign-up flow anybody should ship.
 *
 * Staff accounts still work the other way round, and should: `create:staff`
 * hands over a credential ARTINU has seen, so it carries `mustChangePassword`
 * and has to be replaced. A password the owner invented has nobody to be
 * replaced for.
 */
export const spaceOwnerRegistrationSchema = z
  .object({
    fullName: z.string().min(2, 'Enter your full name').max(120),
    email: z.string().email('Enter a valid email address'),
    spaceName: z.string().min(2, 'Enter your space name').max(160),
    spaceType: enumOf(SPACE_TYPES),
    city: z.string().min(2, 'Enter your city').max(120),
    phone: phoneSchema,
    dateOfBirth: dateOfBirthSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'Please accept the terms to create your account' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
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
  /*
    At least one photograph, required.

    A space registered with no photograph of it is a row in a table: the
    curators cannot see the light, the wall colour or how high the ceiling is,
    so the first collection has to be guessed and then corrected on installation
    day. It was optional, and most rows had none.

    This applies on edit as well as create, deliberately - a space already
    registered without photographs is exactly the one the curators need
    photographs of, and the next edit is the moment to ask.
  */
  imageUrls: z
    .array(z.string())
    .min(1, 'Add at least one photograph of the space')
    .max(12),
  rotationIntervalMonths: z.coerce
    .number()
    .refine(
      (n) => (ALL_ROTATION_INTERVALS as readonly number[]).includes(n),
      'Choose a rotation cadence',
    )
    .default(3),
});

// ── Artwork upload ──────────────────────────────────────────────────────────

export const artworkUploadSchema = z.object({
  title: z.string().min(2, 'Give this photograph a title').max(160),
  description: z.string().max(600).optional().nullable(),
  /*
    Required, and the reason is the whole product.

    A photograph on an ARTINU wall carries a plate with the photographer's own
    words on it. Without a story that plate is a name and a QR against blank
    space, and the thing that makes an ARTINU print different from a poster is
    missing. It was optional, so most uploads arrived without one.

    Twenty characters, not one: "nice" satisfies a non-empty check and says
    nothing to somebody standing in front of the print.
  */
  story: z
    .string()
    .trim()
    .min(20, "Tell us what this photograph is about - it is printed on the plate beside it")
    .max(1500),
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

/**
 * Editing a photograph that is already published.
 *
 * The same rules as `artworkUploadSchema` for the fields a photographer may
 * revise, but every one optional — a PATCH carries whatever changed and nothing
 * else. The photograph itself, its category and its Photo ID are deliberately
 * absent: the image is what was reviewed and what may already be printed and
 * hanging on a wall, so replacing it is a new upload rather than an edit.
 *
 * `PATCH /artworks/:id` used to take `req.body` straight from the request and
 * filter it against an array of allowed key *names* only, so the names were
 * checked and the values never were. That accepted `title: ""` (a blank card in
 * the gallery), `title` as an object, a 4,000-character description past what
 * the column and the layout expect, and an unbounded `tags` array. `.strict()`
 * additionally rejects an unknown key outright rather than silently dropping it,
 * so a typo'd field name fails loudly instead of appearing to save.
 */
export const artworkEditSchema = z
  .object({
    title: z.string().min(2, 'Give this photograph a title').max(160),
    description: z.string().max(600).nullable(),
    story: z.string().max(1500).nullable(),
    mood: z.array(enumOf(MOODS)).max(3, 'Choose up to 3 moods'),
    colors: z.array(z.enum(values(ARTWORK_COLORS))).max(3),
    tags: z.array(z.string().min(2).max(30)).max(10, 'Up to 10 tags'),
    suitableFor: z.array(z.string().min(2).max(40)).max(10),
    location: z.string().min(2, 'Enter the location where this was photographed').max(160),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Nothing to update',
  });

export const artworkReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(600).optional().nullable(),
});

// ── Frames, cart, orders ────────────────────────────────────────────────────

/**
 * Moving a rotation date.
 *
 * A DELTA IN DAYS, not a date. That is deliberate:
 *
 *   - `dueAt` is a timestamptz carrying a time of day, and it is rendered in
 *     the viewer's timezone. Sending an absolute date from a browser in IST to
 *     a server running UTC is how a rotation lands on the wrong day. Adding
 *     whole days to the stored value cannot drift, whoever is looking at it.
 *   - The permitted range is expressible in the type, so the bound is enforced
 *     by parsing rather than by a comparison someone can forget to write.
 *
 * Zero is excluded because it is not a request, it is a no-op.
 */
export const rescheduleRotationSchema = z.object({
  /*
    The cap here is TWICE the window, and that is not a mistake.

    The window bounds the rotation's POSITION relative to where it was
    originally due; this number is a DELTA from where it currently sits. A cycle
    already moved to anchor+2 needs a delta of -4 to reach anchor-2, which is a
    perfectly legal destination. Capping the delta at the window instead would
    make the far half of the window unreachable after the first move - and,
    worse, the calendar computes its options from `rescheduleOptions`, so it
    would have offered days this schema then rejected with a 422.

    The real rule is positional and is enforced by `canReschedule`. This is only
    a sanity bound to keep absurd numbers out of the handler.
  */
  days: z
    .number()
    .int()
    .refine(
      (value) => value !== 0 && Math.abs(value) <= 2 * ROTATION_RESCHEDULE_WINDOW_DAYS,
      'Choose one of the dates offered on the calendar.',
    ),
});

export type RescheduleRotationInput = z.infer<typeof rescheduleRotationSchema>;

export const frameConfigurationSchema = z.object({
  // ALL_, so a cart restored from localStorage or an order read back from the
  // database still validates after an option is withdrawn from sale. The
  // configurator is what limits new choices; this only decides what is legal.
  size: z.enum(values(ALL_FRAME_SIZES)),
  material: z.enum(values(ALL_FRAME_MATERIALS)),
  color: z.enum(values(ALL_FRAME_COLORS)),
  glass: z.enum(values(ALL_GLASS_TYPES)),
  finish: z.enum(values(ALL_PRINT_FINISHES)),
});

export const cartItemSchema = z.object({
  artworkId: z.string().min(1),
  /*
    Exactly one. Not "at least one".

    This accepted 1-50, which quietly undid the rule above it: the minimum below
    sums quantities, so a single photograph ordered three times satisfied a
    "minimum of three photographs" and produced three identical prints for one
    wall. That is not a collection, and it is not what is sold - every surface
    that shows this says "one print per photograph".

    Only ever used to validate an order being SUBMITTED (createOrderSchema and
    adminCreateOrderSchema are its only two callers), never to read a stored
    order back, so historical lines with a larger quantity still load and price
    exactly as they did.
  */
  quantity: z.literal(QUANTITY_PER_PHOTOGRAPH).default(QUANTITY_PER_PHOTOGRAPH),
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
  /*
    Three DIFFERENT photographs, counted as distinct artworks.

    This summed quantities, which was the same mistake from the other side: with
    copies allowed it could be satisfied without three photographs ever being
    chosen. Counting distinct ids says what is actually meant, and stays correct
    even if copies are ever reintroduced. The Set also catches the same
    photograph submitted as several lines.
  */
  .refine(
    (order) => new Set(order.items.map((item) => item.artworkId)).size >= MIN_ORDER_QUANTITY,
    {
      message: `A collection is a minimum of ${MIN_ORDER_QUANTITY} different photographs`,
      path: ['items'],
    },
  );

/**
 * Staff placing an order on a space's behalf.
 *
 * The same body as `createOrderSchema` plus how it was paid, because the whole
 * reason this exists is the customer who hands over cash rather than using the
 * checkout. Still no money in the body - `spaceId` and `items` are all that is
 * trusted, and every price is recomputed server-side exactly as it is for a
 * self-service order.
 */
export const adminCreateOrderSchema = z
  .object({
    spaceId: z.string().min(1, 'Choose which space this is for'),
    items: z.array(cartItemSchema).min(1, 'Add at least one photograph'),
    couponCode: z.string().max(40).optional().nullable(),
    includeSecurityDeposit: z.boolean().default(false),
    notes: z.string().max(600).optional().nullable(),
    /**
     * Has the money already been received?
     *
     * False leaves the order at `pending_payment`, exactly where a self-service
     * order sits before checkout, and the owner can still pay it online.
     * True settles it immediately - invoice, artist notifications, payout
     * accrual and the production queue - see settlement.service.ts.
     */
    markPaid: z.boolean().default(false),
    paymentMethod: z.enum(['cash', 'bank_transfer', 'upi', 'other']).default('cash'),
    /** A cheque number, a UPI reference, a bank narration - whatever finance will match against. */
    paymentReference: z.string().max(120).optional().nullable(),
  })
  .refine(
    (order) => order.items.reduce((sum, item) => sum + item.quantity, 0) >= MIN_ORDER_QUANTITY,
    { message: `A collection starts at ${MIN_ORDER_QUANTITY} photographs`, path: ['items'] },
  );

export type AdminCreateOrderInput = z.infer<typeof adminCreateOrderSchema>;

/**
 * Staff registering a space on someone's behalf.
 *
 * The other half of `adminCreateOrderSchema`: some café owners will never log
 * in and will say "you set it up". Until now the only way in was the public
 * sign-up form, which requires the owner to be sitting at it.
 *
 * It is the real `spaceSchema` plus who owns the space, rather than the
 * four loose fields the old dead endpoint took, so a space created by staff is
 * the same shape as one created by its owner. That matters: the owner's own
 * edit form posts `spaceSchema`, so anything this creates that would fail it is
 * a space that breaks the first time its owner opens it.
 *
 * Two deliberate relaxations from `spaceSchema`:
 *
 *   imageUrls   optional here. Photographs are mandatory when an OWNER
 *               registers, because that rule exists to stop unverified rooms
 *               being claimed. A member of staff typing in a café they have
 *               visited is a different situation, and the space is created
 *               unverified either way, so the photographs are checked at
 *               verification instead of blocking the record from existing.
 *
 *   addressLine1  still required. A space with no address cannot be delivered
 *                 to, and the whole point of this route is that a real crew
 *                 turns up at a real door.
 */
export const adminProvisionSpaceSchema = spaceSchema
  .omit({ imageUrls: true })
  .extend({
    imageUrls: z.array(z.string()).max(12).default([]),

    /** The owner's name, used on the profile and as the default contact. */
    ownerName: z.string().min(2, 'Enter the owner\'s name').max(120),
    /**
     * The owner's email. If an account already exists on it the new space is
     * attached to that owner rather than refused - a chain with three cafés is
     * one owner with three spaces, not three accounts.
     */
    ownerEmail: z.string().email('Enter a valid email address'),
    ownerPhone: z
      .string()
      .regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number')
      .optional()
      .nullable(),
  });

export type AdminProvisionSpaceInput = z.infer<typeof adminProvisionSpaceSchema>;

/** What the console gets back, including the password to read out ONCE. */
export interface AdminProvisionSpaceResult {
  space: Space;
  /** The space's human code, e.g. "SPC-0042". Null if migration 006 has not run. */
  spaceCode: string | null;
  /** True when the space was attached to an owner who already had an account. */
  ownerExisted: boolean;
  /**
   * Shown once and never stored in readable form. Null when the owner already
   * had an account, because their existing password is untouched.
   *
   * It is deliberately NOT emailed. Mail is the one channel that cannot be
   * recalled, and a plaintext password sitting in an inbox forever is the
   * thing the credential policy exists to prevent.
   */
  temporaryPassword: string | null;
}

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
  /**
   * What Razorpay Checkout hands back to the browser on success.
   *
   * The order id is deliberately NOT accepted here even though Razorpay sends it
   * to the client: the server already stored it against the payment when it
   * opened the charge, and reading it from the request would let a caller pair a
   * genuine signature with somebody else's order. The signature is checked
   * against the stored id.
   */
  gatewayPaymentId: z.string().max(120).optional(),
  gatewaySignature: z.string().max(256).optional(),
  /** How they paid, so the reconciler knows which ledger to open. */
  paidVia: z.enum(['gpay', 'upi', 'bank']).optional(),
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
    .min(40, 'Tell us a little more - at least 40 characters')
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

// ── Homepage slideshow ──────────────────────────────────────────────────────

/**
 * Every field is optional and every field has a default, so a record saved by
 * an older build — or a hand-edited one missing a key — parses to a complete,
 * playable set of settings rather than being rejected.
 *
 * The defaults are taken from DEFAULT_SLIDESHOW_SETTINGS rather than written out
 * again here. Spelling them twice is how `caption` ended up defaulting to an
 * empty string in this schema while the constant held the real sentence — a
 * fresh install would have parsed its way to a hero with no caption at all.
 *
 * The bounds are the point of validating this at all: `intervalMs: 0` would
 * spin the homepage through every photograph as fast as the browser can paint,
 * and a negative one would break the timer outright.
 */
export const slideshowSettingsSchema = z.object({
  autoPlay: z.boolean().default(DEFAULT_SLIDESHOW_SETTINGS.autoPlay),
  intervalMs: z.coerce
    .number()
    .int()
    .min(SLIDESHOW_LIMITS.intervalMs.min)
    .max(SLIDESHOW_LIMITS.intervalMs.max)
    .default(DEFAULT_SLIDESHOW_SETTINGS.intervalMs),
  transition: z.enum(['fade', 'slide']).default(DEFAULT_SLIDESHOW_SETTINGS.transition),
  transitionMs: z.coerce
    .number()
    .int()
    .min(SLIDESHOW_LIMITS.transitionMs.min)
    .max(SLIDESHOW_LIMITS.transitionMs.max)
    .default(DEFAULT_SLIDESHOW_SETTINGS.transitionMs),
  kenBurns: z.boolean().default(DEFAULT_SLIDESHOW_SETTINGS.kenBurns),
  pauseOnHover: z.boolean().default(DEFAULT_SLIDESHOW_SETTINGS.pauseOnHover),
  showThumbnails: z.boolean().default(DEFAULT_SLIDESHOW_SETTINGS.showThumbnails),
  showArrows: z.boolean().default(DEFAULT_SLIDESHOW_SETTINGS.showArrows),
  showCounter: z.boolean().default(DEFAULT_SLIDESHOW_SETTINGS.showCounter),
  // An empty caption is a real choice — it collapses the right half of the
  // control strip — so the field is optional but never rejected for being blank.
  caption: z.string().trim().max(SLIDESHOW_LIMITS.caption.max).default(DEFAULT_SLIDESHOW_SETTINGS.caption),
});

// ── Announcements ───────────────────────────────────────────────────────────

/**
 * A broadcast notification.
 *
 * `link` is optional and relative on purpose. An announcement that sends the
 * whole artist roster to an external address is a phishing pattern, so only
 * in-app paths are accepted.
 */
export const announcementSchema = z.object({
  audience: enumOf(ANNOUNCEMENT_AUDIENCES),
  title: z
    .string()
    .trim()
    .min(ANNOUNCEMENT_LIMITS.title.min, 'Give the notification a title')
    .max(ANNOUNCEMENT_LIMITS.title.max),
  body: z
    .string()
    .trim()
    .min(ANNOUNCEMENT_LIMITS.body.min, 'Say what the notification is about')
    .max(ANNOUNCEMENT_LIMITS.body.max),
  link: z
    .string()
    .trim()
    .max(200)
    /*
      "Starts with /" is not "is on this site". `//evil.com` starts with a slash
      and is protocol-relative: the browser fills in the scheme and navigates
      off-site, and some browsers treat `/\evil.com` the same way. A broadcast
      that points the whole artist roster at an external address is the shape of
      a phishing message, so the character after the leading slash is checked
      too.
    */
    .refine((value) => value === '' || /^\/(?![/\\])[\w\-./?=&#]*$/.test(value), {
      message: 'Use a path within the site, starting with a single /',
    })
    .optional(),
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
export type ArtworkEditInput = z.infer<typeof artworkEditSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ConsultationInput = z.infer<typeof consultationSchema>;
export type ArtistApplicationInput = z.infer<typeof artistApplicationSchema>;
export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
export type GalleryQuery = z.infer<typeof galleryQuerySchema>;
export type SlideshowSettingsInput = z.infer<typeof slideshowSettingsSchema>;
export type AnnouncementInput = z.infer<typeof announcementSchema>;
