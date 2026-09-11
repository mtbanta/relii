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
import { requireInstructorRequest, refuseOutsideClass } from "@/lib/class-scope";
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
  // 1 and 2, plus the caller's class, in one call. GATE 3b replaced the
  // signed-in check and the profiles role check that used to be written out
  // here, and identically in ten sibling routes, with the shared guard in
  // lib/class-scope.ts. It answers the same two questions and one new one:
  // WHICH CLASS may this caller act inside.
  //
  // It cannot be requireInstructor(): that calls redirect(), a page mechanism,
  // which throws here instead of returning a JSON error.
  const gate = await requireInstructorRequest("generate personas");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId, userId } = gate;


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
      // GATE 3b: class_id joins this read for the ownership check below.
      .select(
        "id, persona_name, chain_role, enabled, generation_group_id, generation_fields, class_id",
      )
      .eq("id", chainFromScenarioId)
      .single();
    if (gatekeeperError || !gatekeeper) {
      return NextResponse.json(
        { error: "That gatekeeper persona was not found." },
        { status: 404 },
      );
    }

    // GATE 3b. The gatekeeper being chained FROM must be in the caller's own
    // class. This is a READ hole rather than a write one, and it is the subtle
    // one in this route: the chain copies the gatekeeper's stored case details
    // into the new persona's text, so without this check an instructor could
    // extract another class's generated case by chaining from its id.
    const outside = refuseOutsideClass(gatekeeper.class_id, classId, "persona");
    if (outside) {
      return NextResponse.json(
        { error: "That gatekeeper persona was not found." },
        { status: outside.status },
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
    //      rubric_id = null  this scenario names no rubric of its own
    //
    //    ==> PHASE 2b-1 CHANGED WHAT THAT SECOND LINE MEANS, AND THE OLD COMMENT
    //        HERE ("conversation-only, so nothing is ever scored") IS NOW WRONG.
    //        Grading reads assignments.rubric_id, not scenarios.rubric_id, so a
    //        GENERATED PERSONA CAN BE GRADED once an instructor attaches a rubric
    //        to the assignment built on it. That is a feature, not a regression:
    //        it is what unblocks the one Gate 4b export check and the one Gate 5
    //        item that could not run, both of which needed a graded submission in
    //        a generated-persona class.
    //
    //        THE BEHAVIOUR HERE IS UNCHANGED ON PURPOSE. Writing null is still
    //        right: these rows are candidates nobody has chosen yet, and the
    //        scenario is no longer where a grade comes from. Only the comment
    //        was wrong. <==
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
      //
      // PHASE 3b ADDS chain_from_scenario_id, AND ITS PLACE IN THIS OBJECT IS
      // THE WHOLE POINT. It is a SIBLING of chain, never a member of it.
      // assembleScenario() just above is handed the candidate, the inputs and
      // `chain`, and nothing else, so a key sitting beside chain is invisible to
      // the frozen template and cannot move one byte of the assembled text. The
      // edit route proves that for itself on every edit: it rebuilds the saved
      // text from these same stored fields and refuses if the rebuild differs.
      //
      // THE VERSION IS NOT BUMPED. Version 2 means "an absent chain on a
      // decision maker proves it never had one", which is the reading
      // resolveChainForReassembly depends on. A new sibling key does not touch
      // that reading, and bumping would refuse to edit every existing version 2
      // candidate for no reason.
      //
      // NEW GENERATIONS ONLY. Decision makers that already exist stay unpaired:
      // nothing backfills this and nothing matches on names.
      generation_fields: {
        version: GENERATION_FIELDS_VERSION,
        candidate_index: index + 1,
        candidate,
        inputs,
        ...(chain ? { chain } : {}),
        ...(chainFromScenarioId
          ? { chain_from_scenario_id: chainFromScenarioId }
          : {}),
      },
      created_by: userId,
      // GATE 3a, write path 4 of 9. Both rows of the pair get the same class.
      class_id: classId,
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
