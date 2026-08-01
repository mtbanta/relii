"use client";

// "Choose this one" on the compare view: the admin picks the winning candidate.
//
// The confirm panel deliberately names BOTH halves of what happens, because the
// action does two things at once and one of them is permanent: the chosen
// persona is switched on and becomes assignable, and the other candidate is
// deleted for good.
//
// The server does all the real work and all the checking (see
// /api/instructor/scaffold/choose). This component only asks, sends the id, and
// reports back what the server says it did, including the case where the other
// candidate had to be kept because something was using it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ChooseCandidateButton({
  candidateId,
  personaName,
  otherPersonaName,
}: {
  candidateId: string;
  personaName: string;
  otherPersonaName: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleChoose() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/instructor/scaffold/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winnerId: candidateId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not choose that candidate.");
        setLoading(false);
        return;
      }
      // Re-read the page from the database. The winner is now switched on, so
      // the page re-renders in its decided state.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        fullWidth
        onClick={() => setConfirming(true)}
      >
        Choose this one
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-line-secondary bg-white p-3 text-xs">
      <p className="mb-2 font-medium text-content-primary">
        Choose {personaName}?
      </p>
      <ul className="mb-3 list-disc space-y-1 pl-4 text-content-primary">
        <li>
          <span className="font-medium">{personaName}</span> is switched on and
          becomes assignable as a conversation-only case (no score).
        </li>
        {otherPersonaName && (
          <li>
            <span className="font-medium">{otherPersonaName}</span> is
            permanently deleted. This cannot be undone.
          </li>
        )}
        <li>Nothing else changes. Alex and Jordan are untouched.</li>
      </ul>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          size="xs"
          onClick={handleChoose}
          disabled={loading}
        >
          {loading ? "Choosing..." : `Yes, choose ${personaName}`}
        </Button>
      </div>
      {error && <p className="mt-2 text-content-danger">{error}</p>}
    </div>
  );
}
