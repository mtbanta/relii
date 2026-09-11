// GET /api/instructor/submission/<id>/csv
// Downloads a .csv of the scores: a small header block identifying the student,
// assignment, rubric, total out of max and review status, then one row per
// scored criterion (item, level, AI level, points earned, points max, comment,
// instructor note). Built server-side from the stored score, the rubric and the
// AI's recorded original. Instructor-gated through the shared loader.
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
//
// ==> PHASE 4b ADDED THE REVIEW TO THIS FILE: A Status LINE, AN "AI level"
//     COLUMN AND AN "Instructor note" COLUMN.
//
//     THIS IS THE ONE PLACE IN 4b THAT READS public.submission_ai_scores, AND
//     IT LOOKS LIKE IT CONTRADICTS PHASE 4b HANDOFF ITEM 5 UNTIL YOU READ ITEM
//     5's OWN SCOPE. Item 5 says the AI original "is not a fallback for
//     anything THE STUDENT SEES", and its rule is "any STUDENT-FACING render
//     must come from sessions.score". This file is not a student-facing render:
//     it is an instructor-gated download behind loadInstructorSubmission(),
//     which checks the caller is an instructor AND that the submission is in
//     their own class, and it is built with the service-role key server-side.
//     The owner's 4b kickoff authorises this read by name. Nothing student
//     facing in this phase touches that table, and the student's own browser
//     key still cannot read a row of it, which 4a measured rather than assumed.
//
//     ==> AND THE COLUMN MUST NEVER LIE, WHICH IS WHY THERE ARE FOUR BRANCHES
//         BELOW AND NOT ONE. "AI level equals Level when there is no stored
//         original" is TRUE for an unreviewed score, because an unreviewed
//         score IS the AI's. It is FALSE the moment somebody has reviewed it.
//         So the reviewed-with-no-original case writes a BLANK and says why in
//         the header, rather than copying the instructor's level into a column
//         headed "AI level" and turning a missing record into a fabricated one.
//         Nobody reading a grade export can tell a fabricated cell from a real
//         one, which is exactly why it must not be written. <==
import { NextResponse } from "next/server";
import {
  loadInstructorSubmission,
  submissionFileBase,
} from "@/lib/instructor-submission";
import { readAiOriginal } from "@/lib/submission-review";
import { aiLevelFor } from "@/lib/submission-ai-level";
import { formatDateTaken } from "@/lib/date-taken";
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
    admin,
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

  // ==> WHAT THE AI ORIGINALLY SAID, AND THE THREE STATES IT COMES BACK IN.
  //     readAiOriginal is the SAME reader the review route and the retake use;
  //     this file does not query that table itself, so there is one place that
  //     knows how the AI's original is stored.
  //
  //       - a row            the submission has been reviewed at least once
  //       - null             no review has ever been saved for it
  //       - a refusal        the read itself failed
  //
  //     A FAILED READ IS NOT TREATED AS "no original". Those are different
  //     facts and they produce different files: the first cannot say what the
  //     AI chose, the second means the AI's choice is still sitting in
  //     sessions.score. Collapsing them is how a column headed "AI level" ends
  //     up holding a number nobody awarded.
  const aiRead = await readAiOriginal(admin, submission.id);
  const aiOriginal = aiRead.ok ? aiRead.original : null;
  const aiUnreadable = !aiRead.ok;

  // ==> THE STATE THIS FILE HAS TO BE HONEST ABOUT. A submission marked
  //     reviewed with no original on record is the state 4a's editor and its
  //     retake both REFUSE to create, so it should not exist; if it ever does,
  //     the AI's own level is gone and nothing can reconstruct it.
  const reviewedWithNoOriginal =
    submission.reviewed_at !== null && !aiUnreadable && aiOriginal === null;

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
  // ==> PHASE 4b. THE SAME TWO ANSWERS THE DASHBOARD'S Status COLUMN AND THE
  //     SUBMISSION PAGE ALREADY GIVE, IN THE SAME WORDS: "To review" until an
  //     instructor saves a review, "Reviewed <date>" afterwards. Wording copied
  //     deliberately rather than invented, so a file sitting in a folder and a
  //     row on a screen cannot describe one submission two ways.
  //
  //     GATED ON THERE BEING A SCORE, exactly as the submission page gates its
  //     own copy of this line. An interrupted submission has nothing to review,
  //     and the Total line above it already says "Not scored".
  //
  //     formatDateTaken UNCHANGED, on the owner's 2026-09-11 ruling: the live
  //     site renders UTC and the whole app moves to US Central in the session
  //     straight after 4b. One date format in the app, moved once.
  if (score) {
    const reviewedOn = formatDateTaken(submission.reviewed_at);
    rows.push(
      [
        cell("Status"),
        cell(reviewedOn ? `Reviewed ${reviewedOn}` : "To review"),
      ].join(","),
    );
  }
  // The one line that keeps this file and the submission page telling the same
  // story. See the note at the top.
  //
  // ==> THE NOTE LINES STACK RATHER THAN COMPETING, and that is on purpose. A
  //     score can be missing its rubric AND missing its AI original at the same
  //     time; they are separate facts about the file and picking a winner would
  //     suppress one of them. Each is its own line under its own "Note" label.
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
  if (score && reviewedWithNoOriginal) {
    rows.push(
      [
        cell("Note"),
        cell(
          "This submission is marked reviewed but no record of the AI's original score exists, so the AI level column is blank. The levels below are the ones currently in force.",
        ),
      ].join(","),
    );
  }
  if (score && aiUnreadable) {
    rows.push(
      [
        cell("Note"),
        cell(
          "The record of what the AI originally scored could not be read, so the AI level column is blank. Try downloading this file again.",
        ),
      ].join(","),
    );
  }
  rows.push("");

  // Column headers, then one row per scored criterion. PHASE 4b added "AI
  // level" beside Level, and "Instructor note" at the end beside Comment: two
  // people can now be speaking on one row, so they get a column each rather
  // than one column that is appended to.
  rows.push(
    [
      cell("Item"),
      cell("Level"),
      cell("AI level"),
      cell("Points earned"),
      cell("Points max"),
      cell("Comment"),
      cell("Instructor note"),
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
          // ==> WHAT THE AI CHOSE, AND IT IS ALWAYS EITHER THE TRUTH OR
          //     BLANK. The four branches live in lib/submission-ai-level.ts
          //     because a rule inside a route handler can only be READ and
          //     never RUN: Next.js allows only GET, POST and friends to be
          //     exported from a route file. Over there it is executed against
          //     all four states by scripts/check-csv-ai-level.mjs, including
          //     the reviewed-with-no-original case, which cannot be produced on
          //     the live site without destroying an audit record.
          cell(
            aiLevelFor({
              item,
              original: aiOriginal?.score ?? null,
              reviewedAt: submission.reviewed_at,
              unreadable: aiUnreadable,
            }),
          ),
          // ==> NOT RAW, AND NOT ROUNDED EITHER. formatPoints is the same helper
          //     the screen uses, so a half that reads 3.5 on the results page
          //     reads 3.5 in the export. A spreadsheet reading this file gets
          //     3.5 as a number, because the quoting is what makes the cell
          //     safe, not the type. <==
          cell(formatPoints(item.points_earned)),
          cell(formatPoints(item.points_max)),
          cell(item.comment),
          // The instructor's note, in their own words. cell() quotes every
          // value and doubles inner quotes, so a note carrying commas, quotes
          // or line breaks cannot break the columns. Absent where there is
          // none, never an empty string, so this is blank rather than "".
          cell(item.instructor_note ?? ""),
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
