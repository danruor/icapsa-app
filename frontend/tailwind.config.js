/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#E1F5EE',
          100: '#9FE1CB',
          500: '#1D9E75',
          600: '#0F6E56',
          900: '#04342C'
        }
      }
    }
  },
  plugins: []
}
