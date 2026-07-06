// Shared server-side loader for the instructor download routes (video,
// transcript, CSV). Each route calls this to do the SAME gate and read in one
// place: confirm the caller is a signed-in instructor (checked against the
// database, never trusted from the browser), then read ONE submission (kind =
// submission, so a practice can never be reached) with the admin client, along
// with the student, assignment, scenario, and rubric it needs. The service-role
// key stays server-side.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RubricItem, SessionScore, TranscriptTurn } from "@/lib/types";

export type LoadedSubmission = {
  admin: ReturnType<typeof createAdminClient>;
  submission: {
    id: string;
    mode: string;
    status: string;
    student_id: string;
    assignment_id: string;
    scenario_id: string;
    transcript: TranscriptTurn[];
    score: SessionScore | null;
    video_path: string | null;
    submitted_at: string | null;
  };
  studentEmail: string;
  assignmentTitle: string;
  scenarioTitle: string;
  personaName: string;
  rubricItems: RubricItem[];
};

export type LoadResult =
  | { ok: true; data: LoadedSubmission }
  | { ok: false; status: number; error: string };

export async function loadInstructorSubmission(id: string): Promise<LoadResult> {
  // 1. Must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not signed in." };

  const admin = createAdminClient();

  // 2. Must be an instructor, verified on the server against the database.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (caller?.role !== "instructor") {
    return {
      ok: false,
      status: 403,
      error: "Only instructors can download submissions.",
    };
  }

  // 3. Read the submission. It MUST be kind = submission, so a practice session
  //    can never be downloaded through these routes.
  const { data: submission } = await admin
    .from("sessions")
    .select(
      "id, mode, status, student_id, assignment_id, scenario_id, transcript, score, video_path, submitted_at",
    )
    .eq("id", id)
    .eq("kind", "submission")
    .single();
  if (!submission) {
    return { ok: false, status: 404, error: "Submission not found." };
  }

  // 4. The student, assignment, and scenario (for labels), then the rubric.
  const [{ data: student }, { data: assignment }, { data: scenario }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("email")
        .eq("id", submission.student_id)
        .single(),
      admin
        .from("assignments")
        .select("title")
        .eq("id", submission.assignment_id)
        .single(),
      admin
        .from("scenarios")
        .select("title, persona_name, rubric_id")
        .eq("id", submission.scenario_id)
        .single(),
    ]);

  const { data: rubric } = await admin
    .from("rubrics")
    .select("items")
    .eq("id", scenario?.rubric_id)
    .single();

  return {
    ok: true,
    data: {
      admin,
      submission: {
        ...submission,
        transcript: (submission.transcript ?? []) as TranscriptTurn[],
        score: (submission.score ?? null) as SessionScore | null,
      },
      studentEmail: student?.email ?? "unknown",
      assignmentTitle: assignment?.title ?? "Assignment",
      scenarioTitle: scenario?.title ?? "Scenario",
      personaName: scenario?.persona_name ?? "Customer",
      rubricItems: (rubric?.items ?? []) as RubricItem[],
    },
  };
}

// Turn a student's email into a short, filename-safe slug (the part before the
// @, lowercased, non-letters/digits collapsed to dashes).
function slugStudent(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "student"
  );
}

// A YYYY-MM-DD stamp (UTC) from the submitted date, or today if it is missing.
function fileDate(submittedAt: string | null): string {
  const d = submittedAt ? new Date(submittedAt) : new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The shared start of every download filename for a submission, e.g.
// "relii-submission-teststudent-2026-07-06". The routes add ".webm",
// "-transcript.txt", or "-scores.csv".
export function submissionFileBase(
  email: string,
  submittedAt: string | null,
): string {
  return `relii-submission-${slugStudent(email)}-${fileDate(submittedAt)}`;
}
