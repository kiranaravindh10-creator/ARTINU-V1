import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The API URL lives in the repo-root .env so client and server share one file.
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '');
  const apiTarget = (env.VITE_API_URL ?? 'http://localhost:4000/api').replace(/\/api\/?$/, '');

  return {
    plugins: [react(), tailwindcss()],
    envDir: fileURLToPath(new URL('..', import.meta.url)),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/uploads': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          /*
            Vendor code, split by library rather than left to collect.

            ── What was wrong ────────────────────────────────────────────────

            The previous config named three chunks and nothing else, so every
            other dependency fell through to the entry chunk. Rollup puts a
            module shared by two or more lazy routes into the common parent,
            and with thirty-odd lazily-loaded pages sharing the same UI kit,
            "the common parent" meant almost everything: the entry chunk built
            to 748 kB (213 kB gzipped) and had to arrive, parse and execute
            before any route could render a single pixel. That is the blank
            page with a nav bar on top of it.

            The contents were not even mostly homepage code. `App.tsx` imports
            `TooltipProvider`, which pulls Radix's dropdown-menu, popover and
            tooltip; `PublicNav` pulls Radix dialog; the `@artinu/shared`
            barrel re-exports the Zod schemas, so Zod arrives with the type
            imports. A visitor reading the homepage downloaded the console's
            form machinery to look at photographs.

            ── What this does ────────────────────────────────────────────────

            Grouping by package gives each library its own chunk. Nothing is
            deleted and no route loses a feature — the same modules load, but
            in parallel rather than as one serial blob, and a chunk is fetched
            only by the routes that actually import it. They also cache
            independently: shipping a homepage copy fix no longer invalidates
            Radix, React and Zod in every returning visitor's browser.
          */
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            const path = id.replace(/\\/g, '/');

            // React, the DOM renderer, its scheduler and the router move as one.
            // Every route needs all of them, and separating them would only add
            // a load-order dependency between chunks. The trailing slashes make
            // these exact package matches, so `react-helmet-async` and
            // `react-hook-form` are not swept in.
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(path)) {
              return 'react';
            }

            // framer-motion ships its runtime across three packages.
            if (/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(path)) return 'motion';

            if (path.includes('/@tanstack/') || path.includes('node_modules/axios/')) return 'query';

            // Validation and form state — needed by registration, upload,
            // consultation and the console. Grouped because the `@artinu/shared`
            // barrel re-exports the schemas, so Zod is pulled in wherever a type
            // is imported and there is no per-route subset to preserve.
            if (/node_modules\/(zod|react-hook-form)\//.test(path) || path.includes('/@hookform/')) {
              return 'forms';
            }

            // Drag-and-drop is Console → Homepage ordering, nowhere else.
            if (path.includes('/@dnd-kit/')) return 'dnd';

            /*
              Everything else is left to Rollup, deliberately.

              Naming a manual chunk is not a hint — it forces every matching
              module into that chunk whether or not the importing route needs
              it. A catch-all `return 'vendor'` here therefore fused the entire
              Radix set into one 260 kB file that the entry depended on, so the
              homepage downloaded select, tabs, accordion, radio-group, switch
              and progress in order to render a nav bar and some arrows. Same
              trap for lucide: grouped, three icons cost 48 kB.

              Left alone, Rollup emits one small chunk per primitive and per
              icon and hoists only what is genuinely shared, so each route pays
              for what it actually renders. The groups above are kept because
              each is a single interdependent runtime that always loads as a
              unit anyway.
            */
            return undefined;
          },
        },
      },
    },
  };
});
