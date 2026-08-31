// POST /api/instructor/scaffold/discard
// Body: { groupId }
//
// Discards ONE generation: the pair of candidate personas produced by a single
// run of the scaffolding form. This is the tidy-up for a generation that was
// never used, which is most of them: a case is generated, read, and turned out
// not to be worth keeping.
//
// It is ALL OR NOTHING for the group, because that is the only version of this
// that is simple to explain and simple to predict. The route refuses to delete
// anything at all if any candidate in the group is:
//
//   SWITCHED ON, meaning it is a live case, not test litter. To delete a chosen
//     winner, turn it off first and then discard it. That two-step is
//     deliberate: it takes an explicit decision to make a live case deletable.
//
//   USED, meaning a student has role-played it or an assignment points at it.
//     A used case can never be deleted here; it can only be switched off.
//
// Alex, Jordan, and every hand-written scenario are outside this route entirely:
// each query is filtered on generation_group_id, which only generated candidates
// have. A candidate has no recording, so there is no Storage step and nothing to
// orphan (unlike deleting an assignment or a student).
//
// Instructor-gated with the role read from the database, service-role key,
// server-side only.
import { NextResponse } from "next/server";
import { requireInstructorRequest } from "@/lib/class-scope";
import { planGroupDiscard } from "@/lib/scaffold-candidates";

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

  // 3. Read the group id.
  let groupId: string | undefined;
  try {
    const body = await request.json();
    groupId = body?.groupId;
  } catch {
    // fall through to the missing-id check
  }
  if (!groupId || typeof groupId !== "string") {
    return NextResponse.json({ error: "Missing groupId." }, { status: 400 });
  }

  // 4. Work out what may be deleted BEFORE deleting anything.
  let plan;
  try {
    // GATE 3b: scoped to the caller's class. A generation belonging to another
    //          instructor plans as EMPTY and falls into the "was not found"
    //          refusal below, which is the same answer an id that does not exist
    //          gets. No extra branch is needed here.
    plan = await planGroupDiscard(groupId, classId);
  } catch (error) {
    console.error("Planning the group discard failed:", groupId, error);
    return NextResponse.json(
      { error: "Could not check this generation. Nothing was deleted." },
      { status: 500 },
    );
  }

  const total = plan.deletable.length + plan.used.length + plan.live.length;
  if (total === 0) {
    return NextResponse.json(
      { error: "That generation was not found. It may already be discarded." },
      { status: 404 },
    );
  }

  // 5. Refuse the whole group if any candidate is live or used.
  if (plan.live.length > 0) {
    return NextResponse.json(
      {
        error: `This generation has a chosen persona that is switched on (${plan.live
          .map((row) => row.personaName)
          .join(", ")}). Turn it off first if you really want to delete it.`,
      },
      { status: 409 },
    );
  }
  if (plan.used.length > 0) {
    return NextResponse.json(
      {
        error: `This generation has been role-played (${plan.used
          .map((row) => `${row.personaName}: ${row.reason}`)
          .join("; ")}), so it cannot be deleted. It can only be switched off.`,
      },
      { status: 409 },
    );
  }

  // 6. Delete the group's rows, by explicit id, with the group filter still
  //    applied. Nothing outside the planned list can be reached.
  const ids = plan.deletable.map((row) => row.id);
  const { error: deleteError } = await admin
    .from("scenarios")
    .delete()
    .in("id", ids)
    .eq("generation_group_id", groupId)
    .not("generation_group_id", "is", null);
  if (deleteError) {
    console.error("Discarding the generation failed:", groupId, deleteError);
    return NextResponse.json(
      { error: "Could not discard this generation. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, deleted: ids.length });
}
