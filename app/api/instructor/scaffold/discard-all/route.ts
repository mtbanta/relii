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
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planBulkDiscard } from "@/lib/scaffold-candidates";

// The word the admin has to type. Deliberately not "DELETE", so muscle memory
// from the assignment-delete confirmation cannot carry someone through this one.
const CONFIRM_WORD = "DISCARD";

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
    plan = await planBulkDiscard();
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
