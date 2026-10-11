/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [__dirname + '/index.html'],
  theme: {
    extend: {
      colors: {
        // Dark "command center" surfaces
        ink: { 950: '#05081A', 900: '#080D24', 800: '#0E1533', 700: '#151E45', 600: '#1E2A5C', 500: '#2B3A78' },
        // Brand: the logo's blue and red
        brand: {
          blue: '#1E5BFF', blueDeep: '#2A1B8F', blueSoft: '#7FA2FF',
          red: '#FF1F3D', redDeep: '#D0003F', redSoft: '#FF8A9A',
        },
        mist: { 100: '#EEF1FF', 300: '#BAC4EA', 400: '#8E9AC8', 500: '#6B78A8' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'Inter', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        bubble: '0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 60px -12px rgba(0,0,0,0.6)',
        glow: '0 10px 30px -6px rgba(255,31,61,0.45), 0 6px 24px -8px rgba(30,91,255,0.55)',
        glowHover: '0 14px 40px -4px rgba(255,31,61,0.6), 0 8px 32px -6px rgba(30,91,255,0.7)',
        ring: '0 0 0 4px rgba(30,91,255,0.25)',
      },
    },
  },
  plugins: [],
};
