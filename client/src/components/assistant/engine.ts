import {
  ACTIONS,
  INTENTS,
  MAX_PRICED_FRAMES,
  OFF_TOPIC,
  PRE_INTENTS,
  PRICING_COPY,
  SIZE_LABEL,
  UNKNOWN,
  type ActionId,
  type AssistantAction,
  type FrameSize,
  type Intent,
} from './knowledge';
import { STARTERS } from './starters';

export type { AssistantAction, FrameSize } from './knowledge';

/**
 * THE ANSWER LAYER. NO MODEL, NO SERVER, NO NETWORK.
 *
 * Adapted from the assistant on the newer ARTINU branch, which matched a
 * question against a fixed knowledge file on the server and returned
 * ARTINU's own sentence for it. The idea is kept whole: the answer IS the
 * approved sentence, so it cannot drift into a claim nobody made, and a
 * question nothing covers gets an honest "I don't have that" instead of a
 * plausible guess.
 *
 * It runs here rather than behind an endpoint because there is nothing to
 * protect: no key, no model, nothing private, and every fact in it is already
 * on the public site. Running it in the browser means no new API surface, no
 * database writes and nothing for the server to do. The panel loads this file
 * on first open, so it never weighs on a page where nobody asks anything.
 *
 * ── The order of a reply ────────────────────────────────────────────────────
 *
 *   1. PRE_INTENTS   the answers a price would otherwise swallow (photographer
 *                    pay, commitment, trials, extra charges, frame ownership)
 *   2. pricing       when the question carries a price word, a frame size, a
 *                    frame count, or is a follow-up to the last price
 *   3. INTENTS       everything else ARTINU has confirmed
 *   4. late pricing  a size or count nothing else claimed ("6 A4 for a lobby")
 *   5. "tell me more", then the two fallbacks: an ARTINU question nothing
 *      covers, or a question that is not about ARTINU at all
 *
 * ── What carries over between questions ─────────────────────────────────────
 *
 * Only the price. "How much is A4?" then "and 6 frames?" must price six A4
 * frames, and "6 frames?" then "what about A3?" must price six A3. Nothing else
 * is carried, so a new question is always read on its own: after "how does
 * ARTINU work", "what is the weather today" is still off topic.
 */

export interface AssistantReply {
  answer: string;
  actions: AssistantAction[];
  /** Questions to offer next. Every one is answerable by this engine. */
  suggestions: string[];
  /** Shown as "From ARTINU · …". Absent on hand-overs and fallbacks. */
  source?: string;
}

/** What the next question may lean on. Pricing slots only (see above). */
export interface AssistantContext {
  topic?: string;
  size?: FrameSize;
  count?: number;
}

export interface AssistantTurn {
  reply: AssistantReply;
  context: AssistantContext;
}

/** The longest question the panel accepts, mirrored here so a caller cannot exceed it. */
const MAX_QUESTION = 500;

// ── Reading a question ──────────────────────────────────────────────────────

/*
  "A 3-month minimum" must never become the size "a3": the lookahead keeps a
  number that is really a duration out of the size fold.
*/
const NOT_A_DURATION = String.raw`(?![\s-]*(months?|mos?|years?|yrs?|weeks?|days?)\b)`;

/**
 * Lower case, no accents, no apostrophes, no punctuation.
 *
 * "I'm" becomes "im" and "café" becomes "cafe", so every pattern in the
 * knowledge file is written against one plain form. A-3, A 3 and A3 all
 * become "a3".
 */
export function normalize(raw: string): string {
  return raw
    .slice(0, MAX_QUESTION)
    .replace(new RegExp(String.raw`\bA[\s-]([34])\b${NOT_A_DURATION}`, 'g'), 'a$1')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(new RegExp(String.raw`\ba-([34])\b${NOT_A_DURATION}`, 'g'), 'a$1')
    .replace(/['’‘`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  hundred: 100,
};

export interface Slots {
  sizes: FrameSize[];
  count?: number;
  /** How the count was found: next to a size, next to "frames", or on its own. */
  countKind?: 'paired' | 'framed' | 'bare';
  /** Some of one size and some of the other, which is always a quotation. */
  mixed: boolean;
}

/**
 * The frame size(s) and frame count in a question, if any.
 *
 * Money, durations and long numbers are removed first, so "₹429", "3 months"
 * and a phone number are never read as a number of frames.
 */
export function readSlots(raw: string): Slots {
  const text = normalize(
    raw
      .slice(0, MAX_QUESTION)
      .replace(/(₹|\brs\.?|\binr)\s*\d[\d,]*(\.\d+)?/gi, ' ')
      .replace(/\d[\d,]*(\.\d+)?\s*(rupees?|rs\b|inr\b|\/-)/gi, ' ')
      .replace(/\d+\.\d+/g, ' '),
  )
    .replace(/\bhalf (a )?dozen\b/g, '6')
    .replace(/\b(a )?dozen\b/g, '12')
    .replace(/\b(a couple of|a couple|couple of)\b/g, '2')
    .replace(/\b(a )?single\b(?= (a3|a4|frames?)\b)/g, '1')
    .replace(/\b(a|an)\b(?= (a3|a4|frame)\b)/g, '1')
    .replace(/\b[a-z]+\b/g, (word) => (word in NUMBER_WORDS ? String(NUMBER_WORDS[word]) : word))
    .replace(/\b\d+ ?(months?|mos?|years?|yrs?|weeks?|wks?|days?|hours?|hrs?|minutes?|mins?)\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ');

  const sizes: FrameSize[] = [];
  if (/\ba4s?\b/.test(text)) sizes.push('a4');
  if (/\ba3s?\b/.test(text)) sizes.push('a3');

  // "6 a4", "6 x a4", "a4 x 6", "a4 frames 6"
  const pairs: { size: FrameSize; count: number }[] = [];
  for (const m of text.matchAll(/\b(\d{1,3}) ?(?:x|into|nos?|no of|pcs|of)? ?(a3|a4)s?\b/g)) {
    pairs.push({ count: Number(m[1]), size: m[2] as FrameSize });
  }
  for (const m of text.matchAll(/\b(a3|a4)s? ?(?:frames?|prints?|size|sized)? ?(?:x|into|times|qty|quantity|nos?|count)? ?(\d{1,3})\b(?! ?(a3|a4))/g)) {
    pairs.push({ size: m[1] as FrameSize, count: Number(m[2]) });
  }
  const pairedSizes = new Set(pairs.map((p) => p.size));

  const mixed =
    pairedSizes.size > 1 ||
    (sizes.length > 1 && /\b(mix|mixed|mixture|combination|combo|combine|combined|plus)\b/.test(text));

  let count: number | undefined;
  let countKind: Slots['countKind'];
  if (pairs.length > 0 && pairedSizes.size === 1) {
    count = pairs[0].count;
    countKind = 'paired';
  } else {
    const framed = text.match(
      /\b(\d{1,3}) ?(?:more |extra |additional |different |separate |such )?(frames?|framed|prints?|pieces?|artworks?|photos?|photographs?|pictures?|images?)\b/,
    );
    const bare = text.match(/\b(\d{1,2})\b/);
    if (framed) {
      count = Number(framed[1]);
      countKind = 'framed';
    } else if (bare) {
      count = Number(bare[1]);
      countKind = 'bare';
    }
  }

  return { sizes, count, countKind, mixed };
}

/*
  The words a pricing follow-up is made of. "And 6 frames?", "What about A3?"
  and "for twelve then" are nothing BUT these plus a size or a number, which is
  what marks them as a continuation of the last price rather than a new topic.
*/
const SLOT_FILLER = new Set(
  (
    'a an and abt about again all also approx around at be but can case could count do does each extra for format frame frames framed ' +
    'get give go half hmm how i if in instead into is it just lets let like make many maybe me month monthly more much no nos of ok okay ' +
    'one ones only option options per perhaps pcs piece pieces please pls plz print prints qty quantity quote rate rates rather same say ' +
    'size sizes sized so take tell that the them then this those times to together too total us variant version wat we what whats wht ' +
    'will with would x you price prices cost costs photo photos artwork artworks want need dozen couple single'
  ).split(' '),
);

const isSlotOnly = (q: string) => {
  const words = q.split(' ').filter(Boolean);
  return (
    words.length > 0 &&
    words.every((w) => SLOT_FILLER.has(w) || /^(a3|a4)s?$/.test(w) || /^\d+$/.test(w) || w in NUMBER_WORDS)
  );
};

const PRICE_WORDS =
  /\b(price|prices|pricing|priced|cost|costs|costing|charge|charges|rate|rates|fee|fees|tariff|tariffs|how much|rent|rental|subscription|subscriptions|budget|afford|affordable|expensive|cheap|cheapest|cheaper|per month|per frame|rs|inr|rupees)\b/;

/** A price question with no size or count is only ARTINU's when it is about ARTINU. */
const ARTINU_CONTEXT =
  /\b(artinu|arts?|artworks?|frames?|framed|photos?|photographs?|photography|prints?|pieces?|cafes?|coffee shops?|restaurants?|spaces?|walls?|business|service|services|subscription|plans?|rotation|curation|it|this|that|them|you|your|yours|u)\b/;

const GUARD_STOP = new Set(
  (
    'a about all also an and any approx approximately are as at average ballpark be by can could current currently did do does each ' +
    'every exactly for from get give got has have how i idea im in is it its just like me minimum maximum month months monthly much my ' +
    'need now of on only or our overall per please range rough roughly so some start starting tell that the their them then there these ' +
    'this those to today total typical typically us usually want was we what whats when where which who why will with would you your ' +
    'price prices pricing priced cost costs costing charge charges rate rates fee fees tariff tariffs rent rental subscription ' +
    'subscriptions budget afford affordable expensive cheap cheapest cheaper rs inr rupees pay paying hi hello hey ok okay sir maam'
  ).split(' '),
);

const aboutArtinu = (q: string) =>
  ARTINU_CONTEXT.test(q) ||
  q.split(' ').every((w) => !w || GUARD_STOP.has(w) || /^\d+$/.test(w));

/** A frame count stated as something wanted: "we need 20 frames", "thinking 6 frames". */
const WANTING =
  /\b(want|wants|need|needs|get|take|order|have|looking for|thinking|considering|planning|require|would like|d like|interested in|go for|going for)\b/;

/**
 * Whatever is left when nothing else claimed the question, and still about
 * ARTINU, gets the honest "not confirmed" rather than the off-topic line.
 *
 * Price words alone are not on this list: a price question that reached this
 * far was already turned down by `aboutArtinu`, so it is about something else
 * ("how much does a coffee cost").
 */
const ARTINU_DOMAIN =
  /\b(artinu|arts?|artworks?|artists?|artistic|photos?|photographs?|photography|photographers?|pictures?|prints?|printing|frames?|framed|framing|cafes?|restaurants?|spaces?|walls?|gallery|galleries|install\w*|rotation|rotate|refresh|subscription|curation|curate|curated|curator|portfolio|submit|submission|decor|exhibit\w*|display\w*|a3|a4|quote|quotation|pay|payment|payments|invoices?|billing|hotels?|offices?|interiors?|ambience|ambiance|founder|team|delivery|shipping|canvas|posters?|paintings?|sculptures?|murals?|business)\b/;

const TELL_ME_MORE =
  /^(tell me more|more|more please|more info|more information|more details|go on|continue|explain|explain more|elaborate|and|and then|anything else|what else|ok and)$/;

// ── Building replies ────────────────────────────────────────────────────────

const actionsFor = (ids: ActionId[] = []) => ids.map((id) => ACTIONS[id]);

/** Never offer the question that was just asked as the next one. */
const without = (suggestions: string[], asked: string) =>
  suggestions.filter((s) => normalize(s) !== normalize(asked)).slice(0, 3);

function fromIntent(intent: Intent, q: string, asked: string): AssistantTurn {
  return {
    reply: {
      answer: typeof intent.answer === 'function' ? intent.answer(q) : intent.answer,
      actions: actionsFor(intent.actions),
      suggestions: without(intent.followUps, asked),
      source: intent.source,
    },
    context: { topic: intent.id },
  };
}

function pricingTurn(
  answer: string,
  asked: string,
  suggestions: string[],
  context: AssistantContext,
  actions: ActionId[] = ['talk'],
): AssistantTurn {
  return {
    reply: { answer, actions: actionsFor(actions), suggestions: without(suggestions, asked), source: 'Pricing' },
    context: { topic: 'pricing', ...context },
  };
}

const other = (size: FrameSize): FrameSize => (size === 'a4' ? 'a3' : 'a4');

/**
 * The price, if this is a price question. Null when it is not.
 *
 * `late` is the second pass, after every other intent has declined: a size or
 * a frame count is then enough on its own.
 */
function price(
  q: string,
  asked: string,
  slots: Slots,
  context: AssistantContext,
  late = false,
): AssistantTurn | null {
  const words = PRICE_WORDS.test(q);
  const slotOnly = isSlotOnly(q);
  const afterPrice = context.topic === 'pricing';

  // A bare number is only a frame count inside a price question.
  let count = slots.countKind === 'bare' && !(words || slotOnly) ? undefined : slots.count;
  const hasSize = slots.sizes.length > 0;
  const framed = slots.countKind === 'paired' || slots.countKind === 'framed';

  const isPrice = late
    ? hasSize || framed
    : slots.countKind === 'paired' ||
      (framed && WANTING.test(q)) ||
      (slotOnly && (hasSize || count !== undefined) && (afterPrice || hasSize || framed || words)) ||
      (words && (hasSize || count !== undefined || aboutArtinu(q)));
  if (!isPrice) return null;

  if (slots.mixed) {
    return pricingTurn(
      PRICING_COPY.mixed(),
      asked,
      ['How much is A4?', 'How much is A3?', 'How do I contact ARTINU?'],
      {},
      ['contact', 'talk'],
    );
  }

  // Two sizes and no mix ("A3 and A4 for 6 frames") is a comparison: both sizes.
  let size = slots.sizes.length === 1 ? slots.sizes[0] : undefined;

  // The one thing that carries over: the other half of the last price.
  if (afterPrice && slots.sizes.length < 2) {
    if (!size && count !== undefined && context.size) size = context.size;
    if (count === undefined && size && context.count !== undefined) count = context.count;
  }

  if (count !== undefined && count < 1) count = undefined;

  if (count !== undefined && count > MAX_PRICED_FRAMES) {
    return pricingTurn(
      PRICING_COPY.tooMany(),
      asked,
      ['How much is A4?', 'How much is A3?', 'How do I contact ARTINU?'],
      { size, count },
      ['contact', 'talk'],
    );
  }

  if (size && count !== undefined) {
    return pricingTurn(
      PRICING_COPY.exact(size, count),
      asked,
      [
        `What about ${SIZE_LABEL[other(size)]}?`,
        count === MAX_PRICED_FRAMES ? 'And 6 frames?' : `And ${MAX_PRICED_FRAMES} frames?`,
        'Do I need to buy the frames?',
      ],
      { size, count },
    );
  }

  if (count !== undefined) {
    return pricingTurn(
      PRICING_COPY.bothSizes(count),
      asked,
      ['What about A4?', 'What about A3?', 'Do I need to buy the frames?'],
      { count },
    );
  }

  if (size) {
    return pricingTurn(
      PRICING_COPY.table(size),
      asked,
      ['And 6 frames?', `What about ${SIZE_LABEL[other(size)]}?`, "What's included?"],
      { size },
    );
  }

  return pricingTurn(
    PRICING_COPY.overview(),
    asked,
    ['How much is A4?', 'How much is A3?', 'Do I need to buy the frames?'],
    {},
  );
}

const BY_ID = new Map([...PRE_INTENTS, ...INTENTS].map((intent) => [intent.id, intent]));

// ── The one entry point ─────────────────────────────────────────────────────

/**
 * One question in, one reply and the context for the next question out.
 *
 * Pure: the same question and context always give the same reply, which is
 * what lets the check script walk whole conversations without a browser.
 */
export function reply(question: string, context: AssistantContext = {}): AssistantTurn {
  const asked = question.slice(0, MAX_QUESTION);
  const q = normalize(asked);
  const slots = readSlots(asked);

  for (const intent of PRE_INTENTS) {
    if (intent.match(q)) return fromIntent(intent, q, asked);
  }

  const priced = price(q, asked, slots, context);
  if (priced) return priced;

  for (const intent of INTENTS) {
    if (intent.match(q)) return fromIntent(intent, q, asked);
  }

  const latePrice = price(q, asked, slots, context, true);
  if (latePrice) return latePrice;

  if (TELL_ME_MORE.test(q)) {
    const previous = context.topic === 'pricing' ? null : context.topic ? BY_ID.get(context.topic) : undefined;
    if (previous === undefined) {
      return fromIntent(BY_ID.get('what-is')!, q, asked);
    }
    return {
      reply: {
        answer: 'Happy to. Pick one of these, or ask me anything else about ARTINU.',
        actions: [],
        suggestions: previous ? previous.followUps.slice(0, 3) : ['How much is A4?', 'How much is A3?', "What's included?"],
      },
      context,
    };
  }

  if (ARTINU_DOMAIN.test(q)) {
    return {
      reply: { answer: UNKNOWN, actions: actionsFor(['contact']), suggestions: STARTERS.slice(0, 3) },
      context: {},
    };
  }

  return {
    reply: { answer: OFF_TOPIC, actions: [], suggestions: STARTERS.slice(0, 3) },
    context: {},
  };
}
