/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#203048', 50: '#EEF1F6', 100: '#D9DFEA', 600: '#2A3D5C', 700: '#203048', 800: '#18243A' },
        accent: { DEFAULT: '#FF7700', 50: '#FFF3E8', 100: '#FFE2C7', 600: '#E66A00' },
        surface: '#F7F8FA',
        ink: '#111827',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,24,39,.04), 0 4px 16px rgba(32,48,72,.06)',
      },
    },
  },
  plugins: [],
};
