// POST /api/instructor/scaffold/disable
// Body: { scenarioId }
//
// Switches a chosen scaffold persona back OFF. It is the exact reverse of the
// enable half of the pick, and it is the only way to take a generated case out
// of service without deleting it.
//
// It exists because the delete rules point at it. A case that has been
// role-played can never be deleted, and a live case has to be turned off before
// it can be discarded, so both refusals tell the admin to switch it off. This is
// the control behind those sentences.
//
// Switching off is a SAFE, REVERSIBLE action, so it has a light confirmation
// rather than a heavy one. What it does: the scenario disappears from the
// create-assignment picker, and all three start routes refuse to begin a new
// session with it. Existing sessions and scores are untouched, and a
// conversation already in progress is deliberately left running.
//
// SCOPING: it refuses any scenario whose generation_group_id is empty, so Alex,
// Jordan, and every hand-written scenario cannot be switched off through here.
// That guard is what keeps this route to scaffolded cases only.
import { NextResponse } from "next/server";
import { requireInstructorRequest, refuseOutsideClass } from "@/lib/class-scope";

export async function POST(request: Request) {
  // 1 and 2, plus the caller's class, in one call. GATE 3b replaced the
  // signed-in check and the profiles role check that used to be written out
  // here, and identically in ten sibling routes, with the shared guard in
  // lib/class-scope.ts. It answers the same two questions and one new one:
  // WHICH CLASS may this caller act inside.
  //
  // It cannot be requireInstructor(): that calls redirect(), a page mechanism,
  // which throws here instead of returning a JSON error.
  const gate = await requireInstructorRequest("switch a persona off");
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

  // 4. Load it and confirm it is a generated candidate. This is the guard that
  //    puts Alex and Jordan out of reach.
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    // GATE 3b: class_id joins this read for the ownership check below.
    .select("id, title, generation_group_id, class_id")
    .eq("id", scenarioId)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json(
      { error: "That persona was not found." },
      { status: 404 },
    );
  }

  // 4b. GATE 3b. The persona must be in the caller's own class, so one
  //     instructor can never switch off a live case another instructor's students
  //     are being assigned.
  const outside = refuseOutsideClass(scenario.class_id, classId, "persona");
  if (outside) {
    return NextResponse.json(
      { error: "That persona was not found." },
      { status: outside.status },
    );
  }
  if (!scenario.generation_group_id) {
    return NextResponse.json(
      {
        error:
          "That scenario was not created by the AI Persona Framework, so it cannot be switched off here.",
      },
      { status: 400 },
    );
  }

  // 5. Switch it off, scoped to the one id.
  const { error: updateError } = await admin
    .from("scenarios")
    .update({ enabled: false })
    .eq("id", scenarioId)
    .not("generation_group_id", "is", null);
  if (updateError) {
    console.error("Switching the persona off failed:", scenarioId, updateError);
    return NextResponse.json(
      { error: "Could not switch that persona off. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, title: scenario.title });
}
