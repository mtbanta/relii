// Reading scaffolded persona candidates back out of the database.
//
// Generating writes two candidates as DISABLED, conversation-only scenarios
// sharing one generation group id (see the scaffold generate route). This file
// reads them back, which is what makes the compare view survive a reload: the
// pair lives in the database, not in the browser's memory.
//
// SERVER ONLY. Every function here uses the service-role admin client, so it
// must never be imported into a Client Component. Both callers are
// instructor-gated pages that check the caller's role before reading.
//
// GATE 3b. Every LOADER below now takes the caller's classId and filters on it,
// because the service-role client bypasses Row Level Security completely and a
// role check alone let any instructor read, edit and discard any other
// instructor's generated personas.
//
// THE classId PARAMETER IS REQUIRED, NOT OPTIONAL, AND THAT IS THE POINT. An
// optional one would silently default to "no filter" at any call site somebody
// forgot, which is the exact failure this gate exists to remove. Required means
// the build fails until every caller has been updated, so the compiler is what
// proves nothing was missed rather than a careful reading.
//
// ==> ONE FUNCTION HERE IS DELIBERATELY NOT SCOPED: countScenarioUsage(). It
//     looks like an inconsistency and it is not. The reason is written out at
//     the function itself, and the general rule it follows is written out once
//     in lib/class-scope.ts. <==
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  PersonaCandidate,
  ScaffoldInputs,
  ChainContext,
} from "@/lib/persona-scaffold";

// The version stamped on every generation_fields object written from now on.
//
// VERSION 1 (up to PD-2) stored the candidate and the admin's inputs, but NOT
// the chain: the gatekeeper facts that a chained decision maker's text is built
// from. Nothing needed them again, because the text was assembled once at
// generation time and never rebuilt.
//
// VERSION 2 (PD-2 onwards) adds the chain, because editing a candidate rebuilds
// its text from the stored fields. Without the chain stored, rebuilding a
// chained decision maker would quietly drop the "you already had a discovery
// meeting with X" narrative and turn it back into a standalone meeting. That is
// exactly the drift the fixed template exists to prevent.
//
// The bump is UNCONDITIONAL, on every generation, including a gatekeeper that
// has no chain at all. Version 2 has to mean "provenance is fully recorded",
// because that is what lets resolveChainForReassembly below read an ABSENT
// chain on a version 2 decision maker as proof that it never had one. If the
// version were only bumped on chain generations, that reading would be wrong.
export const GENERATION_FIELDS_VERSION = 2;

// What we stored in the generation_fields JSON column. Every part is optional
// here on purpose: this is data read back out of a JSON column, so the code
// that renders it should cope with a row that is somehow incomplete rather than
// crash the page.
export type GenerationFields = {
  version?: number;
  candidate_index?: number;
  candidate?: PersonaCandidate;
  inputs?: ScaffoldInputs;
  // Present only on a chained decision maker (version 2 onwards). See above.
  chain?: ChainContext;
  // PHASE 3b. When this persona was CHOSEN as the winner of its generation.
  //
  // It is a marker, not a date anybody reads, and it exists because "is this
  // persona the chosen one" had no answer in the data once the persona was
  // switched off. Before this, the list worked that out from the enabled flag
  // alone, so a chosen persona that was turned off looked exactly like an
  // undecided candidate.
  //
  // ==> IT IS SUFFICIENT AND NEVER REQUIRED, WHICH IS THE WHOLE POINT. Rows
  //     chosen before Phase 3b do not have it, and an Alex and Jordan pair
  //     imported later would have no generation_fields at all. So chosenRowOf()
  //     below reads it as ONE of three ways to be chosen, never as the test.
  //     Anything that made it required would hide every persona chosen before
  //     today. <==
  chosen_at?: string;
  // PHASE 3b. The id of the GATEKEEPER this decision maker was generated from.
  //
  // ==> IT SITS HERE, BESIDE chain, AND DELIBERATELY NOT INSIDE IT.
  //
  //     BE PRECISE ABOUT WHY, BECAUSE THE OBVIOUS REASON IS WRONG AND WAS
  //     MEASURED TO BE WRONG. lib/persona-assembly.ts reads `chain` by NAMED
  //     FIELD (chain.gatekeeperName, chain.gatekeeperRole), so an extra key
  //     inside that object is simply ignored and the assembled text does NOT
  //     move. That was checked against a real chained persona by rebuilding it
  //     with the id injected into `chain`: byte identical. So "it would change
  //     the text" is NOT the argument.
  //
  //     THE REAL ARGUMENT IS ABOUT MEANING. `chain` is the ChainContext handed
  //     to a FROZEN template, and it is also the provenance signal
  //     resolveChainForReassembly depends on: an absent chain on a version 2
  //     decision maker proves it never had an earlier meeting. A pairing id is
  //     neither of those things. Kept outside, ChainContext stays exactly the
  //     five fields the template is given, so this key can never BECOME an
  //     input to it, and "has a chain" keeps meaning "had an earlier meeting"
  //     rather than "has an id attached". <==
  //
  // NEW GENERATIONS ONLY. Nothing backfills it and nothing matches on names, so
  // a decision maker generated before Phase 3b simply records no pair and is
  // shown unpaired. A dangling id (the gatekeeper was discarded) is read the
  // same way: unpaired, never an error.
  chain_from_scenario_id?: string;
};

export type CandidateRow = {
  id: string;
  title: string;
  persona_name: string;
  meeting_type: string;
  chain_role: string | null;
  enabled: boolean;
  rubric_id: string | null;
  scenario_context: string;
  persona_system_prompt: string;
  generation_fields: GenerationFields | null;
  generation_group_id: string;
  created_at: string;
};

const CANDIDATE_COLUMNS =
  "id, title, persona_name, meeting_type, chain_role, enabled, rubric_id, scenario_context, persona_system_prompt, generation_fields, generation_group_id, created_at";

// Which of the pair a row is (1 or 2). Falls back to 0 so a row with no stored
// index still sorts predictably instead of jumping around between reloads.
function candidateIndex(row: CandidateRow): number {
  return row.generation_fields?.candidate_index ?? 0;
}

// Load both candidates of one generation group, always in the same order.
//
// Ordering by candidate_index rather than by created_at is deliberate: both
// rows are written by a single insert, so the database stamps them with an
// IDENTICAL created_at and sorting by date would swap the two columns around
// from one reload to the next.
export async function loadGenerationGroup(
  groupId: string,
  classId: string,
): Promise<CandidateRow[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scenarios")
    .select(CANDIDATE_COLUMNS)
    .eq("generation_group_id", groupId)
    // GATE 3b: another class's generation is not found rather than refused, so
    // the caller cannot tell an id that does not exist from one that is not
    // theirs.
    .eq("class_id", classId);

  // An unknown or malformed group id (someone editing the web address), or one
  // belonging to another class, comes back as an error or as nothing. Either way
  // the page shows "not found" rather than breaking.
  if (error || !data) return [];

  const rows = data as unknown as CandidateRow[];
  return [...rows].sort((a, b) => candidateIndex(a) - candidateIndex(b));
}

// One candidate row by its id, for the chain form (which needs the chosen
// gatekeeper's own generated fields to show what will carry over).
export async function loadCandidateById(
  id: string,
  classId: string,
): Promise<CandidateRow | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scenarios")
    .select(CANDIDATE_COLUMNS)
    .eq("id", id)
    // GATE 3b: a candidate in another class reads as null, and every caller
    // already treats null as "not found".
    .eq("class_id", classId)
    .single();

  if (error || !data) return null;
  return data as unknown as CandidateRow;
}

// ==> GATE 6, DESIGN QUESTION A. "WHICH OF MY OWN CLASSES IS THIS ROW IN?"
//
//     The loaders above answer null or empty for a row in another class, and
//     every caller renders that as notFound(). That is right for a STRANGER and
//     wrong for the OWNER: an instructor who opens a bookmarked persona from
//     their own other section should be told where it is, not that it does not
//     exist.
//
//     THESE TWO CANNOT LEAK ANYTHING, AND THE REASON IS THE .in() CLAUSE RATHER
//     THAN CARE AT THE CALL SITE. They are handed the ids of the classes the
//     signed-in account OWNS (from listInstructorClasses, which filters by
//     classes.instructor_id), and they can only ever return one of those. A row
//     in a stranger's class matches nothing, they return null, and the caller
//     falls through to the SAME notFound() with the SAME wording as before this
//     piece.
//
//     They run ONLY on the miss path, so the normal case costs nothing. <==
export async function findCandidateOwnedClass(
  scenarioId: string,
  ownedClassIds: string[],
): Promise<string | null> {
  if (ownedClassIds.length === 0) return null;
  const admin = createAdminClient();

  const { data } = await admin
    .from("scenarios")
    .select("class_id")
    .eq("id", scenarioId)
    .in("class_id", ownedClassIds)
    .maybeSingle();

  return (data?.class_id as string | undefined) ?? null;
}

export async function findGenerationGroupOwnedClass(
  groupId: string,
  ownedClassIds: string[],
): Promise<string | null> {
  if (ownedClassIds.length === 0) return null;
  const admin = createAdminClient();

  const { data } = await admin
    .from("scenarios")
    .select("class_id")
    .eq("generation_group_id", groupId)
    .in("class_id", ownedClassIds)
    .limit(1)
    .maybeSingle();

  return (data?.class_id as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// The AI Persona Framework list: chosen personas, and undecided candidate pairs
// ---------------------------------------------------------------------------
//
// PHASE 3b SPLIT ONE LIST INTO TWO SECTIONS, and the reason is a bug rather
// than a layout preference. The old list showed the 8 most recent generations
// of every kind. A chosen persona older than that dropped off the page, and
// once the page is also where you switch a persona on and off, dropping off the
// page means it can never be switched on again.
//
//   CHOSEN PERSONAS: every one in the class, however old. Never capped.
//   UNDECIDED PAIRS: the 8 most recent, because these are test litter and old
//     ones are not worth scrolling past.
//
// The sections are NOT interleaved by date, deliberately. The cap sentence sits
// under the second heading, and a mixed list would put that sentence above
// entries it is not true of.
export const UNDECIDED_LIMIT = 8;

// Which half of a pair the OTHER persona is, for the pairing line.
export type PairedWith = {
  name: string;
  role: "gatekeeper" | "decision_maker";
};

// One persona as the list renders it.
//
// ==> EVERY DISPLAY VALUE HERE COMES FROM A REAL COLUMN, NEVER FROM THE
//     GENERATED JSON, AND THAT IS RULING 6 RATHER THAN TIDINESS. Tom may later
//     want Alex and Jordan copied into his class as a linked pair, and those
//     rows would carry generation_fields null. A list that read its names out
//     of the JSON would render blanks for them. persona_name and title are
//     columns on every scenario row that has ever existed, so they cannot be
//     missing. <==
export type PersonaListRow = {
  id: string;
  personaName: string;
  title: string;
  enabled: boolean;
  used: boolean;
  chainRole: string | null;
  // Null when this persona records no pair, which is every persona generated
  // before Phase 3b and any whose partner has since been discarded.
  pairedWith: PairedWith | null;
  // Assignment titles IN THIS CLASS that point at this persona, for the two
  // confirms. See loadAssignmentTitles below for why this one is class scoped
  // when countScenarioUsage is not.
  assignmentTitles: string[];
};

export type ChosenPersona = {
  groupId: string;
  createdAt: string;
  industry: string | null;
  // The chosen persona itself. THE TOGGLE ACTS ON THIS ROW, not on the group:
  // /disable already takes a scenario id, the new /enable takes one too, and a
  // group is not a thing that can be switched on.
  row: PersonaListRow;
  // A losing candidate that survived the pick because something was using it
  // (what the compare page calls a retained loser). It is never togglable. It
  // is carried so the entry does not pretend the group has one row when it has
  // two.
  retained: PersonaListRow[];
};

export type UndecidedPair = {
  groupId: string;
  createdAt: string;
  chainRole: string | null;
  industry: string | null;
  rows: PersonaListRow[];
};

export type PersonaList = {
  chosen: ChosenPersona[];
  undecided: UndecidedPair[];
  undecidedLimit: number;
};

// ---------------------------------------------------------------------------
// WHICH ROW OF A GENERATION IS THE CHOSEN ONE
// ---------------------------------------------------------------------------
//
// Three tests, in order, and a row that passes any of them is the winner.
//
//   1. IT IS SWITCHED ON. Only choosing a winner switches a generated row on,
//      and the enable route refuses to switch on a second row in a group, so at
//      most one row in a group is ever on.
//
//   2. IT CARRIES chosen_at. Written by the choose route from Phase 3b onwards.
//      This is the test that survives the persona being switched off, which is
//      exactly the state the other two struggle with.
//
//   3. IT IS THE ONLY ROW LEFT IN ITS GROUP. This is what a persona chosen
//      BEFORE Phase 3b and later switched off looks like, and it is sound by
//      construction rather than by guess:
//        generation writes TWO rows in one insert, so a pair is never half
//          written;
//        choosing a winner DELETES the losing row unless something is using it;
//        discarding is all or nothing for the whole group.
//      So a group can only come down to one row by having been decided. Proved
//      against the rows that exist: group cdf87d4f in the historical class is a
//      chosen persona, switched off, one row, and it is the only one of its
//      shape in the database.
//
// ==> WHAT IS DELIBERATELY NOT A TEST: THE TITLE. Choosing a winner renames it
//     from "Scaffold candidate 1 (gatekeeper): Riley, facilities director" to
//     "Discovery-Close: Riley (facilities director)", so the title does in fact
//     say whether a persona was chosen, and reading it would be the shortest
//     code in this file.
//
//     IT IS STILL WRONG, AND PROJECT_STATE SAYS WHY IN THE RUBRIC CASE:
//     DISPLAY NAMES ARE NOT LOAD BEARING. A title is text an instructor reads.
//     The moment the app decides behaviour by parsing one, renaming a persona
//     becomes a change of state, and the failure is silent: the persona quietly
//     stops being togglable and nothing errors. The stored marker and the row
//     count are structure, so they cannot be typed over. <==
//
// The one case none of the three decides: a group chosen before Phase 3b that
// kept a used loser AND has since been switched off. No such group exists (see
// the note above), and a group chosen from here on carries chosen_at, so one
// cannot be created either. If somehow one arose, it reads as undecided and
// falls back to exactly today's behaviour: the compare page decides it.
//
// The parameter is generic rather than CandidateRow so the enable route can
// call it on a cheap three-column read of the group instead of loading every
// persona's full text. The three fields below are all it actually looks at.
export type ChosenTestRow = {
  id: string;
  enabled: boolean;
  generation_fields: GenerationFields | null;
};

export function chosenRowOf<T extends ChosenTestRow>(group: T[]): T | null {
  const on = group.find((row) => row.enabled);
  if (on) return on;

  // Newest marker first. Two marked rows in one group means a retained loser
  // was later chosen in its own right, and the most recent decision is the one
  // that counts.
  const marked = group
    .filter((row) => typeof row.generation_fields?.chosen_at === "string")
    .sort((a, b) =>
      (b.generation_fields?.chosen_at ?? "").localeCompare(
        a.generation_fields?.chosen_at ?? "",
      ),
    );
  if (marked.length > 0) return marked[0];

  if (group.length === 1) return group[0];
  return null;
}

// Sorting by time without trusting the shape of the string. Postgres hands back
// "2026-09-03 23:36:15.667089+00" and a hand-written fixture is likelier to use
// "2026-09-03T23:36:15Z"; both have to sort the same way, and an unparseable
// value must not throw.
function instantValue(created: string): number {
  const parsed = Date.parse(created.replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Who is paired with whom, resolved BOTH WAYS from the one stored id.
//
// Only the decision maker records the link, because only the decision maker was
// generated from something. The gatekeeper's own line is worked out here by
// looking at who points at it, which costs nothing: the caller has already read
// every generated row in the class.
//
// A gatekeeper can have more than one decision maker generated from it. It
// names the FIRST one built from it, chosen by age so the line does not change
// from one reload to the next.
function resolvePairs(rows: CandidateRow[]): Map<string, PairedWith> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pairs = new Map<string, PairedWith>();

  const oldestFirst = [...rows].sort(
    (a, b) => instantValue(a.created_at) - instantValue(b.created_at),
  );

  for (const row of oldestFirst) {
    const gatekeeperId = row.generation_fields?.chain_from_scenario_id;
    if (!gatekeeperId) continue;

    // A DANGLING LINK IS NOT AN ERROR. The gatekeeper may have been discarded
    // since, and a discarded row is simply gone. The decision maker is shown
    // unpaired, which is the same thing every persona generated before Phase 3b
    // shows. A gatekeeper that is merely SWITCHED OFF is still a row, so it is
    // still found here and the pair is still shown.
    const gatekeeper = byId.get(gatekeeperId);
    if (!gatekeeper) continue;

    pairs.set(row.id, {
      name: gatekeeper.persona_name,
      role: "gatekeeper",
    });
    if (!pairs.has(gatekeeper.id)) {
      pairs.set(gatekeeper.id, {
        name: row.persona_name,
        role: "decision_maker",
      });
    }
  }

  return pairs;
}

// THE PURE HALF, kept separate from the database read on purpose: it is what
// the ruling 6 check calls with a fixture persona whose generation_fields are
// null, with no database anywhere near it.
export function buildPersonaList(
  rows: CandidateRow[],
  usage: Map<string, ScenarioUsage>,
  assignmentTitles: Map<string, string[]>,
  undecidedLimit: number = UNDECIDED_LIMIT,
): PersonaList {
  const pairs = resolvePairs(rows);

  const describe = (row: CandidateRow): PersonaListRow => ({
    id: row.id,
    personaName: row.persona_name,
    title: row.title,
    enabled: row.enabled,
    used: isUsed(usage.get(row.id)),
    chainRole: row.chain_role,
    pairedWith: pairs.get(row.id) ?? null,
    assignmentTitles: assignmentTitles.get(row.id) ?? [],
  });

  const groups = new Map<string, CandidateRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.generation_group_id);
    if (existing) existing.push(row);
    else groups.set(row.generation_group_id, [row]);
  }

  const chosen: ChosenPersona[] = [];
  const undecided: UndecidedPair[] = [];

  for (const [groupId, group] of groups) {
    // Ordering by the stored index rather than by date, for the reason
    // loadGenerationGroup gives: both rows of a pair share one created_at.
    const ordered = [...group].sort(
      (a, b) => candidateIndex(a) - candidateIndex(b),
    );
    const createdAt = ordered
      .map((row) => row.created_at)
      .reduce((oldest, value) =>
        instantValue(value) < instantValue(oldest) ? value : oldest,
      );
    const industry =
      ordered.find((row) => row.generation_fields?.inputs?.industry)
        ?.generation_fields?.inputs?.industry ?? null;

    const winner = chosenRowOf(ordered);
    if (winner) {
      chosen.push({
        groupId,
        createdAt,
        industry,
        row: describe(winner),
        retained: ordered
          .filter((row) => row.id !== winner.id)
          .map(describe),
      });
    } else {
      undecided.push({
        groupId,
        createdAt,
        chainRole: ordered[0].chain_role,
        industry,
        rows: ordered.map(describe),
      });
    }
  }

  const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) =>
    instantValue(b.createdAt) - instantValue(a.createdAt);
  chosen.sort(newestFirst);
  undecided.sort(newestFirst);

  // ==> THE CAP IS APPLIED HERE AND TO THE UNDECIDED LIST ONLY. The chosen list
  //     is returned whole, however long it is. <==
  return {
    chosen,
    undecided: undecided.slice(0, undecidedLimit),
    undecidedLimit,
  };
}

// Assignment titles for a set of personas, for the Turn off and Turn on
// confirms.
//
// ==> THIS ONE IS CLASS SCOPED AND countScenarioUsage IS NOT, AND THAT IS THE
//     RULE IN lib/class-scope.ts RATHER THAN AN INCONSISTENCY: THE LISTING IS
//     SCOPED, THE SAFETY CHECK IS NOT.
//
//     countScenarioUsage answers "will the database let this row be deleted",
//     and the constraints it reads are global, so it must count another class's
//     use of a scenario.
//
//     This answers "what shall I SHOW this instructor", and it puts assignment
//     TITLES on their screen. Unscoped, the Turn off confirm would print
//     another instructor's assignment title to somebody with no business
//     reading it. Do not merge the two. <==
export async function loadAssignmentTitles(
  scenarioIds: string[],
  classId: string,
): Promise<Map<string, string[]>> {
  const titles = new Map<string, string[]>();
  if (scenarioIds.length === 0) return titles;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("assignments")
    .select("scenario_id, title")
    .in("scenario_id", scenarioIds)
    .eq("class_id", classId)
    .order("title", { ascending: true });

  // A failed read leaves every list empty, so the confirm says "No assignment
  // uses it yet" rather than breaking the page. The confirm is information; the
  // refusals that actually protect a student are in the three start routes.
  if (error || !data) {
    console.error("Reading assignment titles for the persona list failed:", error);
    return titles;
  }

  for (const row of data) {
    const scenarioId = row.scenario_id as string;
    const list = titles.get(scenarioId);
    if (list) list.push(row.title as string);
    else titles.set(scenarioId, [row.title as string]);
  }

  return titles;
}

// The whole list for one class, read and assembled.
//
// ==> IT READS EVERY GENERATED ROW IN THE CLASS, WITH NO ROW LIMIT, AND THAT IS
//     THE FIX. The old version asked for "limit * 2 + 10" rows, which was fine
//     when the list was only ever a recent-activity list and is wrong now that
//     a chosen persona has to stay reachable however old it is. The cap that
//     remains is applied to UNDECIDED PAIRS after grouping, in the pure
//     function above.
//
//     The read is class scoped and a class holds a handful of scenarios: the
//     busiest class in the database today has seven. At the 270-user scale this
//     project is built for, a class is still one instructor's own generated
//     personas. <==
export async function loadPersonaList(
  classId: string,
  undecidedLimit: number = UNDECIDED_LIMIT,
): Promise<PersonaList> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scenarios")
    .select(CANDIDATE_COLUMNS)
    .not("generation_group_id", "is", null)
    // GATE 3b: this class's generated personas only.
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    if (error) console.error("Reading the persona list failed:", error);
    return { chosen: [], undecided: [], undecidedLimit };
  }

  const rows = data as unknown as CandidateRow[];

  // Whether each persona has been used, so the list offers the right control
  // and never offers a Discard the delete would refuse. A failed count is
  // treated as "used", which is the safe direction: it hides Discard rather
  // than offering one that would fail.
  let usage = new Map<string, ScenarioUsage>();
  try {
    usage = await countScenarioUsage(rows.map((row) => row.id));
  } catch (error) {
    console.error("Counting persona usage for the list failed:", error);
    for (const row of rows) {
      usage.set(row.id, { sessions: 1, assignments: 0 });
    }
  }

  const assignmentTitles = await loadAssignmentTitles(
    rows.map((row) => row.id),
    classId,
  );

  return buildPersonaList(rows, usage, assignmentTitles, undecidedLimit);
}

// ---------------------------------------------------------------------------
// Is a scaffold scenario USED? (the delete-if-unused rule)
// ---------------------------------------------------------------------------
//
// TWO things make a scenario undeletable, not one, and both are enforced by the
// database itself: sessions.scenario_id and assignments.scenario_id are BOTH
// declared "on delete restrict" (supabase/stage-2-data-model.sql). So Postgres
// refuses to delete a scenario that any student has run OR that any assignment
// points at.
//
// That makes this count the load-bearing part of every delete in chunk 2d, not
// a nicety: a delete statement covering several rows is all-or-nothing, so ONE
// blocked row would fail the whole statement and delete nothing. Every delete
// here counts first and then removes only the rows that came back clean.
export type ScenarioUsage = { sessions: number; assignments: number };

export function isUsed(usage: ScenarioUsage | undefined): boolean {
  if (!usage) return false;
  return usage.sessions > 0 || usage.assignments > 0;
}

// Count sessions and assignments for a set of scenario ids in two queries,
// whether that set is one candidate or every candidate in the database.
//
// ==> GATE 3b: THIS COUNT STAYS GLOBAL. DO NOT SCOPE IT TO A CLASS. It is the
//     one function in this file with no classId parameter, which looks like an
//     oversight next to the five loaders above and is not. <==
//
// THE LISTING IS SCOPED. THE SAFETY CHECK IS NOT. Every loader above answers
// "what may this instructor SEE", so it is class-scoped. This answers "will the
// database let this row be deleted", and the constraints it is checking are
// global: sessions.scenario_id and assignments.scenario_id are both declared
// "on delete restrict" (supabase/stage-2-data-model.sql) and neither knows
// anything about classes.
//
// WHAT SCOPING IT WOULD DO, precisely: a scenario used by ANOTHER class would
// count as zero, report as unused, and the page would offer a Discard. The
// delete would then fail at the database with a raw foreign-key error that the
// instructor cannot read, cannot act on, and cannot avoid. The count must tell
// the truth about the whole database or the delete-if-unused rule stops working.
//
// The same rule, and the four places in the app that follow it, are written out
// once in lib/class-scope.ts.
export async function countScenarioUsage(
  scenarioIds: string[],
): Promise<Map<string, ScenarioUsage>> {
  const usage = new Map<string, ScenarioUsage>();
  for (const id of scenarioIds) usage.set(id, { sessions: 0, assignments: 0 });
  if (scenarioIds.length === 0) return usage;

  const admin = createAdminClient();

  const [sessionsResult, assignmentsResult] = await Promise.all([
    admin.from("sessions").select("scenario_id").in("scenario_id", scenarioIds),
    admin
      .from("assignments")
      .select("scenario_id")
      .in("scenario_id", scenarioIds),
  ]);

  // A failed count must never be read as "nothing is using this". Throwing
  // means the caller refuses to delete rather than deleting something live.
  if (sessionsResult.error) {
    throw new Error(
      `Could not count sessions for these scenarios: ${sessionsResult.error.message}`,
    );
  }
  if (assignmentsResult.error) {
    throw new Error(
      `Could not count assignments for these scenarios: ${assignmentsResult.error.message}`,
    );
  }

  for (const row of sessionsResult.data ?? []) {
    const entry = usage.get(row.scenario_id as string);
    if (entry) entry.sessions += 1;
  }
  for (const row of assignmentsResult.data ?? []) {
    const entry = usage.get(row.scenario_id as string);
    if (entry) entry.assignments += 1;
  }

  return usage;
}

// Plain-English "why this one cannot be deleted", for the refusal messages.
export function usageReason(usage: ScenarioUsage): string {
  const parts: string[] = [];
  if (usage.sessions > 0) {
    parts.push(
      `${usage.sessions} role-play session${usage.sessions === 1 ? "" : "s"}`,
    );
  }
  if (usage.assignments > 0) {
    parts.push(
      `${usage.assignments} assignment${usage.assignments === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" and ");
}

// ---------------------------------------------------------------------------
// The title a candidate gets when it WINS and goes live
// ---------------------------------------------------------------------------
//
// While it is a candidate a row is titled "Scaffold candidate 1 (gatekeeper):
// Riley, facilities director", which is right for the compare view and wrong
// everywhere else: once a winner is switched on, that title is what an
// instructor picks from in the create-assignment list. So the pick renames it to
// the convention Alex and Jordan already use:
//
//   Discovery-Close: Alex (procurement director)
//   Presentation-Close: Jordan (plant manager)
export function liveScenarioTitle(
  personaName: string,
  role: string,
  meetingType: string,
): string {
  const meeting = meetingType === "discovery" ? "Discovery" : "Presentation";
  return `${meeting}-Close: ${personaName.trim()} (${role.trim().toLowerCase()})`;
}

// The title a row carries WHILE it is still a candidate, for example
// "Scaffold candidate 1 (gatekeeper): Riley, facilities director".
//
// It lives here rather than inline in the generate route because two places now
// write it: generation writes it once, and editing a candidate's name or role
// has to rewrite it so the recent-generations list does not keep showing the
// old name. Writing the same format out twice is the drift this project avoids
// everywhere else, so both callers use this one function.
export function candidateScenarioTitle(
  candidateIndex: number,
  chainRole: string | null,
  personaName: string,
  role: string,
): string {
  const position = chainRole === "gatekeeper" ? "gatekeeper" : "decision maker";
  return `Scaffold candidate ${candidateIndex} (${position}): ${personaName.trim()}, ${role.trim()}`;
}

// ---------------------------------------------------------------------------
// Which chain context a candidate must be REBUILT with
// ---------------------------------------------------------------------------
//
// Editing a candidate re-runs the fixed template (lib/persona-assembly.ts) over
// the edited fields. That template takes an OPTIONAL chain, and the chain is
// what writes the "you already had a discovery meeting with X, and you earned
// this meeting" narrative into a chained decision maker's briefing and system
// prompt. Rebuild without it and that narrative silently disappears.
//
// So the chain is never guessed. It is resolved from what the row itself
// carries, using facts that hold by construction in the generate route:
//
//   A chain is only ever built inside the "generate from a chosen gatekeeper"
//   branch, and that branch forces the new persona to be a decision maker.
//   Therefore a chain always implies a decision maker, and a GATEKEEPER NEVER
//   HAS ONE.
//
// That gives four cases, three answerable and one not:
//
//   gatekeeper, any version          -> no chain, by construction
//   decision maker, v2, chain stored -> that stored chain
//   decision maker, v2, no chain     -> no chain: v2 records provenance in
//                                       full, so absent means it never had one
//   decision maker, v1 or unstamped  -> UNKNOWN. Version 1 stored no chain
//                                       whether or not the persona had one, and
//                                       nothing on the row points back at its
//                                       gatekeeper, so it cannot be recovered.
//
// The last case refuses rather than guessing. Guessing "no chain" is the exact
// silent drift this function exists to prevent, and guessing "some chain" is
// not possible. The fix is to regenerate the case under the current code.
export type ChainResolution =
  | { ok: true; chain: ChainContext | undefined }
  | { ok: false; reason: string };

export function resolveChainForReassembly(
  chainRole: string | null,
  fields: GenerationFields,
): ChainResolution {
  if (chainRole === "gatekeeper") {
    return { ok: true, chain: undefined };
  }

  const version = fields.version ?? 1;
  if (version < GENERATION_FIELDS_VERSION) {
    return {
      ok: false,
      reason:
        "This candidate was generated before editing existed, so the app cannot tell whether its briefing refers to an earlier meeting with a gatekeeper. Editing it could quietly remove that reference. Generate this case again and edit the new candidates instead.",
    };
  }

  return { ok: true, chain: fields.chain };
}

// ---------------------------------------------------------------------------
// Planning a discard: deciding what may be deleted BEFORE anything is deleted
// ---------------------------------------------------------------------------
//
// A scaffold scenario may be deleted only if ALL FOUR of these are true:
//
//   1. It has a generation_group_id. Alex, Jordan, and every hand-written
//      scenario leave that column empty, so this single condition puts them
//      outside every query here by construction.
//   2. It is switched OFF. ON MEANS LIVE, and cleanup never touches a live
//      scenario. This covers the case that is easy to miss: a winner picked
//      minutes ago has no sessions and no assignment yet, so without this rule
//      a "discard all unused" would destroy the case the admin just chose.
//   3. It has no sessions. Anything a student has actually role-played is
//      kept, and can only be switched off.
//   4. No assignment points at it.
//
// Conditions 3 and 4 are correctness, not just caution. Both foreign keys are
// "on delete restrict", and one delete statement covering several rows is
// all-or-nothing, so a single blocked row would fail the whole statement and
// delete nothing. Planning first is what makes the delete work at all.
export type DiscardCandidate = {
  id: string;
  title: string;
  personaName: string;
  groupId: string;
};

export type BlockedCandidate = DiscardCandidate & { reason: string };

export type DiscardPlan = {
  // Safe to delete: off, unused, and generated.
  deletable: DiscardCandidate[];
  // Kept because a student has run it or an assignment points at it.
  used: BlockedCandidate[];
  // Kept because it is switched on, so it is a live case, not test litter.
  live: DiscardCandidate[];
};

type PlannableRow = {
  id: string;
  title: string;
  persona_name: string;
  enabled: boolean;
  generation_group_id: string;
};

// Sort a set of scaffold rows into the three buckets above.
async function planFor(rows: PlannableRow[]): Promise<DiscardPlan> {
  const plan: DiscardPlan = { deletable: [], used: [], live: [] };

  const describe = (row: PlannableRow): DiscardCandidate => ({
    id: row.id,
    title: row.title,
    personaName: row.persona_name,
    groupId: row.generation_group_id,
  });

  // A switched-on row is live and is never counted, so it is never even
  // usage-checked: it is out of scope whatever is pointing at it.
  const offRows = rows.filter((row) => !row.enabled);
  for (const row of rows.filter((row) => row.enabled)) {
    plan.live.push(describe(row));
  }

  const usage = await countScenarioUsage(offRows.map((row) => row.id));
  for (const row of offRows) {
    const rowUsage = usage.get(row.id);
    if (rowUsage && isUsed(rowUsage)) {
      plan.used.push({ ...describe(row), reason: usageReason(rowUsage) });
    } else {
      plan.deletable.push(describe(row));
    }
  }

  return plan;
}

const PLAN_COLUMNS = "id, title, persona_name, enabled, generation_group_id";

// Every generated candidate in the database, sorted into the three buckets.
// This is what the bulk "discard all unused" both previews and acts on, so the
// count the admin approves and the rows that are deleted come from one place.
export async function planBulkDiscard(classId: string): Promise<DiscardPlan> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scenarios")
    .select(PLAN_COLUMNS)
    // THE line that keeps Alex and Jordan out of this entirely.
    .not("generation_group_id", "is", null)
    // GATE 3b: "discard all unused test generations" now sweeps THIS class only.
    // It can never reach, count or delete another instructor's candidates. Note
    // that this scopes WHICH ROWS ARE CONSIDERED; whether each of them is safe to
    // delete is still decided by the global countScenarioUsage above.
    .eq("class_id", classId);

  if (error) {
    throw new Error(`Could not read the generated personas: ${error.message}`);
  }

  return planFor((data ?? []) as PlannableRow[]);
}

// The same sorting, for the rows of ONE generation group.
export async function planGroupDiscard(
  groupId: string,
  classId: string,
): Promise<DiscardPlan> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scenarios")
    .select(PLAN_COLUMNS)
    .eq("generation_group_id", groupId)
    .not("generation_group_id", "is", null)
    // GATE 3b: a group in another class plans as EMPTY, and the discard route
    // already turns an empty plan into "that generation was not found". So the
    // class check needs no extra branch in the route; it falls into the refusal
    // that was already there.
    .eq("class_id", classId);

  if (error) {
    throw new Error(`Could not read this generation: ${error.message}`);
  }

  return planFor((data ?? []) as PlannableRow[]);
}

// "gatekeeper" -> "Gatekeeper", "decision_maker" -> "Decision maker".
export function chainRoleLabel(role: string | null): string {
  if (role === "gatekeeper") return "Gatekeeper";
  if (role === "decision_maker") return "Decision maker";
  return "Not recorded";
}

export function meetingTypeLabel(meetingType: string): string {
  return meetingType === "discovery" ? "Discovery" : "Presentation";
}
