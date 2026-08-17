import {
  calculatePricing,
  DEFAULT_FRAME,
  MIN_ORDER_QUANTITY,
  resolveCoupon,
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
  add: (artwork: ArtworkWithArtist, frame?: FrameConfiguration, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  updateFrame: (key: string, frame: FrameConfiguration) => void;
  remove: (key: string) => void;
  clear: () => void;
  applyCoupon: (code: string) => { ok: boolean; message: string };
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
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
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
    (artwork: ArtworkWithArtist, frame: FrameConfiguration = DEFAULT_FRAME, quantity = 1) => {
      const key = frameKey(artwork.id, frame);
      setLines((current) => {
        const existing = current.find((line) => line.key === key);
        if (existing) {
          return current.map((line) =>
            line.key === key ? { ...line, quantity: line.quantity + quantity } : line,
          );
        }
        return [
          ...current,
          {
            key,
            artworkId: artwork.id,
            quantity,
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

  const updateQuantity = React.useCallback((key: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.key !== key)
        : current.map((line) => (line.key === key ? { ...line, quantity } : line)),
    );
  }, []);

  const updateFrame = React.useCallback((key: string, frame: FrameConfiguration) => {
    setLines((current) => {
      const line = current.find((item) => item.key === key);
      if (!line) return current;
      const nextKey = frameKey(line.artworkId, frame);

      // Reconfiguring into a frame that is already in the cart merges the lines.
      const collision = current.find((item) => item.key === nextKey && item.key !== key);
      if (collision) {
        return current
          .filter((item) => item.key !== key)
          .map((item) =>
            item.key === nextKey ? { ...item, quantity: item.quantity + line.quantity } : item,
          );
      }
      return current.map((item) => (item.key === key ? { ...item, key: nextKey, frame } : item));
    });
  }, []);

  const remove = React.useCallback((key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  }, []);

  const clear = React.useCallback(() => {
    setLines([]);
    setCouponCode(null);
  }, []);

  const applyCoupon = React.useCallback((code: string) => {
    const coupon = resolveCoupon(code);
    if (!coupon) return { ok: false, message: 'That code is not valid.' };
    setCouponCode(code.trim().toUpperCase());
    return { ok: true, message: coupon.label };
  }, []);

  const count = lines.reduce((sum, line) => sum + line.quantity, 0);

  const pricing = React.useMemo(
    () =>
      calculatePricing(
        lines.map((line) => ({ frame: line.frame, quantity: line.quantity })),
        { discountPercent: resolveCoupon(couponCode)?.percent ?? 0, couponCode },
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
      updateQuantity,
      updateFrame,
      remove,
      clear,
      applyCoupon,
      removeCoupon: () => setCouponCode(null),
      isInCart: (artworkId: string) => lines.some((line) => line.artworkId === artworkId),
    }),
    [lines, count, couponCode, pricing, spaceId, add, updateQuantity, updateFrame, remove, clear, applyCoupon],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = React.useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
