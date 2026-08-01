"use client";

// The required name gate. The first time a user (student OR instructor) reaches
// their dashboard with no name set, the dashboard renders THIS in place of
// itself, so the whole page (a student's Practice buttons, an instructor's
// controls) is not shown until a first and last name are entered. That is what
// makes it blocking: there is nothing else on screen to click.
//
// On save it posts to /api/profile/name (the only name write path) and then
// refreshes the page. The server re-reads the profile, now sees a name, and
// renders the real dashboard, so the gate does not return on later visits.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function NameGate({ email }: { email: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      setError("Please enter both your first and last name.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/profile/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: first, lastName: last }),
      });

      if (!res.ok) {
        setLoading(false);
        setError("Could not save your name. Please try again.");
        return;
      }

      // Saved. Refresh so the server re-reads the profile and shows the real
      // dashboard in place of this gate. Keep the button disabled through the
      // refresh (this component unmounts once the name is set).
      router.refresh();
    } catch {
      setLoading(false);
      setError(
        "Could not save your name. Please check your connection and try again.",
      );
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-page-title font-semibold">Welcome to Relii</h1>
      <p className="mt-2 text-sm text-content-secondary">
        Before you continue, please tell us your name. This is how your
        instructor will see your work. You only need to do this once.
      </p>
      <p className="mt-1 text-xs text-content-tertiary">Signed in as {email}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="first-name">
            First name
          </label>
          <Input
            id="first-name"
            type="text"
            required
            autoFocus
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)} className="mt-1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="last-name">
            Last name
          </label>
          <Input
            id="last-name"
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)} className="mt-1"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
        >
          {loading ? "Saving..." : "Save and continue"}
        </Button>

        {error && <p className="text-sm text-content-danger">{error}</p>}
      </form>
    </main>
  );
}
