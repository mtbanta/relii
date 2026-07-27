-- Relii sprint piece 3: first and last name columns on profiles.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- RUN THIS BEFORE THE NEW CODE GOES LIVE. The updated app reads and writes these
-- two columns, so if the code is deployed first it will fail with "column does
-- not exist" until this file has been run.
--
-- WHY THIS EXISTS
-- Until now every user is identified only by their email, because profiles has
-- no name field. This piece gives every user a first and last name, captured by
-- a required gate the first time they reach their dashboard, and shown wherever
-- the app shows an email today (the student home, the results and printout, and
-- the instructor submissions table and roster).
--
-- WHAT THIS DOES NOT DO
-- It does not touch the invite list (allowed_emails), the signup trigger, or the
-- invite form. Names are never captured at invite time; the gate is the only
-- place a name is set. It creates no table, removes nothing, and changes no Row
-- Level Security or Storage rule. The existing profiles rule (a user can read
-- their own profile) is untouched. The name write is handled by a small
-- server-side route, not by a new browser write rule, so nothing on profiles is
-- opened up.

-- ---------------------------------------------------------------------------
-- 1. The two name columns.
-- ---------------------------------------------------------------------------
-- Both are OPTIONAL at the database level (they can be empty). This is on
-- purpose: existing accounts and the signup trigger do not supply a name, so a
-- NOT NULL rule would break registration. The "everyone must have a name" rule
-- is enforced in the app by the gate, not by the database. There is deliberately
-- no default value: an empty name is exactly what tells the app to show the gate.
alter table public.profiles
  add column if not exists first_name text;

alter table public.profiles
  add column if not exists last_name text;

-- ---------------------------------------------------------------------------
-- 2. Check it worked (this changes nothing; it just shows you the result).
-- ---------------------------------------------------------------------------
-- Expect every existing account listed with an EMPTY first and last name. That
-- is correct: no one has entered a name yet, so everybody will see the name gate
-- on their next visit and fill it in there. Their email and role are unchanged.
select
  email,
  role,
  first_name,
  last_name
from public.profiles
order by email asc;
