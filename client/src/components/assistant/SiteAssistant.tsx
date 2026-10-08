import { CONTACT } from '@artinu/shared';
import { ArrowUp, X } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import type { AssistantAction, AssistantContext } from '@/components/assistant/engine';
import { GREETING, STARTERS } from '@/components/assistant/starters';
import { cn } from '@/lib/utils';

/**
 * THE ARTINU HELP DESK.
 *
 * ── What it is deliberately not ─────────────────────────────────────────────
 *
 * It is not a chatbot dressed in ARTINU's colours. No robot glyph, no sparkles,
 * no gradient, no "Powered by AI", no bouncing dots, no speech bubbles with
 * tails. A visitor should read it as a small part of the site that answers
 * questions, and never think about what is behind it.
 *
 * So the answers are set as website copy — the same serif display face for the
 * heading, the same body size, the same hairline rules and bronze accent as the
 * rest of the page. The visitor's own words are the only thing in a container,
 * and that container is a quiet sand panel rather than a coloured bubble.
 *
 * ── Where it sits ───────────────────────────────────────────────────────────
 *
 * Bottom-right on a desktop, above the safe area on a phone, and mounted in
 * PublicLayout so it is a property of the public site rather than something
 * each page opts into. The signed-in areas (space, studio, console) use their
 * own layouts and never show it.
 *
 * ── Where the answers come from ─────────────────────────────────────────────
 *
 * `engine.ts`, in the browser, from ARTINU's own approved wording in
 * `knowledge.ts`. Nothing is sent anywhere. The engine is loaded the first time
 * the panel opens, so a visitor who never asks a question never downloads it.
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actions?: AssistantAction[];
  source?: string;
}

type Engine = typeof import('@/components/assistant/engine');

let enginePromise: Promise<Engine> | null = null;

/** One download per visit. A failed chunk load is forgotten so the next question retries it. */
function loadEngine(): Promise<Engine> {
  enginePromise ??= import('@/components/assistant/engine').catch((error: unknown) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

const preload = () => {
  loadEngine().catch(() => undefined);
};

export function SiteAssistant() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  /*
    What the next question may lean on: the last price, so "and 6 frames?"
    follows "how much is A4?". A ref, not state, because nothing renders from it.
  */
  const contextRef = React.useRef<AssistantContext>({});
  // Guards a double Enter while the engine is still loading.
  const busyRef = React.useRef(false);

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busyRef.current) return;
    busyRef.current = true;

    setMessages((current) => [...current, { role: 'user', content: trimmed }]);
    setSuggestions([]);
    setDraft('');
    setPending(true);

    try {
      const engine = await loadEngine();
      const turn = engine.reply(trimmed, contextRef.current);
      contextRef.current = turn.context;
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: turn.reply.answer,
          actions: turn.reply.actions,
          source: turn.reply.source,
        },
      ]);
      setSuggestions(turn.reply.suggestions);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            'Something went wrong on my side. Try again, or contact the ARTINU team and they will help.',
        },
      ]);
      setSuggestions([]);
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  };

  // Keep the newest line in view as the conversation grows.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  // Escape closes, the one convention worth honouring for a floating panel.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // Fetch the answers while the visitor is still reading the greeting.
    preload();
  }, [open]);

  const chips = messages.length === 0 ? STARTERS : suggestions;

  return (
    <>
      {/* ── Launcher ─────────────────────────────────────────────────────── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          onPointerEnter={preload}
          onFocus={preload}
          className={cn(
            'fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-line-strong',
            'bg-canvas px-4 py-2.5 font-label text-[0.6875rem] uppercase tracking-[0.14em] text-ink',
            'shadow-subtle transition-all duration-300 hover:bg-sand-soft hover:shadow-card',
            'sm:bottom-6 sm:right-6',
            'motion-safe:animate-[fade-in_0.4s_ease-out]',
          )}
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* A bronze full stop, not an icon. It reads as a mark, not a bot. */}
          <span className="size-1.5 rounded-full bg-bronze" aria-hidden />
          Ask ARTINU
        </button>
      )}

      {/* ── Panel ────────────────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-label="Ask ARTINU"
          className={cn(
            'fixed z-40 flex flex-col overflow-hidden border border-line bg-canvas shadow-lg',
            // Phone: a bottom sheet across the width. Desktop: a panel in the corner.
            'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl',
            'sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[34rem] sm:max-h-[calc(100dvh-6rem)] sm:w-[24rem] sm:rounded-xl',
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <p className="font-display text-lg leading-none text-ink">ARTINU</p>
              <p className="mt-1.5 text-xs text-subtle">Questions about the walls, the work, or the price.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mr-1.5 -mt-1 shrink-0 rounded-full p-1.5 text-subtle transition-colors hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5" aria-live="polite">
            {messages.length === 0 && (
              <p className="font-display text-xl leading-snug text-ink">{GREETING}</p>
            )}

            <div className="space-y-6">
              {messages.map((message, index) =>
                message.role === 'user' ? (
                  <p
                    key={index}
                    className="ml-auto max-w-[85%] break-words rounded-lg bg-sand-soft px-3.5 py-2.5 text-right text-sm text-ink"
                  >
                    {message.content}
                  </p>
                ) : (
                  <div key={index}>
                    {/* Set as page copy, not as a bubble. */}
                    <p className="whitespace-pre-line break-words text-sm leading-relaxed text-ink">
                      {message.content}
                    </p>
                    {/* Real routes only, see ACTIONS in knowledge.ts. */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.actions.map((action) => (
                          <Link
                            key={action.to}
                            to={action.to}
                            onClick={() => setOpen(false)}
                            className="rounded-full border border-line-strong px-3 py-1.5 font-label text-[0.625rem] uppercase tracking-[0.14em] text-ink transition-colors hover:border-ink hover:bg-sand-soft"
                          >
                            {action.label}
                          </Link>
                        ))}
                      </div>
                    )}
                    {message.source && (
                      <p className="mt-2 font-label text-[0.625rem] uppercase tracking-[0.14em] text-subtle">
                        From ARTINU · {message.source}
                      </p>
                    )}
                  </div>
                ),
              )}

              {pending && <p className="text-sm text-subtle">Thinking...</p>}
            </div>

            {/* Suggestions: the openers first, then follow-ups the answer earned. */}
            {chips.length > 0 && !pending && (
              <div className="mt-6 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void send(chip)}
                    className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-ink-soft transition-colors hover:border-line-strong hover:bg-sand-soft"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/*
              The way out when the assistant cannot help. Uses the real contact
              route and the real number from CONTACT — nothing invented, and it
              stays correct if either changes.
            */}
            {messages.length > 0 && !pending && (
              <p className="mt-6 border-t border-line pt-4 text-xs text-subtle">
                Need a person?{' '}
                <Link to="/lets-talk" onClick={() => setOpen(false)} className="text-ink underline underline-offset-4 hover:text-bronze">
                  Talk to the team
                </Link>{' '}
                or call{' '}
                <a href={`tel:${CONTACT.phoneRaw}`} className="text-ink underline underline-offset-4 hover:text-bronze">
                  {CONTACT.phone}
                </a>
                .
              </p>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
            className="flex items-end gap-2 border-t border-line px-4 py-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter is a newline.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Ask anything about ARTINU"
              aria-label="Ask anything about ARTINU"
              maxLength={500}
              className="max-h-24 min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-subtle"
            />
            <button
              type="submit"
              disabled={!draft.trim() || pending}
              aria-label="Send"
              className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-canvas transition-opacity disabled:opacity-25"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
