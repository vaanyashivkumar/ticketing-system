import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';

const alias = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Mirror vite.config.ts: __APP_VERSION__ must resolve under test too (P18 §8).
const pkg = createRequire(import.meta.url)('./package.json') as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': alias('./src'),
      '@app': alias('./src/app'),
      '@components': alias('./src/components'),
      '@features': alias('./src/features'),
      '@config': alias('./src/config'),
      '@domain': alias('./src/domain'),
      '@services': alias('./src/services'),
      '@stores': alias('./src/stores'),
      '@hooks': alias('./src/hooks'),
      '@layouts': alias('./src/layouts'),
      '@providers': alias('./src/providers'),
      '@routes': alias('./src/routes'),
      '@lib': alias('./src/lib'),
      '@styles': alias('./src/styles'),
    },
  },
});
