# Chapter Concept Game — Builder Prompt

Paste this for an AI generating **one vocabulary / concept game per chapter** for ProvenMath Games.

This is a normal `math-game` module (same import path, same runner, same scoring). What makes it a **chapter concept game** is:

- **ONE game per chapter**
- **Title = the exact chapter name** (not an arcade title, not “Ch 1.3 · Topic Lexicon”)
- Goal is **language and concepts**, not solving — no calculations, no numeric input, no equation solving
- **Pool ≈ 30**; each play draws **10** (`roundsPerRun`: 10)
- Engine key: `"game": "concept-game"`

**How to use it:** upload the chapter’s lesson JSON (and/or outline), paste the prompt block below, and the AI returns one game JSON. Import at **Games → open the course → + Import JSON → Publish to Hub**. Until you publish, the game is a local draft only you can see.

**Export:** Games → open the course → **Export JSON** (all games, menu-title filenames) or **Export** / **Edit JSON** on one card.  
**Link into a lesson:** Course Builder → section → **+ Game**.

**Formatting-only add-on:** also paste `docs/FORMATTING_PROMPT.md` when regenerating content.

**Template:** `public/templates/math-game.template.json`

**Extra vocab-mechanic detail:** `docs/WORD_GAME_PROMPT.md` — this file is what you paste for chapter lexicon games now. Use WORD_GAME only for extra spot/trap nuance, not as a competing 8–10 round product.

**Arcade / calculation games:** `docs/GAME_BUILDER_PROMPT.md` (Factor Sprint, Domain Dash, typed numbers). Do not mix those engines into a chapter concept game.

---

```
You are a PRECALCULUS LEXICON mini-GAME designer for ProvenMath LMS — not a worksheet writer.

I will paste lesson JSON next (interactive-lesson modules and/or a chapter outline).
Read them and extract the VOCABULARY and CONCEPT LANGUAGE: defined terms, notation,
keywords, distinctions (domain vs range, input vs output), and sentences where changing
one word would make the statement false.

Then create ONE math-game module as valid JSON only — no markdown fences, no commentary.

The run must feel like a short game (Prodigy / Duolingo / Kahoot energy): a theme in the
subtitle and promptLabel, changing mechanics, sneaky trap words — never a 10-item quiz
of the same shape.

═══════════════════════════════════════
PRODUCT RULES (non-negotiable)
═══════════════════════════════════════

1. ONE game per chapter. Title MUST be the course’s exact chapter name
   (e.g. "Functions" or "Chapter 1 Functions" — copy the chapter title, do not invent
   "Domain Dash" or "Function Lexicon"). Optional: put lexicon flavour in subtitle or id
   (e.g. id "ch01-functions-lexicon"). Do NOT use "Ch X.Y · Topic Lexicon" as the title.
2. Goal = understanding language and concepts, NOT solving. Students hunt a wrong word,
   judge a definition, pick a term, type a term, or match two pairs. They do NOT compute.
3. NO calculations. NO numeric input. NO equation solving. "input" rounds are one-word
   cloze (type the term) only — never a number.
4. Author a pool of about 30 rounds. Set "roundsPerRun": 10 so each play draws 10.
   Omit "conceptType" on every round. The player shuffles the pool and slices 10.
   Do not tag the old four types (lexicon / error-hunt / always-sometimes-never / sort-odd).
5. Mix mechanics: at least THREE different kinds in the pool. Never more than 3 "choice"
   rounds in a row. Include several "spot" rounds — that is the signature mechanic.
6. Use KaTeX-friendly math in $...$ (inline). In JSON every LaTeX backslash is DOUBLED:
   \\frac, \\sqrt, \\ge, \\cup, \\circ, \\left, \\right. No markdown fences inside strings.
7. Terms come from the pasted lessons — do not invent vocabulary the course never used.
8. Precalculus quality bar: precise language, real misconceptions, no grammar/spelling
   traps, no calculator busywork, no filler distractors.

COURSE ID: [must match the lesson course id, e.g. precalculus]
MODULE ID: [e.g. ch01-functions-lexicon] (lowercase, hyphens — one id for the whole chapter)
TITLE: [EXACT chapter name]
SUBTITLE: [1 themed line with stakes, e.g. "Say it exactly — one sloppy word and the definition breaks."]
DESCRIPTION: [1–2 sentences that sell the hunt and name the mechanics: spot, true-false, match]
CHAPTER HINT: [e.g. "Chapter 1 · Functions"]
GAME ENGINE: concept-game
PROMPT LABEL: [short ACTION cue — "Say it exactly", "Catch the word", "Define exactly"]
LIVES: 3
TIMER: 30
ROUNDS IN POOL: ~30
ROUNDS PER RUN: 10

Timer is seconds per round. 30–40 is fine. The player stretches slower kinds automatically
(match / sort ~1.8×, spot ~1.3×, input ~1.2×), so set timer for a plain true-false / choice
round and let the rest scale. A round may override with "timeLimit".

Top-level JSON shape (field names must match — the runner loads these):

{
  "type": "math-game",
  "id": "ch01-functions-lexicon",
  "courseId": "precalculus",
  "title": "Functions",
  "subtitle": "…",
  "description": "…",
  "chapterHint": "Chapter 1 · Functions",
  "game": "concept-game",
  "promptLabel": "Say it exactly",
  "lives": 3,
  "timer": 30,
  "roundsPerRun": 10,
  "rounds": [ /* ~30 items */ ]
}

═══════════════════════════════════════
LEXICON-FIRST MIX (required kinds)
═══════════════════════════════════════

Use these kinds. Suggested pool (~30) so a 10-draw stays fresh:

  spot ........ 8–10   find the wrong word (signature — include several)
  true-false .. 6–8    definition right or wrong
  choice ...... 6–8    prefer 2 options; if 4, they must be chapter terms
  match ....... 4–6    exactly 2 pairs (not 3–5)
  input ....... 2–4    one-word cloze — type the term, never a number
  sort ........ 0–3    OPTIONAL — examples vs non-examples, 2 bins, 3–4 items

Difficulty ramp (guide only — the player shuffles): first rounds true-false / spot,
middle match / sort / choice / cloze. Avoid boss-level traps and “select every” puzzles.

Do NOT author as required (drop these from this game):
  - error-hunt (worked-solution / statement-list line hunt)
  - always / sometimes / never
  - near-miss 4-choice odd-one-out
  - match with 3–5 pairs
  - multi (“select every”)
  - order of solution steps
  - typed numbers or expressions

Optional / rare (not required every run):
  - sort: example vs non-example, 2 bins
  - 2-choice: domain vs range (or another two neighbouring terms)

═══════════════════════════════════════
ROUND SHAPES (copy field names exactly)
═══════════════════════════════════════

--- spot — FIND THE WRONG WORD (signature) ---
{
  "kind": "spot",
  "prompt": "One word breaks this definition. Tap it.",
  "sentence": "A relation is a function when every input has exactly two outputs.",
  "wrongWord": "two",
  "fix": "one",
  "hint": "Count the outputs a single input is allowed to have.",
  "explain": "Clean hit! Exactly one output per input — that is the whole rule.",
  "missExplain": "Trap sprung! The broken word is two. A function gives each input exactly one output."
}

Rules for spot:
- Exactly ONE word may be wrong. Copy it character-for-character into "wrongWord".
- If that word appears more than once, reword OR add "wrongIndex" (0-based word position).
- "fix" is the correct replacement. Always include it.
- Break MEANING, never grammar or spelling. Swap: exactly/at least, all/some, one/two,
  horizontal/vertical, input/output, domain/range, always/never, and/or,
  increasing/decreasing, greater/less, necessary/sufficient.
- Keep the sentence 8–18 words so the hunt is fair. Math inside $...$ counts as one word.

--- true-false — IS THIS DEFINITION RIGHT? ---
{
  "kind": "true-false",
  "prompt": "Every relation is a function.",
  "answer": false,
  "explain": "Clean hit! Functions are the relations with the one-output rule attached.",
  "missExplain": "Trap sprung! A relation is any pairing. It is a function only when each input has exactly one output."
}

--- choice — 2 options preferred ---
{
  "kind": "choice",
  "prompt": "Which term names the set of all allowed inputs of $f$?",
  "choices": [
    { "id": "a", "label": "Domain" },
    { "id": "b", "label": "Range" }
  ],
  "correctId": "a",
  "explain": "Clean hit! Domain in, range out.",
  "missExplain": "Trap sprung! Domain is allowed inputs; range is outputs that occur."
}

If you use 4 options, they must be real chapter terms (Domain / Range / Codomain / Interval),
not a philosophy of near-miss odd-one-out. Unique ids; correctId points at a real id.

--- match — 2 PAIRS ONLY ---
{
  "kind": "match",
  "prompt": "Connect each term to the definition it owns.",
  "pairs": [
    { "id": "p1", "left": "Domain", "right": "The set of all allowed inputs" },
    { "id": "p2", "left": "Range", "right": "The set of all outputs that occur" }
  ],
  "explain": "Clean hit! Domain in, range out.",
  "missExplain": "Trap sprung! Domain is inputs; range is outputs."
}

Exactly 2 pairs. Left side short (term or symbol); right side one clean clause.
The player shuffles the right column.

--- input — ONE-WORD CLOZE (type the term) ---
{
  "kind": "input",
  "prompt": "Fill the missing term: the ______ of a function is the set of all its outputs.",
  "answer": "range",
  "accept": ["range", "the range"],
  "placeholder": "One word",
  "explain": "Clean hit! Range = outputs that occur.",
  "missExplain": "Trap sprung! Outputs → range. Inputs → domain."
}

One word only. Never a number. List plural/article variants in "accept".

--- sort — OPTIONAL examples vs non-examples (2 bins, 3–4 items) ---
{
  "kind": "sort",
  "prompt": "Sort each phrase: example of a function, or not.",
  "bins": [
    { "id": "yes", "label": "Is a function" },
    { "id": "no", "label": "Not a function" }
  ],
  "items": [
    { "id": "i1", "label": "Each input has exactly one output", "binId": "yes" },
    { "id": "i2", "label": "One input paired with two outputs", "binId": "no" },
    { "id": "i3", "label": "Passes the vertical line test", "binId": "yes" },
    { "id": "i4", "label": "A circle $x^2+y^2=1$", "binId": "no" }
  ],
  "explain": "Clean hit! One output per input — that is the function rule.",
  "missExplain": "Trap sprung! Two outputs from one input (or a vertical pair on a circle) fail the definition."
}

2 bins, 3–4 items, every bin used. Keep this rare.

Optional on any round: "hint" (student reveals it for half points) and "timeLimit" (seconds).

═══════════════════════════════════════
GAME FEEL
═══════════════════════════════════════

Keep title = chapter name. Put the fantasy in subtitle, description, and promptLabel
(hunt / spot / defuse the wrong word).

1. subtitle — action + stakes. "Say it exactly — one sloppy word and the definition breaks."
2. description — sell the hunt for the Games list card, and name the mechanics.
3. promptLabel — short imperative (2–4 words): Say it exactly, Catch the word, Define exactly.
4. Emojis — optional, max 2 across the whole module. Never inside math $...$.
5. Wrong answers = real student mix-ups (domain/range, input/output, exactly/at least).
   Never random junk.
6. explain — short beat, then the idea: "Clean hit! Domain in, range out."
7. missExplain — "Trap sprung!" then the exact confusion.
8. hint — a nudge toward the distinction, never the word itself.
9. Keep every string tight. No paragraphs.

Mine traps from: quantifier swaps, direction swaps (input/output, domain/range,
horizontal/vertical), everyday meaning vs math meaning, and neighbour terms.

═══════════════════════════════════════
KaTeX / JSON
═══════════════════════════════════════

- Inline math only: $f(x)$, $\\frac{1}{x}$, $\\sqrt{x-4}$, $x \\to \\infty$
- Escape backslashes in JSON strings: "\\frac{a}{b}", "\\pm", "\\circ"
- Do not wrap the whole prompt in $...$; only the math fragments
- Spaces between words. Never glue text to $.
- In a spot "sentence", each $...$ span is one tappable word — keep it short

═══════════════════════════════════════
HARD RULES
═══════════════════════════════════════

1. Output ONLY raw JSON.
2. "type" is "math-game"; "id" matches MODULE ID; "courseId" matches COURSE ID.
3. "game" is exactly "concept-game".
4. "title" is the exact chapter name. "chapterHint" looks like "Chapter 1 · Functions".
5. "lives": 3, "timer": 30 (or 30–40), "roundsPerRun": 10, pool ~30.
6. Every round has "kind", "prompt", "explain", and "missExplain". Omit "conceptType".
7. At least 3 different kinds; several "spot"; never more than 3 "choice" in a row.
8. Every spot: "wrongWord" appears in "sentence" exactly once (or give "wrongIndex"), and "fix" is present.
9. choice: 2 options preferred; unique ids; correctId is a real id.
10. match: exactly 2 pairs. sort (if used): 2 bins, 3–4 items, every bin used.
11. input answers are ONE word (the term), with "accept" variants — never a number.
12. No error-hunt, no always/sometimes/never, no multi, no 3–5 pair match, no calculations.

Now read the lesson JSON I will paste next and generate the module.
```

---

## Mini schema sample

Copy-paste reference for field names the player already understands. A real chapter file should have ~30 rounds and `"roundsPerRun": 10`. This 4-round demo still imports (the player uses the full pool when `roundsPerRun` is larger than the file).

```json
{
  "type": "math-game",
  "id": "ch01-functions-lexicon-sample",
  "courseId": "precalculus",
  "title": "Functions",
  "subtitle": "Say it exactly — one sloppy word and the definition breaks.",
  "description": "Hunt the wrong word, judge definitions, pick the term, and match two pairs — Chapter 1 language, no calculator.",
  "chapterHint": "Chapter 1 · Functions",
  "game": "concept-game",
  "promptLabel": "Say it exactly",
  "lives": 3,
  "timer": 30,
  "roundsPerRun": 10,
  "rounds": [
    {
      "kind": "spot",
      "prompt": "One word breaks this definition. Tap it.",
      "sentence": "A relation is a function when every input has exactly two outputs.",
      "wrongWord": "two",
      "fix": "one",
      "hint": "Count the outputs a single input is allowed to have.",
      "explain": "Clean hit! Exactly one output per input — that is the whole rule.",
      "missExplain": "Trap sprung! The broken word is two. A function gives each input exactly one output."
    },
    {
      "kind": "true-false",
      "prompt": "Every relation is a function.",
      "answer": false,
      "explain": "Clean hit! Functions are the relations with the one-output rule attached.",
      "missExplain": "Trap sprung! A relation is any pairing. It is a function only when each input has exactly one output."
    },
    {
      "kind": "choice",
      "prompt": "Which term names the set of all allowed inputs of $f$?",
      "choices": [
        { "id": "a", "label": "Domain" },
        { "id": "b", "label": "Range" }
      ],
      "correctId": "a",
      "explain": "Clean hit! Domain in, range out.",
      "missExplain": "Trap sprung! Domain is allowed inputs; range is outputs that occur."
    },
    {
      "kind": "match",
      "prompt": "Connect each term to the definition it owns.",
      "pairs": [
        { "id": "p1", "left": "Domain", "right": "The set of all allowed inputs" },
        { "id": "p2", "left": "Range", "right": "The set of all outputs that occur" }
      ],
      "explain": "Clean hit! Domain in, range out.",
      "missExplain": "Trap sprung! Domain is inputs; range is outputs."
    }
  ]
}
```

---

## Checklist before import

- [ ] Valid JSON, no markdown fences, no trailing commas
- [ ] LaTeX backslashes doubled (`\\ge`, not `\ge`)
- [ ] `title` is the exact chapter name; `chapterHint` looks like `Chapter 1 · Functions`
- [ ] `game` is `concept-game`
- [ ] `lives`: 3, `timer`: 30–40, `roundsPerRun`: 10, pool ~30
- [ ] At least 3 different `kind` values; several `spot`; not all multiple choice
- [ ] No `conceptType` on new rounds (old tagged files still load)
- [ ] Every `spot`: `wrongWord` really appears in `sentence` (or `wrongIndex` is set), and `fix` is present
- [ ] `match` has **2 pairs**; `choice` prefers 2 options
- [ ] `input` answers are one word (the term), never a number
- [ ] No error-hunt, ASN, multi, or calculation items
- [ ] `courseId` matches the lesson course you will import into
- [ ] `explain` / `missExplain` start with a short beat (`Clean hit!` / `Trap sprung!`)

The importer rejects a `spot` round whose `wrongWord` is missing from the sentence or appears twice without `wrongIndex`, and warns when `fix` is absent.

---

## How scoring feels to the student

- Correct round: **100 points**, plus **+25 per streak step** (capped at +100), plus up to **+50** for answering fast when a timer is on.
- Revealing a `hint` halves that round’s points — it never costs a life.
- A wrong answer or a timeout costs one life and resets the streak.
- `score` is +1 per correct round (that is what drives XP). Arcade points power the leaderboard.
- Lives, score, points, streak, round counter, and the timer bar are always visible.
- Each attempt draws 10 from the ~30 pool, so answer positions do not memorize.
- After a run the student can **Retry the N you missed**. Personal bests use the full run’s points (retry runs do not overwrite a record). Finished runs still go through `recordGameRun`.

---

## Player behavior (for authors)

| Setting | Behavior |
|---------|----------|
| Any pool + `roundsPerRun: 10` | Shuffle, then take 10. No “at least one of each type” coverage. |
| `conceptType` omitted (new lexicon files) | Ignored — this is the default. |
| Old files tagged `lexicon` / `error-hunt` / `always-sometimes-never` / `sort-odd` | Still import and play, including error-hunt UI if those rounds are drawn. Do not author new ones with this prompt. |
| Scoring | `score` = +1 per correct round (XP); arcade points still apply for leaderboards |

---

## Related

- `docs/WORD_GAME_PROMPT.md` — extra vocabulary-mechanic detail (spot rules, trap sources)
- `docs/GAME_BUILDER_PROMPT.md` — arcade / calculation games
- `docs/FORMATTING_PROMPT.md` — shared math formatting
- `docs/CONTENT_SCHEMA.md` — Math game section
- `public/templates/math-game.template.json` — blank starter
- `src/utils/mathGameEngines.js` — engine key `concept-game`
- `src/utils/mathGameRounds.js` — kinds + `drawRunRounds`
