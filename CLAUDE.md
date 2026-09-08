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
- That rule governs prose we author. It does not govern legal text we reproduce verbatim, because reproducing a document means reproducing it. There is exactly one such case today: line 51 of docs/Relii-clickthrough-agreement.md, the acknowledgment sentence in Tom's pilot agreement, which contains an em dash and must stay exactly as written. A repo-wide dash grep will find that line; it is not a defect. Do not resolve it by rewriting the sentence into the register page's checkbox label either: the agreement page shows Tom's full text verbatim, and the checkbox carries a short label of our own that follows this convention on its own.
- The project owner is a non-coder. Write all code, explain things in plain English, and avoid unexplained jargon.
- Ask before making big decisions (new dependencies, schema changes, anything hard to reverse, or anything that changes the agreed plan).
