/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Charter', 'Cambria', 'Georgia', 'serif'],
      },
      colors: {
        // The design tokens live in workspace.css; these follow them for the rare utility class.
        ink: 'var(--text)',
        muted: 'var(--muted)',
        canvas: 'var(--canvas)',
        paper: 'var(--surface)',
        accent: 'var(--accent)',
      },
      boxShadow: {
        soft: '0 12px 35px rgba(48, 42, 34, 0.07)',
      },
    },
  },
  plugins: [],
}
