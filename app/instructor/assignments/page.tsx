// MANAGE ASSIGNMENTS: create an assignment, and edit or delete the assignments
// in the class you are working in.
//
// Everything here was moved from the old single instructor page unchanged: the
// create form, the assignment list with the edit form on each, the in-use
// counts, and the delete control. Creating, editing, and deleting all already
// existed; this page is where they now live.
//
// ==> GATE 6 CHANGED BOTH READS ON THIS PAGE, AND GATE 3b's NOTE THAT IT CHANGED
//     NOTHING HERE WAS RIGHT AT THE TIME AND IS NOW WRONG. That note said both
//     reads use the ordinary client, so Gate 3a's rules scope them. THAT HOLDS
//     FOR SECURITY AND BREAKS FOR CORRECTNESS THE MOMENT AN INSTRUCTOR OWNS TWO
//     CLASSES, because public.can_read_class() answers "any class you own", not
//     "the class you are working in". The reads are still safe and were no
//     longer right. See each one below. <==
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateAssignmentForm } from "@/components/create-assignment-form";
import { EditAssignmentForm } from "@/components/edit-assignment-form";
import { DeleteAssignmentButton } from "@/components/delete-assignment-button";
import { requireInstructor } from "@/lib/instructor-auth";
import { Card } from "@/components/ui/card";
import {
  tallySessions,
  plainDeleteApplies,
  EMPTY_TALLY,
  type SessionTally,
} from "@/lib/assignment-sessions";
import { ServerTimingReport } from "@/components/server-timing-report";

// One assignment as read for the management list (the working class's).
type AssignmentRow = {
  id: string;
  title: string;
  // company_name is the buyer's company for this assignment (PD-8g). Null means
  // none was named, which is what every pre-PD-8g assignment has.
  company_name: string | null;
  required_mode: string;
  due_at: string | null;
  // available_date is when the assignment unlocks for students (PD-3). Null
  // means available now, which is what every pre-PD-3 assignment has.
  available_date: string | null;
  // duration_minutes is how long the role-play meeting runs (PD-4). Null means
  // the standard 30 minutes, which is what every pre-PD-4 assignment has.
  duration_minutes: number | null;
  // voice is which of the two voices the persona speaks in (T1). Null means
  // cedar, which is what every pre-T1 assignment has.
  voice: string | null;
  instructions: string | null;
  // PHASE 3a: whether this assignment is graded. It is what makes a practice at
  // 'completed' mean a scoring failure rather than ordinary finished work, so
  // the delete control cannot be decided without it.
  rubric_id: string | null;
  scenarios: { title: string; persona_name: string } | null;
};

export default async function InstructorAssignments() {
  // The layout already gated this page; this confirms it again for the page
  // itself, and is how it gets the class the instructor is working in.
  //
  // PHASE 2a stopped destructuring `user` here. It existed only to hand
  // created_by to the create form, and the create route now takes the author
  // from the signed-in session instead, so the browser cannot claim to be
  // somebody else. The gate itself is unchanged and still runs.
  const { classId } = await requireInstructor();

  const supabase = await createClient();
  const admin = createAdminClient();

  // The scenarios this instructor can assign (the create-assignment dropdown).
  // Only ENABLED scenarios are offered. A disabled scenario is one that is not
  // ready to be used: chunk 2c writes AI-generated candidate personas turned off,
  // so half-finished drafts can never be assigned to a student by accident.
  //
  // ==> GATE 6 ADDED THE CLASS FILTER, AND WITHOUT IT THIS PAGE HAS A GUARANTEED,
  //     REPRODUCIBLE FAILURE. The security rules let this read return scenarios
  //     from EVERY class the instructor owns, while classId handed to
  //     CreateAssignmentForm below is the ONE class they are working in. Pick a
  //     scenario from the other class and the insert carries a class_id and a
  //     scenario_id that disagree, which
  //     assignments_scenario_same_class_fkey (Gate 4a) refuses at the database,
  //     and the form reports "Could not create the assignment. Please try
  //     again.", which says nothing. Gate 4a added that constraint precisely so
  //     this could not be a silent success; this filter is what stops it being a
  //     loud failure instead. <==
  //
  //     Fails closed: an instructor with no class is offered no scenarios rather
  //     than everybody's. The empty-class branch is written out rather than
  //     passed as an empty string, because class_id is a uuid and an empty
  //     string is not one, which would fail the read outright.
  const { data: scenarios } = classId
    ? await supabase
        .from("scenarios")
        .select("id, title, persona_name")
        .eq("enabled", true)
        .eq("class_id", classId)
        .order("created_at", { ascending: true })
    : { data: [] };

  // The assignments IN THE CLASS THIS INSTRUCTOR IS WORKING IN.
  //
  // ==> GATE 6 REPLACED .eq("created_by", user.id) HERE, AND THE REASON IS THAT
  //     IT WAS AN AUTHORSHIP FILTER STANDING IN FOR A CLASS FILTER. Under
  //     multi-class it showed an instructor every assignment they had ever
  //     created across ALL their classes regardless of the picker, which is the
  //     bug. But it was already the odd one out even with one class, because
  //     THIS PAGE'S OWN CONTROLS ARE CLASS-GATED, NOT AUTHOR-GATED: the delete
  //     route checks refuseOutsideClass(assignment.class_id, ...) and the edit
  //     form writes through the "instructors manage assignments" rule, which is
  //     public.instructs_class(class_id). So the listing was hiding rows the
  //     instructor is fully entitled to manage.
  //
  //     THAT FIXES A BLIND SPOT THAT EXISTS TODAY: after a class handover
  //     (Gate 4b's reassign), every assignment in the received class was created
  //     by the PREVIOUS owner, so the new owner saw none of them here while
  //     being perfectly able to edit and delete them. It also surfaces any row
  //     whose created_by is null, which nobody could reach before. <==
  //
  // Fails closed the same way: no class, no assignments.
  const { data: assignments } = classId
    ? await supabase
        .from("assignments")
        // The SHORT embed form is correct here, and it is safe for a reason
        // rather than by luck: there is exactly ONE foreign key between
        // assignments and scenarios, the composite
        // assignments_scenario_same_class_fkey, which carries the plain
        // reference AND the same-class rule. Gate 4a briefly had two keys
        // between these tables, which made this join ambiguous; Supabase
        // returned an error instead of rows, this line reads only `data`, and
        // the page rendered EMPTY with nothing on screen and nothing in the
        // logs.
        // ==> IF A SECOND FOREIGN KEY IS EVER ADDED BETWEEN THESE TWO TABLES,
        //     THIS LINE BREAKS EXACTLY THAT WAY AGAIN. See PROJECT_STATE Open
        //     Issues. <==
        .select("id, title, company_name, required_mode, due_at, available_date, duration_minutes, voice, instructions, rubric_id, scenarios ( title, persona_name )")
        .eq("class_id", classId)
        .order("created_at", { ascending: false })
        .returns<AssignmentRow[]>()
    : { data: [] as AssignmentRow[] };

  // How much student work sits under each of those assignments, split into
  // submissions vs practices. This drives the delete control: 0 sessions means a
  // clean delete (light confirm), 1+ means the strong type-DELETE confirm that
  // names the counts. Read with the admin client, because instructors cannot
  // read practice rows through ordinary browser rules. The delete route
  // re-counts server-side before acting, so these numbers are only for display.
  //
  // ==> THIS ADMIN READ IS UNCHANGED BY GATE 6, AND THAT IS DELIBERATE. It is
  //     the fourth of the four places where
  //     a class filter would be WRONG rather than merely redundant: it is
  //     derived from ownAssignmentIds, which came from an already-scoped list,
  //     and it is a FACT CHECK (will the delete succeed) rather than a listing.
  //     Both foreign keys behind it are "on delete restrict" and neither knows
  //     anything about classes, so an undercount here would offer a delete that
  //     then fails at the database. The rule is written out once in
  //     lib/class-scope.ts. <==
  // ==> PHASE 3a. THE COUNTS ARE NOW A TALLY, BECAUSE HOW MUCH WORK EXISTS IS NO
  //     LONGER THE QUESTION. The question is how much FINISHED work exists. An
  //     assignment carrying nothing but abandoned or failed-scoring practices
  //     shows the plain confirm, because a rubric can never be replaced on an
  //     existing assignment and one invisible session used to block the only
  //     repair path there is. status therefore joins the read below, and each
  //     assignment's own rubric_id decides what 'completed' means for its rows.
  //
  //     THIS PAGE DECIDES WHAT TO SHOW AND NOTHING ELSE. The delete route runs
  //     this same shared rule against its own read inside the request, and it is
  //     the one that decides what happens. If a student finishes a practice
  //     between this page rendering and the button being clicked, the route
  //     refuses with a 409 rather than acting on these now-stale numbers. <==
  const assignmentTallies = new Map<string, SessionTally>();
  const ownAssignments = assignments ?? [];
  const ownAssignmentIds = ownAssignments.map((a) => a.id);
  if (ownAssignmentIds.length > 0) {
    const { data: countRows } = await admin
      .from("sessions")
      .select("assignment_id, kind, status")
      .in("assignment_id", ownAssignmentIds);
    // Group the rows by assignment first, because the rule needs each
    // assignment's rubric alongside its own rows and cannot be applied row by
    // row across the whole class.
    const rowsByAssignment = new Map<string, { kind: string; status: string }[]>();
    for (const row of countRows ?? []) {
      if (!row.assignment_id) continue;
      const list = rowsByAssignment.get(row.assignment_id) ?? [];
      list.push({ kind: row.kind, status: row.status });
      rowsByAssignment.set(row.assignment_id, list);
    }
    for (const a of ownAssignments) {
      assignmentTallies.set(
        a.id,
        tallySessions(rowsByAssignment.get(a.id) ?? [], a.rubric_id !== null),
      );
    }
  }

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      <h2 className="mb-1 text-page-title font-medium text-content-primary">
        Manage Assignments
      </h2>
      <p className="mb-3 max-w-reading text-body text-content-secondary">
        Create an assignment for a scenario and pick the mode the graded
        submission must use. Each student can submit an assignment once. This
        page shows the selected class; switch class at the top of the page to
        see another one.
      </p>

      {/* PHASE 2a: createdBy is no longer passed. The create route takes the
          author from the signed-in session, so the browser cannot claim to be
          somebody else. */}
      <CreateAssignmentForm scenarios={scenarios ?? []} classId={classId} />

      {/* PD-8g: a header over the list below, so the created assignments read as
          their own section rather than as loose cards trailing the create form.
          It is a section heading, the same step the "Recent generations" and
          "Clean up" headings use on the persona page. */}
      <div className="mt-5">
        <h3 className="mb-2 text-card-title font-medium text-content-primary">
          Published Assignments
        </h3>
        {assignments && assignments.length > 0 ? (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const tally = assignmentTallies.get(a.id) ?? EMPTY_TALLY;
              const sessionsTotal = tally.submissions + tally.practices;
              // The same one rule the button and the route use: the plain
              // confirm applies when no FINISHED work exists.
              const plainDelete = plainDeleteApplies(tally);
              return (
                <Card key={a.id} as="li" padding="md">
                  <EditAssignmentForm
                    assignment={{
                      id: a.id,
                      title: a.title,
                      company_name: a.company_name,
                      instructions: a.instructions,
                      due_at: a.due_at,
                      available_date: a.available_date,
                      duration_minutes: a.duration_minutes,
                      voice: a.voice,
                      required_mode: a.required_mode,
                      scenarioTitle: a.scenarios?.title ?? null,
                      personaName: a.scenarios?.persona_name ?? null,
                    }}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-tertiary pt-2">
                    {/* PHASE 3a: three states rather than two, so the label
                        never calls an assignment "not in use" without saying
                        that something is nevertheless about to be removed. */}
                    <span className="text-meta text-content-tertiary">
                      {!plainDelete
                        ? `In use: ${tally.submissions} submission${tally.submissions === 1 ? "" : "s"}, ${tally.practices} practice${tally.practices === 1 ? "" : "s"}`
                        : sessionsTotal === 0
                          ? "Not in use (no student work)"
                          : `Not in use (${tally.unfinished} unfinished practice${tally.unfinished === 1 ? "" : "s"}, no finished student work)`}
                    </span>
                    <DeleteAssignmentButton
                      assignmentId={a.id}
                      title={a.title}
                      tally={tally}
                    />
                  </div>
                </Card>
              );
            })}
          </ul>
        ) : (
          <p className="text-body text-content-secondary">
            This class has no assignments yet.
          </p>
        )}
      </div>
      {/* PAGE PERFORMANCE INSTRUMENT: renders nothing unless RELII_SERVER_TIMING=1. */}
      <ServerTimingReport segment="page /instructor/assignments" />
    </main>
  );
}
