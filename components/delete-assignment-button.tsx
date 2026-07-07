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
        <button
          onClick={() => setConfirming(true)}
          className="rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
        >
          Delete
        </button>
      );
    }
    return (
      <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
        <p className="mb-2 text-gray-700">
          Delete the assignment <span className="font-medium">{title}</span>? It
          has no student submissions or practices, so nothing else is removed.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={cancel}
            disabled={loading}
            className="rounded-md border border-gray-300 px-2 py-0.5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="rounded-md bg-gray-800 px-2 py-0.5 text-white hover:bg-black disabled:opacity-50"
          >
            {loading ? "Deleting..." : "Yes, delete"}
          </button>
        </div>
        {error && <p className="mt-2 text-red-700">{error}</p>}
      </div>
    );
  }

  // ---- Case 2: in use (high stakes) --------------------------------------
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
    );
  }
  return (
    <div className="mt-1 rounded-md border-2 border-red-300 bg-red-50 p-2 text-xs">
      <p className="mb-1 font-semibold text-red-800">
        Permanently delete an assignment with student work
      </p>
      <p className="mb-2 text-red-800">
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
      <p className="mb-2 text-red-700">
        If you want to keep any submission, download its Video, Transcript, or CSV
        from the Submissions table above BEFORE you continue.
      </p>
      <label className="mb-2 block text-red-800">
        Type <span className="font-mono font-semibold">DELETE</span> to confirm:
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-1 block w-32 rounded-md border border-red-300 bg-white px-2 py-0.5 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={cancel}
          disabled={loading}
          className="rounded-md border border-gray-300 px-2 py-0.5 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={loading || typed !== "DELETE"}
          className="rounded-md bg-red-600 px-2 py-0.5 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Deleting..." : "Permanently delete assignment and all work"}
        </button>
      </div>
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
