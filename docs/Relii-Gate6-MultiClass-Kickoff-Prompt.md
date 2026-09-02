# Gate 6: Multiple Classes Per Instructor (CC Kickoff)

**Before you plan, tell me the filename and the line count of the prompt you just read.** This document lives in the repo rather than being pasted in, so a stale copy after a /clear is a real possibility and one line rules it out.

You are building **Gate 6**, and it comes BEFORE G5. Read PROJECT_STATE.md first. Follow plan-first discipline: read, verify, present a plan, and WAIT for my approval before writing code.

## Why this piece exists, and why it jumps ahead of G5

An instructor must be able to hold several classes, each with its own roster, **before Tom's students arrive the week of September 7.** Five instructors with multiple sections each is the shape of a university course, and one class per instructor makes Relii far less valuable.

**G5 exists to CERTIFY the isolation model. This piece rewrites `getInstructorClassId()` and touches every surface G3b scoped, so a G5 pass earned against the single-class model is void the moment this ships.** Certify the model that actually ships. You suggested the opposite order and you were right under your own assumption, which was that multi-class was a later-semester "when, not if". The timing ruling is what flips it.

## The two rulings, and what they settle

1. **An instructor may own many classes.**
2. **A student is in exactly ONE class at a time.**

Ruling 2 dissolves what you named as the real blocker. **`allowed_emails.email` STAYS a primary key**: one address, one invite, one class. No composite key, no signup-rule change. **There is no schema change in this piece at all.** G1 built `classes` and `class_members` to allow this deliberately, and `instructs_class()` already answers "any class this instructor owns", so the RLS layer is multi-class correct today. If your plan proposes a migration, make the case for it explicitly, because I am not expecting one.

## What the audit found, and this is the part that decides the piece

**1. THE PICKER TURNS A DERIVED VALUE INTO A CLIENT-SUPPLIED ONE. THIS IS THE HEADLINE HAZARD.**

`getInstructorClassId()` (lib/instructor-auth.ts line 66) reads `classes` by `instructor_id`, so today the answer is derived from the signed-in user and cannot be influenced from the browser. A remembered selection changes that: whatever carries it, a cookie included, is **editable by the person holding it.**

**Every read of that stored selection must be verified against `classes.instructor_id` server-side, on every call, not merely at the moment it is set.** Without that check, a hand-edited value points every scoped read and every write on the instructor surface at another instructor's class, which undoes five gate pieces in one line. Fall back to the oldest owned class when the stored value is absent, unparseable, or not theirs. Fail closed, and log the refusal the way `refuseOutsideClass()` does.

**2. TWO PAGES ARE SCOPED BY POLICY ALONE, AND POLICY STOPS MEANING "THE WORKING CLASS".**

G3b's own comment on app/instructor/assignments/page.tsx says it changed nothing there because both reads use the ordinary client and Gate 3a's rules scope them. **That reasoning holds for security and breaks for correctness the moment an instructor owns two classes**, because `can_read_class()` returns rows from ALL of them.

- **app/instructor/assignments/page.tsx line 48**, the enabled-scenarios dropdown, will offer scenarios from every class the instructor owns, while `classId` handed to `CreateAssignmentForm` (line 123, used at components/create-assignment-form.tsx line 145) is the working class. **Picking a scenario from the other class produces an assignment whose `class_id` and `scenario_id` disagree, which `assignments_scenario_same_class_fkey` refuses at the database.** The form reports "Could not create the assignment. Please try again." That is a guaranteed, reproducible failure with a message that says nothing, and G4a added that constraint precisely so this could not be a silent success.
- **app/instructor/assignments/page.tsx lines 55 and 66** list assignments filtered by `.eq("created_by", user.id)` and by nothing else. **That filter is an AUTHORSHIP filter, not a class filter**, so under multi-class Manage Assignments shows an instructor every assignment they ever created across all of their classes, regardless of what the picker says. Correctness rather than security, the same shape as the other three.
- **app/instructor/page.tsx line 144**, the dashboard selector, has the same shape: the selector lists assignments across all their classes while `students` and `enrolledCount` (line 126) come from the working class only. Choose an assignment from the other class and the table renders "Unknown student" against real submissions.

**Say in your plan what each of these four reads becomes.** They are the reason this piece is not just a picker.

**3. `classes` AND `class_members` HAVE RLS ON WITH NO POLICIES** (supabase/gate-1-class-spine.sql lines 83 and 84). A browser read returns zero rows for everybody and a browser insert is refused. **So the class list, class create and class rename are all server-side with the service-role key.** This is the same trap G3b named on the instructor side and app/student/page.tsx line 159 names on the student side.

**4. `classes` CARRIES `unique (instructor_id, name)`** (gate-1 line 43). Create and rename both have a realistic collision, and the signup trigger already writes "<localpart>'s Class" for everyone. **A raw duplicate-key error is not an acceptable message**, and G4a spent part of a piece making exactly that class of failure legible.

**5. THERE ARE NO SERVER ACTIONS IN THIS CODEBASE** (no `"use server"` anywhere) **and cookies cannot be set from a Server Component** (lib/supabase/server.ts says so in its own catch block). So the selection is set through a route or a client write plus `router.refresh()`, following the existing form-and-route pattern. Propose which and why.

## The five items

**1. Class create and rename.** Nothing in the app creates a class today except the signup trigger; the only other paths are the super admin's delete and reassign. Decide where this lives and tell me why: a section on Roster, its own destination, or attached to the picker.

**2. The picker and the remembered selection.** The instructor's working class, visible on every instructor page, most likely in the shared layout beside the nav. **An instructor with one class should see something honest and quiet rather than a control that does nothing.**

**3. The working-class pass over the scoped surface.** The full list, verified: **nine pages under app/instructor plus the layout**, **eleven API routes calling `requireInstructorRequest()`**, **three download routes reaching it through `lib/instructor-submission.ts` line 85**, and the loaders in lib/scaffold-candidates.ts. Most of it is mechanical, and the compiler finds it if the class id stays a required parameter, exactly as the scaffold loaders were in G3b. **The four reads in finding 2 are the ones that need judgment rather than a parameter.**

**4. An add-existing-student-to-a-class route.** Membership is only ever written by the signup trigger and the G3a repair backfill. **That gap is what made an orphaned student unrecoverable and drove the G4b account-delete ruling**, so closing it is part of this piece rather than a nicety.

**5. Close the instructor-invite hole. This is a ruling, not a question.**

**An ordinary instructor may no longer invite another INSTRUCTOR.** Since G4b, adding an instructor is a super admin operation, and Invite Users is a second path to the same privileged action that bypasses the SA entirely. It is small, and this piece is already in the invite paths.

- **Remove the Instructor option from the role dropdown** in components/add-email-form.tsx (lines 135 to 141). **A super admin keeps it.** The page can hand that down without a new query: app/instructor/invites/page.tsx already calls `requireInstructor()`, which returns `profile.is_super_admin`.
- **The bulk-invite path must refuse `role = instructor` from a non-super-admin on the SERVER**, with a message naming the administrator as the next step, in the same spirit as G4a's invite rewrites. **Two things to know before you plan it.** `classifyRows()` in lib/bulk-invite.ts (line 154) is a pure function that does not know who is calling, so the caller's status has to reach it or the check has to sit in the route. And **`requireInstructorRequest()` in lib/class-scope.ts selects only `role, email`**, so `is_super_admin` is not on the request gate today. Say which of the two you are changing and why.
- **The CSV instructions in components/bulk-invite-form.tsx line 74 say "Role must be student or instructor."** That sentence becomes false for most readers. Fix the copy in the same sitting: a UI that removes an option while the instructions still offer it is the drift this project has been bitten by.
- **Do not weaken the existing global invite reads.** The dedup and the "has this email registered" check are two of the four deliberately global fact checks at the top of lib/class-scope.ts.

## THREE THINGS I WANT YOUR PROPOSAL ON, NOT A GUESS

**A. What happens when an instructor opens a URL belonging to another of THEIR OWN classes?** A submission id, a candidate id, a compare group. Today `refuseOutsideClass()` answers 404 and hides whether the row exists, which is right for a stranger and wrong for the owner. Auto-switching the working class is one answer, an explicit "this is in your other class, switch to it" is another, and 404 is a third. **The 404 wording was deliberately chosen to leak nothing across instructors, so whatever you propose must not weaken that for a genuine stranger.**

**B. Does the add-student route MOVE a student, or refuse when they already belong to a class?** Ruling 2 says one class at a time, and `class_members` is keyed `(class_id, user_id)`, so **the schema permits two and the policy does not.** G4b already added a clause refusing to delete an account that belongs to another class, on the grounds that a convention in front of a destructive operation is the odd one out after G4a. **If this route moves a student, `allowed_emails.class_id` has to move with them**, or the Roster's pending list, the G4b cascade delete and the export all disagree about which class that person is in.

**C. The super admin reassign guard.** app/api/admin/class/[id]/reassign/route.ts refuses unless the receiving instructor's own class is empty, and its comment says why: **the oldest-class bug that this piece removes.** Once a picker exists, that reason is gone. **Surface this in your plan and tell me what you recommend. Do not silently relax it**, and note that the "empty class is deleted in the same operation" half exists to keep the receiving instructor at exactly one class, which is no longer a property worth preserving.

## Out of scope

- **No schema change**, per the rulings above. Argue for one if you believe it is needed.
- **No RLS policy change.** `instructs_class()` and `can_read_class()` are already multi-class correct.
- **No change to the four deliberately global reads** written out at the top of lib/class-scope.ts. The listing is scoped, the fact check is not, and every one of those four is a fact check whose constraint is genuinely global.
- **No student-side change.** A student is in one class and sees what they saw.
- No change to the super admin section's own reads, which are cross-tenant by design. Item C is a guard, not a read.

## Standing conventions

- **THIS PIECE HAS NO SQL, AND THAT CHANGES TWO THINGS.** First, **the usual hard stop does not fire**: there is no migration to propose, so nothing waits on me running SQL in Cursor, and the run order is simply build, then push, then I click through. If your plan concludes a migration IS needed, stop and say so, because that reverses this. Second, **every gate piece so far shipped a migration, a revert and a tests file, and G6 can ship none of them.** Tell me in your plan what the verification artifact is instead, and remember that G5 runs next and needs something to test against. A piece with no SQL is not a piece with no proof.
- Present your PLAN first (the ownership check on the stored selection, the three policy-scoped reads, where create and rename live, the picker mechanism, the add-student route, and all three design questions) and WAIT for my approval before writing code.
- Test on the deployed URL relii.vercel.app, not localhost. Commits AND pushes stay manual and you perform them.
- **Do not mark PROJECT_STATE done before I have confirmed the click-through.**
- **Verify at the layer that consumes the thing, not just the layer you changed.** That was G4a's lesson, and finding 2 above is the same lesson: the policy layer was correct and the page layer was not.
- **PROJECT_STATE Open Issues carries a standing check that this piece inverts**: `select instructor_id, count(*) from public.classes group by instructor_id having count(*) > 1;` is documented as a check that should always return no rows. After this ships it returns rows as normal operation. **Update that entry, or the next session reads a working feature as corruption.**
- No em or en dashes in any file or content.

## Testing

**Half one, what I can run in SQL:** an instructor owns two classes, each class's rows carry their own `class_id`, and no row moved between classes.

**Half two, the click-through, and the first four items are the ones that matter:**
1. **Create a second class, then create an assignment in it, choosing a scenario from the picker's dropdown.** It must save. This is finding 2, and it is the failure most likely to reach Tom.
2. **Switch classes and confirm the dashboard tiles, the student names, Manage Assignments, the Roster, the invite list and the scaffolding all change together.** A surface that does not follow the picker is a surface that was missed.
3. **Edit the stored selection by hand to a class you do not own, then load every instructor page.** Every one must fall back or refuse, and none may render another instructor's data. **This is the test that certifies the picker did not reopen the gate.**
4. **Invite a student while working in class B and confirm they land in class B**, not in the oldest class.
5. **Confirm an ordinary instructor cannot invite an instructor by either path**: the dropdown offers no such option, and a CSV row carrying `instructor` is refused by the server with a message that says what to do. **Then confirm a super admin still can.** Test the CSV path by posting the row directly, not only through the form, since the point of the ruling is that the server holds the rule.
6. Add an already-registered student to a class through the new route, then confirm the Roster, the export and the account-delete guard all agree about where that student is.
7. The second instructor account still sees only its own classes throughout.

**Half three:** what this hands G5, in the same form as G3b, G4a and G4b. **G5's matrix grows rather than shrinks**, because a second class under one instructor is a new isolation boundary that did not exist when those twenty-three items were written. **Say which existing items now need running twice, and what new items this piece creates.**
