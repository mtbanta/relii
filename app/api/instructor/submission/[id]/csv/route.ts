// GET /api/instructor/submission/<id>/csv
// Downloads a .csv of the scores: a small header block identifying the student,
// assignment, and total out of max, then one row per rubric item (label,
// category, points earned, points max, comment). Built server-side from the
// stored score and the rubric. Instructor-gated through the shared loader.
import { NextResponse } from "next/server";
import {
  loadInstructorSubmission,
  submissionFileBase,
} from "@/lib/instructor-submission";

// Wrap one value as a safe CSV cell: always quoted, with inner quotes doubled.
// This keeps commas, quotes, and line breaks inside a comment from breaking the
// columns.
function cell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
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

  const {
    submission,
    studentEmail,
    assignmentTitle,
    scenarioTitle,
    rubricItems,
  } = result.data;
  const score = submission.score;
  const labelById = new Map(rubricItems.map((i) => [i.id, i]));

  const rows: string[] = [];

  // Header block identifying the submission.
  rows.push([cell("Relii submission scores")].join(","));
  rows.push([cell("Student"), cell(studentEmail)].join(","));
  rows.push([cell("Assignment"), cell(assignmentTitle)].join(","));
  rows.push([cell("Scenario"), cell(scenarioTitle)].join(","));
  rows.push(
    [
      cell("Total"),
      cell(score ? `${score.total} / ${score.max_total}` : "Not scored"),
    ].join(","),
  );
  rows.push("");

  // Column headers, then one row per scored rubric item.
  rows.push(
    [
      cell("Item"),
      cell("Category"),
      cell("Points earned"),
      cell("Points max"),
      cell("Comment"),
    ].join(","),
  );

  if (score) {
    for (const item of score.items) {
      const meta = labelById.get(item.id);
      rows.push(
        [
          cell(meta?.label ?? item.id),
          cell(meta?.category ?? ""),
          cell(item.points_earned),
          cell(item.points_max),
          cell(item.comment),
        ].join(","),
      );
    }
  }

  const filename = `${submissionFileBase(
    studentEmail,
    submission.submitted_at,
  )}-scores.csv`;

  return new NextResponse(rows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
