# Project State

This file is the running status of Relii. Read it at the start of every session.

## Current Stage

Stage 1: Skeleton plus invite-only auth. Complete.
Next up: Stage 2 (data model).

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

## Open Issues

- None.

## Next Steps

- Before Stage 2 or alongside it, document in docs/ the early planning items: the Alex persona details, the scoring rubric, and the data model sketch.
- Begin Stage 2: data model (the tables for personas, assignments, practice and assignment sessions, recordings, and scores).
- Deferred to Stage 7 (practice and assignment session lifecycle): let instructors delete a student, which at that point should also clean up that student's sessions and videos. Not built now because there is nothing yet for it to clean up.
