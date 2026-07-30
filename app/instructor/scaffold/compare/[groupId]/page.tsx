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
// The page has TWO states, and it decides which one by asking whether any row in
// the group is switched ON, never by counting rows:
//
//   UNDECIDED (every row off): the comparison, with a "Choose this one" button
//     under each candidate.
//   DECIDED (a row is on): the winner, what it is now, and what to do next.
//
// Keying on the enabled flag rather than on "is there still more than one row"
// matters for the one case that would otherwise be misread: if a loser could not
// be deleted because something was using it, the group still has two rows but
// the pick has definitely been made.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loadGenerationGroup,
  chainRoleLabel,
  meetingTypeLabel,
} from "@/lib/scaffold-candidates";
import { ChooseCandidateButton } from "@/components/choose-candidate-button";
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

  // The winner, if this generation has already been decided. Any switched-on row
  // means a pick has been made.
  const winner = rows.find((row) => row.enabled) ?? null;
  const decided = winner !== null;
  // A row that is still off after a pick was made is a loser that could not be
  // deleted, which only happens when something is using it.
  const retainedLosers = decided ? rows.filter((row) => !row.enabled) : [];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-8 pb-12 pt-6">
      <div>
        <Link
          href="/instructor/scaffold"
          className="text-sm text-gray-500 underline"
        >
          Back to Persona Scaffolding
        </Link>
        {/* An h2, not an h1: the page title in the shared instructor header
            above is the h1. */}
        <h2 className="mt-2 text-xl font-semibold">
          {decided ? "The chosen persona" : "Compare the candidates"}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {decided
            ? "You have already picked a winner from this generation. The comparison is kept below for reference."
            : "Two candidate buyer personas built from the same case. Read them field by field and decide which one is the more real, more teachable buyer."}
        </p>
      </div>

      {/* What state these rows are in, said plainly. */}
      {decided ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <p>
            <span className="font-medium">
              {winner.persona_name} is switched ON.
            </span>{" "}
            Saved as{" "}
            <span className="font-medium">{winner.title}</span>, and now
            available in the create-assignment list as a conversation-only case
            (it is never scored).
          </p>
          <p className="mt-2">
            Before anyone else sees this case, role-play it once yourself through
            a normal assignment. Reading the fields shows whether the case is
            coherent; only a conversation shows how the persona actually behaves.
          </p>
          {retainedLosers.length > 0 && (
            <p className="mt-2 rounded-md bg-amber-50 p-2 text-amber-900">
              The other candidate (
              {retainedLosers.map((row) => row.persona_name).join(", ")}) could
              not be deleted, because a session or an assignment is using it. It
              is switched off and unreachable by any student.
            </p>
          )}

          {/* The chain, offered only from a gatekeeper: only a gatekeeper gates
              access to somebody, so only a gatekeeper has a second meeting to
              build. */}
          {winner.chain_role === "gatekeeper" && (
            <div className="mt-4 rounded-md border border-gray-300 bg-white p-3 text-gray-800">
              <p className="font-medium text-gray-900">
                Build the second meeting for this case
              </p>
              <p className="mt-1 text-gray-700">
                {winner.persona_name} is a gatekeeper, so this case has a second
                meeting in it: the decision maker they control access to. The
                shared details carry over, so you only choose who that person is
                and what the seller has to earn from them. Same shape as Jordan
                following Alex, and the two stay independently assignable.
              </p>
              <Link
                href={`/instructor/scaffold/chain/${winner.id}`}
                className="mt-3 inline-block rounded-md bg-black px-3 py-1.5 text-white hover:bg-gray-800"
              >
                Generate the decision maker
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p>
            <span className="font-medium">Both are saved and turned OFF.</span>{" "}
            Neither can be assigned to a student or started by one, and neither
            is scored (these are conversation-only cases with no rubric).
          </p>
          <p className="mt-2 text-gray-600">
            Choosing one switches it on and permanently deletes the other.
          </p>
        </div>
      )}

      {!decided && rows.length !== 2 && (
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
                    {decided && row.enabled && (
                      <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-green-800">
                        Chosen
                      </span>
                    )}
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
          {/* The pick itself, sitting directly under the fields it is based on,
              so the decision is made where the evidence is. Only while the
              generation is still undecided. */}
          {!decided && (
            <tfoot>
              <tr>
                <td className="p-3" />
                {rows.map((row) => (
                  <td key={row.id} className="p-3 align-top">
                    <ChooseCandidateButton
                      candidateId={row.id}
                      personaName={row.persona_name}
                      otherPersonaName={
                        rows.find((other) => other.id !== row.id)
                          ?.persona_name ?? null
                      }
                    />
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
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
