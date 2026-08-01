"use client";

// The instructor reset control on a submissions-table row. It has TWO shapes,
// chosen by the `type` prop, deliberately different because they carry very
// different stakes:
//
//   type = "interrupted"  A low-stakes recovery of a stuck attempt. A plain
//     "Reset" button opens a simple two-step confirm (like the delete-student
//     control): it names the student and assignment and explains the interrupted
//     attempt will be deleted so the student can start over.
//
//   type = "retake"       Allow a retake of a FINISHED submission. Piece 4 made
//     this non-destructive: an "Allow retake" button opens a plain confirm
//     explaining that it RETURNS the student's submission to their practice pool
//     (keeping the recording and the score) so they can submit again. Nothing is
//     deleted, so there is no download reminder and no type-RESET gate.
//
// Both POST to /api/instructor/submission/<id>/reset with the matching type; the
// server re-verifies the session qualifies for that path before acting. On
// success the page refreshes so the row updates.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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

  // ---- Path 1: interrupted attempt (low stakes) --------------------------
  if (type === "interrupted") {
    if (!confirming) {
      return (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-md border border-amber-300 px-2 py-0.5 text-xs text-content-warning hover:bg-surface-warning"
        >
          Reset
        </button>
      );
    }
    return (
      <div className="mt-1 rounded-md border border-amber-200 bg-surface-warning p-2 text-xs">
        <p className="mb-2 text-content-warning">
          Reset the interrupted attempt for{" "}
          <span className="font-medium">{studentEmail}</span> on{" "}
          <span className="font-medium">{assignmentTitle}</span>? This deletes
          their stuck attempt so they can start the assignment over.
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
            variant="caution"
            size="xs"
            onClick={handleReset}
            disabled={loading}
          >
            {loading ? "Resetting..." : "Yes, reset attempt"}
          </Button>
        </div>
        {error && <p className="mt-2 text-content-danger">{error}</p>}
      </div>
    );
  }

  // ---- Path 2: allow a retake of a completed submission ------------------
  // Piece 4: this is no longer destructive. Allowing a retake RETURNS the
  // student's submission to their practice pool (keeping the recording and the
  // score) so they can submit again, so it is a plain confirm, not the old
  // type-RESET, "permanently delete" gate.
  const hadScore = priorScoreTotal != null && priorScoreMax != null;

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-amber-300 px-2 py-0.5 text-xs text-content-warning hover:bg-surface-warning"
      >
        Allow retake
      </button>
    );
  }
  return (
    <div className="mt-1 rounded-md border border-amber-200 bg-surface-warning p-2 text-xs">
      <p className="mb-2 text-content-warning">
        Allow <span className="font-medium">{studentEmail}</span> to retake{" "}
        <span className="font-medium">{assignmentTitle}</span>? This returns their
        submission{hadScore ? ` (${priorScoreTotal} / ${priorScoreMax})` : ""} to
        their practice pool so they can submit again. The recording and the score
        are kept; nothing is deleted. This is recorded in the reset history.
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
          variant="caution"
          size="xs"
          onClick={handleReset}
          disabled={loading}
        >
          {loading ? "Returning..." : "Allow retake"}
        </Button>
      </div>
      {error && <p className="mt-2 text-content-danger">{error}</p>}
    </div>
  );
}
