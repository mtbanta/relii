"use client";

// GATE 6. Adds a student who ALREADY HAS AN ACCOUNT to the class you are working
// in. It sits on the Roster, beside the list of who is in the class.
//
// It is the other half of Invite Users, and the two do not overlap: an invite is
// for somebody who has not signed up yet, this is for somebody who has. Before
// this piece the second case had no path at all, which is what made a student in
// no class unrecoverable and drove Gate 4b's ruling that a class delete has to
// delete the student accounts rather than orphan them.
//
// Every rule lives in the route (app/api/instructor/add-student/route.ts),
// including the one that refuses to move a student who has already done work.
// This form types an address and shows what the server said.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

export function AddExistingStudentForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    const res = await fetch("/api/instructor/add-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setIsError(true);
      setMessage(body?.error ?? "Could not add that student.");
      return;
    }

    setMessage(body?.message ?? "Done.");
    setEmail("");
    // Refresh so the Roster's own lists show the change straight away.
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className={cardClasses({ className: "space-y-3" })}>
      <h3 className="text-card-title font-medium">Add an existing student</h3>
      <p className="text-meta text-content-secondary">
        For somebody who already has a Relii account. A student is in one class at
        a time, so this moves them out of their current class and into this one.
        It is refused if they have already done any role-plays there, because
        their past work would stay behind and they would lose access to their own
        results.
      </p>
      <div>
        <Label className="mb-1">Student email</Label>
        <Input
          type="email"
          required
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={loading}>
        {loading ? "Adding..." : "Add to this class"}
      </Button>
      {message && (
        <p className={`text-body ${isError ? "text-content-danger" : "text-content-success"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
