"use client";

// The instructor's "Create assignment" form. It writes the new assignment row
// directly from the browser using the ordinary (logged-in) Supabase client. The
// database's Row Level Security only lets instructors create assignments, so this
// is safe and mirrors how the "Invite someone" form already works. (Sessions are
// different and are always written by the server; assignments are instructor-
// managed content, like the invite list and scenarios.)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ScenarioOption = {
  id: string;
  title: string;
  persona_name: string;
};

export function CreateAssignmentForm({
  scenarios,
  createdBy,
}: {
  scenarios: ScenarioOption[];
  createdBy: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [requiredMode, setRequiredMode] = useState<"text" | "voice_video">(
    "voice_video",
  );
  const [instructions, setInstructions] = useState("");
  // Both dates are a plain day like "2026-08-14", or empty. Empty means "not
  // set": no due date, and for the available date, available now.
  const [availableDate, setAvailableDate] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  // No scenarios means there is nothing to point an assignment at yet.
  if (scenarios.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-4">
        <h2 className="mb-1 font-medium">Create assignment</h2>
        <p className="text-sm text-gray-500">
          There are no scenarios to assign yet. A scenario (such as the Alex
          discovery call) must exist first.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
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

    const { error } = await supabase.from("assignments").insert({
      title: cleanTitle,
      scenario_id: scenarioId,
      required_mode: requiredMode,
      // Optional fields become null when left blank. A null available_date
      // means the assignment is available now; a null due_at means no due date.
      instructions: instructions.trim() ? instructions.trim() : null,
      available_date: availableDate ? availableDate : null,
      due_at: dueAt ? dueAt : null,
      created_by: createdBy,
    });

    setLoading(false);

    if (error) {
      setIsError(true);
      setMessage("Could not create the assignment. Please try again.");
      return;
    }

    setMessage(`Created "${cleanTitle}".`);
    setTitle("");
    setInstructions("");
    setAvailableDate("");
    setDueAt("");
    // Re-run the instructor page's queries so the new assignment appears below.
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-gray-200 p-4"
    >
      <h2 className="font-medium">Create assignment</h2>

      <div>
        <label className="mb-1 block text-sm text-gray-600">Title</label>
        <input
          type="text"
          required
          placeholder="Bunzl: discovery call with Alex"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-600">Scenario</label>
        <select
          value={scenarioId}
          onChange={(e) => setScenarioId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} (with {s.persona_name})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-600">
          Required mode
        </label>
        <select
          value={requiredMode}
          onChange={(e) =>
            setRequiredMode(e.target.value as "text" | "voice_video")
          }
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="voice_video">Voice + video</option>
          <option value="text">Text</option>
        </select>
        <p className="mt-1 text-xs text-gray-400">
          The mode the graded submission must be done in.
        </p>
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
          Available date (optional)
        </label>
        <input
          type="date"
          value={availableDate}
          onChange={(e) => setAvailableDate(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <p className="mt-1 text-xs text-gray-400">
          Students see this assignment listed but locked until this date. Leave
          blank to make it available now.
        </p>
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

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create assignment"}
      </button>

      {message && (
        <p className={`text-sm ${isError ? "text-red-600" : "text-green-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
