# Gate 3a: Every Row Gets a Class (CC Kickoff)

**Before you plan, tell me the filename and the line count of the prompt you just read.** This document lives in the repo now rather than being pasted in, so a stale copy after a /clear is a real possibility and one line rules it out.

You are building **Gate 3a** of the Relii post-demo plan. Read PROJECT_STATE.md first. Follow plan-first discipline: read, verify, present a plan, and WAIT for my approval before writing code. This piece proposes SQL, so you will present it and STOP for my approval before I run it.

## Where the gate stands, and why G3 is now two pieces

G1 built the class spine (commits bc97546, f1fb052). G2 rewrote six of the eight `is_instructor()` policies to class ownership and closed the persona-prompt leak at the column level (commit 3dc9cdf). Both are done and verified.

**G3 was scoped as one piece and has been split, because an audit found seventeen surfaces plus a migration.** The split is data first, then access:

- **G3a, this piece: every row gets a class.** Every write sets `class_id`, the null-invite window is repaired, and the data-layer policies go strict. No read filtering.
- **G3b, next: every read is scoped.** The two shared helpers, four instructor pages, eleven routes. That is where the isolation visibly lands.

**G3a goes first because G3b's filters only work if rows actually carry a class.** Filtering by a column that is null on half the rows produces a page that looks scoped and is not, which is the exact trap this gate exists to remove.

## THE NINE WRITE PATHS

My earlier count was four. It is nine. Verify each yourself.

| # | Where | Writes | Gets its class from |
| :---- | :---- | :---- | :---- |
| 1 | `components/create-assignment-form.tsx` (browser) | assignments | a prop from its page |
| 2 | `components/add-email-form.tsx` (browser) | allowed_emails | a prop from its page |
| 3 | `app/api/instructor/bulk-invite/route.ts` ~120, ~129 | allowed_emails | the calling instructor |
| 4 | `app/api/instructor/scaffold/generate/route.ts` 272 | scenarios | the calling instructor |
| 5 | `app/api/assignment/start/route.ts` 159 | sessions | its scenario |
| 6 | `app/api/voice/start/route.ts` 94 | sessions | its scenario |
| 7 | `app/api/session/start/route.ts` 129 | sessions | its scenario |
| 8 | `app/api/instructor/assignment/[id]/delete/route.ts` 157 | assignment_deletes | the assignment being deleted |
| 9 | `app/api/instructor/submission/[id]/reset/route.ts` 149 | submission_resets | the session being reset |

**Sessions take their class from their SCENARIO, not their assignment**, exactly as G1's backfill did, because `assignment_id` is nullable (free practice) while `scenario_id` is not null. All three session routes already load the scenario, so this should be one extra column on an existing select.

**On the two browser forms:** `app/instructor/assignments/page.tsx` line 99 already passes `createdBy={user.id}` to `CreateAssignmentForm`, so adding a `classId` prop follows a pattern that is already there. `app/instructor/invites/page.tsx` line 38 renders `<AddEmailForm />` with no props at all and calls `await requireInstructor()` on line 21 while discarding the result, so that page needs the result kept and passed down.

**How a server path learns the caller's class:** extend `requireInstructor()` in `lib/instructor-auth.ts` to ALSO return the caller's class id, and use it. **Extend it only. Do not add any filtering to it.** That is G3b, and mixing the two makes G3b's audit harder. If you would rather add a separate small helper than extend `requireInstructor()`, make the case in your plan.

## The repair backfill, and it has a live specimen

The G1-to-G3 null-invite window is real and populated. An invite created after G1 comes from `add-email-form.tsx` with no `class_id`, so the student who accepts it gets a profile and **no `class_members` row**.

**There is one such account right now: `null-student@yahoo.com`**, created during the G2 click-through. It is deliberately being kept until this piece passes, because it is the only live proof the repair works.

The backfill must fix **existing** rows, not just make future writes correct:
- Every `allowed_emails` row with a null `class_id`.
- Every profile with role `student` that has no `class_members` row.

Both join the same class the G1 backfill used, "Relii Demo (Historical)". Write it safe to run twice.

## The two policy changes, and both are gated on the code shipping first

**1. Tighten the three read-everything policies.** `read rubrics`, `read scenarios` and `read assignments` are all `using (auth.uid() is not null)`, so any signed-in user reads every row on all three tables. Scope them to the class.

**A TRAP IN THAT ONE, and getting it wrong blanks the instructor surface.** Class membership is STUDENTS ONLY. An instructor owns a class through `classes.instructor_id` and is NOT in `class_members`. So a policy written as "is a member of this class" denies every instructor. Today that is survivable because the four instructor pages read through the service-role client, but G3b moves reads around and a policy that is wrong in this specific way will fail then rather than now, which is the worst time to find it.

**Write a second helper covering both**, something like `public.can_read_class(target uuid)` returning true when the caller is a member of that class OR owns it. `public.instructs_class()` from G2 already answers the owner half, so this one should build on it rather than duplicate the logic.

**2. Drop the null tolerance on the assignments policy.** G2 shipped `instructs_class(class_id) or class_id is null` specifically so the browser create and edit forms kept working. Once write path 1 sets `class_id`, that allowance becomes a hole and comes out.

## THE SEQUENCING HAZARD, and it inverts this project's usual order

Normally SQL runs first and the push follows. **Here that order would break production.** If the policies go strict before the deployed app sets `class_id`, then creating an assignment fails against the live site until the deploy lands.

So propose **TWO SQL files**, with the deploy in between:

| Step | What | When |
| :---- | :---- | :---- |
| 1 | `supabase/gate-3a-repair.sql` (the repair backfill only) | safe to run immediately, before any code ships |
| 2 | the application code | commit, push, and I confirm the deploy is live |
| 3 | `supabase/gate-3a-policies.sql` (tighten the three reads, drop the null tolerance) | **only after step 2 is live** |

Say this ordering explicitly in both files and in your handoff, and tell me what breaks if I run step 3 early. Also give me a revert file, as you did for G2.

## Out of scope

- **No read filtering on any instructor page or route.** Not `instructor/page.tsx`, not `roster`, not `assignments`, not `submission/[id]`, not any `/api/instructor/*` route, not `lib/scaffold-candidates.ts`. That is G3b in full.
- **No change to `loadInstructorSubmission()`.** It currently reads any submission by id with only a role check, which is the recordings hole. It is G3b's headline fix and touching it here splits that work across two sessions.
- **No filtering added to `requireInstructor()`.** Returning the class id is the whole change.
- No super admin, no cascade delete, no export. That is G4.
- No `not null` on `class_id`. Even after this piece, leave it. It is a cleanup step after G3b, once every write is proven.

## Standing conventions

- Present your PLAN first (the nine write paths, the helper decision, both SQL files, and anything you disagree with) and WAIT for my approval before writing code. Sensible in-flight adjustments are fine if you tell me after.
- Every schema touch is additive and proposed for my approval before I run it. Walk me through the Supabase clicks.
- Destructive or write operations run server-side with the service-role key, never in the browser.
- Test on the deployed URL relii.vercel.app, not localhost. Commits AND pushes stay manual.
- **Do not mark PROJECT_STATE "done" before the SQL has run and I have confirmed the click-through.** You made that call yourself on G2 and it was right. Same here.
- No em or en dashes in any file or content.

## Testing

**Half one, SQL for the Supabase editor**, in three groups matching the three steps:

- **After step 1:** zero `allowed_emails` rows with a null `class_id`, and zero student profiles without a `class_members` row. **Name `null-student@yahoo.com` explicitly in one query** so I can see that specific account was repaired, rather than inferring it from a count.
- **After step 2:** for each of the nine write paths, a query proving a newly written row carries a `class_id`. Tell me which of the nine I can trigger from the UI and which I cannot.
- **After step 3:** the three read policies now say class, and the assignments policy no longer carries `or class_id is null`.

**Half two, my click-through on relii.vercel.app.** Break-risks first, because two of these are the paths G2 deliberately protected and this piece removes that protection:

1. **Create an assignment**, then confirm in SQL that it carries a `class_id`.
2. **Edit that assignment.**
3. **Invite a single person** via the Invite Users form, then confirm the invite row carries a `class_id`.
4. **Bulk invite via CSV**, same confirmation.
5. **Log in as `null-student@yahoo.com`** and confirm the dashboard shows assignments. This is the specimen: before the repair it had no membership row, and after step 3 tightens the read policies, an unrepaired account would show an empty dashboard. **This single test is what proves the repair and the policy change agree with each other.**
6. Run a full role-play, text and voice, and confirm the new session row carries a `class_id`.
7. Generate a persona and confirm the new scenario rows carry a `class_id`.
8. Reset or allow-retake a submission, and delete an unused assignment, then confirm both audit rows carry a `class_id`.
9. Student results page, Submissions with detail and all three downloads, Roster and Manage Assignments all still load.
