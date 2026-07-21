"use client";

// The persona scaffolding form and the candidate review below it.
//
// The instructor fills in the case, clicks Generate, and the server route
// returns TWO candidate personas. Each is shown twice over: first as the
// structured fields (in the same order as the field set in
// docs/Relii-Piece2-Design-Decisions.md, so chunk 2c can turn this into the
// real side-by-side compare view without reordering anything), then as the
// assembled scenario_context and persona_system_prompt that the fixed template
// built from those fields.
//
// Nothing here is saved. This chunk is generate-and-judge-the-quality; writing
// candidates into the database as disabled scenarios is chunk 2c.
import { useState } from "react";

type HiddenFact = { fact: string; detail: string };

type PersonaCandidate = {
  persona_name: string;
  role: string;
  company: { type: string; size: string };
  meeting_type: string;
  chain_position: { position: string; gates_access_to: string | null };
  win_condition: string;
  demeanor: string[];
  decision_criteria: string[];
  hidden_facts: HiddenFact[];
  objections: string[];
  earns_win: string[];
  fails_win: string[];
};

type GeneratedCandidate = {
  candidate: PersonaCandidate;
  assembled: { scenario_context: string; persona_system_prompt: string };
};

const inputClass = "w-full rounded-md border border-gray-300 px-3 py-2";
const labelClass = "mb-1 block text-sm text-gray-600";

export function ScaffoldForm() {
  const [industry, setIndustry] = useState("");
  const [personaRole, setPersonaRole] = useState("");
  const [productOrService, setProductOrService] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [meetingType, setMeetingType] = useState("discovery");
  const [chainPosition, setChainPosition] = useState("gatekeeper");
  const [gatesAccessTo, setGatesAccessTo] = useState("");
  const [winCondition, setWinCondition] = useState("");
  const [sellerCompanyType, setSellerCompanyType] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<GeneratedCandidate[] | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResults(null);
    setLoading(true);

    try {
      const res = await fetch("/api/instructor/scaffold/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry,
          personaRole,
          productOrService,
          companySize,
          meetingType,
          chainPosition,
          gatesAccessTo,
          winCondition,
          sellerCompanyType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Generation failed. Please try again.");
        return;
      }
      setResults(data.candidates as GeneratedCandidate[]);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border border-gray-200 p-4"
      >
        <h2 className="font-medium">Case inputs</h2>

        <div>
          <label className={labelClass}>Industry</label>
          <input
            type="text"
            required
            placeholder="Commercial HVAC service"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Persona role</label>
          <input
            type="text"
            required
            placeholder="Fleet manager"
            value={personaRole}
            onChange={(e) => setPersonaRole(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Product or service being sold</label>
          <input
            type="text"
            required
            placeholder="Fleet-management software"
            value={productOrService}
            onChange={(e) => setProductOrService(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            Prospect company size (approximate employee count)
          </label>
          <input
            type="text"
            required
            placeholder="250"
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Meeting type</label>
          <select
            value={meetingType}
            onChange={(e) => setMeetingType(e.target.value)}
            className={inputClass}
          >
            <option value="discovery">Discovery</option>
            <option value="presentation">Presentation</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Chain position</label>
          <select
            value={chainPosition}
            onChange={(e) => setChainPosition(e.target.value)}
            className={inputClass}
          >
            <option value="gatekeeper">Gatekeeper</option>
            <option value="decision_maker">Decision maker</option>
          </select>
        </div>

        {/* Only a gatekeeper gates access to someone. */}
        {chainPosition === "gatekeeper" && (
          <div>
            <label className={labelClass}>Who they gate access to</label>
            <input
              type="text"
              required
              placeholder="The operations director who approves the trial"
              value={gatesAccessTo}
              onChange={(e) => setGatesAccessTo(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label className={labelClass}>
            Win condition (if it is a trial, give the terms)
          </label>
          <textarea
            required
            rows={3}
            placeholder="A follow-up meeting with the operations director, who can approve a 90-day trial on ten vehicles"
            value={winCondition}
            onChange={(e) => setWinCondition(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Seller company type</label>
          <input
            type="text"
            required
            placeholder="Fleet-management software vendor"
            value={sellerCompanyType}
            onChange={(e) => setSellerCompanyType(e.target.value)}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate two candidates"}
        </button>

        {loading && (
          <p className="text-sm text-gray-500">
            Writing two personas. This usually takes twenty to sixty seconds,
            so please leave this page open.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {results && (
        <div className="space-y-8">
          <div>
            <h2 className="font-medium">Two candidates</h2>
            <p className="text-sm text-gray-500">
              Nothing is saved yet. Read both, then we will add saving and the
              side-by-side compare view in the next chunk.
            </p>
          </div>
          {results.map((result, index) => (
            <CandidateCard
              key={index}
              label={`Candidate ${index + 1}`}
              result={result}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// One labelled block of the structured fields.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </h4>
      <div className="mt-1 text-sm text-gray-800">{children}</div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

// One candidate: the structured fields in the design doc's order, then the
// assembled text the fixed template produced from exactly those fields.
function CandidateCard({
  label,
  result,
}: {
  label: string;
  result: GeneratedCandidate;
}) {
  const c = result.candidate;
  const position =
    c.chain_position.position === "gatekeeper" ? "Gatekeeper" : "Decision maker";

  return (
    <div className="space-y-6 rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium">
        {label}: {c.persona_name}, {c.role}
      </h3>

      <div className="space-y-4">
        <Field label="Persona name and role">
          {c.persona_name}, {c.role}
        </Field>

        <Field label="Company (type and size)">
          {c.company.size} {c.company.type}
        </Field>

        <Field label="Meeting type and chain position">
          {c.meeting_type === "discovery" ? "Discovery" : "Presentation"}.{" "}
          {position}
          {c.chain_position.gates_access_to
            ? `, gating access to ${c.chain_position.gates_access_to}`
            : ""}
          .
        </Field>

        <Field label="Win condition and close terms">{c.win_condition}</Field>

        <Field label="Demeanor">{c.demeanor.join(", ")}</Field>

        <Field label="Top decision criteria, ranked">
          <ol className="list-decimal space-y-1 pl-5">
            {c.decision_criteria.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </Field>

        <Field label="Hidden facts and incumbent shortfalls">
          <ul className="list-disc space-y-1 pl-5">
            {c.hidden_facts.map((h, i) => (
              <li key={i}>
                <span className="font-medium">{h.fact}:</span> {h.detail}
              </li>
            ))}
          </ul>
        </Field>

        <Field label="Objections they raise">
          <BulletList items={c.objections} />
        </Field>

        <Field label="What earns the win">
          <BulletList items={c.earns_win} />
        </Field>

        <Field label="What fails it">
          <BulletList items={c.fails_win} />
        </Field>
      </div>

      {/* The assembled text, built from the fields above by the fixed template.
          This is what would actually drive the conversation. */}
      <div className="space-y-4 border-t border-gray-200 pt-4">
        <p className="text-xs text-gray-500">
          Assembled by the fixed template from the fields above. This is the
          text that would drive the role-play.
        </p>

        <Field label="Scenario context (what the student is briefed on)">
          <p className="whitespace-pre-wrap rounded-md bg-gray-50 p-3">
            {result.assembled.scenario_context}
          </p>
        </Field>

        <Field label="Persona system prompt (what the AI is told to be)">
          <p className="whitespace-pre-wrap rounded-md bg-gray-50 p-3">
            {result.assembled.persona_system_prompt}
          </p>
        </Field>
      </div>
    </div>
  );
}
