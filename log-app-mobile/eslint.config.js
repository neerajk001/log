// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // The hooks in src/hooks fetch on mount and set loading/error state at the
    // start of an effect. That is intentional for this app's scope; the
    // React Compiler rule flags the standard pattern, so it is disabled here.
    files: ['src/hooks/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
