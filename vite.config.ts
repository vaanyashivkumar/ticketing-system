import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';

// Path aliases mirror tsconfig.app.json `paths`. Keep the two in sync.
const alias = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// package.json is the SINGLE SOURCE of the version (P18 §8). Read in the Node config so
// the manifest itself is never bundled into the client.
const pkg = createRequire(import.meta.url)('./package.json') as { version: string };

export default defineConfig({
  // GitHub Pages serves a project site from a sub-path (/<repo>/); the Pages workflow sets
  // VITE_BASE_PATH to that. Vercel and local dev serve from the root, so the default is '/'.
  base: process.env.VITE_BASE_PATH || '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
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
  server: { port: 5173, strictPort: false },
});
