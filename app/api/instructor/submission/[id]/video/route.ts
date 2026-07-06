// GET /api/instructor/submission/<id>/video
// Downloads a submission's recording as a .webm file. Instructor-gated: it
// confirms the caller is an instructor and reads the submission with the admin
// client (via the shared loader), then mints a short-lived signed link WITH a
// download filename and redirects the browser to it. This reuses the existing
// signed-link-with-download pattern; the service-role key never reaches the
// browser, and no Storage rule is changed.
import { NextResponse } from "next/server";
import {
  loadInstructorSubmission,
  submissionFileBase,
} from "@/lib/instructor-submission";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await loadInstructorSubmission(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { admin, submission, studentEmail } = result.data;
  if (!submission.video_path) {
    return NextResponse.json(
      { error: "This submission has no recording." },
      { status: 404 },
    );
  }

  const filename = `${submissionFileBase(
    studentEmail,
    submission.submitted_at,
  )}.webm`;

  // A short life is fine: the browser follows the redirect and downloads at once.
  const { data: signed, error } = await admin.storage
    .from(SESSION_VIDEOS_BUCKET)
    .createSignedUrl(submission.video_path, 60, { download: filename });

  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Could not prepare the video download." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
