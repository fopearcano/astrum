import { defineConfig } from 'vite';

// Relative base so the built atlas works from any sub-path
// (GitHub Pages project sites, static hosts, or a local file server).
export default defineConfig({
  base: './',
  // Fixed dev-server port; fail clearly instead of drifting to another port if it is taken.
  server: {
    port: 5120,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
