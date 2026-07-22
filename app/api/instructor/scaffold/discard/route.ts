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
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planGroupDiscard } from "@/lib/scaffold-candidates";

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
      { error: "Only instructors can discard generated personas." },
      { status: 403 },
    );
  }

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
    plan = await planGroupDiscard(groupId);
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
