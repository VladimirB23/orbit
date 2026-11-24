import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const api = process.env.ORBIT_API ?? 'http://127.0.0.1:8420';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // Host stays as the browser sent it: the server compares it with Origin.
    proxy: { '/api': { target: api, changeOrigin: false } },
  },
  // Served from this computer: one file is fine, there is nothing to split yet.
  build: { target: 'es2023', chunkSizeWarningLimit: 1000 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    restoreMocks: true,
  },
});
