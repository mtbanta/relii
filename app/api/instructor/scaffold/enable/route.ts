// POST /api/instructor/scaffold/enable
// Body: { scenarioId }
//
// Switches a CHOSEN scaffold persona back ON. It is the other half of
// /api/instructor/scaffold/disable, and the two together are the On and Off
// toggle on the AI Persona Framework list.
//
// ==> WHY THIS IS NOT THE CHOOSE ROUTE. Before Phase 3b, switching a persona
//     back on meant opening View Persona and pressing "Choose this one" again,
//     because a switched-off chosen persona looks undecided to that page. That
//     button does two things this one must never do: it RENAMES the persona to
//     the live title convention, and it DELETES every other row in the
//     generation. Pressing it on a persona that was already chosen is asking a
//     decision route to perform a state change, and the deletion is not
//     reversible. Turning something back on is a toggle, so it gets a toggle.
//     <==
//
// SCOPING, unchanged from the disable route it mirrors: it refuses any scenario
// whose generation_group_id is empty. Alex, Jordan, and every hand-written
// scenario have that column empty by construction, so they cannot be switched on
// through here whatever id is sent.
//
// ==> THE GUARD IS KEYED ON AN EMPTY generation_group_id AND NOT ON MISSING
//     generation_fields, DELIBERATELY. If Alex and Jordan are later copied into
//     an instructor's own class as a linked pair, those copies would carry a
//     generation group id but no generated details. Keying the refusal on the
//     details would lock that future import out of its own toggle for no
//     reason. Keying it on the group id refuses exactly the hand-written rows
//     it is meant to refuse. <==
//
// Instructor-gated with the role read from the DATABASE (never the browser) and
// run with the service-role key, server-side only, like every other scaffold
// route here.
import { NextResponse } from "next/server";
import { requireInstructorRequest, refuseOutsideClass } from "@/lib/class-scope";
import { chosenRowOf } from "@/lib/scaffold-candidates";
import type { GenerationFields } from "@/lib/scaffold-candidates";

type GroupRow = {
  id: string;
  enabled: boolean;
  persona_name: string;
  generation_fields: GenerationFields | null;
};

export async function POST(request: Request) {
  // 1 and 2, plus the caller's class, in one call, exactly as the ten sibling
  // routes do it. It cannot be requireInstructor(): that calls redirect(), a
  // page mechanism, which throws here instead of returning a JSON error.
  const gate = await requireInstructorRequest("switch a persona on");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId } = gate;

  // 3. Read the target id.
  let scenarioId: string | undefined;
  try {
    const body = await request.json();
    scenarioId = body?.scenarioId;
  } catch {
    // fall through to the missing-id check
  }
  if (!scenarioId || typeof scenarioId !== "string") {
    return NextResponse.json({ error: "Missing scenarioId." }, { status: 400 });
  }

  // 4. Load it.
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    // class_id joins this read for the ownership check below.
    .select("id, title, persona_name, generation_group_id, class_id")
    .eq("id", scenarioId)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json(
      { error: "That persona was not found." },
      { status: 404 },
    );
  }

  // 4a. GATE 3b. The persona must be in the caller's own class, so one
  //     instructor can never put another instructor's case back into service.
  //     Switching ON is the more consequential direction of the two: it makes a
  //     case startable by students again.
  //
  //     IT SITS ABOVE THE "not created by the framework" REFUSAL ON PURPOSE. A
  //     caller must not be able to learn anything about a row in a class that is
  //     not theirs, including whether it was AI generated, so the class refusal
  //     has to come first.
  const outside = refuseOutsideClass(scenario.class_id, classId, "persona");
  if (outside) {
    return NextResponse.json(
      { error: "That persona was not found." },
      { status: outside.status },
    );
  }

  // 4b. THE GUARD THAT PROTECTS ALEX, JORDAN AND EVERY HAND-WRITTEN SCENARIO.
  const groupId = scenario.generation_group_id as string | null;
  if (!groupId) {
    return NextResponse.json(
      {
        error:
          "That scenario was not created by the AI Persona Framework, so it cannot be switched on here.",
      },
      { status: 400 },
    );
  }

  // 5. Read the whole generation group.
  //
  //    No second class filter is needed: this is derived from the row's own
  //    generation_group_id, the row has already been checked, and a generation
  //    group never spans two classes (both rows are written by one insert in the
  //    generate route, with one class id). GUARD THE ROW YOU WERE HANDED BY ID.
  const { data: groupData, error: groupError } = await admin
    .from("scenarios")
    .select("id, enabled, persona_name, generation_fields")
    .eq("generation_group_id", groupId);
  if (groupError || !groupData) {
    return NextResponse.json(
      { error: "Could not read this generation. Nothing was changed." },
      { status: 500 },
    );
  }
  const groupRows = groupData as unknown as GroupRow[];

  // 6. NEVER TWO ROWS ON IN ONE GROUP.
  //
  //    The case this exists for is the one the compare page calls a retained
  //    loser: choosing a winner deletes the other candidate UNLESS something is
  //    using it, so a decided group can genuinely still hold two rows. If the
  //    losing row could also be switched on, one generation would be offering
  //    students two different personas that were never compared against each
  //    other, and the list would have two entries claiming to be the chosen one.
  const alreadyOn = groupRows.find((row) => row.enabled && row.id !== scenarioId);
  if (alreadyOn) {
    return NextResponse.json(
      {
        error: `Another persona from this generation (${alreadyOn.persona_name}) is already switched on. Turn that one off first.`,
      },
      { status: 409 },
    );
  }

  // 7. ONLY A CHOSEN PERSONA. An undecided candidate is not switched on here;
  //    it is chosen on the compare page, which is where the two are read side by
  //    side and where the losing row is cleared up. This route only ever puts
  //    back a decision that was already made.
  //
  //    The three ways a row counts as chosen, and why the title is not one of
  //    them, are written out at chosenRowOf() in lib/scaffold-candidates.ts.
  const winner = chosenRowOf(groupRows);
  if (!winner || winner.id !== scenarioId) {
    return NextResponse.json(
      {
        error:
          "That persona has not been chosen yet, so it cannot be switched on here. Open Compare and choose between the candidates first.",
      },
      { status: 400 },
    );
  }

  // 8. Switch it on, scoped to the one id, with the same belt-and-braces lock
  //    the sibling routes use: never a row without a generation group.
  //
  //    THE TITLE IS NOT TOUCHED. Choosing a winner is what names a persona, and
  //    it already did. Rewriting the title here would rename a live case every
  //    time it was toggled, and an instructor who had renamed it would lose that.
  const { error: updateError } = await admin
    .from("scenarios")
    .update({ enabled: true })
    .eq("id", scenarioId)
    .not("generation_group_id", "is", null);
  if (updateError) {
    console.error("Switching the persona on failed:", scenarioId, updateError);
    return NextResponse.json(
      { error: "Could not switch that persona on. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, title: scenario.title });
}
