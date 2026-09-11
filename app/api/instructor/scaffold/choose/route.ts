// POST /api/instructor/scaffold/choose
// Body: { winnerId }
//
// The admin has compared a pair of generated candidates and picked one. This
// route does the two things that follow from that pick:
//
//   1. The WINNER is switched on (enabled = true) and renamed to the live title
//      convention Alex and Jordan use, so it is a normal, assignable,
//      conversation-only scenario from here on.
//   2. The LOSER is permanently deleted, but only if it is unused.
//
// SCOPING, and the one check the whole route hangs on: it refuses any scenario
// whose generation_group_id is empty. Alex, Jordan, and every hand-written
// scenario have that column empty by construction, so they cannot be reached
// through this route at all, whatever id is sent. Everything after that check is
// scoped to the ONE generation group the winner belongs to.
//
// DELETE-IF-UNUSED. A compared candidate is disabled and has never been run, so
// its loser should always be deletable. It is checked anyway: if a loser somehow
// has a session or an assignment pointing at it, the delete is refused, the row
// is KEPT, and the admin is told. Deleting a candidate needs no Storage step
// (unlike every other delete in this project) because a candidate has never been
// role-played and so has no recording to orphan.
//
// ORDER: the winner is switched on FIRST, then the loser is deleted. If the
// delete were to fail, the admin still has the working enabled winner they asked
// for, and a leftover disabled loser is harmless and clearable from the
// scaffolding page. The reverse order could destroy the loser and then fail to
// deliver the winner.
//
// Instructor-gated with the role read from the DATABASE (never the browser) and
// run with the service-role key, server-side only, like every other destructive
// route here.
import { NextResponse } from "next/server";
import { requireInstructorRequest, refuseOutsideClass } from "@/lib/class-scope";
import {
  countScenarioUsage,
  isUsed,
  usageReason,
  liveScenarioTitle,
} from "@/lib/scaffold-candidates";
import type { CandidateRow } from "@/lib/scaffold-candidates";

export async function POST(request: Request) {
  // 1 and 2, plus the caller's class, in one call. GATE 3b replaced the
  // signed-in check and the profiles role check that used to be written out
  // here, and identically in ten sibling routes, with the shared guard in
  // lib/class-scope.ts. It answers the same two questions and one new one:
  // WHICH CLASS may this caller act inside.
  //
  // It cannot be requireInstructor(): that calls redirect(), a page mechanism,
  // which throws here instead of returning a JSON error.
  const gate = await requireInstructorRequest("choose a persona");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId } = gate;

  // 3. Read the winner's id.
  let winnerId: string | undefined;
  try {
    const body = await request.json();
    winnerId = body?.winnerId;
  } catch {
    // fall through to the missing-id check
  }
  if (!winnerId || typeof winnerId !== "string") {
    return NextResponse.json({ error: "Missing winnerId." }, { status: 400 });
  }

  // 4. Load the chosen row.
  const { data: winner, error: winnerError } = await admin
    .from("scenarios")
    // GATE 3b: class_id joins this read for the ownership check below.
    .select(
      "id, title, persona_name, meeting_type, chain_role, enabled, generation_group_id, generation_fields, class_id",
    )
    .eq("id", winnerId)
    .single();
  if (winnerError || !winner) {
    return NextResponse.json(
      { error: "That candidate was not found. It may already be deleted." },
      { status: 404 },
    );
  }

  // 4a. GATE 3b. The candidate must be in the caller's own class. Choosing a
  //     winner switches it ON and DELETES the losing candidate, so this refusal
  //     sits above both effects.
  //
  //     The group read at step 5 needs no second class filter: it is derived from
  //     this row's own generation_group_id, and a generation group never spans
  //     two classes (both rows are written by one insert in the generate route,
  //     with one class id). GUARD THE ROW YOU WERE HANDED BY ID; a read derived
  //     from an already-checked row needs no filter of its own.
  const outside = refuseOutsideClass(winner.class_id, classId, "candidate");
  if (outside) {
    return NextResponse.json(
      { error: "That candidate was not found. It may already be deleted." },
      { status: outside.status },
    );
  }

  // 4b. THE GUARD THAT PROTECTS ALEX AND JORDAN. Only a generated candidate has
  //     a generation group id. Anything else is a hand-written scenario and is
  //     none of this route's business, so it is refused outright.
  const groupId = winner.generation_group_id as string | null;
  if (!groupId) {
    return NextResponse.json(
      {
        error:
          "That scenario was not created by the AI Persona Framework, so it cannot be chosen here.",
      },
      { status: 400 },
    );
  }

  // 5. Load the whole generation group. Everything below is scoped to this one
  //    group id, so no other generation can be affected.
  const { data: groupRows, error: groupError } = await admin
    .from("scenarios")
    .select("id, persona_name, enabled")
    .eq("generation_group_id", groupId);
  if (groupError || !groupRows) {
    return NextResponse.json(
      { error: "Could not read this generation. Nothing was changed." },
      { status: 500 },
    );
  }

  // 6. Switch the winner ON and give it its live title.
  //
  //    The role comes from the stored generation fields. If that JSON is somehow
  //    missing, the existing title is kept rather than inventing a broken one:
  //    a slightly ugly title is a much smaller problem than a failed pick.
  const fields = winner.generation_fields as CandidateRow["generation_fields"];
  const role = fields?.candidate?.role;
  const newTitle = role
    ? liveScenarioTitle(
        winner.persona_name as string,
        role,
        winner.meeting_type as string,
      )
    : (winner.title as string);

  // PHASE 3b. THE PICK IS NOW RECORDED IN THE ROW, not only implied by the
  // enabled flag it sets.
  //
  // Until now, "this persona was chosen" and "this persona is switched on" were
  // the same fact, so switching a chosen persona off erased the only evidence
  // that it had ever been chosen. The AI Persona Framework list then showed it
  // as an undecided candidate and offered to compare it with a candidate that
  // no longer exists. chosen_at survives being switched off, which is what lets
  // the list keep offering the On and Off toggle.
  //
  // It is written by SPREADING the stored fields, the same way the edit route
  // writes them, so version, candidate_index, candidate, inputs and above all
  // chain are carried through untouched. A row that somehow has no fields at
  // all gets an object with just this marker in it, which is harmless: the two
  // places that read this JSON (the edit route and the chain page) both check
  // for candidate and inputs and refuse without them, exactly as they do today.
  //
  // It is a MOMENT, not a date-only value, and nothing displays it, so the two
  // kinds of date in lib/app-time.ts do not come into it.
  const chosenFields = { ...(fields ?? {}), chosen_at: new Date().toISOString() };

  const { error: enableError } = await admin
    .from("scenarios")
    .update({ enabled: true, title: newTitle, generation_fields: chosenFields })
    .eq("id", winnerId)
    // Belt and braces: scoped to the group as well as the id.
    .eq("generation_group_id", groupId);
  if (enableError) {
    console.error("Enabling the chosen candidate failed:", winnerId, enableError);
    return NextResponse.json(
      { error: "Could not switch that candidate on. Nothing was changed." },
      { status: 500 },
    );
  }

  // 7. The other candidates in this group are the losers. Count what points at
  //    them BEFORE deleting anything: a used row must be kept, and a delete
  //    covering several rows fails entirely if even one of them is blocked.
  const losers = groupRows.filter((row) => row.id !== winnerId);
  if (losers.length === 0) {
    return NextResponse.json({ ok: true, title: newTitle, deleted: 0, kept: [] });
  }

  let usage;
  try {
    usage = await countScenarioUsage(losers.map((row) => row.id as string));
  } catch (error) {
    console.error("Counting candidate usage failed:", error);
    return NextResponse.json(
      {
        error:
          "The winner was switched on, but the other candidate could not be checked, so it was left in place. Try discarding it from the AI Persona Framework page.",
      },
      { status: 500 },
    );
  }

  const deletable: string[] = [];
  const kept: { personaName: string; reason: string }[] = [];
  for (const loser of losers) {
    const rowUsage = usage.get(loser.id as string);
    if (rowUsage && isUsed(rowUsage)) {
      kept.push({
        personaName: loser.persona_name as string,
        reason: usageReason(rowUsage),
      });
    } else {
      deletable.push(loser.id as string);
    }
  }

  // 8. Delete the unused losers, by explicit id. A candidate has no recording,
  //    so this really is just the row: there is no Storage file to remove first.
  if (deletable.length > 0) {
    const { error: deleteError } = await admin
      .from("scenarios")
      .delete()
      .in("id", deletable)
      // Two more locks on the same door: never a row outside this group, and
      // never a row without a generation group (Alex and Jordan).
      .eq("generation_group_id", groupId)
      .not("generation_group_id", "is", null);
    if (deleteError) {
      console.error("Deleting the losing candidate failed:", deletable, deleteError);
      return NextResponse.json(
        {
          error:
            "The winner was switched on, but the other candidate could not be deleted. You can discard it from the AI Persona Framework page.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    title: newTitle,
    deleted: deletable.length,
    kept,
  });
}
