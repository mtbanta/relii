"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { TranscriptTurn } from "@/lib/types";

// The live text conversation with the persona. Shows the running transcript,
// takes the student's typed replies, and ends the session for scoring.
export function Conversation({
  sessionId,
  personaName,
  scenarioTitle,
  initialTranscript,
  isSubmission = false,
}: {
  sessionId: string;
  personaName: string;
  scenarioTitle: string;
  initialTranscript: TranscriptTurn[];
  // A graded submission ends with an explicit submit-and-score confirmation
  // step (its one official attempt), instead of practice's quick pop-up.
  isSubmission?: boolean;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<TranscriptTurn[]>(initialTranscript);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || ending) return;

    setError("");
    setSending(true);
    setInput("");
    // Show the student's message right away.
    const studentTurn: TranscriptTurn = {
      role: "student",
      text,
      at: new Date().toISOString(),
    };
    setTurns((prev) => [...prev, studentTurn]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Alex could not respond.");
      const personaTurn: TranscriptTurn = {
        role: "persona",
        text: data.reply,
        at: new Date().toISOString(),
      };
      setTurns((prev) => [...prev, personaTurn]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      // Put the unsent text back so nothing is lost.
      setInput(text);
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  // Clicking the header button. Practice confirms with a quick pop-up; a graded
  // submission opens an explicit inline confirmation step instead.
  function requestEnd() {
    if (sending || ending) return;
    if (isSubmission) {
      setConfirming(true);
      return;
    }
    const ok = window.confirm(
      "End this session and see your score? You will not be able to add more messages.",
    );
    if (ok) void doEnd();
  }

  // Finalize and score. Shared by both paths.
  async function doEnd() {
    if (sending || ending) return;
    setConfirming(false);
    setError("");
    setEnding(true);
    try {
      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not score the session.");
      router.push(`/student/session/${sessionId}/results`);
    } catch (err) {
      setEnding(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col">
      <header className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
        <div>
          <h1 className="text-lg font-semibold">{scenarioTitle}</h1>
          <p className="text-sm text-gray-500">
            {isSubmission ? "Graded submission with " : "Speaking with "}
            {personaName}
          </p>
        </div>
        <button
          onClick={requestEnd}
          disabled={ending || sending}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {ending
            ? "Scoring..."
            : isSubmission
              ? "Submit assignment"
              : "End session"}
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {turns.map((turn, i) => (
          <div
            key={i}
            className={turn.role === "student" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                turn.role === "student"
                  ? "max-w-[80%] rounded-2xl bg-black px-4 py-2 text-sm text-white"
                  : "max-w-[80%] rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-900"
              }
            >
              <p className="mb-0.5 text-xs font-medium opacity-70">
                {turn.role === "student" ? "You" : personaName}
              </p>
              <p className="whitespace-pre-wrap">{turn.text}</p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500">
              {personaName} is typing...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Graded submission: the explicit submit-and-score step. */}
      {isSubmission && confirming && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="text-amber-900">
            Submit this graded assignment for scoring? This is your one official
            attempt and cannot be redone.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={ending}
              className="rounded-md border border-gray-300 px-3 py-1.5 disabled:opacity-50"
            >
              Keep talking
            </button>
            <button
              onClick={doEnd}
              disabled={ending}
              className="rounded-md bg-black px-3 py-1.5 text-white disabled:opacity-50"
            >
              {ending ? "Scoring..." : "Submit and score"}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={send} className="mt-3 flex gap-2 border-t border-gray-200 pt-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Type your message to ${personaName}...`}
          disabled={ending}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || ending || !input.trim()}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
