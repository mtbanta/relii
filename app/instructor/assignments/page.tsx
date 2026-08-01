// MANAGE ASSIGNMENTS: create an assignment, and edit or delete the ones this
// instructor created.
//
// Everything here was moved from the old single instructor page unchanged: the
// create form, the list of this instructor's assignments with the edit form on
// each, the in-use counts, and the delete control. Creating, editing, and
// deleting all already existed; this page is where they now live.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateAssignmentForm } from "@/components/create-assignment-form";
import { EditAssignmentForm } from "@/components/edit-assignment-form";
import { DeleteAssignmentButton } from "@/components/delete-assignment-button";
import { requireInstructor } from "@/lib/instructor-auth";
import { Card } from "@/components/ui/card";

// One assignment as read for the management list (this instructor's own).
type AssignmentRow = {
  id: string;
  title: string;
  required_mode: string;
  due_at: string | null;
  // available_date is when the assignment unlocks for students (PD-3). Null
  // means available now, which is what every pre-PD-3 assignment has.
  available_date: string | null;
  // duration_minutes is how long the role-play meeting runs (PD-4). Null means
  // the standard 30 minutes, which is what every pre-PD-4 assignment has.
  duration_minutes: number | null;
  instructions: string | null;
  scenarios: { title: string; persona_name: string } | null;
};

export default async function InstructorAssignments() {
  // The layout already gated this page; this confirms it again for the page
  // itself, and is also how it gets the signed-in instructor's id.
  const { user } = await requireInstructor();

  const supabase = await createClient();
  const admin = createAdminClient();

  // The scenarios this instructor can assign (the create-assignment dropdown).
  // Only ENABLED scenarios are offered. A disabled scenario is one that is not
  // ready to be used: chunk 2c writes AI-generated candidate personas turned off,
  // so half-finished drafts can never be assigned to a student by accident.
  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("id, title, persona_name")
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  // The assignments THIS instructor created.
  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, required_mode, due_at, available_date, duration_minutes, instructions, scenarios ( title, persona_name )")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .returns<AssignmentRow[]>();

  // How much student work sits under each of those assignments, split into
  // submissions vs practices. This drives the delete control: 0 sessions means a
  // clean delete (light confirm), 1+ means the strong type-DELETE confirm that
  // names the counts. Read with the admin client, because instructors cannot
  // read practice rows through ordinary browser rules. The delete route
  // re-counts server-side before acting, so these numbers are only for display.
  const assignmentCounts = new Map<
    string,
    { submissions: number; practices: number }
  >();
  const ownAssignmentIds = (assignments ?? []).map((a) => a.id);
  if (ownAssignmentIds.length > 0) {
    const { data: countRows } = await admin
      .from("sessions")
      .select("assignment_id, kind")
      .in("assignment_id", ownAssignmentIds);
    for (const row of countRows ?? []) {
      if (!row.assignment_id) continue;
      const current = assignmentCounts.get(row.assignment_id) ?? {
        submissions: 0,
        practices: 0,
      };
      if (row.kind === "submission") current.submissions += 1;
      else if (row.kind === "practice") current.practices += 1;
      assignmentCounts.set(row.assignment_id, current);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-8 pb-12 pt-6">
      <h2 className="mb-1 text-section font-semibold text-content-primary">
        Manage Assignments
      </h2>
      <p className="mb-3 text-sm text-content-secondary">
        Create an assignment for a scenario and pick the mode the graded
        submission must use. Each student can submit an assignment once.
      </p>

      <CreateAssignmentForm scenarios={scenarios ?? []} createdBy={user.id} />

      <div className="mt-4">
        {assignments && assignments.length > 0 ? (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const counts = assignmentCounts.get(a.id) ?? {
                submissions: 0,
                practices: 0,
              };
              const inUse = counts.submissions + counts.practices > 0;
              return (
                <Card key={a.id} as="li" padding="md">
                  <EditAssignmentForm
                    assignment={{
                      id: a.id,
                      title: a.title,
                      instructions: a.instructions,
                      due_at: a.due_at,
                      available_date: a.available_date,
                      duration_minutes: a.duration_minutes,
                      required_mode: a.required_mode,
                      scenarioTitle: a.scenarios?.title ?? null,
                      personaName: a.scenarios?.persona_name ?? null,
                    }}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-tertiary pt-2">
                    <span className="text-xs text-content-tertiary">
                      {inUse
                        ? `In use: ${counts.submissions} submission${counts.submissions === 1 ? "" : "s"}, ${counts.practices} practice${counts.practices === 1 ? "" : "s"}`
                        : "Not in use (no student work)"}
                    </span>
                    <DeleteAssignmentButton
                      assignmentId={a.id}
                      title={a.title}
                      submissionsCount={counts.submissions}
                      practicesCount={counts.practices}
                    />
                  </div>
                </Card>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-content-secondary">
            You have not created any assignments yet.
          </p>
        )}
      </div>
    </main>
  );
}
