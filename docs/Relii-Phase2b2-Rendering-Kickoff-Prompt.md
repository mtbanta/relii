# Phase 2b-2: Rendering, and the Switch On

The third of four sessions in Phase 2. **2a (intake) and 2b-1 (the scoring engine) are done and pushed.**

**==> THE APP CURRENTLY SCORES NOTHING. THIS SESSION IS WHAT ENDS THAT, AND IT IS THE MOST TIME-CRITICAL PIECE IN THE PROJECT. <==** 2b-1 detached every rubric on purpose, and nothing is graded until `RUBRIC_UPLOAD_ENABLED` is true. Tom's students register the week of September 14.

## READ FIRST

**Read PROJECT_STATE.md before anything else.** Its **"Phase 2b-2 handoff"** section was written at the end of 2b-1 while the reasons were in view, and its eight items are the real brief. This file adds scope and evidence, it does not replace it.

**AUDIT THE CODE BEFORE YOU PLAN.** Two of 2b-1's kickoff assertions were contradicted by the code and the database, and both were found before anything was built. Assume the same of this one.

**STATE YOUR PLAN AND WAIT FOR APPROVAL BEFORE YOU BUILD.**

## Scope

### 1. Turn the switch on, and finish the interaction behind it

`RUBRIC_UPLOAD_ENABLED` in `components/create-assignment-form.tsx` becomes `true`.

2a built the preview and confirm interaction behind that flag and 2a's copy is already in place. **Verify it end to end through the form as a human uses it, not through a crafted request.** The confirm screen shows **the rubric name and the criterion names**, owner's ruling, not the point grid. Changing the chosen file clears the preview and re-arms the confirm.

**The route re-parses the file server-side on create and stores what IT parsed.** Nothing the browser sends between the two calls is trusted. That is 2a's design; do not weaken it to save a round trip.

### 2. The rendering, which is the whole of this session's visible work

`components/rubric-score.tsx` groups by a `category` a criterion does not have and labels by a `label` it does not have, so today it falls back to criterion ids in one "Other" group. **There is a knowingly wrong cast in `app/student/session/[id]/results/page.tsx`, labelled in place by 2b-1, and it belongs to you.**

The owner's decisions, already made, so build to them rather than reopening them:

- **Each criterion is its own collapsible section**, with one row inside.
- **That row carries the criterion description, the level name, the points, and the comment.** The section header carries the criterion name and earned over possible.
- **The jump chips stay**, one per criterion.
- **Collapsed sections still print expanded.** That is a shipped feature and it was a named regression risk in PD-8d. Verify it, do not assume it.
- **Half points render to one decimal, not rounded.** A criterion reads `44 / 55` or `3.5 / 5`; a total reads `59.5 / 100`.

**`ScoreItem.level` is optional on the type on purpose** and 32 stored scores carry none. Those scores are all conversation-only now, so no rubric renders for them, but the component must not assume `level` is present.

### 3. Close the divergence 2b-1 created deliberately

`app/instructor/submission/[id]/page.tsx` and `lib/instructor-submission.ts` **still resolve the rubric through `scenarios.rubric_id`**. 2b-1 left them, so an instructor sees historical scores with labels while the student's own page hides them. **Resolve both through the assignment, the same as everything else.** After this, one rule governs everywhere: the rubric comes from the assignment or there is none.

### 4. The CSV gains a Level column

`app/api/instructor/submission/[id]/csv/route.ts` writes Item, Category, Points earned, Points max, Comment. **Add Level.** Owner's ruling, chosen over reusing the Category column, because a column headed Category holding "Proficient" is the quiet mislabel this project keeps getting bitten by. Decide what Category holds now that a criterion is its own category, and say what you chose.

### 5. The scoring-failure note

When scoring genuinely fails, the student sees: **"The AI scoring encountered a problem. Ask your instructor to provide a score or try again."**

**It appears on the CONVERSATION SCREEN at the moment scoring fails**, owner's ruling. The results page redirect is NOT in scope and does not change.

**Do not fold the refresh or closed-tab case into this.** A killed session never reaches scoring, and per Tom's August 2 ruling that behaviour ships as is. Two different failures wearing the same coat.

### 6. Two test files that expire the moment the field goes live

**`supabase/phase-2a-tests.sql` check 16** asserts every assignment's rubric matches its scenario's. True today at zero rows. **The first rubric Tom attaches makes a correct database report FAILED.** The replacement query is inside that file. Apply it in this session, not before.

**`supabase/phase-2b1-tests.sql` checks 10 and 11** carry the same warning about themselves. Read it and act on it.

## Not in scope

Phase 4: the instructor level override, the Reviewed status, the student Pending Review state, and making the "Awaiting review" tile real. Phase 3, including the "Active Assignments" and "Working in" renames. The Gate 4b export check and the Gate 5 leftover, which are 2c.

## Proof

**Everything runs against relii.vercel.app inside B1 only.** Measure B1's baseline first and return it there afterward.

1. **Upload the real Discovery rubric through the form**, as a human uses it, and create an assignment with it. The preview and confirm both exercised.
2. **A text practice as the student, scored, and the results page rendered.** Show me the page: criteria as sections, level names, points, comments, and the total. **Name a criterion that lands on a half point before the run rather than after.**
3. **Print.** Prove every section renders expanded regardless of screen state.
4. **The CSV**, with its Level column, for a real scored session.
5. **The instructor side.** This needs a SUBMITTED practice, which is voice and video with a real recording, which needs a camera. **This is the moment the Playwright fake-media setup earns its place**: `--use-fake-device-for-media-capture` and `--use-fake-ui-for-media-stream` through a Playwright MCP config. **Read the current documentation rather than assuming the schema, prove it with one run, and if it is not working within a reasonable effort, STOP AND SAY SO.** The owner will do that one submission on his own camera. Do not spend the session on browser plumbing.
6. **The scoring-failure note, executed rather than described.** The honest way in: create an assignment with a real uploaded rubric, then strip the `levels` from one criterion in that rubric row with one SQL update. The scorer refuses, and the student sees the note. Same class, valid foreign key, and reversible. **Do not fake a session's status in the database to manufacture the state.**
7. **A refused upload seen by a human.** Post one of your own broken fixtures through the form and show me the message Tom would read.

Plus a clean `tsc`, a full `npm run build` after deleting `.next`, and the two test files updated and re-run.

**This session may have no migration.** A piece with no migration is not a piece with no proof, and nobody produces that proof unless the brief asks for it. If you touch no schema, say up front what the verification artifact is instead.

## Testing environment and accounts

**LIVE URL, relii.vercel.app, NEVER localhost.** One Supabase project, no separate development database.

`instructor@test.com` owns **"B1: A demo class"**. `2studentb1@gmail.com` is a student in it. The owner supplies both passwords. **Create test data only inside B1 and delete nothing belonging to any other class.**

Playwright MCP is available, headed, with a persistent profile.

**CONFIRM THE DEPLOY WITH A REAL REQUEST, NOT ELAPSED TIME.** The proxy redirects unauthenticated API calls to /login and masks 404 from 401. 2b-1 settled it by watching the prerendered /login etag and age reset. Do the same.

## Auto-mode, and the stops that still hold

**AUTO-MODE IS ON. THESE ARE NOT SUSPENDED BY IT.**

**Any SQL is written as a file, read by the owner, and only then applied** through the Supabase MCP as one approved call, with the output pasted verbatim. State the revert path before you apply. **If anything fails partway, stop and report rather than writing a repair.**

**ONE STATEMENT PER `execute_sql` CALL WHEN THE RESULT MATTERS.** Two statements return only the second, which cost 2a a verification.

**Do not use the Supabase MCP to browse sessions, transcripts or student-authored content.**

**A TRAP.** When a student is refused `persona_system_prompt`, Postgres appends `GRANT SELECT ON public.scenarios TO authenticated`. **That is the exact whole-table grant Gate 2 revoked.** Never run a GRANT a Postgres error suggested.

**THE BROWSER IS NOT GATED AND THE DESTRUCTIVE CONTROLS ARE BUTTONS.** A typed-DELETE confirm is no defence against something that can type. **Operate no destructive control without saying so first.** Deleting what you created in B1 is expected; announce it.

**git commit and git push stay manual.**

## Three rules this project paid for

**A GREEN RESULT IS EVIDENCE ONLY WHEN YOU KNOW WHICH ARTIFACT PRODUCED IT.** Delete the build, check the exit code, print the emitted file's timestamp. All three.

**A FIXTURE DERIVED FROM THE SAMPLES CAN ONLY CONFIRM WHAT THE SAMPLES ALREADY SHOW.** 2a's row-scan bug survived eight fixtures because six came from a real file.

**A REFUSAL BESIDE A MATCHING SUCCESS IS A MEASUREMENT. A REFUSAL ALONE IS AN ASSERTION.**

## Conventions

- No em dashes or en dashes in anything produced for use outside chat. The one in `docs/Relii-clickthrough-agreement.md` is the approved legal-text exemption; see CLAUDE.md.
- **THERE IS NO DISCRIMINATOR, NO VERSION FIELD AND NO SHAPE PROBE ON `rubrics.items`, and 2b-1 settled that deliberately.** Do not reintroduce one to make a reader simpler.
- Update PROJECT_STATE.md before the owner clears the session, and write the 2c handoff while the reasons are in view.
