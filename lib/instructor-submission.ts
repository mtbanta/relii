// Shared server-side loader for the instructor routes that act on ONE
// submission. Each route calls this to do the SAME gate and read in one place:
// confirm the caller is a signed-in instructor who owns a class (checked against
// the database, never trusted from the browser), then read ONE submission
// (kind = submission, so a practice can never be reached) IN THAT CLASS with the
// admin client, along with the student, assignment, scenario, and rubric it
// needs. The service-role key stays server-side.
//
// ==> PHASE 4a: IT IS NO LONGER "THE DOWNLOAD LOADER", AND THE HEADING ABOVE
//     STOPPED SAYING SO IN THE SAME CHANGE. Three read-only download routes
//     (video, transcript, CSV) used it; the grade override route now uses it
//     too, and that one WRITES. The guard did not need to change to carry a
//     write, which is the point of it having been one guard rather than four
//     copies. What did need to change is the WORDING: two of its refusals said
//     "download", which is the wrong sentence to show somebody who was trying to
//     save a review. See the wording block below. <==
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
import { resolveWorkingClassId } from "@/lib/instructor-auth";
import { refuseOutsideClass } from "@/lib/class-scope";
import type {
  RubricCriterion,
  SessionScore,
  TranscriptTurn,
} from "@/lib/types";

// ==> THE TWO REFUSALS THAT NAME AN ACTION, AND WHY THEY ARE A PARAMETER WITH A
//     DEFAULT RATHER THAN AN EDIT AT EVERY CALL SITE.
//
//     Before Phase 4a this function said "Only instructors can download
//     submissions." and "...so submissions cannot be downloaded." Those are
//     right for the three download routes and wrong for a review. The obvious
//     move is to pass the wording in from each caller, and the obvious move
//     would have meant editing three working routes to hand back the exact
//     strings they already produced, where a single typo silently changes a
//     message a real person reads.
//
//     SO THE DEFAULT IS THE OLD WORDING, BYTE FOR BYTE, AND THE THREE DOWNLOAD
//     ROUTES ARE NOT TOUCHED AT ALL. Their diff for this phase is empty, which
//     is a stronger guarantee that their messages are unchanged than any
//     careful copying could be. Only a caller that needs different words passes
//     any. <==
export type SubmissionWording = {
  // Completes "Only instructors can ...".
  action: string;
  // The whole sentence for an instructor who is in no class.
  noClass: string;
};

export const DOWNLOAD_WORDING: SubmissionWording = {
  action: "download submissions",
  noClass:
    "Your instructor account is not linked to a class, so submissions cannot be downloaded.",
};

export type LoadedSubmission = {
  admin: ReturnType<typeof createAdminClient>;
  // PHASE 4a. WHO IS ASKING, AND WHICH CLASS THEY ARE WORKING IN. The three
  // download routes ignore all three. The review route needs them for the audit
  // row it writes, and taking them from here rather than calling
  // requireInstructorRequest() as well is what keeps ONE guard on this path:
  // two guards would be two places that could answer "may this caller act on
  // this submission" differently. They cost no extra query, because the
  // profiles read below was already happening.
  callerId: string;
  callerEmail: string | null;
  callerClassId: string;
  submission: {
    id: string;
    mode: string;
    status: string;
    student_id: string;
    assignment_id: string;
    scenario_id: string;
    transcript: TranscriptTurn[];
    score: SessionScore | null;
    // PHASE 4a. The numeric column beside the jsonb. The two are written
    // together and must agree; the review reads this one so that the snapshot
    // it takes of the AI's grade records what was actually IN FORCE rather than
    // what can be derived from the jsonb beside it.
    score_total: number | null;
    video_path: string | null;
    submitted_at: string | null;
    // PHASE 4a. When an instructor last saved a review, or null. It is a COLUMN
    // and never a status: see supabase/phase-4a-review.sql section 1.
    reviewed_at: string | null;
    // GATE 3b: read so the class check below has something to compare.
    class_id: string | null;
  };
  studentEmail: string;
  assignmentTitle: string;
  scenarioTitle: string;
  personaName: string;
  // PHASE 2b-2: the ASSIGNMENT's rubric, not the scenario's. See the read below.
  rubricName: string | null;
  criteria: RubricCriterion[];
  // Whether the assignment names a rubric at all. It is returned as its own
  // fact rather than inferred from criteria being empty, because the CSV has to
  // TELL its reader which of the two situations it is in and a guess is not
  // good enough to print in a downloaded file.
  rubricAttached: boolean;
};

export type LoadResult =
  | { ok: true; data: LoadedSubmission }
  | { ok: false; status: number; error: string };

export async function loadInstructorSubmission(
  id: string,
  wording: SubmissionWording = DOWNLOAD_WORDING,
): Promise<LoadResult> {
  // 1. Must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not signed in." };

  const admin = createAdminClient();

  // 2. Must be an instructor, verified on the server against the database.
  // PHASE 4a added `email` to this select and nothing else. The review route
  // needs the caller's own address for its audit row, and this read was already
  // happening, exactly as Gate 6 added is_super_admin to the sibling read in
  // lib/class-scope.ts.
  const { data: caller } = await admin
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();
  if (caller?.role !== "instructor") {
    return {
      ok: false,
      status: 403,
      error: `Only instructors can ${wording.action}.`,
    };
  }

  // 2b. GATE 3b. Which class is the caller working in? Everything below is
  //     scoped to it. FAILS CLOSED: an instructor with no class downloads
  //     nothing rather than downloading everything.
  //
  //     GATE 6: an instructor may now own several classes, so this resolves the
  //     WORKING one, and the remembered selection is checked against
  //     classes.instructor_id on every call before it is honoured. The three
  //     download routes needed no edit for that, exactly as they needed none in
  //     Gate 3b: they reach the class through this one helper.
  //
  //     A DOWNLOAD FOR A SUBMISSION IN THE CALLER'S OTHER CLASS IS STILL A 404
  //     HERE, and that is deliberate rather than an oversight. The friendly
  //     "this is in your other class" answer belongs on the four detail PAGES a
  //     person can navigate to. These are file downloads reached from a page
  //     that is already scoped, so a cross-class request is a bug or a crafted
  //     one, and neither deserves a helpful answer.
  const callerClassId = await resolveWorkingClassId(user.id);
  if (!callerClassId) {
    return { ok: false, status: 409, error: wording.noClass };
  }

  // 3. Read the submission. It MUST be kind = submission, so a practice session
  //    can never be downloaded through these routes.
  const { data: submission } = await admin
    .from("sessions")
    .select(
      "id, mode, status, student_id, assignment_id, scenario_id, transcript, score, score_total, video_path, submitted_at, reviewed_at, class_id",
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
  //
  // ==> PHASE 2b-2: THE RUBRIC COMES FROM THE ASSIGNMENT. It used to come from
  //     scenarios.rubric_id, which 2b-1 deliberately left alone here so that an
  //     instructor kept seeing the 32 historical scores with their labels while
  //     the student's own page had already moved. That divergence was temporary
  //     and this closes it. ONE RULE NOW GOVERNS EVERYWHERE: the rubric comes
  //     from the assignment or there is none. <==
  const [{ data: student }, { data: assignment }, { data: scenario }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("email")
        .eq("id", submission.student_id)
        .single(),
      admin
        .from("assignments")
        .select("title, rubric_id")
        .eq("id", submission.assignment_id)
        .single(),
      admin
        .from("scenarios")
        .select("title, persona_name")
        .eq("id", submission.scenario_id)
        .single(),
    ]);

  // ==> THE GUARD ON THIS READ IS LOAD BEARING, NOT DEFENSIVE. Before 2b-2 the
  //     id handed to .eq() was a scenario's rubric, which was never null on the
  //     rows this page could reach. It is an ASSIGNMENT's rubric now, and that
  //     is null on 32 of the 33 stored scores, so "no rubric" is the COMMON case
  //     here rather than an edge one. Asking PostgREST for id equals undefined
  //     is not a question with a sensible answer. <==
  const rubricId = assignment?.rubric_id ?? null;
  const { data: rubric } = rubricId
    ? await admin
        .from("rubrics")
        .select("name, items")
        .eq("id", rubricId)
        .single()
    : { data: null };

  return {
    ok: true,
    data: {
      admin,
      callerId: user.id,
      callerEmail: caller.email ?? null,
      callerClassId,
      submission: {
        ...submission,
        transcript: (submission.transcript ?? []) as TranscriptTurn[],
        score: (submission.score ?? null) as SessionScore | null,
      },
      studentEmail: student?.email ?? "unknown",
      assignmentTitle: assignment?.title ?? "Assignment",
      scenarioTitle: scenario?.title ?? "Scenario",
      personaName: scenario?.persona_name ?? "Customer",
      rubricName: rubric?.name ?? null,
      criteria: (rubric?.items ?? []) as RubricCriterion[],
      rubricAttached: rubricId !== null,
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
