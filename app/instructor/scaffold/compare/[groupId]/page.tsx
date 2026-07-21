// The side-by-side compare view for one pair of generated candidates.
//
// It reads the two rows back OUT of the database by their shared generation
// group id, which is the whole reason the pair is persisted: the comparison
// survives a reload, and the web address can be revisited later.
//
// The two candidates are shown in ALIGNED ROWS, one row per field, in the field
// order from docs/Relii-Piece2-Design-Decisions.md. Aligned rows are the point
// (design decision 3): the admin compares by reading the structured fields, not
// by role-playing the candidates.
//
// There is deliberately NO pick, enable, or delete control here. Choosing a
// winner is chunk 2d.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loadGenerationGroup,
  chainRoleLabel,
  meetingTypeLabel,
} from "@/lib/scaffold-candidates";
import type { CandidateRow } from "@/lib/scaffold-candidates";
import type { PersonaCandidate } from "@/lib/persona-scaffold";

// One row of the comparison table.
type FieldRow = {
  label: string;
  // Shown under the label in small text, e.g. who can see this field.
  hint?: string;
  render: (candidate: PersonaCandidate, row: CandidateRow) => React.ReactNode;
};

function Bullets({ items }: { items: string[] | undefined }) {
  if (!items || items.length === 0) return <Missing />;
  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

// Shown when a field is somehow absent. It should never appear on a normally
// generated pair; it exists so a hand-edited row cannot blank the page.
function Missing() {
  return <span className="text-gray-400">Not recorded</span>;
}

const FIELD_ROWS: FieldRow[] = [
  {
    label: "Persona name and role",
    render: (c) => (
      <span>
        <span className="font-medium">{c.persona_name}</span>, {c.role}
      </span>
    ),
  },
  {
    label: "Company (type and size)",
    render: (c) => `${c.company?.size ?? ""} ${c.company?.type ?? ""}`.trim(),
  },
  {
    label: "Meeting type and chain position",
    hint: "as saved on the scenario",
    // Read from the SAVED scenario row, not from the model's JSON, so what you
    // see here is exactly what is stored.
    render: (c, row) => (
      <span>
        {meetingTypeLabel(row.meeting_type)}. {chainRoleLabel(row.chain_role)}
        {c.chain_position?.gates_access_to
          ? `, gating access to ${c.chain_position.gates_access_to}`
          : ""}
        .
      </span>
    ),
  },
  {
    label: "Win condition and close terms",
    hint: "SHOWN TO THE STUDENT in the briefing",
    render: (c) => c.win_condition || <Missing />,
  },
  {
    label: "Demeanor",
    render: (c) => c.demeanor?.join(", ") || <Missing />,
  },
  {
    label: "Top decision criteria, ranked",
    render: (c) =>
      c.decision_criteria && c.decision_criteria.length > 0 ? (
        <ol className="list-decimal space-y-1 pl-4">
          {c.decision_criteria.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      ) : (
        <Missing />
      ),
  },
  {
    label: "Hidden facts and incumbent shortfalls",
    hint: "hidden from the student, revealed only to good questions",
    render: (c) =>
      c.hidden_facts && c.hidden_facts.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4">
          {c.hidden_facts.map((h, i) => (
            <li key={i}>
              <span className="font-medium">{h.fact}:</span> {h.detail}
            </li>
          ))}
        </ul>
      ) : (
        <Missing />
      ),
  },
  {
    label: "Objections they raise",
    render: (c) => <Bullets items={c.objections} />,
  },
  {
    label: "What earns the win",
    hint: "hidden, this is what gates the close",
    render: (c) => <Bullets items={c.earns_win} />,
  },
  {
    label: "What fails it",
    hint: "hidden",
    render: (c) => <Bullets items={c.fails_win} />,
  },
];

export default async function CompareCandidatesPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  // Instructor-gated, the same way the scaffolding page is.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "instructor") redirect("/student");

  const rows = await loadGenerationGroup(groupId);
  if (rows.length === 0) notFound();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <Link
          href="/instructor/scaffold"
          className="text-sm text-gray-500 underline"
        >
          Back to persona scaffolding
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Compare the candidates</h1>
        <p className="mt-1 text-sm text-gray-600">
          Two candidate buyer personas built from the same case. Read them field
          by field and decide which one is the more real, more teachable buyer.
        </p>
      </div>

      {/* What state these rows are in, said plainly. */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <p>
          <span className="font-medium">Both are saved and turned OFF.</span>{" "}
          Neither can be assigned to a student or started by one, and neither is
          scored (these are conversation-only cases with no rubric).
        </p>
        <p className="mt-2 text-gray-600">
          Choosing a winner, switching it on, and deleting the other one is the
          next piece of work, so there is no pick button here yet.
        </p>
      </div>

      {rows.length !== 2 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This generation has {rows.length} candidate
          {rows.length === 1 ? "" : "s"} saved rather than the usual two.
        </p>
      )}

      {/* The aligned comparison. One row per field, candidates side by side. */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="w-52 p-3 text-left align-bottom text-xs font-medium uppercase tracking-wide text-gray-500">
                Field
              </th>
              {rows.map((row, i) => (
                <th key={row.id} className="p-3 text-left align-bottom">
                  <span className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Candidate {i + 1}
                  </span>
                  <span className="block text-base font-semibold text-gray-900">
                    {row.persona_name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELD_ROWS.map((field, fieldIndex) => (
              <tr
                key={field.label}
                className={
                  fieldIndex % 2 === 1
                    ? "border-b border-gray-200 bg-gray-50"
                    : "border-b border-gray-200"
                }
              >
                <th className="p-3 text-left align-top font-medium text-gray-700">
                  {field.label}
                  {field.hint && (
                    <span className="mt-1 block text-xs font-normal text-gray-500">
                      {field.hint}
                    </span>
                  )}
                </th>
                {rows.map((row) => (
                  <td key={row.id} className="p-3 align-top text-gray-800">
                    {row.generation_fields?.candidate ? (
                      field.render(row.generation_fields.candidate, row)
                    ) : (
                      <Missing />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The one placement check worth making deliberately. In the table above
          these two fields sit far apart (the field order is fixed by the design
          doc), so they are repeated here next to each other, because the whole
          question is which of the two is carrying the argument. */}
      <div className="rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium">Where the argument landed</h2>
        <p className="mt-1 text-sm text-gray-600">
          The win condition is read by the STUDENT in their briefing. What earns
          the win is hidden and is what actually gates the close. If the
          persuasive argument sits in the win condition, the student is handed
          part of the case they were supposed to build themselves.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {rows.map((row, i) => {
            const candidate = row.generation_fields?.candidate;
            return (
              <div key={row.id} className="space-y-3 rounded-md bg-gray-50 p-3">
                <h3 className="text-sm font-semibold">
                  Candidate {i + 1}: {row.persona_name}
                </h3>
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Win condition (shown to the student)
                  </h4>
                  <p className="mt-1 text-sm text-gray-800">
                    {candidate?.win_condition || <Missing />}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    What earns the win (hidden)
                  </h4>
                  <div className="mt-1 text-sm text-gray-800">
                    <Bullets items={candidate?.earns_win} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The assembled text: what would actually drive the role-play. Collapsed
          by default so it does not bury the comparison above. */}
      <div className="space-y-3">
        <h2 className="font-medium">The assembled scenario text</h2>
        <p className="text-sm text-gray-600">
          Built from the fields above by the fixed template, so the case you
          compare and the persona a student would meet cannot drift apart.
        </p>
        {rows.map((row, i) => (
          <details
            key={row.id}
            className="rounded-lg border border-gray-200 p-4"
          >
            <summary className="cursor-pointer text-sm font-medium">
              Candidate {i + 1}: {row.persona_name}
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Scenario context (what the student is briefed on)
                </h3>
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm">
                  {row.scenario_context}
                </p>
              </div>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Persona system prompt (what the AI is told to be)
                </h3>
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm">
                  {row.persona_system_prompt}
                </p>
              </div>
            </div>
          </details>
        ))}
      </div>
    </main>
  );
}
