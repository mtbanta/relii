"use client";

// One roster row with a built-in two-step confirmation. It shows the student's
// email and a Delete button; clicking Delete expands an inline panel that spells
// out exactly what will be removed and requires a second, explicit click. On
// success it refreshes the page so the deleted student drops off the roster.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteStudentButton({
  studentId,
  email,
}: {
  studentId: string;
  email: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/instructor/delete-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not delete that student.");
        setLoading(false);
        return;
      }
      // Re-run the roster query so this student disappears from the list.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  // Resting state: email on the left, a small Delete button on the right.
  if (!confirming) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{email}</span>
        <button
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    );
  }

  // Confirmation state: spell out what gets removed, require a second click.
  return (
    <div className="text-sm">
      <p className="mb-2 text-red-800">
        Delete <span className="font-medium">{email}</span>? This permanently
        removes their account, all of their sessions, all of their recorded
        videos, and their invite-list entry. This cannot be undone.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Deleting..." : "Yes, permanently delete"}
        </button>
      </div>
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
