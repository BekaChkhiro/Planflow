---
name: planSettingsLanguage
description: Change language preference for the plugin
---

# Plan Settings Language

Change language preference for the plugin with language selector card.

## Usage

```bash
/planSettingsLanguage           # Change global language
/planSettingsLanguage --local   # Change language for this project only
```

## Step 0: Load Configuration

```javascript
function getConfig() {
  const localConfigPath = "./.plan-config.json"
  if (fileExists(localConfigPath)) {
    try {
      const config = JSON.parse(readFile(localConfigPath))
      config._source = "local"
      return config
    } catch {}
  }

  const globalConfigPath = expandPath("~/.config/claude/plan-plugin-config.json")
  if (fileExists(globalConfigPath)) {
    try {
      const config = JSON.parse(readFile(globalConfigPath))
      config._source = "global"
      return config
    } catch {}
  }

  return { "language": "en", "_source": "default" }
}

const config = getConfig()
const language = config.language || "en"
const t = JSON.parse(readFile(`../locales/${language}.json`))
```

## Step 1: Parse Arguments

```javascript
const isLocal = commandArgs.includes("--local")
const scope = isLocal ? "local" : "global"
```

## Step 2: Show Language Selection Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🌍 Language Settings                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Select your preferred language:                                             │
│                                                                              │
│  ── Available Languages ─────────────────────────────────────────────────    │
│                                                                              │
│  [1] English                    {currentLang === "en" ? "✓ Current" : ""}    │
│      Full support for all features                                           │
│                                                                              │
│  [2] ქართული (Georgian)         {currentLang === "ka" ? "✓ Current" : ""}    │
│      სრული მხარდაჭერა                                                        │
│                                                                              │
│  [3] Русский (Russian)          {currentLang === "ru" ? "✓ Current" : ""}    │
│      Полная поддержка                                                        │
│                                                                              │
│  ── Scope ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  {scope === "local" ? "📁 Project-specific" : "🌐 Global"}                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Use AskUserQuestion to present language options:

```javascript
const currentLang = config.language || "en"

AskUserQuestion({
  questions: [{
    question: t.commands.settings.selectLanguage,
    header: t.commands.settings.languageHeader,
    multiSelect: false,
    options: [
      {
        label: t.commands.settings.englishOption + (currentLang === "en" ? " ✓" : ""),
        description: t.commands.settings.englishDesc
      },
      {
        label: t.commands.settings.georgianOption + (currentLang === "ka" ? " ✓" : ""),
        description: t.commands.settings.georgianDesc
      },
      {
        label: t.commands.settings.russianOption + (currentLang === "ru" ? " ✓" : ""),
        description: t.commands.settings.russianDesc
      }
    ]
  }]
})
```

## Step 3: Map Selection to Language Code

```javascript
let newLanguage = "en"
if (userSelection.includes("English")) newLanguage = "en"
else if (userSelection.includes("Georgian") || userSelection.includes("ქართული")) newLanguage = "ka"
else if (userSelection.includes("Russian") || userSelection.includes("Русский")) newLanguage = "ru"
```

## Step 4: Save to Config

**For local scope:**
- Path: `./.plan-config.json`
- Read existing, update language, write back

**For global scope:**
- Path: `~/.config/claude/plan-plugin-config.json`
- Ensure directory exists: `mkdir -p ~/.config/claude`
- Read existing, update language, write back

**IMPORTANT:** Preserve existing fields! Only update `language` and `lastUsed`.

## Step 5: Show Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t_new.commands.settings.settingsUpdated}                                   │
│                                                                              │
│  ── Language Changed ────────────────────────────────────────────────────    │
│                                                                              │
│  {fromName} → {toName}                                                       │
│                                                                              │
│  ╭─────────────────────────────╮                                             │
│  │ ✓ {toName}                  │                                             │
│  ╰─────────────────────────────╯                                             │
│                                                                              │
│  Scope: {scope === "local" ? "📁 Project-specific" : "🌐 Global"}            │
│                                                                              │
│  ── What's Affected ─────────────────────────────────────────────────────    │
│                                                                              │
│  {t_new.commands.settings.newLanguageUsedFor}                                │
│  • {t_new.commands.settings.commandOutputs}                                  │
│  • {t_new.commands.settings.wizardQuestions}                                 │
│  • {t_new.commands.settings.generatedPlans}                                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t_new.commands.settings.tryIt}                                          │
│     • /planNext              See the new language in action                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (Switching to Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ წარმატება                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  პარამეტრები განახლდა!                                                       │
│                                                                              │
│  ── ენა შეიცვალა ────────────────────────────────────────────────────────    │
│                                                                              │
│  English → ქართული                                                           │
│                                                                              │
│  ╭─────────────────────────────╮                                             │
│  │ ✓ ქართული                   │                                             │
│  ╰─────────────────────────────╯                                             │
│                                                                              │
│  ფარგლები: 🌐 გლობალური                                                      │
│                                                                              │
│  ── რა იცვლება ──────────────────────────────────────────────────────────    │
│                                                                              │
│  ახალი ენა გამოიყენება:                                                      │
│  • ბრძანებების გამოსავალში                                                   │
│  • ვიზარდის კითხვებში                                                        │
│  • გენერირებულ გეგმებში                                                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 სცადეთ ახლავე:                                                           │
│     • /planNext              ნახეთ ახალი ენა მოქმედებაში                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**IMPORTANT:** Use NEW language translations (t_new) for the success message!
