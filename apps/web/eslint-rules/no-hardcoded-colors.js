/**
 * ESLint Rule: no-hardcoded-colors
 *
 * Warns when Tailwind CSS color classes are used without corresponding dark mode variants.
 * This helps maintain dark mode consistency across the application.
 *
 * Examples of violations:
 * - className="bg-green-50"           (missing dark: variant)
 * - className="text-blue-700"         (missing dark: variant)
 * - className="border-red-200"        (missing dark: variant)
 *
 * Valid usage:
 * - className="bg-green-50 dark:bg-green-950"
 * - className="bg-[hsl(var(--success-bg))]"  (CSS variable)
 * - className="bg-background"                 (semantic class)
 */

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow hardcoded Tailwind color classes without dark mode variants',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          ignoredColors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Color names to ignore (e.g., ["white", "black"])',
          },
          ignoredPrefixes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Class prefixes to ignore (e.g., ["from-", "to-", "via-"])',
          },
          severity: {
            type: 'string',
            enum: ['error', 'warn'],
            default: 'warn',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingDarkVariant:
        '"{{className}}" is missing a dark mode variant. Consider using "{{suggestion}}" or a CSS variable like "bg-[hsl(var(--{{semantic}}-bg))]".',
      missingDarkVariantText:
        '"{{className}}" is missing a dark mode variant. Consider adding "dark:{{darkClass}}".',
      missingDarkVariantBorder:
        '"{{className}}" is missing a dark mode variant. Consider adding "dark:{{darkClass}}".',
    },
  },

  create(context) {
    const options = context.options[0] || {}
    const ignoredColors = new Set(options.ignoredColors || ['white', 'black', 'transparent', 'current', 'inherit'])
    const ignoredPrefixes = new Set(options.ignoredPrefixes || ['from-', 'to-', 'via-', 'ring-offset-', 'placeholder-'])

    // Colors that commonly need dark mode variants
    const colorPattern = /^(bg|text|border|ring|outline|accent|caret|fill|stroke|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d+)$/

    // Semantic color mappings for suggestions
    const semanticMapping = {
      green: 'success',
      emerald: 'success',
      blue: 'info',
      sky: 'info',
      cyan: 'info',
      red: 'error',
      rose: 'error',
      yellow: 'warning',
      amber: 'warning',
      orange: 'warning',
    }

    // Light to dark shade mapping
    const lightToDarkShade = {
      '50': '950',
      '100': '900',
      '200': '800',
      '300': '700',
      '400': '600',
      '500': '500',
      '600': '400',
      '700': '300',
      '800': '200',
      '900': '100',
      '950': '50',
    }

    /**
     * Parse className string and extract individual classes
     */
    function parseClassNames(value) {
      if (typeof value !== 'string') return []
      return value.split(/\s+/).filter(Boolean)
    }

    /**
     * Check if a class should be ignored
     */
    function shouldIgnore(className) {
      // Check ignored prefixes
      for (const prefix of ignoredPrefixes) {
        if (className.startsWith(prefix)) return true
      }
      return false
    }

    /**
     * Check if a color class has a corresponding dark variant in the same className
     */
    function hasDarkVariant(colorClass, allClasses) {
      const match = colorClass.match(colorPattern)
      if (!match) return true // Not a color class we care about

      const [, prefix, color, shade] = match

      // Check if there's a dark: variant for this prefix
      const darkPatterns = [
        `dark:${prefix}-${color}-`,  // Same color, any shade
        `dark:${prefix}-[`,          // CSS variable
      ]

      return allClasses.some(cls =>
        darkPatterns.some(pattern => cls.startsWith(pattern))
      )
    }

    /**
     * Generate suggestion for fixing the issue
     */
    function generateSuggestion(colorClass) {
      const match = colorClass.match(colorPattern)
      if (!match) return null

      const [, prefix, color, shade] = match
      const darkShade = lightToDarkShade[shade] || shade
      const semantic = semanticMapping[color]

      return {
        darkClass: `${prefix}-${color}-${darkShade}`,
        semantic: semantic || color,
        original: colorClass,
      }
    }

    /**
     * Get the raw string value from a JSX attribute
     */
    function getStringValue(node) {
      if (!node) return null

      // Direct string literal: className="..."
      if (node.type === 'Literal' && typeof node.value === 'string') {
        return { value: node.value, node }
      }

      // Template literal: className={`...`}
      if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
        return { value: node.quasis[0].value.raw, node }
      }

      // JSX expression with string: className={"..."}
      if (node.type === 'JSXExpressionContainer') {
        return getStringValue(node.expression)
      }

      return null
    }

    /**
     * Check a className attribute value
     */
    function checkClassNameValue(valueNode, allClasses) {
      if (!valueNode) return

      const stringInfo = getStringValue(valueNode)
      if (!stringInfo) return

      const classes = parseClassNames(stringInfo.value)

      for (const cls of classes) {
        // Skip if it's already a dark variant
        if (cls.startsWith('dark:')) continue

        // Skip ignored classes
        if (shouldIgnore(cls)) continue

        // Check if it matches our color pattern
        const match = cls.match(colorPattern)
        if (!match) continue

        const [, prefix, color, shade] = match

        // Skip ignored colors
        if (ignoredColors.has(color)) continue

        // Check if there's a dark variant
        if (!hasDarkVariant(cls, allClasses || classes)) {
          const suggestion = generateSuggestion(cls)

          if (suggestion) {
            const messageId = prefix === 'text'
              ? 'missingDarkVariantText'
              : prefix === 'border'
                ? 'missingDarkVariantBorder'
                : 'missingDarkVariant'

            context.report({
              node: stringInfo.node,
              messageId,
              data: {
                className: cls,
                darkClass: suggestion.darkClass,
                semantic: suggestion.semantic,
                suggestion: `${cls} dark:${suggestion.darkClass}`,
              },
            })
          }
        }
      }
    }

    return {
      // Handle className="..." and class="..."
      JSXAttribute(node) {
        const attrName = node.name?.name
        if (attrName !== 'className' && attrName !== 'class') return

        checkClassNameValue(node.value)
      },

      // Handle cn(...), clsx(...), twMerge(...) utility functions
      CallExpression(node) {
        const callee = node.callee
        const funcName = callee.type === 'Identifier' ? callee.name : null

        // Check for common className utility functions
        if (!['cn', 'clsx', 'twMerge', 'classNames', 'cx'].includes(funcName)) return

        // Collect all classes from all arguments
        const allClasses = []

        for (const arg of node.arguments) {
          if (arg.type === 'Literal' && typeof arg.value === 'string') {
            allClasses.push(...parseClassNames(arg.value))
          } else if (arg.type === 'TemplateLiteral' && arg.quasis.length === 1) {
            allClasses.push(...parseClassNames(arg.quasis[0].value.raw))
          }
        }

        // Check each argument
        for (const arg of node.arguments) {
          checkClassNameValue(arg, allClasses)
        }
      },
    }
  },
}
