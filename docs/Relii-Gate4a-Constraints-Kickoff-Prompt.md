# Gate 4a: Lock the Class Model Down (CC Kickoff)

**Before you plan, tell me the filename and the line count of the prompt you just read.** This document lives in the repo rather than being pasted in, so a stale copy after a /clear is a real possibility and one line rules it out.

You are building **Gate 4a** of the Relii post-demo plan. Read PROJECT_STATE.md first. Follow plan-first discipline: read, verify, present a plan, and WAIT for my approval before writing code. This piece is mostly SQL, so you will present it and STOP for my approval before I run it.

## Where the gate stands, and why G4 is split

G1 built the class spine, G2 rewrote the policies and closed the persona leak at the column level, G3a made every write set a class, G3b scoped every read. **The isolation gate's code is complete.** What remains is G4 and G5.

**G4 was scoped as one piece and has been split**, because it carries two different kinds of work and one of them is irreversible:

- **G4a, this piece: harden what already exists.** Four items, all schema plus two strings. No new UI, no new surface.
- G4b: the super admin section, instructor add and remove, and the export-first cascade delete.
- G5: isolation testing with the second instructor account, which already exists and works.

**G4a goes first for a reason worth knowing:** it makes every row provably carry a class, which is an assumption G4b's cascade delete would otherwise have to defend for itself.

## The four items

**1. `not null` on every `class_id`.** Seven columns: `rubrics`, `scenarios`, `assignments`, `sessions`, `allowed_emails`, `submission_resets`, `assignment_deletes`. Every gate piece so far has deliberately left these nullable because nothing set them yet. G3a made all nine write paths set one and repaired every existing row, so this is now safe and overdue.

**2. The same-class constraints. This is the owner's ruling from August 31**, closing a gap G3b found: nothing today prevents an assignment pointing at another class's scenario, or a scenario at another class's rubric.

| Constraint | Prevents |
| :---- | :---- |
| `assignments (scenario_id, class_id)` references `scenarios (id, class_id)` | an assignment using another class's scenario |
| `scenarios (rubric_id, class_id)` references `rubrics (id, class_id)` | a scenario scored by another class's rubric |
| `sessions (scenario_id, class_id)` references `scenarios (id, class_id)` | a session whose class disagrees with its scenario |

Composite foreign keys need a unique constraint on the pair they reference, so **add `unique (id, class_id)` to `rubrics` and `scenarios` first.** It is redundant against the primary key and Postgres requires it anyway. Say so in the comment or it reads as a mistake.

**3. Drop `public.is_instructor()`.** G3b scoped the last two policies that used it. It is now called by no policy, no function and no code. **Verify that yourself before dropping it** rather than taking the previous session's word.

**4. Two copy fixes, and they are the owner's second ruling.** `allowed_emails.email` stays a primary key: an address belongs to exactly one instructor's invite list, by decision.

The problem is that **the failure is now illegible.** `components/add-email-form.tsx` line 58 (on a 23505) and `lib/bulk-invite.ts` line 123 both say the address is "already on the invite list." **That was true before G3b and is misleading after it**, because the invite list is class-scoped now: instructor B is told the address is on a list they cannot see, on a Roster that does not show it. A dead end with no next action.

Reword both to say the address is already invited by another instructor, and point at the administrator as the next step. **Do not name the other instructor or class.** Leaking that an invite exists elsewhere is acceptable and necessary; without it the user cannot act.

## THE ORDERING DEPENDENCY, and getting it wrong is the worst outcome in this piece

**A composite foreign key defaults to `MATCH SIMPLE`, which skips enforcement entirely when ANY column of the key is null.**

So if item 2 lands before item 1, the three constraints exist, the migration reports success, and **they enforce nothing at all** on any row with a null `class_id`. Everyone would then believe cross-class references were prevented. That is worse than not adding them, because a wrong belief about a security constraint is exactly what this gate has spent five pieces removing.

**`not null` first, in the same file, above the constraints. Not a separate migration, not "we will do it after."**

**The same mechanic is CORRECT behaviour one line down, and you should say so** so nobody later reads it as an inconsistency. `scenarios.rubric_id` is NULLABLE: `piece-2a-conversation-only.sql` line 45 dropped its not-null so a conversation-only scenario can exist without a rubric. `MATCH SIMPLE` therefore skips the rubric constraint for exactly those scenarios, which is what we want. Same mechanic, hazard in one place and the desired behaviour in the other.

## Pre-flights, both of which must refuse to run

Model them on G2 section 0 and G3a section 0, which I already trust.

- **Before `not null`:** every one of the seven columns must have zero nulls. G3a should have guaranteed this, which is exactly why it must be checked rather than assumed.
- **Before the constraints:** zero existing rows violate any of the three. **The assignments-to-scenarios one is the most likely to bite**, because `assignments.class_id` came from the creating instructor while `scenarios.class_id` came from the same, but `sessions.class_id` came from the scenario. Report which rows fail and on which constraint, not just a count, because the fix differs per row.

**If a pre-flight fails, stop and show me the rows. Do not repair silently.**

## The revert, and one thing it cannot cover

Give me `supabase/gate-4a-revert.sql` alongside, as with every gate piece.

**One item is genuinely harder to reverse and I want you to say so plainly rather than pretend otherwise:** dropping `is_instructor()` is easy to undo (recreate the function), but `supabase/gate-3b-revert.sql` references it seven times, so **that revert stops working the moment this piece runs.** Decide and tell me which you recommend: delete `gate-3b-revert.sql`, or leave it with a header saying it is retired and why. My lean is to keep the file with a header, because it is also the record of what G3b changed, but make the case either way.

## Out of scope

- **No super admin, no instructor add or remove, no cascade delete, no export.** All of that is G4b.
- No read or write scoping changes. G3a and G3b own that and it is done.
- No Storage change.
- No change to the student surface.
- Do not touch the `role` check constraint on `profiles` or `allowed_emails`. **G4b decides how a super admin is identified, and that decision may or may not need it. Leave it alone here.**

## Standing conventions

- Present your PLAN first (both pre-flights, the file order, all three constraints, the `is_instructor` verification, the two reworded strings, the revert recommendation, and anything you disagree with) and WAIT for my approval before writing code.
- Every schema touch is proposed for my approval before I run it. Walk me through the Supabase clicks.
- Test on the deployed URL relii.vercel.app, not localhost. Commits AND pushes stay manual, and I perform them.
- **Do not mark PROJECT_STATE done before the SQL has run and I have confirmed the click-through.** You have made that call yourself three times and it was right each time.
- No em or en dashes in any file or content.

## Testing

**Note the ordering here, because it is the opposite of G3a's.** This piece's code change is two strings that only appear on a failure path, and the SQL is the substance. **So the SQL runs first and the code ships after**, which is this project's normal order. Say in your handoff what breaks if I run it before the deploy, since the answer this time should be nothing.

**Half one, SQL I can run:**
- Both pre-flights, run before anything.
- After the migration: all seven columns report `is_nullable = 'NO'`, the three constraints exist by name, and `is_instructor` no longer exists as a function.
- **Three deliberate violation attempts that must FAIL**, each with the error I should expect. An assignment pointing at another class's scenario, a scenario pointing at another class's rubric, and an insert with a null `class_id`. **A constraint nobody has tried to violate has not been tested**, and after the `MATCH SIMPLE` hazard above I want proof rather than a green checkmark.

**Half two, the click-through**, which should show almost nothing:

1. Create an assignment, edit it, delete an unused one.
2. Generate a persona end to end, then discard it.
3. Invite one person, and bulk invite by CSV.
4. **Invite an address that is already on the invite list, both singly and via CSV.** This is the only way to see the two reworded messages, and it is the only user-visible change in the entire piece.
5. Run a full role-play, text and voice, and open a results page.
6. Dashboard, Roster, Manage Assignments and the persona framework all load.

**Half three:** anything this piece hands to G4b or G5, in the same form you used for G3b.
