# Gate 3b: Every Read Is Scoped (CC Kickoff)

**Before you plan, tell me the filename and the line count of the prompt you just read.** This document lives in the repo rather than being pasted in, so a stale copy after a /clear is a real possibility and one line rules it out.

You are building **Gate 3b** of the Relii post-demo plan, the last code piece of the isolation gate. Read PROJECT_STATE.md first. Follow plan-first discipline: read, verify, present a plan, and WAIT for my approval before writing code. This piece proposes SQL, so you will present it and STOP for my approval before I run it.

## This is the piece where the isolation actually lands

G1 built the class spine. G2 rewrote the policies and closed the persona-prompt leak at the column level. G3a made every write set a class and repaired every existing row.

**None of that has closed the actual hole**, because the instructor surface reads through the service-role client, which bypasses RLS entirely. **Today, any instructor account can read every other instructor's students, submissions, personas and recordings.** G3b is what stops that. G4 (super admin, export-first delete) and G5 (isolation testing) follow.

**Verify this before you start, because it is the fact the whole piece rests on:** no `/api/instructor/*` route checks the target row's class. Four of them now SELECT `class_id`, but only to stamp it onto a new row or an audit record. **Not one gates on it.**

## The surface, and what G3a already took off your plate

**G3a partly scoped two pages already.** Its policy file tightened the three read-everything policies, and both of these read through the ordinary RLS-bound client, so they are already class-scoped:

- `app/instructor/page.tsx`, the dashboard assignment selector
- `app/instructor/assignments/page.tsx`, both the scenario dropdown and the assignments list

**Confirm that yourself and do not redo it.** My earlier brief called all four instructor pages service-role and that was wrong twice; they are mixed.

### What is left, in three groups

**Group 1: the two shared helpers. Do these first, because everything else uses them.**

| File | What it does today | What it must do |
| :---- | :---- | :---- |
| `lib/instructor-submission.ts` | reads ANY submission by id, role check only | verify the submission's class is the caller's |
| `lib/scaffold-candidates.ts` | keys on `generation_group_id` or `id`, **no ownership check at all** | scope every loader to the caller's class |

**`loadInstructorSubmission()` is the headline fix of the entire gate.** It backs the three download routes (video, transcript, CSV) and it is why **any instructor can currently download any student's recording by id**. Storage is not the problem: `stage-5-storage.sql` is correctly scoped to students reading their own folder, with no instructor rule at all. **Instructor playback goes through the server, so it is scoped HERE, in the route, and nowhere else. Do not add a Storage policy.**

`lib/scaffold-candidates.ts` exports `loadGenerationGroup`, `loadCandidateById`, `loadRecentGenerations`, `countScenarioUsage`, `planBulkDiscard` and `planGroupDiscard`. None filters by class. See the trap below before you touch `countScenarioUsage`.

**Group 2: the three pages still reading unscoped through the service-role client.**

| File | Unscoped reads |
| :---- | :---- |
| `app/instructor/page.tsx` | student profiles, sessions, `submission_resets` |
| `app/instructor/roster/page.tsx` | all profiles, all invites |
| `app/instructor/submission/[id]/page.tsx` | the whole page, including the signed video URL |

**Group 3: the eleven `/api/instructor/*` routes.** Each loads a target by id and must confirm that target belongs to the caller's class before acting. `getInstructorClassId()` from G3a gives you the caller's class; four routes already call it.

I expect one shared guard rather than eleven hand-written checks. Propose its exact shape. **Fail closed:** a target with a null or mismatched class is refused, not allowed. After G3a nothing should have a null class, so that branch should be unreachable, which is exactly why it must refuse rather than pass.

## THE TRAP IN THIS PIECE, and it is not the obvious one

**`countScenarioUsage()` must stay GLOBAL. Do not scope it.**

It counts the sessions and assignments referencing a scenario, and that count is what decides whether a scenario can be discarded. The foreign keys behind it are `on delete restrict` and they do not care about classes.

Scope that count to the caller's class and you get this: a scenario used by another class reports as unused, the UI offers a delete, and the delete then fails at the database with a raw foreign-key error the user cannot act on. **The listing is scoped. The safety check is not.** Say so in the code comment, because it looks like an inconsistency and it is not.

## Two visible changes to expect, and neither is a regression

**1. The Roster shrinks.** It lists students and instructors together. Scoped, an instructor sees their own students plus themselves, because they OWN the class rather than being a member of it. Other instructors disappear from the list. That is correct and it is what the gate is for. **The instructor's own row must still appear**, so whatever you write has to include the owner, not just members. Getting this wrong renders a roster with no instructors on it, which looks like a bug.

**2. The dashboard "enrolled" count changes meaning**, from every student in the system to every student in this class. Also correct.

Neither is visible today with one instructor, which is precisely why they need testing deliberately rather than by looking at the screen.

## The SQL: the last two policies

`instructors read invite list` and `instructors add to invite list` on `allowed_emails` are the two policies G2 deliberately left alone, because the browser invite form set no `class_id` and scoping either half would have broken inviting or hidden every new invite. **G3a fixed both invite paths, so they can finally be scoped.**

Propose it as `supabase/gate-3b-policies.sql`, with a `supabase/gate-3b-revert.sql` delivered at the same time, as you did for G2 and G3a. **Same ordering hazard as G3a: the code ships first, the SQL runs after the deploy is live**, and say what breaks if I run it early.

`public.is_instructor()` becomes dead once these two are scoped. **Do not drop it in this piece.** Note it in PROJECT_STATE as a G4 or later cleanup, so the removal happens when nothing can still be referencing it.

## Out of scope

- **No super admin, no cascade delete, no export.** That is G4. This means that after G3b I can see only my own class, with no override. That is expected.
- **No Storage policy change.** Instructor playback is scoped in the route.
- **No `not null` on `class_id`.** It is now true of every row, but making it a constraint is a separate cleanup after this piece is proven.
- **Do not drop `is_instructor()`.**
- No change to the student surface. Students were scoped by G3a's policies and nothing here should touch them.

## Standing conventions

- Present your PLAN first (the shared guard, both helpers, the three pages, the eleven routes, the two policies, and anything you disagree with) and WAIT for my approval before writing code.
- Every schema touch is additive and proposed for my approval before I run it. Walk me through the Supabase clicks.
- Destructive or write operations run server-side with the service-role key, never in the browser.
- Test on the deployed URL relii.vercel.app, not localhost. Commits AND pushes stay manual.
- **Do not mark PROJECT_STATE done before the SQL has run and I have confirmed the click-through.** You have made that call yourself twice and it was right both times.
- No em or en dashes in any file or content.

## Testing

**The honest problem with this piece: with one instructor, correct isolation and broken isolation look identical on screen.** Everything I own is everything there is. So the click-through can only prove I did not break my own surface. **Proving the isolation itself needs a second instructor, and that is G5.**

Given that, split the testing this way and say so in your handoff.

**Half one, what the click-through CAN prove: nothing regressed.** Order it break-risks first.

1. Instructor dashboard loads, with the tiles, the assignment selector populated, and the submissions table showing rows.
2. **Roster lists my students AND me.** If the instructor section is empty, the owner half is missing.
3. A submission detail view opens, the video plays, and all three downloads work. This is the helper that changed most.
4. Manage Assignments lists assignments, the create dropdown is populated, create and edit both still work.
5. Invite one person, and bulk invite by CSV. Both must still work after the two policies are scoped.
6. The AI Persona Framework: the generations list, the compare view, a full generate, and a discard.
7. Student surface untouched: dashboard, a full role-play, a results page with rubric categories intact.

**Half two, SQL I can run**, since some of this is only visible in the database:
- Every policy on the eight tables, so I can confirm the two `allowed_emails` ones now say class and nothing else regressed.
- A query showing, for my account, the class I own and the counts of students, assignments, scenarios and submissions in it. This is the baseline G5 will compare a second instructor against.

**Half three, what you should hand to G5 rather than test now.** List the specific things that can only be proven with a second instructor account, so G5 has a test matrix rather than a blank page. At minimum: reading another class's submission by id, downloading another class's recording, acting on another class's scenario through each scaffold route, and seeing another class's students on the Roster or the dashboard.
