import { useInView, useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A heading that types itself out when it scrolls into view.
 *
 * Two things make this different from the usual typewriter snippet.
 *
 * The first is that it does not reflow. Naive implementations render a growing
 * substring, so the heading is one line, then two, and everything below it
 * jumps down as the line breaks land — on a marketing page that is every
 * section heading shoving the page around while you read it. Here the untyped
 * remainder is still rendered, just with `visibility: hidden`, so the element
 * occupies its finished size and wraps at its finished break points from the
 * very first frame. Nothing moves.
 *
 * The second is that it types through markup rather than around it. The
 * headings on these pages are not plain strings — `Where photography finds its
 * <em>space</em>.` is a tree — so the walk below descends into elements and
 * splits only the text nodes, keeping the italic serif emphasis intact as it is
 * revealed.
 *
 * Reduced motion is honoured by rendering the children untouched: no wrappers,
 * no caret, no timer.
 */

/** Total number of visible characters in a node tree. */
function countChars(node: React.ReactNode): number {
  if (node === null || node === undefined || typeof node === 'boolean') return 0;
  if (typeof node === 'string') return node.length;
  if (typeof node === 'number') return String(node).length;
  if (Array.isArray(node)) return node.reduce<number>((sum, child) => sum + countChars(child), 0);
  if (React.isValidElement(node)) {
    return countChars((node.props as { children?: React.ReactNode }).children);
  }
  return 0;
}

/**
 * The same tree flattened to text, for the accessible name.
 *
 * A `<br />` has to become a space. Several of these headings break their lines
 * with one — `Tell us about<br />your walls.` — and joining the text nodes
 * directly produced "Tell us aboutyour walls." as the accessible name, which is
 * what a screen reader would then read aloud.
 */
function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement(node)) {
    if (node.type === 'br') return ' ';
    return nodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/** Collapses the whitespace a line break and the surrounding JSX leave behind. */
const accessibleName = (node: React.ReactNode) => nodeText(node).replace(/\s+/g, ' ').trim();

interface Walk {
  /** Characters walked past so far. */
  seen: number;
  /** How many characters should be visible in total. */
  cursor: number;
  /** The caret is placed once, wherever typing has currently reached. */
  caretPlaced: boolean;
  caret: React.ReactNode;
}

/**
 * Rebuilds the tree with the first `walk.cursor` characters shown and the rest
 * present but hidden. `walk` is mutated as the traversal proceeds — the whole
 * walk happens inside one render, and threading an offset back up through every
 * return value buys nothing but noise.
 */
function renderPartial(node: React.ReactNode, walk: Walk, key?: React.Key): React.ReactNode {
  if (node === null || node === undefined || typeof node === 'boolean') return node;

  if (typeof node === 'string' || typeof node === 'number') {
    const text = String(node);
    const visible = Math.min(Math.max(walk.cursor - walk.seen, 0), text.length);
    walk.seen += text.length;

    const typed = text.slice(0, visible);
    const untyped = text.slice(visible);

    // The caret belongs at the head of the first not-yet-finished run of text,
    // which is exactly where the reader's eye is.
    const showCaret = !walk.caretPlaced && untyped.length > 0;
    if (showCaret) walk.caretPlaced = true;

    return (
      <React.Fragment key={key}>
        {typed}
        {showCaret ? walk.caret : null}
        {untyped ? <span className="invisible">{untyped}</span> : null}
      </React.Fragment>
    );
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => renderPartial(child, walk, index));
  }

  if (React.isValidElement(node)) {
    const children = (node.props as { children?: React.ReactNode }).children;
    // Void elements — the `<br />` inside the closing-band headings — have
    // nothing to type, so they pass straight through.
    if (children === undefined || children === null) {
      return key === undefined ? node : React.cloneElement(node, { key });
    }
    return React.cloneElement(
      node,
      { key: key ?? node.key ?? undefined },
      renderPartial(children, walk),
    );
  }

  return node;
}

export type TypewriterTag = 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';

export function Typewriter({
  children,
  as: Tag = 'span',
  className,
  caretClassName,
  id,
  /**
   * Milliseconds per character.
   *
   * 45ms is around 22 characters a second — fast enough to feel typed rather
   * than spelled out, slow enough to actually read along with. The first pass
   * ran at 28ms and the headings were finished before the eye had settled on
   * them, which read as a flicker rather than as an entrance.
   */
  speed = 45,
  /** Beat before the first character, so the reveal and the typing do not collide. */
  startDelay = 180,
  /** Fraction of the element that must be on screen before it starts. */
  amount = 0.35,
  /** Off renders the children plainly — same element, same classes, no timer. */
  enabled = true,
}: {
  children: React.ReactNode;
  as?: TypewriterTag;
  className?: string;
  caretClassName?: string;
  id?: string;
  speed?: number;
  startDelay?: number;
  amount?: number;
  enabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount });

  const total = React.useMemo(() => countChars(children), [children]);
  const label = React.useMemo(() => accessibleName(children), [children]);

  const [cursor, setCursor] = React.useState(0);

  React.useEffect(() => {
    if (!enabled || reduced || !inView) return;

    let frame = 0;
    const begin = performance.now() + startDelay;

    // Driven off the frame clock rather than a per-character interval: the
    // count is derived from elapsed time, so a dropped frame or a backgrounded
    // tab resumes at the right place instead of finishing seconds late.
    const tick = (now: number) => {
      const elapsed = now - begin;
      const next = elapsed <= 0 ? 0 : Math.min(total, Math.floor(elapsed / speed));
      setCursor(next);
      if (next < total) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, inView, reduced, total, speed, startDelay]);

  const done = cursor >= total;

  // Finished, or never animating: hand back the children exactly as given, so
  // the settled DOM carries no wrapper spans and no hidden text.
  if (!enabled || reduced || done) {
    return (
      <Tag ref={ref as React.Ref<never>} id={id} className={className}>
        {children}
      </Tag>
    );
  }

  const walk: Walk = {
    seen: 0,
    cursor,
    caretPlaced: false,
    caret: <span className={cn('type-caret', caretClassName)} aria-hidden />,
  };

  return (
    <Tag ref={ref as React.Ref<never>} id={id} className={className} aria-label={label}>
      <span aria-hidden>{renderPartial(children, walk)}</span>
    </Tag>
  );
}
