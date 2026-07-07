"use client";

// One pending-invite row with a short, single-step confirmation. It shows a role
// tag, the invited email, and an Un-invite button; clicking it swaps in a brief
// confirm that names the email and requires one more click. This is low stakes
// (a pending invite has no account, sessions, or videos, so nothing is deleted
// but the one invite-list row), so it deliberately does NOT use the heavier
// delete-student confirmation. On success it refreshes the page so the removed
// invite drops off the roster.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function UninviteButton({
  email,
  role,
}: {
  email: string;
  role: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUninvite() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/instructor/uninvite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not remove that invite.");
        setLoading(false);
        return;
      }
      // Re-run the roster query so this pending invite disappears.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const roleLabel = role === "instructor" ? "Instructor" : "Student";

  // Resting state: role tag, email, and a small Un-invite button on the right.
  if (!confirming) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {roleLabel}
        </span>
        <span className="flex-1">{email}</span>
        <button
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
        >
          Un-invite
        </button>
      </div>
    );
  }

  // Confirmation state: name the email, require one more click.
  return (
    <div className="text-sm">
      <p className="mb-2 text-gray-700">
        Remove <span className="font-medium">{email}</span> from the invite list?
        They will no longer be able to register.
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
          onClick={handleUninvite}
          disabled={loading}
          className="rounded-md bg-gray-800 px-3 py-1 text-white hover:bg-gray-900 disabled:opacity-50"
        >
          {loading ? "Removing..." : "Yes, un-invite"}
        </button>
      </div>
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
