/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        notion: {
          bg: '#ffffff',
          sidebar: '#f7f7f5',
          hover: '#efefee',
          border: '#e9e9e7',
          text: '#37352f',
          subtext: '#787774',
          accent: '#2383e2'
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Microsoft YaHei',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
}
