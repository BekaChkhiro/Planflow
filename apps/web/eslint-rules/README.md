# PlanFlow Custom ESLint Rules

Custom ESLint rules for maintaining code quality and dark mode consistency in the PlanFlow web application.

## Rules

### `planflow/no-hardcoded-colors`

Warns when Tailwind CSS color classes are used without corresponding dark mode variants. This helps maintain visual consistency across light and dark themes.

#### Problem

Using hardcoded color classes without dark variants causes visual issues in dark mode:

```tsx
// Bad - will look jarring in dark mode
<div className="bg-green-50 text-green-700">
  Success message
</div>
```

#### Solution

Add dark mode variants or use CSS variables:

```tsx
// Good - using dark mode variants
<div className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
  Success message
</div>

// Better - using CSS variables (defined in globals.css)
<div className="bg-[hsl(var(--success-bg))] text-green-700 dark:text-green-300">
  Success message
</div>
```

#### Configuration

The rule can be configured in `eslint.config.mjs`:

```js
'planflow/no-hardcoded-colors': [
  'warn', // or 'error' for strict mode
  {
    // Colors that don't need dark variants (default: white, black, transparent, current, inherit)
    ignoredColors: ['white', 'black', 'transparent'],

    // Class prefixes to ignore (default: from-, to-, via-, ring-offset-, placeholder-)
    ignoredPrefixes: ['from-', 'to-', 'via-'],
  },
]
```

#### Detected Patterns

The rule detects these Tailwind class prefixes:
- `bg-` (background)
- `text-` (text color)
- `border-` (border color)
- `ring-` (ring color)
- `outline-` (outline color)
- `accent-` (accent color)
- `caret-` (caret color)
- `fill-` (SVG fill)
- `stroke-` (SVG stroke)
- `decoration-` (text decoration)

Combined with these color names:
- Grays: `slate`, `gray`, `zinc`, `neutral`, `stone`
- Colors: `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`

#### Semantic Suggestions

The rule suggests semantic CSS variable names for common colors:

| Tailwind Color | Semantic Variable |
|----------------|-------------------|
| `green`, `emerald` | `--success-bg` |
| `blue`, `sky`, `cyan` | `--info-bg` |
| `red`, `rose` | `--error-bg` |
| `yellow`, `amber`, `orange` | `--warning-bg` |

#### Shade Mapping

When suggesting dark variants, the rule maps light shades to dark shades:

| Light Shade | Dark Shade |
|-------------|------------|
| 50 | 950 |
| 100 | 900 |
| 200 | 800 |
| 300 | 700 |
| 400 | 600 |
| 500 | 500 |
| 600 | 400 |
| 700 | 300 |
| 800 | 200 |
| 900 | 100 |
| 950 | 50 |

## CSS Variables Reference

Defined in `src/app/globals.css`:

```css
:root {
  --success-bg: 142 76% 94%;       /* soft green */
  --success-border: 142 76% 85%;
  --info-bg: 217 91% 95%;          /* soft blue */
  --info-border: 217 91% 85%;
  --warning-bg: 45 93% 95%;        /* soft yellow */
  --warning-border: 45 93% 85%;
  --error-bg: 0 84% 95%;           /* soft red */
  --error-border: 0 84% 85%;
}

.dark {
  --success-bg: 142 40% 18%;       /* dark green */
  --success-border: 142 40% 28%;
  --info-bg: 217 50% 20%;          /* dark blue */
  --info-border: 217 50% 30%;
  --warning-bg: 45 70% 25%;        /* dark yellow */
  --warning-border: 45 70% 35%;
  --error-bg: 0 50% 22%;           /* dark red */
  --error-border: 0 50% 32%;
}
```

Usage in components:

```tsx
<div className="bg-[hsl(var(--success-bg))] border border-[hsl(var(--success-border))]">
  <span className="text-green-700 dark:text-green-300">Success!</span>
</div>
```

## Running the Lint

```bash
# Check for issues
pnpm lint

# In the web app directory
cd apps/web && pnpm lint
```

## Disabling for Specific Lines

If you have a legitimate reason to use a hardcoded color:

```tsx
// eslint-disable-next-line planflow/no-hardcoded-colors
<div className="bg-blue-500">Intentionally hardcoded</div>
```
