"use client";

// The instructor delete control on an assignment card. It has TWO shapes,
// chosen by whether the assignment has student work (submissions or practices),
// deliberately different because they carry very different stakes:
//
//   NOT in use (0 sessions): a plain "Delete" button opens a simple two-step
//     confirm (like the delete-student and reset controls). Nothing exists under
//     the assignment, so only the empty assignment row is removed.
//
//   IN use (1+ sessions): a red "Delete" button opens a visibly stronger confirm:
//     red styling, a plain warning that it permanently deletes the assignment AND
//     every student's submission and practice under it (including their
//     recordings), a reminder to download anything worth keeping first, AND a
//     deliberate extra step (the instructor must type the word DELETE) before the
//     final button is enabled.
//
// Both POST to /api/instructor/assignment/<id>/delete. The server counts the
// sessions itself and re-decides the path, so these counts are only for display;
// the destructive case sends confirmInUse so the server will proceed. On success
// the page refreshes so the assignment disappears.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

// "1 submission" / "2 submissions", etc.
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function DeleteAssignmentButton({
  assignmentId,
  title,
  submissionsCount,
  practicesCount,
}: {
  assignmentId: string;
  title: string;
  submissionsCount: number;
  practicesCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inUse = submissionsCount + practicesCount > 0;

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/instructor/assignment/${assignmentId}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The destructive (in-use) path requires the explicit acknowledgment.
          body: JSON.stringify({ confirmInUse: inUse }),
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
      <div className="mt-1 rounded-md border border-line-tertiary bg-surface-secondary p-2 text-xs">
        <p className="mb-2 text-content-primary">
          Delete the assignment <span className="font-medium">{title}</span>? It
          has no student submissions or practices, so nothing else is removed.
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
        className="rounded-md border border-red-300 px-2 py-0.5 text-xs text-content-danger hover:bg-surface-danger"
      >
        Delete
      </button>
    );
  }
  return (
    <div className="mt-1 rounded-md border-2 border-red-300 bg-surface-danger p-2 text-xs">
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
