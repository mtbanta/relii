"use client";

// The "Submit as graded assignment" control on an eligible saved practice
// (Piece 4). It promotes a completed voice+video practice (with a recording and a
// score) into the graded submission for its assignment. A short confirm panel
// describes the real effect, then it POSTs to /api/practice/submit and refreshes
// the page so the practice moves up into the assignment's "Submitted" state.
//
// The server route re-verifies eligibility and ownership; this control only
// decides what to show and collects the confirmation.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SubmitPracticeButton({
  sessionId,
  scoreTotal,
  scoreMax,
}: {
  sessionId: string;
  scoreTotal: number | null;
  scoreMax: number | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasScore = scoreTotal != null && scoreMax != null;

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/practice/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not submit this practice.");
        setLoading(false);
        return;
      }
      // Re-run the home page's queries so this practice now shows as the
      // submission and leaves the saved-practices list.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        size="xs"
        onClick={() => setConfirming(true)}
      >
        Submit as graded assignment
      </Button>
    );
  }

  return (
    <div className="mt-1 w-full rounded-md border border-amber-300 bg-surface-warning p-3 text-meta">
      <p className="text-content-warning">
        Submit this practice as your graded assignment? It becomes your official
        submission
        {hasScore ? ` and keeps its score (${scoreTotal} / ${scoreMax})` : ""}.
        Your other practices stay. This can only be changed if your instructor
        allows a retake.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          size="xs"
          onClick={submit}
          disabled={loading}
        >
          {loading ? "Submitting..." : "Submit for a grade"}
        </Button>
      </div>
      {error && <p className="mt-2 text-content-danger">{error}</p>}
    </div>
  );
}
