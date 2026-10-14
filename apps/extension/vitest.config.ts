import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
import { tomlConfig } from './build/toml-config';

export default defineConfig({
  plugins: [WxtVitest(), tomlConfig()],
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup/register-locales.ts'],
  },
});
