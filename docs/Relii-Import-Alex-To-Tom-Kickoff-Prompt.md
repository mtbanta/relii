# Copy the Original Alex into Tom's Classes

A small, one-off data session between Phase 3b and Phase 3c. **Every phase so far is closed; do not reopen any.** There is **no code change and no migration**: one approved insert, read back. If you find code must change for this to work, stop and say why.

**Before anything else, state the filename and line count you read.**

## READ FIRST

**PROJECT_STATE.md, the Phase 3c handoff and the 3b record**, in particular ruling 6: 3b made the chosen list, the toggle and View Persona work for a chosen persona with `generation_fields` null, and `scripts/check-persona-list.mjs` proves it. **STATE YOUR PLAN AND WAIT FOR APPROVAL.**

## The owner's rulings (September 11, 2026, after a call with Tom)

1. **Tom wants ALEX ONLY.** No Jordan.
2. **The ORIGINAL hand-written Alex**: "Discovery-Close: Alex (procurement director)", in the owner's class "Relii Demo (Historical)". Not the generated "Presentation-Close: Alex (regional manager)" in B1.
3. **ONE COPY PER CLASS TOM OWNS.** Tom's account is `tbbanta@ksu.edu`.
4. **Copy, never share.** The original row is not changed in any way.

## The narrow exception to "never touch Tom's classes", authorised for this session only

- **You MAY** read the `id` and `name` of the classes whose instructor is Tom, insert the copies, and read back the rows you inserted.
- **You MAY NOT** sign in as Tom; read his students, invites, sessions, assignments or anything else in his classes; or change any existing row anywhere.
- **Show the owner Tom's class names and ids BEFORE any insert.** He confirms the list.
- **WHAT THE OWNER SAW, September 11, from /admin (second-party evidence, not a substitute for your read):** Tom's class **"Sales 300 Fall 2026"**, created Sep 11, 2026, reading "0 students, 0 pending invites, 0 rubrics, 0 personas, 0 assignments, 0 sessions, 0 recordings." That page shows one class. **Your read decides how many classes Tom owns**; if it returns anything other than that one class, stop and show the owner before inserting.

## What the copy must be

Enumerate `public.scenarios`' columns from `information_schema`; do not rely on this list or on any SQL file. Then show a column-by-column mapping in the SQL file:
- **Copied byte for byte from the original:** every persona-defining column, which includes `title`, `persona_name`, `persona_system_prompt`, `scenario_context`, `meeting_type`, and anything else the audit shows drives the role-play or its display.
- **`class_id`:** each of Tom's classes.
- **`rubric_id`: null.** Scoring comes from the assignment's rubric, and `scenarios_rubric_same_class_fkey` would refuse the original's rubric in another class anyway.
- **`enabled`: true**, so Tom can assign it at once.
- **`generation_group_id`:** a NEW, distinct uuid per copy. The 3b toggle refuses an empty group id, and a group of one row is "chosen" by 3b's one-row rule.
- **`generation_fields`: null**, which is the shape ruling 6 proved. **Do not invent a partial `generation_fields`**: an object with no `candidate` or `inputs` is a shape nothing has tested.
- **`chain_role`:** whatever the original holds. Alex has no pair here.
- **`created_by`:** propose null or Tom's id, with the reason. `id` and `created_at` take their defaults.

**One `insert ... select` statement for all of Tom's classes**, in a file the owner reads first, applied as one approved call, with the revert stated beside it. **The revert deletes by the new ids only, and only while nothing references them** (count assignments and sessions first).

## Proof

1. **Before:** the count of scenarios in each of Tom's classes, as counts only (expected 0 for Sales 300 Fall 2026, per the owner's observation), and an md5 of the original's `persona_system_prompt` and `scenario_context`.
2. **After:** each copy read back: its class id is one of Tom's, both text md5s equal the original's, `rubric_id` and `generation_fields` are null, `enabled` is true, and the group id is distinct per copy. Each of Tom's class counts has risen by exactly one.
3. **The original is unchanged:** its md5s, `enabled`, `class_id` and group id all match the before read.
4. **Tom's list would show it:** run the SHIPPED chosen-persona loader from 3b (read-only, service role, locally) for each of Tom's class ids, and show Alex under Chosen personas with a Turn off control. **Report the loader's output for the copy only**, not his other personas.
5. **The owner's closing observation:** he reopens Tom's class in /admin and reads "1 personas" (the page's own wording) where it read "0 personas" before. Ask him for it, and record it as second-party evidence.

**Nothing to clean up** unless the revert is invoked. Record the new row ids in PROJECT_STATE.

## How testing runs

The SQL runs through the Supabase MCP, with every statement in a file the owner reads and each section returning its answer as its last statement. **No browser session is needed; do not open one signed in as anyone.** git commit and push stay behind their ask rules, and the only files committed are the SQL file and the PROJECT_STATE record.

## Conventions

No em or en dashes outside chat. Record each owner ruling in PROJECT_STATE when it is given, including the narrow exception above and its end. **Note for Tom, recorded rather than acted on:** if Tom switches a copy off and it has never been used, the per-generation Discard on his page can delete it permanently; that is ordinary 3b behaviour. Leave the Phase 3c handoff intact.
