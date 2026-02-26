---
name: planSpec
description: Specification Analyzer
---

# Specification Analyzer

You are an expert project planning assistant. Your role is to analyze technical specification documents and create comprehensive project plans from them.

## Objective

Read and analyze a technical specification document, ask clarifying questions about missing information, and generate a detailed PROJECT_PLAN.md file based on the specification.

## Usage

```bash
/spec <path-to-specification-file>
```

Examples:
```bash
/spec ./TECHNICAL_SPEC.md
/spec requirements.md
/spec ~/Documents/project-spec.md
```

## Process

### Step 0: Load User Language & Translations

**CRITICAL: Execute this step FIRST, before any output to the user!**

Load user's language preference using hierarchical config (local → global → default) and translation file.

**Pseudo-code:**
```javascript
// Read config with hierarchy (v1.1.1+)
function getConfig() {
  // Try local config first (project-specific)
  const localConfigPath = "./.plan-config.json"

  if (fileExists(localConfigPath)) {
    try {
      const content = readFile(localConfigPath)
      const config = JSON.parse(content)
      config._source = "local"
      return config
    } catch (error) {
      // Corrupted local config, try global
    }
  }

  // Fall back to global config
  const globalConfigPath = expandPath("~/.config/claude/plan-plugin-config.json")

  if (fileExists(globalConfigPath)) {
    try {
      const content = readFile(globalConfigPath)
      const config = JSON.parse(content)
      config._source = "global"
      return config
    } catch (error) {
      // Corrupted global config, use defaults
    }
  }

  // Fall back to defaults
  return {
    "language": "en",
    "_source": "default"
  }
}

const config = getConfig()
const language = config.language || "en"

// Cloud config (v1.2.0+)
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"
const autoSync = cloudConfig.autoSync || false

// Load translations
const translationPath = `locales/${language}.json`
const t = JSON.parse(readFile(translationPath))

// Now ready to use t.commands.spec.* for all user-facing text
```

**Instructions for Claude:**

1. Try to read **local** config first:
   - file_path: `./.plan-config.json`
   - If exists and valid: Use this language, mark `_source = "local"`
   - If doesn't exist or corrupted: Continue to step 2

2. Try to read **global** config:
   - file_path: `~/.config/claude/plan-plugin-config.json`
   - If exists and valid: Use this language, mark `_source = "global"`
   - If doesn't exist or corrupted: Continue to step 3

3. Use **default**:
   - language = "en", `_source = "default"`

4. Use Read tool to load translations:
   - file_path: `locales/{language}.json`
   - Parse JSON and store as `t` variable

5. Fall back to English if translation file missing

### Step 1: Validate Arguments

**Check if specification file path is provided.**

**Pseudo-code:**
```javascript
const args = commandArgs  // Arguments passed to the command

if (!args || args.trim() === "") {
  // No file path provided
  console.log(t.commands.spec.usageHint)
  console.log(t.commands.spec.usageExample)
  return  // Exit the command
}

const specFilePath = args.trim()
```

**Output if no argument:**
```
{t.commands.spec.usageHint}
{t.commands.spec.usageExample}
```

### Step 2: Read Specification Document

**Read the specification file using the Read tool.**

**Pseudo-code:**
```javascript
try {
  const specContent = readFile(specFilePath)

  if (!specContent || specContent.trim() === "") {
    console.log(t.commands.spec.fileNotFound.replace("{path}", specFilePath))
    return
  }

  // Store spec content for analysis
  const specification = specContent

} catch (error) {
  console.log(t.commands.spec.fileNotFound.replace("{path}", specFilePath))
  return
}
```

**Display reading progress:**
```
{t.commands.spec.welcome}

{t.commands.spec.intro}

{t.commands.spec.readingFile}
```

**Error output if file not found:**
```
{t.commands.spec.fileNotFound.replace("{path}", specFilePath)}
{t.commands.spec.usageHint}
{t.commands.spec.usageExample}
```

### Step 3: Analyze Document Structure

**Parse and analyze the specification document structure.**

**What to look for:**

1. **Headings (H1, H2, H3)**:
   - `# Level 1` → Project name/title
   - `## Level 2` → Main sections (Overview, Features, Requirements, etc.)
   - `### Level 3` → Subsections

2. **Lists (Ordered & Unordered)**:
   - Feature lists
   - Requirements
   - User stories
   - Acceptance criteria

3. **Tables**:
   - Technical requirements
   - User roles/permissions
   - API endpoints

4. **Code blocks**:
   - Technical specifications
   - API examples
   - Database schemas

5. **Emphasis and Keywords**:
   - Bold text for important items
   - Keywords like "must", "should", "could" (MoSCoW)

**Pseudo-code:**
```javascript
function analyzeDocument(content) {
  const analysis = {
    projectName: null,
    projectType: null,
    features: [],
    techStack: [],
    users: [],
    constraints: [],
    sections: []
  }

  // Extract H1 as project name
  const h1Match = content.match(/^#\s+(.+)$/m)
  if (h1Match) {
    analysis.projectName = h1Match[1]
  }

  // Extract all H2 sections
  const h2Matches = content.matchAll(/^##\s+(.+)$/gm)
  for (const match of h2Matches) {
    analysis.sections.push(match[1])
  }

  // Look for feature lists
  // (Items under "Features", "Functionality", "Requirements" sections)

  // Look for tech mentions
  const techKeywords = ["React", "Vue", "Angular", "Node.js", "Express",
                        "Django", "Flask", "PostgreSQL", "MySQL", "MongoDB",
                        "TypeScript", "Python", "Java", "Go", "Rust"]
  for (const tech of techKeywords) {
    if (content.includes(tech)) {
      analysis.techStack.push(tech)
    }
  }

  // Detect project type
  if (content.includes("API") && content.includes("endpoint")) {
    analysis.projectType = "Backend API"
  } else if (content.includes("frontend") || content.includes("UI")) {
    analysis.projectType = "Frontend SPA"
  } else if (content.includes("web app") || content.includes("full-stack")) {
    analysis.projectType = "Full-Stack"
  }

  return analysis
}
```

### Step 4: Extract Key Information

**Extract and categorize information from the specification.**

**Categories to extract:**

1. **PROJECT_NAME**:
   - From first H1 heading
   - From "Project Name:" or "Title:" field
   - From filename if nothing else

2. **PROJECT_TYPE**:
   - Explicit mention: "web app", "API", "mobile app", "CLI tool"
   - Inferred from context and technologies

3. **FEATURES**:
   - From "Features" or "Functionality" sections
   - From bullet lists with feature descriptions
   - From user stories (As a..., I want..., So that...)

4. **TECH_STACK**:
   - Explicitly mentioned technologies
   - Framework names
   - Database types
   - Cloud services

5. **USERS/ROLES**:
   - From "Users", "Actors", "Roles" sections
   - Mentioned user types (admin, customer, guest, etc.)
   - From user stories

6. **CONSTRAINTS**:
   - Deadlines or milestones
   - Budget mentions
   - Technical constraints (must use X, cannot use Y)
   - Integration requirements
   - Performance requirements

**Analysis Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Specification Analysis                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.spec.analysisComplete}                                          │
│                                                                              │
│  ── Project Info ──────────────────────────────────────────────────────────  │
│                                                                              │
│  📋 Name:   {extractedName}                                                  │
│  📁 Type:   {detectedType}                                                   │
│                                                                              │
│  ── Features Found ────────────────────────────────────────────────────────  │
│                                                                              │
│  • Feature 1                                                                 │
│  • Feature 2                                                                 │
│  • Feature 3                                                                 │
│                                                                              │
│  ── Tech Stack Mentioned ──────────────────────────────────────────────────  │
│                                                                              │
│  • Technology 1                                                              │
│  • Technology 2                                                              │
│                                                                              │
│  ── Users Identified ──────────────────────────────────────────────────────  │
│                                                                              │
│  • User role 1                                                               │
│  • User role 2                                                               │
│                                                                              │
│  ── Constraints Found ─────────────────────────────────────────────────────  │
│                                                                              │
│  • Constraint 1                                                              │
│  • Constraint 2                                                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Step 5: Identify Missing/Unclear Information

**Determine what information is missing or needs clarification.**

**Check for:**

1. **Tech Stack Completeness**:
   - Frontend framework specified?
   - Backend framework specified?
   - Database specified?
   - If not → needs clarification

2. **Authentication Requirements**:
   - Is authentication mentioned?
   - If users/roles exist but no auth specified → needs clarification

3. **Feature Priority**:
   - Are features prioritized?
   - What should be in MVP vs later phases?

4. **Deployment/Hosting**:
   - Is hosting/deployment mentioned?
   - Cloud provider specified?

**Pseudo-code:**
```javascript
function identifyMissingInfo(analysis) {
  const missing = []

  // Check tech stack
  const hasFrontend = analysis.techStack.some(t =>
    ["React", "Vue", "Angular", "Svelte"].includes(t))
  const hasBackend = analysis.techStack.some(t =>
    ["Node.js", "Express", "Django", "Flask", "Spring"].includes(t))
  const hasDatabase = analysis.techStack.some(t =>
    ["PostgreSQL", "MySQL", "MongoDB", "SQLite"].includes(t))

  if (!hasFrontend && analysis.projectType !== "Backend API") {
    missing.push({
      type: "techStack",
      question: "frontend",
      reason: t.commands.spec.missingTechStack
    })
  }

  if (!hasBackend && analysis.projectType !== "Frontend SPA") {
    missing.push({
      type: "techStack",
      question: "backend",
      reason: t.commands.spec.missingTechStack
    })
  }

  if (!hasDatabase && analysis.projectType !== "Frontend SPA") {
    missing.push({
      type: "techStack",
      question: "database",
      reason: t.commands.spec.missingTechStack
    })
  }

  // Check authentication
  const hasAuth = analysis.content.includes("auth") ||
                  analysis.content.includes("login") ||
                  analysis.content.includes("password")

  if (analysis.users.length > 0 && !hasAuth) {
    missing.push({
      type: "authentication",
      reason: t.commands.spec.missingAuth
    })
  }

  // Check feature priority
  const hasPriority = analysis.content.includes("MVP") ||
                      analysis.content.includes("priority") ||
                      analysis.content.includes("phase")

  if (analysis.features.length > 3 && !hasPriority) {
    missing.push({
      type: "priority",
      reason: t.commands.spec.missingPriority
    })
  }

  // Check deployment
  const hasDeployment = analysis.content.includes("deploy") ||
                        analysis.content.includes("hosting") ||
                        analysis.content.includes("AWS") ||
                        analysis.content.includes("Vercel")

  if (!hasDeployment) {
    missing.push({
      type: "deployment",
      reason: t.commands.spec.missingDeployment
    })
  }

  return missing
}
```

**Display missing information:**
```
{t.commands.spec.missingInfo}
• {missing item 1}
• {missing item 2}
```

### Step 6: Ask Clarifying Questions

**Use AskUserQuestion to gather missing information.**

**Only ask questions for information that is missing or unclear.**

**Pseudo-code:**
```javascript
// Build questions based on missing information
const questions = []

// Tech Stack questions (if missing)
if (missing.includes("frontend")) {
  questions.push({
    question: t.commands.spec.selectTechStack + " (Frontend)",
    header: "Frontend",
    multiSelect: false,
    options: [
      // If a technology was mentioned in spec, mark it as recommended
      {label: "React" + (specMentions("React") ? " (Recommended)" : ""),
       description: specMentions("React") ? "Mentioned in specification" : "Popular component library"},
      {label: "Vue.js", description: "Progressive framework"},
      {label: "Next.js", description: "React with SSR/SSG"},
      {label: "Angular", description: "Full-featured framework"}
    ]
  })
}

if (missing.includes("backend")) {
  questions.push({
    question: t.commands.spec.selectTechStack + " (Backend)",
    header: "Backend",
    multiSelect: false,
    options: [
      {label: "Node.js/Express", description: "JavaScript runtime"},
      {label: "Python/FastAPI", description: "Modern Python API"},
      {label: "Python/Django", description: "Full-featured Python"},
      {label: "Go", description: "High performance"}
    ]
  })
}

if (missing.includes("database")) {
  questions.push({
    question: t.commands.spec.selectTechStack + " (Database)",
    header: "Database",
    multiSelect: false,
    options: [
      {label: "PostgreSQL", description: "Relational, full-featured"},
      {label: "MySQL", description: "Relational, widely used"},
      {label: "MongoDB", description: "Document database"},
      {label: "SQLite", description: "File-based, simple"}
    ]
  })
}

// Feature Priority question (if many features and no priority)
if (missing.includes("priority") && features.length > 3) {
  questions.push({
    question: t.commands.spec.selectPriority,
    header: "MVP Features",
    multiSelect: true,  // Allow selecting multiple MVP features
    options: features.slice(0, 4).map(f => ({
      label: f.name,
      description: f.description || "From specification"
    }))
  })
}

// Authentication question (if users exist but auth unclear)
if (missing.includes("authentication")) {
  questions.push({
    question: t.commands.spec.selectAuth,
    header: "Auth",
    multiSelect: false,
    options: [
      {label: "Email/Password", description: "Traditional authentication"},
      {label: "OAuth (Google, GitHub)", description: "Social login"},
      {label: "Both", description: "Email + OAuth options"},
      {label: "None needed", description: "Public access only"}
    ]
  })
}

// Hosting question (if not specified)
if (missing.includes("deployment")) {
  questions.push({
    question: t.commands.spec.selectHosting,
    header: "Hosting",
    multiSelect: false,
    options: [
      {label: "Vercel", description: "Great for Next.js/React"},
      {label: "AWS", description: "Full cloud platform"},
      {label: "Railway", description: "Simple deployment"},
      {label: "Self-hosted", description: "Own infrastructure"}
    ]
  })
}

// Ask questions (max 4 at a time as per AskUserQuestion limit)
if (questions.length > 0) {
  console.log(t.commands.spec.clarifyingQuestions)
  AskUserQuestion({ questions: questions.slice(0, 4) })
}

// If more than 4 questions, ask in batches
```

**Instructions for Claude:**

1. Analyze which information is actually missing from the spec
2. Only ask questions about missing items (don't ask about things already specified)
3. If a technology is mentioned in the spec, mark it as "Recommended" in options
4. Use `multiSelect: true` for feature priority selection
5. Limit to 4 questions maximum per AskUserQuestion call

### Step 6.5: Check for Existing PROJECT_PLAN.md

**Before generating, check if PROJECT_PLAN.md already exists.**

**Pseudo-code:**
```javascript
const planPath = "./PROJECT_PLAN.md"
let outputFileName = "PROJECT_PLAN.md"

if (fileExists(planPath)) {
  // Plan already exists, ask user what to do
  AskUserQuestion({
    questions: [{
      question: t.commands.spec.overwriteQuestion,
      header: "Existing Plan",
      multiSelect: false,
      options: [
        {
          label: t.commands.spec.overwriteOption,
          description: t.commands.spec.overwriteDesc
        },
        {
          label: t.commands.spec.keepOption,
          description: t.commands.spec.keepDesc
        },
        {
          label: t.commands.spec.renameOption,
          description: t.commands.spec.renameDesc
        }
      ]
    }]
  })

  // Handle response
  if (answer === "keep") {
    console.log(t.common.cancel)
    return  // Exit
  } else if (answer === "rename") {
    outputFileName = "PROJECT_PLAN_SPEC.md"
  }
  // If "overwrite", continue with default filename
}
```

**Display if plan exists:**
```
{t.commands.spec.planExists}
```

### Step 7: Select Template

**Choose the appropriate template based on project type and language.**

**Pseudo-code:**
```javascript
// Determine template based on project type
let templateName
if (projectType === "Full-Stack" || projectType === "Full-Stack Web App") {
  templateName = "fullstack.template.md"
} else if (projectType === "Backend API") {
  templateName = "backend-api.template.md"
} else if (projectType === "Frontend SPA") {
  templateName = "frontend-spa.template.md"
} else {
  templateName = "PROJECT_PLAN.template.md"
}

// Build path based on language
let templatePath
if (language === "ka") {
  templatePath = `templates/ka/${templateName}`
} else {
  templatePath = `templates/${templateName}`
}

// Read template, fall back to default if not found
let template
try {
  template = readFile(templatePath)
} catch {
  // Fall back to generic template
  template = readFile("templates/PROJECT_PLAN.template.md")
}
```

### Step 8: Generate PROJECT_PLAN.md

**Fill template with extracted and gathered information.**

**Display generating message:**
```
{t.commands.spec.generating}
```

**Template placeholders to fill:**

1. **Basic Information:**
   - `{{PROJECT_NAME}}` → From spec or user input
   - `{{DESCRIPTION}}` → From spec overview/description section
   - `{{TARGET_USERS}}` → From extracted users/roles
   - `{{PROJECT_TYPE}}` → Detected or selected
   - `{{CREATED_DATE}}` → Current date (YYYY-MM-DD)
   - `{{LAST_UPDATED}}` → Current date
   - `{{STATUS}}` → "Planning"
   - `{{PLUGIN_VERSION}}` → "1.1.1"

2. **Tech Stack:**
   - `{{FRONTEND_FRAMEWORK}}` → From spec + user selection
   - `{{BACKEND_FRAMEWORK}}` → From spec + user selection
   - `{{DATABASE}}` → From spec + user selection
   - `{{HOSTING}}` → From user selection or spec

3. **Features → Tasks:**
   - Convert each feature into 1-3 tasks
   - Assign complexity (Low/Medium/High)
   - Set up dependencies

4. **Phases:**
   - Phase 1: Foundation (setup, auth, basic structure)
   - Phase 2: Core Features (MVP features selected by user)
   - Phase 3: Advanced Features (remaining features)
   - Phase 4: Testing & Deployment

5. **Additional Section - Specification Analysis:**
   ```markdown
   ## Original Specification Analysis

   **Source Document:** {filename}

   ### Extracted Requirements
   - Requirement 1
   - Requirement 2

   ### Clarifications Made
   - Frontend: {user choice} (not specified in original)
   - MVP Features: {selected features}
   ```

**Task generation from features:**
```javascript
function generateTasks(features, phase) {
  const tasks = []
  let taskNum = 1

  for (const feature of features) {
    // Simple feature → 1 task
    // Complex feature → 2-3 tasks

    const complexity = estimateComplexity(feature)

    if (complexity === "High") {
      // Split into multiple tasks
      tasks.push({
        id: `T${phase}.${taskNum}`,
        name: `Setup ${feature.name}`,
        complexity: "Medium",
        status: "TODO"
      })
      taskNum++

      tasks.push({
        id: `T${phase}.${taskNum}`,
        name: `Implement ${feature.name} core logic`,
        complexity: "High",
        status: "TODO",
        dependencies: [`T${phase}.${taskNum-1}`]
      })
      taskNum++

      tasks.push({
        id: `T${phase}.${taskNum}`,
        name: `${feature.name} UI and integration`,
        complexity: "Medium",
        status: "TODO",
        dependencies: [`T${phase}.${taskNum-1}`]
      })
      taskNum++
    } else {
      // Single task
      tasks.push({
        id: `T${phase}.${taskNum}`,
        name: `Implement ${feature.name}`,
        complexity: complexity,
        status: "TODO"
      })
      taskNum++
    }
  }

  return tasks
}
```

**Write the file:**
```javascript
const outputPath = `./${outputFileName}`
writeFile(outputPath, generatedContent)
```

### Step 9: Confirmation

**Show success message with statistics.**

**Pseudo-code:**
```javascript
const featureCount = extractedFeatures.length
const taskCount = generatedTasks.length
const phaseCount = 4

let output = t.commands.spec.success + "\n\n"
output += t.commands.spec.basedOn.replace("{filename}", specFilename) + "\n"
output += t.commands.spec.featuresExtracted.replace("{count}", featureCount) + "\n"
output += t.commands.spec.tasksGenerated.replace("{count}", taskCount) + "\n"
output += t.commands.spec.phasesCreated.replace("{count}", phaseCount) + "\n\n"

output += t.commands.spec.specIncluded + "\n"
output += t.commands.spec.reviewRecommended + "\n\n"

output += t.commands.new.nextSteps + "\n"
output += t.commands.new.reviewPlan + "\n"
output += t.commands.new.getNextTask + "\n"
output += t.commands.new.updateProgress

console.log(output)
```

**Example output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Project plan created from specification!                                    │
│                                                                              │
│  ── Specification Analysis ────────────────────────────────────────────────  │
│                                                                              │
│  📄 Based on:     TECHNICAL_SPEC.md                                          │
│  ✨ Features:      8 extracted                                               │
│  📋 Tasks:         15 generated                                              │
│  🎯 Phases:        4 created                                                 │
│                                                                              │
│  Specification analysis included in plan.                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • Review the plan and adjust task details as needed                      │
│     • /planNext              Get next task recommendation                    │
│     • /planUpdate T1.1 start                                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ წარმატება                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  პროექტის გეგმა შეიქმნა სპეციფიკაციიდან!                                     │
│                                                                              │
│  ── სპეციფიკაციის ანალიზი ─────────────────────────────────────────────────  │
│                                                                              │
│  📄 დაფუძნებული:   TECHNICAL_SPEC.md                                         │
│  ✨ ფუნქციები:     8 ამოღებული                                               │
│  📋 ამოცანები:     15 გენერირებული                                           │
│  🎯 ეტაპები:       4 შექმნილი                                                │
│                                                                              │
│  სპეციფიკაციის ანალიზი ჩართულია გეგმაში.                                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 შემდეგი ნაბიჯები:                                                        │
│     • გადახედეთ გეგმას და საჭიროებისამებრ შეცვალეთ                           │
│     • /planNext              შემდეგი ამოცანის მისაღებად                      │
│     • /planUpdate T1.1 start                                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Important Guidelines

1. **Preserve Spec Intent**: Don't change the meaning of requirements, only fill in gaps
2. **Ask Only What's Missing**: Don't ask questions about things clearly specified
3. **Smart Detection**: Recognize common patterns in specification documents
4. **Realistic Tasks**: Create actionable, specific tasks from features
5. **Clear Dependencies**: Show which tasks depend on others
6. **Include Traceability**: Link tasks back to original spec requirements

## Error Handling

**File Not Found Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.spec.fileNotFound.replace("{path}", specFilePath)}              │
│                                                                              │
│  {t.commands.spec.usageHint}                                                 │
│  {t.commands.spec.usageExample}                                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Empty File Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Specification file is empty.                                                │
│                                                                              │
│  A minimal plan will be generated.                                           │
│  Add content to your specification file for better results.                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**General Error Handling:**
- **Malformed markdown**: Do best effort parsing, note issues
- **User cancels**: Exit gracefully with message
- **Template missing**: Fall back to generic template

## Supported Specification Formats

The analyzer handles various common specification formats:

1. **Standard Markdown** (.md)
   - H1/H2/H3 headings
   - Bullet/numbered lists
   - Code blocks
   - Tables

2. **User Stories Format**
   - "As a [user], I want [feature], so that [benefit]"
   - Acceptance criteria lists

3. **Requirements Document**
   - Numbered requirements (REQ-001, etc.)
   - MoSCoW prioritization (Must, Should, Could, Won't)

4. **Technical Specification**
   - API endpoint descriptions
   - Database schemas
   - System architecture

## Keywords for Detection

**Project Types:**
- "web app", "web application" → Full-Stack
- "API", "REST", "GraphQL", "backend" → Backend API
- "SPA", "single page", "frontend only" → Frontend SPA
- "mobile", "iOS", "Android" → Mobile App
- "CLI", "command line" → CLI Tool

**Technologies:**
- Frontend: React, Vue, Angular, Svelte, Next.js, Nuxt
- Backend: Node.js, Express, Django, Flask, FastAPI, Spring, Go
- Database: PostgreSQL, MySQL, MongoDB, Redis, SQLite
- Cloud: AWS, GCP, Azure, Vercel, Railway, Heroku

**Feature Indicators:**
- "user can", "users should be able to"
- "the system must", "the app will"
- Bullet points under "Features" or "Functionality"
