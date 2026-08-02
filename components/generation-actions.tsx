"use client";

// The per-generation controls on the "Recent generations" list.
//
// Which control an entry gets is decided by the state of its candidates, and
// only ONE of the three ever applies, so the admin is never offered an action
// that would be refused:
//
//   LIVE (a candidate is switched on): "Turn off". This is a chosen winner in
//     service. It cannot be discarded while it is on, and turning it off is the
//     step that makes it discardable, so that is the control offered.
//
//   ROLE-PLAYED (switched off, but a student has run it or an assignment points
//     at it): no control, and a short line saying why. A used case can never be
//     deleted; it is already off, so there is nothing left to do to it.
//
//   UNTOUCHED (off and unused): "Discard", behind a simple confirm. This is the
//     ordinary case and the one that clears test litter.
//
// The server re-checks all of this for itself, so these controls decide what to
// SHOW, never what is allowed.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GenerationRowSummary } from "@/lib/scaffold-candidates";
import { Button } from "@/components/ui/button";

export function GenerationActions({
  groupId,
  rows,
}: {
  groupId: string;
  rows: GenerationRowSummary[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"discard" | "disable" | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const liveRow = rows.find((row) => row.enabled) ?? null;
  const usedRow = rows.find((row) => row.used) ?? null;

  async function post(url: string, body: Record<string, unknown>) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "That did not work. Please try again.");
        setLoading(false);
        return;
      }
      router.refresh();
      setConfirming(null);
      setLoading(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  // ---- LIVE: offer Turn off ------------------------------------------------
  if (liveRow) {
    if (confirming !== "disable") {
      return (
        <div className="shrink-0 text-right">
          <span className="mb-1 block text-meta font-medium text-content-success">
            Chosen and ON
          </span>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setConfirming("disable")}
          >
            Turn off
          </Button>
          {error && <p className="mt-1 text-meta text-content-danger">{error}</p>}
        </div>
      );
    }
    return (
      <div className="w-64 shrink-0 rounded-md border border-line-tertiary bg-surface-secondary p-2 text-meta">
        <p className="mb-2 text-content-primary">
          Turn <span className="font-medium">{liveRow.personaName}</span> off? It
          leaves the create-assignment list and no new session can be started
          with it. Existing sessions and their transcripts are untouched, and you
          can turn it back on by choosing it again.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="xs"
            onClick={() => {
              setConfirming(null);
              setError("");
            }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            size="xs"
            onClick={() =>
              post("/api/instructor/scaffold/disable", {
                scenarioId: liveRow.id,
              })
            }
            disabled={loading}
          >
            {loading ? "Turning off..." : "Yes, turn off"}
          </Button>
        </div>
        {error && <p className="mt-2 text-content-danger">{error}</p>}
      </div>
    );
  }

  // ---- ROLE-PLAYED: no delete is possible ---------------------------------
  if (usedRow) {
    return (
      <span className="w-40 shrink-0 text-right text-meta text-content-secondary">
        Role-played, so it cannot be deleted. It is already switched off.
      </span>
    );
  }

  // ---- UNTOUCHED: offer Discard -------------------------------------------
  if (confirming !== "discard") {
    return (
      <div className="shrink-0 text-right">
        <Button
          variant="secondary"
          size="xs"
          onClick={() => setConfirming("discard")}
        >
          Discard
        </Button>
        {error && <p className="mt-1 text-meta text-content-danger">{error}</p>}
      </div>
    );
  }
  return (
    <div className="w-64 shrink-0 rounded-md border border-line-tertiary bg-surface-secondary p-2 text-meta">
      <p className="mb-2 text-content-primary">
        Permanently delete{" "}
        <span className="font-medium">
          {rows.map((row) => row.personaName).join(" and ")}
        </span>
        ? Neither has been used, so nothing else is affected. This cannot be
        undone.
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            setConfirming(null);
            setError("");
          }}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          size="xs"
          onClick={() => post("/api/instructor/scaffold/discard", { groupId })}
          disabled={loading}
        >
          {loading ? "Discarding..." : "Yes, discard"}
        </Button>
      </div>
      {error && <p className="mt-2 text-content-danger">{error}</p>}
    </div>
  );
}
