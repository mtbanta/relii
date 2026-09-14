# The display-fix bundle: submit wording, score decimals, transcript timestamps

Three changes, one session, **all of them render-layer**. **No migration, no schema change, no new dependency, and no change to any stored value.** If you find that code outside the render layer must change for any of this to work, stop and say why.

**THE OWNER'S PRIORITY ORDER, September 13, 2026:** the submit button label and the decimal fix first, then the timestamps.

**Before anything else, state the filename and line count you read.**

## READ FIRST

- **`PROJECT_STATE.md`, Current Stage and Open Issues.** In particular the Phase 4a note that removed a `Math.round()` from the average tile, and the `lib/app-time.ts` timezone work of September 11.
- **`OS_Resources/Relii/Relii-Roadmap-and-Estimates.md`**, for where this sits against the rest of the work.

**LINE NUMBERS IN THIS FILE WERE RE-VERIFIED AGAINST `9532bda` ON 2026-09-14, EVERY ONE OF THEM, AND ALL WERE EXACT.** They still drift with every commit. **Re-verify before you edit, and report any that moved.**

**STATE YOUR PLAN AND WAIT FOR APPROVAL.**

---

## Change one: the student submit control reads "Submit for review"

**The reason the wording works:** Phase 4b already shows the student "Pending Review" and "Reviewed" after they submit. "Submit for review" agrees with what they see next; "Submit as graded assignment" does not.

**Owner ruling: change the disabled live-submission flow's strings in the same pass**, even though that path is switched off today, so the labels already agree if Start assignment is ever re-enabled.

### The live control, `components/submit-practice-button.tsx` (99 lines)

| Line | Today | Becomes |
| :-- | :-- | :-- |
| 3 | `// The "Submit as graded assignment" control on an eligible saved practice` | update to match the new string |
| 61 | `Submit as graded assignment` | **`Submit for review`** |
| 69 | `Submit this practice as your graded assignment? It becomes your official submission` | **`Submit this practice for review? It becomes your official submission`** |
| 92 | `{loading ? "Submitting..." : "Submit for a grade"}` | **`Submit for review`** |

**Line 92's loading state (`Submitting...`) is unchanged.**

### The disabled live-submission flow, same pass

| File | Lines | What they read today |
| :-- | :-- | :-- |
| `components/voice-conversation.tsx` | **826**, **836**, **851**, **892** | "Submit assignment", "Submit this graded assignment for scoring? This ends the call and is...", "Submit and score", "Submit assignment" |
| `components/conversation.tsx` | **226**, **274**, **291** | "Submit assignment", "Submit this graded assignment for scoring? This is your one official...", "Submit and score" |

**Bring all seven onto "review" wording consistent with the live control above.**

**DO NOT CHANGE ANY ROUTE, ANY STATUS VALUE, OR `required_mode`. THIS IS COPY ONLY.**

---

## Change two: scores show at most one decimal place

**OBSERVED:** Tom's September 11 practice renders Discovery as **49.50000000000001 / 55.00000000000001** while every other criterion on the same page prints clean.

### The single point of change, `lib/types.ts` lines 273 to 276

```
export function formatPoints(value: number): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}
```

`String(n)` prints whatever float it is handed. **Round to one decimal and drop a trailing `.0`.** The required behaviour:

| Input | Output |
| :-- | :-- |
| `12` | `12` |
| `4.5` | `4.5` |
| `49.50000000000001` | `49.5` |
| `55.00000000000001` | `55` |
| `0` | `0` |

**Half points are legitimate throughout this rubric, so one decimal is the floor, not a preference.** The non-finite fallback at line 275 stays.

### Every score surface already routes through `formatPoints`

`app/student/page.tsx` (538, 630), `app/student/session/[id]/results/page.tsx` (228, 231, 246), `app/instructor/page.tsx` (420, 607), `app/instructor/submission/[id]/page.tsx` (318, 321), `components/rubric-score.tsx` (214, 215, 257, 258, 304, 305), `components/submission-review-form.tsx` (221, 223, 289, 291), and the CSV at `app/api/instructor/submission/[id]/csv/route.ts` (136, 249, 250).

**Two other lines in `app/instructor/page.tsx` mention `formatPoints` and are COMMENTS, not call sites: 330 and 597.** Do not count them, and do not edit 597.

### ==> THERE ARE TWO RAW-SCORE LEAKS, NOT ONE <==

Both bypass the helper and both must be routed through it.

| # | File | Line | Renders |
| :-- | :-- | :-- | :-- |
| 1 | `components/submit-practice-button.tsx` | **71** | `` {hasScore ? ` and keeps its score (${scoreTotal} / ${scoreMax})` : ""}. `` |
| 2 | `components/reset-history.tsx` | **96** | `` {isRetake && hadScore ? ` (${r.prior_score_total} / ${r.prior_score_max})` : ""} `` |

**Leak 1 is the same file as change one.** **Leak 2 was found on 2026-09-14 and is not in the change brief**: it is live, rendered on the instructor dashboard from `app/instructor/page.tsx` line 754, and a prior score carries dust exactly the way a current one does. `prior_score_total` and `prior_score_max` are `number | null` (`components/reset-history.tsx` lines 33 and 34) and the null case is already guarded at line 83, so this is a one-line change inside an existing branch.

### ==> ONE COMMENT BECOMES FALSE THE MOMENT YOU CHANGE THE FUNCTION, AND IT MUST BE CORRECTED IN THE SAME COMMIT <==

`app/instructor/page.tsx` **lines 328 to 331** currently read:

> IT NOW SHOWS ONE DECIMAL. An average is a derived number, so displaying it to a fixed precision is honest; **NO INDIVIDUAL SCORE IS ROUNDED ANYWHERE**, which is the rule `lib/types.ts formatPoints()` exists to hold and which the Score column below now goes through too.

After this change, individual scores ARE rounded, to one decimal. **The distinction that comment draws between the derived average and untouched individual scores stops being true, and a future session reading it will believe a rule the code no longer holds.** Correct the wording so it states what is actually true: individual scores are rounded to one decimal and never to a whole number.

**THE REASONING ABOVE IT IS STILL CORRECT AND MUST SURVIVE.** Phase 4a removed a `Math.round()` from the average because Tom's Discovery ladder awards 49.5, 38.5, 13.5, 4.5 and 0.5, and rounding made one screen print 69 above a row reading 68.5. **One decimal preserves every one of those values, which is why one decimal is the floor.** Do not let this change reintroduce whole-number rounding anywhere.

### ==> IT APPLIES TO EVERY EXISTING SCORE, WITH NO BACKFILL, AND THAT IS A STATED REQUIREMENT <==

**Tom will show his existing practice to students in class. It must display correctly.**

It will, by construction: `app/student/session/[id]/results/page.tsx` line 62 reads the stored `score` at request time, and `components/rubric-score.tsx` renders it through `formatPoints` on every request. **Changing the function changes what every existing row displays, immediately, with nothing written to the database.**

**One caveat to tell the owner:** any PDF already saved keeps the old numbers. Reprint from the live page.

### What to MEASURE and REPORT, and not act on

**Where the dust comes from is not established, and this session must not guess.** Both rubric files in `OS_Resources/Relii` are clean: 86 and 91 numeric cells, **zero** with six or more decimal places. The parser deliberately reads Excel's cached value and never multiplies (`lib/rubric-xlsx.ts` line 339, and the note at line 177).

**THE MEASUREMENT:** read `items` for the rubric behind Tom's Discovery assignment and report the 55-point criterion's six level points and its max, **verbatim**. **A READ ONLY.**

**ALSO REPORT, AND DO NOT CHANGE:** `lib/scoring.ts` line 437 sums `points_earned` with plain float addition (`scoredItems.reduce((sum, item) => sum + item.points_earned, 0)`), and `app/api/session/end/route.ts` line 272 stores that sum as `score_total`. **So stored totals may carry dust even though every screen now hides it.**

**OUT OF SCOPE:** changing the parser, normalising at parse time, and backfilling any stored row. Those are a separate decision the owner makes after reading the measurement.

---

## Change three: elapsed timestamps on every transcript turn

**OWNER RULING: elapsed from the first turn, not clock time.** Tom evaluates time himself, and elapsed is what tells him where a ten-minute call went.

### Three surfaces, all of them

| Surface | File | Line |
| :-- | :-- | :-- |
| The instructor `.txt` download | `app/api/instructor/submission/[id]/transcript/route.ts` | **46**, `` lines.push(`${who}: ${turn.text}`); `` |
| The student results page, which is also the printable | `app/student/session/[id]/results/page.tsx` | **391**, `{transcript.map((turn, i) => (` |
| The instructor submission page | `app/instructor/submission/[id]/page.tsx` | **449**, `{transcript.map((turn, i) => (` |

**ONE SHARED HELPER, NOT THREE IMPLEMENTATIONS.** It belongs in `lib/app-time.ts`, beside the existing Instant functions.

### The naming rule, and why it is stricter than it looks

`lib/app-time.ts` exists to hold ONE timezone constant, and its header names four date-only formatters that are deliberately NOT in it. Its existing exports are `APP_TIME_ZONE`, `formatInstant`, `formatInstantShortDay`, `formatInstantDay`, `instantDayStamp` and `startOfAppDay`.

==> **AN ELAPSED VALUE IS A DURATION, NOT AN INSTANT, AND IT HAS NO TIMEZONE AT ALL.** Name it so that is obvious, `formatElapsed` or equally plain. **It must not touch `APP_TIME_ZONE`**, and it must not carry `Instant` or `Day` in its name, because every other name in that file means "a moment, rendered in US Central" and this one does not. Say so in a comment beside it, since the file's whole purpose is that nobody has to guess. <==

### The data is there on every turn

`turn.at` is an ISO timestamp written on every path: `app/api/voice/transcript/route.ts` line **31**, and `app/api/chat/route.ts` lines **87** and **117**. `TranscriptTurn.at` is a required field on the type (`lib/types.ts` line 14).

**FORMAT:** `mm:ss` from the first turn, rolling to `h:mm:ss` past an hour. **The first turn reads `00:00`.**

### The `.txt` download also gains the absolute start time

That route already imports `formatInstant` from `lib/app-time` (line 10) and wraps it as `formatDateTime`, and its header block already prints Student, Assignment, Scenario and Submitted before a blank line. **Add the start time there**, so the elapsed column has an anchor. It costs nothing.

### The printable must keep working

**The student results page prints, and a collapsed or clipped transcript is a shipped-feature regression this project has hit before.** Check the print rendering, not only the screen.

### The edge to measure and report, not to design around

`app/api/chat/route.ts` line **123** appends turns to one transcript across reloads (`.update({ transcript: [...withStudent, personaTurn] })`), and text practices resume losslessly. **A student who resumes the next day produces a genuinely large elapsed value.**

**Render what it actually is, and report what a resumed practice renders. DO NOT INVENT A PER-SITTING RESET IN THIS SESSION.** Voice is unaffected: a dropped voice call ends the practice.

---

## The proof

**EVERYTHING HAPPENS IN B1. NOTHING IN TOM'S CLASS IS READ OR TOUCHED.** The standing guard is in force with no exception. The owner verifies Tom's own practice himself by reloading it.

| # | Check | Why it discriminates |
| :-- | :-- | :-- |
| 1 | A pure-function check of `formatPoints` over the table above, including `49.50000000000001` and `55.00000000000001` | The values cannot be produced by chance, and the check runs without a browser |
| 2 | **An EXISTING B1 score, not re-scored, renders through the new function after the deploy** | This is the retroactivity proof, and it is the requirement Tom depends on |
| 3 | **BOTH leaks closed on screen:** the submit confirm on an eligible B1 practice shows its score through `formatPoints`, and the instructor dashboard's reset history shows a prior score the same way | One helper, no raw renders left |
| 4 | All four strings in `submit-practice-button.tsx` read "review" on screen, and no page anywhere still says "Submit as graded assignment" | The deploy check: only the new build can render it |
| 5 | The `.txt` download's first turn reads `00:00` and later turns increase monotonically | Elapsed, not clock time |
| 6 | The same elapsed values appear on the student results page, the instructor submission page and the download, **for the same session** | One helper, three surfaces, no drift |
| 7 | The student results page **printed**, with the transcript and its timestamps intact and not clipped | Print is a shipped feature |
| 8 | The rubric read from change two, reported verbatim | The measurement the owner rules on next |

**CHECK 2 CERTIFIES THIS SESSION.** A decimal fix that only applies to newly scored work does not meet the requirement.

**The fake-media rig is not needed** unless a new practice is wanted: checks 2 through 7 run against existing B1 data. If a fresh practice is run, the rig recipe is unchanged, and **the submit flow and the practice delete both use in-page two-step confirms rather than browser dialogs.**

==> **VERIFY THE RIG'S FLAGS BEFORE ANY VOICE RUN, AND KNOW THAT THEY ARE NOT SET TODAY.** Measured 2026-09-13: the Playwright MCP is configured in `.mcp.json` with no arguments, so the Chrome it launches carries none of `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream` or `--use-file-for-fake-audio-capture`. **Starting a voice practice in that browser opens the owner's real camera and microphone.** Read the track labels before you rely on a run. This session should not need voice at all. <==

**Run the five existing check scripts and report their counts FROM THE RUNS**, not from memory: `check-app-time`, `check-csv-ai-level`, `check-rubric-render`, `check-scorer`, `check-persona-list`. **`check-rubric-render` and `check-csv-ai-level` both exercise `formatPoints` indirectly, so a change there is exactly what they exist to catch.** A count that moves is a finding, not a nuisance.

---

## Scope fence

- **No parser change, no parse-time normalisation, no backfill, no migration, no schema change.**
- **Nothing in Tom's class**, read or write.
- **No English-only transcription.** That is the next session.
- **No persona changes**, no geography, no rapport.
- **No route, status or `required_mode` change.** Change one is copy only.
- **No change to `lib/scoring.ts` or the scoring prompt.**

## The build gate, and the order everything runs in

**NOTHING ON SCREEN PROVES ANYTHING UNTIL THE NEW BUILD IS LIVE.** Checks 2 and 4 are meaningless against the old build, and check 2 is what certifies this session. Run in this order and do not reorder it.

**1. THE BUILD GATE, BEFORE ANY COMMIT.** `rm -rf .next`, then `tsc`, then `eslint`, then `npm run build`. **Report each exit code and the timestamp.** All three exit 0, or stop and say what failed.

==> **THIS IS THE ONLY STEP THAT CATCHES A BROKEN BUILD, AND THAT IS NOT OBVIOUS.** The five check scripts read SOURCE, not a build, so all five can pass green over code that does not compile. Change three adds a new export to `lib/app-time.ts` and three new call sites across a route and two pages, which is exactly the shape that produces a type error or an unused-import lint failure. <==

**2. THE FIVE CHECK SCRIPTS, PLUS THE PURE-FUNCTION CHECK.** `check-app-time`, `check-csv-ai-level`, `check-rubric-render`, `check-scorer`, `check-persona-list`, counts read from the runs. Check 1 of the proof table runs here too: it needs no browser. **Do this before the commit, so a red script never reaches main.**

**3. COMMIT AND PUSH**, behind their ask rules. Then clear any lock files git leaves behind and prove the tree is clean.

**4. CONFIRM THE DEPLOY BY A REAL REQUEST, NOT BY ELAPSED TIME.** Request a prerendered page and watch the **etag change and `age` reset to 0**. This is the 2b-1 rule already in PROJECT_STATE, and it exists because a deploy confirmed by waiting is not confirmed. **If the build is red, stop and say so; do not run the on-screen checks against the old build.**

**5. ONLY THEN, CHECKS 2 THROUGH 7 ON THE LIVE SITE**, through Playwright MCP, headed, on relii.vercel.app, **in B1 only**, signed in as the B1 student and the B1 instructor as each check requires. This includes the `.txt` download, both transcript surfaces, and the printed results page.

**6. CHECK 8 AND ANY OTHER SQL, THROUGH THE SUPABASE MCP, READ ONLY.** The rubric read is a read and nothing else. **Nothing in Tom's class, read or write.** If no SQL turns out to be needed beyond check 8, say so rather than inventing a query.

**7. IF ANYTHING NEEDS FIXING AFTER STEP 5 OR 6**, fix it, then **re-run the build gate and re-confirm the deploy** before re-running the affected checks. A check that passed against a build you have since replaced is not evidence.

## How testing runs

The click-through runs through Playwright MCP, headed, against the live site, **in B1 only**. Any SQL is a read through the Supabase MCP. **Verify git state with read-only commands only** (`git --no-optional-locks status`, `git log`, `git rev-parse`); a plain `git status` leaves a lock file that blocks the next commit. git commit and push stay behind their ask rules.

**Every git write in this repo has been leaving `.git/HEAD.lock`, `.git/objects/maintenance.lock` and `tmp_obj_*` behind.** Check for them after your last git command, remove any you find, and prove the tree is clean.

## Conventions, and what PROJECT_STATE must carry when you finish

No em dashes and no en dashes outside chat. Record each owner ruling in PROJECT_STATE when it is given.

**PROJECT_STATE must carry, at the end:**

- **the eight checks with their OBSERVED values**, not a claim that each passed;
- **the rubric read, verbatim**;
- **what a resumed practice rendered** for elapsed time;
- **the five script counts, read from their runs**;
- **the two leaks named and closed**, including the `reset-history.tsx` one the change brief did not have;
- **the corrected `app/instructor/page.tsx` comment**, and why the old wording stopped being true.
