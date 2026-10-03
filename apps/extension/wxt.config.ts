import { site } from '@bookmark-scout/config';
import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { adaptManifestV2, createManifest } from './manifest.config';

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: 'src',
    outDir: 'dist',

    // WXT already scans components/, composables/, hooks/, and utils/ (top level only).
    imports: {
        dirs: ['components/**', 'lib', 'services', 'stores', '!**/index.ts'],
    },

    // Per-browser keys (permissions, the Firefox add-on ID and data collection declaration) live
    // in manifest.config.ts so unit tests can check them.
    manifest: createManifest,

    hooks: {
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
            'tsconfig.base.json',
            'apps/*/package.json',
            'packages/*/package.json',
            // wxt.config.ts reads the project slug and default locale through packages/config.
            'packages/config/src/**',
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
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
    }),
});
