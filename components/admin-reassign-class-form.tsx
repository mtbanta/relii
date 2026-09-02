"use client";

// Hand a class to a different instructor. THE FIRST OPTION ON THE PAGE, and it
// should stay first: it destroys nothing, every student keeps their account,
// their submissions and their recordings, and it is one column changing.
//
// ==> GATE 6 OPENED THE LIST UP. It used to hold only instructors whose own
//     class was EMPTY, because getInstructorClassId() read an instructor's
//     oldest class and stopped, so a second class would silently hide the first.
//     Multi-class replaced that with a working-class picker, so any other
//     instructor can now take a class on and keeps everything they already had.
//
//     THE ONE REMAINING REASON SOMEBODY IS NOT OFFERED is a name clash:
//     `classes` carries unique (instructor_id, name), so an instructor who
//     already has a class with this one's name has to rename one first. The page
//     says which, rather than leaving it a mystery. <==
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
          No instructor can take this on right now. Add an instructor, let them
          register, and they can take it the same day. If somebody is listed
          below as ineligible, the reason is beside their name.
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
