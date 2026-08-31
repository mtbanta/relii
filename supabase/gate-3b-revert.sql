-- Relii Gate 3b: THE UNDO for supabase/gate-3b-policies.sql.
--
-- HOW TO USE: only if something has actually gone wrong. Open your Supabase
-- dashboard, click "SQL Editor", "New query", paste this whole file in, and
-- click "Run". It is safe to run more than once, and safe to run even if the
-- Gate 3b migration was never applied.
--
-- WHAT IT DOES: puts the two allowed_emails rules back exactly as they were
-- before Gate 3b, saying public.is_instructor() again. That returns the invite
-- list to "any instructor may read it and add to it", which is the pre-gate
-- behaviour: less safe, and known to work.
--
-- ==> BOTH BODIES BELOW WERE MECHANICALLY DIFFED AGAINST supabase/schema.sql,
--     LINES 116 TO 125, WHICH IS WHERE THESE TWO RULES WERE ORIGINALLY CREATED,
--     AND THEY MATCH VERBATIM. That check is what makes this file trustworthy
--     rather than merely plausible, and it is the same check that was done on
--     supabase/gate-2-revert.sql before Gate 2 was run. Neither rule has been
--     edited by any migration since schema.sql: Gate 2 deliberately left them
--     alone (gate-2-policies.sql section on allowed_emails) and so did Gate 3a
--     (gate-3a-policies.sql section 6). So schema.sql is still the true original
--     and this really is a restore rather than a rewrite. <==
--
-- WHAT IT DOES NOT DO, and this is the important part.
--
--   IT DOES NOT UNDO THE GATE 3b CODE. The isolation in this piece is in
--   twenty-two application files, not in these two rules. Running this file
--   leaves every page and route still scoped to the caller's class, which is
--   correct and is what you want: the code half is the actual fix and it has its
--   own undo, which is redeploying the previous commit.
--
--   IT TOUCHES NOTHING ELSE. Not the Gate 2 rules, not the Gate 3a rules, not
--   the profiles rule, not the column grants on scenarios, not Storage, and no
--   data anywhere.
--
--   IT DOES NOT RE-CREATE public.is_instructor(). Gate 3b deliberately did not
--   drop it, precisely so that this file works. If it is ever dropped in a later
--   piece, this revert stops working and must be updated in the same sitting.

-- Invite list: only instructors can read it. (Verbatim from schema.sql line 116.)
drop policy if exists "instructors read invite list" on public.allowed_emails;
create policy "instructors read invite list"
  on public.allowed_emails for select
  using (public.is_instructor());

-- Invite list: only instructors can add to it. (Verbatim from schema.sql line 122.)
drop policy if exists "instructors add to invite list" on public.allowed_emails;
create policy "instructors add to invite list"
  on public.allowed_emails for insert
  with check (public.is_instructor());

-- ---------------------------------------------------------------------------
-- Confirm the revert landed.
-- ---------------------------------------------------------------------------
-- Both rows should read "is_instructor (reverted)".
select
  policyname,
  case
    when coalesce(qual, '') like '%is_instructor%'
      or coalesce(with_check, '') like '%is_instructor%' then 'is_instructor (reverted)'
    when coalesce(qual, '') like '%instructs_class%'
      or coalesce(with_check, '') like '%instructs_class%' then 'instructs_class (STILL SCOPED, revert did not apply)'
    else 'something else, look at it'
  end as rule_now
from pg_policies
where schemaname = 'public'
  and tablename = 'allowed_emails'
order by policyname;
