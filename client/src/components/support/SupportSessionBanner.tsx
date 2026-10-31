import { LifeBuoy, LogOut } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { activeSupportSession, endSupportSession, type SupportState } from '@/lib/support-session';

const HEIGHT = 48;

function remaining(expiresAt: string) {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

function clock(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The bar across the top of every screen while an administrator is assisting
 * an account.
 *
 * It cannot be dismissed, only ended: whoever is looking at the screen must
 * always be able to tell they are not seeing their own account, and how to
 * leave. It ends itself when the session runs out, and the server refuses the
 * credential from that moment regardless.
 */
export function SupportSessionBanner() {
  const [state] = React.useState<SupportState | null>(() => activeSupportSession());
  const [left, setLeft] = React.useState(() => (state ? remaining(state.expiresAt) : 0));
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    if (!state) return;
    // Room at the top of the page, so the bar never covers the screen beneath it
    // - and --app-banner, so the sticky headers stop below it too.
    const previous = document.body.style.paddingTop;
    document.body.style.paddingTop = `${HEIGHT}px`;
    document.documentElement.style.setProperty('--app-banner', `${HEIGHT}px`);
    const timer = window.setInterval(() => {
      const ms = remaining(state.expiresAt);
      setLeft(ms);
      if (ms <= 0) {
        window.clearInterval(timer);
        void endSupportSession('expired');
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      document.body.style.paddingTop = previous;
      document.documentElement.style.removeProperty('--app-banner');
    };
  }, [state]);

  if (!state) return null;

  const exit = () => {
    setLeaving(true);
    void endSupportSession('exited');
  };

  return (
    <div
      role="region"
      aria-label="Support session"
      className="fixed inset-x-0 top-0 z-[80] flex items-center gap-3 border-b border-bronze/60 bg-ink px-4 text-canvas sm:px-6"
      style={{ height: HEIGHT }}
    >
      <LifeBuoy className="size-4 shrink-0 text-bronze" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-[0.8125rem]">
        <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">Support session</span>
        <span className="mx-2 text-canvas/40" aria-hidden>
          ·
        </span>
        Viewing as <strong className="font-medium">{state.targetName}</strong>
        <span className="hidden text-canvas/60 md:inline"> ({state.targetEmail})</span>
        <span className="hidden text-canvas/60 lg:inline"> · Read-only · {state.reason}</span>
      </p>
      <span className="shrink-0 font-mono text-xs tabular-nums text-canvas/70" aria-live="off">
        {clock(left)} left
      </span>
      <Button
        size="sm"
        variant="light"
        onClick={exit}
        loading={leaving}
        className="shrink-0"
      >
        <LogOut /> Exit support session
      </Button>
    </div>
  );
}
