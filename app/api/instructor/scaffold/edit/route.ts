// POST /api/instructor/scaffold/edit
// Body: { candidateId, edits: { the eight editable fields } }
//
// An instructor has customised a generated candidate persona before choosing a
// winner. This route saves the edited STRUCTURED FIELDS and then rebuilds that
// candidate's briefing and system prompt by RE-RUNNING THE EXISTING FIXED
// TEMPLATE over them.
//
// THERE IS NO AI CALL HERE, and deliberately no OpenAI import in this file. The
// whole point of the piece is that an edit is a deterministic re-composition:
// edited fields in, template-composed text out, nothing re-invented. That is
// what keeps the no-drift guarantee from Piece 2 true after an edit, so the
// fields the instructor compares on screen and the persona a student actually
// meets still come from one source.
//
// FOUR THINGS THIS ROUTE GUARDS, each explained where it happens below:
//   1. Only an instructor, with the role read from the database.
//   2. Only a GENERATED CANDIDATE, and only BEFORE a winner is chosen.
//   3. Only the eight editable fields. The three locked pairs are not read from
//      the browser at all, so they cannot be changed by any request.
//   4. The rebuild must be provably faithful before it is allowed to overwrite
//      anything (the chain resolution and the round-trip check).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCandidate } from "@/lib/persona-scaffold";
import type { PersonaCandidate, HiddenFact } from "@/lib/persona-scaffold";
import { assembleScenario } from "@/lib/persona-assembly";
import {
  candidateScenarioTitle,
  resolveChainForReassembly,
  GENERATION_FIELDS_VERSION,
} from "@/lib/scaffold-candidates";
import type { GenerationFields } from "@/lib/scaffold-candidates";

// ---------------------------------------------------------------------------
// Reading the submitted edits
// ---------------------------------------------------------------------------
//
// The five plain list fields arrive as ONE STRING each, straight from a textarea
// with one entry per line, and are split here on the server. The trimming and
// the dropping of blank lines happen here too, so a stray newline at the end of
// a textarea cannot fail validation with a confusing "contains an empty entry".

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readLines(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// Hidden facts are pairs, so they cannot be split by line breaks: they arrive as
// a list of objects from the form's paired inputs.
//
// A row where BOTH halves are blank is an empty row the instructor added and
// never filled in, so it is dropped silently. A row where only ONE half is
// filled is KEPT, so validation below can say what is missing rather than the
// instructor's half-typed fact vanishing without a word.
function readHiddenFacts(value: unknown): HiddenFact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      fact: readText((entry as HiddenFact | null)?.fact),
      detail: readText((entry as HiddenFact | null)?.detail),
    }))
    .filter((entry) => entry.fact.length > 0 || entry.detail.length > 0);
}

export async function POST(request: Request) {
  // 1. The caller must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2. The caller must be an instructor, verified on the server against the
  //    database and never trusted from the browser. The edit page checks this
  //    too, but a route is reachable on its own.
  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "instructor") {
    return NextResponse.json(
      { error: "Only instructors can edit a persona." },
      { status: 403 },
    );
  }

  // 3. Read the request.
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Missing the edited fields." }, { status: 400 });
  }

  const candidateId = readText(body.candidateId);
  if (!candidateId) {
    return NextResponse.json({ error: "Missing candidateId." }, { status: 400 });
  }
  const edits = (body.edits ?? {}) as Record<string, unknown>;

  // 4. Load the row being edited.
  const { data: row, error: rowError } = await admin
    .from("scenarios")
    .select(
      "id, title, persona_name, meeting_type, chain_role, enabled, generation_group_id, generation_fields, scenario_context, persona_system_prompt",
    )
    .eq("id", candidateId)
    .single();
  if (rowError || !row) {
    return NextResponse.json(
      { error: "That candidate was not found. It may already be deleted." },
      { status: 404 },
    );
  }

  // 4b. THE GUARD THAT PROTECTS ALEX AND JORDAN, the same single condition every
  //     other scaffold route hangs on. Only a generated candidate has a
  //     generation group id, so a hand-written scenario is refused outright
  //     whatever id is sent.
  const groupId = row.generation_group_id as string | null;
  if (!groupId) {
    return NextResponse.json(
      {
        error:
          "That scenario was not created by the AI Persona Framework, so it cannot be edited here.",
      },
      { status: 400 },
    );
  }

  const fields = (row.generation_fields ?? {}) as GenerationFields;
  const stored = fields.candidate;
  const inputs = fields.inputs;
  if (!stored || !inputs) {
    return NextResponse.json(
      {
        error:
          "This candidate has no saved fields to rebuild from, so it cannot be edited.",
      },
      { status: 400 },
    );
  }

  // 5. EDITING IS FOR CANDIDATES, BEFORE A WINNER IS CHOSEN.
  //
  //    The check is on the whole generation group, not just on this row, because
  //    that is the actual rule: once a winner has been picked and switched on,
  //    the case is settled and is not edited through this path. Checking only
  //    this row would leave a losing candidate that survived the pick (which
  //    happens when something is using it) still editable after the decision.
  const { data: groupRows, error: groupError } = await admin
    .from("scenarios")
    .select("id, enabled")
    .eq("generation_group_id", groupId);
  if (groupError || !groupRows) {
    return NextResponse.json(
      { error: "Could not read this generation. Nothing was changed." },
      { status: 500 },
    );
  }
  if (groupRows.some((candidate) => candidate.enabled)) {
    return NextResponse.json(
      {
        error:
          "A winner has already been chosen for this generation, so its candidates can no longer be edited.",
      },
      { status: 400 },
    );
  }

  // 6. MERGE, and this is where the three locked pairs are enforced.
  //
  //    The merge starts from the STORED candidate and overlays ONLY the eight
  //    editable fields. Meeting type and chain position, the win condition, and
  //    the company type and size are never read from the request at all, so they
  //    survive by construction. That is a stronger guarantee than a form that
  //    renders them read-only: a hand-built request that tries to change them
  //    changes nothing, because nothing here ever looks at those keys.
  const merged: PersonaCandidate = {
    ...stored,
    persona_name: readText(edits.persona_name),
    role: readText(edits.role),
    demeanor: readLines(edits.demeanor),
    decision_criteria: readLines(edits.decision_criteria),
    hidden_facts: readHiddenFacts(edits.hidden_facts),
    objections: readLines(edits.objections),
    earns_win: readLines(edits.earns_win),
    fails_win: readLines(edits.fails_win),
  };

  // 7. The edited candidate passes THE SAME validation a generated one does
  //    (lib/persona-scaffold.ts): every field filled, at least 3 hidden facts
  //    and 3 objections. Reusing it rather than writing a second set of rules is
  //    what stops an edit producing a candidate weaker than the generator is
  //    allowed to produce. The specific problems go back to the form, so
  //    trimming to two objections says exactly that.
  const validation = validateCandidate(merged);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Some fields still need attention before this can be saved.",
        problems: validation.problems,
      },
      { status: 400 },
    );
  }

  // 8. WHICH CHAIN THIS CANDIDATE MUST BE REBUILT WITH.
  //
  //    Resolved from the row, never guessed. For a chained decision maker the
  //    chain is what writes the "you already had a discovery meeting with X"
  //    narrative into both text fields, so rebuilding without it would quietly
  //    turn a second meeting back into a standalone one. A candidate generated
  //    before the chain was stored is refused rather than rebuilt on a guess.
  const resolution = resolveChainForReassembly(
    row.chain_role as string | null,
    fields,
  );
  if (!resolution.ok) {
    return NextResponse.json({ error: resolution.reason }, { status: 400 });
  }
  const chain = resolution.chain;

  // 9. THE ROUND-TRIP CHECK: prove the rebuild is faithful BEFORE overwriting.
  //
  //    The saved text was itself produced by this same template at generation
  //    time. So re-running the template over the UNEDITED stored fields, with
  //    the chain resolved above, must reproduce the saved text exactly. If it
  //    does not, something about the reconstruction is wrong (the wrong chain, a
  //    missing one, or a bug in how it is stored) and the safe move is to refuse
  //    rather than write text that silently differs from what was reviewed.
  //
  //    IT ASSUMES lib/persona-assembly.ts IS FROZEN. If that template is ever
  //    changed later, existing version 2 candidates will no longer reproduce
  //    their saved text and will need regenerating before they can be edited.
  //    That is the honest outcome: after a template change the old saved text
  //    really is not what the template produces now, so a rebuild really would
  //    drift.
  //
  //    Version 1 rows only reach this point as gatekeepers (the resolution above
  //    refuses version 1 decision makers), and a version 1 row predates chain
  //    storage, so a mismatch there is far more likely to mean the template was
  //    edited after that row was written than that anything is wrong now. Those
  //    warn rather than refuse.
  const roundTrip = assembleScenario(stored, inputs, chain);
  const faithful =
    roundTrip.scenario_context === row.scenario_context &&
    roundTrip.persona_system_prompt === row.persona_system_prompt;

  if (!faithful) {
    const version = fields.version ?? 1;
    if (version >= GENERATION_FIELDS_VERSION) {
      console.error(
        "Round-trip check failed for candidate",
        candidateId,
        "so the edit was refused and nothing was written.",
      );
      return NextResponse.json(
        {
          error:
            "This candidate's saved text does not match what its fields rebuild to, so editing it could change more than you asked. Nothing was saved. Generate this case again and edit the new candidates.",
        },
        { status: 409 },
      );
    }
    console.warn(
      "Round-trip check failed for older (version 1) candidate",
      candidateId,
      "which most likely means the assembly template changed after it was generated. Continuing.",
    );
  }

  // 10. Rebuild the two text fields from the EDITED fields, with the same pure
  //     function generation used. One template, one source, no second assembler.
  const assembled = assembleScenario(merged, inputs, chain);

  // 11. Save it all in one update.
  //
  //     generation_fields is written by SPREADING the stored object and
  //     replacing only the candidate, so version, candidate_index, inputs and
  //     above all chain are carried through untouched. Rebuilding that object
  //     from scratch here is how the chain would get dropped on the first edit,
  //     which is the very failure this piece exists to prevent.
  //
  //     The persona_name COLUMN is updated alongside the JSON, and that is
  //     correctness rather than tidiness. Two existing routes read the column
  //     while reading the rest from the JSON: choosing a winner builds its live
  //     title from the column, and generating a decision maker takes the
  //     gatekeeper's name from the column. A stale column would put the old name
  //     on the live scenario and into the next chained persona.
  const candidateIndex = fields.candidate_index ?? 1;
  const { error: updateError } = await admin
    .from("scenarios")
    .update({
      title: candidateScenarioTitle(
        candidateIndex,
        row.chain_role as string | null,
        merged.persona_name,
        merged.role,
      ),
      persona_name: merged.persona_name,
      scenario_context: assembled.scenario_context,
      persona_system_prompt: assembled.persona_system_prompt,
      generation_fields: { ...fields, candidate: merged },
    })
    .eq("id", candidateId)
    // Belt and braces, the same two locks the other scaffold routes use: never a
    // row outside this group, and never a row without a generation group.
    .eq("generation_group_id", groupId)
    .not("generation_group_id", "is", null);

  if (updateError) {
    console.error("Saving the edited candidate failed:", candidateId, updateError);
    return NextResponse.json(
      { error: "Could not save those edits. Nothing was changed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, groupId });
}
