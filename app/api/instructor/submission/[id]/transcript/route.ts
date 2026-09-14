// GET /api/instructor/submission/<id>/transcript
// Downloads a readable .txt of the conversation (speaker label then text, one
// turn at a time), built server-side from the stored transcript. Instructor-
// gated through the shared loader.
import { NextResponse } from "next/server";
import {
  loadInstructorSubmission,
  submissionFileBase,
} from "@/lib/instructor-submission";
import { formatElapsed, formatInstant } from "@/lib/app-time";

// Same date-and-time wording the detail view uses, for the file header. US
// Central, like every other timestamp in the app; see lib/app-time.ts. (This
// comment used to say UTC, and it was right until 2026-09-11.)
function formatDateTime(value: string | null): string | null {
  return formatInstant(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await loadInstructorSubmission(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { submission, studentEmail, assignmentTitle, scenarioTitle, personaName } =
    result.data;

  const lines: string[] = [];
  lines.push("Relii submission transcript");
  lines.push(`Student: ${studentEmail}`);
  lines.push(`Assignment: ${assignmentTitle}`);
  lines.push(`Scenario: ${scenarioTitle}`);
  const submittedAt = formatDateTime(submission.submitted_at);
  if (submittedAt) lines.push(`Submitted: ${submittedAt}`);

  // THE ANCHOR FOR THE ELAPSED COLUMN BELOW. Every turn is stamped with how far
  // into the conversation it came, which is a duration and says nothing about
  // when the conversation happened. One absolute time in the header gives the
  // column something to hang off, and it costs one line.
  //
  // READ HERE, ABOVE THE BRANCH, BECAUSE transcript[0] DOES NOT EXIST IN THE
  // EMPTY CASE and that case is handled immediately below.
  const firstTurn = submission.transcript[0];
  const startedAt = firstTurn ? formatDateTime(firstTurn.at) : null;
  if (startedAt) lines.push(`Started: ${startedAt}`);

  lines.push("");

  if (submission.transcript.length === 0) {
    lines.push("(No transcript was recorded for this submission.)");
  } else {
    for (const turn of submission.transcript) {
      const who = turn.role === "student" ? studentEmail : personaName;
      const elapsed = firstTurn ? formatElapsed(firstTurn.at, turn.at) : null;
      lines.push(
        elapsed ? `[${elapsed}] ${who}: ${turn.text}` : `${who}: ${turn.text}`,
      );
      lines.push("");
    }
  }

  const filename = `${submissionFileBase(
    studentEmail,
    submission.submitted_at,
  )}-transcript.txt`;

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
