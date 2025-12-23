import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: 'src',
    outDir: 'dist',

    manifest: {
        name: 'Bookmark Scout',
        version: '1.0.0',
        description: 'Quickly search and save bookmarks to specific folders.',
        icons: {
            16: 'icon-16.png',
            32: 'icon-32.png',
            48: 'icon-48.png',
            96: 'icon-96.png',
            128: 'icon-128.png',
        },
        permissions: ['bookmarks', 'tabs', 'favicon', 'storage', 'sidePanel'],
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
