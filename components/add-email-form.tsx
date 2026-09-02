"use client";

// SINGLE INVITE: put one address on the invite list for the class you are
// working in.
//
// ==> GATE 6 MOVED THE WRITE TO THE SERVER, AND THAT IS THE WHOLE POINT OF THE
//     CHANGE RATHER THAN A TIDY-UP. This form used to insert into
//     allowed_emails straight from the browser, through Row Level Security. The
//     Gate 3b insert rule is `with check (public.instructs_class(class_id))`,
//     which says nothing whatsoever about `role`. So hiding the Instructor
//     option below would have been a UI deterrent and NOT a rule: anyone with
//     devtools could still post role = 'instructor' and mint an instructor
//     account, which since Gate 4b is a super admin operation.
//
//     A convention enforced by nothing is exactly what Gate 4a threw away the
//     foreign-key-hint fix over. The rule is now held by
//     app/api/instructor/invite/route.ts, and the dropdown below is the
//     courtesy on top of it. <==
//
// TWO OTHER THINGS FOLLOWED FROM THE MOVE. The form no longer receives or sends
// a classId: the route reads the working class from the signed-in session, so
// the browser cannot name a class at all. And the "which of the two duplicate
// situations is this" answer that Gate 4a built (see the route) now runs on the
// server, where it can also name WHICH of your classes already holds the
// address, which the browser could not do.
import { useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

export function AddEmailForm({
  // GATE 6: a super admin keeps the Instructor option. An ordinary instructor
  // does not see it and would be refused by the server if they sent it anyway.
  isSuperAdmin = false,
}: {
  isSuperAdmin?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"student" | "instructor">("student");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setIsError(false);
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    // An ordinary instructor can only ever send "student", whatever the state
    // holds. The server enforces the same thing; this just keeps the two from
    // disagreeing if the option is ever re-shown by mistake.
    const sentRole = isSuperAdmin ? role : "student";

    const res = await fetch("/api/instructor/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, role: sentRole }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setIsError(true);
      setMessage(body?.error ?? "Could not add that email. Please try again.");
      return;
    }

    setMessage(`Added ${cleanEmail} as ${sentRole}.`);
    setEmail("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cardClasses({ className: "space-y-3" })}
    >
      <h2 className="text-card-title font-medium">Invite someone</h2>

      <Input
        type="email"
        required
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      {isSuperAdmin ? (
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as "student" | "instructor")}
        >
          <option value="student">Student</option>
          <option value="instructor">Instructor</option>
        </Select>
      ) : (
        // No dropdown at all rather than a dropdown with one option, for the
        // same reason the class picker is a label when you own one class: a
        // control that cannot change anything invites a click and answers
        // nothing. The sentence says what the form does instead.
        <p className="text-meta text-content-secondary">
          Invites are sent to students. Adding an instructor is an administrator
          action.
        </p>
      )}

      <Button
        type="submit"
        disabled={loading}
      >
        {loading ? "Adding..." : "Add to invite list"}
      </Button>

      {message && (
        <p className={`text-body ${isError ? "text-content-danger" : "text-content-success"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
