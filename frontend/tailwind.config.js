/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [__dirname + '/index.html'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0A1F44', 800: '#0F2B5B', 700: '#16397A', 500: '#3A5A99', 100: '#E6ECF7' },
        gold: { 600: '#B8860B', 500: '#D4A537', 400: '#E6BE5A', 300: '#F2D58A' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'Inter', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        bubble: '0 1px 2px rgba(10,31,68,0.04), 0 12px 40px -8px rgba(10,31,68,0.14)',
        glow: '0 0 0 1px rgba(212,165,55,0.35), 0 8px 28px -4px rgba(212,165,55,0.55)',
        glowHover: '0 0 0 1px rgba(212,165,55,0.5), 0 10px 40px -2px rgba(212,165,55,0.75)',
      },
    },
  },
  plugins: [],
};
