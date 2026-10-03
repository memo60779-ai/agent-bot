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
        sans: ['Tajawal', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'page-in': { from: { opacity: '0', transform: 'translateX(-18px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        pop: { '0%': { transform: 'scale(.6)', opacity: '0' }, '70%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'pulse-ring': { '0%': { boxShadow: '0 0 0 0 rgba(255,119,0,.4)' }, '100%': { boxShadow: '0 0 0 10px rgba(255,119,0,0)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: {
        'page-in': 'page-in .32s cubic-bezier(.2,.8,.2,1) both',
        'fade-up': 'fade-up .45s cubic-bezier(.2,.8,.2,1) both',
        pop: 'pop .45s cubic-bezier(.2,.8,.2,1) both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,24,39,.04), 0 4px 16px rgba(32,48,72,.06)',
      },
    },
  },
  plugins: [],
};
