import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// JS and CSS are inlined into the page; models, textures and sky live in public/assets
// and are published next to the page, so every path must stay relative.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
});
