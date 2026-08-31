-- Relii Gate 3b: the last two security rules. THE INVITE LIST GETS A CLASS.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- ==> RUN THIS *AFTER* THE GATE 3b CODE IS DEPLOYED AND LIVE ON
--     relii.vercel.app. See section 0 for what that ordering is actually for,
--     because the honest answer is NOT the one the kickoff brief assumed. <==
--
-- WHAT THIS IS FOR
-- Two rules on the invite list (allowed_emails) still say public.is_instructor(),
-- which means ANY instructor rather than THIS instructor. They are the last two
-- of the original eight. Gate 2 left them alone and said so in its own comments,
-- and Gate 3a left them alone and said so too, both for the same reason: the
-- browser invite form set no class_id, so scoping the insert half would have
-- broken inviting anybody, and scoping the read half would have hidden every new
-- invite from the Roster. Gate 3a fixed both invite paths. So they can finally
-- be scoped, and this file does it.
--
-- WHAT ELSE IS IN GATE 3b, so this file is not mistaken for the whole piece.
-- Almost none of the isolation lives here. The instructor surface reads with the
-- service-role key, which bypasses Row Level Security entirely, so THE POLICIES
-- ARE A BACKSTOP AND THE APPLICATION CODE IS THE ACTUAL FIX. Gate 3b's real work
-- is twenty-two code files: two shared helpers, four instructor pages and eleven
-- routes, each of which now confirms that the row it was handed belongs to the
-- caller's class before reading or acting on it. This file is the small half.
--
-- SAFE TO RUN TWICE. Both statements drop the rule and recreate it.
--
-- WHAT THIS DOES NOT DO
-- It adds no column, no table and no index. It does not touch the other six
-- policy surfaces, the student surface, or any Storage rule. It does NOT drop
-- public.is_instructor(), even though this file is what makes it dead; see
-- section 3.


-- ---------------------------------------------------------------------------
-- 0. ORDERING: WHAT ACTUALLY BREAKS IF YOU RUN THIS EARLY. Nothing.
-- ---------------------------------------------------------------------------
-- Gate 3a had a genuine sequencing hazard, and the brief for this piece assumed
-- this one would too. IT DOES NOT, and inventing a hazard to match the shape of
-- the last piece would be worse than useless. Verified before this file was
-- written, by reading the code rather than by reasoning about it:
--
--   THE INSERT HALF IS ALREADY SAFE. The only browser-side writer of
--   allowed_emails is components/add-email-form.tsx, and since Gate 3a it sets
--   class_id from the signed-in instructor's own class. It already satisfies the
--   tightened with-check. (A grep for allowed_emails across app, components and
--   lib returns exactly one browser-client file, and it is that form.)
--
--   THE READ HALF HAS NO READER AT ALL. app/instructor/roster/page.tsx reads the
--   invite list with the SERVICE-ROLE key, which is not subject to these rules.
--   The sign-up page never selects from this table: it calls
--   public.is_email_allowed(), which is SECURITY DEFINER and therefore bypasses
--   Row Level Security. The signup trigger public.handle_new_user() is security
--   definer too.
--
-- SO WHY RUN IT AFTER THE DEPLOY ANYWAY? Discipline, and because it costs
-- nothing. If a future edit gives either half a reader through the ordinary
-- client, the safe order is already the habit.
--
-- ==> THE REAL RISK ON THIS PIECE RUNS THE OTHER WAY, AND IT IS SILENT. If the
--     code ships and THIS FILE NEVER RUNS, the app looks completely correct:
--     every page and route is scoped, every click-through passes. But the invite
--     list stays readable by any instructor over the web API with a browser key,
--     because the rule still says is_instructor(). Nothing on screen will ever
--     tell you. The only thing that catches it is section 4 below. <==


-- ---------------------------------------------------------------------------
-- 1. allowed_emails: read only your own class's invites.
-- ---------------------------------------------------------------------------
-- WAS: any instructor could read the whole invite list, which is every invited
-- person's email address across every class in the system.
--
-- IT USES instructs_class(), NOT can_read_class(), AND THE DIFFERENCE MATTERS.
-- can_read_class() (added by Gate 3a) answers true for the class's OWNER *or*
-- any MEMBER of it, which is right for rubrics, scenarios and assignments,
-- because students legitimately read those. Class members are students. Using it
-- here would hand every student the full email address of every classmate. This
-- rule is instructor-only and must stay that way, so it uses Gate 2's
-- instructs_class(), which answers the owner half only.
--
-- WHO READS THIS THROUGH THE RULES TODAY: nobody. The Roster uses the
-- service-role key. That does not make scoping it pointless, it means the
-- protection is against a browser key calling the web API directly rather than
-- against anything on screen.
drop policy if exists "instructors read invite list" on public.allowed_emails;
create policy "instructors read invite list"
  on public.allowed_emails for select
  using (public.instructs_class(class_id));


-- ---------------------------------------------------------------------------
-- 2. allowed_emails: add invites only to your own class.
-- ---------------------------------------------------------------------------
-- WAS: any instructor could add an invite row, with any class or none.
--
-- THIS ONE HAS A LIVE USER, and it is the only rule in this file that does:
-- components/add-email-form.tsx inserts straight from the browser through these
-- rules. Since Gate 3a it sets class_id from requireInstructor(), and it refuses
-- to write at all when that is empty, so it satisfies this check as deployed.
--
-- THERE IS NO NULL ALLOWANCE HERE, unlike the assignments rule Gate 2 had to
-- ship with one. It is not needed: the form was taught to set a class in Gate
-- 3a, and Gate 3a's repair backfilled every invite written before that. An
-- invite with no class would be an invite nobody can manage and a student in no
-- class, which is the exact hole Gate 3a closed.
drop policy if exists "instructors add to invite list" on public.allowed_emails;
create policy "instructors add to invite list"
  on public.allowed_emails for insert
  with check (public.instructs_class(class_id));


-- ---------------------------------------------------------------------------
-- 3. public.is_instructor() IS NOW DEAD, AND IT IS DELIBERATELY LEFT IN PLACE.
-- ---------------------------------------------------------------------------
-- The two rules above were the last two policies referencing it. Gate 2 moved
-- six to instructs_class(); these were the remaining pair. After this file runs,
-- is_instructor() is called by NOTHING: no policy, no other function, and no
-- application code.
--
-- DO NOT DROP IT IN THIS PIECE. Dropping a function that a policy still
-- references would fail loudly, which is fine, but dropping one while an OLD
-- deploy is still serving traffic, or while an un-run copy of an older migration
-- file is sitting in the repo, is how a rollback stops working. Removing it
-- belongs in Gate 4 or later, once these rules have stood in production.
--
-- ==> AND A TRAP THAT OUTLIVES THIS FILE: THREE OLDER MIGRATION FILES STILL
--     CONTAIN THEIR ORIGINAL is_instructor() POLICY BODIES.
--       supabase/stage-2-data-model.sql
--       supabase/stage-8-reset-audit.sql
--       supabase/stage-8-assignment-delete-audit.sql
--     All three are documented as safe to run twice, and that is STILL TRUE of
--     each one on its own and NO LONGER TRUE in sequence: re-running any of them
--     now would silently un-scope the rules this gate tightened, with no error
--     and nothing visible on screen. If one of them ever has to be re-run, run
--     supabase/gate-2-policies.sql and supabase/gate-3a-policies.sql and this
--     file again afterwards, in that order. <==


-- ---------------------------------------------------------------------------
-- 4. HOW TO CHECK IT WORKED.
-- ---------------------------------------------------------------------------
-- The queries are in supabase/gate-3b-tests.sql, ready to paste. The one that
-- matters most is the check that "is_instructor" now appears in ZERO live
-- policies: that is the only thing that can tell you this file has actually run,
-- because nothing on screen changes when it does.
--
-- THE CLICK-THROUGH FAILURE SIGNATURE, in one line: if inviting one person by
-- email stops working, this rule and the deployed form disagree about the class.
-- Run supabase/gate-3b-revert.sql rather than debugging forward.
