// vite.config.mjs
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import jsconfigPaths from 'vite-jsconfig-paths';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname for ESM (.mjs)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolvePath = (str) => path.resolve(__dirname, str);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const BASE = env.VITE_APP_BASE_NAME || '/';
  const PORT = 3000;

  return {
    server: {
      open: true,
      port: PORT,
      host: true
    },
    preview: {
      open: true,
      host: true
    },
    define: {
      global: 'window'
    },
    resolve: {
      // Explicit aliases so imports like "sections/..." work on Vercel (case‑sensitive)
      alias: [
        { find: '@', replacement: resolvePath('src') },
        { find: 'assets', replacement: resolvePath('src/assets') },
        { find: 'components', replacement: resolvePath('src/components') },
        { find: 'sections', replacement: resolvePath('src/sections') },
        { find: 'views', replacement: resolvePath('src/views') },
        { find: 'hooks', replacement: resolvePath('src/hooks') },
        { find: 'styles', replacement: resolvePath('src/styles') },
        { find: 'services', replacement: resolvePath('src/services') },
        { find: 'utils', replacement: resolvePath('src/utils') },
        { find: 'menu-items', replacement: resolvePath('src/menu-items') },
        { find: 'layout', replacement: resolvePath('src/layout') }
      ]
    },
    css: {
      preprocessorOptions: {
        scss: { charset: false },
        less: { charset: false }
      },
      charset: false,
      postcss: {
        plugins: [
          {
            postcssPlugin: 'internal:charset-removal',
            AtRule: {
              charset: (atRule) => {
                if (atRule.name === 'charset') atRule.remove();
              }
            }
          }
        ]
      }
    },
    build: {
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        input: {
          main: resolvePath('index.html'),
          legacy: resolvePath('index.html')
        }
      }
    },
    base: BASE,
    plugins: [react(), jsconfigPaths()]
  };
});
