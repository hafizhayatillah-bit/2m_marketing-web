/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./partials/**/*.html",
    "./assets/js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0766AD',
        secondary: '#29ADB2',
        accent: '#C5E898',
        surface: '#FFFFFF',
        canvas: '#F3F3F3',
        ink: '#1A1A1A',
        'ink-muted': '#6B6B6B',
      },
      fontFamily: {
        display: ['Poppins', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
