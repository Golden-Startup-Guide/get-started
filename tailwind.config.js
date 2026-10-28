/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#292824',
        muted: '#89877f',
        canvas: '#f8f7f4',
        paper: '#fffefa',
        accent: '#e98571',
      },
      boxShadow: {
        soft: '0 12px 35px rgba(48, 42, 34, 0.07)',
      },
    },
  },
  plugins: [],
}
