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
        surface: '#FFFDF8',
        canvas: '#F5F0E8',
        ink: '#1A1A1A',
        'ink-muted': '#6B6B6B',
      },
      fontFamily: {
        display: ['Poppins', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'hero-zoom-out': {
          '0%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
        'hero-progress-fill': {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
      },
      animation: {
        'hero-zoom-out': 'hero-zoom-out 5000ms ease-out forwards',
        'hero-progress-fill': 'hero-progress-fill 5000ms linear forwards',
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
