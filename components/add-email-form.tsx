"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

export function AddEmailForm() {
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

    const supabase = createClient();
    const cleanEmail = email.trim().toLowerCase();

    const { error } = await supabase
      .from("allowed_emails")
      .insert({ email: cleanEmail, role });

    setLoading(false);

    if (error) {
      setIsError(true);
      // Code 23505 is a duplicate primary key (email already on the list).
      if (error.code === "23505") {
        setMessage(`${cleanEmail} is already on the invite list.`);
      } else {
        setMessage("Could not add that email. Please try again.");
      }
      return;
    }

    setMessage(`Added ${cleanEmail} as ${role}.`);
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

      <Select
        value={role}
        onChange={(e) => setRole(e.target.value as "student" | "instructor")}
      >
        <option value="student">Student</option>
        <option value="instructor">Instructor</option>
      </Select>

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
