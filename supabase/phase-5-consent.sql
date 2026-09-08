-- Relii Phase 5: the consent record for the click-through.
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", paste this
-- whole file in, and click "Run". It is safe to run more than once.
--
-- WHAT THIS FILE DOES:
--   1. Creates public.consents, one row per acceptance.
--   2. Replaces public.handle_new_user() so an account and its consent row are
--      written in the SAME transaction. No accepted version, no account.
--
-- ==> THIS FILE NOW OWNS public.handle_new_user().
--     supabase/gate-1-class-spine.sql holds the OLDER version of that function.
--     Running that file after this one silently removes the consent check while
--     every other test still passes. A comment at its section 7 says so, and so
--     does the Open Issues section of PROJECT_STATE.md. IF GATE 1 EVER HAS TO BE
--     RE-RUN, RUN THIS FILE AFTERWARDS.
--
-- REVERT: supabase/phase-5-consent-revert.sql restores the Gate 1 function
-- exactly and leaves this table and its rows alone. That one step is enough to
-- put registration back to how it behaves today; the application deploy does not
-- have to be rolled back with it, because the restored function simply ignores
-- the consent metadata the browser goes on sending.

-- ---------------------------------------------------------------------------
-- 1. The consent record
-- ---------------------------------------------------------------------------
-- Two version columns rather than one. Ticking the box is ONE consent act
-- (section 6 of the agreement incorporates the privacy policy by reference), so
-- it is one row, but the two documents can be revised independently, so each
-- one's version is recorded. The version strings are named in lib/legal.ts, and
-- the TEXT behind any version is recoverable from git.
--
-- NO class_id, and that is deliberate: consent belongs to a PERSON, not to a
-- class. A student can be moved between classes and their consent does not
-- change. Gate 4a requires a class on every class-scoped table; this is not one.
create table if not exists public.consents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  privacy_version   text not null,
  agreement_version text not null,
  accepted_at       timestamptz not null default now(),
  -- Accepting the same pair twice records one row, not two, so a double submit
  -- of the login gate cannot create duplicates.
  unique (user_id, privacy_version, agreement_version)
);

-- RLS on, and NO policies at all, so nothing reachable from a browser can read
-- or write a consent row. Every read and write goes through the service-role key
-- on the server (the same pattern as /api/profile/name), and the signup trigger
-- writes as its own owner rather than as the person signing up.
alter table public.consents enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Signup: no accepted version, no account
-- ---------------------------------------------------------------------------
-- This is the Gate 1 function with ONE block added, marked below. Everything it
-- did before it still does, in the same order, including the invite check that
-- is the only thing standing between Relii and open registration.
--
-- WHY THE CHECK IS FOR PRESENCE RATHER THAN FOR A KNOWN VERSION: validating
-- against a list of current versions would put a second thing that must be
-- correct on the most load-bearing path in the schema, where a missing or
-- misspelled row breaks registration for everyone. The app names the version
-- (lib/legal.ts) and the database refuses to create an account without one, so a
-- future revision from Tom is a code deploy and this function is never touched
-- again.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_role       text;
  invited_class      uuid;
  accepted_privacy   text;
  accepted_agreement text;
begin
  -- Look up the new user's email in the invite list (case-insensitive).
  select role, class_id into invited_role, invited_class
  from public.allowed_emails
  where lower(email) = lower(new.email);

  -- Not invited? Stop the signup cold.
  if invited_role is null then
    raise exception 'This email is not on the invite list.';
  end if;

  -- ==> PHASE 5, AND THIS IS THE WHOLE OF THE ADDITION. The versions arrive in
  --     the signup's own metadata, so they are part of the same insert as the
  --     account. A signup carrying no accepted version is refused here and no
  --     account is created: this raise rolls back the auth.users row too, the
  --     same way the invite check above has since Stage 1. That is what makes
  --     the checkbox on the register page consent rather than decoration.
  accepted_privacy   := nullif(trim(new.raw_user_meta_data ->> 'privacy_version'), '');
  accepted_agreement := nullif(trim(new.raw_user_meta_data ->> 'agreement_version'), '');

  if accepted_privacy is null or accepted_agreement is null then
    raise exception 'You must accept the Pilot Agreement and the Privacy Policy to create an account.';
  end if;

  -- Invited: create their profile with the role from the invite list.
  insert into public.profiles (id, email, role)
  values (new.id, new.email, invited_role);

  -- The consent record, in the same transaction as the profile above, so the
  -- two cannot drift apart.
  insert into public.consents (user_id, privacy_version, agreement_version)
  values (new.id, accepted_privacy, accepted_agreement);

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

-- The trigger itself is unchanged and is NOT re-created: "create or replace"
-- keeps on_auth_user_created pointing at the new body. This re-applies the Gate
-- 1 revoke for the reason Gate 1 gave: it costs nothing and removes any chance
-- that this file quietly reopens a hole an earlier file closed on purpose.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
