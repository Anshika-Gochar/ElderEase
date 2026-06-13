/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#F5F4F0',
          green: '#2BBD8E',
          blue: '#4A9EE8',
          amber: '#F5A623',
          red: '#EF4444',
          sidebar: '#FFFFFF',
          activeNav: '#EEF6FF',
          activeText: '#1E6FD9',
          textPrimary: '#1A202C',
          textMuted: '#718096',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08)',
        cardHover: '0 4px 12px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
