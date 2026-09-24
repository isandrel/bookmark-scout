import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: 'src',
    outDir: 'dist',

    manifest: {
        name: '__MSG_extName__',
        description: '__MSG_extDescription__',
        default_locale: 'en',
        icons: {
            16: 'icon-16.png',
            32: 'icon-32.png',
            48: 'icon-48.png',
            96: 'icon-96.png',
            128: 'icon-128.png',
        },
        action: {
            default_icon: {
                16: 'icon-16.png',
                32: 'icon-32.png',
                48: 'icon-48.png',
            },
        },
        permissions: ['bookmarks', 'tabs', 'favicon', 'storage', 'sidePanel', 'contextMenus'],
        web_accessible_resources: [
            {
                resources: ['_favicon/*'],
                matches: ['<all_urls>'],
                extension_ids: ['*'],
            },
        ],
    },

    // Release asset names match the tag, e.g. bookmark-scout-v0.2.0-chrome.zip.
    // Sources are zipped from the workspace root because dependencies and the
    // lockfile live there; reviewers rebuild with SOURCE_CODE_REVIEW.md.
    zip: {
        name: 'bookmark-scout',
        artifactTemplate: '{{name}}-v{{packageVersion}}-{{browser}}.zip',
        sourcesTemplate: '{{name}}-v{{packageVersion}}-sources.zip',
        sourcesRoot: path.resolve(__dirname, '../..'),
        includeSources: [
            // Tailwind's source detection honors .gitignore; without it, rebuilt CSS differs.
            '.gitignore',
            'package.json',
            'bun.lockb',
            'tsconfig.base.json',
            'apps/*/package.json',
            'packages/*/package.json',
            'apps/extension/**',
        ],
        excludeSources: [
            'apps/extension/dist/**',
            'apps/extension/tests/**',
            'apps/extension/test-results/**',
            'apps/extension/playwright.config.ts',
            'apps/extension/vitest.config.ts',
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
