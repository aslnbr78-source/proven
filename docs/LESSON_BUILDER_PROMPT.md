# AI Lesson Builder Prompt

Copy the prompt below into ChatGPT, Claude, or Gemini. Replace the bracketed sections. Paste the returned JSON into **Teacher → Content Manager → Import module**.

---

## Quick reference — question types

| You want… | Module type | Question setup |
|-----------|-------------|----------------|
| Student types one answer | `interactive-lesson` | `"type": "short-answer"`, `"answers": ["-4", "-4.0"]` |
| Student fills gaps in a sentence | `interactive-lesson` | `"type": "fill-blank"`, `"prompt": "... ___ ... ___"`, `"blanks": [{ "accept": [...] }, ...]` |
| Student picks one option | `quiz` | `"options": [...]`, `"correctIndex": 0` |
| True/False | `quiz` | `"options": ["True", "False"]` |
| Study cards (no grading) | `flashcard` | `"cards": [{ "front": "...", "back": "..." }]` |

---

## Copy this prompt

```
You are a math curriculum writer for ProvenMath LMS.

Create ONE module as valid JSON only — no markdown, no explanation outside the JSON.

MODULE TYPE: [interactive-lesson | quiz | flashcard]
QUESTION TYPE (if lesson): [short-answer | fill-blank]
TOPIC: [e.g. "Mean and median for business data"]
GRADE LEVEL: [e.g. Grade 9 / Business Math]
MODULE ID: [e.g. mean-median-lesson] (lowercase, hyphens only)
TITLE: [e.g. "Mean and Median"]

RULES:
1. Output ONLY raw JSON (no ``` fences).
2. Use KaTeX in strings: inline $...$ and display $$...$$ for equations.
3. Use rich text markup to highlight vocabulary and key ideas:
   - [[kw:term]] or [[term]] — keyword (indigo)
   - [[def:term]] or [[def:term|short definition]] — definition (teal)
   - [[imp:text]] — important emphasis (amber)
   - [[note:text]] — teacher tip (sky)
   Apply markup in explanation, example steps, question prompts, quiz options, and flashcard text.
4. "id" must match MODULE ID exactly.
5. Hints guide thinking — do not give the final answer in hints.

=== INTERACTIVE LESSON ===

Base shape:
{
  "type": "interactive-lesson",
  "id": "...",
  "title": "...",
  "explanation": ["paragraph 1", "paragraph 2"],
  "example": { "prompt": "...", "steps": ["...", "..."] },
  "question": { ... see question type below ... }
}

SHORT-ANSWER question (student types one answer):
{
  "type": "short-answer",
  "prompt": "What is the slope of $y = -4x + 7$?",
  "answers": ["-4", "-4.0"],
  "hints": ["hint 1", "hint 2"]
}
Use "answers" array with every acceptable form (e.g. "3", "3.0", "+3").
Legacy single "answer": "..." also works.

FILL-IN-THE-BLANK question (student fills each ___):
{
  "type": "fill-blank",
  "prompt": "For $y = 2x + 3$, the slope is ___ and the y-intercept is ___.",
  "blanks": [
    { "accept": ["2", "2.0"] },
    { "accept": ["3", "3.0"] }
  ],
  "hints": ["hint 1", "hint 2"]
}
Rules: one ___ per blank; blanks array length must match ___ count; each blank has "accept" array.

=== QUIZ (multiple choice) ===

{
  "type": "quiz",
  "id": "...",
  "title": "...",
  "timeLimit": 300,
  "questions": [{
    "id": "q1",
    "prompt": "...",
    "options": ["...", "...", "...", "..."],
    "correctIndex": 0,
    "hints": ["...", "..."],
    "feedbackIfWrong": "..."
  }]
}
For True/False: "options": ["True", "False"], correctIndex 0 or 1.
correctIndex is 0-based (0 = first option).

=== FLASHCARDS ===

{
  "type": "flashcard",
  "id": "...",
  "title": "...",
  "cards": [{ "front": "...", "back": "..." }]
}
```

---

## Examples by question type

### Rich text markup in a lesson

```json
"explanation": [
  "A [[def:linear equation|equation whose graph is a straight line]] has the form $y = mx + b$.",
  "[[kw:Slope]] is the rate of change. [[imp:The sign of m tells you if the line rises or falls.]]"
]
```

### 1. Short answer with multiple accepted forms

```json
"question": {
  "type": "short-answer",
  "prompt": "Solve for $x$: $2x = 6$",
  "answers": ["3", "3.0", "x=3"],
  "hints": ["Divide both sides by 2.", "The answer is $3$."]
}
```

### 2. Fill in the blank

```json
"question": {
  "type": "fill-blank",
  "prompt": "In $y = mx + b$, $m$ is the ___ and $b$ is the ___.",
  "blanks": [
    { "accept": ["slope", "m"] },
    { "accept": ["y-intercept", "intercept", "b"] }
  ],
  "hints": ["Think about rise over run.", "Where does the line cross the y-axis?"]
}
```

### 3. Multiple choice (quiz)

```json
{
  "id": "q1",
  "prompt": "Which line has a negative slope?",
  "options": ["$y = 2x + 1$", "$y = -3x + 5$", "$y = 4$", "$x = 2$"],
  "correctIndex": 1,
  "hints": ["Negative slope means $m < 0$.", "Look for a negative coefficient on $x$."],
  "feedbackIfWrong": "A negative slope has a negative coefficient on $x$, like $-3$."
}
```

### 4. True/False (quiz with 2 options)

```json
{
  "id": "q-tf",
  "prompt": "The slope of a horizontal line is zero.",
  "options": ["True", "False"],
  "correctIndex": 0,
  "hints": ["A horizontal line has no rise.", "Rise over run when rise is 0."],
  "feedbackIfWrong": "A horizontal line has $m = 0$ because the rise is zero."
}
```

### 5. Flashcards

```json
{
  "front": "What is the quadratic formula?",
  "back": "$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$"
}
```

---

## After you get JSON

1. **Teacher → Content Manager**
2. Select or create a course
3. **Import module** into the right chapter
4. **Validate & save** → **Preview**
5. Reorder with ↑ ↓ if needed

## Blank templates

| Type | File |
|------|------|
| Short-answer lesson | `public/templates/interactive-lesson.template.json` |
| Fill-in-the-blank lesson | `public/templates/interactive-lesson-fill-blank.template.json` |
| Quiz | `public/templates/quiz.template.json` |
| Flashcards | `public/templates/flashcard.template.json` |

Full field reference: `docs/CONTENT_SCHEMA.md`
