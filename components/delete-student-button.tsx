"use client";

// One roster row with a built-in two-step confirmation. It shows the student's
// name (with their email beneath) and a Delete button; clicking Delete expands an
// inline panel that spells out exactly what will be removed and requires a
// second, explicit click. On success it refreshes the page so the deleted
// student drops off the roster.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteStudentButton({
  studentId,
  email,
  name,
}: {
  studentId: string;
  email: string;
  // The student's display name. Falls back to the email when no name is set, in
  // which case only the email is shown (never the email twice).
  name?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // A real name is one that is set and different from the email (displayName
  // returns the email as its fallback).
  const hasRealName = Boolean(name && name !== email);
  const label = hasRealName ? `${name} (${email})` : email;

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

  // Resting state: the student's name (email beneath) on the left, a small
  // Delete button on the right.
  if (!confirming) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-body">{name || email}</span>
          {hasRealName && (
            <span className="block text-meta text-content-tertiary">{email}</span>
          )}
        </span>
        <button
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-md border border-red-300 px-3 py-1 text-body text-content-danger hover:bg-surface-danger"
        >
          Delete
        </button>
      </div>
    );
  }

  // Confirmation state: spell out what gets removed, require a second click.
  return (
    <div className="text-body">
      <p className="mb-2 text-content-danger">
        Delete <span className="font-medium">{label}</span>? This permanently
        removes their account, all of their sessions, all of their recorded
        videos, and their invite-list entry. This cannot be undone.
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? "Deleting..." : "Yes, permanently delete"}
        </Button>
      </div>
      {error && <p className="mt-2 text-content-danger">{error}</p>}
    </div>
  );
}
