"use client";

// Deletes one of the student's own kept practices (its row and its recording),
// behind a single confirm click. On success it refreshes the home page so the
// "Saved practices" count and list update. Deleting a practice frees a slot.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePracticeButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/practice/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Could not delete the practice.");
      }
      // The server removed the row and any recording; refresh to update the list.
      router.refresh();
    } catch (err) {
      setBusy(false);
      setConfirming(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      {confirming ? (
        <>
          <button
            onClick={remove}
            disabled={busy}
            className="text-content-danger hover:underline disabled:opacity-50"
          >
            {busy ? "Deleting..." : "Confirm delete"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="text-content-tertiary hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-content-tertiary hover:text-content-danger"
        >
          Delete
        </button>
      )}
      {error && <span className="text-content-danger">{error}</span>}
    </span>
  );
}
