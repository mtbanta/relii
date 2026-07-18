// Generates supabase/stage-3-seed.sql from the two finalized source files:
//   docs/rubric-great-northwoods.json   -> the rubrics row
//   docs/persona-alex-procurement.md     -> the Alex scenarios row
//
// Why a generator: it copies the persona text and the rubric exactly, so we
// never retype them by hand. Re-run it any time those source files change:
//   node supabase/build-stage-3-seed.mjs
//
// The output file is what you actually run in the Supabase SQL Editor.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// --- 1. The rubric (read the JSON; keep its items list exactly as written) ---
const rubric = JSON.parse(
  readFileSync(join(root, "docs", "rubric-great-northwoods.json"), "utf8"),
);
const rubricName = rubric.name;
const rubricDescription = rubric.description;
const rubricItemsJson = JSON.stringify(rubric.items, null, 2);

// --- 2. The persona file: pull out the two sections we seed, verbatim --------
const personaMd = readFileSync(
  join(root, "docs", "persona-alex-procurement.md"),
  "utf8",
);

// Grab everything after a "## Heading" line up to the next line that is just "---".
function sectionAfterHeading(markdown, headingStartsWith) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) =>
    line.startsWith("## " + headingStartsWith),
  );
  if (start === -1) {
    throw new Error(`Could not find heading: ## ${headingStartsWith}`);
  }
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") break;
    body.push(lines[i]);
  }
  // Trim leading/trailing blank lines, but keep the text inside exactly.
  return body.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

const scenarioContext = sectionAfterHeading(personaMd, "Scenario context");
const personaSystemPrompt = sectionAfterHeading(
  personaMd,
  "Persona system prompt",
);

// --- 3. Safety check: none of the text may contain our dollar-quote tags -----
// Postgres dollar-quoting ($tag$ ... $tag$) needs no escaping as long as the
// content never contains the chosen tag. Confirm that before we trust it.
const guards = [
  ["$name$", rubricName],
  ["$desc$", rubricDescription],
  ["$items$", rubricItemsJson],
  ["$prompt$", personaSystemPrompt],
  ["$context$", scenarioContext],
];
for (const [tag, text] of guards) {
  if (text.includes(tag)) {
    throw new Error(`Content unexpectedly contains the tag ${tag}; pick another tag.`);
  }
}

const scenarioTitle = "Discovery-Close: Alex (procurement director)";
const personaName = "Alex";
// Added with the meeting_type column (sprint piece 1). Alex is the discovery
// meeting. This matters only if the database is ever rebuilt from scratch: the
// live Alex row was backfilled by supabase/piece-1-meeting-type.sql, and the
// insert below is skipped whenever that row already exists.
const meetingType = "discovery";

// --- 4. Write the SQL --------------------------------------------------------
const sql = `-- Relii Stage 3 seed: the Great Northwoods rubric and the Alex Discovery scenario.
--
-- GENERATED FILE. Do not edit by hand. Re-create it with:
--   node supabase/build-stage-3-seed.mjs
-- Sources:
--   docs/rubric-great-northwoods.json
--   docs/persona-alex-procurement.md
--
-- HOW TO USE: open the Supabase dashboard, go to "SQL Editor", paste this whole
-- file in, and click "Run". It is safe to run more than once: each insert is
-- skipped if a matching row already exists.
--
-- This ADDS data only. It does not create, change, or remove any table.

-- ---------------------------------------------------------------------------
-- 1. The grading rubric. Inserted only if a rubric with this name is not present.
-- ---------------------------------------------------------------------------
insert into public.rubrics (name, description, items)
select
  $name$${rubricName}$name$,
  $desc$${rubricDescription}$desc$,
  $items$${rubricItemsJson}$items$::jsonb
where not exists (
  select 1 from public.rubrics where name = $name$${rubricName}$name$
);

-- ---------------------------------------------------------------------------
-- 2. The Alex Discovery-Close scenario, linked to the rubric above.
--    Persona prompt and scenario context are copied verbatim from
--    docs/persona-alex-procurement.md.
-- ---------------------------------------------------------------------------
insert into public.scenarios (title, persona_name, persona_system_prompt, scenario_context, meeting_type, rubric_id)
select
  $title$${scenarioTitle}$title$,
  $pname$${personaName}$pname$,
  $prompt$${personaSystemPrompt}$prompt$,
  $context$${scenarioContext}$context$,
  $mtype$${meetingType}$mtype$,
  (select id from public.rubrics
     where name = $name$${rubricName}$name$
     order by created_at asc
     limit 1)
where not exists (
  select 1 from public.scenarios where title = $title$${scenarioTitle}$title$
);
`;

writeFileSync(join(here, "stage-3-seed.sql"), sql, "utf8");
console.log("Wrote supabase/stage-3-seed.sql");
console.log(`  rubric: ${rubricName} (${rubric.items.length} items)`);
console.log(`  scenario: ${scenarioTitle} (persona ${personaName})`);
