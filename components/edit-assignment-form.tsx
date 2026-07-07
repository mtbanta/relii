"use client";

// The instructor's per-assignment card in the "Assignments" management list. By
// default it shows the assignment read-only (title, scenario, mode, due date,
// instructions). An "Edit" button swaps in an inline form for the three
// LOW-RISK fields only: title, instructions, and due date.
//
// The required mode and the scenario are deliberately NOT editable. Existing
// sessions and scores were graded under them, so changing them after the fact
// would make that work inconsistent. They are shown read-only, with a short note
// explaining why.
//
// Saving writes the row directly from the browser using the ordinary (logged-in)
// Supabase client. The database's "instructors manage assignments" rule (FOR
// ALL) only lets instructors update assignments, so this is safe and mirrors how
// the Create-assignment and Invite forms already write. (Sessions are the
// opposite and are always written by the server; assignments are instructor-
// managed content, like the invite list and scenarios.)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Assignment = {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  required_mode: string;
  scenarioTitle: string | null;
  personaName: string | null;
};

// Friendly mode label (matches the rest of the instructor page).
function modeLabel(mode: string): string {
  return mode === "voice_video" ? "Voice + video" : "Text";
}

// Show a stored timestamp as a plain date. Read in UTC so a date picked as
// "Aug 14" always shows as "Aug 14" (it is stored as midnight UTC).
function formatDueDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Turn a stored timestamp into the "yyyy-mm-dd" value a <input type="date">
// expects. The date is stored as midnight UTC, so the UTC calendar day is the
// one the instructor picked.
function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function EditAssignmentForm({ assignment }: { assignment: Assignment }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  // Form state, seeded from the assignment. Re-seeded whenever we open the form
  // (see startEditing), so Cancel always returns to the saved values.
  const [title, setTitle] = useState(assignment.title);
  const [instructions, setInstructions] = useState(assignment.instructions ?? "");
  const [dueAt, setDueAt] = useState(toDateInputValue(assignment.due_at));
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  function startEditing() {
    // Seed the inputs from the latest saved values, then open the form.
    setTitle(assignment.title);
    setInstructions(assignment.instructions ?? "");
    setDueAt(toDateInputValue(assignment.due_at));
    setMessage("");
    setIsError(false);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setMessage("");
    setIsError(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setIsError(false);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setIsError(true);
      setMessage("Please give the assignment a title.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Only the three low-risk fields are updated. required_mode and scenario_id
    // are intentionally left out, so they can never change here.
    const { error } = await supabase
      .from("assignments")
      .update({
        title: cleanTitle,
        instructions: instructions.trim() ? instructions.trim() : null,
        due_at: dueAt ? dueAt : null,
      })
      .eq("id", assignment.id);

    setLoading(false);

    if (error) {
      setIsError(true);
      setMessage("Could not save the changes. Please try again.");
      return;
    }

    setEditing(false);
    // Re-run the instructor page's queries so the card shows the saved values.
    router.refresh();
  }

  // ---- Read-only view (default) ------------------------------------------
  if (!editing) {
    const due = formatDueDate(assignment.due_at);
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{assignment.title}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {assignment.scenarioTitle ?? "Scenario"}
            {assignment.personaName ? ` (with ${assignment.personaName})` : ""}{" "}
            &middot; {modeLabel(assignment.required_mode)}
            {due ? ` · due ${due}` : ""}
          </p>
          {assignment.instructions && (
            <p className="mt-1.5 text-sm text-gray-600">
              {assignment.instructions}
            </p>
          )}
        </div>
        <button
          onClick={startEditing}
          className="shrink-0 rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
        >
          Edit
        </button>
      </div>
    );
  }

  // ---- Edit view (title, instructions, due date only) --------------------
  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm text-gray-600">Title</label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-600">
          Instructions (optional)
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="Anything the student should know before they start."
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-600">
          Due date (optional)
        </label>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>

      {/* Scenario and mode are fixed. They are shown here read-only so the
          instructor can see them, but there is no way to change them: existing
          sessions and scores were graded under them. */}
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
        <p>
          <span className="font-medium text-gray-600">Scenario:</span>{" "}
          {assignment.scenarioTitle ?? "Scenario"}
          {assignment.personaName ? ` (with ${assignment.personaName})` : ""}
        </p>
        <p className="mt-1">
          <span className="font-medium text-gray-600">Required mode:</span>{" "}
          {modeLabel(assignment.required_mode)}
        </p>
        <p className="mt-1.5">
          The scenario and mode cannot be changed after an assignment is created,
          because students&apos; practices and submissions were done under them.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={cancelEditing}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save changes"}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${isError ? "text-red-600" : "text-green-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
