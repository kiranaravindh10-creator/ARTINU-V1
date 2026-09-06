import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

declare global {
  interface Window {
    /** Read by the boot-diagnostic panel in index.html. */
    __ARTINUMounted?: boolean;
  }
}

/**
 * Clears the fallback social tags baked into index.html.
 *
 * Those tags exist so a crawler that does not run JavaScript still gets a
 * preview, and they are marked `data-rh="true"` in the belief that
 * react-helmet-async would adopt and replace them. It does not: Helmet only
 * reconciles tags it inserted itself, so the hand-written ones simply stayed,
 * and an artwork page ended up serving three `og:image` tags and three
 * `<link rel="canonical">` — with the generic site card first, which is the one
 * most readers take.
 *
 * Removing them here, before the first render, leaves exactly one set: whatever
 * the current route decided. The server-rendered fallback is untouched for
 * anyone who never runs this file.
 */
function clearBootstrapMeta(): void {
  document
    .querySelectorAll('head > meta[data-rh="true"], head > link[data-rh="true"]')
    .forEach((node) => node.remove());
}

clearBootstrapMeta();

/**
 * Opens the connection to the API before anything asks for it.
 *
 * The API is on a different origin from the site — the React app is served by
 * Vercel, the Express API from Render — so the first request has to pay a DNS
 * lookup, a TCP handshake and a TLS negotiation before it can even send a byte.
 * On a phone on mobile data that is a few hundred milliseconds spent doing
 * nothing, and it lands squarely in front of the homepage's content request.
 *
 * `preconnect` gets the browser doing all three during module evaluation,
 * in parallel with React booting, so the connection is already open and warm by
 * the time the first fetch goes out.
 *
 * It is a hint, not a guarantee, and a wrong or same-origin value must not
 * throw — hence the try/catch and the origin comparison. A dev build proxying
 * `/api` through Vite is same-origin and correctly does nothing here.
 */
function preconnectToApi(): void {
  try {
    const configured = import.meta.env.VITE_API_URL ?? '/api';
    const origin = new URL(configured, window.location.href).origin;
    if (origin === window.location.origin) return;

    for (const crossOrigin of [false, true]) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      // Two hints: one for the socket, one for the credentialed CORS
      // connection the API is actually called over. Browsers keep those
      // separate, so a single uncredentialed hint warms the wrong pool.
      if (crossOrigin) link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  } catch {
    /* a malformed VITE_API_URL must not stop the app from booting */
  }
}

preconnectToApi();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Tells the boot panel the app is alive, so it stays hidden.
window.__ARTINUMounted = true;
