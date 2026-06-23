# Project State

This file is the running status of Relii. Read it at the start of every session.

## Current Stage

Stage 4: real-time voice role-play. Complete and live at https://relii.vercel.app.
Next up: Stage 5 (video capture). Note: a content-only slice of Stage 6 (scoring) was pulled forward and is done; the rest of scoring (voice and delivery items, the OpenAI vs Claude bake-off, professor finalization) is still ahead.

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
- Stage 4: real-time voice role-play. Built and deployed live (confirmed working on https://relii.vercel.app).
  - A logged-in student picks the Alex scenario, clicks Practice (voice), and holds a spoken conversation with Alex over the OpenAI Realtime API. Alex greets first, the transcript appears live on screen, and ending the call produces the same itemized content score (out of 180) on the same results screen as the text demo.
  - Architecture: the browser connects directly to OpenAI over WebRTC for low latency. The browser never sees the real OpenAI key. The server mints a short-lived ephemeral token (a client secret that expires after about a minute) using the real key, and the browser uses only that token to open the voice session. Confirmed in testing: latency feels like a real call, with no dropouts.
  - Persona: the voice session uses the same instructions as the text demo (the scenario persona_system_prompt plus scenario_context, with the context fenced off as background), not a rewrite. Alex is nudged to open the meeting with a hidden message that is not saved to the transcript (mirrors the text demo's opening nudge).
  - Turn-taking: OpenAI server-side voice-activity detection. The silence-before-reply is set to 1600ms so the student is not cut off mid-thought (tuned with the owner during testing). It is a single number in lib/realtime.ts (silence_duration_ms) if it needs adjusting.
  - Transcript: captured in the browser from the Realtime events (Alex's speech, and the student's speech transcribed by gpt-4o-transcribe), then saved turn by turn through the server using the service-role key (the server stays the only writer). Transcript accuracy confirmed high in testing.
  - Scoring reuses the Stage 3 content scorer unchanged (the 18 Discovery content items, 180-point max), and the end route (/api/session/end) is shared with the text demo. Scoring confirmed thorough and accurate in testing.
  - Mode: voice sessions are stored as mode voice_video (the schema has no voice-only value) with video_path left null until Stage 5. Confirmed with the owner; no schema change.
  - Model: the voice model defaults to gpt-realtime, changeable via the OPENAI_REALTIME_MODEL env var (not set in Vercel, so it uses the default). Reuses the existing OPENAI_API_KEY; no new secrets were needed to deploy.
  - New code: lib/realtime.ts (mints the token; holds the voice, VAD, and transcription settings); the API routes app/api/voice/start, app/api/voice/token (mints at connect time, since the token expires quickly), and app/api/voice/transcript (saves each finished turn); components/voice-conversation.tsx (the WebRTC client and live transcript). The student session page now picks the voice or text screen by the session's mode; the home has a Practice (voice) button next to Practice (text); the results label is mode-aware.
  - App-wide change: the app is now forced to light mode. The default theme followed the operating system's dark mode, which flipped the page to a black background and washed out the gray transcript text. Reversible later if a polished dark theme is wanted.
  - Checkpoint decision (recorded): real-time WebRTC is stable enough (good latency, accurate transcript, no cutting the student off), so we kept it. The turn-based voice fallback was not needed.
  - Security hardening (after Stage 4, from the Supabase Security Advisor): revoked public/anon/authenticated execute on public.handle_new_user() so it can no longer be called by hand through the REST API. The signup trigger is unaffected (it runs as the function owner). SQL saved in supabase/stage-4-security-hardening.sql, run and verified in production (invited signup still works and lands on the right page; un-invited signup still blocked). Leaked-password protection was the other advisor item and is deferred (see Open Issues).

## Open Issues

- Leaked-password protection (the HaveIBeenPwned check in Supabase Auth) is deferred: the toggle is gated behind Supabase's Pro plan. Acceptable for the ~25-student launch. Revisit if the project moves to a paid Supabase plan or expands toward 270 users.
- Scoring calibration: the content scorer uses coarse anchor values (0, 3, 6, 8, 10) and leans a little generous on partial attempts. That was the right call for a consistent demo; revisit the calibration and granularity in the full scoring stage, alongside the OpenAI vs Claude bake-off.
- Voice transcript trust: in voice mode the transcript is captured in the browser and then written by the server, so a determined student could in theory alter their own transcript before scoring. Acceptable for practice runs with about 25 trusted students. Full server-side capture comes naturally with Stage 5 (recording the audio) and Stage 7 (graded submissions).
- Voice cost: voice spend scales with minutes. Prompt caching and the gpt-realtime vs gpt-realtime-mini cost bake-off are deferred (see the voice research note). Watch the OpenAI usage dashboard, especially before any expansion toward 270 users.
- Still deferred to Stage 7 (lifecycle): the cap of 3 practice sessions per student per assignment, and deleting a student's practices for an assignment when they submit.

## Next Steps

- Stage 5: video capture. Record the student's webcam with the browser's MediaRecorder and store the file in Supabase storage (the sessions.video_path column is ready and waiting). It runs alongside the voice call, which already records audio separately.
- Stage 6: the full scoring engine. Add the voice and delivery items, run the OpenAI vs Claude scorer bake-off, and add professor finalization. The content-only scorer built in Stage 3 is the starting point.
- Deferred to Stage 7 (practice and assignment session lifecycle): enforce the cap of 3 practice sessions per student per assignment; delete a student's practices for an assignment when they submit; and let instructors delete a student, which should also clean up that student's sessions and videos.
