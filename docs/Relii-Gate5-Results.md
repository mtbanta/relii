# Gate 5: isolation testing. Runbook and results.

**This one file is both the thing you run and the record of what happened.** One
file rather than two, so the record and the run can never drift apart. Work top
to bottom and write your answer on the `ACTUAL:` line under each item as you go.

- **Date of the run:** **2026-09-04**, start to finish in one day.
- **Commit tested:** the deploy live throughout was the tree at **3958318**, whose
  last application-code change is **1982fbe, "Build Gate 6: multiple classes per
  instructor"**. Everything committed after it in this run is documentation.
- **Result: EVERY ITEM PASSED. Nothing failed, and nothing had to be fixed
  mid-run.**
- **Site:** relii.vercel.app, never localhost
- **Instructor A:** [michaeltbanta@gmail.com](mailto:michaeltbanta@gmail.com) (super admin, owns the historical
class "Relii Demo (Historical)" and a second class "Pro Selling test")
- **Instructor B:** [instructor@test.com](mailto:instructor@test.com) (ordinary instructor, owns three classes,
deliberately not a super admin)
- **Student used for the column test:** a registered student of B1, confirmed by
  S1 returning B1's own persona and nothing else.

**THE CLASS NAMES DO NOT MATCH WHO OWNS THEM, AND THIS BIT THREW THE RUN ONCE
ALREADY.** The class called **"Gate 6 Test class" belongs to instructor B**, not
to A. Gate 6's click-through item 1 was performed under B. A's two classes are
**"Relii Demo (Historical)"** and **"Pro Selling test"**. Wherever this file says
"A's second class" it means Pro Selling test, and it never means anything with
"Gate 6" in the name. Confirmed against query 2 on 2026-09-04.

## What this piece is for

Gates 1 to 4b and Gate 6 made the claim that instructors are isolated from one
another. This is where the claim gets tested rather than reasoned about. **"The
scoped surface renders" and "the other instructor cannot reach my data" are
different claims, and only the first has ever been demonstrated.** Nothing before
this has aimed a route at another class's ids.

**Nothing here is verified by reading the code.** Every item is a request you
make and an answer you observe. The code was read only to write the exact request
bodies and the exact expected wording below.

## Before you start. Read all six lines.

1. **Set the Safari console filter to "All".** Develop menu, Show Web Inspector,
  Console, then the filter buttons. With "Evaluations" and "Errors" selected, a
   `console.log` is hidden completely, so a PASSING test shows nothing on screen
   and reads as hung. That cost the Gate 6 run twice. If you see a yellow banner
   saying "There are unread messages that have been filtered", click Clear
   Filters.
2. `Promise {status: "pending"}` **is not a spinner.** Safari prints the value of
  the expression at the instant you press return and never updates it. The
   answer arrives on a separate line underneath.
3. **No snippet here puts** `await` **on the right of a** `const`**.** Safari reads that
  as a variable name and stops with "Unexpected identifier". Everything is a
   promise chain, and the helpers hang off `window` rather than being declared
   with `const`, so re-pasting a preamble never gives you "Cannot declare a
   redeclared variable".
4. **Reads run before writes, everywhere.** A read that wrongly succeeds tells
  you a guard is broken before anything is written. **If any read item fails,
   stop the run and tell CC before executing a single write item.**
5. **The anon public key is pasted at run time and is never saved to a file.**
  Supabase dashboard, Project Settings, API, "Project API keys", the `anon`
   `public` one. It is the key that already ships in every page load. **The
   service role key is not used anywhere in this run.**
6. **Do not delete instructor B or any of its classes.** B is the account this
  piece certifies with and it stays afterwards.



## What you build before step 0, and what consumes each piece

B owns three classes and all three are empty. Below, **B1, B2 and B3 are B's
classes oldest first**, which query 0.1 tells you. B1 and B2 need content. B3
stays empty on purpose.

**B1 (oldest). The main class.**


| Build                                           | The item that consumes it                          |
| ----------------------------------------------- | -------------------------------------------------- |
| 2 registered students                           | 8 (Roster), 9 (enrolled reads 2), the picker sweep |
| 1 pending invite, never registered              | 21's positive control, 8's pending list            |
| 1 generated persona with a winner chosen        | 10, and the assignment needs it                    |
| 1 assignment on that winner                     | 9's tile, group 2's `?assignment=` panel           |
| 1 further generation left undecided (no winner) | 20 needs something discardable                     |
| 2 short text practices by those students        | query 2's sessions column, and item 4b             |
| optional: 1 voice and video practice            | query 2's recordings column                        |


**B2 (second oldest). Where B stands while aiming at B1.**


| Build                                                     | The item that consumes it                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| 1 registered student                                      | the sweep needs different numbers: 2 in B1, 1 in B2                 |
| 1 generated persona with a winner, and 1 assignment on it | so B2's dashboard shows a tile reading 1 rather than an empty state |
| optional: 1 pending invite                                | makes the pending list visibly change on the sweep                  |


**B3. Completely empty. Do not put anything in it.** It is the third state in the
sweep and it is the class the export token in step 1 is taken from.

**Two throwaway addresses on A's side, both** `+` **aliases of your own inbox:**

- **A canary pending invite in A's historical class.** Invited, never registered.
It is the target for item 14 and for the tampered-cookie write, so that even a
total guard failure destroys one row you can recreate in ten seconds.
- **The Gate 6 throwaway student**, still in A's historical class. It is the
target for item 13, so a guard failure costs a throwaway account rather than
one of the four real students. Query 0.5 tells you whether it is still there.

**Every address invited for B must not already exist anywhere**, because
`allowed_emails.email` is the primary key for the whole system. Fresh `+` aliases
avoid the collision.

**Why the mode does not matter:** no item in this matrix turns on text versus
voice. The three download routes refuse a practice by `kind` before class is ever
consulted. The one voice and video practice is worth doing only so that query 2's
`recordings` column is a real number instead of zero compared against zero.

---



# Step 0. Supabase SQL editor, before signing in anywhere

Read only. Nothing here changes anything. **Capture these ids now, because once
you are signed in as B you cannot read A's surface at all.**

## 0.1 Every class, with its owner, oldest first

```sql
select p.email        as instructor,
       c.name         as class_name,
       c.id::text     as class_id,
       c.created_at
  from public.classes c
  join public.profiles p on p.id = c.instructor_id
 order by p.email, c.created_at;
```

**EXPECT:** two classes for [michaeltbanta@gmail.com](mailto:michaeltbanta@gmail.com) (historical first, the Gate 6
class second) and three for [instructor@test.com](mailto:instructor@test.com). **The first [instructor@test.com](mailto:instructor@test.com)
row is B1, the second is B2, the third is B3.** Write the three ids down; the
cookie tamper test needs to know which is oldest.

ACTUAL, run 2026-09-04:


| instructor                                                | class                   | class_id                             | created    |
| --------------------------------------------------------- | ----------------------- | ------------------------------------ | ---------- |
| [instructor@test.com](mailto:instructor@test.com)         | B1: A demo class        | 196770e0-cdd5-4fe4-80e4-421ee6c7d13f | 2026-08-25 |
| [instructor@test.com](mailto:instructor@test.com)         | B2: Gate 6 Test class   | 1a83a9f1-fbcc-4e39-ae73-95bd43da0e8f | 2026-09-02 |
| [instructor@test.com](mailto:instructor@test.com)         | B3: The demo class      | 98859b39-79a2-4fbc-b2c8-3a9de9e50223 | 2026-09-03 |
| [michaeltbanta@gmail.com](mailto:michaeltbanta@gmail.com) | Relii Demo (Historical) | b03df6d8-8485-4d27-a712-b78d8bfc9453 | 2026-08-25 |
| [michaeltbanta@gmail.com](mailto:michaeltbanta@gmail.com) | Pro Selling test        | be13eabb-ece1-4fdd-a034-74700fe96007 | 2026-09-03 |


**B's oldest is B1**, which is the class every cookie-tamper state at 2.15 must
fall back to. **The classes carry their B1, B2 and B3 prefixes in their real
names**, so the picker itself says which one you are in and the fallback is
readable at a glance rather than inferred from the content.

**One thing that looks odd and is not.** B1 and A's historical class carry the
identical `created_at`, to the microsecond. Both were written by the same backfill
in `supabase/gate-1-class-spine.sql` on 2026-08-25. It affects nothing: the oldest
class is resolved per instructor, and each instructor's own timestamps are
distinct from each other.

## 0.2 The "before" picture

Run **query 2 of** `supabase/gate-6-checks.sql` and keep the output. It is what
"no row moved between classes" is checked against at the end.

**THE SETUP CHECK, AND IT CAME BACK 0. This is what it exists to catch.** A's
second class has **no assignment and no persona**, so **the dashboard's enrolled
tile does not render there at all** (`app/instructor/page.tsx` short-circuits to
"No assignments yet" when the class has no assignment). The kickoff's 4-and-1
expectation therefore cannot be read off A's tiles.

**THE RULING, 2026-09-04: nothing is built in A's second class.** The concrete
tile-against-Roster check moves to B, which carries it better: B1's tile must
read 2, B2's must read 1, and both Rosters must agree. A's sweep keeps a concrete
expectation of its own, and step 1.2 below now states it: **Roster 4 and then 1,
tile 4 and then the empty state.** That empty state is worth recording rather
than working around, because it shows the dashboard following the picker into a
class with nothing in it.

ACTUAL, run 2026-09-04:


| class                   | instructor                                                | rubrics | personas | assignments | sessions | recordings | invites | students |
| ----------------------- | --------------------------------------------------------- | ------- | -------- | ----------- | -------- | ---------- | ------- | -------- |
| B1: A demo class        | [instructor@test.com](mailto:instructor@test.com)         | 0       | 3        | 1           | 3        | 1          | 3       | 2        |
| B2: Gate 6 Test class   | [instructor@test.com](mailto:instructor@test.com)         | 0       | 1        | 1           | 0        | 0          | 2       | 1        |
| B3: The demo class      | [instructor@test.com](mailto:instructor@test.com)         | 0       | 0        | 0           | 0        | 0          | 0       | 0        |
| Relii Demo (Historical) | [michaeltbanta@gmail.com](mailto:michaeltbanta@gmail.com) | 1       | 7        | 3           | 41       | 19         | 8       | 4        |
| Pro Selling test        | [michaeltbanta@gmail.com](mailto:michaeltbanta@gmail.com) | 0       | 0        | 0           | 0        | 0          | 1       | 1        |


**Read off it, and these are the numbers step 4.2 compares against:** B's setup is
complete (B1 has 2 students, 1 pending invite, a chosen winner plus an undecided
pair, 1 assignment, 3 practices and 1 recording; B3 is empty). A's historical
class holds 4 pending invites, one of which must be the canary. **B carries no
rubric in any class, which confirms the constraint this whole run is shaped by:
a generated persona has no rubric, so nothing in B's classes can be submitted.**

## 0.3 A's submissions and the assignments under them

```sql
select s.id::text     as submission_id,
       s.status,
       p.email        as student,
       a.title        as assignment,
       a.id::text     as assignment_id,
       c.name         as class_name,
       (select count(*) from public.sessions x where x.assignment_id = a.id)
                      as sessions_under_assignment
  from public.sessions s
  join public.classes  c     on c.id = s.class_id
  join public.profiles owner on owner.id = c.instructor_id
  join public.profiles p     on p.id = s.student_id
  left join public.assignments a on a.id = s.assignment_id
 where lower(owner.email) = lower('michaeltbanta@gmail.com')
   and s.kind = 'submission'
 order by s.created_at desc;
```

**Pick and write down:**

- **A_SUB**: a submission whose `status` is `scored`. Items 1 to 4 and item 12
aim at it.
- **A_ASSIGNMENT**: the `assignment_id` on that row, and its
`sessions_under_assignment` must be **1 or more**. Item 11 aims at it, and the
fact that it is in use is what makes item 11 safe.

ACTUAL (A_SUB, A_ASSIGNMENT, and the session count):

A_SUB - d5373ffc-8b13-447a-8e09-e48a2628c49a

A_ASSIGNMENT - 9d884360-d672-476b-a722-b6889b66fda7 (Bunzl: Presentation call, Jordan (extra new again))

session count - 6

## 0.4 A's personas

```sql
select s.persona_name,
       s.title,
       s.id::text  as scenario_id,
       s.enabled,
       s.chain_role,
       coalesce(s.generation_group_id::text, '(hand written: Alex or Jordan)')
                   as generation_group_id,
       c.name      as class_name
  from public.scenarios s
  join public.classes  c     on c.id = s.class_id
  join public.profiles owner on owner.id = c.instructor_id
 where lower(owner.email) = lower('michaeltbanta@gmail.com')
 order by c.created_at, s.created_at;
```

**Pick and write down:**

- **ALEX**: the `scenario_id` of the row whose group reads "(hand written)" and
whose persona name is Alex. Items 15, 16 and 17 aim at it.
- **A_CANDIDATE**: the `scenario_id` of any generated row with `enabled` = false.
Item 6 aims at it.
- **A_GROUP**: any `generation_group_id`. Item 5 aims at it and needs nothing more
than that it exists. **Item 18 is fussier, and query 0.4b below picks its target.**
- **A_GATEKEEPER**: the `scenario_id` of the generated row whose `chain_role` is
`gatekeeper`. Items 7 and 19 aim at it. **It does NOT need to be enabled, and a
switched-off one is better:** the generate route refuses a switched-off gatekeeper
with "Choose and switch on the gatekeeper first", which gives item 19 a second
guard it would not otherwise have. If there is no gatekeeper at all, use any
generated row and note the substitution; the class guard runs first either way.

**RUN ON 2026-09-04, AND IT CHANGED ITEM 18.** A's seven personas are Alex and
Jordan (hand written, switched on) plus five generated candidates, **every one of
them switched off**. So **no generated group of A's has a live winner**, and item
18 cannot lean on the "this generation has a chosen persona that is switched on"
refusal the way this file first assumed. Query 0.4b finds it another guard.

ACTUAL: recorded in the block above, with the persona table and the settled ids.

ALEX: a21ce861-ebbd-4a29-b915-052e55668fec
A_CANDIDATE: ece231cb-3331-4694-a1cd-938ee22912ee (Cameron, switched off)
A_GROUP: a98c23dd-b61d-48c0-b2af-25e4ffc50885 (Cameron and Emilie)
A_GATEKEEPER: aab2ba60-5fd8-45ba-831d-2183cc8176dd (Leslie, switched OFF, which is
what gives item 19 its second guard)


| persona          | scenario_id                          | enabled | chain_role     | group                                |
| ---------------- | ------------------------------------ | ------- | -------------- | ------------------------------------ |
| Alex             | a21ce861-ebbd-4a29-b915-052e55668fec | true    | null           | hand written                         |
| Jordan           | 4bfee68d-481a-4d84-8969-8be33a93d4aa | true    | null           | hand written                         |
| Leslie           | aab2ba60-5fd8-45ba-831d-2183cc8176dd | false   | gatekeeper     | cdf87d4f-4984-4a60-835a-49dfaeea36b7 |
| Cameron          | ece231cb-3331-4694-a1cd-938ee22912ee | false   | decision_maker | a98c23dd-b61d-48c0-b2af-25e4ffc50885 |
| Emilie           | 78f2ce0b-83a9-44d8-9b86-90160c2e7b24 | false   | decision_maker | a98c23dd-b61d-48c0-b2af-25e4ffc50885 |
| Alex (candidate) | c7113c4d-f5ba-4fdb-8be0-967d75f8ae3a | false   | decision_maker | 151d9443-96dd-447c-b574-f0998ddf4e54 |
| Jamie            | 94b0a058-fd6c-4157-b163-29128374cb9b | false   | decision_maker | 151d9443-96dd-447c-b574-f0998ddf4e54 |




## 0.4b Which of A's generations is safe to aim item 18 at

Item 18 asks the discard route to destroy one of A's generation groups and expects
a refusal. The route protects a group two ways, and they are alternatives rather
than a pair: **a switched-on winner**, which A has none of, **or** any candidate in
the group that has been **role-played or put on an assignment**. This finds the
second kind.

```sql
select s.generation_group_id::text as group_id,
       string_agg(s.persona_name, ', ' order by s.persona_name) as candidates,
       count(*) as rows_in_group,
       bool_or(s.enabled) as has_switched_on_winner,
       sum((select count(*) from public.sessions x
             where x.scenario_id = s.id))   as sessions_on_this_group,
       sum((select count(*) from public.assignments a
             where a.scenario_id = s.id))   as assignments_on_this_group
  from public.scenarios s
  join public.classes  c     on c.id = s.class_id
  join public.profiles owner on owner.id = c.instructor_id
 where lower(owner.email) = lower('michaeltbanta@gmail.com')
   and s.generation_group_id is not null
 group by s.generation_group_id
 order by 1;
```

**IF ANY GROUP shows** `sessions_on_this_group` **or** `assignments_on_this_group` **above
0, that group is A_GROUP_18.** A class-guard failure is then caught by the "this
generation has been role-played, so it cannot be deleted" refusal, and nothing is
destroyed either way. That is the outcome to hope for.

**IF EVERY GROUP READS 0 ON BOTH, item 18 has no second guard available**, and
there is no way to give it one without writing to A's data (switching a candidate
on goes through the choose route, which deletes the losing sibling, so the cure
would be worse than the risk). Two honest options, and **the choice is the
owner's:**

- **Run it anyway, aimed at** `cdf87d4f-4984-4a60-835a-49dfaeea36b7` **(Leslie), the
smallest group at one row.** If the class guard has already failed, that one row
is deleted and the generated text is not recoverable. It is an unchosen scaffold
draft from the Piece 2 testing, never role-played and on no assignment, and **a
class guard that has silently failed is worth far more to know about than one
draft row.**
- **Skip item 18** and record it as not runnable with a defended target. Also
honest, and it leaves one row of the matrix unproved.

**Write down which was chosen and why.**

ACTUAL, run 2026-09-04:


| group_id                             | candidates      | rows | switched-on winner | sessions | assignments |
| ------------------------------------ | --------------- | ---- | ------------------ | -------- | ----------- |
| 151d9443-96dd-447c-b574-f0998ddf4e54 | Alex, Jamie     | 2    | false              | 0        | 0           |
| a98c23dd-b61d-48c0-b2af-25e4ffc50885 | Cameron, Emilie | 2    | false              | 0        | 0           |
| cdf87d4f-4984-4a60-835a-49dfaeea36b7 | Leslie          | 1    | false              | **1**    | **1**       |


**SETTLED: A_GROUP_18 =** `cdf87d4f-4984-4a60-835a-49dfaeea36b7` **(Leslie).** It
carries one session and one assignment, so the "has been role-played" refusal is
live on it. **Item 18 runs fully defended and no draft row is at risk**, so
neither of the two fallback options above is needed. The other two groups are
undefended and are deliberately not used as the target.

## 0.5 A's students and pending invites

```sql
select 'registered student' as what, p.email, p.id::text as id, c.name as class_name
  from public.class_members m
  join public.profiles p     on p.id = m.user_id
  join public.classes  c     on c.id = m.class_id
  join public.profiles owner on owner.id = c.instructor_id
 where lower(owner.email) = lower('michaeltbanta@gmail.com')
union all
select 'pending invite', e.email, '(no account yet)', c.name
  from public.allowed_emails e
  join public.classes  c     on c.id = e.class_id
  join public.profiles owner on owner.id = c.instructor_id
 where lower(owner.email) = lower('michaeltbanta@gmail.com')
   and not exists (select 1 from public.profiles p
                    where lower(p.email) = lower(e.email))
 order by 1, 2;
```

**Pick and write down:**

- **A_STUDENT**: the `id` of the Gate 6 throwaway student (a `+` alias). Item 13
aims at it. **If it is not listed, stop and tell CC**, and do not substitute a
real student without saying so.
- **A_CANARY_INVITE**: the pending invite address you created for this run. Item
14 and the tampered-cookie write aim at it. If it is not there, invite it now
from A's Invite Users page while working in the historical class.

ACTUAL, run 2026-09-04:


| what               | email                                                             | id                                   | class                   |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------ | ----------------------- |
| pending invite     | [ta1+michaeltbanta@gmail.com](mailto:ta1+michaeltbanta@gmail.com) | (no account yet)                     | Relii Demo (Historical) |
| pending invite     | [ta2+michaeltbanta@gmail.com](mailto:ta2+michaeltbanta@gmail.com) | (no account yet)                     | Relii Demo (Historical) |
| registered student | [mtb@gmail.com](mailto:mtb@gmail.com)                             | 9214d0ab-3999-4c32-a7ce-d0b3c753e023 | Relii Demo (Historical) |
| registered student | [student@example.com](mailto:student@example.com)                 | 9e9bc87c-edbe-478d-9547-31d05a038c12 | Relii Demo (Historical) |
| registered student | [student2@gmail.com](mailto:student2@gmail.com)                   | 6b0559dd-3949-4a59-a935-e900ee222b21 | Relii Demo (Historical) |
| registered student | [student3@gmail.com](mailto:student3@gmail.com)                   | 16ef6cf3-9e2f-4dc8-bea6-c45ce6a50421 | Pro Selling test        |
| registered student | [teststudent@gmail.com](mailto:teststudent@gmail.com)             | 5bb9e6ff-f0b5-451f-9472-5633d6169de4 | Relii Demo (Historical) |


**THE GATE 6 THROWAWAY STUDENT IS GONE.** No `+` alias is registered anywhere, so
item 13's intended target does not exist. **SUBSTITUTION, MADE ON THE OWNER'S
CONFIRMATION 2026-09-04, and recorded here because the file says never to make it
silently: A_STUDENT =** `16ef6cf3-9e2f-4dc8-bea6-c45ce6a50421` **([student3@gmail.com](mailto:student3@gmail.com)).**

**Why that one and not any other.** It is a real member of one of A's classes, so
the class guard is still tested at full strength, **and it carries zero sessions**
(query 2 shows Pro Selling test with 0), so a guard failure destroys an account
with no work behind it rather than one of the four in the historical class. Item
13 has no second guard available anywhere in the route, so the target IS the
defence.

**A_CANARY_INVITE =** `ta1+michaeltbanta@gmail.com`**.** `ta2+michaeltbanta@gmail.com`
is held as the spare: if item 14 or the 2.16 capstone ever wrongly succeeds, the
retry has a second pending target without anything being recreated first.

**One observation, not a problem.** The historical class holds 8 invite rows
against 4 registered students and 2 pending, so 2 of them belong to accounts
registered elsewhere, most likely the instructor addresses left by the Gate 4b
throwaway work. Worth knowing when item 21 lists what B can and cannot see.

## 0.6 The candidate count item 20 must not change

```sql
select c.name as class_name,
       count(*) filter (where s.generation_group_id is not null)
         as generated_candidates,
       count(*) filter (where s.generation_group_id is not null and s.enabled)
         as chosen_winners
  from public.classes c
  join public.profiles owner on owner.id = c.instructor_id
  left join public.scenarios s on s.class_id = c.id
 where lower(owner.email) = lower('michaeltbanta@gmail.com')
 group by c.name, c.created_at
 order by c.created_at;
```

**EXPECT:** two rows. Write both numbers down. Step 4 re-runs this and **both
must be identical** after B has run its own "Discard all".

ACTUAL, run 2026-09-04:


| class                   | generated_candidates | chosen_winners |
| ----------------------- | -------------------- | -------------- |
| Relii Demo (Historical) | **5**                | **0**          |
| Pro Selling test        | **0**                | **0**          |


**This is the number item 20 must not move, and step 4.3 re-reads it.** It agrees
with query 0.4 row for row: the 5 are Leslie, Cameron, Emilie, Alex (candidate)
and Jamie, and the 0 winners is the same fact that sent item 18 to query 0.4b for
a different guard.

## 0.7 Every id from B's side, captured now rather than mid-run

Steps 2.14 and 4b need these. **Capture them here** so the run never has to stop
and come back to the SQL editor. Everything B needs exists before step 0.

```sql
select 'B1 student'      as what, p.email as detail, p.id::text as id
  from public.class_members m
  join public.profiles p on p.id = m.user_id
 where m.class_id = 'PASTE-B1-HERE'
union all
select 'B1 pending invite', e.email, '(no account yet)'
  from public.allowed_emails e
 where e.class_id = 'PASTE-B1-HERE'
   and not exists (select 1 from public.profiles p
                    where lower(p.email) = lower(e.email))
union all
select 'B1 assignment', a.title, a.id::text
  from public.assignments a
 where a.class_id = 'PASTE-B1-HERE'
union all
select case when s.enabled then 'B1 winner (switched on)'
            else 'B1 candidate (switched off)' end
         || coalesce(' [' || s.chain_role || ']', ''),
       s.persona_name,
       s.id::text
  from public.scenarios s
 where s.class_id = 'PASTE-B1-HERE'
   and s.generation_group_id is not null
union all
select 'B1 generation group', s.persona_name, s.generation_group_id::text
  from public.scenarios s
 where s.class_id = 'PASTE-B1-HERE'
   and s.generation_group_id is not null
union all
select 'B1 practice session', s.kind, s.id::text
  from public.sessions s
 where s.class_id = 'PASTE-B1-HERE'
   and s.kind = 'practice'
 order by 1, 2;
```

**Write down:** B1_STUDENT, B1_INVITE, B1_ASSIGNMENT, B1_WINNER (a switched-on
one), B1_CANDIDATE (a switched-off one from the undecided group), B1_GROUP (the
undecided group's id), B1_GATEKEEPER (a row whose label carries `[gatekeeper]`,
if the generation made one), and B_PRACTICE.

**EXPECT:** two student rows, one pending invite, one assignment, several
personas, at least one generation group, and at least two practices. Anything
missing means a piece of B's setup was not built.

ACTUAL, run 2026-09-04. B1 is complete.


| what                            | detail                                              | id                                   |
| ------------------------------- | --------------------------------------------------- | ------------------------------------ |
| B1 assignment                   | HVAC Alex - trial close                             | f63ec110-46e8-4c65-ad4b-bb86ea3ba295 |
| B1 winner (on) [decision_maker] | Alex                                                | 68bc4303-e5ae-4fdb-bcc4-0372631dc729 |
| B1 candidate (off) [gatekeeper] | Linda                                               | c7be92b3-6ed3-4b0e-9f6f-4d2f2e455342 |
| B1 candidate (off) [gatekeeper] | Linda                                               | 7d77c8e0-0416-4b91-9a77-39dbe0954a5c |
| B1 generation group, DECIDED    | Alex                                                | 336650af-eb61-4809-9e8d-e34c57f60f01 |
| B1 generation group, UNDECIDED  | Linda, Linda                                        | 5d27b9df-18d9-47f1-9186-e7ed051df3a4 |
| B1 pending invite               | [3studentb1@gmail.com](mailto:3studentb1@gmail.com) | (no account yet)                     |
| B1 student                      | [1studentb1@gmail.com](mailto:1studentb1@gmail.com) | 12334ee0-ac19-42da-8a26-90ee0513ab9d |
| B1 student                      | [2studentb1@gmail.com](mailto:2studentb1@gmail.com) | 920c9ea3-c415-4013-94e4-1487fd2fe19e |
| B1 practice                     | practice                                            | 529a15dc-c018-4d78-aa75-403d6669d954 |
| B1 practice                     | practice                                            | e04a3ad3-b67b-4ad4-9803-a4c1cdfa5906 |
| B1 practice                     | practice                                            | 0ae456b3-7979-403f-884a-95e2f77cd144 |


**Settled, and these are the values for the step 2 preamble:**

```
B1_ASSIGNMENT  f63ec110-46e8-4c65-ad4b-bb86ea3ba295
B1_WINNER      68bc4303-e5ae-4fdb-bcc4-0372631dc729
B1_GROUP       5d27b9df-18d9-47f1-9186-e7ed051df3a4   (the UNDECIDED one)
B1_CANDIDATE   c7be92b3-6ed3-4b0e-9f6f-4d2f2e455342
B1_GATEKEEPER  c7be92b3-6ed3-4b0e-9f6f-4d2f2e455342   (same row, see below)
B1_STUDENT     12334ee0-ac19-42da-8a26-90ee0513ab9d
B1_INVITE      3studentb1@gmail.com
B_PRACTICE     529a15dc-c018-4d78-aa75-403d6669d954
```

**Two things to read off this rather than rediscover later.**

**B1_GATEKEEPER and B1_CANDIDATE are the same row on purpose.** Both Lindas are
gatekeepers and both are switched off, so 2.14's chain line gets the same second
guard A's Leslie gives item 19: a class-guard failure there is caught by "Choose
and switch on the gatekeeper first" rather than generating anything.

**Item 20b's expectation is confirmed by this table, not assumed.** B1 holds three
personas: Alex switched on (so it lands under `live`) and two Lindas switched off
and never role-played (so they land under `deletable`). **20b must report exactly**
`deletable: 2` **and delete 2.** B1's decided group `336650af` is a single row and
contributes nothing, which is what choosing a winner does: it deletes the loser.

---



# Step 1. Signed in as instructor A. Reads only.

Nothing in this step destroys anything. One row is added to `class_exports` and
that is the only write.

## The console preamble for this step

Paste once after each page load. It hangs everything off `window`, so re-pasting
never gives you "Cannot declare a redeclared variable".

```js
window.G5 = window.G5 || {};
G5.get = function (label, url) {
  return fetch(url, { redirect: "manual" }).then(function (r) {
    return r.text().then(function (t) {
      console.log("G5 " + label, "| status", r.status, "| type", r.type, "|", t.slice(0, 200));
    });
  });
};
G5.post = function (label, url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.text().then(function (t) {
      console.log("G5 " + label, "| status", r.status, "|", t.slice(0, 300));
    });
  });
};
G5.ids = {
  A_SUB:        "d5373ffc-8b13-447a-8e09-e48a2628c49a", // 0.3 scored submission
  A_ASSIGNMENT: "9d884360-d672-476b-a722-b6889b66fda7", // 0.3 has 6 sessions
  A_CLASS_1:    "b03df6d8-8485-4d27-a712-b78d8bfc9453", // 0.1 Relii Demo (Historical)
  A_CLASS_2:    "be13eabb-ece1-4fdd-a034-74700fe96007", // 0.1 Pro Selling test
  B3:           "98859b39-79a2-4fbc-b2c8-3a9de9e50223", // 0.1 B3, empty
  NONSENSE: "11111111-2222-3333-4444-555555555555"
};
console.log("preamble loaded", G5.ids);
```

**EXPECT:** the ids print back with your values in them. If any is still an empty
string, fix it before going on. Every refusal below is meaningless if the request
was never aimed anywhere.

ACTUAL, 2026-09-04: **PASS.** Ids printed back filled in, and 1.5 and 1.6 ran off
this preamble.

## 1.1 Positive control. Nothing below counts without this.

A refusal looks identical to a request that was never authenticated as who you
think it was, so each session starts with one thing that must **succeed**.

Working in the historical class, open the dashboard and then open one submission
from the table.

**EXPECT:** the dashboard renders with the tiles, and the submission page opens
with the transcript and the score on it.

ACTUAL, 2026-09-04: **PASS.** Both rendered. Every refusal recorded in step 1
below is therefore a refusal of an authenticated instructor request, which is the
only reason a 404 further down means anything.

## 1.2 A's picker sweep, and it has a concrete expected value

Switch the "Working in" picker between A's two classes and read these four
surfaces each time.

**EXPECT:**


| Surface                                  | Relii Demo (Historical)      | Pro Selling test                  |
| ---------------------------------------- | ---------------------------- | --------------------------------- |
| Roster registered students               | **4**                        | **1**                             |
| Dashboard enrolled tile                  | **"of 4 enrolled"**          | **no tile: "No assignments yet"** |
| Manage Assignments                       | the 3 historical assignments | **empty**                         |
| AI Persona Framework, Recent generations | the historical generations   | **empty**                         |


**A number that is merely different is a weaker pass than a number that is
right.** The Roster carries that here, with 4 and 1. **The tile is deliberately
not the check on A's side**, because A's second class has no assignment and so
has no tile; step 0.2 records why, and B1 and B2 carry the tile-against-Roster
agreement instead. **Three empty surfaces in a row is the pass, not a problem:
they show the picker being followed into a class with nothing in it.**

ACTUAL, 2026-09-04: **PASS**, against every cell of the table above. Roster 4 then
1, tile "of 4 enrolled" then "No assignments yet", Manage Assignments and Recent
generations both populated then both empty. **The 4-and-1 the kickoff asked for is
therefore proved on the Roster**, and the three empty surfaces in Pro Selling test
are the picker being followed into a class holding nothing.

## 1.3 Group 2, item 1. The submission panel on the surface it matters most on

**Switch the picker to A's second class, Pro Selling test**, then put A's
historical submission in
the address bar:

```
/instructor/submission/d5373ffc-8b13-447a-8e09-e48a2628c49a
```

**EXPECT:** the friendly panel, headed **"This submission is in another of your
classes"**, naming the historical class, with a **"Switch to ... and open it"**
button. **Not** a 404. This is a read and it destroys nothing.

ACTUAL, 2026-09-04: **PASS.** The panel, naming Relii Demo (Historical). **This is
the answer that only the owner may see**, and item 1 in step 2 is what proves it
did not widen: the same id from B must give the plain 404 instead.

## 1.4 The same answer on the dashboard's bookmark case

Still working in Pro Selling test:

```
/instructor?assignment=9d884360-d672-476b-a722-b6889b66fda7
```

**EXPECT:** the same panel, worded **"This assignment is in another of your
classes"**. Not a silent fallback, which here would mean the empty state.

ACTUAL, 2026-09-04: **PASS.** The panel again, worded for an assignment. The
bookmark case is the one most likely to be hit by a real person, and the failure
it rules out is the quiet one: falling back to the working class's own dashboard
with nothing on screen saying the link went somewhere else.

## 1.5 The friendly answer must NOT have leaked into the routes

Still working in Pro Selling test, paste the preamble and then:

```js
G5.get("1.5 video",      "/api/instructor/submission/" + G5.ids.A_SUB + "/video");
G5.get("1.5 transcript", "/api/instructor/submission/" + G5.ids.A_SUB + "/transcript");
G5.get("1.5 csv",        "/api/instructor/submission/" + G5.ids.A_SUB + "/csv");
```

**EXPECT: status 404 on all three**, with `{"error":"Submission not found."}`.
The friendly panel belongs on pages a person navigates to; a route is reached
from a page that is already scoped. **A status of 0 with type** `opaqueredirect`
**on the video line is a FAILURE**: it means the route minted a signed recording
link for a class you are not working in.

Then switch the picker back to the historical class and run the same three lines
again. **That is this item's positive control**, and the video line reads
differently from the other two: transcript and csv come back **200** with
content, while video comes back **status 0, type** `opaqueredirect`, because the
route mints a signed link and redirects to it and `redirect: "manual"` stops the
console from following it. In this direction that opaqueredirect is the pass.

ACTUAL, 2026-09-04: **PASS, both directions.** From Pro Selling test all three
answered 404 with "Submission not found." and the video line minted no link. From
the historical class all three succeeded, transcript and csv with content and
video as the opaqueredirect.

**This is the item that proves the friendly panel did not leak into the routes**,
and it is the strongest thing step 1 produces. 1.3 and 1.4 showed the pages
naming the owner's other class; these three show the routes refusing the same
caller, the same id and the same working class outright. The friendly answer
belongs on a page a person navigates to, and a route is reached from a page that
is already scoped. **The second direction is what makes the first mean something:
the same three lines succeed when the picker is on the right class, so the 404s
were a refusal rather than a broken request.**

## 1.6 Group 3. The crafted delete requests

**Read this before pasting anything.** Every request below aims at
`G5.ids.NONSENSE`, a uuid that is not any class in the system. All three checks
being tested refuse before the route ever reads a class row, so **even a total
failure of every guard at once deletes nothing, because nothing matches that
id.**

**The export token is taken from B3, the empty class, and that is deliberate.**
Do not "improve" this back to exporting A's own class. A live delete token for
the historical class is, for the hour it lives, the most dangerous object in the
system, and it buys nothing: the substitution check compares the token's class
against the class in the address, and neither of those is the historical class
either way. If every guard failed at once with a B3 token, the worst case is an
empty class that takes a minute to recreate.

Paste the helper:

```js
G5.del = function (label, body) {
  return G5.post(label, "/api/admin/class/" + G5.ids.NONSENSE + "/delete", body);
};
```



### Item G3.1. No token at all

```js
G5.del("G3.1 no token", { confirm: "REMOVE" });
```

**EXPECT:** status **400**, "This class has not been exported. Export it first:
the delete cannot run without the token the export issues."

ACTUAL, 2026-09-04: **PASS.** 400, as expected. This is the request the whole
export-first mechanism exists to refuse: the one that skips the button.

### Item G3.2. A made-up token

```js
G5.del("G3.2 fake token", { confirm: "REMOVE", token: "00000000-0000-0000-0000-000000000000" });
```

**EXPECT:** status **400**, "That export is not valid. Export this class again."

ACTUAL, 2026-09-04: **PASS.** 400, as expected.

### Item G3.3. A valid token issued for a different class. The substitution attack.

First take the export from B3. Exporting reads and issues a token; it changes
nothing about the class.

```js
fetch("/api/admin/class/" + G5.ids.B3 + "/export", { method: "POST" })
  .then(function (r) { return r.json(); })
  .then(function (j) {
    G5.b3token = j.token;
    console.log("G5 B3 export token", j.token, j.counts);
  });
```

**EXPECT:** a token, and counts that are all zero (B3 is empty).

ACTUAL, 2026-09-04: **PASS.** A token was issued with zero counts. It is now a
live but unused row in `class_exports`, and step 4.1 expects to see it.

Then aim it at the nonsense class id:

```js
G5.del("G3.3 substitution", { confirm: "REMOVE", token: G5.b3token });
```

**EXPECT:** status **400**, "That export was taken for a different class, so it
cannot authorise this deletion. Export this class." **That wording can only come
from the substitution check**, which is what makes this a pass rather than a
refusal for some other reason.

ACTUAL, 2026-09-04: **PASS.** 400 with that exact wording, so the refusal came
from the class comparison and not from some earlier check standing in for it.

**What the three together prove, and what they do not.** They prove the delete
route will not run without a token, will not accept a token it did not issue, and
will not accept a token issued for a different class. **They were run in the safe
direction the owner ruled on:** the token belongs to B3, the empty class, and the
address is a uuid that is no class at all, so a total failure of every guard at
once would have deleted nothing. They do not prove the cascade itself, which Gate
4b proved against a throwaway, and they do not cover the spent token, which is
recorded as skipped at G3.4.

### Item G3.4. A token that has already been used

**SKIPPED, and the reason is structural rather than a shortcut.** A spent token
only exists after a real cascade delete has completed. Re-proving it would mean
building a new throwaway class and destroying it. **Gate 4b proved this on
2026-09-02 against a throwaway class with the owner watching, and that proof
stands.** The owner ruled on 2026-09-03 not to build a throwaway class for it.

ACTUAL: skipped by ruling.

## 1.7 One leftover row, and it is expected

Step 1 leaves one row in `class_exports`: B3's export, with `used_at` empty. That
is an export somebody took and did not act on. Query 6 of
`supabase/gate-4b-tests.sql` will show it in step 4. It is not an anomaly.

ACTUAL, 2026-09-04: **PASS.** Confirmed at step 4.1: query 6 of
`supabase/gate-4b-tests.sql` shows B3's export taken 2026-09-04 with `used_at`
empty and every count zero.

---



# Step 2. Signed in as instructor B. The bulk of the run.

Sign out of A and sign in as [instructor@test.com](mailto:instructor@test.com). **Stay signed in as B for this
whole step**, which is why it is ordered the way it is rather than by item
number.

**Reads first (2.2 to 2.9), then listings (2.10 to 2.14), then the cookie tamper
(2.15), then writes and deletes (2.16 onwards).** If anything in the read block
fails, stop and tell CC before running a single write.

## 2.1 The preamble and the ids for this step

Console filter on "All". Then paste:

```js
window.G5 = window.G5 || {};
G5.get = function (label, url) {
  return fetch(url, { redirect: "manual" }).then(function (r) {
    return r.text().then(function (t) {
      console.log("G5 " + label, "| status", r.status, "| type", r.type, "|", t.slice(0, 200));
    });
  });
};
G5.post = function (label, url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.text().then(function (t) {
      console.log("G5 " + label, "| status", r.status, "|", t.slice(0, 300));
    });
  });
};
G5.ids = {
  A_SUB:           "d5373ffc-8b13-447a-8e09-e48a2628c49a", // 0.3
  A_ASSIGNMENT:    "9d884360-d672-476b-a722-b6889b66fda7", // 0.3 has 6 sessions
  A_GROUP:         "a98c23dd-b61d-48c0-b2af-25e4ffc50885", // 0.4 Cameron + Emilie
  A_GROUP_18:      "cdf87d4f-4984-4a60-835a-49dfaeea36b7", // 0.4b Leslie, DEFENDED
  A_CANDIDATE:     "ece231cb-3331-4694-a1cd-938ee22912ee", // 0.4 Cameron, off
  A_GATEKEEPER:    "aab2ba60-5fd8-45ba-831d-2183cc8176dd", // 0.4 Leslie, off
  ALEX:            "a21ce861-ebbd-4a29-b915-052e55668fec", // 0.4 hand written
  A_STUDENT:       "16ef6cf3-9e2f-4dc8-bea6-c45ce6a50421", // 0.5 student3, 0 sessions
  A_CANARY_INVITE: "ta1+michaeltbanta@gmail.com",          // 0.5 ta2 is the spare
  A_CLASS_1:       "b03df6d8-8485-4d27-a712-b78d8bfc9453", // 0.1 Historical
  B1:              "196770e0-cdd5-4fe4-80e4-421ee6c7d13f", // 0.1 B's OLDEST
  B2:              "1a83a9f1-fbcc-4e39-ae73-95bd43da0e8f", // 0.1
  B3:              "98859b39-79a2-4fbc-b2c8-3a9de9e50223", // 0.1 empty
  B_PRACTICE:      "529a15dc-c018-4d78-aa75-403d6669d954", // 0.7
  B1_GROUP:        "5d27b9df-18d9-47f1-9186-e7ed051df3a4", // 0.7 the UNDECIDED one
  B1_ASSIGNMENT:   "f63ec110-46e8-4c65-ad4b-bb86ea3ba295"  // 0.7
};
console.log("preamble loaded", G5.ids);
```

**EXPECT:** every id prints back filled in. An empty string means the request goes
nowhere and its refusal proves nothing.

ACTUAL, 2026-09-04: **PASS.** Every id printed back filled in.

## 2.2 Positive controls. Nothing below counts without these.

Working in **B1**:

1. The picker lists **exactly B's three classes** and none of A's.
2. The dashboard renders with tiles (not the "No assignments yet" empty state).
3. The Roster lists B's 2 students plus B, and B1's pending invite.
4. AI Persona Framework, Recent generations, lists B's generations.
5. Open one of B's own comparison pages from Recent generations. It renders.

**EXPECT:** all five. If the dashboard shows "No assignments yet", B1's assignment
was not built and items 9 and 2.13 cannot be run.

ACTUAL, 2026-09-04: **PASS, all five.** So every refusal recorded below this line
is an authenticated instructor B being refused, rather than a request that never
arrived as anybody. That is the whole reason this block exists.

## Group 1, items 1 to 7. Reads aimed at A, all as B.

Every one of these must answer **"not found"** rather than **"forbidden"**. The
404 wording is deliberate: a 403 would confirm the row exists in somebody else's
class, which is a small leak of exactly the kind this gate closes.

### Item 1. A's submission detail page

Put this in the address bar:

```
/instructor/submission/d5373ffc-8b13-447a-8e09-e48a2628c49a
```

**EXPECT:** the plain Next.js 404 page, reading **"This page could not be
found."** **Not** the friendly "in another of your classes" panel: that panel is
computed only from classes the caller owns, so a stranger must never see it.

ACTUAL, 2026-09-04: **PASS.** The plain 404 page.

**Read this next to 1.3, because the pair is the actual result.** The same
submission id gave A the panel naming their other class and gave B the plain 404,
byte for byte the answer B would get for an id that does not exist. **That is the
Gate 6 friendliness proved not to have widened**, and neither half means much
alone.

### Items 2, 3 and 4. The three download routes

```js
G5.get("item 2 video",      "/api/instructor/submission/" + G5.ids.A_SUB + "/video");
G5.get("item 3 transcript", "/api/instructor/submission/" + G5.ids.A_SUB + "/transcript");
G5.get("item 4 csv",        "/api/instructor/submission/" + G5.ids.A_SUB + "/csv");
```

**EXPECT: status 404 on all three**, body `{"error":"Submission not found."}`.
**No redirect on the video line.** A status of 0 with type `opaqueredirect` means
a signed recording link was minted for another instructor's student and is a
failure of the most serious kind in this run.

ACTUAL (item 2), 2026-09-04: **PASS.** 404, "Submission not found." No redirect,
so no signed recording link was minted for another instructor's student.
ACTUAL (item 3), 2026-09-04: **PASS.** 404, same wording.
ACTUAL (item 4), 2026-09-04: **PASS.** 404, same wording.

### Item 4b. ADDED: a practice cannot be reached through the submission surface

This is the filter that shaped B's whole setup (`kind = "submission"` on both the
page and the download helper), so it is worth one direct attempt rather than
being taken on trust. **Aimed at B's own practice, so it is completely safe.**

`G5.ids.B_PRACTICE` was captured at step 0.7. Then:

```
/instructor/submission/529a15dc-c018-4d78-aa75-403d6669d954
```

```js
G5.get("4b video",      "/api/instructor/submission/" + G5.ids.B_PRACTICE + "/video");
G5.get("4b transcript", "/api/instructor/submission/" + G5.ids.B_PRACTICE + "/transcript");
G5.get("4b csv",        "/api/instructor/submission/" + G5.ids.B_PRACTICE + "/csv");
```

**EXPECT:** the 404 page, and **404 on all three routes**, even though this is
B's own session in B's own working class. A practice is not a submission and can
never be downloaded through these routes.

ACTUAL, 2026-09-04: **PASS.** The 404 page and 404 on all three routes, for B's
own practice in B's own working class. **This is the filter that shaped the whole
run** (it is why B can hold no submission and why item 12 has no own-class form),
and it is now measured rather than taken on trust.

### Item 5. A's comparison page

```
/instructor/scaffold/compare/a98c23dd-b61d-48c0-b2af-25e4ffc50885
```

**EXPECT:** the plain 404 page. Not the friendly panel.

ACTUAL, 2026-09-04: **PASS.** The plain 404 page.

### Item 6. A's candidate edit page

```
/instructor/scaffold/edit/ece231cb-3331-4694-a1cd-938ee22912ee
```

**EXPECT:** the plain 404 page.

ACTUAL, 2026-09-04: **PASS.** The plain 404 page.

### Item 7. A's gatekeeper chain page

```
/instructor/scaffold/chain/aab2ba60-5fd8-45ba-831d-2183cc8176dd
```

**EXPECT:** the plain 404 page.

ACTUAL, 2026-09-04: **PASS.** The plain 404 page.

**ITEMS 1 TO 7 ARE COMPLETE AND NONE FAILED**, so the writes in this step are
cleared to run. That was the condition: a read that wrongly succeeds tells you a
guard is broken before anything is written.

**STOP HERE IF ANY OF ITEMS 1 TO 7 DID NOT REFUSE.** A read that wrongly
succeeds tells you a guard is broken before any write is attempted, and every
write below aims at A's real data.

## Group 1, items 8 to 10. The listings.



### Item 8. B's Roster

Working in **B1**, open the Roster.

**EXPECT:** B's 2 registered students, B himself, and B1's pending invite.
**None of A's 4 students, none of A's pending invites, and not the canary
address.**

ACTUAL, 2026-09-04: **PASS.**

### Item 9. B's dashboard enrolled count

Still in **B1**.

**EXPECT:** the tile reads **"of 2 enrolled"**, matching the Roster. Not 4, not
5, not 6.

ACTUAL, 2026-09-04: **PASS.** **This is where the concrete tile-against-Roster
check landed** after A's second class turned out to have no assignment and so no
tile. B carries it, and 2.13 carries it again across three classes.

### Item 10. B's Recent generations

AI Persona Framework, still in **B1**.

**EXPECT:** B's own generations only. None of A's persona names anywhere on the
page.

ACTUAL, 2026-09-04: **PASS.** No Leslie, Cameron, Emilie or Jamie anywhere.

**ITEMS 8, 9 AND 10 COMPLETE.** Everything in step 2 that reads through the
APPLICATION has now refused or scoped correctly. The three items below go around
it, straight at the database with an ordinary browser key, which is the only
thing the two Gate 3b policies on `allowed_emails` actually protect.

## The browser key. Items 21, 22 and 23.

Items 1 to 10 went through the application. **These three go straight at the
database with an ordinary browser key**, which is the only thing the two Gate 3b
policies on `allowed_emails` actually protect against.

### The browser-key preamble

**The key below is the ANON PUBLISHABLE key**, filled in on the owner's ruling of
2026-09-04 so a re-run needs no lookup. It is the key that already ships inside
every page load of the app, so writing it here discloses nothing that visiting the
site does not. **THE SERVICE ROLE KEY APPEARS NOWHERE IN THIS FILE, IN THIS RUN,
OR IN ANY STEP OF IT, AND NOTHING HERE HAS ANY USE FOR ONE.**

```js
window.SB = {};
SB.url  = "https://cmpvyralyungfmjoteex.supabase.co";
SB.anon = "sb_publishable_oHYqaWS5dwmV80eglsk1PA_IKlSjfNh";
SB.token = (function () {
  var wanted = "sb-cmpvyralyungfmjoteex-auth-token";
  var jar = {};
  document.cookie.split("; ").forEach(function (pair) {
    var i = pair.indexOf("=");
    jar[pair.slice(0, i)] = pair.slice(i + 1);
  });
  var names = Object.keys(jar).filter(function (n) {
    return n === wanted || n.indexOf(wanted + ".") === 0;
  }).sort();
  if (names.length === 0) return null;
  var raw = names.map(function (n) { return decodeURIComponent(jar[n]); }).join("");
  if (raw.indexOf("base64-") === 0) {
    var b64 = raw.slice(7).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    raw = new TextDecoder().decode(bytes);
  }
  return JSON.parse(raw).access_token;
})();
console.log("session token:", SB.token ? SB.token.slice(0, 12) + "... FOUND" : "NOT FOUND, STOP");
SB.q = function (label, path) {
  return fetch(SB.url + "/rest/v1/" + path, {
    headers: { apikey: SB.anon, Authorization: "Bearer " + SB.token }
  }).then(function (r) {
    return r.text().then(function (t) {
      console.log("SB " + label, "| status", r.status, "|", t.slice(0, 600));
    });
  });
};
SB.ins = function (label, table, row) {
  return fetch(SB.url + "/rest/v1/" + table, {
    method: "POST",
    headers: {
      apikey: SB.anon,
      Authorization: "Bearer " + SB.token,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(row)
  }).then(function (r) {
    return r.text().then(function (t) {
      console.log("SB " + label, "| status", r.status, "|", t.slice(0, 600));
    });
  });
};
```

**EXPECT:** "session token: ... FOUND". **If it says NOT FOUND, stop.** Without
the session every request below runs as an anonymous visitor, and every refusal
would pass for the wrong reason. (If it happens: Web Inspector, Storage, Cookies,
relii.vercel.app, and check that a cookie named
`sb-cmpvyralyungfmjoteex-auth-token` is there.)

==> **THE TOKEN EXPIRES AFTER ABOUT AN HOUR, AND IT BIT THIS RUN ON 2026-09-04.**
A Supabase access token is short lived. `SB.token` is captured ONCE when the
preamble runs, so on a long step it goes stale in the console while the app itself
carries on working, because the app refreshes its cookie on every page load and
the console variable does not.

**WHAT IT LOOKS LIKE, AND WHY IT IS DANGEROUS:** status **401** with
`{"code":"PGRST303","message":"JWT expired"}`. **A bare 401 reads exactly like a
refusal**, and on an item whose expected answer IS a refusal it would be written
down as a pass while proving nothing whatsoever. Read the body, never just the
status.

**THE FIX, in this order and not a shorter one:** load any Relii page so the
middleware writes a fresh cookie, re-paste this preamble, then **re-run item 21's
positive control and see the five rows again**. Only then re-run the item that
failed. Re-establishing the positive control is the part that matters: a new token
that has not been shown to work is no better than the expired one. <==

ACTUAL, 2026-09-04: the token DID expire mid-step and item 23 returned it. The
three-step recovery was performed and item 21's positive control was re-run and
seen again before item 23 was retried.

### Item 21. The invite list over the web API

```js
SB.q("21 positive control", "allowed_emails?select=email,class_id");
```

**EXPECT:** a non-empty list, and **this is the positive control**: it must
contain B's own invites. **It should show invites from EVERY class B owns, not
just the working class.** That is expected rather than a bug: the read policy is
`instructs_class(class_id)`, which answers "any class you own", and it is the
application that scopes a listing to one class. **None of A's addresses may
appear.**

ACTUAL, 2026-09-04: **PASS.** Status 200, five rows, and **not one of A's**:

```
1studentb1@gmail.com   196770e0 (B1)
2studentb1@gmail.com   196770e0 (B1)
3studentb1@gmail.com   196770e0 (B1)
b2student@gmail.com    1a83a9f1 (B2)
b2student2@gmail.com   1a83a9f1 (B2)
```

**The count is itself a check and it agrees exactly.** Query 0.2 recorded 3
invites in B1, 2 in B2 and 0 in B3, and this returned 3 + 2 + 0.

**A QUESTION THIS RAISED DURING THE RUN, ANSWERED HERE SO IT IS NOT RE-ASKED: no,
none of these is a deleted or stale student.** An invite row does not disappear
when the person registers. `allowed_emails` is the INVITE LIST, not a pending
list: 1studentb1 and 2studentb1 are B1's two registered students and their rows
stay, and only 3studentb1 is genuinely pending. The Roster's pending section
filters the registered ones out for display; the table keeps them. **That is also
the explanation for the 8-invites-against-4-students observation recorded at 0.5
in A's class**, and it is why that observation was not a leak.

**This is the item whose MEANING Gate 6 changed, and the result shows both
halves.** Invites from more than one owned class appear together, which is
correct, because the read policy is `instructs_class(class_id)` and answers "any
class you own" while the application narrows a listing to the working class. The
isolation half is that not one row of A's is reachable, and none is.

```js
SB.q("21 aimed at A", "allowed_emails?select=email,class_id&email=eq." + G5.ids.A_CANARY_INVITE);
```

**EXPECT:** `[]`, an empty list. The row exists; B cannot see it.

ACTUAL, 2026-09-04: **PASS.** Status 200 with `[]`.

**A 200 is the right answer and an empty array is the refusal.** The security rule
does not reject the query; it removes the rows B may not see, so a filter matching
one of A's invites returns nothing at all. That is also why this is the only place
in the run where "found nothing" is the pass.

**Two things make it evidence rather than an empty result.** The positive control
returned all five of B's invites on the SAME token seconds earlier, so the request
was live. And **item 22 independently proved this row exists and belongs to A**, by
refusing B's attempt to invite the address with "was invited by another
instructor". So B is being refused a row that is provably there.

### Item 22. The invite collision message, confirmed rather than re-opened

This is settled by the multi-class rulings and was tested once in Gate 4a. Ten
seconds to confirm the message is still the legible one. From B's Invite Users
page, invite **A_CANARY_INVITE**.

**EXPECT:** a refusal reading **"... was invited by another instructor, so they
cannot be invited again. Ask your administrator."** It must **not** name A and
must not name A's class. Knowing an invite exists elsewhere is what lets you act;
knowing who holds it is not.

ACTUAL, 2026-09-04: **PASS.** Refused, pointing at the administrator, naming
neither A nor A's class. The ruling stands as settled and this confirms the
message is still the legible one rather than re-opening it.

### Item 23. ADDED: the same-class constraint bites, rather than merely reading zero

Query 6 of the checks files shows that no cross-class reference exists. That is
not the same as showing one cannot be made. This attempts one directly.

```js
SB.ins("23 cross-class assignment", "assignments", {
  title: "G5-constraint-test-delete-me",
  scenario_id: G5.ids.ALEX,
  required_mode: "text",
  class_id: G5.ids.B1
});
```

**EXPECT:** a refusal, status **409**, mentioning code `23503` and the constraint
name `assignments_scenario_same_class_fkey`. The insert policy allows B to
write into B's own class; the Gate 4a constraint is what refuses the scenario
from somebody else's.

**IF IT RETURNS 201, THAT IS THE FINDING, AND THE JUNK ROW MUST GO BEFORE THE RUN
CONTINUES**, or every count after this point is wrong:

```js
fetch(SB.url + "/rest/v1/assignments?title=eq.G5-constraint-test-delete-me", {
  method: "DELETE",
  headers: { apikey: SB.anon, Authorization: "Bearer " + SB.token, Prefer: "return=representation" }
}).then(function (r) { return r.text().then(function (t) { console.log("cleanup", r.status, t); }); });
```

Then stop and tell CC.

ACTUAL, 2026-09-04: **PASS.** Refused by the database, so no junk row was created
and no cleanup was needed. (First attempt returned 401 JWT expired, which was the
stale token described above and not a result; re-run after re-establishing item
21's positive control.)

**WHAT THIS CLOSES.** Item 23 was carried through five gate pieces as a question
rather than a test, and Gate 4a answered it with a constraint. Query 6 of the
checks files shows only that no cross-class reference EXISTS. **This shows one
cannot be MADE**, by an authenticated instructor writing straight at the database
with a browser key, which is the path the constraint was written for: the insert
policy happily allows B to write into B's own class, and
`assignments_scenario_same_class_fkey` is the thing that refuses somebody else's
scenario. Those are two different layers and only the second one was ever load
bearing here.

## Group 2. Does B's own surface follow the class B chose?

A different question from group 1: not "can B reach A" but "does one instructor's
own surface follow the class they chose".

### 2.11 The panel on B's own other class, three surfaces

**Switch the picker to B2.** Then open each of these:

```
/instructor/scaffold/compare/5d27b9df-18d9-47f1-9186-e7ed051df3a4
/instructor/scaffold/edit/c7be92b3-6ed3-4b0e-9f6f-4d2f2e455342
/instructor/scaffold/chain/c7be92b3-6ed3-4b0e-9f6f-4d2f2e455342
/instructor?assignment=f63ec110-46e8-4c65-ad4b-bb86ea3ba295
```

**EXPECT:** the friendly panel each time, headed "This comparison / persona /
assignment is in another of your classes", naming **B1**, with a switch button.
**Not** a 404, and **not** a silent fallback to B2's own content.

**The edit and chain lines use the same id on purpose.** Query 0.7 showed both of
B1's undecided candidates are gatekeepers, so Linda `c7be92b3` is both "a
candidate" and "a gatekeeper" and serves both pages.

ACTUAL, 2026-09-04: **PASS**, all four, each naming B1.

**This is the mirror of items 5, 6 and 7 and only the pair means anything.** The
same three page types gave B the plain 404 for A's ids and name the class for B's
own. One without the other is either a leak or an unusable product.

### 2.12 The switch button actually works

On one of those panels, click **"Switch to B1 and open it"**.

**EXPECT:** the page opens on the thing you asked for, and the "Working in" line
now says B1. Nothing switched until you clicked.

ACTUAL, 2026-09-04: **PASS.** Nothing switched until it was clicked, which is the
half worth checking: a link that silently moved the working class would rewrite
the state every other page reads, and the next thing created would land somewhere
nobody chose.

### 2.13 B's picker sweep across three classes

Switch B1, B2, B3 and read every surface each time.

**EXPECT:**


| Surface                                  | B1                                    | B2              | B3                   |
| ---------------------------------------- | ------------------------------------- | --------------- | -------------------- |
| Roster, registered students              | 2                                     | 1               | 0                    |
| Roster, pending invites                  | 1                                     | 1               | 0                    |
| Dashboard enrolled tile                  | 2                                     | 1               | "No assignments yet" |
| Manage Assignments                       | B1's assignment                       | B2's assignment | empty                |
| AI Persona Framework, Recent generations | B1's generations                      | B2's generation | empty                |
| Invite Users                             | works, targets B3 when B3 is selected |                 |                      |


**A surface that does not follow the picker is a surface that was missed.**

ACTUAL, 2026-09-04: **PASS**, every cell across all three classes.

**This is the strongest form of the check the kickoff asked for.** A's sweep could
only offer 4 and then 1 on the Roster, since A's second class has no tile at all.
B gives three classes, two of them with tiles, and the enrolled numbers agree with
the Rosters at 2 and 1 while B3 shows the empty state. No surface was missed.

### 2.14 Items 11 to 19 aimed at B's OWN other class must still be REFUSED

The friendly answer belongs on pages a person navigates to. A route is reached
from a page that is already scoped, so the routes keep answering 404 for a
cross-class target **on purpose**. This is the check that item 1's friendlier
answer did not leak into the write paths.

**Work in B2 for this whole block, and aim everything at B1.** Nothing here can
reach A. Everything it could damage is B's own test data, and every line says
what to rebuild if it wrongly succeeds.

Fill in five more ids first, **all of them captured at step 0.7**:

```js
G5.ids.B1_STUDENT    = "12334ee0-ac19-42da-8a26-90ee0513ab9d"; // 1studentb1
G5.ids.B1_INVITE     = "3studentb1@gmail.com";
G5.ids.B1_CANDIDATE  = "c7be92b3-6ed3-4b0e-9f6f-4d2f2e455342"; // Linda, off
G5.ids.B1_WINNER     = "68bc4303-e5ae-4fdb-bcc4-0372631dc729"; // Alex, on
G5.ids.B1_GATEKEEPER = "c7be92b3-6ed3-4b0e-9f6f-4d2f2e455342"; // the same Linda
```

**Every line below must answer 404.** Not a friendly panel, not a 200.

```js
G5.post("2.14 / 11 assignment delete", "/api/instructor/assignment/" + G5.ids.B1_ASSIGNMENT + "/delete", {});
```

**EXPECT 404**, "That assignment was not found."
**IF IT SUCCEEDED:** B1's assignment and any practices under it are gone. Rebuild
it before continuing and tell CC.

ACTUAL, 2026-09-04: **PASS.** 404.

**Item 12 CANNOT BE RUN in this direction and it is the one gap in the block.**
The reset route reads `kind = "submission"` and **B can hold no submission at
all**, because a generated persona has no rubric attached until Phase 2, so
nothing in B's classes can be graded or submitted. Item 12 is covered against A
in the block below, and its own-other-class form has no data to run against.

ACTUAL: not runnable, no submission exists in any of B's classes.

```js
G5.post("2.14 / 13 delete student", "/api/instructor/delete-student", { studentId: G5.ids.B1_STUDENT });
```

**EXPECT 404**, "That student was not found."
**IF IT SUCCEEDED:** that student's account and sessions are gone. Re-invite and
re-register before continuing.

ACTUAL, 2026-09-04: **PASS.** 404.

```js
G5.post("2.14 / 14 uninvite", "/api/instructor/uninvite", { email: G5.ids.B1_INVITE });
```

**EXPECT 404**, "That email is not on the invite list."
**IF IT SUCCEEDED:** re-invite the address from B1's Invite Users page.

ACTUAL, 2026-09-04: **PASS.** 404.

```js
G5.post("2.14 / 15 choose", "/api/instructor/scaffold/choose", { winnerId: G5.ids.B1_CANDIDATE });
```

**EXPECT 404**, "That candidate was not found. It may already be deleted."
**IF IT SUCCEEDED:** B1's undecided generation now has a winner and its sibling
is deleted, which also removes item 20's discardable rows. Tell CC before going
on, because the discard test then needs a fresh generation.

ACTUAL, 2026-09-04: **PASS.** 404.

```js
G5.post("2.14 / 16 disable", "/api/instructor/scaffold/disable", { scenarioId: G5.ids.B1_WINNER });
```

**EXPECT 404**, "That persona was not found."
**IF IT SUCCEEDED:** B1's live persona is switched off. Switch it back on.

ACTUAL, 2026-09-04: **PASS.** 404.

```js
G5.post("2.14 / 17 edit", "/api/instructor/scaffold/edit", { candidateId: G5.ids.B1_CANDIDATE, edits: {} });
```

**EXPECT 404**, "That candidate was not found. It may already be deleted."

ACTUAL, 2026-09-04: **PASS.** 404.

```js
G5.post("2.14 / 18 discard", "/api/instructor/scaffold/discard", { groupId: G5.ids.B1_GROUP });
```

**EXPECT 404**, "That generation was not found. It may already be discarded."
**IF IT SUCCEEDED:** B1's undecided candidates are gone and item 20 needs a fresh
generation first.

ACTUAL, 2026-09-04: **PASS.** 404. B1's undecided pair survives, which is what
item 20b needs.

```js
G5.post("2.14 / 19 chain", "/api/instructor/scaffold/generate", { chainFromScenarioId: G5.ids.B1_GATEKEEPER });
```

**EXPECT 404**, "That gatekeeper persona was not found." Skip this line and note
it if B1's generation produced no gatekeeper.
**IF IT SUCCEEDED:** a new persona was created in B2 carrying B1's case. Discard
it from B2's Recent generations.

ACTUAL, 2026-09-04: **PASS.** 404.

**2.14 IS COMPLETE, EIGHT RUN AND ONE NOT RUNNABLE, AND IT IS THE BLOCK GATE 6
ADDED TO THIS MATRIX.** Every write route refused a target in the caller's OWN
other class, which is the check that Gate 6's friendlier page answer did not leak
into the write paths. **The four detail pages name the owner's other class and
every route refuses it**, and that asymmetry is deliberate: a page is somewhere a
person navigates to, and a route is reached from a page that is already scoped.
2.11 and this block are the two halves of one claim, and either alone would have
been consistent with a bug.

**Item 20's own-other-class form is not run here.** It is run properly at the
next-but-one step, because "discard all" takes no target id: the whole test is
which class it reaches, and that is what the step below measures.

### 2.15 THE COOKIE-TAMPER MATRIX. This is the item that certifies Gate 6.

The working class is remembered in a cookie called `relii_working_class`. It is
httpOnly, so no page script can touch it, but the person holding it can edit it
by hand, which is exactly why the server re-checks it against
`classes.instructor_id` on every request.

**In Safari:** Develop, Show Web Inspector, **Storage** tab, **Cookies**,
`relii.vercel.app`. Find `relii_working_class` and double-click its **Value**.

**Work in B2 before you start**, so the fallback (B's oldest class, B1) is
visibly different from where you were. Tampering while already in B1 would make a
correct fallback indistinguishable from nothing happening.

Do all three states below, and after **each** one load **all five** instructor
pages:

```
/instructor
/instructor/scaffold
/instructor/assignments
/instructor/roster
/instructor/invites
```

**State 1: paste A's historical class id** (`A_CLASS_1`).
**State 2: paste nonsense**, for example `not-a-uuid`.
**State 3: delete the cookie entirely.** This is also the state every instructor
is in on their first page load after a deploy, so it has to be the ordinary one.

**EXPECT, in all three states and on all five pages:** the "Working in" line says
**B1**, and every surface shows **B1's content** (2 students, B1's assignment,
B1's generations). **No page may show a single row of A's data.** Each refusal
writes a line to the Vercel function log beginning `Gate 6 refused a stored class selection`. Seeing those is confirmation, not a problem.

ACTUAL (state 1, A's class id, five pages), 2026-09-04: **PASS.** Every page fell
back to B1 and showed B1's content. No row of A's anywhere.
ACTUAL (state 2, nonsense, five pages), 2026-09-04: **PASS.** Same fallback.
ACTUAL (state 3, cookie deleted, five pages), 2026-09-04: **PASS.** Same fallback,
which is also the ordinary state every instructor is in on a first page load.

**Then the route half, with the cookie still set to state 1 (A's class id):**

```js
G5.get("2.15 video, tampered",      "/api/instructor/submission/" + G5.ids.A_SUB + "/video");
G5.get("2.15 transcript, tampered", "/api/instructor/submission/" + G5.ids.A_SUB + "/transcript");
G5.get("2.15 csv, tampered",        "/api/instructor/submission/" + G5.ids.A_SUB + "/csv");
```

**EXPECT: status 404 on all three**, exactly as in items 2 to 4. A hand-edited
cookie must get the caller nothing at all.

ACTUAL, 2026-09-04: **PASS.** 404 on all three with the cookie still naming A's
class.

==> **THIS IS THE HIGHEST-VALUE RESULT IN THE RUN, AND IT IS WHAT CERTIFIES GATE
6.** Gate 3a's `getInstructorClassId()` DERIVED the working class from the
signed-in user, so the browser could not influence it. Gate 6 replaced it with a
REMEMBERED CHOICE, and anything that carries a choice is editable by the person
holding it. Without a re-check on every request, one hand-edited cookie would have
pointed every scoped read and every write on the instructor surface at another
instructor's class and undone five gate pieces in one line.

**Three tampered states across five pages and three routes, and the caller got
nothing but their own oldest class every time.** The fallback is a class B
provably owns rather than "no filter", which is the only direction this can fail
in safely. <==

**Now put the cookie back** by using the picker in the app (select B1, then B2 as
you like). Do not hand-edit it back.

ACTUAL (picker works normally again), 2026-09-04: **PASS.** Restored through the
app rather than by hand.

### Item 20. "Discard all" counts and deletes the WORKING class only

**Corrected on 2026-09-04 against the real data.** B2 holds ONE persona, because
choosing a winner switches it on and deletes the losing candidate, so **B2 has
nothing discardable at all**. That makes the test cleaner rather than weaker, and
it splits into two halves that have to be run in this order.

**B1 holds the discardable rows**: its undecided generation, the pair with no
winner chosen. Those two rows are what must not be reachable from B2, and what
must be deleted from B1.

#### 20a. The count half. Working in B2.

```js
G5.post("20a preview from B2", "/api/instructor/scaffold/discard-all", { preview: true });
```

**EXPECT:** `deletable: 0` and an **empty** `names` **list**. **If a single one of
B1's persona names appears in that list, stop.** The count is not scoped to the
working class, and the delete would not have been either.

ACTUAL, 2026-09-04: **PASS.** Status 200 with
`deletable: 0, live: 1, used: 0, names: [], liveNames: ["Tyson"]`.

**Status 200 is correct here and is not a failure to refuse:** a preview is a
successful read, and the scoping is carried in the payload rather than the status.
Worth writing down in a file where almost every other expected answer is a 4xx.

**THE STRONGEST PART OF THIS ANSWER IS** `live: 1`**, AND IT WAS NOT PREDICTED.** B1's
Alex is switched on as well, so a sweep ranging over every class the instructor
owns would have reported `live: 2` and listed both Lindas under `names`. It
reported one live persona, B2's own Tyson, and nothing deletable. **That is the
working class being the boundary, measured rather than asserted.**

```js
G5.post("20a confirm from B2", "/api/instructor/scaffold/discard-all", { confirm: "DISCARD" });
```

**EXPECT:** `ok: true` with `deleted: 0`. Nothing was there to delete.

**Then switch to B1 and open Recent generations. EXPECT:** the undecided
generation is still there with both candidates. A discard run from B2 that
reached into B1 is the failure this half exists to find.

ACTUAL, 2026-09-04: **PASS.** The confirm returned `deleted: 0`, and B1's
undecided pair was still intact afterwards.

#### 20b. The delete half. Working in B1.

The count half proves the sweep does not reach outside the working class. This
proves it still works inside it, and it is the half that answers the original
item: **"as B, counts and deletes B's rows only, and A's candidate count is
unchanged afterwards."**

**Run 2.14 before this**, because 2.14 aims at `B1_GROUP` and this step deletes
it.

```js
G5.post("20b preview from B1", "/api/instructor/scaffold/discard-all", { preview: true });
```

**EXPECT:** `deletable: 2`, naming B1's two undecided candidates and **nothing
else**. B1's chosen winner must appear under `live`, not under `deletable`, and
no name from B2, B3 or any class of A's may appear anywhere in the answer.

ACTUAL, 2026-09-04: **PASS.** Both Lindas deletable, Alex under `live`, no Tyson
and nothing of A's.

```js
G5.post("20b confirm from B1", "/api/instructor/scaffold/discard-all", { confirm: "DISCARD" });
```

**EXPECT:** `ok: true`, `deleted: 2`. B1's winner and its assignment are
untouched.

ACTUAL, 2026-09-04: **PASS.** `deleted: 2`, winner and assignment untouched.

**Together, 20a and 20b are the whole of item 20, and neither alone would do.** A
sweep that deletes nothing anywhere passes 20a. A sweep that deletes everything
the instructor owns passes 20b. Only the pair separates a scoped sweep from a
broken one.

**A's counts are the real check on this item and they are re-run by SQL at step
4.3.** They must be identical to step 0.6.

ACTUAL (B1's Recent generations afterwards, and the assignment still there),
2026-09-04: **PASS.** A's counts are the real check on this item and are confirmed
separately at step 4.3.

## Group 1, items 11 to 19. Writes and deletes aimed at A.

**Read this paragraph before pasting anything in this block.**

Every target below is a real row in A's real class, so the class guard is tested
at full strength. **What has been chosen is the consequence of a failure, not the
strength of the test.** Each target either sits behind a second, independent
guard, or is a throwaway that can be recreated in seconds. For each item, the
line marked **"IF THE GUARD FAILED"** is the signature to look for: seeing it
means the class guard did not fire, and it is an immediate stop.

### Item 11. Delete A's assignment

Target: A's assignment that **has sessions under it**, with an empty body.

```js
G5.post("item 11 assignment delete", "/api/instructor/assignment/" + G5.ids.A_ASSIGNMENT + "/delete", {});
```

**EXPECT:** status **404**, "That assignment was not found. It may already be
deleted."

**IF THE GUARD FAILED:** status **409** with "This assignment has student work.
Reload the page and use the strong confirmation to delete it." and an `inUse`
count. Nothing was destroyed (the in-use guard caught it), but the class guard
did not fire. **Stop the run.**

**What would have been destroyed had both guards failed:** the assignment, every
submission and practice under it, and each of their recordings in Storage.

ACTUAL, 2026-09-04: **PASS.** 404, "That assignment was not found." Not the
in-use 409, so the class guard fired first and the six sessions under that
assignment were never in play.

### Item 12. Reset A's submission

Target: A's **scored** submission, with `type: "interrupted"`.

```js
G5.post("item 12 reset", "/api/instructor/submission/" + G5.ids.A_SUB + "/reset", { type: "interrupted" });
```

**EXPECT:** status **404**, "That submission was not found. It may already be
reset."

**IF THE GUARD FAILED:** status **409** with "This attempt cannot be reset: it is
not a locked, interrupted submission." Nothing destroyed, class guard did not
fire. **Stop the run.**

**What would have been destroyed had both guards failed:** the submission row and
its recording.

ACTUAL, 2026-09-04: **PASS.** 404. Not the "not a locked, interrupted submission"
409, so the refusal came from the class check rather than the qualification check
standing in for it.

### Item 13. Delete A's student

Target: the **Gate 6 throwaway student**, not one of the four real ones.

```js
G5.post("item 13 delete student", "/api/instructor/delete-student", { studentId: G5.ids.A_STUDENT });
```

**EXPECT:** status **404**, "That student was not found."

**IF THE GUARD FAILED:** `ok: true`. This item has no second guard, so a failure
here **destroys the throwaway account and its sessions**. That is why the target
is the throwaway: it is re-invitable and re-registerable in a couple of minutes.
**Stop the run.**

ACTUAL, 2026-09-04: **PASS.** 404. **This is the item with no second guard**, so
the 404 is the only thing that stood between the request and student3's account.

### Item 14. Withdraw A's invite

Target: the **canary** pending invite created for this run.

```js
G5.post("item 14 uninvite", "/api/instructor/uninvite", { email: G5.ids.A_CANARY_INVITE });
```

**EXPECT:** status **404**, "That email is not on the invite list."

**IF THE GUARD FAILED:** `ok: true`, and one pending invite row is gone. Recreate
it from A's Invite Users page and **stop the run.**

ACTUAL, 2026-09-04: **PASS.** 404. The canary invite survives, which 2.16 needs.

### Item 15. Choose one of A's candidates as a winner

Target: **Alex's scenario id**. Alex is a real row in A's historical class, so the
class guard is tested exactly as written, and Alex is defended a second time by
the "was not created by the AI Persona Framework" check that sits immediately
after it.

```js
G5.post("item 15 choose", "/api/instructor/scaffold/choose", { winnerId: G5.ids.ALEX });
```

**EXPECT:** status **404**, "That candidate was not found. It may already be
deleted."

**IF THE GUARD FAILED:** status **400** with "That scenario was not created by
the AI Persona Framework, so it cannot be chosen here." Nothing changed, class
guard did not fire. **Stop the run.**

**What would have happened against a real candidate:** that candidate switched
on and its losing sibling deleted, inside A's class.

ACTUAL, 2026-09-04: **PASS.** 404, not the 400 naming the AI Persona Framework, so
the class check refused Alex before the hand-written check ever saw the row.

### Item 16. Switch off one of A's personas

Target: **Alex**, for the same reason.

```js
G5.post("item 16 disable", "/api/instructor/scaffold/disable", { scenarioId: G5.ids.ALEX });
```

**EXPECT:** status **404**, "That persona was not found."

**IF THE GUARD FAILED:** status **400** with "That scenario was not created by
the AI Persona Framework, so it cannot be switched off here." **Stop the run.**

**What would have happened against a generated winner:** A's live persona goes
dark for A's students until somebody notices and switches it back on.

ACTUAL, 2026-09-04: **PASS.** 404, not the 400. Alex stays switched on.

### Item 17. Rewrite one of A's candidates

Target: **Alex**, same reason. This route rewrites the hidden text a role-play
actually runs on, which is why it is the one write in the scaffold set with a
genuinely silent failure mode.

```js
G5.post("item 17 edit", "/api/instructor/scaffold/edit", { candidateId: G5.ids.ALEX, edits: {} });
```

**EXPECT:** status **404**, "That candidate was not found. It may already be
deleted."

**IF THE GUARD FAILED:** status **400** naming the AI Persona Framework. **Stop
the run.**

ACTUAL, 2026-09-04: **PASS.** 404, not the 400. Alex's hidden prompt is untouched.

### Item 18. Discard one of A's generations

Target: **A_GROUP_18**, chosen at query 0.4b. A has no generated group with a
switched-on winner, so the second guard here is the other one the route offers: a
group whose candidates have been role-played or assigned cannot be discarded. If
0.4b found no such group, this item runs undefended and 0.4b records the decision.

```js
G5.post("item 18 discard", "/api/instructor/scaffold/discard", { groupId: G5.ids.A_GROUP_18 });
```

**EXPECT:** status **404**, "That generation was not found. It may already be
discarded."

**IF THE GUARD FAILED, with a defended target:** status **409** beginning "This
generation has been role-played", and it will **name A's persona**, which is
itself a leak. Nothing was destroyed. **Stop the run.**

**IF THE GUARD FAILED, with an undefended target:** `ok: true` and a `deleted`
count. Those draft candidates of A's are gone and cannot be recovered. **Stop the
run** and record exactly which rows went.

ACTUAL, 2026-09-04: **PASS.** 404, not the 409 naming a role-played persona, and
Leslie's group is intact.

### Item 19. Chain a new persona from A's gatekeeper

Nothing is destroyed by this one either way. If it wrongly succeeded it would
copy A's stored case details into a new persona in **B's** class, which is a leak
of A's generated content and is the finding.

```js
G5.post("item 19 chain", "/api/instructor/scaffold/generate", { chainFromScenarioId: G5.ids.A_GATEKEEPER });
```

**EXPECT:** status **404**, "That gatekeeper persona was not found."

**IF THE GUARD FAILED:** status **400**, "Choose and switch on the gatekeeper
first, then generate its decision maker." Nothing was generated and nothing
leaked, because A's only gatekeeper is switched off, but the class guard did not
fire. **Stop the run.**

**IF BOTH FAILED:** a 200 and a new persona in B's class carrying A's case
details. Discard it from B's Recent generations and **stop the run**.

ACTUAL, 2026-09-04: **PASS.** 404, not the 400 about switching the gatekeeper on.
Nothing was generated and none of A's case text reached B's class.

**ITEMS 11 TO 19 ARE COMPLETE AND EVERY ONE REFUSED WITH 404.**

**READ THE 404s AGAINST THE SIGNATURES THAT DID NOT APPEAR, BECAUSE THAT IS WHAT
MAKES THEM EVIDENCE.** Every target was a real row in A's real class, chosen so a
failed class guard would be caught by a second one: an in-use assignment, a scored
submission asked to be reset as interrupted, Alex three times, a role-played
generation group, a switched-off gatekeeper. **Not one of those second guards ever
spoke.** Had the class guard failed, the answer would have been a 409 or a 400
from the backstop instead, and the run would have stopped with nothing destroyed.
The 404s mean the first guard did the work.

**Items 13 and 14 had no backstop at all**, which is why their targets were a
zero-session account and a throwaway invite rather than anything of Tom's.

### 2.16 The capstone: a tampered cookie AND a target in A's class

Everything above used an honest cookie. This is the two things combined, and it
is the single strictest request in the run. **It is safe because the target is
the canary invite**, which takes ten seconds to recreate.

**Its precondition is item 22, not item 14.** Item 14 answered 404, which shows
only that B could not see the row, not that the row is there; a 404 here against
a row that had already been deleted would prove nothing at all. **Item 22's 409,
"was invited by another instructor", can only be produced by a row that exists
and belongs to A.** If item 22 did not return that exact message, stop and sort
that out before running this.

1. Set `relii_working_class` by hand to **A_CLASS_1** again (Storage, Cookies).
2. Confirm a page still shows B1, as in 2.15.
3. Then:

```js
G5.post("2.16 tampered uninvite", "/api/instructor/uninvite", { email: G5.ids.A_CANARY_INVITE });
```

**EXPECT:** status **404**, "That email is not on the invite list."

**IF THE GUARD FAILED:** `ok: true`, and the cookie alone moved a write into
another instructor's class. That is the failure the whole of Gate 6 exists to
prevent. Recreate the invite and **stop the run.**

Put the cookie back with the picker afterwards.

ACTUAL, 2026-09-04: **PASS.** 404, "That email is not on the invite list." The
canary invite is still on A's list. Cookie restored through the picker.

==> **THIS IS THE STRICTEST SINGLE REQUEST IN THE RUN AND IT COMBINES THE TWO
THINGS THAT HAD ONLY BEEN TESTED SEPARATELY.** 2.15 tampered with the cookie and
asked for READS. Items 11 to 19 asked for WRITES with an honest cookie. This is a
WRITE, with a TAMPERED cookie, aimed at a row that provably exists in A's class.

**Item 22 is what makes the 404 mean anything**, and item 14's 404 would not have:
a 404 against a row that had already been deleted proves nothing at all. Item 22's
409, "was invited by another instructor", can only be produced by a row that
exists and belongs to somebody else, so the target was known to be live when this
ran. <==

## Group 3 as B. The super admin surface aimed at as an ordinary instructor.

Everything under `/admin` reads with the service-role key, and the only thing
between an ordinary instructor and every class in the system is
`requireSuperAdmin()`. It is worth aiming at directly rather than trusting a
missing nav link.

### Item G3.5. B has no Administration link and cannot reach the page

Confirm there is **no Administration link** in B's nav, then put this in the
address bar:

```
/admin
```

**EXPECT:** B lands back on **/instructor**. Not the admin overview, and not an
error page.

ACTUAL, 2026-09-04: **PASS.** No Administration link in B's nav, and the direct
address bounced to /instructor. PASS

Then try a class page directly:

```
/admin/class/b03df6d8-8485-4d27-a712-b78d8bfc9453
```

**EXPECT:** the same bounce back to /instructor.

ACTUAL, 2026-09-04: **PASS.** Bounced, with A's historical class id in the
address. PASS

### Item G3.6. B cannot reach the delete route at all

```js
G5.post("G3.6 delete as ordinary instructor",
        "/api/admin/class/" + G5.ids.A_CLASS_1 + "/delete", { confirm: "REMOVE" });
```

**EXPECT:** status **403**, "Only a super admin can delete a class." **This is
the one request in the run aimed at the historical class id**, and it is safe
because the super admin check runs first, before the body is even read. A 400 of
any kind here would mean the check did not fire. **Stop the run** if it is
anything but 403.

ACTUAL, 2026-09-04: **PASS.** 403, "Only a super admin can delete a class."

**A 403 IS THE RIGHT ANSWER HERE, WHILE A 403 ANYWHERE IN GROUP 1 WOULD HAVE BEEN
A FAILURE, AND THAT IS NOT A CONTRADICTION.** Group 1's 404s hide whether a row
exists in another instructor's class, because those requests ask about somebody
else's DATA. This one asks about the caller's own ROLE, which they already know,
so refusing plainly leaks nothing. **The danger signal here was a 400**: reaching
the token checks at all would have meant the super admin guard never ran.

### Item G3.7. The other admin routes refuse too

```js
G5.post("G3.7 add instructor", "/api/admin/instructor/add", { email: "g5-should-never-work@example.com" });
G5.post("G3.7 export",         "/api/admin/class/" + G5.ids.B3 + "/export", {});
```

**EXPECT:** status **403** on both, each naming only a super admin. The export
line is aimed at B's own empty class on purpose: B owns it, and must still be
refused, because the admin surface is not "your classes", it is "every class".

ACTUAL, 2026-09-04: **PASS.** 403 on both.

**The export line is the one worth having run.** B owns B3 outright and is still
refused, because `requireSuperAdmin()` asks what you ARE and not what you own.
Everything under /admin reads with the service-role key and nothing stands behind
that single guard, which is why it was aimed at directly rather than trusted
because the nav link is absent.

**STEP 2 IS COMPLETE. Nothing in it failed.**

## The remaining Gate 6 handoff items, still as B



### H8. The add-student route refuses a student from another instructor's class

**Target the student named on A_SUB in query 0.3**, not just any of A's students.
That student has at least one session, and the reason matters: the route refuses
a student from another instructor's class first, and refuses a student who has
already done work second. Aiming at a student **with** work means a failure of the
first guard is caught by the second, and nothing moves either way.

Roster, **Add an existing student**, type that address, and add. Or:

```js
G5.post("H8 add A's student", "/api/instructor/add-student", { email: "PASTE THE STUDENT ON A_SUB" });
```

**EXPECT:** status **409**, "... already belongs to another instructor's class, so
they cannot be added here. Ask your administrator." It must point at the
administrator and must **not** name A or A's class.

**IF THE GUARD FAILED:** status **409** naming a **role-play count** instead
("... has already done N role-plays in their current class"). Nothing moved,
because the work guard caught it, but the cross-instructor guard did not fire.
**Stop the run.**

**If BOTH failed:** one of A's students is now in B's class, and their own results
page loses its title and its item labels. Move them straight back, and note that
the move back may itself be refused by the work guard, in which case CC needs to
know before anything else is attempted.

**The route's other three refusals** (no registered account, not a student, and
already did work in their current class) were all run in the Gate 6 click-through
on 2026-09-03. None of them is an isolation question, so only the cross-instructor
one is re-run here.

ACTUAL, 2026-09-04: **PASS.** 409 pointing at the administrator, naming neither A
nor A's class. **Not** the role-play-count 409, so the cross-instructor guard
fired first and the work guard was never needed.

### H9. Both invite paths refuse role = instructor from an ordinary instructor

Gate 6 built this ruling and ran it once. Confirming it here is two pastes,
because the point of the ruling is that the **server** holds the rule rather than
the form.

```js
G5.post("H9 single invite", "/api/instructor/invite",
        { email: "g5-a@example.com", role: "instructor" });
```

**EXPECT:** status **403**, "Only an administrator can invite an instructor. Ask
your administrator to add them."

ACTUAL, 2026-09-04: **PASS.** 403.

```js
G5.post("H9 bulk invite", "/api/instructor/bulk-invite",
        { csv: "g5-b@example.com,instructor" });
```

**EXPECT:** status **200** with `addedCount: 0` and one skipped row reading "Only
an administrator can invite an instructor". **A 200 that added the row is the
failure.**

ACTUAL, 2026-09-04: **PASS.** 200 with `addedCount: 0` and the row skipped for
that reason.

**Both were posted directly rather than driven through the forms, which is the
whole point of the ruling.** Before Gate 6 the single invite went from the browser
straight through the security rules, and the Gate 3b insert policy checks the
CLASS and says nothing whatsoever about the ROLE. A dropdown change alone would
have been a deterrent and not a rule. **STEP 2 IS NOW COMPLETE IN FULL.**

### H10. The relaxed reassign

**NOT RE-RUN, and the reason is scope rather than convenience.** Handing classes
between instructors is a super admin operation that changes ownership, and Gate 6
ran all five of its parts on 2026-09-03 including the name clash and the donor
fallback. **The one half of it that is an isolation question, the donor whose
remembered class is one they no longer own, is the same code path as 2.15 above**
(`resolveWorkingClassId` refusing a stored selection and falling back to the
oldest owned class), and 2.15 exercises it three times over.

ACTUAL: not re-run, covered by Gate 6 and by 2.15.

---



# Step 3. Signed in as a student. The column leak.

**Sign out of B completely and sign in as a student.** One of B's newly
registered students is the freshest choice.

This is the item with the nearer deadline. Every other item in this piece
protects against a second instructor. This one protects against the students
arriving the week of September 7, which is sooner. Gate 2 closed
`persona_system_prompt` and `scenario_context` at the column level with a revoke
and a per-column grant, and `gate-2-policies-tests.sql` verified **the grant
table**. That is a database check. **Nobody has ever signed in as a student and
asked the web API for the column.** It is the same shape of gap the whole gate
exists to close: a thing proved at the layer that was changed rather than at the
layer that consumes it.

Paste **the same browser-key preamble from step 2**, with the anon key again.

**EXPECT:** "session token: ... FOUND".

ACTUAL, 2026-09-04: **PASS.** "session token: ... FOUND".

### S1. The positive control. Run this first and do not skip it.

```js
SB.q("S1 positive control", "scenarios?select=id,title,persona_name");
```

**EXPECT:** status 200 and **real rows**, the personas of this student's own
class. **If this comes back** `[]` **or errors, stop.** Everything below is a denial,
and a denial proves nothing if the request was never authenticated as a student:
an unauthenticated request is denied too, for a completely different reason.

ACTUAL, 2026-09-04: **PASS.** Status 200 with a real row:

```
[{"id":"68bc4303-e5ae-4fdb-bcc4-0372631dc729",
  "title":"Presentation-Close: Alex (regional manager)",
  "persona_name":"Alex"}]
```

**Everything below is a denial and none of it would mean anything without this
line**, because an unauthenticated request is denied too, for a completely
different reason.

**It also corroborates item 20b independently.** B1 held three personas before the
run; the student can now see exactly one, Alex the winner, because 20b deleted the
two Lindas and nothing else.

### S2. The hidden prompt

```js
SB.q("S2 persona_system_prompt", "scenarios?select=persona_system_prompt");
```

**EXPECT:** a refusal, status **403** or **401**, with a **permission denied**
message. **The wording may name the column or it may name the table, and either
is a pass:** Postgres is not consistent about which it reports and PostgREST
passes it through. **The fact that decides it is that no rows come back.**
Coming back with rows, or with the column present and empty, is the failure.
Write down the exact wording you got.

ACTUAL, 2026-09-04: **PASS.** Status **403**, no rows:

```
{"code":"42501","message":"permission denied for table scenarios",
 "hint":"Grant the required privileges to the current role with:
         GRANT SELECT ON public.scenarios TO authenticated;"}
```

**THE MESSAGE NAMES THE TABLE, NOT THE COLUMN, AND THAT IS THE PASS.** The
expectation in this file was loosened to allow either wording on 2026-09-04,
before the run, precisely because Postgres is not consistent about which it
reports. Had it still demanded the column name, this correct result would have
been written down as a mismatch. **The fact that decides it is that no rows came
back.**

==> **DO NOT EVER FOLLOW THAT HINT.** Postgres prints it generically and it is
wrong here: `GRANT SELECT ON public.scenarios TO authenticated` is exactly the
whole-table grant that section 9 of `supabase/gate-2-policies.sql` REVOKED, and
running it would hand every student the hidden persona prompt and the case
context in one line. If this message ever appears in a log, the correct response
is to re-run section 9 of that file, which grants every column EXCEPT the two. <==

### S3. The case context

```js
SB.q("S3 scenario_context", "scenarios?select=scenario_context");
```

**EXPECT:** the same refusal, on the same terms: permission denied, no rows,
wording naming either the column or the table. Write down what you got.

ACTUAL, 2026-09-04: **PASS.** Status **403**, code 42501, same wording, no rows.

### S4. Everything at once

```js
SB.q("S4 select star", "scenarios?select=*");
```

**EXPECT:** a refusal. The whole-table read was revoked and handed back one
column at a time, so asking for all of them is refused. **A 200 here that returns
rows would mean the revoke is not in force.**

The related question, whether a column added since Gate 2 was ever granted, is
**not** answerable from this message, because a table-level denial names no
column at all. Query 4.4 in step 4 answers it properly.

ACTUAL, 2026-09-04: **PASS.** Status **403**, code 42501, same wording, no rows.
So the whole-table read is genuinely revoked rather than merely unused.

==> **S1 TO S4 ARE THE ITEM WITH THE NEARER DEADLINE, AND THIS IS THE FIRST TIME
THEY HAVE EVER BEEN RUN.** Gate 2 closed `persona_system_prompt` and
`scenario_context` with a revoke and a per-column grant, and
`gate-2-policies-tests.sql` verified **the grant table**. That is a database check.
**Nobody had ever signed in as a student and asked the web API for the column.**

Every other item in this file protects against a second instructor, a risk that
arrives if four colleagues opt in. **This one protects against the students
arriving the week of September 7**, and a student who could read
`persona_system_prompt` would read the persona's instructions, its objections and
its win condition before the role-play began.

It is the same shape of gap the whole gate exists to close: **a thing proved at
the layer that was changed rather than at the layer that consumes it.** <==

### S5. A student cannot reach the administration surface

```
/admin
```

**EXPECT:** the student lands back on **/student**. This is the second half of
Gate 4b handoff item 2, and neither half is about the security rules: everything
under /admin reads with the service-role key.

ACTUAL, 2026-09-04: **PASS.** Bounced to /student.

### S6. A student cannot reach the instructor surface

```
/instructor
```

**EXPECT:** back to /student.

ACTUAL, 2026-09-04: **PASS.** Bounced to /student.

**STEP 3 IS COMPLETE.** The two column denials are the headline. S5 and S6 close
Gate 4b handoff item 2, whose two halves were an ordinary instructor bounced to
/instructor (item G3.5) and a student bounced to /student (here).

---



# Step 4. Supabase SQL editor, after the run



## 4.1 Every query in the three files

Run each one and compare against the expectation written above it in the file.

- `supabase/gate-3b-tests.sql`, queries 1 to 6.
**EXPECT** on query 1: `still_on_is_instructor` **0**,
`now_on_instructs_class` **8**, `on_can_read_class` **3**.
- `supabase/gate-4b-tests.sql`, every query.
**EXPECT** the export-token query to show B3's unused export from step 1.7.
- `supabase/gate-6-checks.sql`, queries 1 to 8.

ACTUAL (3b), 2026-09-04: **queries 1, 2, 3, 5 and 6 PASS. Query 4 CANNOT RUN, and
that is a finding rather than a failure.**

**Query 1: `still_on_is_instructor` 0, `now_on_instructs_class` 8,
`on_can_read_class` 3.** Identical to the Gate 3b pass of 2026-08-31, so no policy
drifted across Gate 4a, 4b, 6 or this run.

**Query 2:** the whole policy surface is as Gate 3b left it. Both `allowed_emails`
rules read `instructs_class (owner only)`, nothing anywhere reads
`is_instructor (NOT SCOPED)`, and `classes` and `class_members` still carry no
policies at all, which is correct: only the service-role key reads them and the
two helper functions are SECURITY DEFINER for that reason. **The "instructors add
to invite list" INSERT policy is present**, which matters because the kickoff
named it as a thing not to remove: it has no live browser user in the app any
more, and item 23 is what proved it is still a live backstop.

**Query 3:** both invite rules are `instructs_class(class_id)` and **neither is
`can_read_class`**. That difference is the one to check by eye, because
`can_read_class` also answers true for class MEMBERS, and using it would hand
every student the email address of every classmate.

==> **QUERY 4 FAILS TO RUN: "more than one row returned by a subquery used as an
expression". IT IS NOT AN ISOLATION FAILURE AND NO EVIDENCE IS LOST.**

The query was written when an instructor owned exactly one class, so its `my_class`
CTE is used as a scalar in `(select name from my_class)` and eight sibling
subqueries. **A now owns two classes, so it cannot run at all.** Gate 6 made
multiple classes normal operation and superseded this query without anybody
noticing, exactly as it superseded item 5 of the Gate 4b handoff, which at least
was rewritten in place.

**Query 5 answers the same question correctly and did run**, per class rather than
per instructor, so the Gate 5 baseline this query was built to provide is intact.

**Not fixed during the run, deliberately.** The kickoff forbids code changes unless
a test fails and the owner approves a fix, and fixing a checks file mid-run would
mean the items already run were measured against a different file. It is carried
to PROJECT_STATE as follow-up work. <==

**Query 5, and this is the headline of step 4:**

| class | owner | students | invites | scenarios | assignments | sessions |
|---|---|---|---|---|---|---|
| B1: A demo class | instructor@test.com | 2 | 3 | **1** | 1 | 3 |
| Relii Demo (Historical) | michaeltbanta@gmail.com | 4 | 8 | 7 | 3 | 41 |
| B2: Gate 6 Test class | instructor@test.com | 1 | 2 | 1 | 1 | 0 |
| Pro Selling test | michaeltbanta@gmail.com | 1 | 1 | 0 | 0 | 0 |
| B3: The demo class | instructor@test.com | 0 | 0 | 0 | 0 | 0 |

**BOTH OF A'S CLASSES ARE IDENTICAL TO STEP 0.2 IN EVERY COLUMN.** Nine writes
were aimed at A's real data, plus a tampered-cookie write, plus three crafted
delete requests, and not one row of A's moved.

**The single number that changed anywhere is B1's scenarios, 3 down to 1**, which
is item 20b deleting the two Lindas and nothing else. It is the only intended
change in the entire run, and it is in B's class.

**Query 6:** all three counts 0.

ACTUAL (3b), original:
ACTUAL (4b), 2026-09-04: **PASS, every query.**

**Query 1:** one super admin, michaeltbanta@gmail.com, verdict ok. **Instructor B
is not one**, which every refusal in group 3 depended on.

**Query 2:** `class_exports` exists with 0 policies and 0 foreign keys, as Gate 4b
built it.

**Queries 3 and 4:** every count 0. Nothing survives of the class Gate 4b deleted,
and the two audit logs that are meant to remain are correctly empty for it.

**Query 5:** `files_with_no_account` 0 and `known_orphans_from_earlier_testing` 0.
No recording in Storage belongs to an account that no longer exists.

**The class-less student canary: no rows.** This is the independent confirmation
that **item 13 destroyed nothing**: student3 still belongs to a class. A name here
would have been a person nobody can help.

**Query 6, the export tokens, and all three rows are accounted for:**

| taken | class | used_at | what it is |
|---|---|---|---|
| 2026-09-04 | B3: The demo class | null | **step 1.7's leftover**, counts all zero |
| 2026-09-02 | the Gate 4b throwaway | **set** | the completed cascade, still the only one |
| 2026-09-02 | Relii Demo (Historical) | null | Gate 4b's own substitution test |

==> **THE THIRD ROW IS THE ONE WORTH READING, AND IT VINDICATES THE OWNER'S B3
RULING RATHER THAN MERELY BEING TIDY.** It is an unused, live-issued delete token
for the historical class, and it has been sitting in the table since 2026-09-02.
The Gate 4b handoff predicted it and called it expected, which it is.

**It is harmless twice over, and both reasons matter.** The token TTL is one hour
and it is two days past. And its snapshot records 40 sessions, 18 recordings and 3
students against today's 41, 19 and 4, so the fingerprint check would refuse it
even if the clock had not.

**But the reason it is worth recording is what it demonstrates.** Both options
originally proposed for crafted request G3.3 would have minted or reused a token
for the historical class, and this row is a two-day-old example of exactly that
object lying around. Taking the export from B3 instead cost nothing and put no
live authorisation to destroy the historical class into existence. <==

ACTUAL (4b), original:
ACTUAL (6), 2026-09-04: **PASS, all eight.**

**Query 1 returns rows, and that is the feature working.** A owns 2 classes and B
owns 3. PROJECT_STATE carried this exact query from Gate 4b as a corruption signal
that "should always return no rows", because the old `getInstructorClassId()` took
an instructor's oldest class and stopped, so a second class meant one was silently
invisible. After Gate 6 it is normal operation and must not be "repaired".

**Query 3:** every count 0. No row belongs to nobody and no membership points at a
class that is gone.

**Query 4: no rows.** Every student is in exactly one class. The schema does not
enforce this (`class_members` is keyed on class and user, so two rows are
structurally legal); the application holds it, and Gate 4b's cascade delete relies
on it when deciding whether to delete an account.

**Query 5: no rows, and this is the one that could realistically have failed
today.** `/api/instructor/add-student` writes the membership first and moves the
invite row second, in two calls that cannot be one transaction, and H8 exercised
that route during this run. A disagreement here would mean the two halves of Gate
4b's cascade delete disagree about the same person.

**Query 6:** all three 0, including the third line, which is allowed to be
non-zero and is informational.

**Query 7: no rows.** Every class owner is an instructor. The foreign key
guarantees a class has an owner; nothing enforces the role, so it is worth asking.

**Query 8: 0, 8 and 3**, identical to query 1 of the Gate 3b file and to the Gate
3b pass of 2026-08-31. Two independent readings of the same fact in one run.

ACTUAL (6), original:

## 4.2 Query 2 against the copy kept at step 0.2

**EXPECT:** B's classes carry the content built for this run, A's two classes are
**unchanged in every column**, and **no row moved out of any class**.

ACTUAL, 2026-09-04: **PASS. Exactly one cell in the entire database changed.**

| class | rubrics | personas | assignments | sessions | recordings | invites | students |
|---|---|---|---|---|---|---|---|
| B1: A demo class | 0 | **1** (was 3) | 1 | 3 | 1 | 3 | 2 |
| B2: Gate 6 Test class | 0 | 1 | 1 | 0 | 0 | 2 | 1 |
| B3: The demo class | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Relii Demo (Historical) | 1 | 7 | 3 | 41 | **19** | 8 | 4 |
| Pro Selling test | 0 | 0 | 0 | 0 | 0 | 1 | 1 |

**BOTH OF A'S CLASSES ARE IDENTICAL TO STEP 0.2 IN ALL SEVEN COLUMNS.** So are B2
and B3. The only difference anywhere is **B1's personas, 3 down to 1**, which is
item 20b deleting the two Lindas: the single intended change in the run, in B's
own class, made by B.

**What that number is set against.** Between the two readings the run aimed nine
write and delete requests at A's real data, one more with a hand-edited class
cookie, three crafted class-delete requests, and a cross-class insert straight at
the database with a browser key. **Nothing moved.**

==> **THE `recordings` COLUMN IS THE ONE TO READ TWICE, AND IT IS WHY IT WAS ADDED
TO THIS QUERY ON 2026-09-03.** It is not redundant with `sessions`. **A recording
is a FILE IN STORAGE, which no foreign key protects and no cascade removes**,
which is exactly why Gate 4b's delete has to remove Storage by hand and before any
row. A class whose sessions survived but whose recordings did not would show up
nowhere else in this file. **A's 19 recordings are still 19.** <==

## 4.3 Item 20's real check: A's candidate counts

Re-run query **0.6**.

**EXPECT:** both numbers **identical** to what step 0.6 recorded. B ran "Discard
all" while this run was in progress; if either number moved, `planBulkDiscard`
reached outside the working class.

ACTUAL, 2026-09-04: **PASS. 5 and 0 for the historical class, 0 and 0 for Pro
Selling test, identical to step 0.6 in every figure.**

**This is item 20's real check and it is stronger than the two console answers.**
20a and 20b reported what the route SAID it would touch. This measures what
actually moved, from outside the application, after B ran "Discard all" twice in
two different classes. A's five generated candidates are all still there.

## 4.4 Was every column of scenarios granted back?

The browser test in step 3 proves the two secret columns are closed. It cannot
prove the opposite half: that nothing else was closed by accident. Section 9 of
`supabase/gate-2-policies.sql` revokes the whole table and grants back every
column except two, **and a column added to** `scenarios` **after that file last ran
is granted to nobody**, so ordinary users cannot read it and any page that tries
fails with "permission denied for column".

```sql
select c.column_name as ungranted_column
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name   = 'scenarios'
   and c.column_name not in ('persona_system_prompt', 'scenario_context')
   and not exists (
     select 1
       from information_schema.column_privileges p
      where p.table_schema   = 'public'
        and p.table_name     = 'scenarios'
        and p.column_name    = c.column_name
        and p.grantee        = 'authenticated'
        and p.privilege_type = 'SELECT'
   );
```

**EXPECT: no rows.** A row here is a real finding rather than a test failure, and
the repair is to re-run section 9 of `supabase/gate-2-policies.sql`, which is
written as a loop precisely so a second run fixes exactly this drift. Report it,
do not fix it in flight.

ACTUAL, 2026-09-04: **PASS, no rows.** Every column of `scenarios` except the two
secret ones is granted to `authenticated`, so nothing has been added to that table
since Gate 2 ran without being granted back.

**This is the half S2 to S4 could not prove and it needed asking separately.** The
browser test showed the two columns are CLOSED. A table-level permission-denied
message names no column at all, so it can never show that nothing ELSE was closed
by accident. Together they say: exactly two columns are shut, and they are the
right two.

## 4.5 Item 23's standing check

Query **6 of** `gate-6-checks.sql`.

**EXPECT:** the first two lines **0**. The third is informational and is allowed
to be non-zero. Combined with item 23 above, this says both that no cross-class
reference exists **and** that one cannot be created.

ACTUAL, 2026-09-04: **PASS.** All three lines 0, as recorded under step 4.1's
gate-6 results. **With item 23, this closes the last of the two matrix entries
that were carried as design questions rather than tests**: no cross-class
reference exists, and the database refuses one when an instructor writes it
directly.

---



# Items settled rather than tested

- **Item 22, the invite collision.** Settled by the multi-class rulings of
2026-09-02: a student is in one class at a time, so `allowed_emails.email`
stays a primary key. Item 22 above confirms the message is the legible one; it
does not re-open the question.
- **Item 23, the cross-class reference question.** Settled by Gate 4a with a
constraint rather than a creation-time check. Item 23 above confirms the
constraint bites.
- **Group 3 item G3.4, the spent delete token.** Skipped. It needs a completed
cascade delete to exist at all, Gate 4b proved it against a throwaway on
2026-09-02, and the owner ruled on 2026-09-03 not to build a throwaway class
for it.
- **Gate 6 handoff item 10, the relaxed reassign.** Not re-run; see H10 above.



# What this run produced for later, and it is not a to-do list of failures

**Nothing here is a failure of the isolation model.** Both items came out of
running the checks rather than out of anything refusing wrongly.

**1. Query 4 of `supabase/gate-3b-tests.sql` cannot run any more, and it should be
fixed.** It errors with "more than one row returned by a subquery used as an
expression". It was written when an instructor owned exactly one class and uses
its `my_class` CTE as a scalar in nine places. Gate 6 made several classes normal
operation and superseded it silently, unlike item 5 of the Gate 4b handoff, which
was rewritten in place with a note explaining the reversal. **The fix is to make
it per class, which is what query 5 of the same file already does.** Not done
during the run, because editing a checks file mid-run would mean the items already
measured were measured against a different file.

**2. The permission-denied message on `scenarios` carries a Postgres hint that
would undo Gate 2 if followed.** Recorded in full at S2. The message reads
`permission denied for table scenarios` with the hint `GRANT SELECT ON
public.scenarios TO authenticated`, which is exactly the whole-table grant that
section 9 of `supabase/gate-2-policies.sql` revokes. **Following that hint hands
every student the hidden persona prompt and the case context in one line.** The
right response is to re-run section 9, which grants every column except the two.
Worth a warning comment in `gate-2-policies.sql` itself, since the hint will be
read by whoever meets the error and it reads like an instruction.

**3. Optional cleanup, not a problem.** `class_exports` holds an unused delete
token for the historical class taken on 2026-09-02 by Gate 4b's substitution test.
It is dead twice over (an hour past its TTL by two days, and its fingerprint no
longer matches a class that has since grown), so it authorises nothing. It can be
left alone.

# If something fails

**A failure here is not a bug report, it is a build.** So:

1. **Stop the affected group and tell CC.** Nothing gets fixed in flight.
2. **Say what the failure proves and what it does not.** One route refusing
  wrongly is a different thing from a shared helper failing, and the second
   invalidates every item that went through it. Items 1 to 7, 11 to 19 and the
   cookie tamper all pass through `refuseOutsideClass` or `resolveWorkingClassId`;
   if either of those is what broke, every one of those items stops being
   evidence regardless of what it answered.
3. **A fix means the items that ran before it are no longer evidence**, exactly
  as a Gate 5 pass earned before Gate 6 would have been void. The re-run list
   gets written down before the fix is built.



# What a pass certifies, and what it does not

**RESULT, 2026-09-04: EVERY ITEM PASSED.** Nothing failed, nothing had to be fixed
in flight, and the only row that changed anywhere in the database was the two
candidates item 20b was supposed to delete, in B's own class.

**What was NOT run, and why, so the record is not read as wider than it is:**

- **Group 3's spent-token variant (G3.4).** Skipped by the owner's ruling of
  2026-09-03. It needs a completed cascade delete to exist at all; Gate 4b proved
  it against a throwaway on 2026-09-02.
- **Item 12 aimed at the caller's own other class.** Not runnable. A generated
  persona carries no rubric until Phase 2, so **B can hold no submission**, and the
  reset route reads `kind = "submission"`. Item 12 against A did run.
- **The relaxed reassign (H10).** Not re-run. Gate 6 ran all five of its parts on
  2026-09-03, and its one isolation half, the donor left holding a class they no
  longer own, is the same code path 2.15 exercised three times.

**It certifies** that as of the commit named at the top of this file, with the
data that existed on the day:

- A second instructor account cannot read, list, download, edit, delete or reset
anything belonging to the first, by page or by route or by browser key.
- One instructor's own surface follows the class they chose, and a hand-edited
class cookie gets the caller nothing but their own oldest class.
- A student cannot read the two hidden persona columns through the web API.
- The super admin surface refuses an ordinary instructor and a student.

**It does not certify** anything about a third instructor account, anything about
data created after the run, or anything about code written after this commit.
**It is a measurement of a build, not a property of the system.** The next piece
that touches `lib/class-scope.ts`, `lib/instructor-auth.ts` or any scoped read
puts this file back in question, exactly as Gate 6 would have voided a Gate 5 run
made before it.

**And one honest limit on the strongest items.** The targets in items 11 to 19
were chosen so that a failed class guard would be caught by a second guard, which
is why nothing was at risk. That makes each item a sound test of the class guard,
because every target was a real row in A's real class and the backstop signatures
never appeared. **It does not test the backstops themselves**, which is fine: they
are not what this gate is about, and Gate 4b tested the one that destroys things.