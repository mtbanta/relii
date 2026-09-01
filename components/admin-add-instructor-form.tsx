"use client";

// Add an instructor: one address onto the invite list, as an instructor.
//
// It creates no account. They register at /register like anyone else, and the
// signup rule in the database gives them their own empty class, per locked
// decision 3 (a new instructor starts empty, with no sample content).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label, HelpText } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AddInstructorForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setIsError(false);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/instructor/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data?.error || "Could not add that instructor.");
        setLoading(false);
        return;
      }
      setMessage(data?.message || "Invited.");
      setEmail("");
      setLoading(false);
      router.refresh();
    } catch {
      setIsError(true);
      setMessage("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Card padding="lg">
      <form onSubmit={handleSubmit}>
        <Label htmlFor="new-instructor-email">Add an instructor</Label>
        <div className="mt-1 flex flex-wrap items-start gap-2">
          <Input
            id="new-instructor-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@university.edu"
            fullWidth={false}
            className="w-72"
            autoComplete="off"
          />
          <Button type="submit" disabled={loading || !email}>
            {loading ? "Adding..." : "Add instructor"}
          </Button>
        </div>
        <HelpText>
          Puts the address on the invite list as an instructor. They create their
          own password at the registration page, and get their own empty class
          when they do.
        </HelpText>
        {message && (
          <p
            className={`mt-2 text-body ${
              isError ? "text-content-danger" : "text-content-success"
            }`}
          >
            {message}
          </p>
        )}
      </form>
    </Card>
  );
}
