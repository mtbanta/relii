// The student home page. Shows the student's assignments. Each assignment is the
// graded path (Start assignment) AND the place to practice it: practice is always
// practice FOR an assignment. It confirms the visitor is a logged-in student;
// otherwise it redirects.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { PracticeButton } from "@/components/practice-button";
import { StartAssignmentButton } from "@/components/start-assignment-button";
import { DeletePracticeButton } from "@/components/delete-practice-button";
import { KEPT_PRACTICES } from "@/lib/practice";
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

// Short month + day for a practice's date (e.g. "Jun 9").
function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
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
  // rubric_id is null for a conversation-only case: nothing to grade, so the
  // assignment is practice-only.
  scenarios: {
    title: string;
    persona_name: string;
    rubric_id: string | null;
  } | null;
};

type SubmissionRow = {
  id: string;
  assignment_id: string;
  status: string;
  score_total: number | null;
  score: SessionScore | null;
};

type PracticeRow = {
  id: string;
  assignment_id: string;
  mode: string;
  status: string;
  score_total: number | null;
  score: SessionScore | null;
  created_at: string;
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
    .select("id, title, required_mode, due_at, instructions, scenarios ( title, persona_name, rubric_id )")
    .order("created_at", { ascending: false })
    .returns<AssignmentRow[]>();

  // Which of those assignments are conversation-only (their scenario has no
  // rubric, so there is nothing to grade). Used twice below: to decide what a
  // "finished" practice looks like, and to hide the graded controls.
  const conversationOnlyAssignments = new Set(
    (assignments ?? [])
      .filter((a) => a.scenarios != null && a.scenarios.rubric_id === null)
      .map((a) => a.id),
  );

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

  // This student's kept practices: the FINISHED ones, newest first. We group them
  // per assignment for the "Saved practices: X of 3" list. Legacy practice rows
  // with no assignment link are ignored (they never appear here).
  //
  // "Finished" depends on the assignment. A graded case's practice is finished
  // when it has been SCORED. A conversation-only case is never scored, so its
  // practice is finished when the conversation is over ('completed'). We fetch
  // both statuses and then keep only the right one per assignment, which matters:
  // a graded practice sitting at 'completed' is one whose SCORING FAILED, and it
  // must stay out of this list exactly as it does today.
  const { data: practices } = await supabase
    .from("sessions")
    .select("id, assignment_id, mode, status, score_total, score, created_at")
    .eq("student_id", user.id)
    .eq("kind", "practice")
    .in("status", ["scored", "completed"])
    .not("assignment_id", "is", null)
    .order("created_at", { ascending: false })
    .returns<PracticeRow[]>();

  const practicesByAssignment = new Map<string, PracticeRow[]>();
  for (const p of practices ?? []) {
    if (!p.assignment_id) continue;
    const finishedStatus = conversationOnlyAssignments.has(p.assignment_id)
      ? "completed"
      : "scored";
    if (p.status !== finishedStatus) continue;
    const list = practicesByAssignment.get(p.assignment_id) ?? [];
    list.push(p);
    practicesByAssignment.set(p.assignment_id, list);
  }

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
        <p className="text-gray-600">
          You have no assignments yet. They will appear here once your instructor
          creates one.
        </p>
      ) : (
        <ul className="space-y-4">
          {assignments.map((a) => {
            const due = formatDueDate(a.due_at);
            const submission = submissionByAssignment.get(a.id);
            const submitted =
              submission?.status === "scored" ||
              submission?.status === "completed";
            const interrupted = submission?.status === "in_progress";
            const kept = practicesByAssignment.get(a.id) ?? [];
            const practiceOnly = conversationOnlyAssignments.has(a.id);

            return (
              <li key={a.id} className="rounded-lg border border-gray-200 p-5">
                <h3 className="font-semibold">{a.title}</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  {a.scenarios?.title ?? "Scenario"}
                  {a.scenarios?.persona_name
                    ? ` (with ${a.scenarios.persona_name})`
                    : ""}{" "}
                  &middot;{" "}
                  {practiceOnly
                    ? "practice only, not graded"
                    : `${modeLabel(a.required_mode)} required`}
                  {due ? ` · due ${due}` : ""}
                </p>
                {a.instructions && (
                  <p className="mt-3 text-sm leading-relaxed text-gray-700">
                    {a.instructions}
                  </p>
                )}

                {/* The official, one-shot graded submission. A conversation-only
                    case has no rubric, so there is nothing to grade and no
                    graded path at all: it is practice only. */}
                <div className="mt-4">
                  {practiceOnly ? (
                    <p className="text-sm text-gray-600">
                      This one is for conversation practice only. There is
                      nothing to submit and no score.
                    </p>
                  ) : submitted ? (
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

                {/* Practice this assignment (unlimited; only before submitting).
                    The student picks the mode each time. */}
                {!submitted && (
                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <p className="text-sm font-medium">Practice this assignment</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Practice as many times as you like. We keep your last{" "}
                      {KEPT_PRACTICES}.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <PracticeButton assignmentId={a.id} mode="text" />
                      <PracticeButton assignmentId={a.id} mode="voice" />
                    </div>
                  </div>
                )}

                {/* Saved practices: the kept, reviewable ones. */}
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <p className="text-sm text-gray-600">
                    Saved practices: {kept.length} of {KEPT_PRACTICES}
                  </p>
                  {kept.length > 0 && (
                    <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
                      {kept.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                        >
                          <span className="text-gray-700">
                            {modeLabel(p.mode)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatShortDate(p.created_at)}
                          </span>
                          <span className="tabular-nums text-gray-600">
                            {practiceOnly
                              ? "no score"
                              : p.score_total != null &&
                                  p.score?.max_total != null
                                ? `${p.score_total} / ${p.score.max_total}`
                                : "—"}
                          </span>
                          <span className="ml-auto flex items-center gap-3">
                            <Link
                              href={`/student/session/${p.id}/results`}
                              className="text-xs text-gray-600 hover:underline"
                            >
                              Review
                            </Link>
                            <DeletePracticeButton sessionId={p.id} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
