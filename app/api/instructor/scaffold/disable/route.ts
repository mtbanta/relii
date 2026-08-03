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
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  // 1. The caller must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2. The caller must be an instructor, verified server-side.
  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "instructor") {
    return NextResponse.json(
      { error: "Only instructors can switch a persona off." },
      { status: 403 },
    );
  }

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
    .select("id, title, generation_group_id")
    .eq("id", scenarioId)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json(
      { error: "That persona was not found." },
      { status: 404 },
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
