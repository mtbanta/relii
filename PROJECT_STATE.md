# Project State

This file is the running status of Relii. Read it at the start of every session.

## Current Stage

Stage 3: Text role-play demo with content-only scoring. Complete and live at https://relii.vercel.app.
Next up: Stage 4 (real-time voice). Note: a content-only slice of Stage 6 (scoring) was pulled forward and is done; the rest of scoring (voice and delivery items, the OpenAI vs Claude bake-off, professor finalization) is still ahead.

## Completed

- Stage 0: project scaffolding (CLAUDE.md, PROJECT_STATE.md, docs/, .gitignore, git repo, GitHub at https://github.com/mtbanta/relii).
- Stage 1: app skeleton plus invite-only auth, deployed live.
  - Installed Node.js (the engine that runs the app) on the owner's Mac.
  - Created the Next.js app (Next.js 16, React 19, Tailwind for styling).
  - Connected the app to a Supabase project (project ref cmpvyralyungfmjoteex). Public keys live in a git-ignored .env.local locally and in Vercel's environment variables for the live site.
  - Built invite-only email and password login with two roles (student and instructor):
    - Two database tables: allowed_emails (the invite list) and profiles (one row per user, holds their role).
    - A database trigger blocks anyone whose email is not on the invite list from registering. This is enforced in the database, so it cannot be bypassed from the app.
    - Row Level Security so only instructors can read or add to the invite list.
    - The full database setup is saved in supabase/schema.sql.
    - Students land on /student and instructors on /instructor (both mostly empty for now). The instructor page has a working form to add emails to the invite list.
    - Email confirmation is turned OFF in Supabase, so invited users can log in immediately after registering.
    - The first instructor account (michaeltbanta@gmail.com) was seeded into the invite list.
  - Deployed to Vercel. Live and working at https://relii.vercel.app (login and inviting both confirmed working in production).
- Stage 2: data model. Built on Stage 1's two tables, four new tables created in Supabase.
  - rubrics: grading criteria stored as flexible JSON (swappable without code changes). Each item carries its points and a "both" or "voice-only" tag. No rubric loaded yet; the Great Northwoods 290-point criteria is loaded later.
  - scenarios: the role-play cases. Each holds a persona name, a persona system prompt, scenario context, and a required link to the rubric that scores it. Persona details live inside each scenario for now (decision E). No scenarios loaded yet.
  - assignments: an instructor points to a scenario and sets the required mode (text or voice_video). Optional instructions and due date (decision D).
  - sessions: one row per attempt. Holds the student, scenario, optional assignment link, kind (practice or submission), mode, status (in_progress, completed, scored), the transcript, the video path, the itemized score JSON, and a numeric total for sorting.
  - Built-in integrity: a submission must belong to an assignment; you cannot delete a rubric, scenario, or assignment that is still in use; deleting a student removes that student's sessions.
  - Row Level Security: students read only their own sessions; instructors read submissions but not practice runs; any instructor sees all submissions (decision B); scenarios, rubrics, and assignments are readable by any logged-in user and editable only by instructors. Sessions are server-write-only via the service-role key (decision A), so scores cannot be tampered with from the browser. Free practice not tied to an assignment is allowed (decision C).
  - Verified in the database that a student cannot read another student's sessions (a different student saw 0 rows, the owner saw 2). Test data was rolled back, so nothing persisted.
  - SQL saved in supabase/stage-2-data-model.sql (Stage 1's schema.sql untouched). Plain-English description in docs/data-model.md, ready to share with Tom.
  - Not built yet (Stage 7 lifecycle, schema supports both): enforcing the cap of 3 practice sessions per student per assignment, and deleting a student's practices for an assignment when they submit.
- Stage 3: text role-play demo with content-only scoring. Built and deployed live.
  - Seeded the data (no schema change): the Great Northwoods 290-point rubric and the Alex "Discovery-Close" scenario, copied verbatim from docs/persona-alex-procurement.md and docs/rubric-great-northwoods.json. The seed SQL is generated from those files by supabase/build-stage-3-seed.mjs into supabase/stage-3-seed.sql (safe to re-run; it skips rows that already exist).
  - A logged-in student picks the Alex scenario, holds a typed conversation with an AI persona that stays in character, ends the session, and sees an itemized content score alongside the transcript.
  - The conversation is a server-side OpenAI call (model gpt-4o by default, changeable via the OPENAI_MODEL env var). The OpenAI key and the Supabase service-role key are server-only env vars, never sent to the browser.
  - Sessions are written only by the server using the service-role key (decision A). The transcript is saved each turn; the student reads their own session back through Row Level Security.
  - Content-only scoring: when the session ends, the server scores the transcript against the 18 Discovery content items (180 points) in one low-temperature, structured (JSON) pass, with a short evidence comment per item, and saves the itemized score plus the total. Voice and delivery items are not scored in text mode.
  - To keep re-scoring consistent (the requirement was "within a few points"), each item is awarded one of five anchor values (0, 3, 6, 8, 10) with a fixed random seed. Verified: re-scoring the same transcript stayed within a 3-point spread. Trade-off: scores are coarser, so finer calibration is left for the full scoring stage.
  - New code: lib/openai.ts, lib/persona.ts, lib/scoring.ts, lib/types.ts, lib/supabase/admin.ts; the API routes app/api/session/start, app/api/chat, and app/api/session/end; the screens app/student/session/[id] (conversation) and app/student/session/[id]/results (score plus transcript); and the Practice button on the student home.
  - Live on Vercel. The two server-only secrets (OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY) are set in Vercel's Production environment. A fix was added so a key pasted with a stray line break (a common dashboard paste artifact) no longer breaks the request: the code strips whitespace from both keys before use.

## Open Issues

- Scoring calibration: the content scorer uses coarse anchor values (0, 3, 6, 8, 10) and leans a little generous on partial attempts. That was the right call for a consistent demo; revisit the calibration and granularity in the full scoring stage, alongside the OpenAI vs Claude bake-off.
- Still deferred to Stage 7 (lifecycle): the cap of 3 practice sessions per student per assignment, and deleting a student's practices for an assignment when they submit.

## Next Steps

- Stage 4: real-time voice. Replace the typed conversation with the OpenAI Realtime API for spoken role-play, keeping the same persona and session model.
- Stage 5: video capture. Record the student's webcam with the browser's MediaRecorder and store the file in Supabase storage (the sessions.video_path column is ready and waiting).
- Stage 6: the full scoring engine. Add the voice and delivery items, run the OpenAI vs Claude scorer bake-off, and add professor finalization. The content-only scorer built in Stage 3 is the starting point.
- Deferred to Stage 7 (practice and assignment session lifecycle): enforce the cap of 3 practice sessions per student per assignment; delete a student's practices for an assignment when they submit; and let instructors delete a student, which should also clean up that student's sessions and videos.
