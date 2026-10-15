import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
import { tomlConfig } from './build/toml-config';
import path from 'node:path';
import { createProviderLogoAssets } from './build/provider-logo-assets';
import { siteDefines } from './build/site-defines';

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
  },
});
