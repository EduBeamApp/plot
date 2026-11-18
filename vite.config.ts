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
      external: ['vue', 'ts-fem'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
