-- Relii Gate 4b: the checks. READ-ONLY. Nothing in this file changes anything.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor", "New query",
-- and RUN EACH NUMBERED QUERY ON ITS OWN by pasting just that one in. The SQL
-- Editor only shows you the result of the LAST thing it ran, so pasting the
-- whole file at once would hide queries 1 to 5.
--
-- ==> BEFORE ANY OF THIS, AND AGAIN AFTERWARDS, RUN QUERY 5 OF
--     supabase/gate-4a-tests.sql. It is the delete backstop: it proves that the
--     database still REFUSES a delete made in the wrong order. Gate 4b's cascade
--     works by deleting in the order the constraints force (sessions,
--     assignments, scenarios, rubrics, then allowed_emails and class_members,
--     then the class row) and relies on a wrong order failing LOUDLY. If query 5
--     ever stops passing, that cascade destroys student work instead of
--     refusing, AND THE FAILURE LOOKS LIKE SUCCESS. A delete path is exactly the
--     kind of code that relaxes a constraint to get itself working, which is why
--     it is run on both sides of this piece. <==
--
-- ==> NEVER RUN THE CASCADE DELETE AGAINST REAL DATA. Queries 3 to 6 are written
--     for a THROWAWAY class built for the test, and they find it by name rather
--     than by an id you paste, so there is nothing to mistype. The step-by-step
--     recipe for building that throwaway set is in the Gate 4b handoff. The
--     historical class holds every recording this project has made and is what
--     Tom sees. <==


-- ===========================================================================
-- 0. WHAT A STORED RECORDING'S PATH ACTUALLY LOOKS LIKE. Run this once.
-- ===========================================================================
-- EXPECTED: a handful of names in the form
--   3f2a....-....-....-....-............/9c81....-....-....-....-............webm
-- that is, <owner-account-id>/<session-id>.webm, WITH NO BUCKET NAME IN FRONT.
--
-- WHY THIS IS WORTH TEN SECONDS BEFORE THE REST: queries 3 and 5 identify the
-- OWNER of a file by taking the part of the name before the first "/" and
-- matching it against an account id. If the stored name turned out to carry
-- anything else in front, that match would fail for EVERY file, and query 5
-- would report every recording in the system as belonging to no account, which
-- reads as a catastrophe rather than as a broken query. Confirm the shape first
-- and the later numbers can be trusted.
select name, (storage.foldername(name))[1] as first_folder
from storage.objects
where bucket_id = 'session-videos'
limit 3;


-- ===========================================================================
-- 1. THE FLAG EXISTS AND IS SET ON EXACTLY THE ACCOUNTS INTENDED.
-- ===========================================================================
-- EXPECTED: exactly ONE row, michaeltbanta@gmail.com.
--
-- The second instructor account must NOT be here. Gate 5 is isolation testing
-- and needs that account to be an ordinary instructor: a second super admin
-- would see across classes by design, which is the very thing Gate 5 exists to
-- prove cannot happen.
select
  email,
  role,
  is_super_admin,
  case when role = 'instructor' then 'ok'
       else '>>> A SUPER ADMIN SHOULD ALSO BE AN INSTRUCTOR <<<'
  end as verdict
from public.profiles
where is_super_admin
order by email;


-- ===========================================================================
-- 2. THE EXPORT RECORD IS PRESENT AND LOCKED DOWN.
-- ===========================================================================
-- EXPECTED: class_exports_table 1, policies 0, foreign_keys 0.
--
-- Policies 0 means service-role only: no browser can read or write it, which is
-- how every other server-only table in this schema is locked (classes,
-- class_members). Foreign keys 0 is the DESIGN, not an omission: this row has to
-- SURVIVE the delete it authorised, so a link to classes would either block that
-- delete or erase the record of it. It is the same decision Gate 1 made for the
-- two audit logs.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'class_exports') as class_exports_table,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'class_exports')    as policies,
  (select count(*) from pg_constraint
    where conrelid = 'public.class_exports'::regclass
      and contype = 'f')                                            as foreign_keys;


-- ===========================================================================
-- 3. BEFORE THE DELETE: what is in the throwaway class.
-- ===========================================================================
-- Run this once the throwaway set is built, BEFORE deleting anything, and keep
-- the numbers. Query 4 is the same list read back afterwards, and every line
-- must be zero.
--
-- EXPECTED: one row per table with a number beside it, and at least one session
-- and one recording. A recording count of zero means the throwaway student never
-- completed a webcam submission, and the most important half of this piece would
-- go untested.
with target as (
  select id from public.classes where name ilike '%throwaway%'
)
select 'classes'            as table_name, count(*) from public.classes            where id       in (select id from target)
union all select 'class_members',          count(*) from public.class_members      where class_id in (select id from target)
union all select 'allowed_emails',         count(*) from public.allowed_emails     where class_id in (select id from target)
union all select 'rubrics',                count(*) from public.rubrics            where class_id in (select id from target)
union all select 'scenarios',              count(*) from public.scenarios          where class_id in (select id from target)
union all select 'assignments',            count(*) from public.assignments        where class_id in (select id from target)
union all select 'sessions',               count(*) from public.sessions           where class_id in (select id from target)
union all select 'sessions with a recording', count(*) from public.sessions        where class_id in (select id from target) and video_path is not null
union all select 'submission_resets (kept on purpose)',   count(*) from public.submission_resets   where class_id in (select id from target)
union all select 'assignment_deletes (kept on purpose)',  count(*) from public.assignment_deletes  where class_id in (select id from target)
union all select 'storage objects for its people', count(*)
  from storage.objects o
  where o.bucket_id = 'session-videos'
    and split_part(o.name, '/', 1) in (
      select user_id::text from public.class_members where class_id in (select id from target)
      union
      select instructor_id::text from public.classes where id in (select id from target)
    )
order by 1;


-- ===========================================================================
-- 4. AFTER THE DELETE: every one of them is zero.
-- ===========================================================================
-- ==> IT FINDS THE CLASS THROUGH public.class_exports, NOT BY NAME, and that is
--     the only way this query can be trusted. After a successful delete the
--     class row is gone, so a name lookup returns nothing and EVERY COUNT WOULD
--     READ ZERO WHETHER OR NOT ANYTHING WAS ACTUALLY DELETED. That is a test
--     that passes by construction. The export record survives the delete on
--     purpose and still holds the class id, so this asks about the real one. <==
--
-- EXPECTED: every count 0, with ONE READING NOTE ON THE TWO AUDIT LOGS.
--
-- "EXPECTED TO REMAIN" means "if any existed, they must STILL BE HERE". It does
-- NOT mean the number has to be above zero. A throwaway class usually produces
-- neither: submission_resets needs a graded submission to reset, and
-- assignment_deletes is only written when an IN-USE assignment is deleted. Zero
-- on both lines is the normal result and is not a failure.
--
-- TO TELL "there were none" FROM "something removed them", which is the only
-- thing worth knowing here, read the counts column on the used row in query 6.
-- It records what the class held AT EXPORT TIME. If it says zero there too,
-- there was nothing to keep.
--
-- They are left in place deliberately: Gate 1 gave them no link to classes so
-- that no later delete could remove or blank a log entry, and the export carries
-- them as well. Their rows now point at a class id that no longer exists, which
-- is the log working as designed.
with target as (
  select class_id from public.class_exports
  where used_at is not null
  order by used_at desc
  limit 1
)
select 'classes'            as table_name, count(*) as remaining from public.classes            where id       in (select class_id from target)
union all select 'class_members',            count(*) from public.class_members      where class_id in (select class_id from target)
union all select 'allowed_emails',           count(*) from public.allowed_emails     where class_id in (select class_id from target)
union all select 'rubrics',                  count(*) from public.rubrics            where class_id in (select class_id from target)
union all select 'scenarios',                count(*) from public.scenarios          where class_id in (select class_id from target)
union all select 'assignments',              count(*) from public.assignments        where class_id in (select class_id from target)
union all select 'sessions',                 count(*) from public.sessions           where class_id in (select class_id from target)
union all select 'submission_resets (EXPECTED TO REMAIN)',  count(*) from public.submission_resets  where class_id in (select class_id from target)
union all select 'assignment_deletes (EXPECTED TO REMAIN)', count(*) from public.assignment_deletes where class_id in (select class_id from target)
order by 1;


-- ===========================================================================
-- 5. AFTER THE DELETE: no recording is left behind, anywhere.
-- ===========================================================================
-- EXPECTED: files_with_no_account 0. That is the line that matters.
--
-- WHY THIS SHAPE RATHER THAN "files belonging to the throwaway student": after
-- the delete that student's account is gone, so there is no id left to ask
-- about. Instead this asks the question the other way round: is there a file in
-- the bucket whose owning ACCOUNT no longer exists? Every recording is stored at
-- <owner-id>/<session-id>.webm, so the first folder is the owner. A file left by
-- the cascade would show up here, and nothing else would put one here.
--
-- The second line is the KNOWN, PRE-EXISTING orphan count from earlier testing
-- (recordings whose session row was deleted directly in SQL long before this
-- piece, listed in Open Issues in PROJECT_STATE.md). It is reported separately
-- so that a number in it does not read as a failure of this piece. Compare it
-- before and after: it must not GROW.
select
  (select count(*) from storage.objects o
    where o.bucket_id = 'session-videos'
      and not exists (
        select 1 from public.profiles p
        where p.id::text = split_part(o.name, '/', 1)
      ))                                                     as files_with_no_account,
  (select count(*) from storage.objects o
    where o.bucket_id = 'session-videos'
      and exists (
        select 1 from public.profiles p
        where p.id::text = split_part(o.name, '/', 1)
      )
      and not exists (
        select 1 from public.sessions s
        where s.video_path = o.name
      ))                                                     as known_orphans_from_earlier_testing;


-- ===========================================================================
-- 6. THE AUDIT RECORD, AND THE CANARY.
-- ===========================================================================
-- EXPECTED, first block: one row per export ever taken. The row for the deleted
-- class shows used_at set, counts (what the class HELD at export time) and
-- deleted_counts (what the deletion REMOVED).
--
-- The two use different words for some of the same things, because one is a
-- description of a class and the other is a list of delete statements: "students"
-- and "invites" in counts are "class_members" and "allowed_emails" in
-- deleted_counts, and "student_accounts_to_delete" is "student_accounts". The
-- pairs that must match exactly are sessions, assignments, scenarios, rubrics
-- and recordings.
--
-- An export with used_at EMPTY is not a problem: it is an export somebody took
-- and did not act on, which is the normal case and exactly what should happen
-- most of the time.
select
  created_at,
  class_name,
  instructor_email,
  exported_by_email,
  used_at,
  counts,
  deleted_counts
from public.class_exports
order by created_at desc;

-- EXPECTED, second block: zero rows. THIS IS A CANARY, NOT A TO-DO LIST.
-- A registered student always belongs to a class: the signup rule gives them one
-- and the cascade delete removes the accounts that belonged only to the class it
-- destroyed. Nothing in the app can add an already-registered student to a
-- class, so a name here is a person nobody can help, and it means a deletion
-- stopped part way through or a row was changed by hand. The same list is on the
-- super admin overview, and the student sees "You are not currently in a class".
select p.email, p.created_at
from public.profiles p
where p.role = 'student'
  and not exists (
    select 1 from public.class_members m where m.user_id = p.id
  )
order by p.email;


-- ---------------------------------------------------------------------------
-- HANDOFF: WHAT GATE 4b LEAVES FOR GATE 5.
-- ---------------------------------------------------------------------------
--   1. THE ISOLATION MODEL IS UNCHANGED BY THIS PIECE. Gate 4b added no policy
--      to any existing table, no function, and no foreign key. It added one
--      boolean column and one table with no links. Every instructor-facing read
--      and write is exactly as Gate 3a and Gate 3b left it, so the twenty-three
--      item matrix at the bottom of supabase/gate-3b-tests.sql is still the
--      right test list and none of it was invalidated here.
--
--   2. THE SUPER ADMIN SURFACE IS A THIRD THING TO TEST AS INSTRUCTOR B, and it
--      is two items, not one: /admin must bounce an ordinary instructor back to
--      /instructor, AND it must bounce a student back to /student. Neither is
--      about RLS: everything under /admin reads with the service-role key, and
--      the ONLY thing standing between an ordinary instructor and every class in
--      the system is requireSuperAdmin() in lib/super-admin.ts. There is no
--      backstop behind it, so it is worth aiming at directly rather than trusting
--      the missing nav link.
--
--   3. THE DELETE IS THE ONE PLACE A CRAFTED REQUEST MATTERS MOST. Four variants
--      are written out in the Gate 4b handoff (no token, a made-up token, a used
--      token, and a valid token issued for ANOTHER class). The last is the
--      substitution attack, and it is the reason the delete route compares the
--      token's class_id with the class in the address.
--
--   4. STILL OPEN, AND UNCHANGED BY THIS PIECE: the invite collision.
--      allowed_emails.email is the PRIMARY KEY, so an address belongs to exactly
--      one instructor's invite list, and a student taking two of the five
--      instructors' courses hits this on day one. Gate 4a made the collision
--      LEGIBLE (four messages that say whose list it is and where to go) and did
--      not remove it. Gate 4b touched it only to say what happens on a delete:
--      the invite rows go with the class.
--
--   5. NEW FOR GATE 5, AND IT COMES OUT OF THE REASSIGNMENT WORK: an instructor
--      is assumed everywhere to own EXACTLY ONE class, because
--      getInstructorClassId() takes their oldest and stops. Nothing in the
--      database enforces that. The reassign route is careful never to create a
--      second one (it refuses unless the receiving instructor's own class is
--      empty, and deletes that empty class as part of the handover), but a row
--      changed by hand could still produce it, and the failure is SILENT: the
--      instructor's own content simply stops appearing. A cheap standing check:
--        select instructor_id, count(*) from public.classes
--        group by instructor_id having count(*) > 1;
--      It must return no rows.
--
--   6. ONE INSTRUCTOR CAN STILL INVITE ANOTHER INSTRUCTOR from Invite Users: the
--      role dropdown on the ordinary instructor form offers it. Now that adding
--      an instructor is a super admin operation, that is arguably a hole. It was
--      deliberately NOT closed in Gate 4b, because changing it is a change to the
--      instructor surface and this piece was scoped out of that. It is a ruling
--      for Gate 5, not a defect to fix quietly.
