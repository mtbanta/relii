"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

// GATE 4a. WHICH OF TWO SITUATIONS THE DUPLICATE ACTUALLY IS, ANSWERED BY ONE
// EXTRA READ RATHER THAN GUESSED AT IN THE WORDING.
//
// allowed_emails.email is the PRIMARY KEY, so an address exists at most once
// across the whole system rather than once per class. That is deliberate: an
// address belongs to exactly one instructor's invite list.
//
// Before Gate 3b, "already on the invite list" was a complete answer, because
// there was one list and every instructor could see all of it. After Gate 3b the
// Roster shows only YOUR class, so that sentence became a dead end for the case
// where somebody else holds the invite: it points at a list the reader cannot
// see and offers nothing to do next.
//
// ==> WHY A READ AND NOT JUST BETTER WORDING. A sentence like "if they are not
//     on your Roster, another instructor invited them" is true in both cases and
//     still makes the reader do the diagnosis, just with better manners. The
//     whole point of this fix is that the app should do the diagnosis. One read
//     on a failure path, for about thirty people, is not a cost worth optimising
//     against a message that is simply correct. <==
//
// HOW THE READ ANSWERS IT WITHOUT ANY CLASS COMPARISON HERE: since Gate 3b the
// read rule on allowed_emails is public.instructs_class(class_id), so this
// browser read can only ever return rows from a class this instructor owns. A
// row comes back: it is yours. Nothing comes back: it exists (the insert just
// said so) and it is not yours.
//
// IT NEVER NAMES THE OTHER INSTRUCTOR OR THEIR CLASS. Knowing that an invite
// exists elsewhere is what lets you act on it; knowing who holds it is not, and
// this page has no business leaking it.
async function duplicateInviteMessage(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("allowed_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    // The lookup itself failed, so we genuinely do not know which case this is.
    // Say only what is certain rather than asserting the wrong one.
    return `${email} has already been invited. If they are not on your Roster, ask your administrator.`;
  }
  if (data) {
    return `${email} is already on your invite list.`;
  }
  return `${email} was invited by another instructor, so they cannot be invited again. Ask your administrator.`;
}

export function AddEmailForm({
  classId,
}: {
  // GATE 3a: the class this invite belongs to, handed down by the page from
  // requireInstructor(). Setting it here is what gives the student a class
  // MEMBERSHIP row when they register: the signup rule in the database reads
  // class_id off the invite. An invite with no class produced a student in no
  // class at all, which is the hole this closes.
  classId: string | null;
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

    // GATE 3a: no class, no invite. An invite with no class produces a student
    // with no class membership, who then sees an empty dashboard. Refusing here
    // turns that silent outcome into a readable message.
    if (!classId) {
      setIsError(true);
      setMessage(
        "Your instructor account is not linked to a class, so invites cannot be sent. Please contact support.",
      );
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const cleanEmail = email.trim().toLowerCase();

    // GATE 3a, write path 2 of 9. class_id is what the signup rule reads to put
    // this person in a class the moment they register.
    const { error } = await supabase
      .from("allowed_emails")
      .insert({ email: cleanEmail, role, class_id: classId });

    if (error) {
      // Code 23505 is a duplicate primary key: this address is already in
      // allowed_emails SOMEWHERE, which is not the same as being on YOUR list.
      const text =
        error.code === "23505"
          ? await duplicateInviteMessage(supabase, cleanEmail)
          : "Could not add that email. Please try again.";
      setLoading(false);
      setIsError(true);
      setMessage(text);
      return;
    }

    setLoading(false);
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
