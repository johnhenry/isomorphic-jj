module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2022: true,
    jest: true,
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  globals: {
    // Experimental File System Observer API — not yet in eslint's browser globals.
    FileSystemObserver: 'readonly',
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error',
  },
  overrides: [
    {
      // Test files frequently assign setup vars for readability and use the
      // jasmine-style `fail` helper; keep unused-var hygiene as a warning here.
      files: ['tests/**/*.js'],
      rules: {
        'no-unused-vars': 'warn',
      },
    },
  ],
};
