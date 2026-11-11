import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No API keys are built into this site.
// Gemini keys are supplied by each visitor in the app and kept in their own browser.
export default defineConfig({
    // Relative base so the site works at https://<user>.github.io/<repo>/
    base: './',
    server: {
        port: 3000,
        host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        }
    }
});
