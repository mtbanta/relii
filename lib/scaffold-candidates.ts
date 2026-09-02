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

export type GenerationRowSummary = {
  id: string;
  personaName: string;
  title: string;
  enabled: boolean;
  used: boolean;
};

export type GenerationSummary = {
  groupId: string;
  createdAt: string;
  chainRole: string | null;
  industry: string | null;
  personaNames: string[];
  // Each candidate's state, which is what decides the controls the list offers:
  // a live (switched-on) generation gets Turn off, an untouched one gets
  // Discard, and one that has been role-played gets neither.
  rows: GenerationRowSummary[];
};

// The most recent generations, newest first, for the list on the scaffold page.
//
// It reads recent candidate rows and groups them in code rather than asking the
// database for distinct groups, because two rows per generation means a handful
// of rows covers plenty of generations and the grouping is trivial here.
export async function loadRecentGenerations(
  classId: string,
  limit = 8,
): Promise<GenerationSummary[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scenarios")
    .select(CANDIDATE_COLUMNS)
    .not("generation_group_id", "is", null)
    // GATE 3b: the Recent generations list shows this class's generations only.
    // Invisible with one instructor and one class, real with two.
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(limit * 2 + 10);

  if (error || !data) return [];

  const rows = data as unknown as (CandidateRow & {
    generation_group_id: string;
  })[];

  const groups = new Map<string, GenerationSummary>();
  const listed: (CandidateRow & { generation_group_id: string })[] = [];
  for (const row of rows) {
    const existing = groups.get(row.generation_group_id);
    if (existing) {
      existing.personaNames.push(row.persona_name);
      listed.push(row);
      continue;
    }
    if (groups.size >= limit) continue;
    groups.set(row.generation_group_id, {
      groupId: row.generation_group_id,
      createdAt: row.created_at,
      chainRole: row.chain_role,
      industry: row.generation_fields?.inputs?.industry ?? null,
      personaNames: [row.persona_name],
      rows: [],
    });
    listed.push(row);
  }

  // Whether each listed candidate has been used, so the list can offer the right
  // control (and never offer Discard on something the delete would refuse).
  // A failed count is treated as "used", which is the safe direction: it hides
  // the Discard button rather than offering one that would fail.
  let usage = new Map<string, ScenarioUsage>();
  try {
    usage = await countScenarioUsage(listed.map((row) => row.id));
  } catch (error) {
    console.error("Counting candidate usage for the list failed:", error);
    for (const row of listed) {
      usage.set(row.id, { sessions: 1, assignments: 0 });
    }
  }

  for (const row of listed) {
    groups.get(row.generation_group_id)?.rows.push({
      id: row.id,
      personaName: row.persona_name,
      title: row.title,
      enabled: row.enabled,
      used: isUsed(usage.get(row.id)),
    });
  }

  return [...groups.values()];
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
