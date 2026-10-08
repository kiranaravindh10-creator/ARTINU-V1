import { CONTACT, RENTAL_TARIFF, monthlyRatePerFrame } from '@artinu/shared';

/**
 * WHAT THE ARTINU ASSISTANT IS ALLOWED TO SAY.
 *
 * ── Where every word here came from ─────────────────────────────────────────
 *
 * Nothing in this file is written from general knowledge about art or
 * photography businesses, and nothing is inferred. Each answer is one of:
 *
 *   · ARTINU's current product baseline (the serviced curation model, monthly
 *     rotation, A4/A3, who handles printing, framing, transport and install,
 *     frame ownership, traction and the 45+ sign-up figure)
 *   · this site's own copy (the Join and Apply pages, the application-submitted
 *     steps, the founder and team on the About page)
 *   · the constants the site itself runs on: phone, email and hours come from
 *     CONTACT, and every price is read from RENTAL_TARIFF through the same
 *     `monthlyRatePerFrame` the checkout uses, so the assistant cannot quote a
 *     rate the site no longer charges.
 *
 * Where the baseline says a term is NOT settled (commitment length,
 * photographer compensation, a free pilot or trial, any charge beyond the
 * per-frame rate) the answer says exactly that and hands over to the team. A
 * plausible invention is worse than "I don't have confirmed information".
 *
 * ── How it is written ───────────────────────────────────────────────────────
 *
 * Every sentence is shown to a visitor word for word, with no model in between
 * to smooth it, so the writing rules carried over from the assistant this was
 * adapted from still hold: no em or en dashes, no semicolons, straight
 * apostrophes, and sentence lengths that vary.
 *
 * ── Adding to it ────────────────────────────────────────────────────────────
 *
 * Add an intent where its neighbours would otherwise catch the question (order
 * matters, first match wins), give it the phrasings a visitor would actually
 * type, and only write what ARTINU has confirmed. Then add the question to the
 * assistant check script so a later edit cannot quietly steal it.
 */

// ── Buttons ─────────────────────────────────────────────────────────────────

export type ActionId = 'talk' | 'submit' | 'contact' | 'gallery' | 'artists' | 'about' | 'artistSignIn' | 'terms';

export interface AssistantAction {
  label: string;
  to: string;
}

/** Every button the assistant can show. Each `to` is a route in routes/router.tsx. */
export const ACTIONS: Record<ActionId, AssistantAction> = {
  // The consultation flow: "Book a wall visit".
  talk: { label: 'Talk to ARTINU', to: '/lets-talk' },
  // The photographer application form.
  submit: { label: 'Submit your work', to: '/join/apply' },
  // Help & Support, the page that carries the phone, email and hours.
  contact: { label: 'Contact ARTINU', to: '/help' },
  gallery: { label: 'Browse the gallery', to: '/gallery' },
  artists: { label: 'Meet the artists', to: '/artists' },
  about: { label: 'Meet the team', to: '/about' },
  artistSignIn: { label: 'Artist sign in', to: '/signin?as=artist' },
  terms: { label: 'Read the terms', to: '/legal/terms' },
};

// ── Fixed replies ───────────────────────────────────────────────────────────

/** A question that has nothing to do with ARTINU. */
export const OFF_TOPIC =
  'I can help with questions about ARTINU, its artwork, café service, photographers, pricing and how to get started.';

/** An ARTINU question that nothing below can answer with confirmed information. */
export const UNKNOWN =
  "I don't have confirmed information about that yet. The ARTINU team can help you with the details.";

const COMPENSATION =
  "ARTINU's photographer compensation model is still being finalized. Please contact the ARTINU team for the current details.";

const COMMITMENT =
  "The current contract/commitment terms aren't confirmed in the available ARTINU information. Please contact the ARTINU team for the current terms.";

const FREE_TRIAL =
  "I don't have confirmed information about a free pilot or trial yet. The ARTINU team can help you with the details.";

const FRAME_OWNERSHIP =
  'ARTINU retains ownership of the frames. The service operates through monthly per-frame pricing, with artwork refresh and service included within the selected plan.';

const ARTIST_COUNT = 'More than 45 artists/photographers have signed up with ARTINU.';

const CAFES =
  'ARTINU has completed an installation at Nib & Nosh with 6 A4 frames and is also in active discussions/installation-stage conversations with cafés including Sicilia Point in Rajajinagar and Suvai Coffee in Malleswaram.';

const HOURS = CONTACT.hours.map((h) => `${h.days}: ${h.time}`).join('\n');

// ── Pricing ─────────────────────────────────────────────────────────────────

export type FrameSize = 'a4' | 'a3';

export const SIZE_LABEL: Record<FrameSize, string> = { a4: 'A4', a3: 'A3' };

/**
 * The largest frame count the published tariff prices. Past this the answer is
 * a quotation, never the twelfth-frame rate stretched further, even though
 * `monthlyRatePerFrame` would return one.
 */
export const MAX_PRICED_FRAMES = Math.min(
  RENTAL_TARIFF.standard.a4.monthly.length,
  RENTAL_TARIFF.standard.a3.monthly.length,
);

/** The café (standard) book, month to month: the rates ARTINU quotes today. */
export const rateFor = (size: FrameSize, count: number): number =>
  monthlyRatePerFrame(size, count, 'standard', 'monthly') ?? 0;

/** ₹1,266 for whole rupees, ₹316.50 and ₹3,299.04 when there are paise. */
export const rupees = (amount: number): string => {
  const rounded = Math.round(amount * 100) / 100;
  const paise = !Number.isInteger(rounded);
  return `₹${rounded.toLocaleString('en-IN', {
    minimumFractionDigits: paise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

const MONTHLY_NOTE =
  "That's a monthly subscription price, not a one-time purchase. ARTINU retains ownership of the frames, and artwork refresh and service are included within the selected plan.";

/** One size, one count: "6 × ₹211 = ₹1,266/month". */
const sumLine = (size: FrameSize, count: number) => {
  const rate = rateFor(size, count);
  return count === 1
    ? `${rupees(rate)}/month`
    : `${count} × ${rupees(rate)} = ${rupees(rate * count)}/month`;
};

export const PRICING_COPY = {
  overview: () =>
    [
      "ARTINU's café artwork service is a monthly subscription, priced per frame. The more frames you take, the lower the price of every frame.",
      (['a4', 'a3'] as const)
        .map(
          (size) =>
            `${SIZE_LABEL[size]}: ${rupees(rateFor(size, 1))}/month for one frame, down to ${rupees(
              rateFor(size, MAX_PRICED_FRAMES),
            )}/frame/month at ${MAX_PRICED_FRAMES} frames.`,
        )
        .join('\n'),
      'ARTINU retains ownership of the frames, and artwork refresh and service are included within the selected plan. Tell me the size and how many frames you need, for example "6 A4 frames", and I\'ll work out the monthly total.',
    ].join('\n\n'),

  table: (size: FrameSize) => {
    const rows = Array.from({ length: MAX_PRICED_FRAMES }, (_, i) => i + 1).map((count) =>
      count === 1
        ? `1 frame: ${rupees(rateFor(size, 1))}/month`
        : `${count} frames: ${rupees(rateFor(size, count))}/frame/month`,
    );
    return [
      `${SIZE_LABEL[size]} frames are priced per frame, per month. The more frames you take, the lower the price of every frame.`,
      rows.join('\n'),
      `For example, 6 ${SIZE_LABEL[size]} frames come to ${sumLine(size, 6)}. For more than ${MAX_PRICED_FRAMES} frames, or a mix of A4 and A3, ARTINU will prepare a quotation.`,
    ].join('\n\n');
  },

  exact: (size: FrameSize, count: number) => {
    const rate = rateFor(size, count);
    const opening =
      count === 1
        ? `One ${SIZE_LABEL[size]} frame is ${rupees(rate)}/month.`
        : `${count} ${SIZE_LABEL[size]} frames are ${rupees(rate)} per frame per month.\n\n${sumLine(size, count)}`;
    return `${opening}\n\n${MONTHLY_NOTE}`;
  },

  bothSizes: (count: number) =>
    [
      count === 1 ? 'For one frame:' : `For ${count} frames:`,
      (['a4', 'a3'] as const).map((size) => `${SIZE_LABEL[size]}: ${sumLine(size, count)}`).join('\n'),
      'These are monthly subscription prices, not one-time purchase prices. ARTINU retains ownership of the frames, and artwork refresh and service are included within the selected plan.',
    ].join('\n\n'),

  tooMany: () =>
    `For more than ${MAX_PRICED_FRAMES} frames, ARTINU prepares a quotation for your space. Contact the ARTINU team and they'll put one together for you.`,

  mixed: () =>
    'For a mix of A4 and A3 frames, ARTINU prepares a quotation for your space. Contact the ARTINU team and they\'ll put one together for you. If it helps, I can price each size on its own, for example "4 A4 frames".',
};

// ── Intents ─────────────────────────────────────────────────────────────────

export interface Intent {
  id: string;
  /** Shown under the answer as "From ARTINU · …". Omitted for hand-overs. */
  source?: string;
  /** Tested against the normalised question (see engine.ts). First match wins. */
  match: (q: string) => boolean;
  answer: string | ((q: string) => string);
  actions?: ActionId[];
  followUps: string[];
}

const PHOTOGRAPHER = /\b(photographers?|artists?|creators?|creatives?|shutterbugs?|filmmakers?)\b/;
const SPACE =
  /\b(cafes?|coffee shops?|coffee houses?|restaurants?|bakery|bakeries|bistros?|bars?|pubs?|lounges?|hotels?|offices?|business|businesses|venues?|spaces?|shops?|stores?|outlets?)\b/;
const OTHER_CITIES =
  /\b(mysuru|mysore|chennai|hyderabad|pune|mumbai|bombay|delhi|new delhi|noida|gurgaon|gurugram|kolkata|goa|kochi|cochin|coimbatore|hosur|mangalore|mangaluru|hubli|kerala|tamil nadu|other cities|another city|outside bengaluru|outside bangalore|outside the city|outside karnataka|out of bengaluru|out of bangalore)\b/;
const MONEY =
  /\b(price|prices|pricing|priced|cost|costs|costing|charge|charges|rate|rates|fee|fees|tariff|how much|pay|paid|money|rent|rental|budget|expensive|cheap)\b/;
const NAMED_CAFES =
  /\b(nib|nosh|sicilia|suvai|roka|chin lungs?|plan b|bohemians?|flour affair)\b/;
const HOME =
  /\b(home|homes|house|houses|apartment|apartments|flat|flats|villa|villas|living room|bedroom|residence|residential|home decor|my place|personal use)\b/;
const NOT_HOMEPAGE = /\b(home ?page|homepage)\b/;

const HOME_ANSWER =
  "Yes, ARTINU covers homes too, and the For Spaces page has a section on bringing ARTINU into your home. The pricing I can share is for cafés and commercial spaces, so for a home, the ARTINU team is the best place to ask about the details.";

const FRAME_SIZES_ANSWER =
  'ARTINU currently offers two frame sizes: A4 (210 × 297 mm) and A3 (297 × 420 mm). A3 is the larger of the two.';

const has = (q: string, ...patterns: RegExp[]) => patterns.some((p) => p.test(q));

const STARTER_FOLLOW_UPS = ['What is ARTINU?', 'How does it work?', 'How much does it cost?'];

/**
 * Checked BEFORE a question is priced.
 *
 * These are the answers a price would otherwise swallow: "how much do
 * photographers get paid" is not a frame price, "is there a 3-month minimum"
 * must not be read as three frames, and "is installation free" must not be
 * answered with the rate card.
 */
export const PRE_INTENTS: Intent[] = [
  // ── Small talk, only when that is the whole message ───────────────────────
  {
    id: 'greeting',
    match: (q) =>
      /^(hi+|hello+|hey+|heya|hiya|yo|namaste|hola|good (morning|afternoon|evening)|(hi|hello|hey) (there|team|artinu))( artinu)?$/.test(q),
    answer: 'Hello. Ask me anything about ARTINU, the artwork, the café service, photographers or pricing.',
    followUps: STARTER_FOLLOW_UPS,
  },
  {
    id: 'thanks',
    match: (q) =>
      /^((ok|okay|great|cool|perfect) )?(thanks|thank you|thank u|thankyou|thx|ty|cheers|much appreciated)( (so|very) much| a lot| artinu)?$/.test(q),
    answer: "You're welcome. Is there anything else you'd like to know about ARTINU?",
    followUps: STARTER_FOLLOW_UPS,
  },
  {
    id: 'bye',
    match: (q) => /^(bye+|goodbye|good bye|see you|see ya|bye bye|ttyl|later)$/.test(q),
    answer: 'Thanks for stopping by. If you need anything later, the ARTINU team is happy to help.',
    actions: ['contact'],
    followUps: [],
  },
  {
    id: 'ack',
    match: (q) =>
      /^(ok|okay|k|kk|cool|great|nice|got it|alright|all right|sure|fine|perfect|awesome|good|hmm+|i see|yes|yeah|yep|no|nope|nah)$/.test(q),
    answer: 'Anything else I can help with? You can ask about the artwork, the café service, photographers or pricing.',
    followUps: STARTER_FOLLOW_UPS,
  },
  {
    id: 'capabilities',
    match: (q) =>
      /^(help|menu|options|what can you do|what can you help (me )?with|what do you know|what can i ask( you)?|how can you help( me)?|what are you)$/.test(q),
    answer: OFF_TOPIC,
    followUps: STARTER_FOLLOW_UPS,
  },

  // ── Things that are NOT settled, said plainly ─────────────────────────────
  {
    /*
      Before compensation: "do I pay the photographer" is about who a café deals
      with, not about what a photographer earns.
    */
    id: 'contact-photographer',
    source: 'How it works',
    match: (q) =>
      /\b(contact|call|email|message|talk to|talk with|speak to|speak with|deal with|deal directly with|coordinate with|reach out to|reach|negotiate with|meet) (the |a |each |every )?(photographers?|artists?)\b/.test(q) ||
      /\b(photographers?|artists?) (directly|myself|ourselves)\b/.test(q) ||
      /\b(do|should|must|will|would) (i|we) (need to |have to )?pay (the |a )?(photographers?|artists?)\b/.test(q),
    answer:
      "No. ARTINU connects your space with local photographers and artists, so you only deal with ARTINU. ARTINU takes care of the artwork selection with you, and the printing, framing, transport and installation.",
    followUps: ['Can I request a particular photographer?', 'How do I choose artwork?', 'How does it work?'],
  },
  {
    // Before compensation: a FEE to join is a different question from being paid.
    id: 'photographer-cost',
    match: (q) =>
      has(q, PHOTOGRAPHER, /\b(join|joining|apply|applying|application|submit|submitting|submission|register|registration|sign up|signup|membership|portfolio)\b/) &&
      /\b(fee|fees|cost|costs|charge|charges|charged|free|(have|has|need|needs|must) to pay|pay to|to pay for|paid membership)\b/.test(q) &&
      !/\b(get paid|be paid|earn|earning|earnings|commission|royalt\w*|compensat\w*)\b/.test(q) &&
      !has(q, SPACE, /\b(frames?|a3|a4)\b/),
    answer: UNKNOWN,
    actions: ['contact'],
    followUps: ['Who can join ARTINU?', 'How do I submit my work?', 'What happens after I submit?'],
  },
  {
    id: 'photographer-pay',
    match: (q) =>
      /\b(commissions?|royalt(y|ies)|compensat\w*|remunerat\w*|revenue share|profit share|payouts?)\b/.test(q) ||
      (PHOTOGRAPHER.test(q) &&
        /\b(paid|pay|pays|paying|payment|payments|earn|earns|earning|earnings|money|income|share of|cut|percentage|percent|rate|rates)\b/.test(q)) ||
      /\b(do|will|would|can|could|should) (i|we) (get paid|be paid|earn|make money|make anything|get money|get anything)\b/.test(q) ||
      /\bhow much (do|will|would|can|could) (i|we) (earn|make|get)\b/.test(q) ||
      /\b(get|getting) paid\b/.test(q),
    answer: COMPENSATION,
    actions: ['contact'],
    followUps: ['How does ARTINU support photographers?', 'Do I keep my copyright?', 'How do I submit my work?'],
  },
  {
    // "The minimum number of frames" is a pricing question, not a commitment one.
    id: 'minimum-frames',
    source: 'Pricing',
    match: (q) =>
      /\b(minimum|min|least|fewest|smallest)\b.*\b(frames?|prints?|pieces?|photos?|photographs?|order)\b/.test(q) ||
      /\bhow (few|many) frames (do|must|should|can) (i|we) (take|get|order|start with|have)\b/.test(q) ||
      /\bjust (one|1|a single) frame\b/.test(q),
    answer: () =>
      `The pricing starts from a single frame. One A4 frame is ${rupees(rateFor('a4', 1))}/month and one A3 frame is ${rupees(
        rateFor('a3', 1),
      )}/month, and the price of every frame drops as you add more, up to ${MAX_PRICED_FRAMES} frames.`,
    followUps: ['How much is A4?', 'How much is A3?', 'What frame sizes are available?'],
  },
  {
    id: 'commitment',
    match: (q) =>
      /\b(contracts?|commitments?|committed|lock in|lockin|lock period|cancel|cancels|cancelling|canceling|cancellation|notice period|terminat\w*|tenure|agreement|month to month|annual|yearly|long term|binding)\b/.test(q) ||
      /\bminimum\b(?! (number of )?(frames?|prints?|pieces?|order|quantity))/.test(q) ||
      /\bhow long (do|must|should|will|would|does) (i|we|it|the subscription|the plan|the service)? ?(have to |need to )?(stay|sign|subscribe|commit|last|run|continue)\b/.test(q) ||
      /\b(stop|end|quit|leave|pause) (the |my |our )?(subscription|service|plan)\b/.test(q) ||
      /\b(pause|pausing)\b/.test(q),
    answer: COMMITMENT,
    actions: ['contact'],
    followUps: ['How much does it cost?', 'Do I need to buy the frames?', 'How do I get started?'],
  },
  {
    id: 'free-trial',
    match: (q) =>
      /\b(free trial|trial|trials|pilot|pilots|try (it|artinu|you|the service) (out|first|for free)|try before|try it out|test it out|free month|first month free|for free|free of cost|complimentary|demo installation|sample installation)\b/.test(q),
    answer: FREE_TRIAL,
    actions: ['contact'],
    followUps: ['How much does it cost?', 'How does it work?', 'How do I get started?'],
  },
  {
    // No Starter, Growth or Premium plan exists, so none is ever named.
    id: 'named-plans',
    source: 'Pricing',
    match: (q) =>
      /\b(starter|growth|premium|basic|pro|enterprise|gold|silver|platinum|standard|business|small|large) (plan|plans|package|packages|tier|tiers)\b/.test(q) ||
      /\b(what|which) (plans?|packages?|tiers?)\b/.test(q) ||
      /\b(plans?|packages?|tiers?) (do you|does artinu|do you guys) (have|offer)\b/.test(q),
    answer:
      "The pricing I have isn't split into named plans. It's a monthly price per frame, set by the frame size (A4 or A3) and how many frames you take, with artwork refresh and service included within the selected plan.",
    followUps: ['How much does it cost?', 'How much is A4?', 'How much is A3?'],
  },
  {
    // Installation, travel and tax charges are not part of the baseline.
    id: 'other-charges',
    match: (q) =>
      /\b(installation|install|installing|travel|travelling|traveling|delivery|transport|transportation|shipping|setup|set up|service|hidden|extra|additional|other|any other|maintenance|replacement|damage) (charge|charges|fee|fees|cost|costs)\b/.test(q) ||
      /\bis (the )?(installation|install|delivery|transport|transportation|shipping|travel|setup) (free|included|extra|charged|chargeable|paid)\b/.test(q) ||
      /\b(gst|tax|taxes|vat|deposit|deposits|security deposit|advance payment|advance amount|registration fee|joining fee)\b/.test(q) ||
      /\b(do|will|would) (you|artinu) charge (for|extra)\b/.test(q) ||
      /\bcharge (extra|separately|more) for\b/.test(q) ||
      /\bhow much (is|for|does|do|will|would) (the )?(installation|install|installing|delivery|transport|transportation|shipping|travel|setup|set up)\b/.test(q) ||
      /\b(cost|costs|price|charge|charges|fee|fees) (of|for) (the )?(installation|install|installing|delivery|transport|transportation|shipping|travel|setup|set up)\b/.test(q),
    answer:
      "The pricing I can share is the monthly price per frame, with artwork refresh and service included within the selected plan. I don't have confirmed information about any separate charges, such as installation, travel or taxes. The ARTINU team can give you an exact quotation for your space.",
    actions: ['contact'],
    followUps: ['How much does it cost?', 'Do I need to buy the frames?', 'I want a quotation.'],
  },
  {
    id: 'discounts',
    source: 'Pricing',
    match: (q) =>
      /\b(discounts?|discounted|coupons?|promo|promos|promo codes?|promotions?|deals?|special offers?|any offers?|bulk (price|prices|pricing|rate|rates|discount|order)|volume (price|pricing|discount))\b/.test(q) ||
      /\bcheaper (if|for|with|when)\b/.test(q),
    answer: () =>
      `The monthly price of every frame gets lower the more frames you take, up to ${MAX_PRICED_FRAMES} frames. For example, one A4 frame is ${rupees(
        rateFor('a4', 1),
      )}/month, while at ${MAX_PRICED_FRAMES} A4 frames each one is ${rupees(
        rateFor('a4', MAX_PRICED_FRAMES),
      )}/month. I don't have confirmed information about any other discounts or offers. The ARTINU team can help you with the details.`,
    actions: ['contact'],
    followUps: ['How much is A4?', 'How much is A3?', 'I want a quotation.'],
  },
  {
    id: 'one-time',
    source: 'Pricing',
    match: (q) =>
      /\b(one time|onetime|one off|once off|single payment|lump sum|outright|lifetime|recurring)\b/.test(q) ||
      /\bis (it|this|that|the price|the cost|the payment) (monthly|per month|every month|a monthly)\b/.test(q) ||
      /\b(pay|payment) (once|every month|monthly)\b/.test(q),
    answer: `ARTINU's prices are monthly subscription prices per frame, not one-time purchase prices. ${FRAME_OWNERSHIP}`,
    followUps: ['How much does it cost?', 'How often is artwork refreshed?', 'What frame sizes are available?'],
  },
  {
    id: 'buy-frames',
    source: 'Frames',
    match: (q) =>
      /\b(buy|buying|purchase|purchasing|own|owning|keep|keeping|pay for) (the |my |our |these |those )?frames?\b/.test(q) ||
      /\bframes? (ownership|owned|belongs?|mine|ours)\b/.test(q) ||
      /\bwho owns (the |my |our )?frames?\b/.test(q) ||
      /\b(have|has|need|needs) to (buy|purchase)\b/.test(q) ||
      /\b(upfront|up front|zero investment|capital cost|capital investment|initial investment)\b/.test(q),
    answer: `No, you don't need to buy the frames. ${FRAME_OWNERSHIP}`,
    actions: ['talk'],
    followUps: ['How much does it cost?', 'How often is artwork refreshed?', 'Who installs the frames?'],
  },
  {
    // Sales are a possible future model, never described as the current one.
    id: 'sell-art',
    match: (q) =>
      /\b(buy|buying|purchase|purchasing|order|own|keep) (a |an |the |this |that |these |those |my |one )?(prints?|photos?|photographs?|artworks?|art|pieces?|paintings?|pictures?|images?)\b/.test(q) ||
      /\b(sell|sells|selling|sale|sales) (of )?(the )?(art|artworks?|prints?|photos?|photographs?|pictures?|paintings?|images?)\b/.test(q) ||
      /\b(art|artwork|prints?|photos?|photographs?) (for sale|on sale)\b/.test(q) ||
      /\b(can|could|do|will) (customers|visitors|guests|people|diners|patrons) (buy|purchase|order)\b/.test(q),
    answer:
      "Selling artwork to café visitors is a possible future addition, but it isn't ARTINU's current model. Right now, ARTINU works with spaces on a monthly per-frame service: ARTINU handles the printing, framing, transport and installation, and the artwork changes on a monthly rotation. If you're interested in a particular piece, the ARTINU team can help.",
    actions: ['contact'],
    followUps: ['How does it work?', 'Is ARTINU an art marketplace?', 'How much does it cost?'],
  },
  {
    // What a named café pays is not public, and is never guessed.
    id: 'named-cafe-money',
    match: (q) => NAMED_CAFES.test(q) && MONEY.test(q),
    answer: UNKNOWN,
    actions: ['contact'],
    followUps: ['Which cafés are you working with?', 'How much does it cost?', 'How does it work?'],
  },
  {
    // The rates quoted here are the café book. A home is never quoted them.
    id: 'home-pricing',
    source: 'For spaces',
    match: (q) => HOME.test(q) && !NOT_HOMEPAGE.test(q) && MONEY.test(q),
    answer: HOME_ANSWER,
    actions: ['talk', 'contact'],
    followUps: ['How does it work?', 'How often is artwork refreshed?', 'What frame sizes are available?'],
  },
  {
    // Only A4 and A3 are offered, so any other paper size is answered with those two.
    id: 'other-size',
    source: 'Frames',
    match: (q) => /\b(a0|a1|a2|a5|a6|a7)\b/.test(q),
    answer: `${FRAME_SIZES_ANSWER} For any other size, the ARTINU team can tell you what's possible.`,
    actions: ['contact'],
    followUps: ['How much is A4?', 'How much is A3?', 'Who provides the frames?'],
  },
  {
    // Sizes and dimensions, asked without a price word. With one, it is priced.
    id: 'frame-sizes',
    source: 'Frames',
    match: (q) =>
      !/\b(price|prices|pricing|cost|costs|how much|rate|rates|charge|charges|fee|fees)\b/.test(q) &&
      (/\b(sizes?|sizing|dimensions?|how big|how large|measurements?|measure|mm|cm|inch|inches|formats?)\b/.test(q) ||
        /\b(difference|different|compare|comparison|versus|vs|bigger|larger|smaller)\b.*\b(a3|a4)\b/.test(q) ||
        /\b(a3|a4)\b.*\b(difference|versus|vs|bigger|larger|smaller)\b/.test(q) ||
        /\b(available|offer|do you (have|do)|do you make|is there)\b.*\b(a3|a4)\b/.test(q) ||
        /\b(a3|a4)\b.*\b(available|offered)\b/.test(q)),
    answer: FRAME_SIZES_ANSWER,
    followUps: ['How much is A4?', 'How much is A3?', 'Who provides the frames?'],
  },
];

/** Checked AFTER a question carrying a size or a frame count has been priced. */
export const INTENTS: Intent[] = [
  // ── Traction and where ARTINU works ───────────────────────────────────────
  {
    id: 'artist-count',
    source: 'Photographers',
    match: (q) =>
      /\bhow many (artists?|photographers?|creators?|members?|contributors?|people (have )?(signed|joined|registered))\b/.test(q) ||
      /\b(number|count|total) of (artists?|photographers?|creators?|members?)\b/.test(q) ||
      /\bhow (big|large) is (the |your |artinus? )?(community|network|artist community)\b/.test(q),
    answer: ARTIST_COUNT,
    followUps: ['How does ARTINU support photographers?', "I'm a photographer. How do I join?", 'Which cafés are you working with?'],
  },
  {
    id: 'nib-and-nosh',
    source: 'Cafés',
    match: (q) => /\b(nib|nosh)\b/.test(q),
    answer: 'Nib & Nosh is where ARTINU has completed an installation, with 6 A4 frames installed.',
    followUps: ['Which cafés are you working with?', 'How does it work?', 'How much does it cost?'],
  },
  {
    id: 'sicilia-point',
    source: 'Cafés',
    match: (q) => /\bsicilia\b/.test(q),
    answer:
      "ARTINU is in active discussions with Sicilia Point in Rajajinagar and working toward an installation there. It's at the installation stage, not a completed installation.",
    followUps: ['Which cafés are you working with?', 'How does it work?', 'How many artists are on ARTINU?'],
  },
  {
    id: 'suvai-coffee',
    source: 'Cafés',
    match: (q) => /\bsuvai\b/.test(q),
    answer:
      "ARTINU is in active discussions with Suvai Coffee in Malleswaram and working toward an installation there. It's at the installation stage, not a completed installation.",
    followUps: ['Which cafés are you working with?', 'How does it work?', 'How many artists are on ARTINU?'],
  },
  {
    // Businesses that were approached are never presented as customers.
    id: 'other-named-cafe',
    source: 'Cafés',
    match: (q) => /\b(roka|chin lungs?|plan b|bohemians?|flour affair)\b/.test(q),
    answer: `I can't confirm that business as an ARTINU customer. ${CAFES} The ARTINU team can tell you more.`,
    actions: ['contact'],
    followUps: ['Which cafés are you working with?', 'How does it work?', 'How much does it cost?'],
  },
  {
    id: 'cafes',
    source: 'Cafés',
    match: (q) =>
      /\b(which|what) (cafes?|restaurants?|spaces?|clients?|customers?|businesses|places|brands?|venues?|companies)\b.*\b(work|working|worked|partner|partnered|partners|installed|install|use|uses|using|signed|onboard|onboarded|have|served|serve)\b/.test(q) ||
      /\b(your|existing|current|any) (clients?|customers?|partners?|installations?|partner cafes)\b/.test(q) ||
      /\bwho (are|is) (your|artinus?) (clients?|customers?|partners?)\b/.test(q) ||
      /\bwho uses (artinu|you|it)\b/.test(q) ||
      /\bwhere (can|could) (i|we) see (artinu|your|the|an|some|any) ?(work|art|artwork|frames?|installations?|walls?)?\b/.test(q) ||
      /\b(have you|has artinu|did you) (done|completed|installed|worked)\b/.test(q) ||
      /\bwhere (is|has) artinu (been )?installed\b/.test(q) ||
      /\b(case stud(y|ies)|traction|track record|references?)\b/.test(q) ||
      /\bhow many (cafes?|clients?|customers?|spaces?|installations?|businesses)\b/.test(q),
    answer: `${CAFES} ARTINU is in discussions with other cafés in Bengaluru as well.`,
    followUps: ['How many artists are on ARTINU?', 'How does it work?', 'I own a café. How do I get started?'],
  },
  {
    // A city check comes before the service answers, so "do you install in Chennai" is answered as a where.
    id: 'location-city',
    source: 'Where ARTINU works',
    match: (q) => OTHER_CITIES.test(q) || /\b(which|what) (city|cities|areas?|locations?|regions?|states?)\b/.test(q),
    answer:
      "ARTINU is based in Bengaluru, and its current café work is in Bengaluru. If your space is somewhere else, contact the ARTINU team and they'll tell you whether they can serve it.",
    actions: ['contact'],
    followUps: ['Which cafés are you working with?', 'How does it work?', 'How much does it cost?'],
  },

  // ── The people ────────────────────────────────────────────────────────────
  {
    id: 'founder',
    source: 'About',
    match: (q) =>
      /\b(founder|founders|cofounder|co founder|founded|ceo|kiran)\b/.test(q) ||
      /\bwho (started|created|runs|owns|built|made|leads|heads|set up) (artinu|it|this|the company|the business)\b/.test(q) ||
      /\bwho is behind (artinu|it|this)\b/.test(q),
    answer:
      'ARTINU was founded by SR Kiran Aravindh. He started it on a simple frustration: photographs live and die on screens while the walls around us stay blank. He works on every part of ARTINU, from reading a room to turning up on installation day.',
    actions: ['about'],
    followUps: ['Who is on the ARTINU team?', 'What does the team do?', 'What is ARTINU?'],
  },
  {
    id: 'ex-team',
    source: 'About',
    match: (q) =>
      /\b(ex|former|past|previous|old) (team|it team|it|members?|employees?|staff|developers?|interns?)\b/.test(q) ||
      /\b(ex it|used to work|left the team|thakarshi|vibhu)\b/.test(q),
    answer:
      'The About page lists two former members of the IT team: A. Thakarshi Anand and Vibhu Krishna S. Both worked with ARTINU from the first week of August to the first week of September 2026, and helped build the first five versions of the platform, including its sign-in and login.',
    actions: ['about'],
    followUps: ['Who is on the ARTINU team?', 'What does the team do?', 'Who is the founder?'],
  },
  {
    id: 'team-roles',
    source: 'About',
    match: (q) =>
      /\bwhat (does|do) (the |your |artinus? |this )?(team|teams|staff|people) (do|handle|work on)\b/.test(q) ||
      /\b(team|staff) (roles?|responsibilities)\b/.test(q) ||
      /\bwho does what\b/.test(q) ||
      /\b(roles?|responsibilities) (in|of|at|on) (the |your )?team\b/.test(q),
    answer:
      'The ARTINU team handles everything between the photograph and the wall: choosing the work, printing it, framing it, transporting it, installing it and refreshing it every month. Within the team, the social media team (Karthik, Sanskrithi Raikote and Alen Peter) runs ARTINU\'s content and online presence, and the technology team (Mithilesh BM and Poosan Kumar S, Technical Operations) builds and runs the platform.',
    actions: ['about'],
    followUps: ['Who is the founder?', 'Who is on the ARTINU team?', 'How does it work?'],
  },

  // ── Reaching a person ─────────────────────────────────────────────────────
  {
    id: 'human',
    source: 'Contact',
    match: (q) =>
      /\b(speak|talk|chat) (to|with) (someone|somebody|a person|a human|human|a real person|real person|the team|your team|someone from artinu|an agent|agent|a representative|representative|sales|support|customer care|customer service|a manager|the owner)\b/.test(q) ||
      /\b(call me|call back|callback|reach out to me|get in touch with me|contact me)\b/.test(q) ||
      /\bi (want|would like|d like|need) to (speak|talk)\b/.test(q) ||
      /\b(a human|real person|live agent)\b/.test(q),
    answer: `Of course. You can call the ARTINU team on ${CONTACT.phone} or email ${CONTACT.email}. If it's about your space, you can also book a conversation on the Let's Talk page.`,
    actions: ['talk', 'contact'],
    followUps: ['How do I get started?', 'How much does it cost?', 'What is ARTINU?'],
  },
  {
    id: 'quotation',
    source: 'Pricing',
    match: (q) => /\b(quote|quotes|quotation|quotations|estimate|estimates|estimation|proposal|proposals)\b/.test(q),
    answer:
      'Happy to help. Tell the ARTINU team about your space, how many frames you\'d like and which sizes (A4 or A3), and they\'ll put a quotation together for you. You can book a conversation on the Let\'s Talk page or contact the team directly.\n\nIf you\'d like a quick estimate first, ask me something like "8 A4 frames".',
    actions: ['talk', 'contact'],
    followUps: ['How much is A4?', 'How much is A3?', 'What frame sizes are available?'],
  },
  {
    id: 'contact',
    source: 'Contact',
    match: (q) =>
      // "phone" alone is a contact question, "phone photos" is a photographer's.
      /\b(contact|contacting|get in touch|in touch with|phone(?! (photos?|photography|pictures?|cameras?|shots?|images?))|phone number|mobile number|contact number|your number|whatsapp|whats app|email|e mail|email address|mail id|working hours|office hours|business hours|opening hours|timings|when are you open)\b/.test(q) ||
      /\b(call|reach|ring|message|mail) (you|artinu|the team|your team|someone|support)\b/.test(q) ||
      /\b(your|artinus?|the|office) address\b/.test(q) ||
      /\bwhere is (your|the|artinus?) office\b/.test(q),
    answer: `You can reach the ARTINU team on ${CONTACT.phone}, at ${CONTACT.email}, or on WhatsApp.\n\nOffice hours:\n${HOURS}`,
    actions: ['contact', 'talk'],
    followUps: ['How do I get started?', 'I want a quotation.', 'What is ARTINU?'],
  },
  {
    id: 'team',
    source: 'About',
    match: (q) =>
      /\b(team|teams|staff|employees|people behind|who works|who work|working at artinu|work at artinu|works at artinu|crew|members of artinu)\b/.test(q),
    answer:
      'ARTINU is run by a small team in Bengaluru.\n\nFounder: SR Kiran Aravindh\nSocial media: Karthik, Sanskrithi Raikote and Alen Peter\nTechnology: Mithilesh BM and Poosan Kumar S\n\nYou can meet them, with their photographs and bios, on the About page.',
    actions: ['about'],
    followUps: ['What does the team do?', 'Who is the founder?', 'What is ARTINU?'],
  },
  {
    id: 'terms',
    source: 'Terms',
    match: (q) =>
      /\b(terms|terms and conditions|t and c|tnc|tncs|terms of use|terms of service|privacy|privacy policy|legal|community guidelines|policy|policies)\b/.test(q),
    answer:
      "You can read ARTINU's Terms & Conditions, Privacy Policy and Community Guidelines on the site. Photographers agree to the Terms of Use and the Privacy Policy when they apply, and they keep their copyright. If you're asking about the commercial terms for a café, those aren't confirmed in the information I have, so please contact the ARTINU team.",
    actions: ['terms', 'contact'],
    followUps: ['What type of photographs can I submit?', 'Do I keep my copyright?', 'How do I submit my work?'],
  },

  // ── Photographers ─────────────────────────────────────────────────────────
  {
    id: 'copyright',
    source: 'For photographers',
    match: (q) =>
      /\b(copyright|copyrights|copy right|intellectual property|ip rights|usage rights|image rights|licen[cs]e|licen[cs]ing|reproduce|reproduction)\b/.test(q) ||
      /\bwho owns (my |the |our )?(photos?|photographs?|work|art|artworks?|images?|pictures?)\b/.test(q) ||
      /\b(do|will|would) (i|we) (keep|retain|lose|own|give up) (my |our |the )?(rights|copyright|ownership|photos?|photographs?|work)\b/.test(q),
    answer:
      'The photographer keeps the copyright, always. It doesn\'t transfer to ARTINU or to the space where the work is displayed. ARTINU\'s guidelines also ask photographers to upload only work they shot themselves.',
    followUps: ['What type of photographs can I submit?', 'How does ARTINU support photographers?', 'How do I submit my work?'],
  },
  {
    id: 'artwork-selected',
    source: 'For photographers',
    match: (q) =>
      /\bif (a|the|any|some) (cafe|space|restaurant|business|venue|customer|client|hotel|office|owner) (selects?|chooses?|picks?|likes?|wants?|uses?|takes?)\b/.test(q) ||
      /\b(when|if) (my )?(work|photos?|photographs?|art|artworks?|pictures?|images?) (is|are|gets?) (selected|chosen|picked|used|displayed|installed)\b/.test(q) ||
      /\b(selects?|selected|chooses?|chose|chosen|picks?|picked) my (work|photos?|photographs?|art|artworks?|pictures?|images?)\b/.test(q),
    answer:
      "If a café selects your artwork, ARTINU prints it, frames it and installs it in that space, with your name credited beside it. ARTINU handles everything with the space, so you don't need to deal with the café yourself. For questions about compensation, the ARTINU team has the current details, as that model is still being finalized.",
    actions: ['contact'],
    followUps: ['Do I keep my copyright?', 'Can I update my portfolio?', 'How does ARTINU support photographers?'],
  },
  {
    id: 'after-submit',
    source: 'For photographers',
    match: (q) =>
      (/\bwhat happens (after|once|when|next)\b/.test(q) && !SPACE.test(q)) ||
      /\bafter (i|you|we) (submit|apply|send|upload|register)\b/.test(q) ||
      /\bafter (submitting|applying|submission|application|registering|registration)\b/.test(q) ||
      /\bhow long (does|will|do|would) (it|the review|the application|review|approval|i have to wait)\b.*\b(review|application|approval|approve|accepted|hear|reply|respond|response)\b/.test(q) ||
      /\bhow long (does|will|do|would|is) (the |my )?(review|reviewing|application|approval|reply|response)\b/.test(q) ||
      /\bwhen (will|do|would) (i|we) (hear|know|get a reply|get a response)\b/.test(q) ||
      /\b(hear back|get back to me|response time|review process|application status|status of my application|get approved|be approved|be accepted|get accepted)\b/.test(q),
    answer:
      "A person at ARTINU reads your application and looks through your photographs. It isn't an automatic filter. You'll get a reply within seven to ten days, whether the answer is yes or no. If you're accepted, your account opens and you can upload your photographs, which go straight into the gallery. When a space picks your work, ARTINU prints it, frames it, hangs it and puts your name beside it.",
    followUps: ['Can I update my portfolio?', 'What happens if a café selects my artwork?', 'How does ARTINU support photographers?'],
  },
  {
    id: 'update-portfolio',
    source: 'For photographers',
    match: (q) =>
      /\b(update|updating|edit|editing|change|changing|manage|managing|add to|delete|remove)\b.*\bmy (portfolio|profile|uploads|gallery|submissions|photos|photographs|work)\b/.test(q) ||
      /\b(upload|add|submit) (more|new|additional|extra) (photos?|photographs?|work|images?|pictures?)\b/.test(q) ||
      /\b(update|edit) (the |my )?(portfolio|profile)\b/.test(q) ||
      /\bmy portfolio\b/.test(q),
    answer:
      'Yes. Once your application is accepted, you can sign in to your ARTINU artist workspace to upload new photographs and manage your portfolio. Approved artists\' uploads go straight into the gallery.',
    actions: ['artistSignIn'],
    followUps: ['What happens if a café selects my artwork?', 'Do I keep my copyright?', 'How many artists are on ARTINU?'],
  },
  {
    id: 'what-to-submit',
    source: 'For photographers',
    match: (q) =>
      /\b(what|which) (type|types|kind|kinds|sort|sorts|style|styles|genre|genres|category|categories) of (photos?|photographs?|photography|work|images?|pictures?|art|artworks?)\b/.test(q) ||
      /\b(what|which) (photos?|photographs?|images?|pictures?|work) (can|should|do|could|may) (i|we) (submit|upload|send|share|apply with)\b/.test(q) ||
      /\b(guidelines?|requirements?|criteria|rules for)\b/.test(q) ||
      /\bai (generated|images?|art|photos?)\b/.test(q) ||
      /\b(phone|mobile|iphone|android) (photos?|photography|pictures?|camera|shots?)\b/.test(q) ||
      /\bshoot (on|with) (a |my )?(phone|mobile|iphone)\b/.test(q) ||
      /\b(file|image|photo) (format|formats|size|sizes|type|types|resolution)\b/.test(q) ||
      /\bhow many (photos?|photographs?|images?|pictures?) (can|should|do|must|to) (i|we)?\b/.test(q),
    answer:
      'Your own work, in any style. ARTINU welcomes all styles and all stories, and photos shot on a phone are welcome too. The guidelines are simple.\n\n• Upload only photographs you shot yourself. You keep your copyright.\n• No AI-generated or heavily synthesised imagery.\n• Keep details accurate, like where the photo was taken and roughly when.\n• Nothing hateful, explicit or exploitative.\n• Quality over quantity. Six strong photographs beat thirty average ones.\n\nThe application asks for 6 to 15 images, as JPG or PNG files of up to 10MB each.',
    actions: ['submit'],
    followUps: ['What happens after I submit?', 'Who can join ARTINU?', 'Do I keep my copyright?'],
  },
  {
    id: 'who-can-join',
    source: 'For photographers',
    match: (q) =>
      /\bwho (can|could|may|is allowed to|is eligible to|should) (join|apply|sign up|submit|register|become|be part)\b/.test(q) ||
      /\b(can|could) (anyone|anybody|beginners?|amateurs?|students?|hobbyists?|non professionals?|everyone) (join|apply|submit|sign up)\b/.test(q) ||
      /\beligib\w*\b/.test(q) ||
      /\b(do|must) (i|you) (need to )?(be|have) (a )?(professional|pro|experienced|experience|qualifications?|degree|dslr|camera|certified)\b/.test(q) ||
      /\b(professional|pro|beginner|amateur) (only|photographers only)\b/.test(q),
    answer:
      'Anyone with an eye for a photograph. ARTINU welcomes people who shoot on a phone, professional photographers, emerging and aspiring photographers, visual storytellers and creative makers, and photography students and enthusiasts. All styles and all stories are welcome.',
    actions: ['submit'],
    followUps: ['What type of photographs can I submit?', 'How do I submit my work?', 'What happens after I submit?'],
  },
  {
    id: 'support-photographers',
    source: 'For photographers',
    match: (q) =>
      (PHOTOGRAPHER.test(q) &&
        /\b(support|supports|supporting|help|helps|helping|benefit|benefits|why (should|would|do) (i|we|they)? ?join|what do (i|we|they) get|whats in it|advantages?|value|exposure|promote|promotes|promotion|recognition|visibility|grow|growth|opportunit\w*)\b/.test(q)) ||
      /\bwhy (should|would) (i|we) (join|sign up|apply)\b/.test(q) ||
      /\bwhats in it for (me|us|photographers|artists)\b/.test(q),
    answer:
      'ARTINU helps photographers get their work off the screen and onto real walls. Selected photographs are printed, framed and displayed in commercial spaces like cafés, with your name credited beside them. Your work is also shown to space owners, curators and other photographers through the gallery and your artist profile, and you become part of a community of photographers and creative people. Linking artwork back to the photographer through a QR code is also part of ARTINU\'s design, so people who like your work can find you.',
    actions: ['submit'],
    followUps: ['How many artists are on ARTINU?', 'Do photographers get paid?', 'How do I submit my work?'],
  },
  {
    // Before display-in-cafe: "where can my work be displayed" contains "can my work be displayed".
    id: 'where-displayed',
    source: 'For photographers',
    match: (q) =>
      /\bwhere (can|could|will|would|does|do|is|are)( my| our| the| their)? (work|photos?|photographs?|art|artworks?|pictures?|images?)\b/.test(q) ||
      /\bwhere (do|does|will|would|can) (my|the|our) (work|photos?|photographs?|art|artworks?)\b/.test(q),
    answer:
      'Selected photographs are printed, framed and displayed in real commercial spaces that work with ARTINU, such as cafés, with your name credited beside them. Your work can also be seen in the ARTINU gallery and on your artist profile.',
    followUps: ['Can my photograph be displayed in a café?', 'How do I submit my work?', 'How does ARTINU support photographers?'],
  },
  {
    id: 'display-in-cafe',
    source: 'For photographers',
    match: (q) =>
      /\b(can|could|will|would|does|do|is|are) (my|our|your|a|the) (work|photos?|photograph|photographs|art|artworks?|pictures?|images?) (be |get |gets )?(displayed|shown|hung|exhibited|featured|put up|placed|used|framed|installed)\b/.test(q) ||
      /\b(display|show|hang|exhibit|feature|put up) (my|our) (work|photos?|photographs?|art|artworks?|pictures?|images?)\b/.test(q),
    answer:
      "Yes, that's the idea behind ARTINU. If your work is selected, ARTINU prints and frames it, and it can be displayed in a café or another space working with ARTINU, credited to you. Which photographs go where depends on the review and on what suits each space.",
    actions: ['submit'],
    followUps: ['What happens if a café selects my artwork?', 'How do I submit my work?', 'How does ARTINU support photographers?'],
  },
  {
    id: 'how-it-works-photographers',
    source: 'For photographers',
    match: (q) =>
      PHOTOGRAPHER.test(q) &&
      /\b(how (does|do|will) (it|artinu|this|things) work|process|steps|how it works)\b/.test(q),
    answer:
      'For photographers it works in four steps.\n\n1. Create your profile and tell ARTINU about your photography.\n2. Upload your best work, 6 to 15 images.\n3. A person on the ARTINU team reviews your application and replies within seven to ten days.\n4. Once you\'re in, your photographs go into the gallery, and when a space picks your work, ARTINU prints it, frames it and hangs it with your name beside it.',
    actions: ['submit'],
    followUps: ['What type of photographs can I submit?', 'Do photographers get paid?', 'Who can join ARTINU?'],
  },
  {
    /*
      A space that wants to join, checked BEFORE the photographer join, so
      "how can my café join" is answered as a café and not as an application.
    */
    id: 'cafe-join',
    source: 'For spaces',
    match: (q) =>
      (SPACE.test(q) &&
        !PHOTOGRAPHER.test(q) &&
        // "Why should a café use ARTINU" is a why, answered further down.
        !/\bwhy\b/.test(q) &&
        /\b(join|joining|sign up|signup|register|onboard|onboarding|partner|partnership|get started|getting started|start|begin|get artinu|work with (you|artinu)|enquire|enquiry|inquire|inquiry|book|booking|interested|want artinu|need artinu|bring artinu|sign my|add my|list my)\b/.test(q)) ||
      /\bi (want|need|would like|d like) (artinu|art|artworks?|frames?|photos?|photographs?|photography|prints?) (for|in|at|on) (my|our)\b/.test(q) ||
      /\b(book|schedule|arrange|request|see|get) (a |an )?(wall visit|visit|consultation|meeting|call|site visit|demo|appointment)\b/.test(q),
    answer:
      "The easiest way to start is to book a conversation with the ARTINU team on the Let's Talk page. Tell them about your space, and they'll help you choose artwork from the collection or curate a selection for you. ARTINU then takes care of the printing, framing, transport and installation, and refreshes the artwork every month.",
    actions: ['talk'],
    followUps: ['How much does it cost?', 'How do I choose artwork?', 'Do I need to buy the frames?'],
  },
  {
    id: 'photographer-join',
    source: 'For photographers',
    match: (q) =>
      /\b(im|i am) (a |an )?(photographer|artist|creator|visual artist|painter|illustrator|filmmaker|photography student|hobby photographer)\b/.test(q) ||
      /\b(join|joining|apply|applying|application|sign up|signup|register|registration|submit|submitting|submission|send (my|our|in my) (work|photos?|photographs?|portfolio)|upload (my|our) (work|photos?|photographs?|portfolio|art|artwork)|become (an? )?(artinu )?(photographer|artist|member|creator|contributor))\b/.test(q),
    answer:
      "Great to hear from you. You can apply to join on the ARTINU site. Fill in your details, tell ARTINU about your photography, and upload 6 to 15 of your best images, as JPG or PNG files of up to 10MB each. A person on the ARTINU team reviews every application, and you'll hear back within seven to ten days.",
    actions: ['submit'],
    followUps: ['What type of photographs can I submit?', 'What happens after I submit?', 'How does ARTINU support photographers?'],
  },

  // ── Gallery and artists ───────────────────────────────────────────────────
  {
    id: 'request-photographer',
    source: 'Gallery',
    match: (q) =>
      /\b(particular|specific|certain|favourite|favorite|preferred|chosen|local|same|one) (photographers?|artists?|creators?)\b/.test(q) ||
      /\b(photographer|artist) of (my|our) choice\b/.test(q) ||
      /\b(request|ask for|choose|pick|select|want|get|work with) (a |an |the |my |our )?(photographer|artist)\b/.test(q),
    answer:
      "You can browse the gallery and the artist profiles and choose artwork by a photographer whose work you like. If you have a particular photographer in mind, tell the ARTINU team and they'll let you know what's possible.",
    actions: ['gallery', 'talk'],
    followUps: ['Can I choose specific photographs?', 'Can ARTINU curate artwork for my café?', 'Can I view artist profiles?'],
  },
  {
    id: 'artist-profiles',
    source: 'Artists',
    match: (q) =>
      /\b(artists?|photographers?|creators?)\b.*\b(profiles?|pages?|bios?|portfolios?)\b/.test(q) ||
      /\b(profiles?|portfolios?) of (the )?(artists|photographers)\b/.test(q) ||
      /\b(meet|see|view|browse|find|look at) (the |your |all )?(artists|photographers)\b/.test(q) ||
      /\bwho (are|is) (the |your )?(artists|photographers)\b/.test(q),
    answer:
      "Yes. The Artists page lists ARTINU's photographers, and each one has a public profile with their work. You can also see who made a photograph on its page in the gallery.",
    actions: ['artists', 'gallery'],
    followUps: ['How do I browse the gallery?', 'Can I choose a specific artwork?', 'How many artists are on ARTINU?'],
  },
  {
    id: 'choose-specific',
    source: 'Choosing artwork',
    match: (q) =>
      /\b(specific|particular|certain|exact|individual|own|favourite|favorite|chosen) (photos?|photographs?|artworks?|art|pieces?|images?|pictures?|prints?)\b/.test(q) ||
      /\b(choose|pick|select) (the |our |my )?(photos?|photographs?|pictures?|artworks?|art) (myself|ourselves|ourself|ourselves)\b/.test(q) ||
      /\b(choose|pick|select) (which|what) (photos?|photographs?|pictures?|artworks?|art)\b/.test(q),
    answer:
      'Yes. You can browse the ARTINU gallery and choose the specific photographs or artworks you want for your space. ARTINU then prints, frames, transports and installs them for you.',
    actions: ['gallery'],
    followUps: ['Can ARTINU curate artwork for my café?', 'How often is artwork refreshed?', 'What frame sizes are available?'],
  },
  {
    id: 'curation',
    source: 'Choosing artwork',
    match: (q) =>
      /\b(curate|curates|curated|curating|curation|curator|curators)\b/.test(q) ||
      /\b(choose|pick|select|decide) for (me|us)\b/.test(q) ||
      /\b(you|artinu) (choose|pick|select|decide)\b/.test(q) ||
      /\b(dont|do not) (want to|wanna|have time to) (choose|pick|select|decide)\b/.test(q) ||
      /\bhelp (me|us) (choose|pick|select|decide)\b/.test(q) ||
      /\b(recommend|recommends|recommendation|recommendations|suggest|suggests|suggestion|suggestions)\b/.test(q),
    answer:
      "Yes. ARTINU can curate the artwork for you, so you don't have to make every decision yourself. The team picks work that suits your space and its ambience. You can still choose specific pieces from the gallery if you'd like to.",
    actions: ['talk', 'gallery'],
    followUps: ['Can I choose specific photographs?', 'How often is artwork refreshed?', 'How much does it cost?'],
  },
  {
    id: 'choose-artwork',
    source: 'Choosing artwork',
    match: (q) =>
      /\b(choose|choosing|chose|pick|picking|select|selecting|selection|decide on)\b.*\b(art|arts|artworks?|photos?|photographs?|pictures?|images?|prints?|pieces?)\b/.test(q) ||
      /\b(art|artwork|photo|photograph|picture)s? (selection|choice|options)\b/.test(q) ||
      /\bwho (chooses|picks|selects|decides)\b/.test(q),
    answer:
      "You can browse the ARTINU gallery and pick the photographs and artwork that suit your café's ambience. If you'd rather not make every decision yourself, ARTINU can curate a selection for your space. Either way, ARTINU handles the printing, framing, transport and installation.",
    actions: ['gallery', 'talk'],
    followUps: ['Can ARTINU curate artwork for my café?', 'Can I choose specific photographs?', 'How often is artwork refreshed?'],
  },
  {
    id: 'browse-gallery',
    source: 'Gallery',
    match: (q) =>
      /\b(gallery|galleries|browse|browsing|collection|collections|catalog|catalogue)\b/.test(q) ||
      /\b(see|view|look at|explore) (the |your |some |all )?(art|artworks?|photos?|photographs?|work|samples?)\b/.test(q) ||
      /\bsamples?\b/.test(q),
    answer:
      'Open the Gallery page from the menu at the top of the site. You can browse photographs by ARTINU\'s photographers, filter them by things like category, mood and colour, and open any photograph to see it in detail.',
    actions: ['gallery'],
    followUps: ['Can I view artist profiles?', 'Can I choose artwork for my café?', 'What frame sizes are available?'],
  },

  // ── The service: rotation, printing, framing, transport, installation ─────
  {
    id: 'refresh-how',
    source: 'Rotation',
    match: (q) =>
      /\bhow (does|do|will|is) (the )?(artwork |art |photo |photograph |monthly )?(refresh|rotation|rotating|swap|swapping|change|changing|replacement|replacing|update|updating)( work| happen| done| handled)?\b/.test(q) ||
      /\b(rotation|refresh|swap) day\b/.test(q) ||
      /\bwhat happens (on|at|during|in) (a |the )?(rotation|refresh|swap)\b/.test(q) ||
      /\bhow (do|does|will) (you|artinu|they|the team) (change|swap|replace|refresh|rotate|update) (the )?(art|artworks?|photos?|photographs?|frames?|pictures?|prints?)\b/.test(q),
    answer:
      'ARTINU works on a monthly rotation. Each month, ARTINU brings a new selection of artwork and swaps it in for you. You can choose the new pieces from the collection or let ARTINU curate them. Artwork refresh and service are included within your selected plan.',
    followUps: ['Can ARTINU curate artwork for my café?', 'How much does it cost?', 'Do I need to buy the frames?'],
  },
  {
    id: 'rotation',
    source: 'Rotation',
    match: (q) =>
      /\b(how often|how frequently|frequency|how many times|how regularly)\b/.test(q) ||
      /\b(rotation|rotations|rotate|rotated|rotating|refresh|refreshed|refreshes|refreshing|swap|swapped|swaps)\b/.test(q) ||
      /\bevery (month|week|year|quarter|few months|3 months|three months)\b/.test(q) ||
      /\b(change|changed|changes|replace|replaced|update|updated) (the )?(art|artworks?|photos?|photographs?|pictures?|prints?)\b/.test(q) ||
      /\b(art|artworks?|photos?|photographs?|pictures?|prints?) (change|changes|changed|get changed|rotate|stay the same)\b/.test(q),
    answer:
      'ARTINU works on a monthly rotation. The artwork in your space is refreshed every month, so your walls keep changing and regulars always have something new to look at. Artwork refresh and service are included within your selected plan.',
    followUps: ['How does artwork refresh work?', 'How much does it cost?', 'Can ARTINU curate artwork for my café?'],
  },
  {
    id: 'included',
    source: 'Pricing',
    match: (q) =>
      /\bwhats? (is |are )?(included|covered)\b/.test(q) ||
      /\bwhat (does|do) (it|the price|the plan|the service|the subscription|the package|artinu|you) (include|includes|cover|covers)\b/.test(q) ||
      /\b(price|plan|service|subscription|package|cost) (include|includes|cover|covers|including)\b/.test(q) ||
      /\bincluded in (the )?(price|plan|service|subscription|package|cost)\b/.test(q) ||
      /^what do (i|we) get$/.test(q),
    answer:
      'ARTINU handles the printing, framing, transport and installation of the artwork, and artwork refresh and service are included within the selected plan, on a monthly rotation. ARTINU retains ownership of the frames. Pricing is a monthly price per frame, based on the frame size and how many frames you take.',
    followUps: ['How much does it cost?', 'Do I need to buy the frames?', 'How often is artwork refreshed?'],
  },
  {
    id: 'printing',
    source: 'How it works',
    match: (q) =>
      /\b(print|prints|printing|printed|printer|printers|print lab)\b/.test(q) &&
      // Paper, finish and materials are not in the baseline, so those get the honest "not confirmed".
      !/\b(paper|papers|material|materials|quality|ink|inks|finish|finishes|resolution|dpi|matte|glossy|gloss|canvas|archival|acrylic|metal|wood|wooden|glass|type of|kind of|what kind|colou?rs?)\b/.test(q),
    answer:
      'ARTINU handles the printing. You choose the artwork, or let ARTINU curate it, and ARTINU takes care of printing, framing, transport and installation.',
    followUps: ['Does ARTINU handle framing?', 'Who installs the frames?', 'How often is artwork refreshed?'],
  },
  {
    id: 'framing',
    source: 'Frames',
    match: (q) =>
      /\b(framing|framer|framers)\b/.test(q) ||
      /\bwho (provides|supplies|makes|gives|brings|arranges|handles|does) (the )?(frames?|framing)\b/.test(q) ||
      /\b(provide|provides|supply|supplies|include|includes|come with|comes with|bring|brings) (the )?frames?\b/.test(q) ||
      /\bframes? (are |is )?(included|provided)\b/.test(q) ||
      /\b(handle|handles) (the )?frames?\b/.test(q),
    answer:
      'ARTINU provides the frames and handles the framing. ARTINU retains ownership of the frames, and you pay a monthly price per frame.',
    followUps: ['What frame sizes are available?', 'Who installs the frames?', 'Do I need to buy the frames?'],
  },
  {
    id: 'transport',
    source: 'How it works',
    match: (q) =>
      /\b(transport|transports|transportation|transporting|deliver|delivers|delivery|delivered|delivering|ship|ships|shipping|shipment|shipped|logistics|courier|pick up|pickup|bring it|brings it)\b/.test(q),
    answer:
      "ARTINU handles the transport, bringing the framed artwork to your space and installing it there. You don't need to arrange pickup or delivery yourself.",
    followUps: ['Who installs the frames?', 'Does ARTINU handle printing?', 'How often is artwork refreshed?'],
  },
  {
    id: 'installation',
    source: 'How it works',
    match: (q) =>
      /\b(install|installs|installed|installing|installation|installer|installers|hang|hangs|hanging|hung|mount|mounts|mounting|mounted|put up|putting up|drill|drilling|nails?|wall fixing|fix (the )?frames?)\b/.test(q),
    answer:
      "ARTINU installs the frames in your space, so you don't need to hang anything yourself. Printing, framing and transport are handled by ARTINU as well.",
    followUps: ['How often is artwork refreshed?', 'Do I need to buy the frames?', 'How much does it cost?'],
  },

  // ── Kinds of space ────────────────────────────────────────────────────────
  {
    id: 'home',
    source: 'For spaces',
    match: (q) => HOME.test(q) && !NOT_HOMEPAGE.test(q),
    answer: HOME_ANSWER,
    actions: ['talk', 'contact'],
    followUps: ['How does it work?', 'How often is artwork refreshed?', 'What frame sizes are available?'],
  },
  {
    id: 'other-spaces',
    source: 'For spaces',
    match: (q) =>
      /\b(restaurants?|hotels?|offices?|coworking|co working|workspaces?|bars?|pubs?|bakery|bakeries|bistros?|lounges?|salons?|clinics?|hospitals?|retail|shops?|stores?|showrooms?|gyms?|schools?|colleges?|studios?|boutiques?|hostels?|resorts?|homestays?|cloud kitchens?|venues?|malls?|spa|spas)\b/.test(q),
    answer: (q) =>
      /\b(restaurants?|hotels?|offices?|coworking|co working|workspaces?)\b/.test(q)
        ? "Yes. ARTINU works with commercial spaces. Cafés are its main focus right now, and ARTINU also works with restaurants, hotels and offices. Tell the ARTINU team about your space and they'll help you get started."
        : "ARTINU works with commercial spaces, and cafés are its main focus right now. For your kind of space, the best next step is to tell the ARTINU team about it, so they can tell you how ARTINU can work there.",
    actions: ['talk'],
    followUps: ['How does it work?', 'How much does it cost?', 'How do I choose artwork?'],
  },
  {
    id: 'get-started',
    source: 'Getting started',
    match: (q) =>
      /\b(get started|getting started|how (do|can|should|would) (i|we) (start|begin)|where (do|should|can) (i|we) (start|begin)|first steps?|next steps?|how to start|how to begin|onboarding|sign me up|lets start|ready to start|lets do it|lets go)\b/.test(q),
    answer:
      "It depends on who you are.\n\nIf you have a café or another space, book a conversation with the ARTINU team on the Let's Talk page. They'll help you choose or curate artwork, and ARTINU handles the printing, framing, transport and installation.\n\nIf you're a photographer, apply to join on the ARTINU site and upload 6 to 15 of your best images.",
    actions: ['talk', 'submit'],
    followUps: ['How much does it cost?', 'How does it work?', 'What type of photographs can I submit?'],
  },
  {
    id: 'cafe-help',
    source: 'For spaces',
    match: (q) =>
      /\b(own|run|have|manage|opening|open|started) (a|an|my|our) (cafe|coffee shop|coffee house|restaurant|bakery|bistro|bar|business|space)\b/.test(q) ||
      /\bhow (can|could|will|would|does|do) (artinu|you|it) help (me|my|us|our)\b/.test(q) ||
      /\bwhat (can|could|will|would) (artinu|you) do for (me|my|us|our)\b/.test(q) ||
      /\bhelp (my|our) (cafe|business|space|restaurant)\b/.test(q) ||
      /\b(my|our) cafe\b/.test(q),
    answer:
      'ARTINU can give your café a curated, constantly refreshed look without you buying, sourcing, framing, installing or managing any artwork. You choose artwork from the ARTINU collection, or let ARTINU curate it for you. ARTINU prints it, frames it, brings it to your café and installs it, and the artwork changes on a monthly rotation. You pay a monthly price per frame.',
    actions: ['talk'],
    followUps: ['How much does it cost?', 'How do I choose artwork?', 'I own a café. How do I get started?'],
  },

  // ── What ARTINU is ────────────────────────────────────────────────────────
  {
    id: 'why-artinu',
    source: 'Why ARTINU',
    match: (q) =>
      /\bwhy\b.*\b(use|choose|pick|go with|need|want|should|would|consider|try|sign up|work with|bother)\b/.test(q) ||
      /\b(benefits?|advantages?|worth it|worthwhile|value for money|point of artinu|reasons? to|why artinu|what makes artinu|different from|unique|special about)\b/.test(q),
    answer:
      'Because your café gets a constantly refreshed, curated visual ambience without having to purchase, source, frame, install or manage artwork itself. ARTINU handles the printing, framing, transport and installation, and the artwork changes on a monthly rotation, so regulars always have something new to look at. It also puts work by local photographers and artists on your walls, which gives your space a local story worth talking about.',
    actions: ['talk'],
    followUps: ['How does it work?', 'How much does it cost?', 'Which cafés are you working with?'],
  },
  {
    id: 'qr',
    source: 'For photographers',
    match: (q) =>
      /\b(qr|qr codes?|qrcode|qrcodes|scan|scanning|scannable|barcode)\b/.test(q) ||
      /\bcredit (plate|plates|label|labels|card|cards)\b/.test(q) ||
      /\bhow (will|do|can|would) (people|customers|visitors|guests|diners) (know|find out|find|learn) (who|the photographer|the artist|about the)\b/.test(q),
    answer:
      "ARTINU credits each photograph to the photographer who took it. Linking each artwork to its photographer's profile through a QR code is also part of ARTINU's design, so someone who likes a photograph can find out who made it. For what a specific installation includes, the ARTINU team can confirm the details.",
    actions: ['artists'],
    followUps: ['How does ARTINU support photographers?', 'Can I view artist profiles?', 'What is ARTINU?'],
  },
  {
    id: 'location',
    source: 'Where ARTINU works',
    match: (q) =>
      /\bwhere (is|are|does|do) (artinu|you|u|your company|your team|your office|your business)( (based|located|operate|operating|work|working|available|from|serve|serving))?$/.test(q) ||
      /\bwhere (do|does) (you|artinu) (operate|work|serve|deliver|install|provide)\b/.test(q) ||
      /\b(operate|operates|operating|serve|serves|serving|available|deliver|delivers|install|installs) (in|outside|across|near|around)\b/.test(q) ||
      /\b(bengaluru|bangalore|blr|karnataka|india|indiranagar|koramangala|jayanagar|whitefield|hsr|malleswaram|rajajinagar|jp nagar|mg road|hebbal|yelahanka|electronic city)\b/.test(q) ||
      /\b(based (in|out of)|located|location|locations|headquarters|hq)\b/.test(q),
    answer:
      "ARTINU is based in Bengaluru, and its current café work is in Bengaluru. If your space is somewhere else, contact the ARTINU team and they'll tell you whether they can serve it.",
    actions: ['contact'],
    followUps: ['Which cafés are you working with?', 'How does it work?', 'How much does it cost?'],
  },
  {
    id: 'photo-platform',
    source: 'What ARTINU is',
    match: (q) =>
      /\b(photography|photo|photos|photographers?) (platform|site|website|app|community|network|portal|marketplace)\b/.test(q) ||
      /\bis (artinu|it|this) (a |an |just a |just an )?(photography|photo|instagram|social media|social|stock)\b/.test(q) ||
      /\b(like instagram|stock (photo|photos|photography|images?))\b/.test(q),
    answer:
      "Partly. ARTINU works mainly with photography and artwork by local photographers and artists, and photographers can join and share their work. But ARTINU is more than a place to upload photos. It's a serviced art-curation platform that puts that work on the walls of real commercial spaces, handling the printing, framing, transport and installation.",
    followUps: ['Is ARTINU an art marketplace?', 'How does it work?', "I'm a photographer. How do I join?"],
  },
  {
    id: 'marketplace',
    source: 'What ARTINU is',
    match: (q) =>
      /\b(marketplace|market place|art market|e commerce|ecommerce|online store|online shop|art store|art shop|art dealer|art gallery business)\b/.test(q),
    answer:
      "Not in the usual sense. ARTINU's current service isn't selling artwork. It's a serviced art-curation platform: spaces like cafés choose artwork through ARTINU and pay a monthly price per frame, and ARTINU handles the printing, framing, transport, installation and monthly rotation. Selling artwork to café customers is a possible future addition, not the current model.",
    followUps: ['Is ARTINU a photography platform?', 'How does it work?', 'How much does it cost?'],
  },
  {
    id: 'who-for',
    source: 'What ARTINU is',
    match: (q) =>
      /\bwho (is|s) (artinu|it|this|the service|the platform) (for|meant for|aimed at|built for|designed for|made for)\b/.test(q) ||
      /\bwho (should|can|could) use (artinu|it|this|the service)\b/.test(q) ||
      /\bwho are (your|the) (users|customers|clients|audience)\b/.test(q) ||
      /\btarget (audience|customers?|market|users?)\b/.test(q) ||
      /\bwho (does artinu|do you) (serve|work with|help|cater to)\b/.test(q) ||
      /\bis (it|artinu|this) (for|only for|suitable for) (me|us|everyone)\b/.test(q),
    answer:
      'ARTINU is for two groups. First, commercial spaces like cafés, and also restaurants, hotels and offices, that want curated, regularly refreshed artwork without buying, framing or managing it themselves. Second, local photographers and artists who want their work printed, framed and seen in real spaces.',
    followUps: ['I own a café. How do I get started?', "I'm a photographer. How do I join?", 'How does it work?'],
  },
  {
    id: 'how-it-works',
    source: 'How it works',
    match: (q) =>
      /\bhow (does|do|will|would|is) (artinu|it|this|the service|the process|the platform|the subscription|the model|the whole thing|you guys|you|things|everything) (work|works|working|function|operate|run)\b/.test(q) ||
      /^how (does|do) (it|artinu|this) work$/.test(q) ||
      /\b(process|procedure|steps|how it works|walk me through|explain (the )?(process|service|model|how)|business model)\b/.test(q),
    answer:
      "Here's how it works.\n\n1. You choose artwork from the ARTINU collection, or let ARTINU curate a selection that suits your space.\n2. ARTINU prints and frames the artwork.\n3. ARTINU transports it to your space and installs it.\n4. The artwork is refreshed on a monthly rotation, so your walls keep changing.\n\nYou pay a monthly price per frame, and ARTINU retains ownership of the frames. To begin, you can book a conversation with the team on the Let's Talk page.",
    actions: ['talk'],
    followUps: ['How much does it cost?', 'How often is artwork refreshed?', 'Can ARTINU curate artwork for my café?'],
  },
  {
    id: 'what-is',
    source: 'What ARTINU is',
    match: (q) =>
      /\b(what (is|s|does|do)|whats) (artinu|this|this site|this website|this company|this platform|it|you|u|you guys)( (do|does|mean|offer|stand for|all about|about|exactly|really|actually|again|do exactly|offer exactly))?( exactly| really| actually| again| please)?$/.test(q) ||
      /\bwho (are|r) (you|u|artinu|you guys)\b/.test(q) ||
      /\b(tell me|tell us|know more|learn more|more info|more information|information|info|details) (about )?(artinu|the company|this company|you|your company|your service|this service|this site|this website)\b/.test(q) ||
      /\b(about artinu|explain artinu|artinu meaning|meaning of artinu|what do you guys do)\b/.test(q) ||
      /\bwhat (services?|service) (do you|does artinu|does it|do you guys) (offer|provide|do)\b/.test(q) ||
      /^(artinu|about|about you|about us)$/.test(q),
    answer:
      'ARTINU is a serviced art-curation platform. It brings photography and artwork by local photographers and artists into commercial spaces like cafés. You choose the artwork through ARTINU, and ARTINU takes care of the printing, framing, transport and installation. The artwork changes on a monthly rotation, so your walls stay fresh without you having to buy, source, frame, hang or manage any of it.',
    followUps: ['How does it work?', 'How much does it cost?', 'Who is ARTINU for?'],
  },
];
