// POST /api/instructor/scaffold/generate
// Body: the scaffolding form's inputs.
// Generates TWO candidate personas, saves both as DISABLED, conversation-only
// scenarios sharing one generation group id, and returns that group id so the
// browser can open the compare view for the pair.
//
// Nothing saved here is reachable by a student: the rows are turned off, and a
// disabled scenario is both hidden from the create-assignment picker and refused
// by the start routes. Picking a winner, enabling it, and deleting the loser is
// chunk 2d.
//
// It is guarded the same way the other instructor routes are: the caller must be
// an instructor, with the role read from the DATABASE and never trusted from the
// browser. The page that hosts the form redirects non-instructors, but a route
// is reachable on its own, so the route does its own check.
//
// The OpenAI call happens HERE, on the server, using the existing
// OPENAI_API_KEY. The key never reaches the browser, and there is no web search
// or any other external tool involved: model knowledge only.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateTwoCandidates,
  meetingTypeForChainPosition,
} from "@/lib/persona-scaffold";
import type { ScaffoldInputs, ChainContext } from "@/lib/persona-scaffold";
import { assembleScenario } from "@/lib/persona-assembly";
import {
  GENERATION_FIELDS_VERSION,
  candidateScenarioTitle,
} from "@/lib/scaffold-candidates";
import type { GenerationFields } from "@/lib/scaffold-candidates";

// Two model calls run at the same time and each one can be slow, so we ask for
// more than the platform default rather than guessing what that default is.
// Sixty seconds is allowed on either Vercel plan. If a real generation still
// runs out of time, that is the known escalation point to a background job
// (Piece 2 design decision 7), which belongs to chunk 2c.
export const maxDuration = 60;

// Read one required text field from the submitted form data.
function readText(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
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
  //    database. Any instructor may scaffold (design decision 6: no new role).
  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "instructor") {
    return NextResponse.json(
      { error: "Only instructors can generate personas." },
      { status: 403 },
    );
  }

  // 3. Read and check the form inputs.
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Missing form details." }, { status: 400 });
  }

  // THE CHAIN. If a gatekeeper winner's id is sent, this is the paired second
  // persona of an existing case rather than a fresh one. The shared case details
  // are then read from that winner's OWN ROW rather than taken from the browser,
  // so what carries over is what was actually generated and chosen.
  const chainFromScenarioId = readText(body, "chainFromScenarioId");
  let chain: ChainContext | undefined;
  let inputs: ScaffoldInputs;

  if (chainFromScenarioId) {
    const { data: gatekeeper, error: gatekeeperError } = await admin
      .from("scenarios")
      .select("id, persona_name, chain_role, enabled, generation_group_id, generation_fields")
      .eq("id", chainFromScenarioId)
      .single();
    if (gatekeeperError || !gatekeeper) {
      return NextResponse.json(
        { error: "That gatekeeper persona was not found." },
        { status: 404 },
      );
    }

    // It must be a CHOSEN, SWITCHED-ON, GENERATED GATEKEEPER. Each condition is
    // a real one: an ungenerated scenario has no fields to carry over (and this
    // is also the guard that keeps Alex and Jordan out), a decision maker gates
    // nobody so there is no second meeting to build, and an unchosen candidate
    // is not the case anyone settled on.
    const fields = gatekeeper.generation_fields as GenerationFields | null;
    if (!gatekeeper.generation_group_id || !fields?.candidate || !fields?.inputs) {
      return NextResponse.json(
        {
          error:
            "That scenario was not created by the AI Persona Framework, so there is nothing to carry over.",
        },
        { status: 400 },
      );
    }
    if (gatekeeper.chain_role !== "gatekeeper") {
      return NextResponse.json(
        { error: "Only a gatekeeper has a decision maker to generate." },
        { status: 400 },
      );
    }
    if (!gatekeeper.enabled) {
      return NextResponse.json(
        {
          error:
            "Choose and switch on the gatekeeper first, then generate its decision maker.",
        },
        { status: 400 },
      );
    }

    const source = fields.candidate;
    const sourceInputs = fields.inputs;

    // What carries over, and what the admin still decides. The shared case
    // details come from the winner; the new persona's role and win condition are
    // the two things that are genuinely about this second meeting.
    inputs = {
      industry: sourceInputs.industry,
      productOrService: sourceInputs.productOrService,
      sellerCompanyType: sourceInputs.sellerCompanyType,
      companySize: sourceInputs.companySize,
      personaRole: readText(body, "personaRole"),
      winCondition: readText(body, "winCondition"),
      // A decision maker gates nobody.
      chainPosition: "decision_maker",
      gatesAccessTo: "",
    };

    chain = {
      gatekeeperName: gatekeeper.persona_name as string,
      gatekeeperRole: source.role,
      // The company the model INVENTED for the gatekeeper, which is what makes
      // both personas work at one company rather than two similar ones.
      companyType: source.company.type,
      companySize: source.company.size,
      gatekeeperWinCondition: source.win_condition,
    };
  } else {
    const chainPosition = readText(body, "chainPosition");
    if (chainPosition !== "gatekeeper" && chainPosition !== "decision_maker") {
      return NextResponse.json(
        // PD-8g follow-up: names the control the instructor is looking at,
        // which the creation form now labels "Persona Role". Display string
        // only; the accepted VALUES are still gatekeeper / decision_maker and
        // the check above them is unchanged.
        { error: "Pick a Persona Role." },
        { status: 400 },
      );
    }

    inputs = {
      industry: readText(body, "industry"),
      personaRole: readText(body, "personaRole"),
      productOrService: readText(body, "productOrService"),
      companySize: readText(body, "companySize"),
      chainPosition,
      gatesAccessTo: readText(body, "gatesAccessTo"),
      winCondition: readText(body, "winCondition"),
      sellerCompanyType: readText(body, "sellerCompanyType"),
    };
  }

  // The meeting type is NOT asked for separately. It follows from the chain
  // position, so the two can never disagree.
  const meetingType = meetingTypeForChainPosition(inputs.chainPosition);

  // Every field except gatesAccessTo is required. gatesAccessTo is required
  // only for a gatekeeper, since a decision maker gates nobody.
  const missing: string[] = [];
  if (!inputs.industry) missing.push("industry");
  if (!inputs.personaRole) missing.push("persona role");
  if (!inputs.productOrService) missing.push("product or service");
  if (!inputs.companySize) missing.push("company size");
  if (!inputs.winCondition) missing.push("win condition");
  if (!inputs.sellerCompanyType) missing.push("seller company type");
  if (inputs.chainPosition === "gatekeeper" && !inputs.gatesAccessTo) {
    missing.push("who this persona gates access to");
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Please fill in: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  // 4. Generate the two candidates, then assemble each one's scenario text with
  //    the fixed template. If either candidate cannot be produced validly, the
  //    whole request fails rather than showing half a case.
  try {
    const [first, second] = await generateTwoCandidates(inputs, chain);

    // 5. Save both candidates as real scenario rows, TURNED OFF.
    //
    //    Everything about these rows is deliberately harmless:
    //      enabled = false   nobody can assign or start one (the create-
    //                        assignment picker lists enabled scenarios only, and
    //                        the start routes refuse a disabled scenario)
    //      rubric_id = null  conversation-only, so nothing is ever scored
    //
    //    The pair shares one generation_group_id, which is how the compare view
    //    finds them again after a reload.
    const groupId = crypto.randomUUID();

    const rows = [first, second].map((candidate, index) => ({
      // The candidate title format lives in one place, because editing a
      // candidate's name or role has to rewrite it with the same shape.
      title: candidateScenarioTitle(
        index + 1,
        inputs.chainPosition,
        candidate.persona_name,
        candidate.role,
      ),
      persona_name: candidate.persona_name,
      // The two text fields that actually drive the role-play, built from the
      // candidate's fields by the fixed template (lib/persona-assembly.ts). For
      // a chain generation the template also writes in the narrative reference
      // to the gatekeeper, the way Jordan's text names Alex. That reference is
      // baked in HERE and never looked up again, which is what keeps the two
      // scenarios independently assignable with no prerequisite between them.
      ...assembleScenario(candidate, inputs, chain),
      rubric_id: null,
      enabled: false,
      // Derived from the chain position, the same single source the prompt used.
      meeting_type: meetingType,
      generation_group_id: groupId,
      chain_role: inputs.chainPosition,
      // The structured fields the compare view renders, plus the admin's own
      // answers (chunk 2d generates the matching second persona from them) and
      // which of the pair this is, so the order on screen is always the same.
      //
      // THE CHAIN IS STORED TOO (version 2, added in PD-2). Editing a candidate
      // rebuilds its two text fields from this JSON by re-running the same fixed
      // template used just below, and for a chained decision maker the chain is
      // what puts the "you already had a discovery meeting with X" narrative in
      // that text. Storing it here is what makes the rebuild self-contained from
      // this one row: nothing has to look the gatekeeper up again, which keeps
      // the two scenarios independent exactly as they are today. It is absent on
      // a gatekeeper because a gatekeeper has no earlier meeting.
      generation_fields: {
        version: GENERATION_FIELDS_VERSION,
        candidate_index: index + 1,
        candidate,
        inputs,
        ...(chain ? { chain } : {}),
      },
      created_by: user.id,
    }));

    // ONE insert for both rows, so a pair can never be half-written.
    const { error: insertError } = await admin.from("scenarios").insert(rows);
    if (insertError) {
      console.error("Saving persona candidates failed:", insertError);
      return NextResponse.json(
        {
          error:
            "The personas were written but could not be saved. Please try again.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ groupId });
  } catch (error) {
    console.error("Persona generation failed:", error);
    return NextResponse.json(
      {
        error:
          "Generation did not finish. Please try again. If it keeps failing, the request may be running out of time.",
      },
      { status: 500 },
    );
  }
}
