import * as React from 'react';

interface State {
  error: Error | null;
}

/**
 * The outermost safety net. React Router handles errors thrown inside routes,
 * but anything that fails above it — a provider, the router itself — would
 * otherwise unmount the tree and leave a blank page. This catches that and
 * says what happened.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the detail in the console for whoever is debugging.
    console.error('ARTINU failed to render:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-16">
        <div className="w-full max-w-xl">
          <p className="eyebrow">ARTINU</p>
          <h1 className="mt-3 font-display text-[2rem] leading-tight text-ink">
            Something broke while rendering.
          </h1>
          <p className="prose-quiet mt-3">
            The application loaded but hit an error it could not recover from. Reloading usually
            clears it; if it does not, the detail below says why.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-ink px-5 py-2.5 text-sm text-canvas transition-colors hover:bg-ink-soft"
            >
              Reload the page
            </button>
            <button
              type="button"
              onClick={() => {
                // A corrupt token or cart is the most common cause of a boot loop.
                try {
                  localStorage.removeItem('artinu.token');
                  localStorage.removeItem('artinu.cart.v1');
                } catch {
                  /* storage unavailable — nothing to clear */
                }
                window.location.assign('/');
              }}
              className="rounded-md border border-line-strong px-5 py-2.5 text-sm text-ink transition-colors hover:bg-sand-soft"
            >
              Reset local data &amp; start over
            </button>
          </div>

          <pre className="mt-6 max-h-72 overflow-auto rounded-md border border-line bg-surface p-4 font-mono text-xs text-danger">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        </div>
      </div>
    );
  }
}
