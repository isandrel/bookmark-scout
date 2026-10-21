import { site } from '@bookmark-scout/config';
import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { adaptManifestV2, createManifest } from './manifest.config';
import { tomlConfig } from './build/toml-config';
import { compactDistributionLocales } from './build/distribution-assets';
import { createProviderLogoAssets } from './build/provider-logo-assets';
import { siteDefines } from './build/site-defines';
import { e2eCoverageEnabled, extensionOutDir } from './build/e2e-coverage';

const providerLogos = createProviderLogoAssets(path.resolve(__dirname, './public'));

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: 'src',
    // The end-to-end coverage build has its own folder (build/e2e-coverage.toml).
    outDir: extensionOutDir(),

    // WXT already scans components/, composables/, hooks/, and utils/ (top level only).
    // `*.lazy.ts(x)` files are loaded on first use with import(); an auto-import would make them
    // static and put them (the AI SDK, for one) in the chunk every page loads.
    imports: {
        dirs: [
            'components/**',
            'lib',
            'lib/storage',
            'services',
            'stores',
            '!**/index.ts',
            '!**/*.lazy.ts',
            '!**/*.lazy.tsx',
        ],
    },

    // Per-browser keys (permissions, the Firefox add-on ID and data collection declaration) live
    // in manifest.config.ts so unit tests can check them.
    manifest: createManifest,

    hooks: {
        'build:done': async (wxt, output) => {
            if (wxt.config.command !== 'build') return;
            const removed = new Set(await providerLogos.removeDuplicateOutputs(wxt.config.outDir));
            const retained = output.publicAssets.filter((asset) => !removed.has(asset.fileName));
            output.publicAssets.splice(0, output.publicAssets.length, ...retained);
            await compactDistributionLocales(wxt.config.outDir);
        },
        'build:manifestGenerated': (wxt, manifest) => {
            if (wxt.config.manifestVersion === 2) adaptManifestV2(manifest);
        },
    },

    // Release asset names match the tag, e.g. bookmark-scout-v0.2.0-chrome.zip.
    // Sources are zipped from the workspace root because dependencies and the
    // lockfile live there; reviewers rebuild with SOURCE_CODE_REVIEW.md.
    zip: {
        name: site.slug,
        artifactTemplate: '{{name}}-v{{packageVersion}}-{{browser}}.zip',
        sourcesTemplate: '{{name}}-v{{packageVersion}}-sources.zip',
        sourcesRoot: path.resolve(__dirname, '../..'),
        includeSources: [
            // Tailwind's source detection honors .gitignore; without it, rebuilt CSS differs.
            '.gitignore',
            'package.json',
            'bun.lock',
            // Preserve the locked workspace's isolated dependency resolution for reviewers.
            'bunfig.toml',
            'tsconfig.base.json',
            'apps/*/package.json',
            'packages/*/package.json',
            // wxt.config.ts reads the project slug and default locale through packages/config.
            'packages/config/src/**',
            // The background imports the shared native messaging protocol, not the native host.
            'packages/mcp-bridge/src/protocol.ts',
            'config/project.toml',
            'config/web.toml',
            'apps/extension/**',
        ],
        excludeSources: [
            'apps/extension/dist/**',
            'apps/extension/tests/**',
            'apps/extension/test-results/**',
            'apps/extension/playwright.config.ts',
            'apps/extension/vitest.config.ts',
            'packages/config/src/**/*.test.ts',
        ],
    },

    vite: () => ({
        plugins: [tomlConfig(), providerLogos.plugin, react()],
        define: siteDefines,
        // Inline source maps let coverage lead back to the sources; only in the coverage build.
        ...(e2eCoverageEnabled() ? { build: { sourcemap: 'inline' as const } } : {}),
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
    }),
});
