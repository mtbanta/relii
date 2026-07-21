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
import { createAdminClient } from "@/lib/supabase/admin";
import type { PersonaCandidate, ScaffoldInputs } from "@/lib/persona-scaffold";

// What we stored in the generation_fields JSON column. Every part is optional
// here on purpose: this is data read back out of a JSON column, so the code
// that renders it should cope with a row that is somehow incomplete rather than
// crash the page.
export type GenerationFields = {
  version?: number;
  candidate_index?: number;
  candidate?: PersonaCandidate;
  inputs?: ScaffoldInputs;
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
): Promise<CandidateRow[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scenarios")
    .select(CANDIDATE_COLUMNS)
    .eq("generation_group_id", groupId);

  // An unknown or malformed group id (someone editing the web address) comes
  // back as an error or as nothing. Either way the page shows "not found"
  // rather than breaking.
  if (error || !data) return [];

  const rows = data as unknown as CandidateRow[];
  return [...rows].sort((a, b) => candidateIndex(a) - candidateIndex(b));
}

export type GenerationSummary = {
  groupId: string;
  createdAt: string;
  chainRole: string | null;
  industry: string | null;
  personaNames: string[];
};

// The most recent generations, newest first, for the list on the scaffold page.
//
// It reads recent candidate rows and groups them in code rather than asking the
// database for distinct groups, because two rows per generation means a handful
// of rows covers plenty of generations and the grouping is trivial here.
export async function loadRecentGenerations(
  limit = 8,
): Promise<GenerationSummary[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("scenarios")
    .select(CANDIDATE_COLUMNS)
    .not("generation_group_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit * 2 + 10);

  if (error || !data) return [];

  const rows = data as unknown as (CandidateRow & {
    generation_group_id: string;
  })[];

  const groups = new Map<string, GenerationSummary>();
  for (const row of rows) {
    const existing = groups.get(row.generation_group_id);
    if (existing) {
      existing.personaNames.push(row.persona_name);
      continue;
    }
    if (groups.size >= limit) continue;
    groups.set(row.generation_group_id, {
      groupId: row.generation_group_id,
      createdAt: row.created_at,
      chainRole: row.chain_role,
      industry: row.generation_fields?.inputs?.industry ?? null,
      personaNames: [row.persona_name],
    });
  }

  return [...groups.values()];
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
