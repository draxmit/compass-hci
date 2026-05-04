/** @type {import('tailwindcss').Config} */
const tokens = require('./src/shared/theme/tokens.cjs');

module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['InstrumentSerif_400Regular_Italic', 'serif'],
        sans: ['Barlow_400Regular', 'sans-serif'],
        'sans-light': ['Barlow_300Light', 'sans-serif'],
        'sans-medium': ['Barlow_500Medium', 'sans-serif'],
        'sans-semibold': ['Barlow_600SemiBold', 'sans-serif'],
        'sans-bold': ['Barlow_700Bold', 'sans-serif'],
      },
      colors: {
        aurora: tokens.aurora,
        surface: tokens.surface,
        warning:  tokens.semantic.warning,
        danger:   tokens.semantic.danger,
        positive: tokens.semantic.positive,
        glass: tokens.glass,
      },
      borderRadius: tokens.radius,
      boxShadow: tokens.shadow,
    },
  },
  plugins: [],
};
