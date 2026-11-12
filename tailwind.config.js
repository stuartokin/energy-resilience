/** @type {import('tailwindcss').Config} */
// Tailwind is built into the site at publish time (it used to load from a CDN at runtime).
export default {
    content: ['./index.html', './*.tsx', './components/**/*.tsx', './content/**/*.ts', './services/**/*.ts'],
    theme: {
        extend: {
            keyframes: {
                fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
                slideDown: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'none' } },
                slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
            },
            animation: {
                fadeIn: 'fadeIn 0.2s ease-out',
                slideDown: 'slideDown 0.25s ease-out',
                slideUp: 'slideUp 0.25s ease-out',
            },
        },
    },
    plugins: [],
};
