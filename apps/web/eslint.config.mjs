import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import { createRequire } from 'module'

// Load custom PlanFlow ESLint rules
const require = createRequire(import.meta.url)
const planflowPlugin = require('./eslint-rules/index.js')

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['.next/**', 'node_modules/**', 'eslint-rules/**'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: {
      planflow: planflowPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Dark mode color consistency rule
      // Warns when Tailwind color classes are used without dark: variants
      'planflow/no-hardcoded-colors': [
        'warn',
        {
          // Colors that don't need dark variants
          ignoredColors: ['white', 'black', 'transparent', 'current', 'inherit'],
          // Prefixes that are typically used for gradients/effects
          ignoredPrefixes: ['from-', 'to-', 'via-', 'ring-offset-', 'placeholder-'],
        },
      ],
    },
  }
)
