"use client";

// The instructor's "Create assignment" form.
//
// ==> PHASE 2a MOVED THIS OFF A BROWSER INSERT AND ONTO A SERVER ROUTE, AND THE
//     REASON MATTERS MORE THAN THE CHANGE.
//
//     It used to call supabase.from("assignments").insert() directly, with the
//     ordinary logged-in client. That was safe because Row Level Security was
//     doing the authorisation: "instructors manage assignments" in
//     supabase/gate-3a-policies.sql carries
//     `with check (public.instructs_class(class_id))`.
//
//     It now POSTs to /api/instructor/assignment/create, because a rubric
//     upload has to be parsed on the server: the browser must never be the
//     source of the numbers a student is graded against.
//
//     THAT ROUTE USES THE SERVICE-ROLE KEY, WHICH BYPASSES RLS COMPLETELY, so
//     the class check now lives in the route. The policy is still there and is
//     still wanted. See the note beside the rubric field below. <==
//
// IT SENDS FormData, NOT JSON. An .xlsx is binary and will not survive a JSON
// body. This is the same shape as the bulk invite (browser reads the file, the
// server parses and writes) with a different carrier, because that one sends
// CSV text.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_MEETING_MINUTES,
  MAX_MEETING_MINUTES,
  MIN_MEETING_MINUTES,
} from "@/lib/meeting-length";
import { MAX_RUBRIC_FILE_BYTES, formatLimit } from "@/lib/types";
import {
  FileInput,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

type ScenarioOption = {
  id: string;
  title: string;
  persona_name: string;
};

// ==> THE RUBRIC FIELD IS SWITCHED OFF FOR THE WHOLE OF PHASE 2a, ON PURPOSE.
//
//     Everything behind it is built and tested: the parser, the preview route,
//     the create route's rubric branch, and the interaction below. It is off
//     because attaching a rubric that does not yet drive scoring would be a
//     LIVE TRAP: Tom would attach one, see it accepted, and be graded by the
//     scenario's old rubric anyway. Phase 2b turns this one constant to true
//     once the scoring model reads assignments.rubric_id.
//
//     Flipping it is the whole switch-on. Nothing else here is conditional.
//
//     ==> IT IS A CLIENT FLAG ONLY. THE SERVER DOES NOT ENFORCE IT.
//
//         app/api/instructor/assignment/create/route.ts ACCEPTS A POSTED RUBRIC
//         TODAY. This constant hides the control and stops the form sending a
//         file; it does not make the route refuse one. A crafted request can
//         attach a rubric right now.
//
//         THAT IS HARMLESS AT PRESENT, and the reasons are specific rather than
//         general: scoring still reads scenario.rubric_id until Phase 2b, so a
//         rubric on an assignment changes nobody's grade; the route is behind
//         requireInstructorRequest(); and only two instructor accounts exist.
//
//         IT IS WRITTEN DOWN BECAUSE "upload is off" IS THE KIND OF SENTENCE
//         SOMEBODY LATER TREATS AS A SERVER GUARANTEE. It is not one. If the
//         route ever needs to actually refuse a rubric, that has to be added in
//         the route; this constant will not do it from here. Same discipline as
//         the declaration-not-measurement note on the zip check. <== <==
const RUBRIC_UPLOAD_ENABLED = false;

export function CreateAssignmentForm({
  scenarios,
  classId,
}: {
  scenarios: ScenarioOption[];
  // GATE 3a: the class this assignment belongs to. It is no longer SENT: the
  // route resolves the working class itself and never reads one from the
  // request. It is still read here for the early message below, so an
  // instructor with no class is told so before filling the form in.
  classId: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [requiredMode, setRequiredMode] = useState<"text" | "voice_video">(
    "voice_video",
  );
  const [instructions, setInstructions] = useState("");
  const [availableDate, setAvailableDate] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  // The rubric attachment. The file itself is read from the input at submit
  // time, so the preview and the create call send the SAME file.
  const rubricRef = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    criteria: string[];
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [rubricError, setRubricError] = useState("");

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

  // ==> CHANGING THE FILE CLEARS THE PREVIEW AND RE-ARMS THE CONFIRM. THIS IS
  //     THE EDGE THAT HAD TO BE BUILT OR IT WOULD NOT HAVE BEEN.
  //
  //     Without it: Tom picks rubric A, previews it, ticks the confirm, then
  //     changes his mind and picks rubric B. The tick is still there, the
  //     preview still shows A, and he creates the assignment believing he
  //     approved what got stored. The server would store B, correctly, and he
  //     would never know they differed.
  //
  //     Note that the SERVER is not fooled by any of this: it re-parses
  //     whatever file arrives with the create call. This is about Tom being
  //     able to trust what he is looking at. <==
  async function handleRubricChange() {
    setPreview(null);
    setConfirmed(false);
    setRubricError("");

    const file = rubricRef.current?.files?.[0];
    if (!file) return;

    setPreviewing(true);
    const body = new FormData();
    body.append("rubric", file);

    try {
      const res = await fetch("/api/instructor/assignment/rubric-preview", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setRubricError(data?.error ?? "That rubric could not be read.");
        return;
      }
      setPreview({ name: data.name, criteria: data.criteria });
    } catch {
      setRubricError("That rubric could not be read. Please try again.");
    } finally {
      setPreviewing(false);
    }
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

    // The friendly version of a check the route also makes. The ROUTE is
    // authoritative: it refuses an instructor with no class with its own
    // message. This one saves the round trip.
    if (!classId) {
      setIsError(true);
      setMessage(
        "Your instructor account is not linked to a class, so this cannot be saved. Please contact support.",
      );
      return;
    }

    const file = rubricRef.current?.files?.[0];
    if (RUBRIC_UPLOAD_ENABLED && file && !confirmed) {
      setIsError(true);
      setMessage("Please confirm the rubric preview before creating.");
      return;
    }

    setLoading(true);

    const body = new FormData();
    body.append("title", cleanTitle);
    body.append("scenario_id", scenarioId);
    body.append("required_mode", requiredMode);
    body.append("company_name", companyName.trim());
    body.append("instructions", instructions.trim());
    body.append("available_date", availableDate);
    body.append("due_at", dueAt);
    body.append("duration_minutes", durationMinutes.trim());
    // The same file the preview was taken from. The server re-parses it and
    // stores what IT parsed; nothing from the preview response is sent.
    if (RUBRIC_UPLOAD_ENABLED && file) body.append("rubric", file);

    try {
      const res = await fetch("/api/instructor/assignment/create", {
        method: "POST",
        body,
      });
      const data = await res.json();

      if (!res.ok) {
        setIsError(true);
        setMessage(data?.error ?? "Could not create the assignment.");
        return;
      }

      setMessage(`Created "${cleanTitle}".`);
      setTitle("");
      setCompanyName("");
      setInstructions("");
      setAvailableDate("");
      setDueAt("");
      setDurationMinutes("");
      setPreview(null);
      setConfirmed(false);
      setRubricError("");
      if (rubricRef.current) rubricRef.current.value = "";
      router.refresh();
    } catch {
      setIsError(true);
      setMessage("Could not create the assignment. Please try again.");
    } finally {
      setLoading(false);
    }
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
        <Label className="mb-1">Company name (optional)</Label>
        <Input
          type="text"
          placeholder="Bunzl"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
        <p className="mt-1 text-meta text-content-tertiary">
          The company the buyer works for in this role-play. Shown on the
          assignment card below.
        </p>
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
        <Label className="mb-1">Required mode</Label>
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
        <Label className="mb-1">Meeting length (optional)</Label>
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
        <Label className="mb-1">Instructions (optional)</Label>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="Anything the student should know before they start."
        />
      </div>

      {/* THE RUBRIC ATTACHMENT. Phase 2a built everything behind it and left the
          control DISABLED, so nothing a user can see changes this session. The
          copy is owner-approved and goes in now rather than later, so 2b flips
          RUBRIC_UPLOAD_ENABLED and changes nothing else. */}
      <div>
        <Label className="mb-1">Rubric (optional)</Label>
        <FileInput
          ref={rubricRef}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={!RUBRIC_UPLOAD_ENABLED}
          aria-disabled={!RUBRIC_UPLOAD_ENABLED}
          className={RUBRIC_UPLOAD_ENABLED ? undefined : "opacity-50"}
          onChange={handleRubricChange}
        />
        <p className="mt-1 text-meta text-content-tertiary">
          If you want this assignment graded, a rubric must be attached via this
          form. You cannot attach a rubric to a published assignment.
        </p>
        {/* The limit is read from the same constant the server enforces, so the
            number on screen cannot drift from the number that refuses. */}
        <p className="mt-1 text-meta text-content-tertiary">
          Excel file (.xlsx), up to {formatLimit(MAX_RUBRIC_FILE_BYTES)}.
        </p>

        {previewing && (
          <p className="mt-2 text-meta text-content-tertiary">
            Reading the rubric...
          </p>
        )}

        {rubricError && (
          <p className="mt-2 text-body text-content-danger">{rubricError}</p>
        )}

        {preview && (
          <div className="mt-2 rounded border border-border-subtle p-2">
            <p className="text-body font-medium">{preview.name}</p>
            <ul className="mt-1 list-disc pl-5 text-meta text-content-secondary">
              {preview.criteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <label className="mt-2 flex items-start gap-2 text-meta">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                This is the right rubric for this assignment.
              </span>
            </label>
          </div>
        )}
      </div>

      <div>
        <Label className="mb-1">Available date (optional)</Label>
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
        <Label className="mb-1">Due date (optional)</Label>
        <Input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create assignment"}
      </Button>

      {message && (
        <p
          className={`text-body ${isError ? "text-content-danger" : "text-content-success"}`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
