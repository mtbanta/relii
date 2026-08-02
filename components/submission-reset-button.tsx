"use client";

// The instructor reset control on a submissions-table row. It has TWO shapes,
// chosen by the `type` prop, deliberately different because they carry very
// different stakes:
//
//   type = "interrupted"  "Reset". This is the DESTRUCTIVE one: the route
//     permanently deletes the stuck attempt's row AND removes its recording from
//     Storage. It is styled with the DANGER tokens for exactly that reason.
//
//   type = "retake"       "Allow retake". Piece 4 made this NON-destructive: the
//     route returns the submission to the student's practice pool (kind
//     submission -> practice, submitted_at cleared), KEEPING the score and the
//     recording, so they can submit again. It is styled as an ordinary quiet
//     action.
//
// PD-8f: those two used to look IDENTICAL, both amber. That was backwards, and
// worse than merely inconsistent: the safe, routine action shouted as loudly as
// the permanent one. The authority for which is which is the route itself,
// app/api/instructor/submission/[id]/reset/route.ts, not the comments that used
// to sit here.
//
// One consequence of the retake path that is easy to miss and IS now stated in
// its confirm: after returning the row, the route re-runs prunePractices with
// keepId set. The returned practice carries its original (old) date, so if the
// student's pool is already at the cap, force-keeping it means their OLDEST
// OTHER practice and that practice's recording are dropped.
//
// Both POST to /api/instructor/submission/<id>/reset with the matching type; the
// server re-verifies the session qualifies for that path before acting. On
// success the page refreshes so the row updates.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KEPT_PRACTICES } from "@/lib/practice";

export function SubmissionResetButton({
  sessionId,
  studentEmail,
  assignmentTitle,
  type,
  priorScoreTotal,
  priorScoreMax,
}: {
  sessionId: string;
  studentEmail: string;
  assignmentTitle: string;
  type: "interrupted" | "retake";
  priorScoreTotal?: number | null;
  priorScoreMax?: number | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleReset() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/instructor/submission/${sessionId}/reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not reset that submission.");
        setLoading(false);
        return;
      }
      // Re-run the dashboard query so this row reflects the reset.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function cancel() {
    setConfirming(false);
    setError("");
  }

  // ---- Path 1: interrupted attempt. THE DESTRUCTIVE ONE. ------------------
  if (type === "interrupted") {
    if (!confirming) {
      return (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-md border border-content-danger px-2 py-0.5 text-micro text-content-danger hover:bg-surface-danger"
        >
          Reset
        </button>
      );
    }
    return (
      <div className="mt-1 rounded-md border border-content-danger bg-surface-danger p-2 text-micro">
        <p className="mb-2 text-content-danger">
          Reset the interrupted attempt for{" "}
          <span className="font-medium">{studentEmail}</span> on{" "}
          <span className="font-medium">{assignmentTitle}</span>? This
          PERMANENTLY DELETES that attempt and its recording so the student can
          start the assignment over. It cannot be undone.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="xs"
            onClick={cancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="xs"
            onClick={handleReset}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Permanently delete attempt"}
          </Button>
        </div>
        {error && <p className="mt-2 text-content-danger">{error}</p>}
      </div>
    );
  }

  // ---- Path 2: allow a retake. ROUTINE AND NON-DESTRUCTIVE. ---------------
  const hadScore = priorScoreTotal != null && priorScoreMax != null;

  if (!confirming) {
    return (
      // A quiet, ordinary action: a hairline border is its resting affordance,
      // and it deliberately does NOT wear the warning colour, because nothing
      // here is lost.
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-line-secondary px-2 py-0.5 text-micro text-content-secondary hover:bg-surface-tertiary hover:text-content-primary"
      >
        Allow retake
      </button>
    );
  }
  return (
    <div className="mt-1 rounded-md border border-line-tertiary bg-surface-secondary p-2 text-micro">
      <p className="mb-2 text-content-primary">
        Allow <span className="font-medium">{studentEmail}</span> to retake{" "}
        <span className="font-medium">{assignmentTitle}</span>? This returns their
        submission{hadScore ? ` (${priorScoreTotal} / ${priorScoreMax})` : ""} to
        their practice pool so they can submit again. The recording and the score
        are kept.
      </p>
      {/* The one consequence that IS a deletion, stated plainly. The returned
          practice carries its original date, so force-keeping it can push the
          pool over the cap. */}
      <p className="mb-2 text-content-secondary">
        If they already have {KEPT_PRACTICES} saved practices, returning this one
        drops their oldest other practice and its recording. This is recorded in
        the reset history.
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={cancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button size="xs" onClick={handleReset} disabled={loading}>
          {loading ? "Returning..." : "Allow retake"}
        </Button>
      </div>
      {error && <p className="mt-2 text-content-danger">{error}</p>}
    </div>
  );
}
