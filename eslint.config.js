const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {ignores: ['android/**', 'ios/**', 'node_modules/**']},
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {ecmaFeatures: {jsx: true}},
      globals: {...globals.node, ...globals.browser, __DEV__: 'readonly'},
    },
    rules: {'no-unused-vars': 'off'},
  },
];
