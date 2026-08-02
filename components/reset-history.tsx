// The per-assignment reset history on the instructor dashboard. A small
// "Resets: N" line that expands (native HTML <details>, so it needs no
// JavaScript) into a short, newest-first list of the resets for the currently
// selected assignment. The rows are read instructor-only on the server (see the
// dashboard page); nothing sensitive reaches the browser it should not.
//
// Each entry shows: the student (email), the type (an interrupted recovery vs a
// graded retake that returned the submission to the student's practice pool), the
// score the submission had at that point for a graded retake only, when it
// happened, and who did it (instructor email). Deliberately simple: no filtering,
// search, pagination, or export.

// One reset as read for this list (a snapshot row from submission_resets).
export type ResetHistoryRow = {
  id: string;
  student_email: string;
  reset_type: string;
  prior_score_total: number | null;
  prior_score_max: number | null;
  created_at: string;
  instructor_email: string;
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
  if (resets.length === 0) {
    // Quiet, so a clean assignment does not shout an empty section.
    return (
      <p className="mt-3 text-meta text-content-tertiary">No resets for this assignment.</p>
    );
  }

  return (
    <details className="mt-3 rounded-lg border border-line-tertiary p-3">
      <summary className="cursor-pointer text-body text-content-secondary">
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
                <span className="font-medium">{r.student_email}</span>
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
