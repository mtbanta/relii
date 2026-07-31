"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PracticeClock } from "@/components/practice-clock";
import { DEFAULT_MEETING_MINUTES } from "@/lib/meeting-length";
import type { TranscriptTurn } from "@/lib/types";

// PD-6: how tall the message box is allowed to grow before it starts scrolling
// inside itself. Roughly six lines of text, which is enough to see a full
// paragraph reply without the box eating the conversation above it. The exact
// number is visual polish (PD-8), so it lives here as one value to tune.
const MAX_INPUT_HEIGHT_PX = 160;

// The live text conversation with the persona. Shows the running transcript,
// takes the student's typed replies, and ends the session for scoring.
export function Conversation({
  sessionId,
  personaName,
  scenarioTitle,
  initialTranscript,
  isSubmission = false,
  conversationOnly = false,
  meetingMinutes = DEFAULT_MEETING_MINUTES,
}: {
  sessionId: string;
  personaName: string;
  scenarioTitle: string;
  initialTranscript: TranscriptTurn[];
  // A graded submission ends with an explicit submit-and-score confirmation
  // step (its one official attempt), instead of practice's quick pop-up.
  isSubmission?: boolean;
  // A conversation-only case (its scenario has no rubric) is never scored, so
  // the wording must not promise a score that is not coming.
  conversationOnly?: boolean;
  // How long this assignment's meeting runs (PD-4), already resolved by the
  // session page: it is the assignment's duration_minutes, or 30 when none is
  // set. It is what the practice clock counts up to before auto-ending.
  meetingMinutes?: number;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<TranscriptTurn[]>(initialTranscript);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  // The practice clock reached the assignment's meeting length; the practice is
  // being auto-ended (practice only; never set for a graded submission).
  const [expired, setExpired] = useState(false);
  const autoEndStartedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // PD-6: the message box, so it can be resized to fit what the student typed.
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // SINGLE CONTROL POINT for whether the practice clock is running. The clock is
  // a practice-only feature, so it never runs for a graded submission, and it
  // stops once the practice is ending or the hard stop is reached. Piece 6's
  // pause will stop the clock by AND-ing `&& !paused` here; nothing else changes.
  const clockActive = !isSubmission && !ending && !expired;

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  // PD-6: grow the message box to fit what the student has typed, instead of
  // keeping one line and scrolling the text sideways out of sight. We flatten it
  // back to "auto" first so it can SHRINK too (after a send, or after deleting a
  // line), then set it to the content's own height, capped at the maximum. Past
  // the cap the box stops growing and scrolls inside itself.
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`;
  }, [input]);

  // When the clock reaches the meeting length, end the practice the SAME way the
  // student's End button does (doEnd, which reuses /api/session/end). Fire once,
  // and wait out any in-flight message send first.
  useEffect(() => {
    if (!expired || autoEndStartedRef.current) return;
    if (sending || ending) return;
    autoEndStartedRef.current = true;
    void doEnd();
    // doEnd is intentionally omitted from deps: it is guarded to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, sending, ending]);

  // Submitting the form (the Send button, or Enter). Unchanged behavior; it just
  // hands off to submitMessage so the Enter key can reuse the same path.
  function send(e: React.FormEvent) {
    e.preventDefault();
    void submitMessage();
  }

  // PD-6: the message box is now multi-line, so Enter has to be told what it
  // means. We keep the chat convention the single-line field already had:
  // ENTER SENDS, and SHIFT+ENTER starts a new line. An Enter pressed while the
  // browser is still composing a character (accents, or a Chinese/Japanese/Korean
  // input method) is left alone, so it finishes the word instead of sending.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    void submitMessage();
  }

  async function submitMessage() {
    const text = input.trim();
    // The same guards the Send button already had. `expired` is belt and braces:
    // the box is disabled once the clock runs out, so Enter cannot reach here.
    if (!text || sending || ending || expired) return;

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
      if (!res.ok) throw new Error(data?.error ?? "The customer could not respond.");
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
      conversationOnly
        ? "End this session? You will not be able to add more messages. This practice is not scored."
        : "End this session and see your score? You will not be able to add more messages.",
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
      if (!res.ok)
        throw new Error(
          data?.error ??
            (conversationOnly
              ? "Could not end the session."
              : "Could not score the session."),
        );
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
        <div className="flex items-center gap-3">
          {!isSubmission && (
            <PracticeClock
              active={clockActive}
              autoEndSeconds={meetingMinutes * 60}
              onExpire={() => setExpired(true)}
            />
          )}
          <button
            onClick={requestEnd}
            disabled={ending || sending || expired}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {ending
              ? conversationOnly
                ? "Ending..."
                : "Scoring..."
              : isSubmission
                ? "Submit assignment"
                : "End session"}
          </button>
        </div>
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

      {expired && (
        <p className="mt-2 text-sm text-red-600">
          Time is up. Ending your practice...
        </p>
      )}

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

      {/* PD-6: the message box grows downward as the student types (up to
          MAX_INPUT_HEIGHT_PX, then it scrolls inside itself) so they can see the
          whole message. Send is unchanged: the Send button submits the form, and
          Enter sends while Shift+Enter starts a new line. items-end keeps the
          Send button level with the bottom of the box as it grows. */}
      <form
        onSubmit={send}
        className="mt-3 flex items-end gap-2 border-t border-gray-200 pt-3"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Type your message to ${personaName}...`}
          disabled={ending || expired}
          style={{ maxHeight: `${MAX_INPUT_HEIGHT_PX}px` }}
          className="flex-1 resize-none overflow-y-auto rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || ending || expired || !input.trim()}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
