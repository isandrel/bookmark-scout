import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src') // Ensure '@' points to './src'
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: [],
      input: {
        main: path.resolve(__dirname, 'src/index.html'),
        options: path.resolve(__dirname, 'src/options.html'),
        popup: path.resolve(__dirname, 'src/popup.html'),
        bookmarks: path.resolve(__dirname, 'src/bookmarks.html'),
        sidepanel: path.resolve(__dirname, 'src/sidepanel.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  css: {
    postcss: './postcss.config.js',
  },
});
