import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      // Catch missing/extra hook dependencies — would have caught the
      // useEffect([newSession]) bug where newSession was recreated every render
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Basic TS rules
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // Catch inline object/array literals as Zustand selector fallbacks.
      // Pattern: useXxxStore(s => expr ?? {}) or useXxxStore(s => expr ?? [])
      // These return a new reference every call → Zustand re-renders infinitely.
      'no-restricted-syntax': [
        'error',
        {
          // Arrow function inside a call to use*Store that returns ?? {} or ?? []
          selector:
            "CallExpression[callee.name=/^use[A-Z].*Store$/] > ArrowFunctionExpression > LogicalExpression[operator='??']:matches([right.type='ObjectExpression'][right.properties.length=0], [right.type='ArrayExpression'][right.elements.length=0])",
          message:
            "Avoid inline `?? {}` or `?? []` in Zustand selectors — creates a new reference every call, causing infinite re-renders. Use a module-level EMPTY_* constant instead.",
        },
      ],
    },
  },
]
