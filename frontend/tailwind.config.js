/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [__dirname + '/index.html'],
  theme: {
    extend: {
      colors: {
        // Apple-style dark surfaces: true black, then layered graphite
        ink: { 950: '#000000', 900: '#0A0A0C', 800: '#141416', 700: '#1C1C1E', 600: '#2C2C2E', 500: '#3A3A3C' },
        // Brand: the logo's blue and red, used sparingly as accents
        brand: {
          blue: '#0A66FF', blueDeep: '#2A1B8F', blueSoft: '#4DA3FF',
          red: '#FF2D46', redDeep: '#D0003F', redSoft: '#FF6B7E',
        },
        // Text greys (Apple's #F5F5F7 / #A1A1A6 / #86868B scale)
        mist: { 100: '#F5F5F7', 300: '#D2D2D7', 400: '#A1A1A6', 500: '#86868B' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Helvetica Neue"', '"Segoe UI"', 'Inter', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        bubble: '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 50px -20px rgba(0,0,0,0.8)',
        glow: '0 8px 24px -10px rgba(10,102,255,0.6)',
        glowHover: '0 10px 30px -8px rgba(10,102,255,0.75)',
        ring: '0 0 0 4px rgba(10,102,255,0.3)',
      },
    },
  },
  plugins: [],
};
