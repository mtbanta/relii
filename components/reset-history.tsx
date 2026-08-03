// The per-assignment reset history on the instructor dashboard. A small
// "Resets: N" line that expands (native HTML <details>, so it needs no
// JavaScript) into a short, newest-first list of the resets for the currently
// selected assignment. The rows are read instructor-only on the server (see the
// dashboard page); nothing sensitive reaches the browser it should not.
//
// Each entry shows: the student (by NAME), the type (an interrupted recovery vs a
// graded retake that returned the submission to the student's practice pool), the
// score the submission had at that point for a graded retake only, when it
// happened, and who did it (instructor email). Deliberately simple: no filtering,
// search, pagination, or export.
//
// THE NAME, AND WHY THE STORED EMAIL IS STILL THE FALLBACK (PD-8g). This list
// showed student_email, which is the email as it was AT THE TIME: submission_resets
// stores it deliberately as a snapshot, so the log survives the student row being
// deleted. The name is nicer to read and matches every other instructor surface,
// so the dashboard now resolves it by joining the audit row's student_id back to
// profiles and passes it in as studentName.
//
// The snapshot email stays as the fallback, and that is the load-bearing part: a
// reset for a since-deleted student has NO profile to join to, and a student who
// somehow has no name set has nothing to show. A blank cell in an audit log is
// worse than an email, so the email is what fills the gap.

// One reset as read for this list (a snapshot row from submission_resets), plus
// the name resolved for it by the page that reads it.
export type ResetHistoryRow = {
  id: string;
  student_email: string;
  reset_type: string;
  prior_score_total: number | null;
  prior_score_max: number | null;
  created_at: string;
  instructor_email: string;
  // The student's display name, resolved from profiles by the dashboard. Null
  // when the student no longer exists or has no name set, which is exactly when
  // the stored snapshot email is shown instead.
  studentName?: string | null;
};

// A readable date and time. We read it in UTC (like the rest of the dashboard's
// dates) so the value is stable and never shifts with the viewer's timezone.
function formatResetTime(value: string): string {
  return (
    new Date(value).toLocaleString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " UTC"
  );
}

export function ResetHistory({ resets }: { resets: ResetHistoryRow[] }) {
  // PD-8d: the empty case used to be a bare unstyled sentence floating below the
  // page, which read as something unfinished rather than as a clean assignment.
  // It is now the SAME disclosure as the non-empty case, just with nothing to
  // open, so the two states are one component in one place on the page.
  if (resets.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-line-tertiary px-3 py-2 text-meta text-content-tertiary">
        Resets: 0
      </p>
    );
  }

  return (
    <details className="mt-4 rounded-lg border border-line-tertiary px-3 py-2">
      {/* The accent colour is on at REST, not on hover. The native disclosure
          triangle is a glyph, and a glyph is not an affordance on its own; a
          hover-only treatment advertises nothing, since the reader has to
          already know the control is there to hover it. */}
      <summary className="cursor-pointer text-meta text-content-info">
        Resets: {resets.length}
      </summary>
      <ul className="mt-2 space-y-2 text-meta">
        {resets.map((r) => {
          const isRetake = r.reset_type === "retake";
          const typeLabel = isRetake
            ? "Graded retake (returned to pool)"
            : "Interrupted recovered";
          // The score the submission had is shown for a graded retake only; an
          // interrupted recovery never had one.
          const hadScore =
            r.prior_score_total != null && r.prior_score_max != null;
          return (
            <li
              key={r.id}
              className="border-b border-line-tertiary pb-2 last:border-0 last:pb-0"
            >
              <p className="text-content-primary">
                <span className="font-medium">
                  {r.studentName || r.student_email}
                </span>
                {" · "}
                {typeLabel}
                {isRetake && hadScore
                  ? ` (${r.prior_score_total} / ${r.prior_score_max})`
                  : ""}
              </p>
              <p className="text-content-tertiary">
                {formatResetTime(r.created_at)}
                {" · by "}
                {r.instructor_email}
              </p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
