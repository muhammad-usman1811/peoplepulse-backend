const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      // Express recognises error handlers by their four parameters, so an unused `next` stays.
      'no-unused-vars': ['error', { argsIgnorePattern: '^(_|next$)', caughtErrors: 'none' }],
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    // Application code logs failures with console.error; console.log belongs only to the
    // startup banner, the connection message, and the CLI scripts excluded here.
    files: ['src/**/*.js'],
    ignores: ['src/server.js', 'src/config/db.js', 'src/seed.js', 'src/scripts/**', 'src/test_api.js'],
    rules: { 'no-console': ['error', { allow: ['error', 'warn'] }] },
  },
];
