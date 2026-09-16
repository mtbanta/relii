# Instructor and admin page performance

**ONE SESSION WITH A HARD GATE IN THE MIDDLE.** Measure first, report the baseline, then fix, then re-measure with the same instrument.

==> **NO FIX IS WRITTEN UNTIL THE BASELINE TABLE IS IN THE RECORD.** A performance fix without a before number cannot be falsified. This is the heart of the piece and it is not negotiable. <==

**THE COMPLAINT, IN THE OWNER'S WORDS.** Every instructor page takes **2 to 6 seconds** after clicking: Submissions, AI Persona Framework, Manage Assignments, Roster, Invite Users. Reproduced on both his admin account and `instructor@test.com`. **The Administration page takes 10 to 30 seconds.**

**THE WIDE RANGES ARE THEMSELVES EVIDENCE.** A fixed cost gives a tight range; 10 to 30 seconds is a fixed cost plus a cold start.

**Before anything else, state the filename and line count you read.**

## READ FIRST

- **`PROJECT_STATE.md`, Current Stage and Open Issues**, and **its opening rule**: it is an accreting historical record, not a current-state database. A number in it is true as of its own date. **Measure the present value.**
- **`app/admin/page.tsx` in full**, and the five instructor pages named below.
- **`lib/class-scope.ts`.** Its rule governs what you may not trade away for speed.

==> **THERE ARE UNPUSHED COMMITS WAITING FOR YOU, AND THEY ARE THIS FILE. YOU PUSH THEM.** This kickoff was written in a Cowork session that **cannot push**: github.com is not on that session's egress allowlist, so it commits and stops. **The owner does not push. You do, for every commit in this repo, including the ones you did not make.** Run `git log --oneline origin/main..main` before you start and name what you find. <==

==> **`OS_Resources` IS NOT VISIBLE TO YOU AND NEVER WILL BE.** Nothing here cites it; every source named is in the repo or in a git object. Do not request access. <==

**STATE YOUR PLAN AND WAIT FOR APPROVAL.**

---

## What the code already says, so you do not rediscover it

==> **THE TRANSPORT IS HTTP, WHICH IS WHY COUNT MATTERS MORE THAN QUERY TIME.** `lib/supabase/admin.ts` uses `@supabase/supabase-js` over PostgREST. **There is no `pg` driver in `package.json`.** Every `await admin.from(...)` is a separate HTTPS round trip from a Vercel function to Supabase, with its own connection setup. **Sequential awaits therefore add latency linearly.** <==

### The admin page is an N+1 loop, serially awaited

`app/admin/page.tsx`, all lines re-verified on 2026-09-16 against `0ad20a7`:

| Line | What |
| :-- | :-- |
| **22** | `export const dynamic = "force-dynamic";` |
| **83** | `const COUNTED = [` , holding five tables: `rubrics`, `scenarios`, `assignments`, `sessions`, `allowed_emails` |
| **92** | `for (const cls of classes ?? []) {` |
| **94** | `for (const [table, label] of COUNTED) {` |
| **95** | `const { count } = await admin` , inside BOTH loops |
| **101** | `const { count: recordings } = await admin` , a sixth await per class |

**SO THE COST IS CLASSES MULTIPLIED BY SIX, ONE ROUND TRIP AT A TIME.** **Count the classes and put the real multiplier in the record rather than assuming one.**

`app/admin/class/[id]/page.tsx` line **23** is also `force-dynamic`. Correct for live counts, and it means no caching softens the loop.

### Nothing runs in parallel on any list page

**Every await on the five list pages, with line numbers, verified on 2026-09-16.** The counts match the brief exactly.

| Page | Awaits | Lines |
| :-- | :-- | :-- |
| `app/instructor/page.tsx` | **8** | 101, 109, 111, 134, 156, 196, 245, 278 |
| `app/instructor/assignments/page.tsx` | **5** | 64, 66, 91, 120, 173 |
| `app/instructor/roster/page.tsx` | **4** | 39, 48, 69, 93 |
| `app/instructor/scaffold/page.tsx` | **2** | 44, 52 |
| `app/instructor/invites/page.tsx` | **1** | 37 |

**`Promise.all` appears in NONE of these six pages.** It appears in `app/instructor/submission/[id]/page.tsx`, **two** API routes (`assignment/[id]/delete`, `submission/[id]/reset`) and three libs (`scaffold-candidates`, `instructor-submission`, `persona-scaffold`).

==> **ONE CORRECTION TO THE CHANGE BRIEF, FOUND BY COUNTING: it says "three API routes". There are TWO.** The brief is right about everything else it counted. Record the correction. <==

==> **A HEAD START ON THE HARDEST JUDGMENT, WHICH YOU MUST VERIFY RATHER THAN TRUST.** On the biggest page, `app/instructor/page.tsx`, the first three awaits look genuinely independent of each other: **101** (`searchParams`), **109** (`requireInstructor()`), **111** (`createClient()`). **Everything after them fans out from `classId` or from `supabase`**, so 134, 156, 196, 245 and 278 cannot simply join the same `Promise.all`. **That is an observation from reading, not a result. Check every await on every page yourself and say which you left sequential and why.** <== 

---

## What is known about the infrastructure, and what is not

**KNOWN, from the owner's Supabase dashboard on 2026-09-16:**

| Fact | Value |
| :-- | :-- |
| Region | **us-west-2, West US (Oregon)** |
| Compute | **NANO, t4g.nano** |
| CPU | 2% |
| RAM | 52% |
| Disk | 15% |
| Connections | 6 of 60 |
| Last 24 hours | 1,449 requests, 100% success |

==> **THE DATABASE IS NOT STRUGGLING, AND THAT IS THE MOST USEFUL THING ON THAT DASHBOARD.** CPU at 2% and a 100% success rate say the seconds are not being spent executing queries. **They are being spent going back and forth. A session that starts by tuning SQL is looking in the wrong place.** <==

**NOT KNOWN, AND IT IS THE FIRST THING TO MEASURE: the Vercel function region.** There is **no `vercel.json`** in the repo and **no region setting in `next.config.ts`**, so the project runs on whatever default its account carries.

**Read it from a response header rather than asking the owner to look it up:**

```
curl -sI https://relii.vercel.app/login | grep -i x-vercel-id
```

The value begins with the region code, for example `iad1::` (Washington DC) or `pdx1::` (Portland). **If it is not a west-coast region, every round trip above is crossing the continent**, and at roughly 60 to 70 milliseconds each way that is a floor of about 0.6 seconds on the instructor dashboard and several seconds on the admin page **before any query executes**.

---

## ==> THE GATE <==

==> **PRODUCE THE BASELINE TABLE BELOW AND REPORT IT. WRITE NO FIX UNTIL IT EXISTS IN THE RECORD.**

**IF THE MEASUREMENT CONTRADICTS THE CODE READING ABOVE, FOLLOW THE MEASUREMENT.** The section above is a reading of the code, not a result. This project has already paid twice for treating a documented expectation as a measured fact: D3's `languages` field returned HTTP 400 from a doc page that described it, and a stale PROJECT_STATE baseline was quoted as current. **Measure.** <==

---

## The measurement

**All of it in B1 and on the owner's own admin account, on `relii.vercel.app`, never localhost.**

**THE OWNER SUPPLIES PASSWORDS BY THE FILE METHOD:** a `/tmp` file entered with `read -rs` in a separate Terminal, never pasted into chat, deleted at session end. **ASK WHICH ACCOUNTS.**

**ONE RECORDED FACT SO YOU DO NOT LOSE A ROUND TRIP TO IT:** PROJECT_STATE records that a chat-pasted password was once replaced by the literal token `<password>` inside tool arguments, and ALSO that on three later occasions it arrived intact. **The redaction is intermittent. The durable rule is the measurement, not the route:** read `document.querySelector('input[type=password]').value.length` after filling, whichever way the password came.

### 1. The region, first, because it is one command

Run the curl above. **Record the exact header value.** Then check whether a region is pinned anywhere in the project, and **say plainly if it is not**.

### 2. Instrument the server, which is the decisive step

**Add a `Server-Timing` response header to each of the six pages**, one entry per awaited call, measured with `performance.now()`. **This is what attributes seconds to specific calls instead of to a theory.**

==> **KEEP THE INSTRUMENTATION BEHIND AN ENV FLAG OR STRIP IT IN THE FIX HALF, AND SAY WHICH. DO NOT LEAVE UNCONDITIONAL TIMING CODE ON A STUDENT-FACING PATH.** <==

### 3. Navigation timing in the browser

Through the Playwright MCP, headed, capture `performance.getEntriesByType('navigation')` for each page. **Record cold and warm separately:** load each page once after an idle period, then again immediately. **The owner's 10-to-30 range says the difference matters.**

### 4. The database side, to confirm it is not the cause

Through the Supabase MCP, run `explain analyze` on the admin count query for one class, and read `pg_stat_statements` for mean execution time and call counts on the top statements. **The expectation is that execution time is small and the call count is large. Report the numbers either way.**

### 5. The multiplier

**Count the classes.** The admin page's cost is that number times six. **Put the arithmetic in the record: classes, round trips, measured total.**

### The baseline table, which is the gate

| Page | Cold ms | Warm ms | Round trips | Slowest single call |
| :-- | :-- | :-- | :-- | :-- |
| `/instructor` | | | | |
| `/instructor/assignments` | | | | |
| `/instructor/roster` | | | | |
| `/instructor/invites` | | | | |
| `/instructor/scaffold` | | | | |
| `/admin` | | | | |

---

## The fix, after the gate

**In this order, cheapest and safest first.**

**1. COLLAPSE THE ADMIN N+1.** Five separate counts per class become **one grouped query per table across all classes**, or a single query returning counts grouped by `class_id`. **Six round trips total instead of six per class.**

**2. PARALLELISE INDEPENDENT AWAITS** with `Promise.all` on every list page. **Only the ones that are genuinely independent:** anything that needs `classId` from `requireInstructor()` must still wait for it. **Say which awaits were left sequential and why**, page by page.

**3. PIN THE FUNCTION REGION TO MATCH SUPABASE** if the region check shows a mismatch. `us-west-2` in Supabase terms is Vercel's `pdx1` or `sfo1`. This is a project setting or a `vercel.json` entry, **and it is the OWNER'S CALL TO MAKE, NOT YOURS**, because it affects every route in the app. **Report the mismatch and stop.**

### Two levers you must NOT pull

- **DO NOT CHANGE THE SUPABASE COMPUTE TIER.** Nano is a paid decision and the dashboard says CPU is 2%. **Report whether the data supports an upgrade; do not make one.**
- **DO NOT WEAKEN ANY ROW LEVEL SECURITY POLICY OR CLASS-SCOPING GUARD TO SAVE A QUERY.** `lib/class-scope.ts`'s rule stands: **the listing is scoped, the fact check is not.** A faster page that reads another instructor's rows is a defect, not an optimisation.

---

## The proof

**Re-run the measurement with the SAME instrument and publish both columns.**

| # | Check | Why it discriminates |
| :-- | :-- | :-- |
| 1 | The same six pages, cold and warm, before and after, in one table | **CERTIFIES THE SESSION.** Anything else is an impression |
| 2 | The admin page's round-trip count drops from classes times six to a fixed small number, **counted rather than claimed** | The N+1 is the headline |
| 3 | Every page still renders **exactly the same data**: same counts, same rows, same ordering | A parallelised page that quietly drops a result is worse than a slow one |
| 4 | `instructor@test.com` in B1 still sees **only** B1 data, and a cookie-tampered working class still falls back or refuses | Gate 6's cookie-tamper matrix, re-run. Parallelising touched the code that enforces it |
| 5 | The five existing check scripts pass, counts read from the runs | Standing practice |
| 6 | `tsc`, `eslint` and `npm run build` all exit 0 after `rm -rf .next` | Standing practice |

==> **CHECK 3 IS THE ONE MOST LIKELY TO FAIL QUIETLY.** `Promise.all` changes nothing about results when the awaits are truly independent, and changes results silently when they are not. **Capture each page's rendered data BEFORE the fix so check 3 is a comparison rather than an impression.** <==

---

## Scope fence

- **No schema change, no migration, no new dependency.**
- **No RLS or policy change.**
- **No Supabase plan or compute change.**
- **No region change without the owner's explicit approval**, even if the mismatch is confirmed.
- **Nothing in Tom's class**, read or write.
- **No unrelated refactoring.** If a page needs restructuring beyond parallelising and collapsing the loop, **report it and stop.**

## The order everything runs in

**1. THE REGION CHECK AND THE INSTRUMENTATION.** One curl, then `Server-Timing` on six pages behind a flag.

**2. THE BASELINE, ALL SIX PAGES, COLD AND WARM.** Publish the table. **THIS IS THE GATE. Stop here and report before writing any fix.**

**3. THE FIX**, in the order above, with the region left to the owner.

**4. THE BUILD GATE.** `rm -rf .next`, then `tsc`, `eslint`, `npm run build`, each with exit code and timestamp. **The five check scripts read SOURCE, not a build, so all five can pass green over code that does not compile.**

**5. THE FIVE CHECK SCRIPTS**, counts read from the runs, before the commit.

**6. COMMIT AND PUSH.** The push carries the Cowork session's kickoff commit too; `git log --oneline origin/main..main` must read empty afterwards. Clear any lock files and prove the tree is clean.

**7. CONFIRM THE DEPLOY BY A REAL REQUEST, NOT BY ELAPSED TIME.** Etag change and `age` reset to 0.

**8. RE-MEASURE AND RUN CHECKS 1 TO 6.** A check that passed against a build you have since replaced is not evidence.

## How testing runs

The click-through and the navigation timing go through Playwright MCP, headed, on `relii.vercel.app`, in B1 and on the owner's admin account. SQL is read-only through the Supabase MCP. **Verify git state with read-only commands only** (`git --no-optional-locks status`, `git log`, `git rev-parse`); a plain `git status` leaves a lock file that blocks the next commit. **Every git write in this repo has been leaving `.git/HEAD.lock`, `.git/objects/maintenance.lock` and `tmp_obj_*` behind.** Check after your last git command and remove any you find.

## Conventions, and what PROJECT_STATE must carry when you finish

No em dashes and no en dashes outside chat. Record each owner ruling when it is given.

**PROJECT_STATE must carry, at the end:**

- **the region header value, verbatim**, and whether a region is pinned anywhere;
- **the before and after table, with cold and warm columns**, from the same instrument;
- **the round-trip counts AS COUNTED**, not as reasoned;
- **which awaits were left sequential and why**, page by page;
- **the `pg_stat_statements` reading**, whichever way it came out;
- **a plain statement of whether the data supports a compute upgrade**, and that no upgrade was made;
- **what happened to the instrumentation**, flagged or stripped;
- **confirmation that `origin/main` equals `main`**, with the kickoff commit pushed rather than left behind.
