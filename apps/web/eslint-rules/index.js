/**
 * PlanFlow Custom ESLint Rules
 *
 * Custom ESLint rules for maintaining code quality and consistency
 * in the PlanFlow web application.
 */

const noHardcodedColors = require('./no-hardcoded-colors')

module.exports = {
  meta: {
    name: 'eslint-plugin-planflow',
    version: '1.0.0',
  },
  rules: {
    'no-hardcoded-colors': noHardcodedColors,
  },
  configs: {
    recommended: {
      plugins: ['planflow'],
      rules: {
        'planflow/no-hardcoded-colors': 'warn',
      },
    },
    strict: {
      plugins: ['planflow'],
      rules: {
        'planflow/no-hardcoded-colors': 'error',
      },
    },
  },
}
