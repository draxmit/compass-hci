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
        // Inter — body, UI, labels. Loaded via @expo-google-fonts/inter.
        sans: ['Inter_400Regular', 'sans-serif'],
        'sans-light': ['Inter_300Light', 'sans-serif'],
        'sans-medium': ['Inter_500Medium', 'sans-serif'],
        'sans-semibold': ['Inter_600SemiBold', 'sans-serif'],
        'sans-bold': ['Inter_700Bold', 'sans-serif'],
        // Geist Mono — display numbers (tabular-nums always on). Loaded via @expo-google-fonts/geist-mono.
        mono: ['GeistMono_700Bold', 'monospace'],
        'mono-medium': ['GeistMono_500Medium', 'monospace'],
        'mono-regular': ['GeistMono_400Regular', 'monospace'],
      },
      colors: {
        accent: tokens.accent,
        surface: tokens.surface,
        warning:  tokens.semantic.warning,
        danger:   tokens.semantic.danger,
        positive: tokens.semantic.positive,
      },
      borderRadius: tokens.radius,
      spacing: tokens.spacing,
    },
  },
  plugins: [],
};
