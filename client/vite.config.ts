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
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion'],
            query: ['@tanstack/react-query', 'axios'],
          },
        },
      },
    },
  };
});
