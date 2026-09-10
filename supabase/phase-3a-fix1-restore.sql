-- Relii Phase 3a. UNDOING THE PROBE ON 'ZZ 3a fix1'. One statement.
--
-- ==> WRITTEN BEFORE THE BREAK WAS APPLIED, NOT AFTER. The array below was read
--     from statement 1 of phase-3a-fix1-probe.sql and pasted here while the
--     rubric was still intact, so the revert existed before the damage did. That
--     ordering is the whole point of the probe's "run statement 1 first and keep
--     its output" rule: the levels are not recoverable from anywhere else once
--     the key is gone.
--
-- ==> WHAT IT IS FOR, AND IT IS NOT ONLY CLEANUP. Fix 1's proof needs the retry
--     to SUCCEED. Restoring the levels is what makes the second press of "Try
--     scoring again" score rather than refuse again, so this file is a step in
--     the measurement and not merely tidying up after it. A refusal on its own
--     is an assertion; a refusal beside a matching success is a measurement.
--
-- ==> WHAT IT TOUCHES. One rubric row, a87601c4-2b55-4d06-a85a-c214a6c274ea,
--     which was uploaded minutes earlier for this test and is attached to the
--     throwaway assignment 'ZZ 3a fix1' in B1 and to nothing else. The rubric on
--     'ZZ 3a fix2' is a SEPARATE upload with a different id and is deliberately
--     NOT restored: Fix 2 needs its failure to persist. Restoring by id rather
--     than by title is what keeps those two apart.
--
--     Nothing else is read or written. No session, no transcript, no score.
--
-- ==> THE REVERT OF THIS REVERT is the probe's statement 2, which is idempotent:
--     it removes the same key again.

-- ---------------------------------------------------------------------------
-- THE RESTORE. Puts the six levels back on criterion 5 (index 4).
-- ---------------------------------------------------------------------------
-- The array is verbatim from the probe's statement 1 output, read and kept
-- before anything was changed. criterion_now_has_levels must read true and
-- levels_restored must read 6.
update public.rubrics r
set items = jsonb_set(
  r.items,
  '{4,levels}',
  '[{"name":"Excellent","points":5,"descriptor":"Ready for an entry-level sales role."},
    {"name":"Proficient","points":4.5,"descriptor":"Emerging professional skills"},
    {"name":"Developing","points":4,"descriptor":"Growth opportunity"},
    {"name":"Limited","points":3.5,"descriptor":"Partially conducted this aspect"},
    {"name":"Minimal","points":2.5,"descriptor":"Initial effort shown"},
    {"name":"Unsatisfactory","points":0.5,"descriptor":"No effort shown or does not meet expectations"}]'::jsonb
)
where r.id = 'a87601c4-2b55-4d06-a85a-c214a6c274ea'::uuid
returning
  r.id                                          as rubric_id,
  r.items -> 4 ->> 'name'                       as criterion_restored,
  jsonb_exists(r.items -> 4, 'levels')          as criterion_now_has_levels,
  jsonb_array_length(r.items -> 4 -> 'levels')  as levels_restored;
