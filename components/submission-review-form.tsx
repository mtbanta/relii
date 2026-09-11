"use client";

// PHASE 4a. THE INSTRUCTOR'S REVIEW EDITOR, on the submission detail page.
//
// ==> WHAT IT IS FOR, AND WHY IT IS NOT A CONVENIENCE. Phase 2c found the AI
//     silently converting a correctly graded answer into the lowest grade on the
//     rubric. That particular fault is fixed, but the lesson it taught is that a
//     machine's level can be wrong in ways only a human reading the transcript
//     will catch. This is that human's control. <==
//
// THE ONE RULE THIS FILE OBEYS ABOVE ALL OTHERS: IT NEVER SENDS A NUMBER. The
// browser posts a LEVEL NAME per criterion and nothing else. Every points value
// on this screen is a display of a lookup the server will redo for itself, from
// the rubric, when it saves. So a tampered page can move a grade only to a rung
// the instructor's own rubric already contains, and the arithmetic the professor
// sees before pressing the button is the same arithmetic the database ends up
// holding.
//
// IT IS ONE BUTTON, WHICH IS ITSELF A RULING. Confirming the AI's score exactly
// as it stands is the common case for Tom and it must not cost more than one
// click, so "Mark reviewed" and "change a level and save" are the same action
// with the same control: the form simply posts whatever the selects currently
// say. There is no separate confirm path to fall out of step with the editing
// one.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { formatPoints, MAX_REVIEW_NOTE_CHARS } from "@/lib/types";

// One line of the editor, built on the SERVER (see the submission page) so this
// component does no lookups of its own and cannot invent a pairing of a level
// with a points value.
export type ReviewLine = {
  // The criterion id, which is also the score item's id.
  id: string;
  name: string;
  description: string;
  // This criterion's own ladder, highest first, as the rubric states it.
  levels: { name: string; points: number }[];
  pointsMax: number;
  // ==> WHAT THE AI SAID. The level is what the "AI:" label shows beside the
  //     instructor's choice, and it is read from the stored original rather than
  //     from the score currently on the row, so it keeps saying what the AI
  //     actually chose however many times this has been re-edited. The comment
  //     is the AI's too, and it STAYS on screen whatever the instructor picks:
  //     hiding it would hide the disagreement rather than record it. <==
  aiLevel: string | null;
  aiComment: string;
  // What is in force right now: the AI's on a first review, the last review's
  // afterwards.
  currentLevel: string | null;
  currentNote: string;
};

export function SubmissionReviewForm({
  sessionId,
  lines,
  maxTotal,
  alreadyReviewed,
}: {
  sessionId: string;
  lines: ReviewLine[];
  maxTotal: number;
  alreadyReviewed: boolean;
}) {
  const router = useRouter();

  // ==> THE INITIAL SELECTION IS THE LEVEL IN FORCE, AND AN UNRECOGNISED ONE
  //     BECOMES NO SELECTION RATHER THAN THE FIRST OPTION. A <select> with no
  //     matching option quietly displays its first entry, which here is the TOP
  //     rung: an instructor who changed nothing and pressed the button would
  //     have awarded full marks. So a level that is not on the ladder starts
  //     empty, the placeholder is visible, and the button below refuses to
  //     submit until a real choice is made. <==
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        line.levels.some((l) => l.name === line.currentLevel)
          ? (line.currentLevel as string)
          : "",
      ]),
    ),
  );
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, line.currentNote])),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // The points for whatever is currently selected, and the total. DISPLAY ONLY.
  // The server looks all of this up again from the rubric when it saves; this is
  // here so the professor can see what a change costs before committing to it.
  const pointsFor = (line: ReviewLine): number | null => {
    const level = line.levels.find((l) => l.name === chosen[line.id]);
    return level ? level.points : null;
  };

  const total = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const level = line.levels.find((l) => l.name === chosen[line.id]);
        return sum + (level ? level.points : 0);
      }, 0),
    [lines, chosen],
  );

  const missing = lines.filter((line) => !chosen[line.id]);
  const changedCount = lines.filter(
    (line) => line.aiLevel !== null && chosen[line.id] !== line.aiLevel,
  ).length;

  async function save() {
    if (missing.length > 0) {
      setError(
        `Choose a performance level for ${missing.map((m) => `"${m.name}"`).join(", ")} before saving.`,
      );
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(
        `/api/instructor/submission/${sessionId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // LEVEL NAMES AND NOTES ONLY. No points, no total: see the header.
            items: lines.map((line) => ({
              id: line.id,
              level: chosen[line.id],
              note: notes[line.id] ?? "",
            })),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save this review.");
        setSaving(false);
        return;
      }
      setSaved(true);
      setSaving(false);
      // Re-read the page so the header total, the rubric above and the status
      // all show what was actually stored rather than what was typed.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className={cardClasses({ padding: "none" })}>
      {lines.map((line, i) => {
        const points = pointsFor(line);
        const changed = line.aiLevel !== null && chosen[line.id] !== line.aiLevel;
        const note = notes[line.id] ?? "";
        return (
          <div
            key={line.id}
            className={`px-3.5 py-3 ${i > 0 ? "border-t border-line-tertiary" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-content-primary">
                  {line.name}
                </p>
                {line.description && (
                  <p className="mt-0.5 max-w-reading text-meta text-content-secondary">
                    {line.description}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <div>
                  <label
                    htmlFor={`level-${line.id}`}
                    className="block text-micro text-content-tertiary"
                  >
                    Performance level
                  </label>
                  {/* ==> A LIST OF THIS CRITERION'S OWN LEVEL NAMES, AND NOTHING
                      ELSE. No free text, no points box, no "other". Whatever is
                      chosen here, the server prices it from the same rubric, so
                      there is no rung off the ladder to reach and no way to type
                      a zero. Tom's 10 per cent floor is the bottom option and
                      stays exactly where his file put it. */}
                  <select
                    id={`level-${line.id}`}
                    value={chosen[line.id] ?? ""}
                    onChange={(e) => {
                      setSaved(false);
                      setChosen((prev) => ({
                        ...prev,
                        [line.id]: e.target.value,
                      }));
                    }}
                    className="mt-0.5 rounded-md border border-line-secondary bg-surface-primary px-2 py-1 text-body text-content-primary"
                  >
                    <option value="" disabled>
                      Choose a level
                    </option>
                    {line.levels.map((level) => (
                      <option key={level.name} value={level.name}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24 text-right">
                  <p className="text-micro text-content-tertiary">Points</p>
                  <p className="mt-0.5 text-body font-medium tabular-nums text-content-secondary">
                    {points === null ? "-" : formatPoints(points)}{" "}
                    <span className="text-meta font-normal text-content-tertiary">
                      / {formatPoints(line.pointsMax)}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* ==> WHAT THE AI CHOSE, BESIDE WHAT THE INSTRUCTOR CHOSE. This is
                the whole audit surface on this screen: an instructor can always
                see the machine's answer next to their own, so overruling it is a
                deliberate act rather than an accident of a pre-filled form. It
                keeps saying the same thing on a re-edit, because it is read from
                the stored original and not from the score on the row. */}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-meta text-content-secondary">
                AI: {line.aiLevel ?? "no level recorded"}
              </span>
              {changed && (
                <span className="text-meta text-content-warning">
                  Changed by you
                </span>
              )}
            </div>

            {line.aiComment && (
              <p className="mt-1 max-w-reading text-micro italic text-content-secondary">
                {line.aiComment}
              </p>
            )}

            <div className="mt-2">
              <label
                htmlFor={`note-${line.id}`}
                className="block text-micro text-content-tertiary"
              >
                Your note on this criterion (optional). The student sees this.
              </label>
              {/* Plain text in, plain text out. React escapes what it renders,
                  and nothing anywhere puts this string into HTML by hand, which
                  is what keeps a note a note. maxLength reads the same constant
                  the server enforces, so the two cannot disagree about the
                  limit. */}
              <textarea
                id={`note-${line.id}`}
                value={note}
                maxLength={MAX_REVIEW_NOTE_CHARS}
                rows={2}
                onChange={(e) => {
                  setSaved(false);
                  setNotes((prev) => ({ ...prev, [line.id]: e.target.value }));
                }}
                className="mt-0.5 block w-full max-w-reading rounded-md border border-line-secondary bg-surface-primary px-2 py-1 text-meta text-content-primary"
              />
              {note.trim().length > 0 && (
                <p className="mt-0.5 text-micro text-content-tertiary tabular-nums">
                  {note.trim().length} / {MAX_REVIEW_NOTE_CHARS}
                </p>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-tertiary bg-surface-secondary px-3.5 py-3">
        <div>
          <p className="text-body font-medium tabular-nums">
            {formatPoints(total)}{" "}
            <span className="text-meta font-normal text-content-secondary">
              / {formatPoints(maxTotal)}
            </span>
          </p>
          <p className="mt-0.5 text-micro text-content-tertiary">
            {changedCount === 0
              ? "No levels changed from the AI's."
              : `${changedCount} level${changedCount === 1 ? "" : "s"} changed from the AI's.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <p className="max-w-reading text-meta text-content-danger">{error}</p>
          )}
          {saved && !error && (
            <p className="text-meta text-content-success">Review saved.</p>
          )}
          <Button onClick={save} disabled={saving}>
            {saving
              ? "Saving..."
              : alreadyReviewed
                ? "Save review"
                : "Mark reviewed"}
          </Button>
        </div>
      </div>
    </div>
  );
}
