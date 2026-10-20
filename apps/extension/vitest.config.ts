import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
import { createProviderLogoAssets } from './build/provider-logo-assets';
import { siteDefines } from './build/site-defines';
import { tomlConfig } from './build/toml-config';

export default defineConfig({
  plugins: [
    WxtVitest(),
    tomlConfig(),
    createProviderLogoAssets(path.resolve(__dirname, './public')).plugin,
  ],
  define: siteDefines,
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup/register-locales.ts'],
    // The drop indicator imports its compiled CSS, which Node cannot load: use its ES module build
    // (as the extension build does) and let Vite transform it.
    alias: [
      {
        find: /^@atlaskit\/pragmatic-drag-and-drop-react-drop-indicator\/(.+)$/,
        replacement: '@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/dist/esm/$1.js',
      },
    ],
    server: { deps: { inline: [/@atlaskit\/pragmatic-drag-and-drop-react-drop-indicator/] } },
  },
});
