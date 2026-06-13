/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#2BBD8E',
          blue: '#4A9EE8',
          amber: '#F5A623',
          red: '#EF4444',
          bg: '#F5F4F0',
          sidebar: '#FFFFFF',
          card: '#FFFFFF',
          border: '#E2E8F0',
          'text-primary': '#1A202C',
          'text-secondary': '#718096',
          'nav-active-bg': '#EEF6FF',
          'nav-active-text': '#1E6FD9',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.1)',
      },
      borderRadius: {
        card: '12px',
        badge: '6px',
      }
    },
  },
  plugins: [],
}
