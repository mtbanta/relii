-- Relii database setup for Stage 1 (invite-only auth with two roles).
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", paste this
-- whole file in, and click "Run". It is safe to run more than once.
--
-- What this creates:
--   1. allowed_emails  - the invite list. Only emails here can register.
--   2. profiles        - one row per real user, holding their role.
--   3. A rule that auto-creates a profile (and blocks uninvited emails) at signup.
--   4. Security rules so only instructors can see or change the invite list.
--   5. A seed row so your first instructor account can be created.

-- ---------------------------------------------------------------------------
-- 1. The invite list
-- ---------------------------------------------------------------------------
create table if not exists public.allowed_emails (
  email      text primary key,
  role       text not null check (role in ('student', 'instructor')),
  added_by   uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. The profiles table (the role lives here)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null check (role in ('student', 'instructor')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Auto-create a profile at signup, and BLOCK any email not on the invite list
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_role text;
begin
  -- Look up the new user's email in the invite list (case-insensitive).
  select role into invited_role
  from public.allowed_emails
  where lower(email) = lower(new.email);

  -- Not invited? Stop the signup cold.
  if invited_role is null then
    raise exception 'This email is not on the invite list.';
  end if;

  -- Invited: create their profile with the role from the invite list.
  insert into public.profiles (id, email, role)
  values (new.id, new.email, invited_role);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Helper functions (used by the security rules below, no recursion)
-- ---------------------------------------------------------------------------

-- Is the email already on the invite list? Safe for the public sign-up page to call.
create or replace function public.is_email_allowed(check_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(check_email)
  );
$$;

-- Is the person making this request an instructor?
create or replace function public.is_instructor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'instructor'
  );
$$;

grant execute on function public.is_email_allowed(text) to anon, authenticated;
grant execute on function public.is_instructor() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Security rules (Row Level Security)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;

-- Profiles: a logged-in user can read their own profile (to learn their role).
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Invite list: only instructors can read it.
drop policy if exists "instructors read invite list" on public.allowed_emails;
create policy "instructors read invite list"
  on public.allowed_emails for select
  using (public.is_instructor());

-- Invite list: only instructors can add to it.
drop policy if exists "instructors add to invite list" on public.allowed_emails;
create policy "instructors add to invite list"
  on public.allowed_emails for insert
  with check (public.is_instructor());

-- ---------------------------------------------------------------------------
-- 6. Seed the first instructor so the very first account can be created.
-- ---------------------------------------------------------------------------
insert into public.allowed_emails (email, role)
values ('michaeltbanta@gmail.com', 'instructor')
on conflict (email) do nothing;
