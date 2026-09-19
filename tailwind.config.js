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
        primary: '#04328d',
        secondary: '#0a2ea5',
        accent: '#E50000',
        ocean: '#004E8A',
        surface: '#FFFFFF',
        canvas: '#F8FAFC',
        ink: '#042E5B',
        'ink-muted': '#475569',
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
        // Scroll-reveal keyframes: used for elements that should play immediately
        // on load (e.g. a hero), as opposed to the [data-animate] transition-based
        // reveal in src/input.css which is driven by assets/js/scrollObserver.js.
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'hero-zoom-out': 'hero-zoom-out 9000ms ease-out forwards',
        'hero-progress-fill': 'hero-progress-fill 5000ms linear forwards',
        'fade-in-up': 'fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      transitionTimingFunction: {
        // Buttery-smooth "ease-out-expo"-style curve used for all scroll-reveal transitions.
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDelay: {
        400: '400ms',
        600: '600ms',
        800: '800ms',
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
