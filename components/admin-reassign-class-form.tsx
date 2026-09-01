"use client";

// Hand a class to a different instructor. THE FIRST OPTION ON THE PAGE, and it
// should stay first: it destroys nothing, every student keeps their account,
// their submissions and their recordings, and it is one column changing.
//
// WHY THE LIST OF PEOPLE IS SO SHORT, and the page says so rather than leaving
// it a mystery: an instructor can only take on a class if their own class is
// empty. Relii gives each instructor a single class and reads it as their oldest
// one, so somebody holding two would silently see the wrong one. Their empty
// class is deleted as part of the handover, leaving them with exactly one again.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, Label, HelpText } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type ReassignCandidate = {
  id: string;
  email: string;
  eligible: boolean;
  reason: string;
};

export function ReassignClassForm({
  classId,
  classLabel,
  candidates,
}: {
  classId: string;
  classLabel: string;
  candidates: ReassignCandidate[];
}) {
  const router = useRouter();
  const eligible = candidates.filter((c) => c.eligible);
  const blocked = candidates.filter((c) => !c.eligible);

  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleReassign(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);
    try {
      const res = await fetch(`/api/admin/class/${classId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toInstructorId: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data?.error || "Could not hand over the class.");
        setLoading(false);
        return;
      }
      setMessage(data?.message || "Done.");
      setLoading(false);
      router.refresh();
    } catch {
      setIsError(true);
      setMessage("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Card padding="lg" className="mb-5">
      <p className="text-card-title font-medium text-content-primary">
        Hand this class to another instructor
      </p>
      <p className="mt-1 max-w-reading text-meta text-content-secondary">
        Nothing is deleted. Every student, assignment, persona, submission and
        recording in &quot;{classLabel}&quot; stays exactly as it is, with a new
        owner. If an instructor is leaving and their students still need their
        work, this is the answer rather than the deletion below.
      </p>

      {eligible.length === 0 ? (
        <p className="mt-3 text-meta text-content-secondary">
          No instructor can take this on right now. A class can only go to an
          instructor whose own class is empty, because Relii gives each
          instructor a single class and would otherwise show them the wrong one.
          Add an instructor, let them register, and they can take it the same
          day.
        </p>
      ) : (
        <form onSubmit={handleReassign} className="mt-3">
          <Label htmlFor="reassign-target">New owner</Label>
          <div className="mt-1 flex flex-wrap items-start gap-2">
            <Select
              id="reassign-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              fullWidth={false}
              className="w-72"
              required
            >
              <option value="">Choose an instructor</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.email}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={loading || !target}>
              {loading ? "Handing over..." : "Hand over the class"}
            </Button>
          </div>
          <HelpText>
            Their own empty class is removed as part of this, so they end up with
            one class: this one.
          </HelpText>
        </form>
      )}

      {blocked.length > 0 && (
        <p className="mt-3 text-meta text-content-tertiary">
          Not available:{" "}
          {blocked.map((c) => `${c.email} (${c.reason})`).join("; ")}.
        </p>
      )}

      {message && (
        <p
          className={`mt-2 text-body ${
            isError ? "text-content-danger" : "text-content-success"
          }`}
        >
          {message}
        </p>
      )}
    </Card>
  );
}
