import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: 'src',
    outDir: 'dist',

    manifest: {
        name: '__MSG_extName__',
        version: '0.1.0',
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

    vite: () => ({
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
    }),
});
