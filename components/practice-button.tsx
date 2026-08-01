"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Starts a new practice session for an assignment, then opens the conversation.
// The student picks the mode each time, independent of what the assignment
// requires for its graded submission: mode "text" types with the persona; mode
// "voice" holds a spoken call with the webcam (practice keeps its camera toggle).
export function PracticeButton({
  assignmentId,
  mode = "text",
}: {
  assignmentId: string;
  mode?: "text" | "voice";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // The two modes use different start routes but both return a session id and
  // open the same session screen (which picks the right interface by mode).
  const startUrl = mode === "voice" ? "/api/voice/start" : "/api/session/start";
  const label =
    mode === "voice" ? "Practice (voice + video)" : "Practice (text)";

  async function start() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(startUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Could not start the session.");
      }
      router.push(`/student/session/${data.sessionId}`);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  // Text practice is the primary of the two; voice + video is the outlined one.
  // That was the split before the shared Button existed, and it is kept.
  return (
    <>
      <Button
        type="button"
        variant={mode === "voice" ? "secondary" : "primary"}
        onClick={start}
        disabled={loading}
      >
        {loading ? "Starting..." : label}
      </Button>
      {error && (
        <p className="mt-2 w-full text-sm text-content-danger">{error}</p>
      )}
    </>
  );
}
