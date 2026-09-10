# Phase 3a: Two Recovery Fixes, and the Live Gate Lint Error

The first session after Phase 2. **Phase 2 is closed; do not reopen it.** The owner split Phase 3 on September 10, 2026: these two fixes go first because each one sits on a path a student or Tom can hit in week one, then Phase 4, then the rest of Phase 3.

**Before anything else, state the filename and line count you read.**

## READ FIRST

**Read PROJECT_STATE.md, Open Issues in particular**: "AN UNFINISHED SESSION IS INVISIBLE TO EVERYONE AND CANNOT BE DELETED" and "A GRADED PRACTICE WHOSE SCORING FAILED IS A REDIRECT LOOP". Those entries are the real brief.

**AUDIT THE CODE BEFORE YOU PLAN.** Every Phase 2 kickoff carried at least one assertion the code contradicted. Line numbers below were checked against `6b9f8af` and may have drifted.

**STATE YOUR PLAN AND WAIT FOR APPROVAL.** Fix 2 changes a destructive route.

## Scope

### Fix 1. A student whose scoring failed can recover, even after a reload

**The loop.** `app/student/session/[id]/page.tsx` line 43 sends any session that is not `in_progress` to its results. `app/student/session/[id]/results/page.tsx` lines 101 to 108 send a graded session that is not `scored` back. A graded practice sitting at `completed` with no score is exactly a scoring failure, so the two rules point at each other. **Phase 2c's refusal made this state more reachable.**

**The owner's ruling: a RETRY SCREEN.** The session page stops redirecting that one case and renders a screen saying scoring did not finish, with a button that tries again. No entry on the student home list.

What the audit found, to verify rather than trust:
- **The status check on line 43 runs BEFORE the assignment read on line 69**, so the page cannot know whether the case is graded at the moment it redirects. The check has to move below the rubric lookup.
- **`app/api/session/end/route.ts` line 75 refuses only `scored`**, so calling it again on a `completed` session already re-scores. The retry should reuse that route, not grow a second scoring path.
- A conversation-only `completed` session is FINISHED, not failed. It must still go to results. The rule keys on the assignment having a rubric, never on status alone (the results page comment explains why).
- Only `kind = practice` can reach this state: a submission is always converted from a `scored` practice (`app/api/practice/submit/route.ts` line 74). Confirm that, and do not route submissions through the new screen.

**Copy.** Propose the heading, body and button text in your plan. Plain, calm, and no instruction to contact the instructor unless a retry also fails.

### Fix 2. An assignment whose sessions are ALL unfinished deletes with the plain confirm

**The coupling.** A rubric can never be replaced on an existing assignment, so delete and recreate is the only repair for a wrong rubric. Today ANY session forces the typed DELETE (`app/api/instructor/assignment/[id]/delete/route.ts` line 189 branches on `linked.length === 0`), and an unfinished session is invisible to everyone and undeletable.

**The owner's ruling: the PLAIN DELETE PROCEEDS when every session on the assignment is unfinished.** Any finished work still demands the typed DELETE. No separate clear button.

**Define "unfinished" in one shared helper, used by the page, the button and the route, so the three cannot drift.** The audit's reading, to confirm against the data:
- `kind = practice` AND (`status = in_progress`, OR `status = completed` on an assignment WITH a rubric).
- **Every submission is finished work**, including an `in_progress` one, which is the Interrupted state with its own reset flow.
- **A `completed` practice on a conversation-only assignment is FINISHED work.**

Things that must stay true:
- **The route decides, server-side, from its own count.** `app/instructor/assignments/page.tsx` lines 149 to 160 and `components/delete-assignment-button.tsx` line 49 decide what to SHOW. If a session finishes between page load and click, the route must refuse with the existing 409 rather than delete.
- **A failed-scoring VOICE practice at `completed` HAS a recording.** The plain path must remove Storage objects exactly as the in-use path does, before the rows.
- **Write the `assignment_deletes` audit row whenever any session is removed**, including on the plain path. The audit row exists because student data was destroyed, not because a typed confirm was shown.
- `deleteRubricIfUnused()` still runs on every successful delete.

### Fix 3. The eslint error in `components/submission-live-gate.tsx`, line 46

`react-hooks/set-state-in-effect`. **The comment above it says the pattern is deliberate: decide once, so a Strict Mode re-run cannot flip a legitimate live attempt to locked.** Preserve that property. The safe shapes are a ref or a lazy initialiser; deleting the guard is not a fix. `lockOnReload` behaviour for voice must be unchanged. **Explain in the plan how you will prove it did not change**, because the live window is dormant under the current submission model and easy to reason about wrongly.

## Not in scope

Phase 4 (override, Reviewed, Pending Review, the tile, the CSV). The rest of Phase 3: the two renames, gatekeeper pairing, persona voice, enable or disable any scenario. The dashboard average's rounding, which Phase 4 owns. Tom's August 2 ruling that an abandoned practice stays invisible to the STUDENT stands; Fix 2 only lets the instructor's delete through.

## Proof

**Everything against relii.vercel.app, inside "B1: A demo class" only.** Measure B1's baseline first and return it there.

1. **Fix 1, executed, by you in the browser.** Produce a real scoring failure the way 2b-2 did: strip `levels` from one criterion of a throwaway uploaded rubric with one reversible update through the Supabase MCP. Then end a text practice as the student, RELOAD, and show the retry screen instead of ERR_TOO_MANY_REDIRECTS. Restore the rubric, press retry, and show the scored results. **Do not fake a session's status in the database.**
2. **Fix 1's neighbours still redirect correctly**: an `in_progress` session opens live, a `scored` one lands on results, and a conversation-only `completed` one lands on results.
3. **Fix 2 as a matched set, same instructor, minutes apart:** an assignment whose only sessions are unfinished deletes with the plain confirm, and an audit row is written. **At least one of those unfinished sessions must be a failed-scoring VOICE practice made with the fake-media rig**, so there is a real recording, and you list the bucket before and after to show the object is gone. A text practice has no recording and would pass the Storage leg vacuously. **The matching half:** an assignment carrying one finished practice still demands the typed DELETE. **Announce each destructive click before making it.**
4. **Fix 2's race:** a direct POST without `confirmInUse` against an assignment holding finished work returns 409 and deletes nothing.
5. **Fix 3:** a clean eslint on that file, plus your proof that decide-once holds.

Plus clean `tsc`, and `npm run build` after deleting `.next`, with the exit code and artifact timestamp shown.

**This session should need no schema migration.** Say up front what the verification artifact is instead. The two test updates in item 1 (strip, then restore) are expected, and they go through the MCP flow below. If you find you need a SCHEMA change, stop and say why before writing it.

## How testing runs: CC runs it, end to end

**THIS IS THE STANDING MODEL FROM PHASE 2, AND THE OWNER WANTS IT KEPT BECAUSE IT MADE TESTING FASTER, BETTER AND MORE THOROUGH.** You run the SQL and you run the click-through. The owner reads, approves and makes the calls that need a human.

- **SQL through the Supabase MCP.** Write each statement as a file in `supabase/`, state the revert, and then apply it with ONE `apply_migration` or `execute_sql` call, which the ask rule shows the owner for approval. Paste the output verbatim. **One statement per `execute_sql` call when the result matters.** Never run a GRANT a Postgres error suggests. Never browse sessions, transcripts or student-authored content through the MCP.
- **The click-through through the Playwright MCP**, headed, with its persistent profile, against relii.vercel.app only, never localhost. `instructor@test.com` owns B1 and `2studentb1@gmail.com` is a student in it; the owner supplies the passwords. Confirm a deploy with a real request, not elapsed time.
- **Voice and video through the fake-media rig**, exactly as recorded in PROJECT_STATE's Phase 2c handoff item 5: `--use-fake-device-for-media-stream` plus `--use-fake-ui-for-media-stream`, a `.wav` ending in several seconds of silence, driven from a standalone Playwright script so `.mcp.json` is not edited mid-session. **Read the track labels BEFORE the run** (`fake_device_0`, "Fake Default Audio Input"). A hardware name means stop.
- **What stays with the owner:** judgment calls that cannot be delegated, and anything the rig cannot produce. If the rig fails within a reasonable effort, stop and say so, and the owner does that step on his own camera.
- **The browser is not gated and the destructive controls are buttons.** Say so before operating any delete. git commit and push stay behind their ask rules.

## Rules this project paid for

**A GREEN RESULT IS EVIDENCE ONLY WHEN YOU KNOW WHICH ARTIFACT PRODUCED IT. A REFUSAL BESIDE A MATCHING SUCCESS IS A MEASUREMENT; A REFUSAL ALONE IS AN ASSERTION. WHEN TWO COMMENTS DISAGREE WITH THE CODE, THE CODE WINS**: the redirect loop survived because both files carried comments asserting it could not happen.

## Conventions

No em or en dashes outside chat (the clickthrough agreement is the approved exemption). **AN UNMATCHED LEVEL REFUSES TO SCORE; do not restore the bottom-rung fallback.** Update PROJECT_STATE.md before the owner clears the session, and write a Phase 4 handoff section while the reasons are in view.
