"use client";

// The per-generation control on an UNDECIDED candidate pair.
//
// PHASE 3b NARROWED THIS COMPONENT. It used to serve the single "Recent
// generations" list and carried three states, one of which was a chosen persona
// that is switched on. The list is now two sections, and a chosen persona has
// its own control (components/persona-toggle.tsx) because the toggle acts on a
// persona while a discard acts on a whole generation. What is left here is the
// undecided case only:
//
//   ROLE-PLAYED (a student has run one of the candidates, or an assignment
//     points at one): no control, and a short line saying why. A used case can
//     never be deleted, and both candidates are already switched off, so there
//     is nothing left to do to it.
//
//   UNTOUCHED: "Discard", behind a simple confirm. This is the ordinary case
//     and the one that clears test litter.
//
// The server re-checks all of this for itself, so these controls decide what to
// SHOW, never what is allowed.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonaListRow } from "@/lib/scaffold-candidates";
import { Button } from "@/components/ui/button";

export function GenerationActions({
  groupId,
  rows,
}: {
  groupId: string;
  rows: PersonaListRow[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      setConfirming(false);
      setLoading(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
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
  if (!confirming) {
    return (
      <div className="shrink-0 text-right">
        <Button variant="secondary" size="xs" onClick={() => setConfirming(true)}>
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
            setConfirming(false);
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
