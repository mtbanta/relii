# Phase 4a: The Instructor Review, Built on the Data It Needs

The first of two Phase 4 sessions. **Phase 2 and Phase 3a are closed; do not reopen either.** 4a is the data, the override and every INSTRUCTOR surface. 4b is every STUDENT surface and the CSV.

**Before anything else, state the filename and line count you read.**

## READ FIRST

**Read PROJECT_STATE.md, its "Phase 4 handoff" in particular.** Then read `OS_Resources/Relii/Cowork-Session-Log.md` under "PHASES 3, 4 AND 6 SCOPED" if you can reach it; if you cannot, this file carries every ruling you need.

**AUDIT THE CODE BEFORE YOU PLAN.** Line numbers were checked against `71ceeac`.

**STATE YOUR PLAN AND WAIT FOR APPROVAL.** This piece carries a migration and it writes grades.

## Why it matters

Phase 2c showed the AI's level can be wrong in ways worth auditing. **The override is the safety net, not a convenience.** Tom grades his first real batch days after students register the week of September 14, and **all of Phase 4 must be live before then.**

## The owner's rulings (September 10, 2026). Build to them; do not reopen them.

1. **THE INSTRUCTOR PICKS A LEVEL, NEVER A NUMBER.** Points are looked up from the rubric server-side, exactly as scoring does. There is no zero and no value off the ladder, and the 10 percent floor stays.
2. **THE AI'S ORIGINAL LEVEL IS KEPT, WHERE NO STUDENT CAN REACH IT.** Students can select every column of their own `sessions` row (the only sessions policy is a select on `auth.uid() = student_id`), so the AI original must NOT live on that row. It lives in a separate table that is written server-side and has **no policy that lets a student read it**. The instructor submission page shows it beside the chosen level ("AI: Proficient").
3. **AFTER REVIEW THE STUDENT SEES ONLY THE INSTRUCTOR'S LEVEL.** So the final level, its points and the total are written to `sessions.score` AND `sessions.score_total`. The dashboard reads the first and the student home reads the second, so both must agree.
4. **THE AI COMMENT STAYS, AND THE INSTRUCTOR MAY ADD AN OPTIONAL NOTE PER CRITERION.** The student sees that note in 4b, so it belongs on the score item. **Mark an item the instructor changed** (`ScoreItem.scored_by` is already typed `"ai"` in `lib/types.ts` line 40), so 4b can label the AI comment as the AI's.
5. **A REVIEW IS RE-EDITABLE, AND EVERY SAVE IS LOGGED.** A later save must never overwrite the recorded AI original.
6. **ALLOW RETAKE CLEARS THE REVIEW AND RETURNS THE PRACTICE TO THE POOL WITH ITS AI SCORE.** The retake branch (`app/api/instructor/submission/[id]/reset/route.ts` line 223) must restore the AI's levels, points and total from the stored original before the row goes back to the pool. The `submission_resets` snapshot (line 163) records the score that was in force at the moment of retake. The review log rows survive.
7. **PRACTICES ARE NEVER REVIEWED.** Only `kind = submission`.
8. **STATUS STRINGS:** instructor "To review" in amber (today's placeholder at `app/instructor/page.tsx` line 583), then **"Reviewed" in green** (`--color-content-success` exists).
9. **THE "AWAITING REVIEW" TILE BECOMES REAL**: scored submissions not yet reviewed. It is a placeholder today (line 324).
10. **THE DASHBOARD SHOWS THE CURRENT SCORE.** The Average score tile gains "N of M reviewed". **It stops rounding** (`Math.round` at line 314 breaks the half-point rule): an average displays to one decimal place, and no individual score is ever rounded.
11. **"MARK REVIEWED" WITH NO CHANGES MUST BE ONE ACTION.** Confirming the AI score as it stands is the common case for Tom.

## What the audit found, to verify rather than trust

- **"REVIEWED" CANNOT BE A NEW `sessions.status` VALUE.** The check constraint allows three values, 17 sites in 7 files key on `'scored'`, and Phase 3a's handoff item 3 says `isUnfinishedSession` stops being total if a status is added. **Use columns.** A reviewed submission is still finished work.
- **`findLevel` in `lib/scoring.ts` (line 217) is the one level lookup.** The override route must match an instructor's level exactly, and it must not grow a second lookup that can disagree with the first. **If you share code with the scorer, its behaviour must not change**: `scripts/check-scorer.mjs` must still pass all 22 checks.
- **`loadInstructorSubmission()` in `lib/instructor-submission.ts` is the guard** (role, working class, `kind = submission`). The override route goes through it or through the same checks, never around them.
- **A NEW TABLE HOLDING STUDENT GRADE DATA MUST JOIN GATE 4b's EXPORT-FIRST CASCADE.** `lib/class-export.ts` reads each class table into the snapshot, the fingerprint and the CSV sections, and `app/api/admin/class/[id]/delete/route.ts` line 64 carries `DELETE_ORDER`. **A table missing from the export makes the fingerprint blind to it. A class-scoped foreign key missing from the delete order makes the class delete fail halfway.** State in your plan whether review rows follow the two audit logs' precedent (a plain `class_id`, no foreign key, surviving a class delete) or are deleted with the class, and why. Either way they appear in the export.
- **ONE FOREIGN KEY PATH PER TABLE PAIR IS LOAD BEARING.** A second path between two tables the app embeds blanks a page with nothing in the logs. Check every embed that could see the new table.
- **Legacy scores exist.** 32 stored scores predate `level`, and some submissions' assignments carry no rubric. For those the editor does not render, and the route refuses with a legible message.
- **Supabase grants new public tables to `anon` and `authenticated` by default.** RLS must be enabled in the same migration that creates the table, and proven by behaviour, not by reading the catalogue.

## Not in scope (4b)

What the STUDENT sees: Pending Review, Reviewed, the labelled AI comment and the note on the results page and the student home. The per-submission CSV's new columns and its Status line. **Between 4a and 4b nobody reviews real data**, because a student would see a changed level under an unlabelled AI comment. Also out: the rest of Phase 3, the gradebook export (the tail), and any change to scoring or the ladder.

## Proof, run by you end to end

**Everything against relii.vercel.app, inside "B1: A demo class" only.** Measure B1's baseline first, including both audit tables (`assignment_deletes` is 1, not 0).

1. **A real submission to review.** A throwaway assignment with Tom's Discovery rubric, a voice practice through the fake-media rig (labels read first), submitted by the student.
2. **Override one criterion onto a half-point rung, with a note.** Show, from the database, the stored level, the points, `score.total` and `score_total` agreeing exactly, and the AI original sitting in the new table. Show the instructor page with "AI: <level>" beside the choice, the Status reading Reviewed in green, the tile count dropping, and "1 of 1 reviewed".
3. **Re-edit it back to the AI's level.** Two log rows now exist, and the recorded AI original is unchanged.
4. **Refusals as matched pairs, same body, seconds apart:** a level off that criterion's ladder (400) beside a valid one (200); the same request from your own other class B2 (404) beside B1 (200); the student's session POSTing to the route (refused) beside the instructor (200).
5. **The student cannot read the new table.** With the student's browser key, the student's own `sessions` row comes back while the new table returns nothing. That is a matched pair.
6. **Retake after review.** The practice is back in the pool carrying the AI's levels and total, the review is cleared, `submission_resets` shows the reviewed total as the prior score, and the log rows are still there.
7. **The export.** Ask the owner to run the B1 class export as super admin. Read the file, show the review rows in it, and show that saving a review changes the fingerprint. **Do not exercise the delete.**
8. **The average** rendering a half-point value with one decimal. **The legacy case**: no editor and a refused POST.
9. `scripts/check-scorer.mjs` at 22 passing, a clean `tsc`, and `npm run build` after deleting `.next`, with exit code and timestamp.

**Cleanup** follows 2b-1's order: the retake returns the submission to the pool, the student deletes their own practice, and then the assignment deletes with the plain confirm. **Never type DELETE.** Any new audit or review rows left in B1 are expected and permanent; record their ids.

## How testing runs: you run it

- **SQL through the Supabase MCP.** Migration, revert and tests are three files. The owner reads them, then approves one call for each. Paste output verbatim. **The migration is applied BEFORE the code is pushed.** One statement per `execute_sql` when the result matters. Never run a GRANT a Postgres error suggests. Never browse student-authored content through the MCP.
- **The click-through through the Playwright MCP**, headed, live site only. Voice via the rig recipe in the Phase 4 handoff item 6, system Chrome via `executablePath`.
- **Confirm the deploy by observing something only the new build can produce**, such as the "Reviewed" status or the "N of M reviewed" line. An etag change is not a build identity.
- **The owner keeps** the super admin export click and any judgment call. Announce every destructive click first. git commit and push stay behind their ask rules.

## Rules this project paid for

**A GREEN RESULT IS EVIDENCE ONLY WHEN YOU KNOW WHICH ARTIFACT PRODUCED IT. A REFUSAL BESIDE A MATCHING SUCCESS IS A MEASUREMENT. VERIFY AT THE LAYER THAT CONSUMES THE THING. AN UNMATCHED LEVEL REFUSES; nothing in a new path falls back to a rung.**

## Conventions

No em or en dashes outside chat. No discriminator, version field or shape probe on `rubrics.items`. Update PROJECT_STATE.md before the owner clears the session, and write the **Phase 4b handoff** while the reasons are in view, naming exactly what a student would see if 4b slipped.
