"use client";

// THE CONSENT GATE FOR ACCOUNTS THAT PREDATE PHASE 5.
//
// Everyone who registers from now on accepts the click-through on the register
// page, and their consent row is written by the signup trigger in the same
// transaction as their account. This gate exists for the handful of accounts
// created before that shipped: with no consent row, the dashboard renders THIS
// in place of itself, so there is nothing else on screen to click until the box
// is ticked. Same shape as components/name-gate.tsx, and it sits BEFORE the name
// gate, because agreeing comes before anything else.
//
// IT IS ALSO THE RE-CONSENT MECHANISM, WHICH IS THE REASON IT IS WORTH ITS SIZE.
// Tom revising a document is a when rather than an if. Today lib/consent.ts asks
// "is there a consent row at all"; widening that to "is there a row for the
// CURRENT versions" is one line, and this gate then collects the new acceptance
// from everyone at their next visit. THAT LINE IS DELIBERATELY NOT WRITTEN YET:
// changing a version constant would block every user until they re-accepted, and
// that is not a lever to leave armed during launch week.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ConsentGate({ email }: { email: string }) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!accepted) {
      setError("Please tick the box to continue.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });

      if (!res.ok) {
        setLoading(false);
        setError("Could not record your acceptance. Please try again.");
        return;
      }

      // Recorded. Refresh so the server re-reads and shows the real dashboard in
      // place of this gate. The button stays disabled through the refresh (this
      // component unmounts once the row exists).
      router.refresh();
    } catch {
      setLoading(false);
      setError(
        "Could not record your acceptance. Please check your connection and try again.",
      );
    }
  }

  return (
    <main className="mx-auto w-full max-w-reading px-6 py-10">
      <h1 className="text-page-title font-medium">Before you continue</h1>
      <p className="mt-2 text-body text-content-secondary">
        Relii is running as a pilot, and we need your agreement to the terms
        before you go on. Please read both documents. You only need to do this
        once.
      </p>
      <p className="mt-1 text-meta text-content-tertiary">Signed in as {email}</p>

      {/* The same short label as the register page, and ours for the same
          reason: the full acknowledgment sentence is Tom's and lives on
          /agreement, where it is shown verbatim. See lib/legal.ts. */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="flex items-start gap-2">
          <input
            id="accept-terms"
            type="checkbox"
            required
            autoFocus
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border border-line-secondary accent-accent-solid"
          />
          <label
            htmlFor="accept-terms"
            className="text-body text-content-secondary"
          >
            I have read and agree to the{" "}
            <Link
              href="/agreement"
              target="_blank"
              rel="noopener noreferrer"
              className="text-content-info underline"
            >
              Pilot Agreement
            </Link>{" "}
            and the{" "}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-content-info underline"
            >
              Privacy Policy
            </Link>
            .
          </label>
        </div>

        <Button type="submit" disabled={loading || !accepted}>
          {loading ? "Saving..." : "Agree and continue"}
        </Button>

        {error && <p className="text-body text-content-danger">{error}</p>}
      </form>
    </main>
  );
}
