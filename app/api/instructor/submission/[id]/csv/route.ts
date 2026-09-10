// GET /api/instructor/submission/<id>/csv
// Downloads a .csv of the scores: a small header block identifying the student,
// assignment, rubric and total out of max, then one row per scored criterion
// (item, level, points earned, points max, comment). Built server-side from the
// stored score and the rubric. Instructor-gated through the shared loader.
//
// ==> PHASE 2b-2 MADE TWO CHANGES HERE, AND BOTH ARE THE OWNER'S RULINGS.
//
//     1. THE FILE GAINS A LEVEL COLUMN AND LOSES ITS CATEGORY COLUMN. The level
//        is the grade: the AI names one rung of the criterion's own ladder and
//        the points are looked up from it, so a file that shows the points and
//        not the level shows the consequence without the finding. Category goes
//        because a criterion IS its own category now, so the column could only
//        hold a copy of the Item beside it. Reusing the Category column to carry
//        the level was considered and rejected: a column headed Category holding
//        "Proficient" is exactly the quiet mislabel this project keeps getting
//        bitten by.
//
//        THE RUBRIC'S NAME IS NOT LOST WITH THAT COLUMN. It moves to the header
//        block, where it is stated once, beside the student and the assignment,
//        rather than repeated on every row.
//
//     2. WHEN THE ASSIGNMENT HAS NO RUBRIC, THE FILE SAYS SO IN WORDS. Since
//        2b-2 the rubric is resolved through the ASSIGNMENT everywhere, and 32
//        stored scores sit on assignments that name none. The submission page
//        tells an instructor those cannot be itemized. This file still writes
//        the rows, because an export exists to carry the data, but with no
//        rubric to resolve, the Item column falls back to internal criterion
//        IDS. A file that itemizes a score in identifiers while the screen says
//        it cannot be itemized is two surfaces disagreeing, so the header block
//        carries one line explaining exactly that. <==
import { NextResponse } from "next/server";
import {
  loadInstructorSubmission,
  submissionFileBase,
} from "@/lib/instructor-submission";
import { formatPoints } from "@/lib/types";

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
    rubricName,
    rubricAttached,
    criteria,
  } = result.data;
  const score = submission.score;
  const criterionById = new Map(criteria.map((c) => [c.id, c]));

  const rows: string[] = [];

  // Header block identifying the submission.
  rows.push([cell("Relii submission scores")].join(","));
  rows.push([cell("Student"), cell(studentEmail)].join(","));
  rows.push([cell("Assignment"), cell(assignmentTitle)].join(","));
  rows.push([cell("Scenario"), cell(scenarioTitle)].join(","));
  rows.push([cell("Rubric"), cell(rubricName ?? "None attached")].join(","));
  rows.push(
    [
      cell("Total"),
      cell(
        score
          ? `${formatPoints(score.total)} / ${formatPoints(score.max_total)}`
          : "Not scored",
      ),
    ].join(","),
  );
  // The one line that keeps this file and the submission page telling the same
  // story. See the note at the top.
  if (score && !rubricAttached) {
    rows.push(
      [
        cell("Note"),
        cell(
          "This assignment has no rubric attached, so the item names below are internal identifiers and no level was recorded.",
        ),
      ].join(","),
    );
  }
  rows.push("");

  // Column headers, then one row per scored criterion.
  rows.push(
    [
      cell("Item"),
      cell("Level"),
      cell("Points earned"),
      cell("Points max"),
      cell("Comment"),
    ].join(","),
  );

  if (score) {
    for (const item of score.items) {
      const criterion = criterionById.get(item.id);
      rows.push(
        [
          cell(criterion?.name ?? item.id),
          // Empty rather than a word of our own: 32 stored scores predate
          // ScoreItem.level, and writing "None" or "n/a" into a grade column
          // would put a value there that nobody awarded.
          cell(item.level ?? ""),
          // ==> NOT RAW, AND NOT ROUNDED EITHER. formatPoints is the same helper
          //     the screen uses, so a half that reads 3.5 on the results page
          //     reads 3.5 in the export. A spreadsheet reading this file gets
          //     3.5 as a number, because the quoting is what makes the cell
          //     safe, not the type. <==
          cell(formatPoints(item.points_earned)),
          cell(formatPoints(item.points_max)),
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
