/* Root ESLint config — workspaces extend this. */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    browser: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'import', 'unused-imports'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  settings: {
    'import/resolver': {
      typescript: { project: ['tsconfig.base.json', '*/*/tsconfig.json'] },
      node: true,
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-default-export': 'off',
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    '.next',
    '.turbo',
    'build',
    'coverage',
    'generated',
    '**/*.generated.ts',
    '**/prisma/seed.ts',
  ],
  overrides: [
    {
      files: ['*.spec.ts', '*.test.ts', '*.spec.tsx', '*.test.tsx'],
      env: { jest: true },
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
