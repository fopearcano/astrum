import { defineConfig } from 'vite';

// Relative base so the built atlas works from any sub-path
// (GitHub Pages project sites, static hosts, or a local file server).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
