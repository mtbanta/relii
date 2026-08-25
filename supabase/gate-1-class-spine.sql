-- Relii Gate 1: the class spine. SCHEMA AND BACKFILL ONLY.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- WHAT THIS IS FOR
-- Relii currently has no data separation between instructors. Every instructor
-- rule says "is this person an instructor", never "is this person THIS class's
-- instructor". Before that can be fixed, every row has to be able to answer the
-- question "which class do you belong to". This file adds the place to keep
-- that answer, and fills it in for the data that already exists. It does
-- nothing else.
--
-- NOTHING CHANGES ON SCREEN. No page and no route reads any of this yet. The
-- app behaves identically after this file runs. Reading the new column is Gate
-- 3's job; rewriting the security rules is Gate 2's.
--
-- SAFE TO RUN TWICE. Every step is guarded, so a second run changes nothing.
--
-- WHAT THIS DOES NOT DO
-- It changes no existing security rule, no page, no route, and no Storage rule.
-- It adds no NOT NULL requirement: every new column is optional on purpose,
-- because nothing in the app fills it in yet, and requiring it today would
-- break creating an assignment, generating a persona and starting a session,
-- in production, immediately.

-- ---------------------------------------------------------------------------
-- 1. classes: the unit of data ownership. A class belongs to one instructor.
-- ---------------------------------------------------------------------------
-- ON DELETE RESTRICT is deliberate. If an instructor's account is deleted, we
-- must NOT silently destroy a class full of graded student work, and we must
-- not leave it ownerless either. Restrict makes the account deletion fail
-- loudly instead. Deliberate deletion, with an export in front of it, is Gate 4.
--
-- The UNIQUE rule on (instructor_id, name) is what lets this file, and the
-- signup rule further down, be run repeatedly without creating duplicates.
create table if not exists public.classes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  instructor_id uuid not null references auth.users (id) on delete restrict,
  created_at    timestamptz not null default now(),
  unique (instructor_id, name)
);

create index if not exists classes_instructor_idx
  on public.classes (instructor_id);

-- ---------------------------------------------------------------------------
-- 2. class_members: which STUDENTS are in a class.
-- ---------------------------------------------------------------------------
-- Students only. An instructor's ownership lives on classes.instructor_id, not
-- here. Keeping owners and members in separate places means a co-instructor
-- feature later is an ADDITION rather than a change of meaning. Co-instructors
-- are not in this piece.
--
-- Both links cascade: if the class or the person is deleted, the membership row
-- is meaningless and should go with them. This destroys no student work; a
-- membership row holds no content of its own.
create table if not exists public.class_members (
  class_id   uuid not null references public.classes (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

-- The primary key already indexes class_id first. This one answers the other
-- direction: "which classes is this person in?"
create index if not exists class_members_user_idx
  on public.class_members (user_id);

-- ---------------------------------------------------------------------------
-- 3. Lock the two new tables down.
-- ---------------------------------------------------------------------------
-- This is the ONLY security-rule line in this file, and it is not a change to
-- any existing rule. Supabase publishes every table in the public schema over
-- its web API, so a new table with security switched OFF is readable by anyone
-- holding the public key. That would expose every class and every membership
-- row. Switching security ON with NO rules attached means: ordinary users
-- (students and instructors alike) cannot read or write these tables at all,
-- and only the server's service-role key can, exactly like session rows. Gate 2
-- adds the read rules.
alter table public.classes       enable row level security;
alter table public.class_members enable row level security;

-- ---------------------------------------------------------------------------
-- 4. The class_id column on everything that belongs to a class.
-- ---------------------------------------------------------------------------
-- EVERY ONE OF THESE IS OPTIONAL (nullable) ON PURPOSE. Do not add NOT NULL
-- here. Nothing in the app sets this value when it creates a row yet, so
-- requiring it would break every create path the moment this runs. Tightening
-- is a cleanup step AFTER Gate 3, not part of this piece.

-- The four content tables, with a real link to classes. ON DELETE RESTRICT so a
-- class cannot be deleted out from under content that belongs to it.
alter table public.rubrics
  add column if not exists class_id uuid references public.classes (id) on delete restrict;

alter table public.scenarios
  add column if not exists class_id uuid references public.classes (id) on delete restrict;

alter table public.assignments
  add column if not exists class_id uuid references public.classes (id) on delete restrict;

alter table public.sessions
  add column if not exists class_id uuid references public.classes (id) on delete restrict;

-- The invite list, so a new user lands in the right class at signup.
-- THIS LINK IS LOAD BEARING, not decoration: the signup rule in section 7 uses
-- this value to create the membership row. If it could point at a deleted
-- class, that insert would fail inside the signup rule and kill the signup with
-- an unreadable error. Restrict makes that impossible.
alter table public.allowed_emails
  add column if not exists class_id uuid references public.classes (id) on delete restrict;

-- The two audit logs get a PLAIN uuid with NO link, deliberately.
-- These tables store snapshots on purpose: their instructor_id, student_id and
-- assignment_id are all plain copies with no link, "so a later account or
-- assignment delete can never remove or blank a log entry". A real link to
-- classes would contradict that, and would let an old log row block a class
-- deletion forever. Gate 4 decides what an export-first delete does with the log.
alter table public.submission_resets
  add column if not exists class_id uuid;

alter table public.assignment_deletes
  add column if not exists class_id uuid;

-- ---------------------------------------------------------------------------
-- 5. Indexes, so "everything in this class" stays fast.
-- ---------------------------------------------------------------------------
create index if not exists rubrics_class_idx            on public.rubrics (class_id);
create index if not exists scenarios_class_idx          on public.scenarios (class_id);
create index if not exists assignments_class_idx        on public.assignments (class_id);
create index if not exists sessions_class_idx           on public.sessions (class_id);
create index if not exists allowed_emails_class_idx     on public.allowed_emails (class_id);
create index if not exists submission_resets_class_idx  on public.submission_resets (class_id);
create index if not exists assignment_deletes_class_idx on public.assignment_deletes (class_id);

-- ---------------------------------------------------------------------------
-- 6. The backfill: give every row that already exists a class.
-- ---------------------------------------------------------------------------
-- All existing data is demo and test data. No real student has ever used Relii.
-- It all goes into ONE class, "Relii Demo (Historical)", owned by the first
-- seeded instructor account. It is kept together because splitting it by who
-- created what would scatter Alex, Jordan, the Great Northwoods rubric and the
-- sessions that point at them across several classes, and a split demo is a
-- broken demo. It is NOT given to Tom's production account, because a new
-- instructor must start empty.
--
-- Every step below is guarded on "is it still empty?", so running this file a
-- second time changes nothing.
do $$
declare
  owner_id uuid;
  hist_id  uuid;
begin
  -- Find the account that will own the historical class.
  select id into owner_id
  from public.profiles
  where lower(email) = lower('michaeltbanta@gmail.com')
    and role = 'instructor';

  if owner_id is null then
    raise exception
      'Gate 1 stopped: no registered instructor found for michaeltbanta@gmail.com. That account must exist in profiles before this file can run. Nothing was backfilled.';
  end if;

  -- The historical class itself.
  insert into public.classes (name, instructor_id)
  values ('Relii Demo (Historical)', owner_id)
  on conflict (instructor_id, name) do nothing;

  select id into hist_id
  from public.classes
  where instructor_id = owner_id
    and name = 'Relii Demo (Historical)';

  -- The content tables.
  update public.rubrics     set class_id = hist_id where class_id is null;
  update public.scenarios   set class_id = hist_id where class_id is null;
  update public.assignments set class_id = hist_id where class_id is null;

  -- Sessions take their class from their SCENARIO, not their assignment.
  -- A free practice run has no assignment (assignment_id is optional), but
  -- every session has a scenario (scenario_id is required), so the scenario is
  -- the only link that is always there. Writing it as a lookup rather than a
  -- flat value also keeps this correct on a later re-run, once sessions in
  -- other classes exist.
  update public.sessions s
     set class_id = sc.class_id
    from public.scenarios sc
   where sc.id = s.scenario_id
     and s.class_id is null;

  -- The two audit logs.
  update public.submission_resets  set class_id = hist_id where class_id is null;
  update public.assignment_deletes set class_id = hist_id where class_id is null;

  -- The invite list, so someone invited but not yet registered still lands in
  -- the right place when they sign up.
  update public.allowed_emails set class_id = hist_id where class_id is null;

  -- Every existing student joins the historical class.
  insert into public.class_members (class_id, user_id)
  select hist_id, p.id
  from public.profiles p
  where p.role = 'student'
  on conflict do nothing;

  -- Every OTHER instructor gets their own EMPTY class, so the spine is complete
  -- rather than half filled in. Guarded on "owns no class yet" rather than on
  -- "is not me", so that re-running this after a new instructor has registered
  -- does not hand them a second class.
  insert into public.classes (name, instructor_id)
  select split_part(p.email, '@', 1) || '''s Class', p.id
  from public.profiles p
  where p.role = 'instructor'
    and not exists (
      select 1 from public.classes c where c.instructor_id = p.id
    )
  on conflict (instructor_id, name) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Signup: put each new user on the spine.
-- ---------------------------------------------------------------------------
-- This REPLACES the signup rule from supabase/schema.sql. Everything it did
-- before it still does, in the same order, including the part that matters
-- most: an email that is not on the invite list still stops the signup cold.
-- That block is the only thing standing between Relii and open registration.
--
-- WHAT IS NEW, and it is only the last few lines:
--   - an invited INSTRUCTOR gets a class of their own, created for them and
--     owned by them, named after their email (tbbanta@ksu.edu becomes
--     "tbbanta's Class"). They start EMPTY: no content is copied in.
--   - an invited STUDENT joins the class named on their invite.
--   - a STUDENT whose invite names NO class simply gets no membership row. They
--     register normally and nothing breaks. Raising an error instead would lock
--     out everyone already invited, and guessing a class for them would drop a
--     real student into the demo data. After the backfill above, no existing
--     invite is in this state; it can only happen for an invite created between
--     now and Gate 3, which is the piece that fills the value in.
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

-- ---------------------------------------------------------------------------
-- 8. Re-close the door that stage 4 closed.
-- ---------------------------------------------------------------------------
-- supabase/stage-4-security-hardening.sql deliberately took away the ability
-- for logged-in and anonymous visitors to call the signup rule by hand over the
-- web API. Postgres keeps an existing function's permissions across a "create
-- or replace", so that should still hold after section 7. This line re-applies
-- it anyway. It costs nothing and removes any chance that this file quietly
-- reopens a hole a previous file closed on purpose. The signup trigger is
-- unaffected: a trigger runs as the function's owner, not as whoever is
-- signing up.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
