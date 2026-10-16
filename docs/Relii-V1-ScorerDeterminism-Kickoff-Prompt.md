# V1. Does the scorer give the same grade twice

**THIS IS A MEASUREMENT, NOT A FIX.** One new script, one PROJECT_STATE entry, **no change to any shipped file**. 1 to 2 hours. No migration. No database writes.

==> **THE SESSION ENDS AT THE REPORT.** If the runs disagree, you say how much and you stop. Any fix is scoped afterwards against the table at the bottom of this file. **Do not change `lib/scoring.ts`, the scoring prompt, or anything else that ships, whatever the numbers say.** <==

**Why now.** Tom is grading his role plays this week. The scorer's claim is that temperature 0 and a fixed seed give the same grade for the same transcript. **Nothing has ever measured that.** Phase 2b-1 deferred it to "2b-2 or 2c" and neither did it.

**And there is already evidence the claim does not fully hold.** `lib/scoring.ts` records it in the comment above `formatLevels`: in Phase 2c, the same transcript scored **200/200 and 20/200 on consecutive calls with the same seed and the same backend fingerprint**. That cause was a prompt ambiguity and it was fixed. **So the question is how often the grade moves and by how much, not whether it can.**

**Before anything else, state the filename and line count you read.**

---

## READ FIRST

- **`PROJECT_STATE.md`, Current Stage and Open Issues**, and **its opening rule**: it is an accreting historical record, not a current-state database, and it is **cited by its text, never by line number**. A number in it is true as of its own date. Measure the present value.
- **`lib/scoring.ts` in full.** The refusal rule and the `formatLevels` comment are the heart of this piece.
- **`scripts/check-scorer.mjs` in full.** It is the harness pattern you are cloning.
- **`app/api/session/end/route.ts`**, the scoring block, for how production assembles the inputs.
- **`lib/openai.ts`.** 

==> **THERE IS AN UNPUSHED COMMIT WAITING FOR YOU AND IT IS THIS FILE. YOU PUSH IT.** This kickoff was written in a Cowork session that **cannot push**: github.com is not on that session's egress allowlist, so it commits and stops. **The owner does not push. You do, for every commit in this repo, including the ones you did not make.** Run `git log --oneline origin/main..main` before you start and name what you find. <==

==> **`OS_Resources` IS NOT VISIBLE TO YOU AND NEVER WILL BE.** Nothing here cites it. Do not request access. <==

**STATE YOUR PLAN AND WAIT FOR APPROVAL.**

---

## 1. WHAT THE CODE SAYS, VERIFIED

**Everything below was checked read-only against `34cd075` on 2026-10-16. Cited by text, not by line number. Verify it again yourself before you rely on it.**

| Thing | Where | What |
| :-- | :-- | :-- |
| The scorer | `lib/scoring.ts` | `scoreTranscriptAgainstRubric(transcript, criteria, maxTotal, personaName)`. One call through `chatComplete` with `temperature: 0`, `seed: SCORING_SEED`, and a JSON response format. `const SCORING_SEED = 7` |
| The refusal | `lib/scoring.ts` | It **throws** when a level is unmatched or a criterion is missing. **That is the Phase 2c rule and it must not be weakened** |
| The model | `lib/openai.ts` | `getModel()` returns `process.env.OPENAI_MODEL?.trim() \|\| "gpt-4o"` |
| The fingerprint | `lib/openai.ts` | `chatComplete` returns only the message text. **`system_fingerprint` appears nowhere in `lib/`**, so the script must capture it itself |
| The inputs | `app/api/session/end/route.ts` | transcript from `sessions.transcript`; `items` and `max_total` from `rubrics` via `assignments.rubric_id`; `personaName` from `scenarios.persona_name`, defaulted to `"the customer"` |
| The coercion | `app/api/session/end/route.ts` | `max_total` is passed as `Number(rubric.max_total)`. **A Postgres numeric can arrive as a string and the scorer refuses it.** The script does the same |

### The harness pattern you are cloning

`scripts/check-scorer.mjs` makes a scratch directory, copies `types.ts`, `scoring.ts` and `rubric-xlsx.ts` into it with `@/lib/` rewritten to `./`, **writes a stub `lib/openai.ts`**, symlinks `node_modules`, compiles with a standalone `tsc`, and runs the result on node.

**V1 uses the same pattern with the real `lib/openai.ts` copied in instead of the stub.**

==> **TWO THINGS THAT WILL SAVE YOU TIME, BOTH VERIFIED.** <==

- **`lib/scoring.ts` already imports `from "./openai"`, relative, not `@/lib/`.** The alias rewrite is a no-op for that import, so dropping the real file into the scratch `lib/` just works. Do not build machinery for it.
- **`chatComplete` calls bare global `fetch` and then `res.json()`.** A response body can only be read once, so a `globalThis.fetch` wrapper that reads the body will break the caller. **Use `res.clone()` in the wrapper**, or read the text and hand back a reconstructed `Response`. Say in the record which you did.

### Three corrections to the change brief, found while writing this

1. ==> **THE PHASE 2c PROMPT FIX IS `3a3ce30`, NOT `6b9f8af`.** The brief names `6b9f8af` ("Correct two certificate items upward"), which touched **only `PROJECT_STATE.md`**. The commit that changed `lib/scoring.ts` on 2026-09-10 is **`3a3ce30`, "Stop handing a top grade the bottom rung, and refuse instead of guessing"**. Use `3a3ce30` when you note that a stored score may predate the fix. <==
2. ==> **DO NOT READ A FINGERPRINT CHANGE AS "A DIFFERENT BACKEND".** The brief says the fingerprint tells you whether two runs hit the same backend. **This project has already measured otherwise.** PROJECT_STATE records that in Phase 2c the `system_fingerprint` tracked the **prompt** rather than the clock: `fp_ffd8308b42` and `fp_27008f43d1` were **served concurrently** for the old and new prompts. V1 sends an identical prompt on every run, so a change across runs is more meaningful here than it was there, **but report the values and say what changed. Do not infer a cause from them.** <==
3. **Vercel's environment variables are under Settings, then Environments, then Production.** There is no "Environment Variables" item in the Project Settings sidebar. This matters only for the owner's half of the gate, and it is here so you describe it correctly when you ask.

---

## 2. THE GATE, BEFORE THE FIRST SCORING CALL

==> **REPORT THE `OPENAI_MODEL` VALUE FROM `.env.local` AND STOP. NO RUN STARTS UNTIL THE OWNER CONFIRMS IT MATCHES PRODUCTION.** <== 

The owner checks Vercel at **Settings, then Environments, then Production**. The Vercel command-line tool is denied in this repo by `.claude/settings.json` and **that deny stands**, so you cannot read production yourself.

**A different model would measure the wrong scorer**, and the whole session would be worthless without anyone noticing.

**Report the value and the fallback together**: what `.env.local` sets, and that `getModel()` falls back to `gpt-4o` if it is unset or blank.

---

## 3. WHICH DATA, AND WHICH DATA NEVER

**Only classes owned by `instructor@test.com`.** Pick **one scored Discovery submission (6 criteria)** and **one scored Presentation submission (7 criteria)**. **Report both ids, their class names and the class owner's email before the first run.**

==> **NEVER TOM'S CLASS** (Sales 300 Fall 2026, owner `tbbanta@ksu.edu`). **NEVER ASHLEY WARD'S ICSC CLASS. NEVER ANY REAL STUDENT'S TRANSCRIPT.** This holds for the script, for the Supabase MCP, and for anything you read to choose the two submissions. <==

**If no scored seven-criterion Presentation submission exists in a test class, STOP AND ASK.** Do not create one with a live practice without the owner's go-ahead.

### How the script gets its rows, decided here

**The script reads them itself from Supabase, using `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`, with SELECTs only.** It takes the two submission ids as **command-line arguments**, so the ids live in the record and the script stays re-runnable.

**The reason this beats exporting rows to a local fixture file:** a fixture holds a full transcript on disk as an untracked file that somebody forgets. **This repo has already paid for that once**, with passwords left in `.playwright-mcp` snapshots for three weeks. No fixture file, nothing to forget.

==> **BUILD THE CLASS GUARD INTO THE SCRIPT, NOT INTO YOUR INTENTIONS.** Before it scores anything, the script resolves each submission's class and its owner's email, and **exits non-zero if the owner is not `instructor@test.com`**. Print the owner it found either way. A guard in prose is not a guard. <==

---

## 4. WHAT THE SESSION BUILDS

`scripts/check-scorer-determinism.mjs`. It does not exist yet.

1. Reads the two submissions' transcripts, rubric `items`, `max_total` and persona names, **read-only**, with the class guard above.
2. Calls `scoreTranscriptAgainstRubric` **five times per transcript, one call at a time**, never in parallel.
3. Records for every run: **the level name for each criterion, the points for each criterion, the total, the `system_fingerprint`, and whether the run threw.**
4. Prints a per-criterion agreement table and the total's range, per transcript.

==> **A THROWN REFUSAL IS A RESULT, NOT A CRASH.** Catch it, record the error text, count it, and carry on to the next run. A session that dies on run 3 of 5 has measured nothing. <==

==> **NO RUN MAY WRITE ANYWHERE.** No update to `sessions`, no score saved, no reset row, no new row of any kind. The service-role key bypasses Row Level Security completely, so **the only thing standing between this script and the database is the script.** <==

**Cost is ten calls at the configured model, which is cents.** State it in the record. You do not need to ask before spending it.

---

## 5. WHAT THE REPORT MUST CONTAIN

- **Per transcript: one row per criterion, one column per run, holding the level name**, plus whether all five runs agree.
- **Per transcript: the total from every run, and the range from lowest to highest.**
- **The stored score on that submission, for reference only.** It may predate the Phase 2c prompt fix (**`3a3ce30`**, 2026-09-10), so a difference from it is **not a finding by itself**.
- **The `system_fingerprint` of every run, and whether it changed**, reported as values without a causal claim.
- **How many runs refused to score, and the error each one gave.**
- **Which row of the table in section 8 the result lands in. You say which row. You do not act on it.**
- **The `OPENAI_MODEL` the runs actually used**, repeated here so the record is self-contained.

---

## 6. SCOPE FENCE

- **No change to any shipped file.** Not `lib/scoring.ts`, not `lib/openai.ts`, not the scoring prompt, not the refusal rule.
- **No fix this session**, whatever the numbers say.
- **No database write of any kind.**
- **Nothing in Tom's class or Ashley Ward's ICSC class**, by any route.
- **No new live practice** to manufacture a Presentation submission without the owner's go-ahead.
- **No Supabase plan or compute change. No Vercel plan upgrade. No region or domain change.**
- **Do not turn `RELII_SERVER_TIMING` back on.** It reports slowness and this piece measures agreement.
- **Do not weaken any Row Level Security policy or class-scoping guard.**

---

## 7. ORDER OF OPERATIONS

1. **Read the files named under READ FIRST.** State the filename and line count for each.
2. **Re-verify section 1 against the working tree.** Say what, if anything, has drifted.
3. **State your plan and wait for approval.**
4. **Choose the two submissions.** Report both ids, class names and owner email.
5. **THE GATE. Report `OPENAI_MODEL` and stop.** No scoring call before the owner confirms.
6. **Write the script**, including the class guard, and dry-run everything up to the first API call.
7. **Run it. Ten calls, one at a time.**
8. **Report, in full, per section 5. Then stop.**
9. **Commit the script and the PROJECT_STATE entry, then push.** **You may commit and push without asking (owner ruling).** Pushing a change under `scripts/` redeploys the site with **no change to what it serves**; that is expected and is not a finding.
10. **Prove the tree afterwards:** clean, `git log --oneline origin/main..main` empty, no lock files.

**No owner click-through is needed, because nothing user-facing changes.**

### Standing checks

`tsc`, `eslint` and `npm run build` exit 0. **Run the five check scripts and report the counts you read.** The last observed values were **54 / 10 / 53 / 23 / 45**. ==> **Those are a cross-check, not the truth. This project has already been burned by three documents quoting a count at each other instead of counting it. Read the number off the run.** <==

---

## 8. WHAT THE RESULT MEANS, FOR THE TRACKER CHAT AFTERWARDS AND NOT FOR THIS SESSION

| What V1 finds | Recommended response | Effort, a guess |
| :-- | :-- | :-- |
| Identical every time, or an occasional one-rung difference | Record it; Tom's level override already covers it | None |
| A criterion regularly moves one rung | Tighten that criterion's wording in the scoring prompt | 1 to 3 hours |
| Criteria move two or more rungs, or totals swing widely | Score three times and keep the most common level per criterion | 3 to 6 hours, plus the owner's call and probably Tom's, because it triples the cost per submission and slows results |

**Context that keeps this in proportion:** every submission is scored once and the score is stored, so **no number changes in front of Tom or a student**. Tom reviews every submission and can override any level. **Variation is a fairness question, not a display bug.**

---

## How testing runs

SQL is **read-only through the Supabase MCP**, and the script's own reads are read-only through the service-role key. **You run everything yourself.** No Playwright and no click-through: nothing user-facing changes.

**Verify git state with read-only commands only** (`git --no-optional-locks status`, `git log`, `git rev-parse`); a plain `git status` leaves a lock file that blocks the next commit. **Every git write in this repo has been leaving `.git/HEAD.lock`, `.git/objects/maintenance.lock` and `tmp_obj_*` behind.** Check after your last git command and remove any you find.

---

## Conventions, and what PROJECT_STATE must carry when you finish

No em dashes and no en dashes outside chat. Record each owner ruling when it is given. **Cite PROJECT_STATE by its text, never by line number.**

**PROJECT_STATE must carry, at the end:**

- **the `OPENAI_MODEL` the runs used**, and that the owner confirmed it against production before any call;
- **the two submission ids, their class names and the class owner**, so the measurement can be repeated on the same inputs;
- **the per-criterion table and the total range for both transcripts**, as read off the runs;
- **every `system_fingerprint`**, with the note that this project has measured the fingerprint tracking the prompt rather than the backend, so a change is reported and not explained;
- **the refusal count and the error text of each**, or that there were none;
- **which row of the section 8 table the result lands in**, as a statement and not as an action;
- **that no shipped file changed and no row was written**;
- **the five check script counts as read**, not as quoted;
- **confirmation that `origin/main` equals `main`**, with this kickoff's commit pushed rather than left behind.
