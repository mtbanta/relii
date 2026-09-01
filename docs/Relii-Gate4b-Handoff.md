# Gate 4b handoff: the super admin, and the export-first delete

Built on 2026-09-01. NOT YET RUN and NOT YET PUSHED. This file is the order to
do it in, the throwaway set to test it against, and the four crafted requests
that are the most important test in the piece.

## The order, and this piece is strict about it

1. **Run `supabase/gate-4b-super-admin.sql` in Supabase first.** SQL Editor, New
   query, paste the whole file, Run. It is safe to run twice.
2. Check its two result blocks (they are at the bottom of the file). Expect one
   flagged account, `michaeltbanta@gmail.com`, and `class_exports_policies 0`,
   `class_exports_foreign_keys 0`.
3. **Then say the word and I will push.** The deploy must not go first: the code
   adds `is_super_admin` to the profile read in `lib/instructor-auth.ts`, which
   every instructor page goes through, so a missing column would break the whole
   instructor surface rather than just the new section.

`supabase/gate-4b-revert.sql` is written and in the repo already, as with every
gate piece. Its own header carries the rollback order (roll the deploy back
first, then run it).

## Build the throwaway set before testing the delete at all

**Never run the cascade against real data.** The historical class holds every
recording this project has made and is what Tom sees.

**This must NOT be the second instructor account either.** That account is Gate
5's setup, and Gate 5 needs it to be an ordinary working instructor. The
throwaway is a **third** instructor and a **fourth** account.

Both addresses are `+` aliases of your own inbox. Gmail delivers them to you and
Supabase treats them as separate users.

1. Sign in as yourself. Instructor nav, **Administration**, then **Add
   instructor**: `michaeltbanta+throwaway-instructor@gmail.com`.
2. Sign out. Go to `relii.vercel.app/register`, register that address, set a
   password, and enter a first and last name at the gate. They now own
   "michaeltbanta+throwaway-instructor's Class".
3. Still as the throwaway instructor: **AI Persona Framework**, describe any
   case, generate a pair, and choose a winner. That gives the class a persona
   and a rubric.
4. **Manage Assignments**: publish an assignment on that persona. Make its
   required mode **voice and video**, or step 7 cannot produce a recording.
5. **Invite Users**: invite `michaeltbanta+throwaway-student@gmail.com` as a
   student.
6. Sign out. Register that address the same way and enter a name.
7. **As the throwaway student, do one real graded submission with the webcam
   on**, and let it score. Budget about ten minutes: this is the step that
   cannot be faked, and without a recording in Storage the most important half
   of the delete goes untested.
8. Optional but worth it: back as the throwaway instructor, **Reset** that
   submission once. That writes a `submission_resets` row, which exercises the
   audit-log half of the export and of the "left in place on purpose" rule.

## Half one: the SQL you run

All of it is in `supabase/gate-4b-tests.sql`, read-only, one numbered query at a
time.

1. **Query 5 of `supabase/gate-4a-tests.sql`, before anything.** It is the
   delete backstop. If it ever stops passing, the cascade destroys student work
   instead of refusing, and the failure looks like success.
2. `gate-4b-tests.sql` query 1: the flag is on exactly one account.
3. Query 2: `class_exports` exists, with no policies and no foreign keys.
4. Query 3, **before the delete**: the inventory of the throwaway class. Keep
   the numbers. "sessions with a recording" must be at least 1.
5. Do the click-through below, including the delete.
6. Query 4, **after the delete**: every count 0, except the two audit logs,
   which are left in place deliberately.
7. Query 5: `files_with_no_account` must be 0. The second number is the known
   pre-existing orphan count from earlier testing; it must not grow.
8. Query 6: the export record, and the "students in no class" canary, which must
   return no rows.
9. **Query 5 of `gate-4a-tests.sql` again.** Identical pass expected.

## Half two: the click-through, on relii.vercel.app

1. As yourself: **Administration** appears in the instructor nav, and `/admin`
   lists every instructor, their class and their students, with counts.
2. **As the second instructor account**: no Administration link, and typing
   `/admin` in the address bar lands you back on Submissions. **As a student**:
   the same, landing on the student home. Check both; this is the only thing
   standing between an ordinary instructor and every class in the system.
3. Add an instructor (step 1 of the throwaway recipe already does this). Then
   remove one, and note that **Remove account** is only offered for an
   instructor who owns no class. That is the database's own rule
   (`classes.instructor_id` is `on delete restrict`) said out loud rather than
   hidden.
4. **The crafted requests, below.** The single most important test in the piece,
   and the deletion itself happens in the middle of that sequence rather than
   here, so that the refusal tests run against a class that still exists.
5. **Export, and read the file.** However you do the deletion (the panel button
   or the console), open the CSV first and confirm it holds every row about to
   be destroyed: students, invites, rubric, persona, assignment, sessions with
   their transcripts and scores, the recording list, and the audit rows. Also
   read the warning block at the top, which says the recordings themselves are
   not in the file. Then complete the delete with the typed word `REMOVE`.
   **Open the panel at least once** even if you delete from the console, to see
   that the confirm step stays unavailable until an export has been taken.
6. Afterwards: your own instructor surface, the student surface and all three
   downloads still work for the class that was not deleted. The throwaway
   student can no longer sign in, because that account is gone.

### Handing over a class instead of deleting it

Worth doing once, and it destroys nothing. Add a second throwaway instructor,
register them, and then on a class page use **Hand this class to another
instructor**. Only an instructor whose own class is empty appears in the list,
and the page says why anyone else is missing. Their empty class is removed as
part of the handover, so they end up with exactly one class.

## The four crafted requests

Sign in as yourself on `relii.vercel.app`, open the browser devtools console
(right click, Inspect, Console), and paste these one at a time. **The console
carries your session cookie automatically, which is why this is done there and
not with curl.**

> **The order below matters.** The real deletion sits in the middle of it on
> purpose: the three refusal tests before it need a class that still exists, and
> the last one needs a token that has just been spent. Running them in a
> different order does not fail, it passes for the wrong reason, which is worse.
> In particular, the substitution test cannot be run after the class is gone,
> because it would then be refused for not finding the class rather than by the
> check it exists to exercise.

Get two class ids first. Open each class from `/admin` and copy the id out of the
address bar (`/admin/class/THE-ID-IS-HERE`): the throwaway class, and your own
(the historical one).

```js
const CLASS_ID = "paste-the-throwaway-class-id-here";
const MY_CLASS_ID = "paste-your-own-class-id-here";
const del = (body) =>
  fetch(`/api/admin/class/${CLASS_ID}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json().then((j) => ({ status: r.status, ...j })));
```

**1. No token at all.** This is the crafted request that skips the export button,
and it is the one the whole mechanism exists to refuse.

```js
await del({ confirm: "REMOVE" });
```
Expect `400` and "This class has not been exported."

**2. A made-up token.**

```js
await del({ confirm: "REMOVE", token: "00000000-0000-0000-0000-000000000000" });
```
Expect `400` and "That export is not valid."

**3. A valid token issued for a DIFFERENT class.** The substitution attack, and
the reason the delete compares the token's class with the class in the address.

```js
// Export YOUR OWN class. Exporting changes nothing; it only reads and issues a token.
const other = await fetch(`/api/admin/class/${MY_CLASS_ID}/export`, { method: "POST" }).then((r) => r.json());
// Aim that token at the THROWAWAY class.
await del({ confirm: "REMOVE", token: other.token });
```
Expect `400` and "That export was taken for a different class."

> **Run it in exactly that direction and never the other way round.** A token
> from your own class aimed at the throwaway class is safe: if the check ever
> failed, the thing destroyed would be the throwaway class, which is being
> deleted anyway. A throwaway token aimed at your own class would destroy the
> historical class if the check failed. Same test, opposite consequence.

This leaves a real row in `class_exports` for your own class, with `used_at`
empty. That is expected, not an anomaly: it is an export somebody took and did
not act on, and query 6 of the tests will show it.

**4. An ordinary instructor cannot reach the route at all.** Ten seconds, and it
is the only thing standing between another instructor and every class in the
system. Sign in as the second instructor account, paste the same `del` helper,
and run:

```js
await del({ confirm: "REMOVE" });
```
Expect `403`, "Only a super admin can delete a class."

**Now do the real deletion**, back as yourself. Do it here in the console rather
than with the panel button, so the token is in a variable for test 5. This is
the same thing the panel does, which is the point: the panel has no power the
console does not.

```js
const ex = await fetch(`/api/admin/class/${CLASS_ID}/export`, { method: "POST" }).then((r) => r.json());
// Save the file before going on: this is click-through item 5, and the CSV is
// the only record of this class that will exist afterwards.
const blob = new Blob([ex.csv], { type: "text/csv" });
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = ex.filename;
a.click();

// Then, once you have opened it and checked it:
await del({ confirm: "REMOVE", token: ex.token });
```
Expect `ok: true` and a `removed` list. If you would rather use the panel button
for the deletion itself, do that instead and read the token afterwards out of
query 6 of `supabase/gate-4b-tests.sql`; test 5 needs it either way.

**5. A token that has already been used.** The replay, immediately after.

```js
await del({ confirm: "REMOVE", token: ex.token });
```
Expect `400` and "That export has already been used." (The class is gone by now,
and the token check comes first, so this is refused for the right reason.)

## What is new in the database

Two things, and nothing else: `profiles.is_super_admin` (boolean, default
false), and `public.class_exports`. No policy on any existing table, no
function, no foreign key anywhere, no change to any `role` check constraint, and
`public.is_instructor()` stays dropped.
