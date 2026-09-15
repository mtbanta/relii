"use client";

// The instructor's per-assignment card in the "Assignments" management list. By
// default it shows the assignment read-only (title, scenario, mode, available
// and due dates, instructions). An "Edit" button swaps in an inline form for the
// LOW-RISK fields only: title, instructions, available date, and due date.
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
import {
  DEFAULT_MEETING_MINUTES,
  MAX_MEETING_MINUTES,
  MIN_MEETING_MINUTES,
  resolveMeetingMinutes,
} from "@/lib/meeting-length";
import { PERSONA_VOICES, resolvePersonaVoice } from "@/lib/persona-voice";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Assignment = {
  id: string;
  title: string;
  // company_name is the buyer's company for this assignment (PD-8g). Null means
  // none was named, which is what every assignment created before it has.
  company_name: string | null;
  instructions: string | null;
  due_at: string | null;
  // available_date is when the assignment unlocks for students. Null means
  // available now.
  available_date: string | null;
  // duration_minutes is how long the role-play meeting runs (PD-4). Null means
  // the standard 30 minute meeting.
  duration_minutes: number | null;
  // voice is which of the two voices the persona speaks in (T1). Null means
  // cedar, which is what every assignment created before it has.
  voice: string | null;
  required_mode: string;
  scenarioTitle: string | null;
  personaName: string | null;
};

// Friendly mode label (matches the rest of the instructor page).
function modeLabel(mode: string): string {
  return mode === "voice_video" ? "Voice + video" : "Text";
}

// Show a stored timestamp as a plain date. Read in UTC so a date picked as
// "Aug 14" always shows as "Aug 14" (it is stored as midnight UTC). Used for
// both the due date and the available date, which are stored the same way.
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
  const [companyName, setCompanyName] = useState(assignment.company_name ?? "");
  const [instructions, setInstructions] = useState(assignment.instructions ?? "");
  const [availableDate, setAvailableDate] = useState(
    toDateInputValue(assignment.available_date),
  );
  const [dueAt, setDueAt] = useState(toDateInputValue(assignment.due_at));
  // The meeting length as typed. Empty means "not set", which reads as the
  // standard 30 minute meeting.
  const [durationMinutes, setDurationMinutes] = useState(
    assignment.duration_minutes === null
      ? ""
      : String(assignment.duration_minutes),
  );
  // The persona voice (T1). There is no blank state here: an empty stored voice
  // already MEANS cedar, so the dropdown shows cedar and saving writes it out
  // explicitly. That turns a null into 'cedar' on an old assignment, which is
  // an owner ruling of 2026-09-15 and changes nothing about how it sounds.
  const [voice, setVoice] = useState<string>(
    resolvePersonaVoice(assignment.voice),
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  function startEditing() {
    // Seed the inputs from the latest saved values, then open the form.
    setTitle(assignment.title);
    setCompanyName(assignment.company_name ?? "");
    setInstructions(assignment.instructions ?? "");
    setAvailableDate(toDateInputValue(assignment.available_date));
    setDueAt(toDateInputValue(assignment.due_at));
    setDurationMinutes(
      assignment.duration_minutes === null
        ? ""
        : String(assignment.duration_minutes),
    );
    setVoice(resolvePersonaVoice(assignment.voice));
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

    // Only the low-risk fields are updated. required_mode and scenario_id are
    // intentionally left out, so they can never change here. Clearing the
    // available date sets it back to null, which means available now; clearing
    // the meeting length sets it back to null, which means 30 minutes.
    const { error } = await supabase
      .from("assignments")
      .update({
        title: cleanTitle,
        // Clearing the company name sets it back to null, the same way clearing
        // a date does.
        company_name: companyName.trim() ? companyName.trim() : null,
        instructions: instructions.trim() ? instructions.trim() : null,
        available_date: availableDate ? availableDate : null,
        due_at: dueAt ? dueAt : null,
        duration_minutes: duration,
        // Always one of the two known voices, never null: an empty voice
        // already meant cedar, so writing it out changes nothing audible.
        voice: resolvePersonaVoice(voice),
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
    const available = formatDueDate(assignment.available_date);
    // The meeting length is always shown, including for an assignment with none
    // set: null is not "no meeting length", it is the standard 30 minutes, so
    // showing the effective number means the instructor never has to guess what
    // an empty field does. (The dates are different: an empty date genuinely
    // means there is no such date, so those stay hidden when unset.)
    const meetingMinutes = resolveMeetingMinutes(assignment.duration_minutes);
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-medium">{assignment.title}</p>
          {/* PD-8g: the company, on its own line directly under the title,
              rather than appended to the detail line below. That line is
              already six facts long, and the company is the one thing on this
              card an instructor scans for. Hidden when unset, the same way the
              dates are: no company named is genuinely no company, not a
              default. */}
          {assignment.company_name && (
            <p className="mt-0.5 text-meta text-content-secondary">
              Company: {assignment.company_name}
            </p>
          )}
          <p className="mt-0.5 text-meta text-content-secondary">
            {assignment.scenarioTitle ?? "Scenario"}
            {assignment.personaName ? ` (with ${assignment.personaName})` : ""}{" "}
            &middot; {modeLabel(assignment.required_mode)}
            {` · ${meetingMinutes} min meeting`}
            {available ? ` · available ${available}` : ""}
            {due ? ` · due ${due}` : ""}
          </p>
          {assignment.instructions && (
            <p className="mt-1.5 text-body text-content-secondary">
              {assignment.instructions}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="xs"
          className="shrink-0"
          onClick={startEditing}
        >
          Edit
        </Button>
      </div>
    );
  }

  // ---- Edit view (title, instructions, due date only) --------------------
  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div>
        <Label className="mb-1">Title</Label>
        <Input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <Label className="mb-1">Company name (optional)</Label>
        <Input
          type="text"
          placeholder="Bunzl"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
        <p className="mt-1 text-meta text-content-tertiary">
          The company the buyer works for in this role-play. Leave blank for
          none.
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
        <Label className="mb-1">Voice</Label>
        <Select value={voice} onChange={(e) => setVoice(e.target.value)}>
          {PERSONA_VOICES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-meta text-content-tertiary">
          The voice the persona speaks in during a voice and video role-play.
          This changes how the role-play sounds, not what the persona says.
        </p>
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

      {/* Scenario and mode are fixed. They are shown here read-only so the
          instructor can see them, but there is no way to change them: existing
          sessions and scores were graded under them. */}
      <div className="rounded-md border border-line-tertiary bg-surface-secondary p-3 text-meta text-content-secondary">
        <p>
          <span className="font-medium text-content-secondary">Scenario:</span>{" "}
          {assignment.scenarioTitle ?? "Scenario"}
          {assignment.personaName ? ` (with ${assignment.personaName})` : ""}
        </p>
        <p className="mt-1">
          <span className="font-medium text-content-secondary">Required mode:</span>{" "}
          {modeLabel(assignment.required_mode)}
        </p>
        <p className="mt-1.5">
          The scenario and mode cannot be changed after an assignment is created,
          because students&apos; practices and submissions were done under them.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={cancelEditing}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading}
        >
          {loading ? "Saving..." : "Save changes"}
        </Button>
      </div>

      {message && (
        <p className={`text-body ${isError ? "text-content-danger" : "text-content-success"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
