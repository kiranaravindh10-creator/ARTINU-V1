import { catalogService } from '@/services/catalog.service';
import {
  calculatePricing,
  DEFAULT_FRAME,
  MIN_ORDER_QUANTITY,
  QUANTITY_PER_PHOTOGRAPH,
  type ArtworkWithArtist,
  type FrameConfiguration,
  type PriceBreakdown,
} from '@artinu/shared';
import * as React from 'react';

/**
 * The cart lives client-side until checkout: the server prices and persists it
 * when the order is created (`POST /orders`), so nothing here is trusted.
 * Each line carries a small snapshot of the artwork so the cart renders without
 * refetching every photograph.
 */
export interface CartLine {
  /** Stable per-line key — the same artwork can be added twice in two frames. */
  key: string;
  artworkId: string;
  quantity: number;
  frame: FrameConfiguration;
  snapshot: {
    title: string;
    imageUrl: string;
    artistName: string;
    orientation: string;
  };
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  /** True once the minimum-order rule is satisfied. */
  meetsMinimum: boolean;
  minimum: number;
  couponCode: string | null;
  pricing: PriceBreakdown;
  spaceId: string | null;
  setSpaceId: (id: string | null) => void;
  /**
   * Put a photograph in the cart. There is no quantity: one print per
   * photograph, and adding the same photograph in the same frame twice is a
   * double click rather than a second copy.
   *
   * `updateQuantity` was removed with the stepper it fed. Nothing outside this
   * file called it, and leaving a quantity setter on the context is an invitation
   * to reintroduce the thing that was just taken out.
   */
  add: (artwork: ArtworkWithArtist, frame?: FrameConfiguration) => void;
  updateFrame: (key: string, frame: FrameConfiguration) => void;
  remove: (key: string) => void;
  clear: () => void;
  applyCoupon: (code: string) => Promise<{ ok: boolean; message: string }>;
  removeCoupon: () => void;
  isInCart: (artworkId: string) => boolean;
}

const CartContext = React.createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'artinu.cart.v1';

interface PersistedCart {
  lines: CartLine[];
  couponCode: string | null;
  spaceId: string | null;
}

function readStored(): PersistedCart {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lines: [], couponCode: null, spaceId: null };
    const parsed = JSON.parse(raw) as Partial<PersistedCart>;
    return {
      /*
        Quantities are normalised on the way in, not just on the way out.

        Carts written by an older build are sitting in real browsers with
        quantity 3 on a single line, because the configurator used to default to
        the order minimum. Left alone, one photograph would report a count of
        three and satisfy the "three photographs" minimum on its own - the exact
        check the minimum exists to enforce.
      */
      lines: Array.isArray(parsed.lines)
        ? parsed.lines.map((line) => ({ ...line, quantity: QUANTITY_PER_PHOTOGRAPH }))
        : [],
      couponCode: parsed.couponCode ?? null,
      spaceId: parsed.spaceId ?? null,
    };
  } catch {
    return { lines: [], couponCode: null, spaceId: null };
  }
}

const frameKey = (artworkId: string, frame: FrameConfiguration) =>
  [artworkId, frame.size, frame.material, frame.color, frame.glass, frame.finish].join('|');

export function CartProvider({ children }: { children: React.ReactNode }) {
  const initial = React.useRef(readStored());
  const [lines, setLines] = React.useState<CartLine[]>(initial.current.lines);
  const [couponCode, setCouponCode] = React.useState<string | null>(initial.current.couponCode);
  const [spaceId, setSpaceId] = React.useState<string | null>(initial.current.spaceId);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines, couponCode, spaceId }));
    } catch {
      /* storage full or unavailable — the cart just won't survive a reload */
    }
  }, [lines, couponCode, spaceId]);

  const add = React.useCallback(
    (artwork: ArtworkWithArtist, frame: FrameConfiguration = DEFAULT_FRAME) => {
      const key = frameKey(artwork.id, frame);
      setLines((current) => {
        /*
          Already in the cart? Then there is nothing to do.

          This used to add the quantities together, which is right for a shop and
          wrong here: one photograph is printed once. Adding the same photograph
          in the same frame twice is a double click, not a request for a second
          copy, so the cart is left exactly as it was.
        */
        if (current.some((line) => line.key === key)) return current;
        return [
          ...current,
          {
            key,
            artworkId: artwork.id,
            quantity: QUANTITY_PER_PHOTOGRAPH,
            frame,
            snapshot: {
              title: artwork.title,
              imageUrl: artwork.thumbnailUrl || artwork.imageUrl,
              artistName: artwork.artist?.name ?? 'ARTINU artist',
              orientation: artwork.orientation,
            },
          },
        ];
      });
    },
    [],
  );

  const updateFrame = React.useCallback((key: string, frame: FrameConfiguration) => {
    setLines((current) => {
      const line = current.find((item) => item.key === key);
      if (!line) return current;
      const nextKey = frameKey(line.artworkId, frame);

      // Reconfiguring into a frame that is already in the cart merges the lines.
      const collision = current.find((item) => item.key === nextKey && item.key !== key);
      if (collision) {
        // Merge, but do not add the quantities - see `add` above.
        return current.filter((item) => item.key !== key);
      }
      return current.map((item) => (item.key === key ? { ...item, key: nextKey, frame } : item));
    });
  }, []);

  const remove = React.useCallback((key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  }, []);

  /*
    Read by applyCoupon without putting the basket in its dependency list -
    otherwise the callback is rebuilt on every line change and every consumer
    re-renders with it.
  */
  const pricingRef = React.useRef({ subtotal: 0 });
  const spaceIdRef = React.useRef<string | null>(null);

  const clear = React.useCallback(() => {
    setLines([]);
    setCouponCode(null);
  }, []);

  /*
    The server decides whether a code applies.

    This used to look the code up in a table compiled into the bundle, which
    meant the browser was the authority on what a discount was worth - and the
    only codes that could ever exist were the three that shipped with the
    build. It asks now, against this basket's real subtotal, and the same
    validator prices the order later so the two cannot disagree.

    Async, because it is a network call. The signature changed from returning a
    verdict to returning a promise of one; every caller already awaited it.
  */
  const applyCoupon = React.useCallback(
    async (code: string): Promise<{ ok: boolean; message: string }> => {
      const trimmed = code.trim();
      if (!trimmed) return { ok: false, message: 'Enter a code.' };

      try {
        const verdict = await catalogService.validateCoupon(trimmed, pricingRef.current.subtotal, spaceIdRef.current);
        if (!verdict.ok) return { ok: false, message: verdict.message };
        setCouponCode(verdict.code ?? trimmed.toUpperCase());
        return { ok: true, message: verdict.message };
      } catch {
        // A network failure is not the customer's code being wrong, and saying
        // so would send them to support over a dropped request.
        return { ok: false, message: 'We could not check that code just now. Try again.' };
      }
    },
    [],
  );

  const count = lines.reduce((sum, line) => sum + line.quantity, 0);

  const pricing = React.useMemo(
    () =>
      calculatePricing(
        lines.map((line) => ({ frame: line.frame, quantity: line.quantity })),
        /*
          No discount is computed here.

          Coupons live in the database and only the server knows what one
          is worth against this basket. The cart used to look the code up
          in a compiled-in table, so the discount it showed and the
          discount actually charged came from two different sources. The
          code is carried so checkout can send it; the money comes back
          from the server quote.
        */
        { couponCode },
      ),
    [lines, couponCode],
  );

  const value = React.useMemo<CartContextValue>(
    () => ({
      lines,
      count,
      meetsMinimum: count >= MIN_ORDER_QUANTITY,
      minimum: MIN_ORDER_QUANTITY,
      couponCode,
      pricing,
      spaceId,
      setSpaceId,
      add,
      updateFrame,
      remove,
      clear,
      applyCoupon,
      removeCoupon: () => setCouponCode(null),
      isInCart: (artworkId: string) => lines.some((line) => line.artworkId === artworkId),
    }),
    [lines, count, couponCode, pricing, spaceId, add, updateFrame, remove, clear, applyCoupon],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = React.useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
