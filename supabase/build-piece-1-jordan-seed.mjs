// Generates supabase/piece-1-jordan-seed.sql from the accepted persona file:
//   docs/persona-jordan-plant-manager.md -> a new Jordan scenarios row
//
// Why a generator: it copies the persona text exactly, so we never retype it by
// hand. Re-run it any time that source file changes:
//   node supabase/build-piece-1-jordan-seed.mjs
//
// This mirrors supabase/build-stage-3-seed.mjs (the Alex seed). Two differences:
//   - it sets meeting_type = 'presentation' (Alex is 'discovery'),
//   - it seeds NO rubric. Jordan reuses the SAME Great Northwoods rubric as
//     Alex, found by name, because that rubric already carries per-item tags for
//     both the discovery and the presentation meeting.
//
// The output file is what you actually run in the Supabase SQL Editor.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// --- 1. The persona file: pull out the two sections we seed, verbatim --------
const personaMd = readFileSync(
  join(root, "docs", "persona-jordan-plant-manager.md"),
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

// --- 2. Safety check: neither section may contain our dollar-quote tags ------
// Postgres dollar-quoting ($tag$ ... $tag$) needs no escaping as long as the
// content never contains the chosen tag. Jordan's text has real dollar amounts
// ($10,000, $700, $42,000), which are harmless: only the exact tags below would
// break the quoting. Confirm that before we trust it.
const guards = [
  ["$prompt$", personaSystemPrompt],
  ["$context$", scenarioContext],
];
for (const [tag, text] of guards) {
  if (text.includes(tag)) {
    throw new Error(`Content unexpectedly contains the tag ${tag}; pick another tag.`);
  }
}

// The rubric Jordan is scored by. This is the SAME rubric Alex uses; it is
// looked up by name at run time rather than pasted as an id, so the seed stays
// readable and cannot point at a stale id.
const rubricName = "Great Northwoods 290-point";

const scenarioTitle = "Presentation-Close: Jordan (plant manager)";
const personaName = "Jordan";
const meetingType = "presentation";

// --- 3. Write the SQL --------------------------------------------------------
const sql = `-- Relii sprint piece 1 seed: the Jordan Presentation-Close scenario.
--
-- GENERATED FILE. Do not edit by hand. Re-create it with:
--   node supabase/build-piece-1-jordan-seed.mjs
-- Source:
--   docs/persona-jordan-plant-manager.md (accepted July 16, 2026)
--
-- HOW TO USE: open the Supabase dashboard, go to "SQL Editor", paste this whole
-- file in, and click "Run". It is safe to run more than once: the insert is
-- skipped if a scenario with this title already exists.
--
-- REQUIREMENT: run supabase/piece-1-meeting-type.sql FIRST. This insert sets
-- meeting_type, which that file adds.
--
-- This ADDS one row only. It does not create, change, or remove any table, and
-- it does not touch the Alex scenario or the rubric. Jordan is scored by the
-- SAME rubric as Alex ("${rubricName}"), which already tags each
-- item with the meeting it belongs to; the presentation content items are the
-- 22 items worth 220 points.

insert into public.scenarios
  (title, persona_name, persona_system_prompt, scenario_context, meeting_type, rubric_id)
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

-- Check it worked (this changes nothing; it just shows you the result).
-- Expect two rows: Alex / discovery, and Jordan / presentation.
select title, persona_name, meeting_type
  from public.scenarios
 order by created_at asc;
`;

writeFileSync(join(here, "piece-1-jordan-seed.sql"), sql, "utf8");
console.log("Wrote supabase/piece-1-jordan-seed.sql");
console.log(`  scenario: ${scenarioTitle} (persona ${personaName}, ${meetingType})`);
console.log(`  rubric:   ${rubricName} (reused, not re-seeded)`);
console.log(`  context:  ${scenarioContext.length} chars`);
console.log(`  prompt:   ${personaSystemPrompt.length} chars`);
