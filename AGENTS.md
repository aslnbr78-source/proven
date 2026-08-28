# ProvenMath LMS

A math-focused Learning Management System: React 19 + Vite + Tailwind v4 frontend with a
Firebase backend (Auth, Firestore, Storage, Cloud Functions) and a Gemini-powered AI tutor.
See `PROGRESS.md` for the full product/feature breakdown and Firestore data models.

## Cursor Cloud specific instructions

### Services
- **Frontend (Vite dev server)** — the app. Run `npm run dev` from the repo root (add
  `-- --host 0.0.0.0 --port 5173` when it needs to be reachable from outside the VM).
  Scripts live in `package.json`: `dev`, `build`, `lint`, `preview`.
- **Cloud Functions** (`firebase/functions/`) — optional AI tutor / practice / final-test
  passcode callables. Requires the Firebase CLI (not installed by the update script) plus
  `GOOGLE_AI_API_KEY` in `firebase/functions/.env`. Run locally via `npm run serve` (emulator)
  from that folder. The app degrades gracefully (local Socratic fallback) when functions are absent.

### Firebase config is required for anything auth-gated (non-obvious)
- The client only talks to **live Firebase** — there is **no emulator wiring** in
  `src/services/firebase.js` (no `connectAuthEmulator`/`connectFirestoreEmulator` calls), so
  starting the Firebase emulator suite alone will NOT make the app use it without code changes.
- Firebase only initializes when `VITE_FIREBASE_*` values are present in `/.env` (copy from
  `.env.example`). `isFirebaseConfigured` needs at least `apiKey`, `projectId`, and `appId`.
- Without those values the public Home page (`/`) still renders, but `/login` and `/signup`
  display "Firebase is not configured. Add your keys to .env.", and every route behind
  `ProtectedRoute` (Hub, CoursePlayer, teacher/admin dashboards) redirects to `/login`.
  To exercise the core learning flow (sign up → open a course → lesson/quiz/flashcard →
  AI tutor) you need a real Firebase project's web config in `/.env`.
- Static course/lesson JSON is served by Vite from `public/courses/**` and `public/lessons/**`
  (e.g. `/courses/algebra-1/course.json`), but it is only rendered inside the auth-gated CoursePlayer.
- First admin is set manually in the Firestore console (`users/{uid}.role = "admin"`); new
  sign-ups default to `student`. See `PROGRESS.md` → Notes.

### Lint
- `npm run lint` runs but currently reports pre-existing errors in the repo (e.g. in
  `src/pages/ReportingDashboard.jsx`, `src/utils/*`). These are not environment issues.
