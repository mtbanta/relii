"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  const className =
    mode === "voice"
      ? "rounded-md border border-black px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
      : "rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50";

  return (
    <>
      <button onClick={start} disabled={loading} className={className}>
        {loading ? "Starting..." : label}
      </button>
      {error && <p className="mt-2 w-full text-sm text-red-600">{error}</p>}
    </>
  );
}
