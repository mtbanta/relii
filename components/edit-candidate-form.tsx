"use client";

// The edit form for one generated candidate persona.
//
// It carries the EIGHT EDITABLE FIELDS only. The three locked pairs (meeting
// type and chain position, the win condition, the company) are shown above this
// form on the page as plain text, and the save route never reads them from the
// browser, so there is nothing here that could send them.
//
// The five plain lists are edited as ONE ENTRY PER LINE in a textarea, which is
// the simplest honest shape for a list of short sentences. Hidden facts are
// pairs, so they get their own add-and-remove rows instead.
//
// All the real work and all the checking is on the server (see
// /api/instructor/scaffold/edit). This component collects, sends, and reports
// back what the server says, including the exact per-field problems so a list
// left too short says so.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonaCandidate, HiddenFact } from "@/lib/persona-scaffold";

import { controlClasses } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

// The name stays, so every use site below is unchanged; it now hands the work
// to the shared form primitive.
const INPUT_CLASS = controlClasses({ className: "mt-1 text-sm" });

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-content-primary">
        {label}
        {hint && (
          <span className="mt-0.5 block text-xs font-normal text-content-secondary">
            {hint}
          </span>
        )}
        {children}
      </label>
    </div>
  );
}

// A list field, one entry per line. Kept as raw text while typing (rather than
// split into an array on every keystroke) so a half-typed line and a blank line
// between entries both behave the way a person expects. The server does the
// splitting and the trimming.
function ListField({
  label,
  hint,
  value,
  onChange,
  rows,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  rows: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`${INPUT_CLASS} font-normal`}
      />
    </Field>
  );
}

function toLines(items: string[] | undefined): string {
  return (items ?? []).join("\n");
}

export function EditCandidateForm({
  candidateId,
  groupId,
  candidate,
}: {
  candidateId: string;
  groupId: string;
  candidate: PersonaCandidate;
}) {
  const router = useRouter();

  const [personaName, setPersonaName] = useState(candidate.persona_name);
  const [role, setRole] = useState(candidate.role);
  const [demeanor, setDemeanor] = useState(toLines(candidate.demeanor));
  const [decisionCriteria, setDecisionCriteria] = useState(
    toLines(candidate.decision_criteria),
  );
  const [hiddenFacts, setHiddenFacts] = useState<HiddenFact[]>(
    candidate.hidden_facts ?? [],
  );
  const [objections, setObjections] = useState(toLines(candidate.objections));
  const [earnsWin, setEarnsWin] = useState(toLines(candidate.earns_win));
  const [failsWin, setFailsWin] = useState(toLines(candidate.fails_win));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  function updateFact(index: number, part: keyof HiddenFact, next: string) {
    setHiddenFacts((facts) =>
      facts.map((fact, i) => (i === index ? { ...fact, [part]: next } : fact)),
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setProblems([]);
    try {
      const res = await fetch("/api/instructor/scaffold/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          edits: {
            persona_name: personaName,
            role,
            demeanor,
            decision_criteria: decisionCriteria,
            hidden_facts: hiddenFacts,
            objections,
            earns_win: earnsWin,
            fails_win: failsWin,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not save those edits.");
        setProblems(Array.isArray(data?.problems) ? data.problems : []);
        setSaving(false);
        return;
      }
      // Straight back to the comparison, where the edit is now visible in the
      // fields and in the assembled text below them. refresh() first so the
      // page is re-read from the database rather than served from the cache.
      router.refresh();
      router.push(`/instructor/scaffold/compare/${groupId}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Persona name">
          <input
            value={personaName}
            onChange={(e) => setPersonaName(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Role">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <ListField
        label="Demeanor"
        hint="One descriptor per line. These are read out as a sentence in the persona instructions."
        value={demeanor}
        onChange={setDemeanor}
        rows={4}
      />

      <ListField
        label="Top decision criteria, ranked"
        hint="One per line, most important first."
        value={decisionCriteria}
        onChange={setDecisionCriteria}
        rows={5}
      />

      {/* Hidden facts are the meat of the case, and the one field that is a pair
          rather than a line, so it gets rows instead of a textarea. */}
      <div>
        <p className="text-sm font-medium text-content-primary">
          Hidden facts and incumbent shortfalls
        </p>
        <p className="mt-0.5 text-xs text-content-secondary">
          Hidden from the student and revealed only to good, specific questions.
          At least three are required. The fact is the shortfall; the detail is
          the concrete number or specific behind it.
        </p>
        <div className="mt-2 space-y-3">
          {hiddenFacts.map((fact, index) => (
            <div
              key={index}
              className="space-y-2 rounded-md border border-line-tertiary p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-content-secondary">
                  Fact {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setHiddenFacts((facts) =>
                      facts.filter((_, i) => i !== index),
                    )
                  }
                  className="text-xs text-content-secondary underline"
                >
                  Remove
                </button>
              </div>
              <input
                value={fact.fact}
                onChange={(e) => updateFact(index, "fact", e.target.value)}
                placeholder="The shortfall or pressure"
                className={controlClasses({ className: "text-sm" })}
              />
              <textarea
                value={fact.detail}
                onChange={(e) => updateFact(index, "detail", e.target.value)}
                placeholder="The concrete detail or number"
                rows={2}
                className={controlClasses({ className: "text-sm" })}
              />
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          type="button"
          onClick={() =>
            setHiddenFacts((facts) => [...facts, { fact: "", detail: "" }])
          }
        >
          Add a hidden fact
        </Button>
      </div>

      <ListField
        label="Objections they raise"
        hint="One per line, in the buyer's own words. At least three are required."
        value={objections}
        onChange={setObjections}
        rows={4}
      />

      <ListField
        label="What earns the win"
        hint="Hidden from the student. This is what actually gates the close."
        value={earnsWin}
        onChange={setEarnsWin}
        rows={4}
      />

      <ListField
        label="What fails it"
        hint="Hidden from the student. What makes this buyer decline."
        value={failsWin}
        onChange={setFailsWin}
        rows={4}
      />

      {error && (
        <div className="rounded-md border border-red-300 bg-surface-danger p-3 text-sm text-content-danger">
          <p>{error}</p>
          {problems.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {problems.map((problem, i) => (
                <li key={i}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-line-tertiary pt-4">
        <Button
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save and rebuild"}
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() =>
            router.push(`/instructor/scaffold/compare/${groupId}`)
          }
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
