// POST /api/instructor/scaffold/discard-all
// Body: { preview: true }        -> count only, deletes nothing
//       { confirm: "DISCARD" }   -> actually delete
//
// The bulk tidy-up: delete EVERY unused generated candidate in the database in
// one go. This is what clears the pile of throwaway pairs that testing leaves
// behind. It is the most destructive control in the scaffolding admin, so it is
// scoped tightly and confirmed strongly.
//
// WHAT IT CAN DELETE. Exactly the rows that satisfy all four conditions in
// planBulkDiscard: generated (so never Alex or Jordan), switched OFF, no
// sessions, and no assignment pointing at it. Everything else is counted and
// reported, never touched:
//
//   - Alex, Jordan, and every hand-written scenario are excluded by the query
//     itself, which reads only rows that have a generation_group_id.
//   - A switched-ON winner is excluded because on means live. This is the case
//     that is easy to get wrong: a winner chosen minutes ago has no sessions and
//     no assignment yet, so a naive "unused" rule would delete it.
//   - Anything role-played or assigned is excluded, and can only be switched off.
//
// THE PREVIEW AND THE DELETE RUN THE SAME COUNTING CODE (planBulkDiscard), so
// the number the admin approves is produced by the same function that decides
// what to delete, and is counted fresh at the moment the panel is opened rather
// than whenever the page happened to load.
//
// Instructor-gated with the role read from the database, service-role key,
// server-side only. Candidates have no recordings, so there is no Storage step.
import { NextResponse } from "next/server";
import { requireInstructorRequest } from "@/lib/class-scope";
import { planBulkDiscard } from "@/lib/scaffold-candidates";

// The word the admin has to type. Deliberately not "DELETE", so muscle memory
// from the assignment-delete confirmation cannot carry someone through this one.
const CONFIRM_WORD = "DISCARD";

export async function POST(request: Request) {
  // 1 and 2, plus the caller's class, in one call. GATE 3b replaced the
  // signed-in check and the profiles role check that used to be written out
  // here, and identically in ten sibling routes, with the shared guard in
  // lib/class-scope.ts. It answers the same two questions and one new one:
  // WHICH CLASS may this caller act inside.
  //
  // It cannot be requireInstructor(): that calls redirect(), a page mechanism,
  // which throws here instead of returning a JSON error.
  const gate = await requireInstructorRequest("discard generated personas");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId } = gate;

  // 3. Read the mode.
  let preview = false;
  let confirm = "";
  try {
    const body = await request.json();
    preview = body?.preview === true;
    confirm = typeof body?.confirm === "string" ? body.confirm : "";
  } catch {
    // No body: treated as neither a preview nor a confirmed delete, which the
    // check below refuses.
  }

  // 4. Count what qualifies. This is the whole decision, and it happens before
  //    any delete in every case.
  let plan;
  try {
    // GATE 3b: the sweep now covers THIS CLASS ONLY. It can never count or
    //          delete another instructor's candidates, and the preview the
    //          instructor confirms is the same scoped list the delete acts on.
    //          Whether each of those rows is safe to delete is still decided by
    //          the GLOBAL countScenarioUsage inside the plan; see the rule in
    //          lib/class-scope.ts.
    plan = await planBulkDiscard(classId);
  } catch (error) {
    console.error("Planning the bulk discard failed:", error);
    return NextResponse.json(
      { error: "Could not check the generated personas. Nothing was deleted." },
      { status: 500 },
    );
  }

  const summary = {
    deletable: plan.deletable.length,
    live: plan.live.length,
    used: plan.used.length,
    // Named so the confirmation can say exactly what is about to go.
    names: plan.deletable.map((row) => row.personaName),
    liveNames: plan.live.map((row) => row.personaName),
    usedNames: plan.used.map((row) => row.personaName),
  };

  // 5. Preview: report and stop.
  if (preview) {
    return NextResponse.json({ ok: true, preview: true, ...summary });
  }

  // 6. The real thing needs the typed word.
  if (confirm !== CONFIRM_WORD) {
    return NextResponse.json(
      { error: `Type ${CONFIRM_WORD} to confirm this deletion.` },
      { status: 400 },
    );
  }

  if (plan.deletable.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, ...summary });
  }

  // 7. Delete by EXPLICIT ID LIST, never by a "everything generated" sweep, so
  //    the delete can only reach rows this route counted and cleared one by one.
  //    The generation-group filter stays on as a second lock.
  //
  //    GATE 3b: `ids` COMES FROM THE SCOPED PLAN ABOVE, which is the only thing
  //    keeping this bulk delete inside one class. There is no .eq("class_id")
  //    on the statement itself, and there does not need to be, because a row can
  //    only reach `ids` by having come back from planBulkDiscard(classId). That
  //    is the "derived from an already-verified read" rule from lib/class-scope.ts.
  //    ==> IF planBulkDiscard IS EVER CHANGED TO RETURN ROWS FROM MORE THAN ONE
  //        CLASS, THIS DELETE WIDENS WITH IT AND NOTHING HERE WOULD SAY SO. <==
  const ids = plan.deletable.map((row) => row.id);
  const { error: deleteError } = await admin
    .from("scenarios")
    .delete()
    .in("id", ids)
    .not("generation_group_id", "is", null);
  if (deleteError) {
    console.error("The bulk discard failed:", deleteError);
    return NextResponse.json(
      { error: "Could not discard the generated personas. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, deleted: ids.length, ...summary });
}
