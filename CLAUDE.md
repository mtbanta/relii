# Relii

## Start-of-session rule

At the start of EVERY session, read PROJECT_STATE.md before doing anything else. It tracks the current stage, what is done, open issues, and next steps.

## Project context

Relii is an AI sales training app for a university sales course.

- Relii lets sales students do role-play conversations with AI personas (a procurement director named Alex, later a plant manager named Jordan), get recorded on webcam, and receive itemized rubric scores.
- Users: about 25 students plus instructor accounts for fall 2026. The architecture should scale to about 270 users by configuration, not by a rebuild.
- Launch deadline: August 1, 2026.

## Tech stack (already decided, do not change)

- Next.js deployed on Vercel
- Supabase for database, auth, and file storage
- OpenAI Realtime API for voice conversations
- Browser MediaRecorder for webcam capture
- LLM-based rubric scoring

## Build order

1. Skeleton plus invite-only auth
2. Data model
3. Text role-play demo
4. Real-time voice
5. Video capture
6. Scoring engine
7. Practice and assignment session lifecycle
8. Instructor dashboard
9. Testing

## Conventions

- File names use kebab-case (for example: project-state.md, alex-persona.md).
- No em dashes in any text, anywhere. Use commas, parentheses, or separate sentences instead.
- The project owner is a non-coder. Write all code, explain things in plain English, and avoid unexplained jargon.
- Ask before making big decisions (new dependencies, schema changes, anything hard to reverse, or anything that changes the agreed plan).
