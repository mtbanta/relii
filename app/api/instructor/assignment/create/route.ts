// POST /api/instructor/assignment/create
// Body: multipart form data. The assignment's fields, plus an OPTIONAL "rubric"
// field holding an .xlsx file.
//
// PHASE 2a. Creates an assignment, and when a rubric is attached, creates that
// rubric in the same transaction.
//
// ==> WHY THIS ROUTE EXISTS AT ALL, AND THE ONE THING TO GET RIGHT IN IT.
//
//     BEFORE THIS, components/create-assignment-form.tsx INSERTED STRAIGHT FROM
//     THE BROWSER with the ordinary logged-in client. There was no server route
//     for assignment creation anywhere in the app. That worked because Row
//     Level Security was doing the authorisation: the "instructors manage
//     assignments" policy in supabase/gate-3a-policies.sql carries
//     `with check (public.instructs_class(class_id))`, and the database refused
//     anything else.
//
//     ==> A SERVER ROUTE USING THE SERVICE-ROLE KEY BYPASSES RLS COMPLETELY.
//         Moving the write here therefore DELETES that authorisation unless
//         this route re-implements it. Getting this wrong opens a Gate 3b
//         shaped hole in the one form that creates the object every student
//         touches.
//
//         This is Gate Finding 1 restated: the isolation lives in the
//         application layer or it does not exist. <==
//
//     SO, THE TWO THINGS THAT MAKE IT SAFE, BOTH BELOW:
//
//       1. class_id is NEVER read from the request. It comes from
//          requireInstructorRequest(), which resolves the caller's working
//          class against classes.instructor_id on THIS request. The browser
//          cannot name the class it writes into.
//       2. scenario_id IS read from the request, so the scenario it names is
//          loaded and checked against that same class before anything is
//          written. Gate 3b's rule: guard the row you were handed by id.
//
// ==> WHY THE FILE IS SENT AGAIN INSTEAD OF THE PREVIEW'S RESULT. The preview
//     route returned names only, and this route re-parses the upload from
//     scratch and stores what IT parsed. NOTHING THE BROWSER SENDS BETWEEN THE
//     TWO CALLS IS TRUSTED, so a crafted request cannot swap the point values
//     between the screen Tom approved and the row that gets stored. That is the
//     Phase 5 lesson about a checkbox the browser could bypass, applied to a
//     grade scale. <==
//
// ==> HOW THE CLASS CHECK MUST BE PROVED, WRITTEN HERE BECAUSE THIS IS WHERE
//     WHOEVER PROVES IT WILL BE READING.
//
//     A crafted request naming another instructor's scenario, refused, IS AN
//     ASSERTION ON ITS OWN. A 404 could come from anything on the path: a typo
//     in the id, an expired session, a route that is not deployed, a body the
//     server could not read. None of those would mean the class check works,
//     and all of them look identical from outside.
//
//     PAIR IT. The same request from the instructor who DOES own the target,
//     accepted, seconds apart, changing only WHO IS SIGNED IN. A refusal beside
//     a matching success is a measurement, because the only variable left is
//     the thing under test.
//
//     This is the Phase 5 crafted-signup design, and the same reason the Phase
//     2a permission probes carried a positive control. <==
import { NextResponse } from "next/server";
import { requireInstructorRequest, refuseOutsideClass } from "@/lib/class-scope";
import {
  hasRubricFile,
  parseRubricFromForm,
  refuseOversizedBody,
} from "@/lib/rubric-upload";
import {
  DEFAULT_MEETING_MINUTES,
  MAX_MEETING_MINUTES,
  MIN_MEETING_MINUTES,
} from "@/lib/meeting-length";

// A form field as a trimmed string, or "" when absent. FormData values are
// strings or Files; anything that is not a string is treated as missing.
function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  // 1. THE GUARD. Who is this, and which class may they write into?
  const gate = await requireInstructorRequest("create an assignment");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, userId, classId } = gate;

  // 2. Rule zero, before the body is read.
  const oversized = refuseOversizedBody(request);
  if (oversized) {
    return NextResponse.json({ error: oversized }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "That submission could not be read. Please try again." },
      { status: 400 },
    );
  }

  // 3. The plain fields.
  const title = field(form, "title");
  if (!title) {
    return NextResponse.json(
      { error: "Please give the assignment a title." },
      { status: 400 },
    );
  }

  const scenarioId = field(form, "scenario_id");
  if (!scenarioId) {
    return NextResponse.json(
      { error: "Please choose a scenario." },
      { status: 400 },
    );
  }

  const requiredMode = field(form, "required_mode");
  if (requiredMode !== "text" && requiredMode !== "voice_video") {
    return NextResponse.json(
      { error: "Choose a required mode of either text or voice and video." },
      { status: 400 },
    );
  }

  // The meeting length. Blank saves as null, which reads as the standard
  // meeting. The database carries the same range rule; this is the readable
  // message in between, matching what the browser form said before this route.
  const typedDuration = field(form, "duration_minutes");
  let durationMinutes: number | null = null;
  if (typedDuration) {
    const parsedDuration = Number(typedDuration);
    if (
      !Number.isInteger(parsedDuration) ||
      parsedDuration < MIN_MEETING_MINUTES ||
      parsedDuration > MAX_MEETING_MINUTES
    ) {
      return NextResponse.json(
        {
          error: `Meeting length must be a whole number of minutes from ${MIN_MEETING_MINUTES} to ${MAX_MEETING_MINUTES}, or left blank for ${DEFAULT_MEETING_MINUTES}.`,
        },
        { status: 400 },
      );
    }
    durationMinutes = parsedDuration;
  }

  const companyName = field(form, "company_name") || null;
  const instructions = field(form, "instructions") || null;
  const availableDate = field(form, "available_date") || null;
  const dueAt = field(form, "due_at") || null;

  // 4. ==> THE CLASS CHECK. The scenario id came from the browser, so the
  //        scenario is loaded and checked against the caller's working class
  //        before anything is written.
  //
  //        THE DATABASE WOULD ALSO CATCH THIS. assignments_scenario_same_class_fkey
  //        refuses an assignment whose scenario is in another class. That is the
  //        BACKSTOP and this is the enforcement, in that order, and both are
  //        wanted: without this check a crafted request gets a raw foreign-key
  //        error instead of a refusal, and, more importantly, the application
  //        would be relying on a constraint to do its authorisation. Gate 4a
  //        added that constraint to catch mistakes, not to be the access
  //        control.
  //
  //        refuseOutsideClass answers 404 rather than 403 on purpose: a 403
  //        would confirm that a scenario with this id exists in somebody else's
  //        class. <==
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    .select("id, class_id")
    .eq("id", scenarioId)
    .maybeSingle();

  if (scenarioError) {
    console.error("Reading the scenario failed:", scenarioId, scenarioError);
    return NextResponse.json(
      { error: "Could not create the assignment. Please try again." },
      { status: 500 },
    );
  }

  const outside = refuseOutsideClass(scenario?.class_id, classId, "scenario");
  if (outside) {
    return NextResponse.json(
      { error: outside.error },
      { status: outside.status },
    );
  }

  // 5. The rubric, if there is one. In Phase 2a the form's rubric field is
  //    DISABLED, so this branch is not reachable through the interface yet. It
  //    is built and guarded now so that 2b turns a field on rather than
  //    building a write path under time pressure.
  const attached = await hasRubricFile(form);
  if (attached) {
    const parsed = await parseRubricFromForm(form);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // ==> ONE CALL, BOTH ROWS. PostgREST cannot wrap two writes in a
    //     transaction, so a plain insert of the rubric followed by an insert of
    //     the assignment could leave a rubric attached to nothing. The database
    //     function writes both or neither.
    //
    //     THE FUNCTION IS DELIBERATELY DUMB: it validates nothing and decides
    //     nothing. Every check above this line is the authorisation, and the
    //     class it writes into is the one resolved in step 1, passed as an
    //     argument and used for BOTH rows so they cannot disagree. <==
    const { data: newId, error: rpcError } = await admin.rpc(
      "create_assignment_with_rubric",
      {
        p_class_id: classId,
        p_created_by: userId,
        p_rubric_name: parsed.rubric.name,
        p_rubric_items: parsed.rubric.criteria,
        p_rubric_max_total: parsed.rubric.maxTotal,
        p_title: title,
        p_scenario_id: scenarioId,
        p_required_mode: requiredMode,
        p_company_name: companyName,
        p_instructions: instructions,
        p_available_date: availableDate,
        p_due_at: dueAt,
        p_duration_minutes: durationMinutes,
      },
    );

    if (rpcError) {
      console.error("Creating the assignment with its rubric failed:", rpcError);
      return NextResponse.json(
        {
          error:
            "Could not create the assignment. Nothing was saved. Please try again.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, id: newId, rubricAttached: true });
  }

  // 6. No rubric. ONE ROW, so there is nothing to make atomic and no reason to
  //    reach for the function: a single statement is already all-or-nothing.
  //    This is the only path Phase 2a can actually reach through the interface.
  const { data, error } = await admin
    .from("assignments")
    .insert({
      title,
      scenario_id: scenarioId,
      required_mode: requiredMode,
      company_name: companyName,
      instructions,
      available_date: availableDate,
      due_at: dueAt,
      duration_minutes: durationMinutes,
      created_by: userId,
      // Never from the request. See the note at the top.
      class_id: classId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Creating the assignment failed:", error);
    return NextResponse.json(
      { error: "Could not create the assignment. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id, rubricAttached: false });
}
