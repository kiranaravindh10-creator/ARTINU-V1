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

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Tells the boot panel the app is alive, so it stays hidden.
window.__ARTINUMounted = true;
