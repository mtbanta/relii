# The Roster bounce: an intermittent fault that is no longer reproducing

**THIS WAS OPENED AS A LIVE INCIDENT AND IT IS NO LONGER ONE. READ THIS SECTION BEFORE ANYTHING ELSE.** Tom could not reach the Roster tab from any other tab, and a fresh login put him straight back into the same loop. **He can now reach it.** Nothing was deployed and no data was knowingly changed in between.

==> **THAT IS THE CENTRAL FACT AND IT GOVERNS THE WHOLE PIECE. A fault that resolved itself without a deploy is intermittent, and an intermittent fault whose cause is unknown will recur.** The code is unchanged, so whatever produced it is still there. <==

**THE PRIORITY IS NOW RELIABILITY, NOT RESCUE.** Nobody is blocked today. **But the single worst thing about this fault is that when it next happens there will be no evidence**, because Vercel Hobby retains about one hour of runtime logs. **The most valuable thing this session can ship is not a fix. It is making the next occurrence observable.**

==> **NO FIX IS WRITTEN FOR A CAUSE THAT HAS NOT BEEN OBSERVED.** There is no failing case to test a fix against right now. A change that makes the symptom "go away" when the symptom is already gone proves nothing and risks a regression in the auth path on a live instructor account during adoption. <==

**Before anything else, state the filename and line count you read.**

---

## READ FIRST

- **`PROJECT_STATE.md`, Current Stage and Open Issues**, and **its opening rule**: it is an accreting historical record, not a current-state database, and it is **cited by its text, never by line number**. A number in it is true as of its own date. Measure the present value.
- **`app/instructor/roster/page.tsx` in full.** All 234 lines. The comments on it are load bearing.
- **`lib/supabase/middleware.ts` in full.** 93 lines. It is the proxy.
- **`lib/instructor-auth.ts`**, at least `requireInstructor()`.
- **`lib/class-scope.ts`.** Its rule governs what you may not trade away for a fix.
- **`app/instructor/layout.tsx`**, for the reason given under "Three auth checks, not two" below.

==> **THERE IS AN UNPUSHED COMMIT WAITING FOR YOU AND IT IS THIS FILE. YOU PUSH IT.** This kickoff was written in a Cowork session that **cannot push**: github.com is not on that session's egress allowlist, so it commits and stops. **The owner does not push. You do, for every commit in this repo, including the ones you did not make.** Run `git log --oneline origin/main..main` before you start and name what you find. <==

==> **`OS_Resources` IS NOT VISIBLE TO YOU AND NEVER WILL BE.** Nothing here cites it; every source named is in the repo. Do not request access. <==

**STATE YOUR PLAN AND WAIT FOR APPROVAL.**

---

## 1. THE FULL REPORT, IN THE ORDER IT ARRIVED

### What was reported, 2026-10-02

- In `tbbanta@ksu.edu`, **signed in and working**, clicking **Roster** from any other tab asked him to log in again.
- **He logged back in and still could not reach Roster.** The loop repeated.
- **Roster was the only tab affected.** Submissions, AI Persona Framework, Manage Assignments and Invite Users all worked.
- **The owner could not reproduce it** on `instructor@test.com` or on his own admin account.

### What has changed since, and it is three separate facts

1. **The host question is closed. Tom uses `relii.vercel.app`.** `www.relii.io` is also assigned to this production deployment, and the owner's log console happened to be showing traffic on it, but **Tom is not on that host.** A cross-host cookie split is ruled out. **Do not reopen this.**
2. **The owner signed in as Tom with Tom's credentials and reached Roster from every other tab.** The failure did not reproduce on Tom's own account.
3. **Tom then reported that he is suddenly succeeding too.** **The owner does not know which tab he started from**, and does not know whether Tom's success came before or after the owner's sign-in.

==> **FACT 2 AND FACT 3 ARE NOT INDEPENDENT AND THEY MAY NOT BE TWO OBSERVATIONS AT ALL.** A fresh sign-in creates a new Supabase session. If the owner's sign-in as Tom changed the state Tom's browser was failing on, then **the owner's diagnostic step is what ended the fault, and it did not resolve on its own.** Those two readings have different consequences and **the timeline is what separates them.** It is free to obtain and it is step 0. <==

---

## 2. WHAT THE CODE ALREADY SAYS, SO YOU DO NOT REDISCOVER IT

**All line numbers below were re-verified read-only against `b49f4fb` on 2026-10-02. Verify them again yourself before you rely on one.**

### The bounce has two possible origins

| # | Where | What |
| :-- | :-- | :-- |
| 1 | `lib/supabase/middleware.ts` **lines 81 to 82** | `url.pathname = "/login";` then `return NextResponse.redirect(url);` for a request the proxy reads as unauthenticated. The proxy runs on **every** route: `proxy.ts` line 11 matches everything except Next.js internals and static images. |
| 2 | `lib/instructor-auth.ts` **line 172** | `redirect("/login");` inside `requireInstructor()` when there is no user. |

**They are distinguishable in a network trace.** The proxy redirects **before the page renders**; `requireInstructor()` redirects **after the function starts**. **There is no trace to read right now.** That is exactly why section 5 exists.

### Three auth checks, not two, and the order matters

A single `/instructor/roster` request calls `supabase.auth.getUser()` **three times, in sequence**:

| Order | Call site | Reaches Supabase from |
| :-- | :-- | :-- |
| 1 | `lib/supabase/middleware.ts` line 74 | the proxy, which P1 measured still running in **iad1**, not pdx1 |
| 2 | `app/instructor/layout.tsx` line 33, via `requireInstructor()` | the function, in pdx1 |
| 3 | `app/instructor/roster/page.tsx` line 40, via `requireInstructor()` | the function, in pdx1 |

==> **THE LAYOUT CHECK IS A FREE DISCRIMINATOR.** `app/instructor/layout.tsx` wraps **all five tabs**. If check 2 were the one failing, every tab would bounce, not only Roster. **So if origin 2 fired, it fired from the page's call at `roster/page.tsx` line 40, the last of the three in wall-clock time and the one most exposed to anything that rotates mid request.** <==

### The one structural difference between Roster and every tab that works

`app/instructor/roster/page.tsx` **line 94**:

```
const { data: everyProfile } = await admin.from("profiles").select("email");
```

**An unbounded read of every row in `profiles`, on every load.** The comment above it, lines 77 to 93, is correct and the read is deliberate: **the listing is scoped, the fact check is not**, and scoping it would strand accepted instructor invites as pending forever. **Do not scope it as a reflex.**

**But it is the one thing on that page that grows every time a student registers**, and Tom's class is the only one with real students.

**Verified:** `from("profiles")` appears **once** across the five instructor tab pages, and that once is line 94. (`app/instructor/submission/[id]/page.tsx` line 149 also reads `profiles`, but that is a detail page reached from Submissions, not one of the five tabs.)

The Roster page's other reads: `requireInstructor()` at **line 40**, `loadClassStudents` at **line 49**, and the class-scoped `allowed_emails` read at **lines 69 to 75**.

### Already checked and ruled out. Do not spend time here again.

Verified read-only against `b49f4fb` on 2026-10-02:

- **The navigation is not the difference.** `components/instructor-nav.tsx` line 28 renders Roster from the same `DESTINATIONS` array, through the same `next/link`, with the same relative `href`, as the other four tabs.
- **There is no absolute application URL anywhere in the source.** `git grep` over `app`, `lib` and `components` finds `https://` only on three OpenAI endpoints. No `window.location.origin`, no host header construction, no `emailRedirectTo` or `redirectTo` in any auth call.
- **The two-host question is answered by fact 1 above.** Tom is on `relii.vercel.app`.

---

## 3. WHAT THE SELF-RESOLUTION RULES IN AND OUT

**This is reasoning, not evidence. Treat every line of it as a thing to test, not a thing to believe.**

| Candidate | What the self-resolution does to it |
| :-- | :-- |
| **A null or empty `email` in `profiles`** throwing at `roster/page.tsx` line 97 | **Badly weakened.** It would throw deterministically on every load for **every** instructor, not only Tom, and it would not stop without the row changing. **Still worth one query**, because it is the cheapest check in the piece and it either rules out a whole class of cause permanently or overturns this reasoning. |
| **Any other static data-shape defect** in his class | **Weakened** for the same reason. A shape that resolves itself means a row changed. Ask whether a student registered or an invite was accepted in the window. |
| **Scale, that is, the unbounded line 94 read getting slow enough to time out** | **Compatible and not ruled out.** A timeout is intermittent by nature and would be felt first on the heaviest page, and `profiles` only grows. It would also be worse on a cold start. |
| **Session refresh rotating the token mid request** | **Compatible and not ruled out.** P1 measured the proxy's login check at 109 to 478 ms warm and about 1.2 s when the hourly refresh lands on the same request. This is intermittent and self-clearing by construction. |
| **A stale or duplicated client-side session** in Tom's browser | **Compatible, and it is the one the owner's sign-in may have cleared.** This is why the timeline in step 0 matters. |

==> **TWO FAMILIES SURVIVE: TIMING AND CLIENT SESSION STATE. BOTH ARE INTERMITTENT. NEITHER CAN BE CONFIRMED WITHOUT CATCHING IT HAPPENING.** That is the whole argument for section 5. <==

---

## 4. THE DIAGNOSIS, CHEAPEST FIRST

### Step 0. Close the confound. Ask the owner two questions and nothing else.

**Both are free, both are decisive, and neither needs an account or a query.**

1. **Did Tom's success come before or after the owner signed in as him?** If after, the owner's sign-in is a candidate cause of the resolution and the fault did not clear on its own.
2. **Did Tom do anything before it started working?** Specifically: a different browser or device, a private window, clearing cookies, a restart, or simply leaving it alone for a period. **"I do not know" is an acceptable answer and is itself worth recording.**

**Ask these first. The answers change what the rest of the session is for.**

### Step 1. Read-only SQL on the SHAPE of his class, never its contents

Through the Supabase MCP. **Counts and shapes only. Do not read student names, emails, transcripts, recordings or scores.**

- Total row count of `public.profiles`, and the count in Tom's class.
- Count of `allowed_emails` rows for his class, by role.
- **The null check, first and cheapest:** a null or empty `email` in `profiles`, a null in `allowed_emails.email`.
- Duplicate class memberships, and any `class_members` row whose `user_id` has no `profiles` row.
- Whether Tom owns more than one class, and whether his working-class cookie could point at one that resolves differently.
- **Whether any row that the Roster page reads changed in the window between the failure and the recovery.** Use `created_at` or equivalent timestamps. **This is the one query that could distinguish a data cause from a timing cause**, and it is the reason to do step 1 even though section 3 weakens the data hypothesis.

`app/instructor/roster/page.tsx` **line 97** is the line a null would throw on:

```
    (everyProfile ?? []).map((p) => p.email.toLowerCase()),
```

### Step 2. Measure what the Roster page actually costs at Tom's scale

**Not a fix. A number.** If the surviving families are timing, then the question is how close the page runs to a limit.

- From step 1 you have the real row count of `profiles`. **Measure the line 94 read against it**, cold and warm.
- **Compare with the same page in B1**, and say plainly how far apart the two scales are.
- **Say where the margin is**, in plain terms: how much headroom exists before the page would be at risk, and what row count would consume it.

==> **THE TIMING INSTRUMENT IS OFF.** `RELII_SERVER_TIMING` was removed from Production on 2026-09-16 and verified gone; the code is still in the repo and does nothing without the variable. **It is the one tool that puts a duration and a region on a Roster request.** Section 5 is where it comes back, and it is an owner decision, not yours. <==

### Step 3. Reproduce only if steps 0 to 2 name a candidate

**If a candidate emerges, reproduce it in B1, not in Tom's class.** If it is data shape, create that shape in B1. **If it is scale, say plainly that B1 cannot reach Tom's scale and what that limits.** Do not manufacture a reproduction by changing anything in his class.

---

## THE HARD STOP

==> **REPORT STEPS 0 TO 3 AND STOP. DO NOT PASS THIS LINE ON YOUR OWN JUDGEMENT.** <==

Your report says, plainly:

- **what the timeline answers were**, and whether the fault cleared on its own or was cleared by the owner's sign-in;
- **which candidates in section 3 are now ruled out**, with the query or measurement that rules each one out;
- **which survive**, and what evidence would be needed to decide between them;
- **the margin on the Roster page at Tom's real scale.**

**Then recommend, and wait.** Your recommendation goes in section 5's terms: what to instrument, and whether any change is justified without an observed cause.

---

## 5. THE ACTUAL DELIVERABLE: MAKE THE NEXT OCCURRENCE OBSERVABLE

==> **IF THIS SESSION SHIPS ONE THING, IT IS THIS.** The fault will recur or it will not, and the code has not changed, so assume it will. **Today, a recurrence produces nothing: the one-hour log retention means the evidence is gone before anyone looks.** Fixing that is worth more than a speculative fix, it carries almost no risk, and it is the one piece of work that is justified without a confirmed cause. <==

**Propose a plan. Do not implement it before the owner approves it.** Cover at least:

1. **Which of the two bounce origins fired should be recoverable after the fact.** Today a `/login` redirect from the proxy and one from `requireInstructor()` are indistinguishable once the request is gone. **Propose the smallest change that distinguishes them in a surviving record**, and say exactly what it would write and what it would never write. **No student PII, no email addresses, no tokens.**
2. **Whether `RELII_SERVER_TIMING` should come back on**, for how long, what it exposes, and what turns it off again. **This is the owner's call. Put the cost and the exposure in front of him rather than deciding it.**
3. **What the owner should ask Tom to do the moment it recurs**, written as a short instruction the owner can forward: report it immediately rather than later, say which tab he started from, and say what he had been doing in the preceding minutes. **A recurrence reported within the hour is worth more than everything else in this document.**
4. **Whether anything can detect it without Tom noticing**, and if the honest answer is no, say so rather than inventing monitoring this project will not maintain.

**On the unbounded read at line 94:** it is a real and growing scaling risk on its own merits, independent of this fault, and it is the only unbounded read in the instructor surface. **You may recommend bounding it as a reliability change. You may not present it as the fix for a cause nobody has observed**, and the constraint below still binds if the owner approves it.

---

## 6. IF AND ONLY IF A CAUSE IS NAMED AND THE OWNER APPROVES A FIX

- **Do not scope the line 94 read as a reflex.** Its comment explains what scoping would break: an accepted instructor invite would read as pending forever. **If line 94 is implicated, the fix is to bound or restructure it, not to add a class filter.** A targeted existence check on just the invited emails is the shape worth considering, and it preserves the global fact check.
- **Do not weaken any Row Level Security policy or class-scoping guard.** Gate 6's cookie-tamper matrix is re-run as a check if anything in the auth or working-class path is touched.

---

## 7. THE PROOF

**Checks 1 to 4 apply to this session as written. Checks 5 to 8 apply only if a change is approved and made.**

| # | Check | Why it discriminates |
| :-- | :-- | :-- |
| 1 | The timeline answered, or recorded as unknown | **Separates a self-resolving fault from one the owner's sign-in ended.** Everything downstream reads differently |
| 2 | Each section 3 candidate marked ruled out or surviving, with the query or measurement beside it | **A candidate list with no evidence attached is a guess list** |
| 3 | The Roster page's real cost at Tom's row count, cold and warm, with the margin stated | Turns "it might be slow" into a number |
| 4 | **An instrumentation plan the owner has approved**, or a plain statement that none is justified and why | The deliverable of section 5 |
| 5 | After any change, Roster loads on `instructor@test.com` and in B1 | The change works where it can be tested |
| 6 | **The other four instructor tabs still load, and still show the same data** | A change in the auth or shared path can break the tabs that were fine |
| 7 | An accepted instructor invite still reads as registered, not pending | The line 94 trap, if it was touched |
| 8 | Gate 6's cookie-tamper matrix, if anything in the auth or working-class path changed; the five check scripts pass with counts read from the runs; `tsc`, `eslint`, `npm run build` exit 0 | Isolation is not traded for a fix, and standing practice |

==> **NO CHECK IN THIS TABLE PROVES THE FAULT IS FIXED, AND NONE CAN.** The only account that ever showed it is Tom's, and it is not showing it now. **Say that plainly in the record rather than letting checks 5 to 8 read as a clean bill of health.** The fault is closed when it has not recurred over a stated period, or when a recurrence is caught with evidence and fixed. <==

---

## 8. SCOPE FENCE

- **No fix for an unobserved cause.** This is the fence the whole piece rests on.
- **No roadmap work.** N1, T2, N2 and everything else stays untouched.
- **No schema change or migration.**
- **No write of any kind in Tom's class**, and **no sign-in as Tom.** The owner has already done the one sign-in this fault justified and reported the result. **You do not need his credentials and you are not being given them.**
- **No reading of student PII** beyond the counts and null checks in step 1.
- **No Supabase plan or compute change. No Vercel plan upgrade.** The one-hour log retention is a constraint to design inside, not a problem to spend money on.
- **No region change and no domain change** without the owner's explicit approval.
- **No instrumentation turned on without the owner approving what it records and when it comes off.**

---

## 9. ORDER OF OPERATIONS

1. **Read the files named under READ FIRST.** State the filename and line count for each.
2. **Re-verify every line number in section 2.** Say which, if any, have drifted.
3. **State your plan and wait for approval.** Include the exact wording of the two step 0 questions, so the owner asks each once.
4. **Step 0, then steps 1 to 3.**
5. **STOP. Report. Recommend. Wait.**
6. **Section 5's plan, implemented only after the owner approves it.**
7. **Any fix, only if a cause is named and the owner approves the approach.**
8. **Build, commit, push.** The push carries this kickoff's commit too; `git log --oneline origin/main..main` must read empty afterwards. Clear any lock files and prove the tree is clean.
9. **Confirm the deploy by a real request, not by elapsed time.** Etag change and `age` reset to 0.
10. **Run the applicable checks on the live build.**

---

## How testing runs

The click-through goes through **Playwright MCP, headed**, on **`relii.vercel.app`**, which is the host Tom uses. SQL is **read-only through the Supabase MCP**. **You run both yourself.** What the owner does, because you cannot: read the Vercel dashboard, and relay to and from Tom.

**Verify git state with read-only commands only** (`git --no-optional-locks status`, `git log`, `git rev-parse`); a plain `git status` leaves a lock file that blocks the next commit. **Every git write in this repo has been leaving `.git/HEAD.lock`, `.git/objects/maintenance.lock` and `tmp_obj_*` behind.** Check after your last git command and remove any you find.

---

## Conventions, and what PROJECT_STATE must carry when you finish

No em dashes and no en dashes outside chat. Record each owner ruling when it is given. **Cite PROJECT_STATE by its text, never by line number.**

**PROJECT_STATE must carry, at the end:**

- **the full sequence as it happened**: the report, the owner's sign-in as Tom and its negative result, Tom's recovery, and **the timeline between the last two, or that it is unknown**;
- **that the fault resolved with no deploy and no knowing data change**, which is why it is recorded as intermittent and open rather than fixed;
- **that Hobby retains about one hour of runtime logs**, so no log evidence of the failure exists or ever will, and that no plan upgrade was made;
- **that Tom is on `relii.vercel.app`** and the two-host question is closed;
- **the shape queries and their results**, as counts, with no student PII;
- **the Roster page's measured cost at Tom's real row count**, with the margin;
- **each candidate from section 3, marked ruled out or surviving**, with its evidence;
- **what was instrumented, what it records, and when it comes back off**;
- **the standing instruction given to Tom for a recurrence**;
- **a plain statement that the fault is not proven fixed**, and what would close it;
- **confirmation that `origin/main` equals `main`**, with this kickoff's commit pushed rather than left behind.
