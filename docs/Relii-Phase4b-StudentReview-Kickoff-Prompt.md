# Phase 4b: What the Student Sees, and the CSV

The second and last Phase 4 session. **Phases 2, 3a and 4a are closed; do not reopen them.** 4a stored every field this piece needs, so **4b is rendering only: no migration, no new column, and no change to the review route or `save_submission_review()`.** If you find you need any of those, stop and say why before writing it.

**Before anything else, state the filename and line count you read.**

## READ FIRST

**PROJECT_STATE.md, "Phase 4b handoff", items 1 to 10. It is the real brief.** Items 3 (`scored_by` marks the LEVEL, not the note), 5 (a student surface never reads `submission_ai_scores`) and 7 (the `window.confirm` trap in the rig) will each cost you time if skipped.

**AUDIT THE CODE BEFORE YOU PLAN.** Line numbers were checked against `16362db`. **STATE YOUR PLAN AND WAIT FOR APPROVAL.**

**Owner ruling, September 11: no real student work will be in the app before 4b ships.** The between-sessions rule cannot bite, and there is nothing to raise with Tom about it.

## The owner's rulings. Build to them; do not reopen them.

**From the September 10 scoping:** before review the student sees the AI score labelled provisional, not hidden (a submission is always an already-scored practice, so they have already seen it). After review they see only the instructor's level. Student strings are **"Pending Review" in amber, then "Reviewed" in green.** Practices are never reviewed and never show either state.

**From September 11, for this piece:**
1. **STUDENT HOME: REPLACE THE BADGE.** The green "Submitted" badge (`app/student/page.tsx` line 416) becomes "Pending Review" or "Reviewed". The summary line below it (line 482) keeps "Submitted · score · Length", so "submitted" is still stated once.
2. **LABEL EVERY AI COMMENT, AND FLAG CHANGED LEVELS.** Every comment `components/rubric-score.tsx` renders reads as **"AI feedback"**, on practices and submissions alike. A criterion with `scored_by === "instructor"` also shows **"Level set by your instructor"**. `instructor_note`, where present, renders as **"Instructor note"** in plain text. **No unlabelled comment can be mistaken for the instructor's.** Never show the AI's original level to a student.
3. **RESULTS PAGE HEADER, WITH THE DATE.** Before review: **"Pending Review. Your instructor may adjust this score."** After: **"Reviewed by your instructor on <date>."** Both appear on the printed PDF.
4. **CSV, INSTRUCTOR WORDING.** A header **Status** line reading **"To review"** or **"Reviewed <date>"**, matching the dashboard. Columns become **Item, Level, AI level, Points earned, Points max, Comment, Instructor note.** **AI level is always filled**: from `submission_ai_scores` when a stored original exists, and otherwise equal to Level, because an unreviewed score IS the AI's.

## What the audit found, to verify rather than trust

- **`RubricScore` is shared.** It renders on the student results page (`app/student/session/[id]/results/page.tsx` line 369) AND read-only on the instructor submission page (`app/instructor/submission/[id]/page.tsx` line 490). "Level set by your instructor" addresses a student. **The instructor render must not speak to the instructor as if they were the student**; propose how, and do not fork the component into two that can drift.
- **Neither student read selects `reviewed_at` yet**: the results page session read (around line 55) and the student home submission read (line 220). Both need it. It lives on `sessions`, which students may read, so no grant question arises.
- **Handoff item 9:** lines 486 and 578 of `app/student/page.tsx` interpolate scores without `formatPoints`. Route both through it.
- **THE CSV'S AI LEVEL MUST NEVER LIE.** If a submission is reviewed but has no stored original (the state 4a's editor and retake both refuse), leave AI level blank and add a Note line saying so. Never fall back to the current level and call it the AI's. A score with no rubric keeps today's blank Level and its existing note.
- **DATES: MEASURE BEFORE YOU RENDER ONE.** `formatDateTaken()` in `lib/date-taken.ts` calls `toLocaleString` with no `timeZone`, and both pages are server components. On Vercel that may mean UTC, so a review saved at 9pm Central could print as the next day. **Measure what timezone the live site actually renders, using a timestamp you know, and report it before choosing.** Do not change how any EXISTING date renders; that is the owner's call, since it touches every "Date Taken" in the app.

## Not in scope

Anything that writes: the review route, the function, the migration files, retake. The instructor editor and dashboard (4a). The rest of Phase 3, Phase 6, and the gradebook export.

## Proof, run by you end to end

**relii.vercel.app, "B1: A demo class" only. Baseline first**, including `submission_resets`, `assignment_deletes` and both 4a tables, because 4a left rows that are expected and permanent.

1. **A real submission** (voice through the rig, handoff item 7's dialog handler registered first). As the student: the home badge reads Pending Review in amber, and the results header reads the pending sentence. **Every comment reads "AI feedback", and no "Level set by your instructor" appears anywhere.**
2. **Review it as the instructor:** change one criterion's level with a note, and leave another unchanged with a note. As the student: Reviewed in green on the home card, the reviewed sentence with its date, **the changed criterion showing its flag and its note, and the unchanged one showing its note with no flag.** In that criterion's rendered section on the student page, the AI's original level name must not appear anywhere (it may legitimately appear elsewhere on the page, on another criterion).
3. **Print** the results page under print emulation: every criterion expanded, and every label, note and the status sentence present.
4. **A note containing `<b>bold</b> & "quotes"`** renders as those literal characters.
5. **A practice** shows AI feedback labels and no review state.
6. **The instructor page's read-only render** uses wording that does not address a student.
7. **Two CSVs, parsed rather than eyeballed**: before review (Status "To review", AI level equal to Level on every row) and after (Status "Reviewed <date>", AI level different from Level on exactly the changed row, the note in its column). Both are a matched pair.
8. **Retake after review:** the practice the student gets back shows no flag and no note, because the AI score was restored.
9. **The timezone measurement**, reported as observed.
10. `scripts/check-rubric-render.mjs` extended for the labels, the flag, the note and the literal-HTML note, and all checks passing, **with the count stated from the file, not from memory**. Plus clean `tsc`, eslint, and `npm run build` after deleting `.next`, with exit code and timestamp.

**Cleanup** follows 4a's order. **Never type DELETE.** Record the id of any new permanent audit or review row.

## How testing runs: you run it

SQL is read-only in this piece: **every check section returns its answer as its last statement** (the Supabase MCP drops `raise notice`), and counts beat "expect zero rows". The click-through runs through the Playwright MCP on the live site. **Confirm the deploy by observing something only the new build renders**, such as "AI feedback". The owner supplies passwords; **ask which student account** (handoff item 8). Announce every destructive click. git commit and push stay behind their ask rules.

## Rules this project paid for

**A GREEN RESULT IS EVIDENCE ONLY WHEN YOU KNOW WHICH ARTIFACT PRODUCED IT. A REFUSAL BESIDE A MATCHING SUCCESS IS A MEASUREMENT. VERIFY AT THE LAYER THAT CONSUMES THE THING**: here that is the rendered page and the parsed file, not the component's props.

## Conventions

No em or en dashes outside chat. Record each owner ruling in PROJECT_STATE when it is given. Update PROJECT_STATE before the owner clears the session, and write the next handoff for **the rest of Phase 3**, naming what 4b leaves true about scores that Phase 3's scenario work must not disturb.
