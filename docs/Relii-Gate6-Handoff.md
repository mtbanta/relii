# Gate 6 handoff: multiple classes per instructor

This is the run order, the click-through and the crafted requests for Gate 6. It
follows the shape of `docs/Relii-Gate4b-Handoff.md`.

## Run order, and it is shorter than every other gate piece

**There is no SQL to run.** Gate 6 needs no schema change and no policy change:
Gate 1 built `classes` and `class_members` to allow several classes per
instructor deliberately, and `public.instructs_class()` has always answered "any
class this instructor owns". So the usual hard stop does not apply.

1. **Push.** The deploy is the whole migration.
2. **Confirm it is live** on relii.vercel.app.
3. **Run `supabase/gate-6-checks.sql` queries 2 and 8 first**, before touching
   anything, and keep query 2's output. It is the "before" picture that makes
   "no row moved between classes" checkable at the end.
4. **Click through the eight items below.**
5. **Run every query in `supabase/gate-6-checks.sql`.**

**Nothing here is destructive and nothing is hard to undo.** Creating a class
adds a row. Renaming changes a label. The only operation that moves anything is
"add an existing student", and it refuses to move anybody who has done work.

## What changes on screen the moment this is live

- **A "Working in" line appears under the nav on every instructor page.** With
  one class it is a plain label, not a dropdown. That is deliberate: a dropdown
  with one option is a control that does nothing.
- **The Roster gains two sections**: "Your classes" (rename this one, create
  another) at the top, and "Add an existing student" under the student list.
- **Manage Assignments lists the class's assignments rather than the ones you
  personally created.** With one instructor and one class that is the same list,
  with one exception worth knowing: if a class was ever handed over, its
  assignments were created by the previous owner and were invisible here. They
  will now appear. That is the fix, not a bug.
- **Invite Users no longer offers the Instructor role** unless you are a super
  admin, and the CSV instructions say so too.

## The click-through, in order. The first four are the ones that matter.

### 1. Create a second class, then create an assignment in it

This is the failure most likely to reach Tom, so it goes first.

1. Roster, "Your classes", **Create another class**. Call it something you will
   recognise, for example "Gate 6 Test Section".
2. You are now working in it (the picker at the top says so).
3. Go to **AI Persona Framework** and generate a persona in this new class, then
   choose a winner so there is an enabled scenario to assign. (A brand new class
   has no scenarios at all, which is correct: locked decision 3 says a new class
   starts empty.)
4. Go to **Manage Assignments** and create an assignment, **picking the scenario
   from the dropdown**.

**It must save.** If it fails with "Could not create the assignment. Please try
again.", the scenario dropdown is offering scenarios from your other class and
`assignments_scenario_same_class_fkey` is refusing the insert. That is the exact
bug this piece exists to prevent.

**Also confirm the dropdown does NOT list Alex or Jordan**, which live in the
historical class. Their absence here is the scoping working.

### 2. Switch classes and confirm everything moves together

Switch the picker back and forth and check every one of these changes with it:

- Submissions: the Active Assignments dropdown, the three tiles, the table.
- Manage Assignments: both the scenario dropdown and the Published Assignments
  list.
- Roster: registered students, pending invites, and the "Your classes" count.
- Invite Users: invite someone here and confirm in item 4 that they landed in the
  right class.
- AI Persona Framework: Recent generations.

**A surface that does not follow the picker is a surface that was missed.**

### 3. Edit the stored selection by hand. This is the test that certifies the piece.

The working class is remembered in a cookie called `relii_working_class`. It is
httpOnly, so no page script can touch it, but you can edit it yourself, which is
exactly why the server re-checks it on every request.

**In Safari:** Develop menu, Show Web Inspector, **Storage** tab, **Cookies**,
`relii.vercel.app`. Find `relii_working_class` and double-click its **Value**.

Do all three of these, and after each one **load every instructor page**
(Submissions, AI Persona Framework, Manage Assignments, Roster, Invite Users):

1. **Paste a class id you do not own.** Get one from `select id, name from
   public.classes;` in Supabase, picking a class belonging to the other
   instructor account. Every page must fall back to your own oldest class. **None
   may show another instructor's data.**
2. **Paste nonsense**, for example `not-a-uuid`. Same expectation.
3. **Delete the cookie entirely.** Same expectation. This is also the state every
   instructor is in on their first page load after the deploy, so it has to be
   the ordinary one.

Each refusal writes a line to the Vercel function log beginning
`Gate 6 refused a stored class selection`. Seeing them is confirmation, not a
problem.

### 4. Invite a student while working in class B

Invite an address from Invite Users while the picker says the new class, then
check the Roster's pending list under that class and confirm the invite is NOT on
the other class's Roster. Query 2 of the checks file shows the same thing as a
number.

### 5. Confirm an ordinary instructor cannot invite an instructor, by either path

**On screen:** Invite Users offers no role dropdown at all for an ordinary
instructor, and says "Invites are sent to students. Adding an instructor is an
administrator action."

**By CSV through the form:** upload a file containing

```
email,role
gate6-instructor-test@example.com,instructor
```

It must be skipped with the reason **"Only an administrator can invite an
instructor"**, in the skipped list, while any student rows in the same file
are still added. That partial success is the point.

**By posting directly, which is what actually tests the rule.** The two snippets
below are written as promise chains rather than `const x = await ...`, because
Safari's console reads `await` on the right of a declaration as a variable name
and stops with "Unexpected identifier". Paste each into the console while signed
in as an ordinary instructor on relii.vercel.app.

**Request A, the single-invite route:**

```js
fetch("/api/instructor/invite", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "gate6-a@example.com", role: "instructor" })
}).then(function (r) {
  return r.json().then(function (b) { console.log(r.status, b); });
});
```

**Expected: 403**, with "Only an administrator can invite an instructor. Ask your
administrator to add them." **A 200 here is a failure of the whole ruling**, and
it is the reason this route exists: before Gate 6 this write went straight from
the browser through the security rules, which check the class and say nothing at
all about the role.

**Request B, the bulk route:**

```js
fetch("/api/instructor/bulk-invite", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ csv: "gate6-b@example.com,instructor" })
}).then(function (r) {
  return r.json().then(function (b) { console.log(r.status, b); });
});
```

**Expected: 200 with `addedCount: 0` and one skipped row** reading "Only an
administrator can invite an instructor". A 200 that ADDED the row is the failure.

**Then sign in as the super admin and run both again.** Request A must return 200
and request B must add the row. Un-invite both from the Roster afterwards.

### 6. Add an already-registered student to a class

**Set up the throwaway in the HISTORICAL class, not the new one.** The order
matters and it is easy to get stuck here: step 6.4 needs that student to do a
role-play, and a brand new class has no assignments and no enabled scenarios at
all, so there would be nothing for them to do. The historical class has Alex and
Jordan.

1. **Switch the picker to your historical class** and invite a throwaway address
   from Invite Users (a "+" alias of your own inbox works, as in Gate 4b).
2. **Register it and stop there.** Do not start a practice yet.
3. **Switch the picker to the new class**, Roster, **Add an existing student**,
   type their address, add. It must say they moved.
4. Confirm the Roster lists them here and no longer lists them on the historical
   class's Roster, then run **queries 4 and 5** of the checks file. Both must
   return no rows: query 4 proves they are in exactly one class, query 5 proves
   their invite row followed them.
5. **Move them back** to the historical class the same way, so they have
   something to work on.
6. **Now confirm the refusal.** Sign in as that student and complete one
   practice on Alex, then, as the instructor working in the new class, try to add
   them again. **It must refuse**, naming how many role-plays they have done.
   That refusal is the ruling: their sessions stay in the historical class, and
   the student results page reads both the scenario (line 61) and the RUBRIC
   (line 107) through the security rules, so moving them would leave their own
   results page with a blank title and scores with no item labels beside them.
7. Try to add a student who belongs to the **other instructor's** class. It must
   refuse and point at the administrator, and must not name the other instructor.

**If a move ever half-completes** (the route says the student is now in this
class but their invite record did not follow, or that they may be in no class),
**just run it again.** The route is written so that re-running finishes the job,
and query 5 is what finds a half-done move afterwards.

### 7. The second instructor account still sees only its own classes

Sign in as `instructor@test.com` and confirm the picker shows only their class,
and that none of your new classes appears anywhere on their surface.

### 8. The reassign relaxation, from the Administration section

This is the guard Gate 6 deliberately relaxed, so it is worth exercising.

1. As the super admin, open a class in Administration and check the "New owner"
   list. **Instructors who already own a class are now offered**, where before
   only an instructor with an empty class was.
2. Hand a throwaway class to an instructor who already owns one.
3. Sign in as that instructor. **Their own content must still be there**, and the
   picker must now list both classes. Before this piece, receiving a second class
   would have silently hidden one of them, which is exactly why the old guard
   existed.
4. **The name clash.** Rename two classes owned by two different instructors to
   the same name, then try to hand one to the other. It must refuse with a
   message naming the clash and telling you to rename one first, **not** a raw
   duplicate-key error.
5. **The donor, and this is the one fallback path a real person will actually
   hit.** Hand away the class the donor was working in, then sign in as them.
   Their remembered selection now names a class they no longer own, so **every
   page must fall back to their own oldest remaining class**, with the picker
   showing that class and a `Gate 6 refused a stored class selection` line in the
   Vercel function log. It is the same code path as the tampered cookie in step
   3, reached honestly. If they now own no class at all, they are the known
   class-less dead-end account and the Administration overview says so.

## After the click-through

Run every query in `supabase/gate-6-checks.sql` and compare query 2 against the
copy you kept at step 3 of the run order. **New rows in the new class, no row
moved out of an existing one.**

Query 1 now returns rows, and that is the feature working. It used to be
documented as a corruption signal.
