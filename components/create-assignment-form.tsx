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
import {
  DEFAULT_MEETING_MINUTES,
  MAX_MEETING_MINUTES,
  MIN_MEETING_MINUTES,
} from "@/lib/meeting-length";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

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
  // How long the meeting runs, as typed. Empty means "not set", which reads as
  // the standard 30 minute meeting.
  const [durationMinutes, setDurationMinutes] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  // No scenarios means there is nothing to point an assignment at yet.
  if (scenarios.length === 0) {
    return (
      <div className={cardClasses()}>
        <h2 className="mb-1 text-card-title font-medium">Create assignment</h2>
        <p className="text-body text-content-secondary">
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

    // The meeting length. Blank is allowed and saves as null, which reads as the
    // standard 30 minute meeting. Anything typed must be a whole number of
    // minutes in range: the browser's number input already limits it, and the
    // database has the same rule, so this is the friendly message in between.
    const typedDuration = durationMinutes.trim();
    let duration: number | null = null;
    if (typedDuration) {
      const parsed = Number(typedDuration);
      if (
        !Number.isInteger(parsed) ||
        parsed < MIN_MEETING_MINUTES ||
        parsed > MAX_MEETING_MINUTES
      ) {
        setIsError(true);
        setMessage(
          `Meeting length must be a whole number of minutes from ${MIN_MEETING_MINUTES} to ${MAX_MEETING_MINUTES}, or left blank for ${DEFAULT_MEETING_MINUTES}.`,
        );
        return;
      }
      duration = parsed;
    }

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.from("assignments").insert({
      title: cleanTitle,
      scenario_id: scenarioId,
      required_mode: requiredMode,
      // Optional fields become null when left blank. A null available_date
      // means the assignment is available now; a null due_at means no due date;
      // a null duration_minutes means the standard 30 minute meeting.
      instructions: instructions.trim() ? instructions.trim() : null,
      available_date: availableDate ? availableDate : null,
      due_at: dueAt ? dueAt : null,
      duration_minutes: duration,
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
    setDurationMinutes("");
    // Re-run the instructor page's queries so the new assignment appears below.
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cardClasses({ className: "space-y-3" })}
    >
      <h2 className="text-card-title font-medium">Create assignment</h2>

      <div>
        <Label className="mb-1">Title</Label>
        <Input
          type="text"
          required
          placeholder="Bunzl: discovery call with Alex"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <Label className="mb-1">Scenario</Label>
        <Select
          value={scenarioId}
          onChange={(e) => setScenarioId(e.target.value)}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} (with {s.persona_name})
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label className="mb-1">
          Required mode
        </Label>
        <Select
          value={requiredMode}
          onChange={(e) =>
            setRequiredMode(e.target.value as "text" | "voice_video")
          }
        >
          <option value="voice_video">Voice + video</option>
          <option value="text">Text</option>
        </Select>
        <p className="mt-1 text-meta text-content-tertiary">
          The mode the graded submission must be done in.
        </p>
      </div>

      <div>
        <Label className="mb-1">
          Meeting length (optional)
        </Label>
        <Input
          type="number"
          inputMode="numeric"
          min={MIN_MEETING_MINUTES}
          max={MAX_MEETING_MINUTES}
          step={1}
          placeholder={String(DEFAULT_MEETING_MINUTES)}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
        />
        <p className="mt-1 text-meta text-content-tertiary">
          How long the role-play runs, from {MIN_MEETING_MINUTES} to{" "}
          {MAX_MEETING_MINUTES} minutes. The practice clock counts up and the
          practice ends automatically at this length. Leave blank for{" "}
          {DEFAULT_MEETING_MINUTES} minutes.
        </p>
      </div>

      <div>
        <Label className="mb-1">
          Instructions (optional)
        </Label>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="Anything the student should know before they start."
        />
      </div>

      <div>
        <Label className="mb-1">
          Available date (optional)
        </Label>
        <Input
          type="date"
          value={availableDate}
          onChange={(e) => setAvailableDate(e.target.value)}
        />
        <p className="mt-1 text-meta text-content-tertiary">
          Students see this assignment listed but locked until this date. Leave
          blank to make it available now.
        </p>
      </div>

      <div>
        <Label className="mb-1">
          Due date (optional)
        </Label>
        <Input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
      >
        {loading ? "Creating..." : "Create assignment"}
      </Button>

      {message && (
        <p className={`text-body ${isError ? "text-content-danger" : "text-content-success"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
