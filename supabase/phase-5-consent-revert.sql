-- REVERT for supabase/phase-5-consent.sql.
--
-- HOW TO USE: paste this whole file into the Supabase SQL Editor and run it. It
-- is safe to run more than once.
--
-- WHAT IT DOES: puts public.handle_new_user() back to the Gate 1 body, exactly,
-- so registration behaves as it did before Phase 5. That is ONE step and it is
-- the whole recovery. Run it if registration ever fails after Phase 5 ships.
--
-- THE APPLICATION DEPLOY DOES NOT HAVE TO BE ROLLED BACK WITH IT. The register
-- page goes on sending the two accepted versions as signup metadata, and the
-- restored function below simply ignores them, which is precisely what the live
-- function does today. Rolling back the code is optional and comes second.
--
-- ==> A REVERT UNDOES ONLY WHAT ITS OWN PIECE ADDED, which is the standing rule
--     from the 2026-08-31 audit. So this file DOES NOT DROP public.consents and
--     does not delete a single consent row. Two reasons, and the second is the
--     real one. First, the table is additive and harms nothing while unused.
--     Second, dropping it would destroy the record of who accepted what, which
--     is the one thing in this piece that cannot be rebuilt afterwards.
--
-- WHAT YOU LOSE while this is in force: a new account can be created without a
-- consent row, because the check that refuses one lives in the function below.
-- The click-through still appears on the register page and the row is still
-- written for anyone who ticks it, but nothing enforces it any more. Treat this
-- as a stop-the-bleeding step, not a resting state.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_role  text;
  invited_class uuid;
begin
  -- Look up the new user's email in the invite list (case-insensitive).
  select role, class_id into invited_role, invited_class
  from public.allowed_emails
  where lower(email) = lower(new.email);

  -- Not invited? Stop the signup cold.
  if invited_role is null then
    raise exception 'This email is not on the invite list.';
  end if;

  -- Invited: create their profile with the role from the invite list.
  insert into public.profiles (id, email, role)
  values (new.id, new.email, invited_role);

  if invited_role = 'instructor' then
    -- A new instructor gets their own class, and it starts empty.
    insert into public.classes (name, instructor_id)
    values (split_part(new.email, '@', 1) || '''s Class', new.id)
    on conflict (instructor_id, name) do nothing;

  elsif invited_class is not null then
    -- A new student joins the class their invite named.
    insert into public.class_members (class_id, user_id)
    values (invited_class, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- Same revoke Gate 1 and Phase 5 both end with, for the same reason.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
