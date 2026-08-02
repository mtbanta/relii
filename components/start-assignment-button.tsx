"use client";

// Starts the student's one graded submission for an assignment. It asks the
// server to create the submission, sets the short-lived "live attempt" marker,
// then opens the live screen. If the server says a submission already exists, it
// routes the student to the right place instead (their result, or the existing
// attempt's screen).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { liveMarkerKey } from "@/lib/submission";
import { Button } from "@/components/ui/button";

export function StartAssignmentButton({
  assignmentId,
  disabled = false,
}: {
  assignmentId: string;
  // Piece 4: the one-shot graded flow is intentionally disabled. When `disabled`
  // is true the button renders grayed and non-clickable, and start() is never
  // wired up. All the one-shot logic below stays intact and reachable: flipping
  // this prop back to false re-enables the flow with no other change.
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/assignment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.sessionId) {
        // Mark this as the live continuous attempt, then open the live screen.
        try {
          window.sessionStorage.setItem(liveMarkerKey(data.sessionId), "1");
        } catch {
          /* ignore; the server window still governs the attempt */
        }
        router.push(`/student/session/${data.sessionId}`);
        return;
      }

      // Already have a submission for this assignment.
      if (res.status === 409 && data.sessionId) {
        if (data.state === "submitted") {
          router.push(`/student/session/${data.sessionId}/results`);
        } else {
          router.push(`/student/session/${data.sessionId}`);
        }
        return;
      }

      throw new Error(data?.error ?? "Could not start the assignment.");
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  // Disabled (Piece 4): a grayed, non-clickable button. No onClick, so the
  // one-shot flow above cannot be reached from here. The shared Button already
  // dims it and blocks the cursor when disabled, so that no longer needs its
  // own classes here.
  if (disabled) {
    return (
      <Button type="button" disabled aria-disabled="true">
        Start assignment
      </Button>
    );
  }

  return (
    <>
      <Button type="button" onClick={start} disabled={loading}>
        {loading ? "Starting..." : "Start assignment"}
      </Button>
      {error && (
        <p className="mt-2 w-full text-body text-content-danger">{error}</p>
      )}
    </>
  );
}
