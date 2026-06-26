// The student home page. Shows the student's assignments (the graded path) and
// the practice scenarios (free practice). It confirms the visitor is a logged-in
// student; otherwise it redirects.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { PracticeButton } from "@/components/practice-button";
import { StartAssignmentButton } from "@/components/start-assignment-button";
import type { SessionScore } from "@/lib/types";

// Friendly label for a stored mode value.
function modeLabel(mode: string): string {
  return mode === "voice_video" ? "voice + video" : "text";
}

// Show a stored timestamp as a plain date (read in UTC so a date picked as
// "Aug 14" always shows as "Aug 14").
function formatDueDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type AssignmentRow = {
  id: string;
  title: string;
  required_mode: string;
  due_at: string | null;
  instructions: string | null;
  scenarios: { title: string; persona_name: string } | null;
};

type SubmissionRow = {
  id: string;
  assignment_id: string;
  status: string;
  score_total: number | null;
  score: SessionScore | null;
};

export default async function StudentHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Instructors who land here get sent to their own page.
  if (profile?.role !== "student") {
    redirect("/instructor");
  }

  // The assignments this student can do, with each one's scenario embedded.
  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, required_mode, due_at, instructions, scenarios ( title, persona_name )")
    .order("created_at", { ascending: false })
    .returns<AssignmentRow[]>();

  // This student's submissions, so we can show each assignment's state. RLS lets
  // a student read only their own sessions.
  const { data: submissions } = await supabase
    .from("sessions")
    .select("id, assignment_id, status, score_total, score")
    .eq("student_id", user.id)
    .eq("kind", "submission")
    .returns<SubmissionRow[]>();

  const submissionByAssignment = new Map<string, SubmissionRow>();
  for (const s of submissions ?? []) {
    if (s.assignment_id) submissionByAssignment.set(s.assignment_id, s);
  }

  // The role-play cases this student can practice freely.
  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("id, title, persona_name, scenario_context")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Student home</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <h2 className="mb-3 text-lg font-medium">Your assignments</h2>

      {!assignments || assignments.length === 0 ? (
        <p className="mb-8 text-gray-600">
          You have no assignments yet. They will appear here once your instructor
          creates one.
        </p>
      ) : (
        <ul className="mb-8 space-y-4">
          {assignments.map((a) => {
            const due = formatDueDate(a.due_at);
            const submission = submissionByAssignment.get(a.id);
            const submitted =
              submission?.status === "scored" ||
              submission?.status === "completed";
            const interrupted = submission?.status === "in_progress";

            return (
              <li key={a.id} className="rounded-lg border border-gray-200 p-5">
                <h3 className="font-semibold">{a.title}</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  {a.scenarios?.title ?? "Scenario"}
                  {a.scenarios?.persona_name
                    ? ` (with ${a.scenarios.persona_name})`
                    : ""}{" "}
                  &middot; {modeLabel(a.required_mode)} required
                  {due ? ` · due ${due}` : ""}
                </p>
                {a.instructions && (
                  <p className="mt-3 text-sm leading-relaxed text-gray-700">
                    {a.instructions}
                  </p>
                )}

                <div className="mt-4">
                  {submitted ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-green-700">
                        Submitted
                        {submission?.score_total != null &&
                        submission.score?.max_total != null
                          ? ` · ${submission.score_total} / ${submission.score.max_total}`
                          : ""}
                      </span>
                      <Link
                        href={`/student/session/${submission!.id}/results`}
                        className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        View result
                      </Link>
                    </div>
                  ) : interrupted ? (
                    <p className="text-sm text-amber-800">
                      Your submission was interrupted. A graded submission is a
                      one-time attempt and cannot be resumed. Please contact your
                      instructor to have it reset.
                    </p>
                  ) : (
                    <>
                      <StartAssignmentButton assignmentId={a.id} />
                      <p className="mt-2 text-xs text-gray-400">
                        One official attempt, done in one sitting. You cannot
                        resume it if you leave.
                      </p>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mb-3 text-lg font-medium">Practice scenarios</h2>

      {!scenarios || scenarios.length === 0 ? (
        <p className="text-gray-600">
          No scenarios yet. They will appear here once your instructor adds one.
        </p>
      ) : (
        <ul className="space-y-4">
          {scenarios.map((scenario) => (
            <li
              key={scenario.id}
              className="rounded-lg border border-gray-200 p-5"
            >
              <h3 className="font-semibold">{scenario.title}</h3>
              <p className="mt-0.5 text-sm text-gray-500">
                You will speak with {scenario.persona_name}.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                {scenario.scenario_context}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <PracticeButton scenarioId={scenario.id} mode="voice" />
                <PracticeButton scenarioId={scenario.id} mode="text" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
