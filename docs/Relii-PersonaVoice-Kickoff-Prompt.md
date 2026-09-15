# Persona voice, chosen on the assignment

**One additive column, two voices, one form field in two places.** T1, formerly "Phase 3c: persona voice". It carries a migration, and that migration alters a database FUNCTION as well as a table, which is the part to read twice.

**Before anything else, state the filename and line count you read.**

## READ FIRST

- **`PROJECT_STATE.md`, Current Stage and Open Issues**, plus the **Phase 3c handoff**, which this supersedes in two places named below.
- **`lib/realtime.ts` in full.** 133 lines, and D3's comment block in it explains a trap you must not undo.
- **`supabase/pd-4-meeting-length.sql`.** The migration this one copies.
- **`supabase/phase-2a-rubric-intake.sql` and its revert.** The function you have to replace, and the statement that drops it by signature.

==> **THERE ARE UNPUSHED COMMITS WAITING FOR YOU, AND THEY ARE THIS FILE. YOU PUSH THEM.** This kickoff was written in a Cowork session that **cannot push**: github.com is not on that session's egress allowlist, so it commits and stops. **The owner does not push. You do, for every commit in this repo, including the ones you did not make.** Run `git log --oneline origin/main..main` before you start and name what you find. <==

==> **`OS_Resources` IS NOT VISIBLE TO YOU AND NEVER WILL BE.** It is the owner's alignment space with his other session. Nothing in this kickoff cites it, nothing you need lives there, and you should not request access. Every source named here is in the repo or in a git object. <==

**STATE YOUR PLAN AND WAIT FOR APPROVAL.**

---

## The scope changed from the roadmap, and here is the record of why

PROJECT_STATE's **Phase 3c handoff** and the roadmap's **T1** entry both describe a **voice picker per persona, stored on `public.scenarios`, controlled on the AI Persona Framework page**. **THE OWNER CHANGED THAT ON 2026-09-14. Both older descriptions are superseded.** Do not build what they describe, and do not read them as contradictions when you meet them.

**WHAT IT IS NOW:**

1. **TWO FIXED VOICES, NOT A PICKER.** `cedar`, which every persona speaks in today, and **`marin`**, chosen by the owner after listening to the options. No preview button, no sampling, no third option. This retires the cost hazard handoff item 7 raised: a picker invites sampling and every sample is a billable realtime session.
2. **THE VOICE LIVES ON THE ASSIGNMENT**, chosen when creating or editing one, beside the meeting length.

==> **WHY ASSIGNMENT AND NOT SCENARIO, WHICH IS THE ONE DECISION THIS PIECE RESTS ON.** One scenario can back many assignments: `assignments.scenario_id` is a plain foreign key with an index and no uniqueness (`supabase/stage-2-data-model.sql` lines 59 and 66). **If the control sat on the assignment form but wrote to `scenarios`, an instructor creating a second assignment on Alex and picking the other voice would silently change the voice of the first assignment too.** Storing the value where it is chosen is what makes that impossible. <==

**HANDOFF ITEM 3 IS NO LONGER THE GOVERNING ARGUMENT.** It argued the voice needed a column rather than a `generation_fields` key, because an imported persona carries null `generation_fields` and would silently fall back to the global constant. That was correct for a persona-level voice and is now moot: an assignment always exists and needs no fallback. **Do not store the voice in `generation_fields`** remains true and is now trivially true.

**HANDOFF ITEM 5 IS WRONG ABOUT THE ROUTE**, and the roadmap already corrected it. It names `app/api/voice/start/route.ts` as the place to read the voice. **`voice/start` mints nothing.** The mint happens in `app/api/voice/token/route.ts`.

---

## ==> THE PRE-FLIGHT THAT COMES BEFORE ANY OTHER WORK, AND D3 IS WHY <==

**DO NOT SHIP `marin` ON THE STRENGTH OF DOCUMENTATION. MEASURE IT FIRST.**

On 2026-09-14, D3 spent a session discovering that `gpt-4o-transcribe` returns **HTTP 400** on `languages`, the field every current OpenAI doc page describes, because the docs describe the CURRENT models and this app runs a legacy one. **`app/api/voice/token/route.ts` catches that throw and returns a 502**, so a student gets **no voice at all** rather than a degraded one. **A rejected voice string fails down exactly the same path.**

**THE PRE-FLIGHT, AND IT IS THE FIRST THING YOU DO.** Mint a client secret against the real API with `output: { voice: "marin" }` on the model `getRealtimeModel()` returns, using the harness shape you built for D3. Report the status and the response body.

- **ACCEPTED (200): proceed.** Record the response, and whether the accepted session echoes the voice back.
- **REJECTED: STOP AND REPORT. Do not substitute another voice and do not change the model.** Which voice ships is the owner's ruling, not yours. **A rejection here is a successful session that returns a decision**, exactly as D3's outcome B was.

**No migration, no form work and no string edit happens before that answer is in hand.**

---

## Where the change goes

==> **LINE NUMBERS WERE RE-VERIFIED ON 2026-09-15 AGAINST `4fb4103`, ALL 21 OF THEM, AND ALL WERE EXACT. ONE HAD ALREADY DRIFTED SINCE THE ROADMAP WAS WRITTEN, AND IT IS RECORDED AS A WARNING: the consumer in `lib/realtime.ts` was line 77 and is now LINE 104, pushed down by D3's own comment block. Re-verify before you edit, and report anything that moved.** <==

| File | Line | What |
| :-- | :-- | :-- |
| `lib/realtime.ts` | **18** | `export const REALTIME_VOICE = "cedar";` becomes the DEFAULT rather than the only value |
| `lib/realtime.ts` | **35** | `mintRealtimeClientSecret(instructions)` gains a voice parameter |
| `lib/realtime.ts` | **104** | `output: { voice: REALTIME_VOICE }` reads the passed voice, falling back to the constant |
| `app/api/voice/token/route.ts` | **75** | `select("persona_system_prompt, scenario_context")`, the existing read |
| `app/api/voice/token/route.ts` | **89** | the only caller of the mint |

==> **THE VOICE IS ON THE ASSIGNMENT, SO `voice/token` MUST REACH THE ASSIGNMENT.** Its select at line 75 is on `scenarios`, keyed by `session.scenario_id`. The session row also carries `assignment_id`, so the voice is one more read or one join away. **DECIDE WHICH AND SAY SO IN YOUR PLAN.**

**AND A SESSION CAN HAVE NO ASSIGNMENT AT ALL.** PROJECT_STATE's Open Issues records **25 pre-Stage-7 sessions with a null `assignment_id`**, and the standing rule in three files is that a session with no assignment is conversation-only. **Those must fall back to `cedar` and must not fail.** That is check 4. <==

### The write paths, and there are THREE rather than one

==> **THIS IS THE PART THE ROADMAP DID NOT ACCOUNT FOR.** An assignment is written in three places and **every one of them needs the new column**, or a voice chosen on one path is silently dropped on another. <==

1. **`app/api/instructor/assignment/create/route.ts` line 261**, the plain insert, used when NO rubric is attached.
2. **The same route, line 230**, the RPC `create_assignment_with_rubric`, used when a rubric IS attached. PostgREST cannot wrap two writes in a transaction, so the rubric path goes through a database function that writes both rows or neither.
3. **`components/edit-assignment-form.tsx` line 174**, which updates `assignments` **directly from the browser through the Supabase client**, not through any API route.

The form field itself follows `duration_minutes` exactly: `components/create-assignment-form.tsx` line 100 (state), line 210 (`body.append`), line 319 (the input), and `components/edit-assignment-form.tsx` lines 42 to 44 (type), 91 to 94 (state), line 174 (the update). The create route reads it from the form at line 133.

==> **THE FUNCTION SIGNATURE IS A TRAP, AND IT IS WHY THIS PIECE HAS ADVISOR ON.** `create_assignment_with_rubric` is created at `supabase/phase-2a-rubric-intake.sql` **line 209** with twelve named parameters, and `supabase/phase-2a-rubric-intake-revert.sql` **line 36** drops it by full signature. **ADDING A THIRTEENTH PARAMETER WITH `create or replace` DOES NOT REPLACE IT.** Postgres overloads on signature, so the twelve-parameter function survives alongside the new one and PostgREST may resolve to either. **The migration must DROP the old signature explicitly and recreate, and it must re-apply the `revoke` and `grant execute` statements at lines 261, 266 and 271, which are also keyed by signature.** <==

**ONE THING TO MEASURE RATHER THAN ASSUME, because the edit form writes from the browser under RLS:** whether `public.assignments` carries column-level grants the way `public.scenarios` does after Gate 2. **If it does, the new column needs an explicit grant or the edit form fails on save with a permission error.** If the update policy is row-level only, a new column is writable automatically. **Measure it. Do not assume either answer**, and note that Gate 2's own warning block says the Postgres hint on such an error is the one thing never to follow.

---

## The approved strings

**Owner-approved 2026-09-14. Apply verbatim. Three strings, all on surfaces this piece otherwise does not touch.**

### 1. `app/instructor/scaffold/compare/[groupId]/page.tsx` line 267

**The sentence is false and has been since Phase 2b-1.** Grading reads `assignments.rubric_id`, not `scenarios.rubric_id` (`app/api/practice/submit/route.ts` line 119), and **the code already knows it**: the comment at `app/api/instructor/scaffold/generate/route.ts` line 229 says the old claim "IS NOW WRONG". **The comment was corrected and the on-screen string was not**, which is how a corrected comment and an uncorrected string drift apart.

TODAY: `{persona_name} is switched ON. Saved as {title}, and now available in the create-assignment list as a conversation-only case (it is never scored).`

BECOMES: `{persona_name} is switched ON. Saved as {title}, and now available in the create-assignment list. Attach a rubric when you create the assignment and it will be graded; leave the rubric off and the practice is conversation only.`

### 2. The same file, line 320

TODAY: `Both are saved and turned OFF. Neither can be assigned to a student or started by one, and neither is scored (these are conversation-only cases with no rubric).`

BECOMES: `Both are saved and turned OFF. Neither can be assigned to a student or started by one. Whether a case is graded is decided by the rubric on the assignment, not here.`

### 3. `components/chosen-persona-entry.tsx` line 43

TODAY: `{chainRoleLabel(...)}, generated {formatInstant(...)}`

BECOMES: `{chainRoleLabel(...)}, added {formatInstant(...)}`

**A copied persona was not generated, and the date printed is the date of the COPY.** Tom's Alex currently reads "generated Sep 11, 2026" for a persona hand-written in June 2026. "Added" is honest for a row that may have been generated, imported or hand-written.

==> **WHAT BOTH REWRITES ARE DOING, SO THE REASONING SURVIVES: the old copy asserted a property of the PERSONA. The true fact is a property of the ASSIGNMENT.** Moving it is what makes the sentence correct and what stops it going stale again. <==

**NOT IN SCOPE, NAMED SO NOBODY TIDIES IT:** `chainRoleLabel(null)` renders "Not recorded", so Tom's Alex will read "Not recorded, added Sep 11, 2026". Blunt but accurate. **Leave it.**

---

## The migration

**One file, `supabase/t1-persona-voice.sql`, written first and read by the owner before any MCP call**, with its own revert.

- `alter table public.assignments add column if not exists voice text;` **Null means `cedar`**, the same way a null `duration_minutes` means thirty minutes (`supabase/pd-4-meeting-length.sql` line 47).
- **A named check constraint restricting it to the two voices**, in the re-runnable `do $$ ... end $$` shape `pd-4-meeting-length.sql` uses for `assignments_duration_minutes_range`. Two values today; **the constraint is what makes a third a deliberate decision rather than a typo.**
- **Drop and recreate `create_assignment_with_rubric` by FULL SIGNATURE**, re-applying its revoke and grant statements. See the trap above.
- **A revert** that drops the column and restores the twelve-parameter function.

**No data is written to any existing row.** Every existing assignment keeps `voice` null and therefore keeps `cedar`.

---

## The proof

**EVERYTHING IN B1. NOTHING IN TOM'S CLASS**, read or write. The standing guard is in force with no exception.

==> **A VOICE CHANGE CANNOT BE PROVED BY READING THE SCREEN, AND THE FAKE-MEDIA RIG CANNOT HEAR.** Every other proof in this project ends in text a script can compare. This one ends in audio, so the discriminating check is a request body rather than a recording. <==

| # | Check | Why it discriminates |
| :-- | :-- | :-- |
| 1 | **THE PRE-FLIGHT.** `marin` is accepted by the live API on this model | **Gates everything else.** A rejection ends the session |
| 2 | **Two B1 assignments set to two different voices, and the request body sent to the client-secrets endpoint carries the right voice for each**, measured server-side | **CERTIFIES THE SESSION.** The only check that proves the value travels from the form to the API |
| 3 | An assignment with `voice` null still mints with `cedar` | The default holds, and every existing assignment is unaffected |
| 4 | A session with a null `assignment_id` still mints, falling back to `cedar` | 25 such rows exist; they must not fail |
| 5 | The voice survives a round trip through the EDIT form | Write path 3, the browser-side one no API route covers |
| 6 | The voice survives creation WITH a rubric attached | Write path 2, the RPC, and the proof the signature change landed rather than overloaded |
| 7 | All three strings read correctly on screen | The copy fixes |
| 8 | The build gate, then the five check scripts with counts read from the runs | Standing practice |

**CHECK 2 IS THE ONE THAT DECIDES WHETHER THIS SHIPS.**

**Two saved audio samples, one per voice, for the owner to label by ear, are a separate manual step and are NOT a check. No preview button.**

---

## Scope fence

- **No voice picker and no third voice.** Two values, `cedar` and `marin`.
- **No preview button.**
- **The voice does not go on `public.scenarios`** and does not go in `generation_fields`.
- **No control on the AI Persona Framework page.** The only changes there are the two strings above.
- **Nothing in Tom's class**, read or write.
- **No change to `turn_detection` or to D3's `language: "en"`** in `lib/realtime.ts`. D3's comment explains why the plural must not be restored; leave both alone.
- **No rapport or persona text changes.** D2 shipped those on 2026-09-14.
- **No transcription work.**

## The build gate, and the order everything runs in

**1. THE PRE-FLIGHT**, above. Nothing else starts until it answers.

**2. THE MIGRATION FILE, written and read by the owner** before any MCP call. Then applied, with the function signature verified from `information_schema` or `pg_proc` **after** the replacement, so an overload would be visible rather than assumed away.

**3. THE BUILD GATE, BEFORE ANY COMMIT.** `rm -rf .next`, then `tsc`, `eslint`, `npm run build`. **Report each exit code and the timestamp.** All three exit 0 or stop and say what failed. **The five check scripts read SOURCE, not a build, so all five can pass green over code that does not compile.**

**4. THE FIVE CHECK SCRIPTS**, counts read from the runs, before the commit so a red script never reaches main.

**5. COMMIT AND PUSH.** The push carries the Cowork session's kickoff commit too; `git log --oneline origin/main..main` must read empty afterwards. Clear any lock files and prove the tree is clean.

**6. CONFIRM THE DEPLOY BY A REAL REQUEST, NOT BY ELAPSED TIME.** Etag change and `age` reset to 0 on a prerendered page.

**7. ONLY THEN, CHECKS 2 TO 7 AGAINST THE LIVE SITE**, in B1.

**8. IF ANYTHING NEEDS FIXING**, fix it, re-run the build gate, re-confirm the deploy, then re-run the affected checks. A check that passed against a build you have since replaced is not evidence.

## How testing runs

SQL through the Supabase MCP, every statement in a file the owner has read. The click-through through Playwright MCP in B1 only. **Verify git state with read-only commands only** (`git --no-optional-locks status`, `git log`, `git rev-parse`); a plain `git status` leaves a lock file that blocks the next commit. **Every git write in this repo has been leaving `.git/HEAD.lock`, `.git/objects/maintenance.lock` and `tmp_obj_*` behind.** Check after your last git command and remove any you find.

## Conventions, and what PROJECT_STATE must carry when you finish

No em dashes and no en dashes outside chat. Record each owner ruling when it is given.

**PROJECT_STATE must carry, at the end:**

- **the pre-flight result verbatim**, including the response body;
- **the eight checks with their OBSERVED values**, not a claim that each passed;
- **the two voices proved to travel end to end**, with the request bodies quoted;
- **all three write paths exercised**, named individually;
- **the function signature before and after**, read from the database rather than from the file;
- **the answer to the column-grant question**, whichever way it came out;
- **the five script counts, read from their runs**;
- **that the scope changed from the Phase 3c handoff and the roadmap, and why**, so neither reads as a contradiction later;
- **confirmation that `origin/main` equals `main`**, with the kickoff commit pushed rather than left behind.
