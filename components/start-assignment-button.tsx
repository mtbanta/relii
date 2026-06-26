"use client";

// Starts the student's one graded submission for an assignment. It asks the
// server to create the submission, sets the short-lived "live attempt" marker,
// then opens the live screen. If the server says a submission already exists, it
// routes the student to the right place instead (their result, or the existing
// attempt's screen).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { liveMarkerKey } from "@/lib/submission";

export function StartAssignmentButton({
  assignmentId,
}: {
  assignmentId: string;
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

  return (
    <>
      <button
        onClick={start}
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {loading ? "Starting..." : "Start assignment"}
      </button>
      {error && <p className="mt-2 w-full text-sm text-red-600">{error}</p>}
    </>
  );
}
