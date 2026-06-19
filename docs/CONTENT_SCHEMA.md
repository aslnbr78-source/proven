# ProvenMath Content JSON Schema

All lesson content is stored as JSON. The LMS loads files from:

- **Course outline:** `public/courses/{courseId}/course.json`
- **Module content:** `public/lessons/{courseId}/{moduleId}.json`

Use `$...$` for inline math and `$$...$$` for display math in any text field.

Use **inline markup** in any text field to color-code keywords (see [Rich text markup](#rich-text-markup) below).

---

## Rich text markup

Embed formatting directly in JSON strings. Works in `explanation`, `example`, `question`, quiz prompts/options, and flashcard text — alongside `$...$` math.

| Syntax | Purpose | Appearance |
|--------|---------|------------|
| `[[kw:term]]` or `[[term]]` | Vocabulary keyword | Indigo pill |
| `[[def:term]]` or `[[def:term\|detail]]` | Definition term | Teal underline (+ optional detail) |
| `[[imp:text]]` | Important emphasis | Amber highlight |
| `[[note:text]]` | Teacher tip / note | Sky callout |

**Examples:**

```json
"explanation": [
  "The [[kw:slope-intercept form]] is $y = mx + b$, where [[def:slope|m]] is slope and [[def:y-intercept|b]] is the y-intercept.",
  "[[imp:Always identify m and b before graphing.]] [[note:Students often confuse slope with intercept.]]"
]
```

---

## Question types overview

| Type | Module | How the student answers |
|------|--------|-------------------------|
| **Short answer** | Interactive lesson | Types one answer in a text box |
| **Multiple accepted answers** | Interactive lesson | Same box — any listed form counts as correct |
| **Fill in the blank** | Interactive lesson | Types into each `___` slot in the sentence |
| **Multiple choice** | Quiz | Clicks one option (2+ choices; use 2 for True/False) |
| **Final test** | Final test (proctored) | Timed, fullscreen, passcode/teacher unlock — violations logged |
| **Flashcard** | Flashcard set | Flips card to self-check (not auto-graded) |

---

## Course outline (`course.json`)

Courses use a three-level hierarchy: **chapters → subchapters → modules**.

```json
{
  "id": "algebra-1",
  "title": "Algebra I",
  "description": "Optional course description",
  "chapters": [
    {
      "id": "ch01",
      "title": "Chapter 1: Linear Equations",
      "subchapters": [
        {
          "id": "ch01-sc01",
          "title": "1.1 Introduction to Linear Equations",
          "modules": [
            {
              "id": "intro-linear-equations",
              "type": "interactive-lesson",
              "title": "Introduction to Linear Equations"
            }
          ]
        }
      ]
    }
  ]
}
```

| Field | Type | Required |
|-------|------|----------|
| `id` | string | yes |
| `title` | string | yes |
| `chapters[].id` | string | yes |
| `chapters[].title` | string | yes — e.g. `"Chapter 1: Linear Equations"` |
| `chapters[].subchapters[].id` | string | yes |
| `chapters[].subchapters[].title` | string | yes — e.g. `"1.1 Introduction"` |
| `chapters[].subchapters[].modules[].id` | string | yes — must match JSON filename |
| `chapters[].subchapters[].modules[].type` | `"interactive-lesson"` \| `"quiz"` \| `"flashcard"` \| `"final-test"` | yes |
| `chapters[].subchapters[].modules[].title` | string | yes |

### Materials (files & links)

Each subchapter can also include supplementary **materials** — PDFs, videos, images, and external links. These appear in the course sidebar and Downloads panel.

```json
"materials": [
  {
    "id": "mat-abc123",
    "kind": "link",
    "title": "Khan Academy — Slope",
    "url": "https://example.com"
  },
  {
    "id": "mat-def456",
    "kind": "pdf",
    "title": "Worksheet.pdf",
    "url": "https://storage.googleapis.com/...",
    "assetId": "optional-firestore-asset-id"
  }
]
```

| Field | Notes |
|-------|--------|
| `kind` | `"link"` \| `"pdf"` \| `"video"` \| `"image"` \| `"file"` |
| `title` | Display name |
| `url` | Download or external URL |
| `assetId` | Optional — set when uploaded via Course Builder |

> **Legacy format:** Older outlines with `modules` directly on a chapter are auto-converted to a single subchapter on load.

---

## Interactive lesson

**File:** `public/lessons/{courseId}/{moduleId}.json`

Every interactive lesson has: `explanation` → `example` (worked) → `question` (graded).

### Question type A — Short answer (single or multiple accepted)

Use when the student should type **one** final answer (number, word, or expression).

```json
{
  "type": "interactive-lesson",
  "id": "intro-linear-equations",
  "title": "Introduction to Linear Equations",
  "explanation": ["Paragraph with $y = mx + b$."],
  "example": {
    "prompt": "Find the slope of $y = 2x + 3$.",
    "steps": ["Compare to $y = mx + b$.", "Slope is $2$."]
  },
  "question": {
    "type": "short-answer",
    "prompt": "What is the slope of $y = -4x + 7$?",
    "answers": ["-4", "-4.0"],
    "hints": ["Use $y = mx + b$.", "The coefficient of $x$ is $-4$."]
  }
}
```

| Field | Notes |
|-------|--------|
| `question.type` | `"short-answer"` (default if omitted) |
| `question.answer` | Single accepted string — still works for backward compatibility |
| `question.answers` | **Preferred** — array of all accepted forms, e.g. `["-4", "-4.0", "−4"]` |
| `question.hints` | Up to 2+ hints shown one at a time |

**Matching rules:** Answers are trimmed, case-insensitive, spaces removed. `" -4 "` matches `"-4"`.

---

### Question type B — Fill in the blank

Use when the student fills **several gaps** in one sentence or formula.

Mark each blank with exactly three underscores: `___`

```json
{
  "type": "interactive-lesson",
  "id": "slope-intercept-blanks",
  "title": "Slope-Intercept Form Practice",
  "explanation": ["In $y = mx + b$, $m$ is slope and $b$ is y-intercept."],
  "example": {
    "prompt": "For $y = 5x - 2$, find $m$ and $b$.",
    "steps": ["$m = 5$", "$b = -2$"]
  },
  "question": {
    "type": "fill-blank",
    "prompt": "For $y = 2x + 3$, the slope is ___ and the y-intercept is ___.",
    "blanks": [
      { "accept": ["2", "2.0"] },
      { "accept": ["3", "3.0", "+3"] }
    ],
    "hints": ["Slope is the coefficient of $x$.", "Y-intercept is the constant term."]
  }
}
```

| Field | Notes |
|-------|--------|
| `question.type` | Must be `"fill-blank"` |
| `question.prompt` | Must contain one `___` per blank — **same count** as `blanks` array |
| `question.blanks` | Array of `{ "accept": ["form1", "form2"] }` — one entry per blank, left to right |
| `question.hints` | General hints for the whole question |

**Example prompts:**
- `"The slope is ___ and the y-intercept is ___."`
- `"Solving $2x + 6 = 0$ gives $x = ___$."`

---

## Quiz — Multiple choice

```json
{
  "type": "quiz",
  "id": "linear-quiz",
  "title": "Linear Equations Quiz",
  "timeLimit": 300,
  "questions": [
    {
      "id": "q1",
      "prompt": "What is the slope of $y = 3x - 1$?",
      "options": ["$3$", "$-1$", "$1$", "$-3$"],
      "correctIndex": 0,
      "hints": ["Hint 1.", "Hint 2."],
      "feedbackIfWrong": "The slope is the coefficient of $x$."
    }
  ]
}
```

### How to create each quiz style

| Style | How to write it |
|-------|-----------------|
| **4-option MC** | `"options": ["A", "B", "C", "D"]`, `"correctIndex": 0` (0 = first option) |
| **True / False** | `"options": ["True", "False"]`, `"correctIndex": 0` or `1` |
| **Yes / No** | `"options": ["Yes", "No"]` |
| **2–6 options** | Any length `options` array (minimum 2) |

| Field | Notes |
|-------|--------|
| `timeLimit` | Seconds — omit for untimed quiz |
| `correctIndex` | 0-based index into `options` |
| `feedbackIfWrong` | Shown after a wrong submit |

---

## Final test — Proctored exam

Like a quiz, but with **fullscreen**, **access control**, and **integrity logging**. No hints during the test.

```json
{
  "type": "final-test",
  "id": "chapter-1-final",
  "title": "Chapter 1 Final Test",
  "timeLimit": 1800,
  "questions": [
    {
      "id": "ft-q1",
      "prompt": "What is the [[kw:slope]] of $y = 3x - 2$?",
      "options": ["$3$", "$-2$", "$2$", "$-3$"],
      "correctIndex": 0,
      "feedbackIfWrong": "Slope is the coefficient of $x$."
    }
  ]
}
```

| Field | Notes |
|-------|--------|
| `timeLimit` | **Required** — seconds (minimum 60). Timer auto-submits when it hits zero. |
| `questions` | Same shape as quiz questions (no `hints` used during test) |

**Access (configured by teacher in the course player, not in JSON):**
- Passcode (stored securely in Firestore via Cloud Function)
- Passcode **valid for N minutes** from when the teacher saves it — after that, the code stops working
- **AI assistant** — off by default; teacher can enable in Final test controls (floating panel inside fullscreen)
- **Attempts per student** — teacher sets how many times each signed-in student may take the test
- Teacher grant per student
- Mode: passcode only, teacher only, or either

**Proctoring (browser-level):**
- Fullscreen required to start
- Right-click, copy, paste blocked
- Tab switches and fullscreen exits counted
- Session report saved for teacher/admin (Reports dashboard)

> OS-level screenshots cannot be fully blocked in a web browser.

---

## Flashcards — Self-check recall

Not a graded question — students flip to check themselves.

```json
{
  "type": "flashcard",
  "id": "slope-flashcards",
  "title": "Slope & Intercept Flashcards",
  "cards": [
    { "front": "What is slope?", "back": "$m = \\frac{\\text{rise}}{\\text{run}}$" },
    { "front": "Slope-intercept form", "back": "$y = mx + b$" }
  ]
}
```

| Field | Notes |
|-------|--------|
| `cards[].front` | Term or question |
| `cards[].back` | Definition or answer |

---

## Adding a new module

### Option A — Content Manager (recommended)

1. Log in as **teacher** or **admin** → **Teacher Dashboard** → **Content Manager**
2. Select or create a course
3. Load a template or use `docs/LESSON_BUILDER_PROMPT.md`
4. **Import module** into a chapter → validate & save
5. Reorder with ↑ ↓, edit titles, **Preview**
6. **Export JSON files** when ready

### Option B — Manual files

1. Create `public/lessons/{courseId}/{moduleId}.json`
2. Add the module entry under the correct **subchapter** in `public/courses/{courseId}/course.json`
3. Reload the app

**Templates:** `public/templates/`  
**AI prompt:** `docs/LESSON_BUILDER_PROMPT.md`
