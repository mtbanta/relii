"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
      className="space-y-3 rounded-lg border border-gray-200 p-4"
    >
      <h2 className="font-medium">Invite someone</h2>

      <input
        type="email"
        required
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      />

      <select
        value={role}
        onChange={(e) => setRole(e.target.value as "student" | "instructor")}
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      >
        <option value="student">Student</option>
        <option value="instructor">Instructor</option>
      </select>

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {loading ? "Adding..." : "Add to invite list"}
      </button>

      {message && (
        <p className={`text-sm ${isError ? "text-red-600" : "text-green-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
