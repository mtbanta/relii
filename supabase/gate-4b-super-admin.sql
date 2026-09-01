-- GATE 4b: the super admin flag and the export record.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- ==> RUN THIS BEFORE THE GATE 4b CODE IS DEPLOYED, and this piece is strict
--     about it in a way the earlier ones were not. The deploy adds
--     is_super_admin to the profile read in lib/instructor-auth.ts, which EVERY
--     instructor page goes through. If the code lands before this file runs,
--     that read fails with "column profiles.is_super_admin does not exist" and
--     the whole instructor surface errors, not just the new section. So: this
--     file first, then the push. <==
--
-- WHAT THIS FILE DOES, and it is only two things:
--   1. Adds a boolean flag to profiles that marks a super admin, and sets it on
--      exactly one account.
--   2. Creates public.class_exports, the row the export writes and the delete
--      demands. It is both the one-time token and the permanent record that an
--      export was taken before a class was destroyed.
--
-- WHAT IT DOES NOT DO. It creates no function, adds no security policy to any
-- existing table, changes no role check constraint, adds no foreign key
-- anywhere, and touches nothing the isolation gate built. public.is_instructor()
-- stays dropped and is not resurrected here or anywhere in Gate 4b.

-- ---------------------------------------------------------------------------
-- 1. The super admin flag.
-- ---------------------------------------------------------------------------
-- HOW A SUPER ADMIN IS IDENTIFIED: a boolean on profiles. The role column is
-- deliberately left alone. Four reasons, and the first is the strongest.
--
--   1. IT CANNOT BE GRANTED BY THE PERSON IT WOULD PROMOTE. public.profiles has
--      a SELECT policy ("read own profile") and NO update policy at all, and
--      Row Level Security denies anything it has no rule for. So no browser,
--      student or instructor, can write any column of profiles, this one
--      included. Even the name gate writes through a server route for exactly
--      this reason (see supabase/piece-3-names.sql). The flag can only be set
--      with the service-role key or here in the SQL editor.
--   2. A THIRD ROLE WOULD MEAN CHANGING THE role CHECK CONSTRAINT on BOTH
--      profiles and allowed_emails, and then reasoning about a user the signup
--      trigger gives no class to and whom requireInstructor() would bounce to
--      the student page.
--   3. THE OWNER IS ALREADY AN INSTRUCTOR owning a class full of historical
--      data. Moving them to a third role would orphan all of it.
--   4. LOCKED DECISION 3 REJECTED "the super admin is an instructor who sees
--      everything" ON ARCHITECTURAL GROUNDS: that design threads an exception
--      through every instructor policy, which is where isolation bugs come from.
--      A FLAG DOES NOT DO THAT, and Gate 4b keeps it that way: the flag gates a
--      separate, read-only section with its own routes, its own guard file and
--      its own queries, and no instructor policy or instructor query mentions it
--      or branches on it. This is the rejected option's problem avoided, not the
--      rejected option renamed.
--
-- Default false, not null, so every existing and future account is an ordinary
-- user until someone deliberately says otherwise.
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

comment on column public.profiles.is_super_admin is
  'Gate 4b. Marks the cross-tenant administrator. Set only via SQL or the service-role key: profiles has no update policy, so no browser can write it.';

-- ---------------------------------------------------------------------------
-- 2. Set the flag on exactly one account.
-- ---------------------------------------------------------------------------
-- ONE ACCOUNT, AND THE SECOND INSTRUCTOR ACCOUNT IS DELIBERATELY NOT INCLUDED.
-- Gate 5 is isolation testing, and it needs that account to be an ORDINARY
-- instructor: a second super admin would be able to see across classes by
-- design, which is the exact thing Gate 5 exists to prove cannot happen.
update public.profiles
   set is_super_admin = true
 where lower(email) = lower('michaeltbanta@gmail.com');

-- ---------------------------------------------------------------------------
-- 3. class_exports: the export token, and the record that the export happened.
-- ---------------------------------------------------------------------------
-- WHY THIS TABLE EXISTS. "Export before you delete" enforced by the page is a
-- convention enforced by nothing: a crafted request skips the button and the
-- failure destroys graded student work. So the SERVER issues something on
-- export and the delete refuses without it. This table is that something.
--
-- HOW IT IS USED, in one paragraph so the columns make sense. The export route
-- builds a snapshot of everything in the class, hashes it, writes one row here,
-- and hands back the row's id as a one-time token. The delete route refuses
-- unless it is given a token that exists, has never been used, is less than an
-- hour old, and names THIS class. It then rebuilds the snapshot from the live
-- database and requires the hash to still match, so an export that no longer
-- describes what is about to be destroyed is refused rather than honoured.
--
-- ==> EVERY uuid IN THIS TABLE IS A PLAIN VALUE WITH NO FOREIGN KEY, AND THAT IS
--     THE WHOLE DESIGN, not an oversight. It is the same decision Gate 1 made
--     for submission_resets and assignment_deletes, for the same reason: this
--     row has to SURVIVE the delete it authorised. A real link to classes would
--     either block the class delete (on delete restrict) or erase the record of
--     it (on delete cascade), and both defeat the point. A link to auth.users
--     would do the same when an instructor account is later removed.
--     It also keeps this table out of the schema's most repeatable mistake:
--     Postgres allows two foreign keys between the same pair of tables and the
--     Supabase API does not, and that has already cost two production outages
--     (see Open Issues in PROJECT_STATE.md). A table with no foreign keys adds
--     no second path anywhere. <==
--
-- The class name and both emails are SNAPSHOTS for the same reason: after the
-- delete, the class row and possibly the instructor account are gone, and a
-- record that can only say "class 8f3c..." is not a record of anything.
create table if not exists public.class_exports (
  -- This id IS the token handed to the browser and required back by the delete.
  id                uuid primary key default gen_random_uuid(),

  -- Which class was exported. Plain uuid, no link, see above.
  class_id          uuid not null,
  class_name        text not null,
  instructor_id     uuid,
  instructor_email  text,

  -- Who took the export. Always a super admin; nobody else can reach the route.
  exported_by       uuid not null,
  exported_by_email text,

  -- sha256 of the canonical snapshot. The delete recomputes this and refuses on
  -- any difference.
  fingerprint       text not null,

  -- What the class held at export time, per table, so the record says what was
  -- there without anyone having to open the CSV.
  counts            jsonb not null,

  created_at        timestamptz not null default now(),

  -- Set the moment the delete starts, which is what makes the token one-time. A
  -- run that fails part way through therefore leaves a USED token: the operator
  -- exports again rather than replaying a stale authorisation.
  used_at           timestamptz,

  -- What the delete actually removed, written when it finishes. Together with
  -- counts above, this is the audit record of the most destructive operation in
  -- the app.
  deleted_counts    jsonb
);

create index if not exists class_exports_class_idx
  on public.class_exports (class_id);

-- ---------------------------------------------------------------------------
-- 4. Lock the new table down.
-- ---------------------------------------------------------------------------
-- Exactly what Gate 1 did for classes and class_members, and for the same
-- reason: Supabase publishes every table in the public schema over its web API,
-- so a new table with security switched OFF is readable by anyone holding the
-- public key. Security ON with NO policies means ordinary users (students and
-- instructors alike) cannot read or write it at all, and only the server's
-- service-role key can. The super admin surface runs entirely server-side, so it
-- needs no policy here, and adding one would only open a door nothing uses.
alter table public.class_exports enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Check it worked. These change nothing.
-- ---------------------------------------------------------------------------
-- EXPECT: exactly one row, michaeltbanta@gmail.com, is_super_admin true.
-- If you see more than one, or the wrong address, fix it before deploying:
--   update public.profiles set is_super_admin = false where lower(email) = '...';
select
  email,
  role,
  is_super_admin
from public.profiles
where is_super_admin
order by email asc;

-- EXPECT: super_admins 1, class_exports_table 1, class_exports_policies 0,
--         class_exports_foreign_keys 0.
-- The last two are the design stated as a check: no policies means service-role
-- only, and no foreign keys means this table can never block, or be erased by,
-- the delete it authorises.
select
  (select count(*) from public.profiles where is_super_admin)      as super_admins,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'class_exports') as class_exports_table,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'class_exports')    as class_exports_policies,
  (select count(*) from pg_constraint
    where conrelid = 'public.class_exports'::regclass
      and contype = 'f')                                           as class_exports_foreign_keys;
