import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// `vite` serves the playground (index.html); `vite build` builds the library only.
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rolldownOptions: {
      external: ['vue', '@edubeam/fem'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
      reporter: ['text', 'html'],
      // The levels reached at 0.1.0, rounded down: coverage may grow, not shrink.
      thresholds: { statements: 94, branches: 82, functions: 96, lines: 97 },
    },
  },
});
