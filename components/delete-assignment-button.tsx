"use client";

// The instructor delete control on an assignment card. It has TWO shapes,
// chosen by whether the assignment holds any FINISHED student work,
// deliberately different because they carry very different stakes:
//
//   NO finished work: a plain "Delete" button opens a simple two-step confirm
//     (like the delete-student and reset controls).
//
//   ANY finished work: a red "Delete" button opens a visibly stronger confirm:
//     red styling, a plain warning that it permanently deletes the assignment AND
//     every student's submission and practice under it (including their
//     recordings), a reminder to download anything worth keeping first, AND a
//     deliberate extra step (the instructor must type the word DELETE) before the
//     final button is enabled.
//
// ==> PHASE 3a CHANGED WHERE THE LINE IS DRAWN, AND THE PLAIN CONFIRM IS NO
//     LONGER ALWAYS HARMLESS. It used to be "0 sessions" versus "1 or more".
//     Now an assignment whose only sessions are UNFINISHED (abandoned, or a
//     practice whose scoring failed) takes the plain confirm too, because a
//     rubric can never be replaced on an existing assignment and one invisible
//     session used to block the only repair path there is.
//
//     SO THE PLAIN CONFIRM HAS TWO TEXTS. It must never keep saying "nothing
//     else is removed" when rows and recordings are in fact about to go. The
//     second text says what will be destroyed, and says that one of those
//     practices may be a student who is mid-conversation this minute, because
//     an in_progress practice counts as unfinished and that is exactly what it
//     might be. <==
//
// Both POST to /api/instructor/assignment/<id>/delete. The server re-counts and
// re-decides from its own read, so these numbers are only for display; the
// destructive case sends confirmInUse so the server will proceed. On success the
// page refreshes so the assignment disappears.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { plainDeleteApplies, type SessionTally } from "@/lib/assignment-sessions";

// "1 submission" / "2 submissions", etc.
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function DeleteAssignmentButton({
  assignmentId,
  title,
  // ==> ONE OBJECT, NOT FOUR LOOSE NUMBERS, AND THE REASON IS DRIFT RATHER THAN
  //     TIDINESS. The page computes this tally with the shared rule; if this
  //     component received the parts separately it would be free to recombine
  //     them into a slightly different question from the one the page answered
  //     and the route enforces. It arrives whole and is asked exactly one
  //     question, by the same function all three callers use. <==
  tally,
}: {
  assignmentId: string;
  title: string;
  tally: SessionTally;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { submissions: submissionsCount, practices: practicesCount } = tally;
  const plainDelete = plainDeleteApplies(tally);
  const inUse = !plainDelete;

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/instructor/assignment/${assignmentId}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The acknowledgment is sent only when the strong confirm was the one
          // shown, which is exactly when finished work exists. Sending it on the
          // plain path would hand the server a claim this screen never asked the
          // instructor to make.
          body: JSON.stringify({ confirmInUse: !plainDelete }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not delete that assignment.");
        setLoading(false);
        return;
      }
      // Re-run the instructor page's queries so the assignment disappears.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function cancel() {
    setConfirming(false);
    setTyped("");
    setError("");
  }

  // ---- Case 1: not in use (low stakes) -----------------------------------
  if (!inUse) {
    if (!confirming) {
      return (
        <Button
          variant="secondary"
          size="xs"
          onClick={() => setConfirming(true)}
        >
          Delete
        </Button>
      );
    }
    return (
      <div className="mt-1 rounded-md border border-line-tertiary bg-surface-secondary p-2 text-meta">
        <p className="mb-2 text-content-primary">
          {tally.unfinished === 0 ? (
            <>
              Delete the assignment <span className="font-medium">{title}</span>?
              It has no student submissions or practices, so nothing else is
              removed.
            </>
          ) : (
            <>
              Delete the assignment <span className="font-medium">{title}</span>?
              It has {plural(tally.unfinished, "unfinished practice")} and no
              finished student work. An unfinished practice was started but never
              scored. Deleting removes those practices and any recording with
              them, including one a student may still be in.
            </>
          )}
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
            size="xs"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Yes, delete"}
          </Button>
        </div>
        {error && <p className="mt-2 text-content-danger">{error}</p>}
      </div>
    );
  }

  // ---- Case 2: in use (high stakes) --------------------------------------
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-300 px-2 py-0.5 text-meta text-content-danger hover:bg-surface-danger"
      >
        Delete
      </button>
    );
  }
  return (
    <div className="mt-1 rounded-md border-2 border-red-300 bg-surface-danger p-2 text-meta">
      <p className="mb-1 font-semibold text-content-danger">
        Permanently delete an assignment with student work
      </p>
      <p className="mb-2 text-content-danger">
        This deletes the assignment <span className="font-medium">{title}</span>{" "}
        AND every student&apos;s work under it:{" "}
        <span className="font-medium">
          {plural(submissionsCount, "submission")}
        </span>{" "}
        and{" "}
        <span className="font-medium">
          {plural(practicesCount, "practice")}
        </span>
        , including their recordings. This cannot be undone.
      </p>
      <p className="mb-2 text-content-danger">
        If you want to keep any submission, download its Video, Transcript, or CSV
        from the Submissions table above BEFORE you continue.
      </p>
      <label className="mb-2 block text-content-danger">
        Type <span className="font-mono font-semibold">DELETE</span> to confirm:
        <Input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          size="xs"
          tone="danger"
          fullWidth={false}
          className="mt-1 block w-32 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
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
          onClick={handleDelete}
          disabled={loading || typed !== "DELETE"}
        >
          {loading ? "Deleting..." : "Permanently delete assignment and all work"}
        </Button>
      </div>
      {error && <p className="mt-2 text-content-danger">{error}</p>}
    </div>
  );
}
