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
    // Split the big libraries into their own files so the browser can cache them between releases
    build: {
        chunkSizeWarningLimit: 1100,
        rollupOptions: {
            output: {
                manualChunks: {
                    map: ['maplibre-gl', 'pmtiles'],
                    charts: ['recharts'],
                    ai: ['@google/genai'],
                },
            },
        },
    },
    // Build stamp shown in Help (GITHUB_SHA is set automatically in GitHub Actions)
    define: {
        __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
        __BUILD_COMMIT__: JSON.stringify((process.env.GITHUB_SHA || '').slice(0, 7)),
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        }
    }
});
