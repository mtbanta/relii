# Gate 5: isolation testing. Runbook and results.

**This one file is both the thing you run and the record of what happened.** One
file rather than two, so the record and the run can never drift apart. Work top
to bottom and write your answer on the `ACTUAL:` line under each item as you go.

- **Date of the run:** (fill in)
- **Commit tested:** (fill in, from the Vercel deployment)
- **Site:** relii.vercel.app, never localhost
- **Instructor A:** michaeltbanta@gmail.com (super admin, owns the historical
  class and the Gate 6 class)
- **Instructor B:** instructor@test.com (ordinary instructor, owns three classes,
  deliberately not a super admin)
- **Student used for the column test:** (fill in)

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
2. **`Promise {status: "pending"}` is not a spinner.** Safari prints the value of
   the expression at the instant you press return and never updates it. The
   answer arrives on a separate line underneath.
3. **No snippet here puts `await` on the right of a `const`.** Safari reads that
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

| Build | The item that consumes it |
|---|---|
| 2 registered students | 8 (Roster), 9 (enrolled reads 2), the picker sweep |
| 1 pending invite, never registered | 21's positive control, 8's pending list |
| 1 generated persona with a winner chosen | 10, and the assignment needs it |
| 1 assignment on that winner | 9's tile, group 2's `?assignment=` panel |
| 1 further generation left undecided (no winner) | 20 needs something discardable |
| 2 short text practices by those students | query 2's sessions column, and item 4b |
| optional: 1 voice and video practice | query 2's recordings column |

**B2 (second oldest). Where B stands while aiming at B1.**

| Build | The item that consumes it |
|---|---|
| 1 registered student | the sweep needs different numbers: 2 in B1, 1 in B2 |
| 1 generated persona with a winner, and 1 assignment on it | so B2's dashboard shows a tile reading 1 rather than an empty state |
| optional: 1 pending invite | makes the pending list visibly change on the sweep |

**B3. Completely empty. Do not put anything in it.** It is the third state in the
sweep and it is the class the export token in step 1 is taken from.

**Two throwaway addresses on A's side, both `+` aliases of your own inbox:**

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

**EXPECT:** two classes for michaeltbanta@gmail.com (historical first, the Gate 6
class second) and three for instructor@test.com. **The first instructor@test.com
row is B1, the second is B2, the third is B3.** Write the three ids down; the
cookie tamper test needs to know which is oldest.

ACTUAL:

## 0.2 The "before" picture

Run **query 2 of `supabase/gate-6-checks.sql`** and keep the output. It is what
"no row moved between classes" is checked against at the end.

**EXPECT, and this is the setup check the sweep depends on:** A's Gate 6 class
must show `assignments` of at least 1 and `students` of 1. **The dashboard's
enrolled tile only exists when the class has at least one assignment**, so if
that assignment is gone the 4-and-1 check quietly becomes "4 and no tile at all".
If it reads 0, stop and tell CC before going further.

ACTUAL:

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
- **A_GROUP_LIVE**: a `generation_group_id` that has at least one row with
  `enabled` = true. Items 5 and 18 aim at it. Item 18 is safe **because** that
  group has a switched-on winner.
- **A_CANDIDATE**: the `scenario_id` of a generated row with `enabled` = false.
  Item 6 aims at it.
- **A_GATEKEEPER**: the `scenario_id` of a generated row with `chain_role` =
  `gatekeeper` and `enabled` = true. Items 7 and 19 aim at it. **If there is no
  such row, use any generated enabled row instead** and note the substitution:
  the class guard runs before the gatekeeper-role check, so the expected answer
  is unchanged.

ACTUAL:

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

ACTUAL:

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

ACTUAL:

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
  A_SUB: "",          // step 0.3
  A_ASSIGNMENT: "",   // step 0.3
  A_CLASS_1: "",      // step 0.1, A's historical class
  A_CLASS_2: "",      // step 0.1, A's Gate 6 class
  B3: "",             // step 0.1, B's third and empty class
  NONSENSE: "11111111-2222-3333-4444-555555555555"
};
console.log("preamble loaded", G5.ids);
```

**EXPECT:** the ids print back with your values in them. If any is still an empty
string, fix it before going on. Every refusal below is meaningless if the request
was never aimed anywhere.

ACTUAL:

## 1.1 Positive control. Nothing below counts without this.

A refusal looks identical to a request that was never authenticated as who you
think it was, so each session starts with one thing that must **succeed**.

Working in the historical class, open the dashboard and then open one submission
from the table.

**EXPECT:** the dashboard renders with the tiles, and the submission page opens
with the transcript and the score on it.

ACTUAL:

## 1.2 A's picker sweep, and it has a concrete expected value

Switch the "Working in" picker between A's two classes and read these four
surfaces each time.

**EXPECT:**

| Surface | Historical class | Gate 6 class |
|---|---|---|
| Dashboard "of N enrolled" | **4** | **1** |
| Roster registered students | **4** | **1** |
| Manage Assignments | the historical assignments, Alex and Jordan | the Gate 6 assignment only |
| AI Persona Framework, Recent generations | the historical generations | the Gate 6 generation only |

**A number that is merely different is a weaker pass than a number that is
right.** The Roster must agree with the tile both times.

ACTUAL:

## 1.3 Group 2, item 1. The submission panel on the surface it matters most on

**Switch the picker to A's Gate 6 class**, then put A's historical submission in
the address bar:

```
/instructor/submission/<A_SUB>
```

**EXPECT:** the friendly panel, headed **"This submission is in another of your
classes"**, naming the historical class, with a **"Switch to ... and open it"**
button. **Not** a 404. This is a read and it destroys nothing.

ACTUAL:

## 1.4 The same answer on the dashboard's bookmark case

Still working in the Gate 6 class:

```
/instructor?assignment=<A_ASSIGNMENT>
```

**EXPECT:** the same panel, worded **"This assignment is in another of your
classes"**. Not a silent fallback to the Gate 6 class's own assignment.

ACTUAL:

## 1.5 The friendly answer must NOT have leaked into the routes

Still working in the Gate 6 class, paste the preamble and then:

```js
G5.get("1.5 video",      "/api/instructor/submission/" + G5.ids.A_SUB + "/video");
G5.get("1.5 transcript", "/api/instructor/submission/" + G5.ids.A_SUB + "/transcript");
G5.get("1.5 csv",        "/api/instructor/submission/" + G5.ids.A_SUB + "/csv");
```

**EXPECT: status 404 on all three**, with `{"error":"Submission not found."}`.
The friendly panel belongs on pages a person navigates to; a route is reached
from a page that is already scoped. **A status of 0 with type `opaqueredirect`
on the video line is a FAILURE**: it means the route minted a signed recording
link for a class you are not working in.

Then switch the picker back to the historical class and run the same three lines
again. **That is this item's positive control**, and the video line reads
differently from the other two: transcript and csv come back **200** with
content, while video comes back **status 0, type `opaqueredirect`**, because the
route mints a signed link and redirects to it and `redirect: "manual"` stops the
console from following it. In this direction that opaqueredirect is the pass.

ACTUAL:

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

ACTUAL:

### Item G3.2. A made-up token

```js
G5.del("G3.2 fake token", { confirm: "REMOVE", token: "00000000-0000-0000-0000-000000000000" });
```

**EXPECT:** status **400**, "That export is not valid. Export this class again."

ACTUAL:

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

Then aim it at the nonsense class id:

```js
G5.del("G3.3 substitution", { confirm: "REMOVE", token: G5.b3token });
```

**EXPECT:** status **400**, "That export was taken for a different class, so it
cannot authorise this deletion. Export this class." **That wording can only come
from the substitution check**, which is what makes this a pass rather than a
refusal for some other reason.

ACTUAL:

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

ACTUAL:

---

# Step 2. Signed in as instructor B. The bulk of the run.

Sign out of A and sign in as instructor@test.com. **Stay signed in as B for this
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
  A_SUB: "",           // 0.3  A's scored submission
  A_ASSIGNMENT: "",    // 0.3  A's assignment that HAS sessions
  A_GROUP_LIVE: "",    // 0.4  A's group with a switched-on winner
  A_CANDIDATE: "",     // 0.4  one of A's generated, not enabled candidates
  A_GATEKEEPER: "",    // 0.4  A's generated gatekeeper (or any generated enabled row)
  ALEX: "",            // 0.4  Alex's scenario id
  A_STUDENT: "",       // 0.5  the throwaway student's profile id in A's class
  A_CANARY_INVITE: "", // 0.5  the pending canary address in A's class
  A_CLASS_1: "",       // 0.1  A's historical class id
  B1: "", B2: "", B3: "",   // 0.1, oldest first
  B_PRACTICE: "",      // filled in at item 4b
  B1_GROUP: "",        // B1's undecided generation group id: open it from
                       //   Recent generations while working in B1 and copy the
                       //   id out of /instructor/scaffold/compare/<THIS-BIT>
  B1_ASSIGNMENT: ""    // B1's assignment id: Supabase,
                       //   select id, title from public.assignments
                       //    where class_id = '<B1>';
};
console.log("preamble loaded", G5.ids);
```

**EXPECT:** every id prints back filled in. An empty string means the request goes
nowhere and its refusal proves nothing.

ACTUAL:

## 2.2 Positive controls. Nothing below counts without these.

Working in **B1**:

1. The picker lists **exactly B's three classes** and none of A's.
2. The dashboard renders with tiles (not the "No assignments yet" empty state).
3. The Roster lists B's 2 students plus B, and B1's pending invite.
4. AI Persona Framework, Recent generations, lists B's generations.
5. Open one of B's own comparison pages from Recent generations. It renders.

**EXPECT:** all five. If the dashboard shows "No assignments yet", B1's assignment
was not built and items 9 and 2.13 cannot be run.

ACTUAL:

## Group 1, items 1 to 7. Reads aimed at A, all as B.

Every one of these must answer **"not found"** rather than **"forbidden"**. The
404 wording is deliberate: a 403 would confirm the row exists in somebody else's
class, which is a small leak of exactly the kind this gate closes.

### Item 1. A's submission detail page

Put this in the address bar:

```
/instructor/submission/<A_SUB>
```

**EXPECT:** the plain Next.js 404 page, reading **"This page could not be
found."** **Not** the friendly "in another of your classes" panel: that panel is
computed only from classes the caller owns, so a stranger must never see it.

ACTUAL:

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

ACTUAL (item 2):
ACTUAL (item 3):
ACTUAL (item 4):

### Item 4b. ADDED: a practice cannot be reached through the submission surface

This is the filter that shaped B's whole setup (`kind = "submission"` on both the
page and the download helper), so it is worth one direct attempt rather than
being taken on trust. **Aimed at B's own practice, so it is completely safe.**

Get a practice id: in Supabase, `select id, kind from public.sessions where
class_id = '<B1>';` and take a row whose `kind` is `practice`. Put it in
`G5.ids.B_PRACTICE`, then:

```
/instructor/submission/<B_PRACTICE>
```
```js
G5.get("4b video",      "/api/instructor/submission/" + G5.ids.B_PRACTICE + "/video");
G5.get("4b transcript", "/api/instructor/submission/" + G5.ids.B_PRACTICE + "/transcript");
G5.get("4b csv",        "/api/instructor/submission/" + G5.ids.B_PRACTICE + "/csv");
```

**EXPECT:** the 404 page, and **404 on all three routes**, even though this is
B's own session in B's own working class. A practice is not a submission and can
never be downloaded through these routes.

ACTUAL:

### Item 5. A's comparison page

```
/instructor/scaffold/compare/<A_GROUP_LIVE>
```

**EXPECT:** the plain 404 page. Not the friendly panel.

ACTUAL:

### Item 6. A's candidate edit page

```
/instructor/scaffold/edit/<A_CANDIDATE>
```

**EXPECT:** the plain 404 page.

ACTUAL:

### Item 7. A's gatekeeper chain page

```
/instructor/scaffold/chain/<A_GATEKEEPER>
```

**EXPECT:** the plain 404 page.

ACTUAL:

**STOP HERE IF ANY OF ITEMS 1 TO 7 DID NOT REFUSE.** A read that wrongly
succeeds tells you a guard is broken before any write is attempted, and every
write below aims at A's real data.

## Group 1, items 8 to 10. The listings.

### Item 8. B's Roster

Working in **B1**, open the Roster.

**EXPECT:** B's 2 registered students, B himself, and B1's pending invite.
**None of A's 4 students, none of A's pending invites, and not the canary
address.**

ACTUAL:

### Item 9. B's dashboard enrolled count

Still in **B1**.

**EXPECT:** the tile reads **"of 2 enrolled"**, matching the Roster. Not 4, not
5, not 6.

ACTUAL:

### Item 10. B's Recent generations

AI Persona Framework, still in **B1**.

**EXPECT:** B's own generations only. None of A's persona names anywhere on the
page.

ACTUAL:

## The browser key. Items 21, 22 and 23.

Items 1 to 10 went through the application. **These three go straight at the
database with an ordinary browser key**, which is the only thing the two Gate 3b
policies on `allowed_emails` actually protect against.

### The browser-key preamble

Paste the anon public key on the second line. **It is never saved to any file.**

```js
window.SB = {};
SB.url  = "https://cmpvyralyungfmjoteex.supabase.co";
SB.anon = "PASTE-THE-ANON-PUBLIC-KEY-HERE";
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

ACTUAL:

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

ACTUAL:

```js
SB.q("21 aimed at A", "allowed_emails?select=email,class_id&email=eq." + G5.ids.A_CANARY_INVITE);
```

**EXPECT:** `[]`, an empty list. The row exists; B cannot see it.

ACTUAL:

### Item 22. The invite collision message, confirmed rather than re-opened

This is settled by the multi-class rulings and was tested once in Gate 4a. Ten
seconds to confirm the message is still the legible one. From B's Invite Users
page, invite **A_CANARY_INVITE**.

**EXPECT:** a refusal reading **"... was invited by another instructor, so they
cannot be invited again. Ask your administrator."** It must **not** name A and
must not name A's class. Knowing an invite exists elsewhere is what lets you act;
knowing who holds it is not.

ACTUAL:

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
name **`assignments_scenario_same_class_fkey`**. The insert policy allows B to
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

ACTUAL:

## Group 2. Does B's own surface follow the class B chose?

A different question from group 1: not "can B reach A" but "does one instructor's
own surface follow the class they chose".

### 2.11 The panel on B's own other class, three surfaces

**Switch the picker to B2.** Then open each of these:

```
/instructor/scaffold/compare/<B1_GROUP>
/instructor/scaffold/edit/<one of B1's candidate ids>
/instructor/scaffold/chain/<B1's gatekeeper, if the generation made one>
/instructor?assignment=<B1_ASSIGNMENT>
```

**EXPECT:** the friendly panel each time, headed "This comparison / persona /
assignment is in another of your classes", naming **B1**, with a switch button.
**Not** a 404, and **not** a silent fallback to B2's own content.

The chain line is skippable if B's generation produced no gatekeeper; note it if
so.

ACTUAL:

### 2.12 The switch button actually works

On one of those panels, click **"Switch to B1 and open it"**.

**EXPECT:** the page opens on the thing you asked for, and the "Working in" line
now says B1. Nothing switched until you clicked.

ACTUAL:

### 2.13 B's picker sweep across three classes

Switch B1, B2, B3 and read every surface each time.

**EXPECT:**

| Surface | B1 | B2 | B3 |
|---|---|---|---|
| Roster, registered students | 2 | 1 | 0 |
| Roster, pending invites | 1 | 0 or 1 | 0 |
| Dashboard enrolled tile | 2 | 1 | "No assignments yet" |
| Manage Assignments | B1's assignment | B2's assignment | empty |
| AI Persona Framework, Recent generations | B1's generations | B2's generation | empty |
| Invite Users | works, targets B3 when B3 is selected | | |

**A surface that does not follow the picker is a surface that was missed.**

ACTUAL:

### 2.14 Items 11 to 19 aimed at B's OWN other class must still be REFUSED

The friendly answer belongs on pages a person navigates to. A route is reached
from a page that is already scoped, so the routes keep answering 404 for a
cross-class target **on purpose**. This is the check that item 1's friendlier
answer did not leak into the write paths.

**Work in B2 for this whole block, and aim everything at B1.** Nothing here can
reach A. Everything it could damage is B's own test data, and every line says
what to rebuild if it wrongly succeeds.

Fill in three more ids first, all of them B1's:

```js
G5.ids.B1_STUDENT = "";    // a B1 student's profile id (Supabase: select p.id, p.email
                           //   from public.class_members m join public.profiles p
                           //   on p.id = m.user_id where m.class_id = '<B1>';)
G5.ids.B1_INVITE = "";     // B1's pending invite address
G5.ids.B1_CANDIDATE = "";  // a candidate id in B1's undecided generation
G5.ids.B1_WINNER = "";     // B1's chosen, switched-on persona id
G5.ids.B1_GATEKEEPER = ""; // B1's gatekeeper, if the generation made one
```

**Every line below must answer 404.** Not a friendly panel, not a 200.

```js
G5.post("2.14 / 11 assignment delete", "/api/instructor/assignment/" + G5.ids.B1_ASSIGNMENT + "/delete", {});
```
**EXPECT 404**, "That assignment was not found."
**IF IT SUCCEEDED:** B1's assignment and any practices under it are gone. Rebuild
it before continuing and tell CC.

ACTUAL:

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

ACTUAL:

```js
G5.post("2.14 / 14 uninvite", "/api/instructor/uninvite", { email: G5.ids.B1_INVITE });
```
**EXPECT 404**, "That email is not on the invite list."
**IF IT SUCCEEDED:** re-invite the address from B1's Invite Users page.

ACTUAL:

```js
G5.post("2.14 / 15 choose", "/api/instructor/scaffold/choose", { winnerId: G5.ids.B1_CANDIDATE });
```
**EXPECT 404**, "That candidate was not found. It may already be deleted."
**IF IT SUCCEEDED:** B1's undecided generation now has a winner and its sibling
is deleted, which also removes item 20's discardable rows. Tell CC before going
on, because the discard test then needs a fresh generation.

ACTUAL:

```js
G5.post("2.14 / 16 disable", "/api/instructor/scaffold/disable", { scenarioId: G5.ids.B1_WINNER });
```
**EXPECT 404**, "That persona was not found."
**IF IT SUCCEEDED:** B1's live persona is switched off. Switch it back on.

ACTUAL:

```js
G5.post("2.14 / 17 edit", "/api/instructor/scaffold/edit", { candidateId: G5.ids.B1_CANDIDATE, edits: {} });
```
**EXPECT 404**, "That candidate was not found. It may already be deleted."

ACTUAL:

```js
G5.post("2.14 / 18 discard", "/api/instructor/scaffold/discard", { groupId: G5.ids.B1_GROUP });
```
**EXPECT 404**, "That generation was not found. It may already be discarded."
**IF IT SUCCEEDED:** B1's undecided candidates are gone and item 20 needs a fresh
generation first.

ACTUAL:

```js
G5.post("2.14 / 19 chain", "/api/instructor/scaffold/generate", { chainFromScenarioId: G5.ids.B1_GATEKEEPER });
```
**EXPECT 404**, "That gatekeeper persona was not found." Skip this line and note
it if B1's generation produced no gatekeeper.
**IF IT SUCCEEDED:** a new persona was created in B2 carrying B1's case. Discard
it from B2's Recent generations.

ACTUAL:

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
writes a line to the Vercel function log beginning `Gate 6 refused a stored class
selection`. Seeing those is confirmation, not a problem.

ACTUAL (state 1, five pages):
ACTUAL (state 2, five pages):
ACTUAL (state 3, five pages):

**Then the route half, with the cookie still set to state 1 (A's class id):**

```js
G5.get("2.15 video, tampered",      "/api/instructor/submission/" + G5.ids.A_SUB + "/video");
G5.get("2.15 transcript, tampered", "/api/instructor/submission/" + G5.ids.A_SUB + "/transcript");
G5.get("2.15 csv, tampered",        "/api/instructor/submission/" + G5.ids.A_SUB + "/csv");
```

**EXPECT: status 404 on all three**, exactly as in items 2 to 4. A hand-edited
cookie must get the caller nothing at all.

ACTUAL:

**Now put the cookie back** by using the picker in the app (select B1, then B2 as
you like). Do not hand-edit it back.

ACTUAL (picker works normally again):

### Item 20. "Discard all" counts and deletes the WORKING class only

**Working in B2.** B2's generation has a chosen winner, so its losing siblings
are unused and discardable. B1's undecided generation must not be touched.

```js
G5.post("20 preview", "/api/instructor/scaffold/discard-all", { preview: true });
```

**EXPECT:** a preview whose `names` are **only B2's persona names**. If a single
B1 name appears in that list, stop: the count is not scoped and the delete would
not be either.

ACTUAL:

```js
G5.post("20 confirm", "/api/instructor/scaffold/discard-all", { confirm: "DISCARD" });
```

**EXPECT:** `ok: true` with a `deleted` count matching the preview.

ACTUAL:

**Then confirm nothing else moved:** switch to B1 and open Recent generations.

**EXPECT:** B1's undecided generation is still there, with all its candidates.
A's counts are re-checked by SQL in step 4 and must be **identical to 0.6**.

ACTUAL:

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

ACTUAL:

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

ACTUAL:

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

ACTUAL:

### Item 14. Withdraw A's invite

Target: the **canary** pending invite created for this run.

```js
G5.post("item 14 uninvite", "/api/instructor/uninvite", { email: G5.ids.A_CANARY_INVITE });
```

**EXPECT:** status **404**, "That email is not on the invite list."

**IF THE GUARD FAILED:** `ok: true`, and one pending invite row is gone. Recreate
it from A's Invite Users page and **stop the run.**

ACTUAL:

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

ACTUAL:

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

ACTUAL:

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

ACTUAL:

### Item 18. Discard one of A's generations

Target: **A_GROUP_LIVE**, a group of A's that has a **switched-on winner**, which
is what defends it a second time.

```js
G5.post("item 18 discard", "/api/instructor/scaffold/discard", { groupId: G5.ids.A_GROUP_LIVE });
```

**EXPECT:** status **404**, "That generation was not found. It may already be
discarded."

**IF THE GUARD FAILED:** status **409** beginning "This generation has a chosen
persona that is switched on", and it will **name A's persona**, which is itself a
leak. **Stop the run.**

ACTUAL:

### Item 19. Chain a new persona from A's gatekeeper

Nothing is destroyed by this one either way. If it wrongly succeeded it would
copy A's stored case details into a new persona in **B's** class, which is a leak
of A's generated content and is the finding.

```js
G5.post("item 19 chain", "/api/instructor/scaffold/generate", { chainFromScenarioId: G5.ids.A_GATEKEEPER });
```

**EXPECT:** status **404**, "That gatekeeper persona was not found."

**IF THE GUARD FAILED:** a 200 and a new persona in B's class carrying A's case.
Discard it, and **stop the run**.

ACTUAL:

### 2.16 The capstone: a tampered cookie AND a target in A's class

Everything above used an honest cookie. This is the two things combined, and it
is the single strictest request in the run. **It is safe because the target is
the canary invite**, which item 14 has already shown is still there and which
takes ten seconds to recreate.

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

ACTUAL:

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

ACTUAL:

Then try a class page directly:

```
/admin/class/<A_CLASS_1>
```

**EXPECT:** the same bounce back to /instructor.

ACTUAL:

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

ACTUAL:

### Item G3.7. The other admin routes refuse too

```js
G5.post("G3.7 add instructor", "/api/admin/instructor/add", { email: "g5-should-never-work@example.com" });
G5.post("G3.7 export",         "/api/admin/class/" + G5.ids.B3 + "/export", {});
```

**EXPECT:** status **403** on both, each naming only a super admin. The export
line is aimed at B's own empty class on purpose: B owns it, and must still be
refused, because the admin surface is not "your classes", it is "every class".

ACTUAL:

## The remaining Gate 6 handoff items, still as B

### H8. The add-student route refuses a student from another instructor's class

Roster, **Add an existing student**, type the email of one of **A's registered
students** (from query 0.5), and add. Or:

```js
G5.post("H8 add A's student", "/api/instructor/add-student", { email: "PASTE ONE OF A'S STUDENT ADDRESSES" });
```

**EXPECT:** status **409**, "... already belongs to another instructor's class, so
they cannot be added here. Ask your administrator." It must point at the
administrator and must **not** name A or A's class.

**IF IT SUCCEEDED:** one of A's students has been moved into B's class, and their
own results page loses its title and its item labels. Move them back at once and
stop the run.

**The route's other three refusals** (no registered account, not a student, and
already did work in their current class) were all run in the Gate 6 click-through
on 2026-09-03. None of them is an isolation question, so only the cross-instructor
one is re-run here.

ACTUAL:

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

ACTUAL:

```js
G5.post("H9 bulk invite", "/api/instructor/bulk-invite",
        { csv: "g5-b@example.com,instructor" });
```

**EXPECT:** status **200** with `addedCount: 0` and one skipped row reading "Only
an administrator can invite an instructor". **A 200 that added the row is the
failure.**

ACTUAL:

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

ACTUAL:

### S1. The positive control. Run this first and do not skip it.

```js
SB.q("S1 positive control", "scenarios?select=id,title,persona_name");
```

**EXPECT:** status 200 and **real rows**, the personas of this student's own
class. **If this comes back `[]` or errors, stop.** Everything below is a denial,
and a denial proves nothing if the request was never authenticated as a student:
an unauthenticated request is denied too, for a completely different reason.

ACTUAL:

### S2. The hidden prompt

```js
SB.q("S2 persona_system_prompt", "scenarios?select=persona_system_prompt");
```

**EXPECT:** a refusal, status **403** or **401**, with a message reading
**permission denied for column persona_system_prompt of relation scenarios**.
Coming back with rows, or with the column present and empty, is a failure.

ACTUAL:

### S3. The case context

```js
SB.q("S3 scenario_context", "scenarios?select=scenario_context");
```

**EXPECT:** the same refusal, naming `scenario_context`.

ACTUAL:

### S4. Everything at once

```js
SB.q("S4 select star", "scenarios?select=*");
```

**EXPECT:** a refusal. The whole-table read was revoked and handed back one
column at a time, so asking for all of them is refused as a table-level
permission denial. **A 200 here that returns rows would mean the revoke is not in
force.**

**One thing to watch for and to write down:** if the refusal names a **third**
column, one that is neither of the two secret ones, that is a real finding and
not a test failure. It would mean a column was added to `scenarios` after Gate 2
ran and the per-column grant loop was never re-run, so ordinary users cannot read
it. Section 9 of `supabase/gate-2-policies.sql` is written to be re-run and
repairs exactly that.

ACTUAL:

### S5. A student cannot reach the administration surface

```
/admin
```

**EXPECT:** the student lands back on **/student**. This is the second half of
Gate 4b handoff item 2, and neither half is about the security rules: everything
under /admin reads with the service-role key.

ACTUAL:

### S6. A student cannot reach the instructor surface

```
/instructor
```

**EXPECT:** back to /student.

ACTUAL:

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

ACTUAL (3b):
ACTUAL (4b):
ACTUAL (6):

## 4.2 Query 2 against the copy kept at step 0.2

**EXPECT:** B's classes carry the content built for this run, A's two classes are
**unchanged in every column**, and **no row moved out of any class**.

ACTUAL:

## 4.3 Item 20's real check: A's candidate counts

Re-run query **0.6**.

**EXPECT:** both numbers **identical** to what step 0.6 recorded. B ran "Discard
all" while this run was in progress; if either number moved, `planBulkDiscard`
reached outside the working class.

ACTUAL:

## 4.4 Item 23's standing check

Query **6 of `gate-6-checks.sql`**.

**EXPECT:** the first two lines **0**. The third is informational and is allowed
to be non-zero. Combined with item 23 above, this says both that no cross-class
reference exists **and** that one cannot be created.

ACTUAL:

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
