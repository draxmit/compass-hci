// ESLint 9 flat config. Inherits Expo's recommended rule set.
// (Replaces the legacy .eslintrc.js; ESLint 9 ignores .eslintrc files.)
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'dist/**',
      '.expo/**',
      'web-build/**',
      'node_modules/**',
      'expo-env.d.ts',
      'nativewind-env.d.ts',
    ],
  },
];
