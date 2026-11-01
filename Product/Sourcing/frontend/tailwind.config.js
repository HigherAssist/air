/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Match AIR's BlueLagoon brand color
        brand: {
          DEFAULT: '#0e7490',
          light: '#06b6d4',
          dark: '#0c5f75',
        },
      },
    },
  },
  plugins: [],
};
