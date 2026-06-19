# ProvenMath LMS — Build Progress

**Project folder:** `C:\Users\baybo\OneDrive\PROVEN\provenmath-lms-v2`

When you return to a new chat, say:
> Continue ProvenMath LMS from PROGRESS.md

**Workflow:** Implement strictly one phase at a time. Pause after each phase and wait for **`[NEXT]`** before continuing.

---

## Current baseline (already built)

| Area | Status | Notes |
|------|--------|-------|
| Vite + React + Tailwind | ✅ | React 19, Tailwind v4 |
| React Router | ✅ | Hub, Login, Signup, CoursePlayer |
| Firebase init | ✅ | Auth + Firestore wired via `.env` |
| Email/Password auth | ✅ | Login, Signup, AuthContext |
| Hub (course list) | ✅ | Static `src/data/courses.js` |
| Course player (basic) | ✅ | Sidebar + one hardcoded lesson |
| KaTeX | ✅ | `MathText` component (`$...$`, `$$...$$`) |

**Not yet built:** Google auth, Anonymous guest, AuthCallback, dynamic JSON loader, module types (quiz/flashcard), Firestore-backed courses, gamification, AI tutor, admin dashboard, live class, printables, Recharts, Storage, Cloud Functions.

---

## Phased roadmap

### Phase 1: Foundation & Authentication — ✅ Done
- [x] Extend `AuthContext`: Google sign-in, Anonymous guest login
- [x] Add **`role`** to user profile: `admin` | `teacher` | `student`
- [x] Role-based routing (students → Hub; teachers → `/teacher`; admin → `/admin`)
- [x] Add `AuthCallback` route (OAuth redirect handling)
- [x] Firestore `users/{uid}` with `role` field on first sign-in
- [ ] Enable Google + Anonymous in Firebase Console *(manual step — see Notes)*

### Phase 2: Course Player & Content Rendering — ✅ Done
- [x] **Dynamic JSON loader** — fetch from `public/lessons/` via `fetch()`
- [x] **`InteractiveLesson.jsx`** — `explanation`, `example`, `question` + KaTeX
- [x] **`QuizModule.jsx`** — paginated questions, `timeLimit`, shuffled `options`, 2-level `hints`, `feedbackIfWrong`
- [x] **`FlashcardModule.jsx`** — `cards` with 3D flip
- [x] **`Sidebar.jsx`** + refactor **`CoursePlayer.jsx`** — syllabus from `public/courses/{id}/course.json`
- [x] **`ProgressContext`** — module completion in localStorage
- [x] **JSON schema docs** — `docs/CONTENT_SCHEMA.md`

### Phase 2b: Content Manager (teacher menu) — ✅ Done
- [x] Blank JSON templates in `public/templates/`
- [x] AI lesson builder prompt in `docs/LESSON_BUILDER_PROMPT.md`
- [x] **Content Manager** at `/teacher/content` — import, reorder, edit, preview, export
- [x] Custom courses saved in browser localStorage (overrides bundled JSON)

### Phase 3: Gamification & AI Tutor — ✅ Done
- [x] `GamificationContext` — XP, hearts, streaks, badges
- [x] `BadgeSystem`, `StreakTracker`, `Leaderboard` on Hub
- [x] XP: `15 - hintsUsed * 5` (min 5); Hearts: start 3, −1 on wrong, reset daily
- [x] `firebase/functions/personalizedTutor.js` (Gemini, Socratic prompt)
- [x] `src/services/skillTracker.js` — `mastery`, `wrongAnswers[]` → Firestore
- [x] `AIPersonalizedTutor.jsx` in course player
- [x] **Persistent AI memory** — tutor sessions + skill profile in Firestore

### Phase 4: Admin & Teacher Dashboards — ✅ Done
- [x] **Admin:** user role management, published course overview, report links
- [x] **Teacher:** Course Builder — publish/unpublish courses to Firestore
- [x] **Teacher:** Content Manager — “Publish to Firestore” button
- [x] **Teacher:** Course Assets — upload PDFs/videos, add external links (Firebase Storage)
- [x] **Admin/Teacher:** ReportingDashboard — roster, gradebook, CSV export
- [x] Progress syncs to Firestore on module completion (for gradebook)
- [x] Hub merges published Firestore courses with bundled catalog
- [x] `firestore.rules` + `storage.rules` (deploy with `firebase deploy --only firestore:rules,storage`)

### Phase 5: Live Class & Printables — ✅ Done
- [x] **Live Class** — teacher **Go live** / **End live** in course player
- [x] Students auto-sync to teacher's module via Firestore `liveSessions/{courseId}`
- [x] **Hub banner** when a class is live
- [x] **`DownloadManager.jsx`** — course assets + formula cheat sheet
- [x] **Formula cheat sheet** generator (Algebra I, Geometry, Pre-Calculus) — print-ready KaTeX page

### All planned phases complete 🎉

---

## User roles

| Role | Who | Can do |
|------|-----|--------|
| **Student** | Learners | Take courses, quizzes, AI tutor, earn XP/badges, join live class |
| **Teacher** | Instructors | Build courses, import/paste lesson JSON, upload PDFs/videos/links/games, run live class, view their class roster & grades |
| **Admin** | Platform owner | Everything teachers can do **plus** manage teachers, all courses, system-wide settings & reports |

- Every account gets a **`role`** stored in Firestore (`users/{uid}.role`).
- New sign-ups default to **`student`**. Admin promotes users to **teacher** (or admin creates teacher accounts).
- **First admin:** set manually in Firebase Console on your own user document.
- Routes and UI show only what each role is allowed to see (Firestore Security Rules enforce on backend).

---

## Content delivery (two paths)

1. **Admin / Teacher — JSON importer** — paste lesson/quiz/flashcard JSON → Firestore (primary production path)
2. **Teacher uploads** *(later in Phase 4/5)* — PDFs, videos, links, games attached to their course modules

**Key principle:** LMS parses any valid lesson JSON schema without code changes per lesson. Teachers/admins prepare content; students consume it.

**Students do not upload course content** — they interact with lessons, AI tutor, and live class only.

---

| Layer | Choice |
|-------|--------|
| Frontend | React + Vite + Tailwind |
| Routing | React Router v6+ |
| Charts | Recharts *(not installed yet)* |
| Math | KaTeX |
| Backend | Firebase Auth, Firestore, Storage, Cloud Functions |
| AI Tutor | Cloud Function → Google Gemini |

---

## Firestore data models *(partial)*

### `users/{uid}`
```json
{
  "email": "teacher@school.edu",
  "displayName": "Ms. Rivera",
  "role": "teacher",
  "createdAt": "..."
}
```

### `courses/{courseId}`
```json
{
  "id": "courseId",
  "title": "Business Math",
  "chapters": [{
    "id": "ch22",
    "title": "Chapter 22",
    "modules": [{
      "id": "mod-ch22-lu1-lesson",
      "type": "interactive-lesson",
      "title": "Mean"
    }]
  }]
}
```

> **TODO:** Awaiting full schema for `modules/`, user progress, skills, live class, and module JSON payloads (lesson / quiz / flashcard).

---

## AI tutor memory (cross-session)

**Short answer:** Yes. The AI can remember a student and reference past conversations — but **we** must store and reload that data. Gemini does not remember users by email on its own.

### How we identify the student
| Identifier | Use |
|------------|-----|
| Firebase **`uid`** | Primary key for all memory (stable, secure) |
| **Email / display name** | Shown in UI and optional greeting only |
| Anonymous guest | Memory tied to guest `uid` until they sign up; link accounts to keep history |

### What we store in Firestore

**`users/{uid}`** — profile (includes `role`: admin | teacher | student)
```json
{ "email": "...", "displayName": "...", "role": "student", "createdAt": "..." }
```

**`users/{uid}/skills/{skillId}`** — misconceptions & mastery
```json
{ "mastery": 0.65, "wrongAnswers": ["confused slope with intercept"], "lastSeen": "..." }
```

**`users/{uid}/tutorSessions/{sessionId}/messages/{messageId}`**
```json
{ "role": "user" | "assistant", "content": "...", "createdAt": "..." }
```

### How a new chat “remembers”
1. Student signs in → we know `uid`.
2. Cloud Function loads recent messages + skill profile + optional session summaries.
3. System prompt: *“This is Alex. Last time they confused slope and intercept…”*
4. Each turn is saved back to Firestore.

### Practical limits
- Use a **recent message window** (e.g. last 20 turns) plus **rolling summaries** for older sessions (token/cost control).
- Anonymous users keep memory only on that device/account until they register.

---

## Notes

- Firebase: `.env` with web app config (see `.env.example`)
- **Firebase Console setup (Phase 1):**
  1. Authentication → Sign-in method → enable **Email/Password**, **Google**, **Anonymous**
  2. Firestore → create database (if not done)
  3. To become admin: Firestore → `users/{your-uid}` → set `role` to `admin` → log out/in
  4. To promote a teacher: set their `users/{uid}.role` to `teacher`
- **AI Tutor deploy (Phase 3):**
  1. Get a [Gemini API key](https://aistudio.google.com/apikey) (new keys start with `AQ.`)
  2. Copy `firebase/functions/.env.example` → `firebase/functions/.env`
  3. Set `GOOGLE_AI_API_KEY=AQ....` (not `VITE_FIREBASE_API_KEY`)
  4. `cd firebase/functions && npm install`
  5. `firebase deploy --only functions:personalizedTutor`
  6. Function uses Gemini REST (`v1beta`) + `systemInstruction` + chat history formatting
  7. Until deployed, tutor uses a local Socratic fallback
- **Deploy security rules:** `firebase deploy --only firestore:rules,storage` (includes `liveSessions`)
