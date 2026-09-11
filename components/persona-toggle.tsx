"use client";

// The On and Off toggle on a CHOSEN persona, in the AI Persona Framework list.
//
// Before Phase 3b the list could only switch a chosen persona OFF. Turning one
// back on meant opening View Persona and pressing "Choose this one" again,
// because a switched-off chosen persona reads as undecided to that page. That
// button renames the persona and deletes the rest of its generation, so it is
// the wrong control for putting a case back into service. Both directions now
// go through their own route, and this is the control in front of them.
//
// THE TOGGLE IS ON THE PERSONA, NOT ON THE GENERATION. Both routes take a
// scenario id. A generation is not a thing that can be switched on, and a
// decided generation can still hold two rows (a losing candidate that survived
// the pick because something was using it), so a per-generation control could
// not say which row it meant.
//
// The server re-checks everything: that the caller owns the class, that the
// persona was made by the framework, that it is the chosen one, and that no
// other row in its generation is already on. This decides what to SHOW, never
// what is allowed.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// "HVAC Alex - trial close" or "One, Two and Three", for the Used by line.
function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles.join("");
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

export function PersonaToggle({
  scenarioId,
  groupId,
  personaName,
  enabled,
  assignmentTitles,
  canDiscard,
  usedNote,
}: {
  scenarioId: string;
  groupId: string;
  personaName: string;
  enabled: boolean;
  // Assignment titles in THIS class that point at this persona. Class scoped in
  // lib/scaffold-candidates.ts, because this puts titles on screen.
  assignmentTitles: string[];
  // Off, and nothing in its generation has been role-played, so the whole
  // generation can be deleted. Decided on the server; the discard route checks
  // it again for itself.
  canDiscard: boolean;
  // Set when the persona has been role-played, which is why it cannot be
  // deleted. Shown instead of a Discard button.
  usedNote: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"on" | "off" | "discard" | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  // The one sentence both confirms share. The wording was checked against the
  // code rather than assumed: the three start routes read scenarios.enabled and
  // refuse, but app/api/practice/submit/route.ts reads only the assignment, so
  // a finished practice can still be submitted for a grade after the persona is
  // switched off. An earlier draft of this confirm claimed otherwise.
  const usedBy =
    assignmentTitles.length > 0
      ? `Used by: ${joinTitles(assignmentTitles)}.`
      : "No assignment uses it yet.";

  // ---- The confirm panels --------------------------------------------------
  if (confirming === "off" || confirming === "on") {
    const turningOff = confirming === "off";
    return (
      <div className="w-72 shrink-0 rounded-md border border-line-tertiary bg-surface-secondary p-2 text-meta">
        <p className="mb-2 text-content-primary">
          {turningOff ? (
            <>
              Turn <span className="font-medium">{personaName}</span> off? No one
              can start a new practice with it. Students still see its
              assignments, can open practices they have already finished, and can
              still submit one of those for a grade. {usedBy} You can turn it
              back on here at any time.
            </>
          ) : (
            <>
              Turn <span className="font-medium">{personaName}</span> back on?
              Students can start new practices with it again. {usedBy}
            </>
          )}
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
              post(
                turningOff
                  ? "/api/instructor/scaffold/disable"
                  : "/api/instructor/scaffold/enable",
                { scenarioId },
              )
            }
            disabled={loading}
          >
            {loading
              ? turningOff
                ? "Turning off..."
                : "Turning on..."
              : turningOff
                ? "Yes, turn off"
                : "Yes, turn on"}
          </Button>
        </div>
        {error && <p className="mt-2 text-content-danger">{error}</p>}
      </div>
    );
  }

  if (confirming === "discard") {
    return (
      <div className="w-72 shrink-0 rounded-md border border-line-tertiary bg-surface-secondary p-2 text-meta">
        <p className="mb-2 text-content-primary">
          Permanently delete <span className="font-medium">{personaName}</span>?
          It is switched off and nothing has used it, so nothing else is
          affected. This cannot be undone.
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

  // ---- The resting state: what it is, and the one control that applies ------
  return (
    <div className="w-44 shrink-0 text-right">
      <span
        className={
          enabled
            ? "mb-1 block text-meta font-medium text-content-success"
            : "mb-1 block text-meta font-medium text-content-secondary"
        }
      >
        {enabled ? "Chosen and ON" : "Chosen and OFF"}
      </span>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() => setConfirming(enabled ? "off" : "on")}
        >
          {enabled ? "Turn off" : "Turn on"}
        </Button>
        {canDiscard && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setConfirming("discard")}
          >
            Discard
          </Button>
        )}
      </div>
      {!enabled && usedNote && (
        <p className="mt-1 text-meta text-content-secondary">
          Role-played, so it cannot be deleted.
        </p>
      )}
      {error && <p className="mt-1 text-meta text-content-danger">{error}</p>}
    </div>
  );
}
