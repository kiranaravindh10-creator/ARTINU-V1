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

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Tells the boot panel the app is alive, so it stays hidden.
window.__ARTINUMounted = true;
