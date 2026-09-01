# Gate 4b: The Super Admin and the Export-First Delete (CC Kickoff)

**Before you plan, tell me the filename and the line count of the prompt you just read.** This document lives in the repo rather than being pasted in, so a stale copy after a /clear is a real possibility and one line rules it out.

You are building **Gate 4b**, the last build piece of the isolation gate. Read PROJECT_STATE.md first, and read the handoff notes at the bottom of `supabase/gate-4a-tests.sql`, which were written for this piece. Follow plan-first discipline: read, verify, present a plan, and WAIT for my approval before writing code. This piece proposes SQL, so you will present it and STOP for my approval before I run it.

## Where the gate stands

G1 built the class spine. G2 scoped six policies and closed the persona leak at the column level. G3a made every write set a class. G3b scoped every read and closed the recordings hole. G4a locked the model down with `not null`, three same-class constraints, and dropped `is_instructor()`.

**G4b is the last build piece. G5 is isolation testing, and its second instructor account already exists and works.**

## What G4a hands you, so you do not re-derive it

- **Every row provably carries a class.** No "what about rows with no class" branch, no orphan sweep.
- **The delete order is forced by `on delete restrict`, and getting it wrong fails loudly rather than quietly:** sessions, then assignments, then scenarios, then rubrics, then `allowed_emails` and `class_members`, then the class row.
- **`public.is_instructor()` is gone.** If you need an "is this person any kind of instructor" check, **write a new function for that purpose. Do not resurrect that name.** Its whole problem was answering "any instructor" where the caller meant "this instructor", and reviving it invites that confusion into a brand new surface.

## The four items

**1. How a super admin is identified. This is decided: a boolean flag on `profiles`, leaving `role` alone.**

Three reasons, and put them in the code comment so nobody later reads this as the rejected option:
- It avoids altering the `role` check constraint on both `profiles` and `allowed_emails`, and avoids reasoning about a user the signup trigger gives no class to and whom `requireInstructor()` would redirect to the student page.
- The owner is already an instructor owning a class full of historical data. A third role would orphan it.
- **Locked decision 3 rejected "SA is an instructor who sees everything" on ARCHITECTURAL grounds**, meaning the exception threaded through every instructor policy. A flag that only gates a separate read-only section does not do that. **Say so explicitly.**

If you think the flag is wrong, make the case in your plan before building.

**2. The super admin section: separate, read-only across tenants.** Lists every instructor, their classes, and their students. **Read-only for student data.** It must not reach into any instructor query: the whole point of locked decision 3 is that SA logic stays out of the instructor surface, which is where isolation bugs come from.

**3. Instructor add and remove.** Add is straightforward. **Remove is the hard one, and see item 4.**

**4. The export-first cascade delete.**

## THE THING THIS PIECE MUST GET RIGHT, and it is the G4a lesson applied

**"Export first" must be enforced on the SERVER, not by the UI.**

If the export is a button the page requires you to click before it enables the confirm field, then "export first" is **a convention enforced by nothing**, precisely the class of bug we deleted in G4a rather than documented. A crafted request skips it, and the failure destroys graded student work.

**The server issues something on export, and the delete refuses without it.** A one-time token tied to that class and that export is the shape I expect. Propose the exact mechanism, including what happens if the class changes between export and delete: **an export that no longer describes what is about to be destroyed is worse than no export**, because it is a record of the wrong thing.

**Other requirements on the delete:**

- **Storage first, before any row.** `app/api/instructor/delete-student/route.ts` is the precedent and its comment says why: never leave a recording whose owning row is already gone. **The recordings are the one irreplaceable thing in this system.**
- **A typed confirm, enforced server-side**, following the `CONFIRM_WORD` pattern in `app/api/instructor/scaffold/discard-all/route.ts`. **Use a distinct word.** `DELETE` and `DISCARD` are both taken, and the reason `DISCARD` exists at all is documented: so muscle memory from one confirm cannot fire another. This is the most destructive operation in the app and deserves its own word.
- **The export carries the audit logs.** `submission_resets` and `assignment_deletes` require a class and have no link to one, so they survive a class delete pointing at an id that no longer exists. That is the log working as designed. **Include them: the point of export-first is that unrecoverable deletion of graded work with no record is the mistake worth engineering against, and those logs are the record of what was already destroyed in that class.** Then decide and tell me whether the delete removes them afterwards or leaves them, and why.

## TWO DESIGN QUESTIONS I WANT YOUR PROPOSAL ON, NOT A GUESS

**A. What happens to the students in a deleted class?**

My lean, argue with it if you disagree: **remove their `class_members` rows, do NOT delete their accounts.** A student account is a person, not the instructor's property, and a student could be added to another class later. Orphaned is recoverable; deleted is not. **But an orphaned student sees an empty dashboard with no explanation**, so the SA section should surface them as a visible state rather than letting them become invisible. Say how.

**B. Does removing an instructor have to destroy their class at all?**

**`on update restrict` blocks moving content between classes table by table, but handing a class to a DIFFERENT INSTRUCTOR changes only `classes.instructor_id` and no `class_id` at all, so it is not blocked.** That means reassignment is a one-column update that destroys nothing.

**If an instructor leaves and their students still need their work, reassigning the class is obviously better than deleting it.** So consider whether instructor remove should offer reassign as the first option and the cascade delete as the last resort, rather than the cascade being the only path. The export-first delete still has to exist, because someone eventually needs it. But it may not be the common case, and building it as the only answer would make it one.

## Out of scope

- No change to any instructor-facing read or write scoping. G3a and G3b own that and it is done.
- No new RLS policy on the instructor surface. If the SA section needs its own rules on `classes` or `class_members`, propose them, but keep them out of the instructor policies.
- No Storage policy change. The SA reads recordings through the server, as instructors do.
- No `role` check constraint change, per item 1.
- **Do not resurrect `is_instructor()`.**

## Standing conventions

- Present your PLAN first (the flag and its migration, the SA section's shape, add and remove, the delete mechanism including the server-side export enforcement, both design questions, and anything you disagree with) and WAIT for my approval before writing code.
- Every schema touch is proposed for my approval before I run it. Walk me through the Supabase clicks.
- Destructive or write operations run server-side with the service-role key, never in the browser.
- Test on the deployed URL relii.vercel.app, not localhost. Commits AND pushes stay manual, and I perform them.
- **Do not mark PROJECT_STATE done before the SQL has run and I have confirmed the click-through.** You have made that call yourself four times and it was right each time.
- **Verify at the layer that consumes the thing, not just the layer you changed.** That was G4a's lesson and this piece has the same shape of risk: a cascade delete that is correct in SQL and wrong through the API destroys data instead of refusing.
- No em or en dashes in any file or content.

## Testing

**THE FIRST RULE OF TESTING THIS PIECE: NEVER RUN THE CASCADE DELETE AGAINST REAL DATA.**

Build a throwaway instructor with a throwaway class, its own scenario, assignment, student and at least one submission with a recording, and delete THAT. The historical class holds every piece of demo content and every recording this project has made, and it is what Tom sees. **Say in your handoff exactly how I create that throwaway set, step by step, before the delete is tested at all.**

**Half one, SQL I can run:**
- The flag exists and is set on exactly the accounts intended.
- After a throwaway delete: zero rows remain in every one of the seven tables for that class, and zero Storage objects remain for its students.
- **`gate-4a-tests.sql` query 5 still passes**, before and after. Its own note says it is the property this piece is built on: if delete protection stops working, the cascade destroys student work instead of refusing, and **the failure looks like success.**

**Half two, the click-through:**
1. The SA section lists every instructor, class and student across both accounts.
2. **An instructor account cannot see the SA section**, and a student cannot either. Check both.
3. Add an instructor, then remove one, using whichever paths you build for question B.
4. **Attempt the delete without a valid export token, by whatever means a crafted request would use.** It must refuse. This is the single most important test in the piece.
5. Export, confirm the CSV contains every row that is about to be destroyed, then complete the delete with the typed word.
6. The instructor surface, the student surface and every download still work afterwards for the class that was NOT deleted.

**Half three:** what this hands to G5, in the same form as G3b and G4a.
