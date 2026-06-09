# Project State

This file is the running status of Relii. Read it at the start of every session.

## Current Stage

Stage 2: Data model. Complete.
Next up: Stage 3 (text role-play demo).

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

## Open Issues

- None.

## Next Steps

- Document and then load the actual content into the new tables: the Alex persona details, the first scenario(s), and the Great Northwoods 290-point rubric. The data model sketch is done (docs/data-model.md); these are now both planning docs and rows to insert.
- Begin Stage 3: text role-play demo. Use a scenario and its persona to run a text conversation and save the transcript into a session row. This is the first feature that needs the server-side service-role key (server only, never in the browser).
- Deferred to Stage 7 (practice and assignment session lifecycle): enforce the cap of 3 practice sessions per student per assignment; delete a student's practices for an assignment when they submit; and let instructors delete a student, which should also clean up that student's sessions and videos.
