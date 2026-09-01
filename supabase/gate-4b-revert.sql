-- GATE 4b REVERT: undo supabase/gate-4b-super-admin.sql.
--
-- HOW TO USE: Supabase dashboard, SQL Editor, New query, paste, Run. Safe to
-- run more than once. Delivered at the same time as the migration, before it is
-- run, exactly as every earlier gate piece has been.
--
-- ==> ROLL THE DEPLOY BACK FIRST, OR THE INSTRUCTOR SURFACE BREAKS. Dropping
--     is_super_admin while the Gate 4b code is live means the profile read in
--     lib/instructor-auth.ts asks for a column that no longer exists, and that
--     read is on EVERY instructor page. The order for a rollback is the reverse
--     of the install: revert the deploy in Vercel first, confirm the old build
--     is serving, then run this file. <==
--
-- WHAT THIS UNDOES: the flag column and the class_exports table. That is
-- everything Gate 4b added to the database, and it is all this file touches.
--
-- ==> A REVERT UNDOES ONLY WHAT ITS OWN PIECE ADDED. That rule came out of a
--     real defect found while building Gate 4a (supabase/gate-2-revert.sql was
--     dropping a function a LATER piece had built on top of), and this file was
--     written against it. Gate 4b creates no function, so there is nothing here
--     that a later piece could come to depend on. If a later piece ever writes a
--     policy or a function that reads is_super_admin, section 1 below stops
--     being safe on its own and this file must be updated in the same sitting,
--     because Postgres records no dependency on what a function BODY reads. <==
--
-- WHAT IT DOES NOT UNDO, and cannot: any class that was already deleted. This
-- file restores a column and a table, not data. The export CSV is the only copy
-- of a destroyed class, and the recordings are not in it at all.

-- ---------------------------------------------------------------------------
-- 1. Drop the super admin flag.
-- ---------------------------------------------------------------------------
-- This forgets WHO was a super admin. With one flagged account that is a single
-- update to put back (section 2 of the migration), so no record is worth
-- keeping here.
alter table public.profiles
  drop column if exists is_super_admin;

-- ---------------------------------------------------------------------------
-- 2. Drop the export record.
-- ---------------------------------------------------------------------------
-- ==> READ THIS BEFORE RUNNING IT. class_exports is not scaffolding, it is the
--     AUDIT RECORD of every class export and every class delete that has
--     happened. Dropping it destroys the only database-side evidence that a
--     class was exported before it was destroyed, and who did it. If any row
--     has used_at set, a real class was really deleted, and you almost certainly
--     want to copy the table out before this line runs:
--
--       select * from public.class_exports order by created_at desc;
--
--     Nothing depends on the table existing except the Gate 4b code, which the
--     rollback has already taken out of service. <==
drop table if exists public.class_exports;

-- ---------------------------------------------------------------------------
-- 3. Check it worked. This changes nothing.
-- ---------------------------------------------------------------------------
-- EXPECT: flag_column 0, class_exports_table 0.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'is_super_admin')                          as flag_column,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'class_exports') as class_exports_table;
