import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

const OPTIONAL_WEB_ORIGINS = ['http://*/*', 'https://*/*'];

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: 'src',
    outDir: 'dist',

    // WXT already scans components/, composables/, hooks/, and utils/ (top level only).
    imports: {
        dirs: ['components/**', 'lib', 'services', 'stores', '!**/index.ts'],
    },

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
        // Requested at click time only, never at install: website access for the dead-link and
        // metadata tools, and per-origin access for the AI provider Verify Service check.
        optional_host_permissions: OPTIONAL_WEB_ORIGINS,
        web_accessible_resources: [
            {
                resources: ['_favicon/*'],
                matches: ['<all_urls>'],
                extension_ids: ['*'],
            },
        ],
    },

    hooks: {
        // MV2 (Firefox) has no optional_host_permissions; origins go in optional_permissions.
        'build:manifestGenerated': (wxt, manifest) => {
            if (wxt.config.manifestVersion !== 2) return;
            manifest.optional_permissions = [
                ...(manifest.optional_permissions ?? []),
                ...OPTIONAL_WEB_ORIGINS,
            ] as typeof manifest.optional_permissions;
            delete manifest.optional_host_permissions;
        },
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
