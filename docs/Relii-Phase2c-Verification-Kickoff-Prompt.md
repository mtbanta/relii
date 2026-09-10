# Phase 2c: Verification

The last of four sessions in Phase 2. **2a, 2b-1 and 2b-2 are done, pushed, and the app grades again.**

**This is a CERTIFICATION session, not a build.** Its ancestor is Gate 5, and the discipline is the same: measure, do not assert, and say precisely what a pass does and does not cover.

## READ FIRST

**Read PROJECT_STATE.md, and its "Phase 2c handoff" section in particular.** That handoff is the real brief; this file adds the run list and the stops.

**WRITE NO CODE UNLESS YOU FIND A DEFECT.** If you find one, stop and report it before fixing anything. A certification run that quietly repairs what it was measuring has certified nothing.

**STATE YOUR PLAN AND WAIT FOR APPROVAL.**

## The run

Everything against relii.vercel.app, inside **B1: A demo class** only. Measure B1's baseline first and return it there at the end. `instructor@test.com` and `2studentb1@gmail.com`; the owner supplies both passwords.

### 1. The seven-criterion rubric, which nothing has ever rendered

Upload the **Presentation** rubric, create an assignment, score a practice against it, and render the result. Every live check so far used Discovery's six criteria. **Nothing in the renderer counts criteria, which is a reason to expect it to work and not a reason to skip it.**

### 2. A half total, engineered rather than waited for

No live score has carried a half total, because an even number of half-valued rungs sums whole. **Engineer one:** pick or drive a run where an ODD number of criteria land on half-valued rungs, and show the total rendering with its decimal on the student page, in `score_total`, and in the CSV.

### 3. The CSV Level column in both states

The populated case, on a real download from a levels-scored submission. **And the empty case**, which is a legacy score whose assignment has no rubric: the Level column blank, the header block carrying the note that the rubric is no longer attached, and the item names showing as internal identifiers. Neither has been seen on a real download.

### 4. Determinism, deferred twice and now due

**The claim is a fixed seed (7) and zero temperature. The measurement is scoring one transcript twice and comparing the six or seven level NAMES**, not the points, because the points are derived from the names.

Drive it against the real scorer with the real API call, not a stub. Two runs on identical input.

**==> STATE THE LIMIT OF WHAT A PASS CERTIFIES, AND DO NOT OVERSELL IT. <==** A pass means deterministic **today, against the model currently behind that name**. OpenAI can change what a model name resolves to. **So Tom's fairness argument is "two students scored in the same week get the same treatment", not "forever".** If the two runs differ, that is a finding worth stopping the session for, not a footnote.

### 5. The two gate items that were waiting for a graded submission

**Gate 4b's export-content check:** export a class containing a SCORED submission and confirm the score, the transcript and any reset rows are in the CSV.

**==> HARD STOP. THAT EXPORT IS THE FIRST HALF OF THE CASCADE DELETE. GET THE FILE AND GO NO FURTHER. <==** Do not type a confirmation word, do not spend the token, do not proceed past the export step. Deleting B1 would destroy the demo class this project has used since August. Announce before you begin that flow and say out loud where you are stopping.

**Gate 5 item 12**, the leftover that could not run without a scored submission. Its expected answer is in `docs/Relii-Gate5-Results.md`.

### 6. Four screenshots for the owner

He is minimising his own click-through, so **you drive every screen and he looks at pictures.** Produce exactly four:

1. A student results page on the **Discovery** rubric.
2. A student results page on the **Presentation** rubric.
3. The instructor submission view of a scored submission.
4. A print preview of a results page, showing every section expanded.

**These are for a judgment he cannot delegate**, which is whether it reads well to a nineteen-year-old and whether Tom's rubric looks like Tom's rubric. Do not annotate them into an argument; show him the screens.

### 7. Cleanup, measured

Announce before each destructive step. Practices before assignments. Then re-measure B1 to its baseline and confirm no recording is orphaned in Storage.

## What a pass certifies, written before the run rather than after

Say it in the wrap-up, in this shape: what was measured, on what data, on which commit, and **what it does not cover.** Gate 5's record is the model. Three items in it were not run and each carried its reason, which is what made the rest believable.

## The fake-media rig

**The recipe is in the 2c handoff, item 5, and the flag name is the whole game.** `--use-fake-device-for-media-stream`, not `-for-media-capture`, which is silently ignored and returns the real camera. **Verify by reading the track labels before you rely on a run.** The audio file must end in several seconds of silence or the turn never ends. Drive it from a standalone script rather than editing `.mcp.json` mid-session.

## Auto-mode, and the stops

**AUTO-MODE IS ON. THESE ARE NOT SUSPENDED.**

- **Any SQL is a file, read by the owner, then applied as one approved call with the output pasted verbatim.** State the revert path first. **You should need very little SQL in this session; if you find yourself writing a lot, ask whether you are still certifying.**
- **One statement per `execute_sql` call when the result matters.**
- **Do not browse sessions, transcripts or student-authored content through the MCP.**
- **Never run a GRANT a Postgres error suggested.** Gate 2 revoked exactly the one the error hints at.
- **Operate no destructive control without saying so first, and never type a confirmation word to get past a guard.** That applies with particular force to the cascade-delete export in item 5.
- **git commit and push stay manual.**

## Three rules this project paid for

**A GREEN RESULT IS EVIDENCE ONLY WHEN YOU KNOW WHICH ARTIFACT PRODUCED IT.**

**A REFUSAL BESIDE A MATCHING SUCCESS IS A MEASUREMENT. A REFUSAL ALONE IS AN ASSERTION.**

**CHECK THE SYSTEM, NOT THE DOCUMENTATION ABOUT THE SYSTEM.** Twice in Phase 2 a kickoff assertion was contradicted by the code or the data, and both were caught by reading rather than trusting. Assume this file contains one too.

## Conventions

- No em dashes or en dashes in anything produced for use outside chat.
- Update PROJECT_STATE.md before the owner clears the session. **Phase 2 ends here, so write its closing record rather than a handoff to a fifth session.**
