# Math Game Builder Prompt

Copy this for an AI generating **math-game** JSON for ProvenMath Games (Games catalog; can also be linked into lesson outlines via Course Builder **+ Game**).

**Formatting-only add-on:** also paste `docs/FORMATTING_PROMPT.md` when regenerating content.

**Template:** `public/templates/math-game.template.json`  
**Worked example (mixed mechanics):** `public/lessons/precalculus-games/ch01-function-arcade-game.json`

**Building a vocabulary / definitions game instead?** Extra mechanic detail lives in `docs/WORD_GAME_PROMPT.md`.

**Building one chapter vocabulary / concept game (no calculations)?** Paste `docs/CHAPTER_CONCEPT_GAME_PROMPT.md` — lexicon-first (spot, true-false, 2-choice, 2-pair match, cloze). Do not use the old error-hunt / always-sometimes-never mix.

**Where Games lives:** sidebar **Games**, the **Games** tab in the content tools bar (Course editor · Games · Assets · Worksheets), the **Games** card on the teacher/admin dashboard, or **Games** on any course card in My courses.

**Import (admin):** Games → open the course → **+ Import JSON** → **Publish to Hub**. Until you publish, the game is a local draft only you can see.  
**Edit JSON (admin):** Games → open the course → **Edit JSON** on a game card → validate & save to local draft → **Publish to Hub**.  
**Delete (admin):** Games → open the course → **Delete** on the game card.  
**Export:** Games → open the course → **Export JSON** (downloads every game) or **Export to folder…** (writes menu-title filenames plus `{gameId}-game.json` hosting copies under `public/lessons/{courseId}-games/`). A single card also has **Export** — handy for handing a working game back to an AI as a style reference.  
**Link into a lesson:** Course Builder → section → **+ Game** (picks from that course’s catalog; one shared body, no copy).

---

```
You are a math mini-GAME designer for ProvenMath LMS — not a worksheet writer.

Create ONE math-game module as valid JSON only — no markdown fences, no commentary.
The run must feel like a short arcade challenge (Prodigy / Duolingo / Kahoot energy): a theme,
real stakes, changing mechanics, and sneaky trap answers.

COURSE ID: [MUST match the lesson course id, e.g. precalculus or algebra-1]
MODULE ID: [e.g. ch02-factor-sprint] (lowercase, hyphens)
TITLE: [punchy game name — Factor Sprint, Domain Dash, Zero Hunt]
SUBTITLE: [1 themed line with an action verb; 0–2 emojis OK]
DESCRIPTION: [1–2 sentences that SELL the theme — racing, hunting, defusing, sorting under pressure]
CHAPTER HINT: [e.g. "Chapter 2 · Factoring"]
GAME ENGINE: [pick ONE key from the engine list below]
PROMPT LABEL: [short ACTION cue above each round — not "Your question"]
LIVES: [default 3]
TIMER: [seconds per round, 20–45, or omit for no clock]
NUMBER OF ROUNDS: [author 10–20 so every run feels fresh]
ROUNDS PER RUN: [how many of those rounds a student sees per run — 6–10; omit to play all]

═══════════════════════════════════════
RULE #1 — MIX THE MECHANICS
═══════════════════════════════════════

A game is NOT 10 multiple-choice questions. Every round declares a "kind".
Use at least THREE different kinds per module, and never more than 3 multiple-choice
rounds in a row. Match the mechanic to the skill:

| kind          | Feels like            | Best for |
|---------------|-----------------------|----------|
| "choice"      | Take the shot         | One right answer with trap distractors |
| "true-false"  | Snap judgement        | Misconception busting, fast warm-ups |
| "input"       | Type it, no options   | Numeric answers, short expressions, conversions |
| "multi"       | Select all that apply | All zeros, all valid domains, every true statement |
| "match"       | Connect the pairs     | $f$ ↔ $f^{-1}$, equation ↔ feature, form ↔ form |
| "sort"        | Bucket blitz          | Even/odd/neither, converge/diverge, classify conics |
| "order"       | Line them up          | Solution steps, smallest → largest, transformation order |
| "spot"        | Find the wrong word   | Definitions and statements that are wrong by one word |

Difficulty ramp: rounds 1–2 warm-up (true-false / choice), middle rounds use the
interactive kinds (input, match, sort, order), last 1–2 are boss-level traps.

═══════════════════════════════════════
ROUND SHAPES (copy exactly)
═══════════════════════════════════════

choice — one answer
{ "kind": "choice", "prompt": "...", "choices": [{"id":"a","label":"$...$"}, ...],
  "correctId": "a", "hint": "...", "explain": "...", "missExplain": "..." }

true-false — statement in the prompt, boolean answer
{ "kind": "true-false", "prompt": "Statement to judge.", "answer": false,
  "explain": "...", "missExplain": "..." }

input — typed answer (accepted variants are compared ignoring spaces/case/$)
{ "kind": "input", "prompt": "...", "answer": "13", "accept": ["13", "+13"],
  "placeholder": "Type your answer", "suffix": "units",
  "hint": "...", "explain": "...", "missExplain": "..." }

multi — select ALL correct (2+ correct, never all of them)
{ "kind": "multi", "prompt": "Select EVERY ...", "choices": [ ...4 options... ],
  "correctIds": ["a","d"], "explain": "...", "missExplain": "..." }

match — 3–5 pairs; right column is shuffled for the player
{ "kind": "match", "prompt": "Connect each ... to ...",
  "pairs": [{"id":"p1","left":"$...$","right":"$...$"}, ...],
  "explain": "...", "missExplain": "..." }

sort — 2–3 bins, 3–6 items, every bin used
{ "kind": "sort", "prompt": "Sort each ... by ...",
  "bins": [{"id":"even","label":"Even"}, {"id":"odd","label":"Odd"}],
  "items": [{"id":"i1","label":"$...$","binId":"even"}, ...],
  "explain": "...", "missExplain": "..." }

order — 3–5 items, exact sequence
{ "kind": "order", "prompt": "Line these up ...", "orderLabel": "Tap smallest → largest",
  "items": [{"id":"a","label":"$...$"}, ...], "correctOrder": ["a","b","c","d"],
  "explain": "...", "missExplain": "..." }

spot — the sentence becomes tappable words; the student taps the one that is wrong
{ "kind": "spot", "prompt": "One word breaks this definition. Tap it.",
  "sentence": "A relation is a function when every input has exactly two outputs.",
  "wrongWord": "two", "fix": "one",
  "explain": "...", "missExplain": "..." }
"wrongWord" must appear in "sentence" exactly once — otherwise add "wrongIndex" (0-based
word position). Break the meaning, never the grammar. Math in $...$ counts as one word.

Optional on any round: "hint" (student can reveal it for half points) and
"timeLimit" (seconds, overrides the module timer for that round).
The module "timer" is per round and stretches automatically for slower mechanics
(match / sort / order get ~1.8x, multi 1.4x, input 1.2x), so set it for a plain
choice round and let the rest scale.

═══════════════════════════════════════
GAME FEEL (required — make it a game)
═══════════════════════════════════════

Pick ONE fantasy that fits the skill, then keep it consistent across title, subtitle,
description, and promptLabel:

| Theme vibe | Good for | Example promptLabel |
|------------|----------|---------------------|
| Race / dash | speed skills, domains, deg↔rad | "Next checkpoint" |
| Hunt / spot | zeros, unit circle, asymptotes | "Track the target" |
| Swap / unlock | inverses, identities, exp↔log | "Unlock the inverse" |
| Twist / morph | transformations | "Twist it" |
| Defuse / trap | common mistakes matter | "Defuse this trap" |
| Sort / triage | classification skills | "Send it to the right bin" |

Rules:
1. subtitle — action words + stakes. "Dodge the traps — pick the true inverse before lives run out."
2. description — sell the fantasy for the Games list card, and name the mechanics ("type, match, sort").
3. promptLabel — short, imperative, themed (2–4 words): Dash, Hunt, Twist, Swap, Aim, Spot, Unlock, Defuse.
4. Emojis — optional, max 2 across the whole module. Never inside math $...$.
5. Wrong choices = "sneaky traps": real student mistakes (sign flip, ±h confusion, reciprocal
   instead of inverse, forgot the domain). Never random garbage.
6. explain — short celebration beat, then the math reason: "Clean hit! $x - 3$ slides it right 3."
7. missExplain — "Trap sprung!" / "Almost —" beat, then the exact fix. Name the mistake.
8. hint — a nudge, never the answer. One short sentence.
9. Keep every string tight. No story paragraphs, no invented graph images.

═══════════════════════════════════════
GAME ENGINES (allowed values of "game")
═══════════════════════════════════════

Functions & graphs: transform-twist, domain-dash, range-rally, inverse-swap,
  match-equation, composition-combo, piecewise-patrol, rate-race
Polynomials & rationals: factor-sprint, zero-hunt, asymptote-aim, end-behavior,
  sign-chart, quadratic-quest, system-showdown, binomial-blitz
Exp / log: exp-log-link, log-solve-siege
Trig: deg-rad-dash, reference-angle, unit-circle-spot, identity-match,
  trig-equation-arena, law-of-triangles, polar-pursuit, parametric-path
Geometry / discrete: conic-classifier, sequence-sprint, matrix-mission, vector-vault,
  complex-clash, limit-leap, probability-push
Algebra I: equation-escape, slope-sprint, inequality-invaders, exponent-empire, radical-rumble
Number sense / business math: place-value-patrol, fraction-frenzy, percent-power, unit-convert-clash
Word games (vocabulary, see docs/WORD_GAME_PROMPT.md): word-game, definition-duel, keyword-hunt,
  synonym-swap, odd-one-out, precision-patrol, notation-decoder, example-hunt
Generic fallback: choice-rounds (use for mixed-skill review runs)

The engine sets the default prompt label and tells the app what the run is about;
the round "kind" fields decide how each round plays.

═══════════════════════════════════════
MATH & FORMATTING
═══════════════════════════════════════

- Inline math: $...$  (e.g. $f(x)=x^2$, $x \ge 3$)
- Use \$ ONLY for dollar amounts. Do NOT escape math delimiters — write $x$ not \$x\$.
- In JSON strings, every LaTeX backslash must be doubled: \\frac, \\sqrt, \\ge, \\circ.
- Spaces between words. Never glue text to $.
- Keep labels short — match/sort/order chips are small.
- For "input" rounds prefer plain answers ($13$, $-2$, $3/4$, $2\\pi$) and list variants
  in "accept" (e.g. "0.75", "3/4"). Avoid answers that need heavy LaTeX to type.

═══════════════════════════════════════
JSON SHAPE
═══════════════════════════════════════

{
  "type": "math-game",
  "id": "...",
  "courseId": "...",
  "title": "...",
  "subtitle": "...",
  "description": "...",
  "chapterHint": "...",
  "game": "factor-sprint",
  "promptLabel": "Sprint factor",
  "lives": 3,
  "timer": 30,
  "rounds": [ ...round objects from ROUND SHAPES... ]
}

═══════════════════════════════════════
ROUND RULES
═══════════════════════════════════════

1. Output ONLY raw JSON.
2. "type" must be "math-game"; "id" matches MODULE ID; "courseId" matches COURSE ID.
3. "game" must be exactly one allowed engine key.
4. Every round needs "kind", "prompt", "explain", and "missExplain".
5. Use at least 3 different kinds; at most 3 "choice" rounds in a row.
6. choice/multi: 2–4 options, unique ids (a/b/c/d), correctId/correctIds must match real ids.
7. multi needs 2+ correct ids but never all of them.
8. match: 3–5 pairs. sort: 2–3 bins with every bin used. order: 3–5 items.
9. input: give "answer" plus "accept" variants a student might reasonably type.
10. Prefer 6–10 rounds; do not rely on round order beyond the difficulty ramp (rounds shuffle).
11. Wrong options must be plausible traps (common mistakes), never nonsense.
12. Title / subtitle / description / promptLabel share one theme.

Now generate the module.
```

---

## Checklist before import

- [ ] Valid JSON (no trailing commas, no markdown fences)
- [ ] Every LaTeX command uses doubled backslashes in JSON (`\\frac`, not `\frac`)
- [ ] `type` is `math-game`, `game` is an allowed engine key
- [ ] At least 3 different round `kind` values (not all multiple choice)
- [ ] Every `correctId` / `correctIds` / `correctOrder` / `binId` points at a real id
- [ ] `multi` rounds have 2+ correct answers but not all of them
- [ ] `input` rounds list realistic `accept` variants
- [ ] `courseId` matches the **lesson course id** you will import into
- [ ] Theme is consistent (title / subtitle / description / promptLabel)
- [ ] Wrong choices are real “traps,” not random junk
- [ ] `explain` / `missExplain` start with a short game beat, then the math

## How scoring feels to the student

- Correct round: **100 points**, plus **+25 per streak step** (capped at +100), plus up to **+50** for answering fast when a timer is on.
- Revealing a `hint` halves that round’s points — it never costs a life.
- A wrong answer or a timeout costs one life and resets the streak.
- Lives, score, points, streak, round counter, and the timer bar are always visible.
- Author a larger pool and set `roundsPerRun` so each attempt draws a fresh subset — that stops students memorizing answer positions.
- After a run the student can **Retry the N you missed** instead of restarting the whole game. Personal bests and class boards use the full run’s points (retry runs do not overwrite a record).

## Related

- `docs/CHAPTER_CONCEPT_GAME_PROMPT.md` — one chapter lexicon game (no calculations)
- `docs/WORD_GAME_PROMPT.md` — extra vocabulary-mechanic detail
- `docs/CONTENT_SCHEMA.md` — Math game section
- `docs/FORMATTING_PROMPT.md` — shared math formatting
- `public/templates/math-game.template.json` — blank starter
- `src/utils/mathGameEngines.js` — source of truth for engine keys
- `src/utils/mathGameRounds.js` — source of truth for round kinds
