// Shared server-side loader for the instructor download routes (video,
// transcript, CSV). Each route calls this to do the SAME gate and read in one
// place: confirm the caller is a signed-in instructor who owns a class (checked
// against the database, never trusted from the browser), then read ONE
// submission (kind = submission, so a practice can never be reached) IN THAT
// CLASS with the admin client, along with the student, assignment, scenario, and
// rubric it needs. The service-role key stays server-side.
//
// ==> GATE 3b: THIS IS THE HEADLINE FIX OF THE WHOLE ISOLATION GATE. <==
//
// Until now this function checked only that the caller was AN instructor, never
// that the submission was THEIRS, and it backs all three download routes. So any
// instructor account could download any student's recording, transcript and
// score CSV by guessing or being handed a session id. Nothing leaked, because
// there has only ever been one instructor, but it was open.
//
// STORAGE IS NOT WHERE THIS IS FIXED, and it must not be moved there.
// supabase/stage-5-storage.sql carries exactly one rule, students reading their
// own folder, with no instructor rule at all. Instructor playback and every
// download run through the server with the service-role key, which bypasses
// Storage rules entirely. So the recording is scoped HERE, in the route, and
// nowhere else. The signed link is minted only after the class check below
// passes.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstructorClassId } from "@/lib/instructor-auth";
import { refuseOutsideClass } from "@/lib/class-scope";
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
    // GATE 3b: read so the class check below has something to compare.
    class_id: string | null;
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

  // 2b. GATE 3b. Which class does the caller own? Everything below is scoped to
  //     it. FAILS CLOSED: an instructor with no class downloads nothing rather
  //     than downloading everything. After the Gate 3a repair this is
  //     unreachable, which is exactly why it refuses instead of waving through.
  const callerClassId = await getInstructorClassId(user.id);
  if (!callerClassId) {
    return {
      ok: false,
      status: 409,
      error:
        "Your instructor account is not linked to a class, so submissions cannot be downloaded.",
    };
  }

  // 3. Read the submission. It MUST be kind = submission, so a practice session
  //    can never be downloaded through these routes.
  const { data: submission } = await admin
    .from("sessions")
    .select(
      "id, mode, status, student_id, assignment_id, scenario_id, transcript, score, video_path, submitted_at, class_id",
    )
    .eq("id", id)
    .eq("kind", "submission")
    .single();
  if (!submission) {
    return { ok: false, status: 404, error: "Submission not found." };
  }

  // 3b. GATE 3b, THE ACTUAL FIX. The submission must be in the caller's class.
  //     The refusal is a 404 carrying the same wording as the line above, so a
  //     caller cannot tell "does not exist" from "is not yours"; the real reason
  //     goes to the server log. Every read below this line, and the signed video
  //     link the video route mints from it, is now inside one class.
  const outside = refuseOutsideClass(submission.class_id, callerClassId, "submission");
  if (outside) return { ok: false, status: outside.status, error: "Submission not found." };

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
