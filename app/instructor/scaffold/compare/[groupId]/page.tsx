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
import { notFound } from "next/navigation";
import { requireInstructor } from "@/lib/instructor-auth";
import { otherOwnedClass } from "@/lib/class-scope";
import { OtherClassNotice } from "@/components/other-class-notice";
import {
  loadGenerationGroup,
  findGenerationGroupOwnedClass,
  chainRoleLabel,
  meetingTypeLabel,
} from "@/lib/scaffold-candidates";
import { ChooseCandidateButton } from "@/components/choose-candidate-button";
import type { CandidateRow } from "@/lib/scaffold-candidates";
import type { PersonaCandidate } from "@/lib/persona-scaffold";
import { buttonClasses } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

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
  return <span className="text-content-tertiary">Not recorded</span>;
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
    // PD-8g follow-up: "chain position" became "Persona Role", matching the
    // creation form. The PAIR is kept, because this row genuinely renders both
    // halves ("Discovery. Gatekeeper."), so a label naming only one of them
    // would describe half its own cell. Label only: chain_role, meeting_type
    // and the generation_fields shape are untouched, and chainRoleLabel below
    // still formats the VALUE, not this label.
    label: "Meeting type and Persona Role",
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
  // GATE 3b replaced the hand-written signed-in and role check that used to sit
  // here with the shared requireInstructor(). It does exactly the same two things
  // in the same order (login redirect, then student redirect) and ALSO returns
  // the class this instructor owns, which is what the scoped read below needs.
  // Fails closed: no class, no comparison.
  const { classId, classes } = await requireInstructor();
  if (!classId) notFound();

  const rows = await loadGenerationGroup(groupId, classId);
  // Empty now means one of two things, and they are deliberately indistinguishable
  // from outside: the group does not exist, or it belongs to another class.
  //
  // GATE 6, DESIGN QUESTION A: with one exception, which is the caller's OWN
  // other class. That case is named rather than hidden. Another instructor's
  // group still matches nothing and still 404s.
  if (rows.length === 0) {
    const owner = await findGenerationGroupOwnedClass(
      groupId,
      classes.map((c) => c.id),
    );
    const elsewhere = otherOwnedClass(owner, classes, classId);
    if (elsewhere) {
      return (
        <OtherClassNotice
          className={elsewhere.name}
          classId={elsewhere.id}
          thing="comparison"
        />
      );
    }
    notFound();
  }

  // The winner, if this generation has already been decided. Any switched-on row
  // means a pick has been made.
  const winner = rows.find((row) => row.enabled) ?? null;
  const decided = winner !== null;
  // PD-8g: HAS A PERSONA BEEN PICKED AT ALL? This is a WIDER question than
  // `decided`, and the difference is the whole reason two names exist.
  //
  // `decided` asks "is a candidate switched ON right now", which is what the
  // green live-case panel and the Choose footer key on, and that is still
  // correct for them.
  //
  // `picked` asks "has this generation stopped being an undecided pair", which
  // is the question the two cards below are really asking. It is true one row
  // is on, AND true when the group has come down to a SINGLE row, because
  // choosing a winner DELETES the loser. That second case is exactly what a
  // chosen persona that was later turned off looks like (Recent generations
  // offers "Turn off" on a live case), and in that state the old wording told
  // the instructor that "both are saved and turned off" when there was only
  // one, and flagged the single row as fewer than "the usual two" when one row
  // is the normal, healthy result of having picked.
  const picked = decided || rows.length === 1;
  // A row that is still off after a pick was made is a loser that could not be
  // deleted, which only happens when something is using it.
  const retainedLosers = decided ? rows.filter((row) => !row.enabled) : [];

  return (
    <main className="mx-auto w-full max-w-page space-y-5 px-6 pb-10 pt-5">
      <div>
        <Link
          href="/instructor/scaffold"
          className="text-body text-content-secondary underline"
        >
          Back to AI Persona Framework
        </Link>
        {/* An h2, not an h1: the page title in the shared instructor header
            above is the h1. */}
        {/* PD-8g: ONE heading for both states. It used to switch between
            "Compare the candidates" and "The chosen persona"; it is now
            "Personas" either way, so the page does not rename itself under the
            instructor when they pick. The paragraph below still changes, which
            is where the state is actually said. */}
        <h2 className="mt-2 text-page-title font-medium">Personas</h2>
        {/* THIS PARAGRAPH KEYS ON `picked`, NOT ON `decided`, and that is the
            fix rather than the wording. It used to ask `decided` (is a row
            switched ON), so the chosen-then-turned-off state fell through to
            the ELSE branch and told the instructor to "read them field by field
            and decide which one is the more appropriate buyer" on a page
            showing one already-chosen persona. Same class of bug as the two
            cards below, and it was left behind when those were moved onto
            `picked`: three things on this page describe the pick, and all three
            have to ask the same question.

            The decided sentence also lost its second half. It said the
            comparison was "kept below for reference", which is not true: the
            loser is DELETED when a winner is chosen, so what is below is the
            chosen persona on its own. */}
        <p className="mt-1 text-body text-content-secondary">
          {picked
            ? "You have already picked a winner from this generation."
            : "Two AI-generated buyer personas built from the same case. Read them field by field and decide which one is the more appropriate buyer."}
        </p>
      </div>

      {/* What state these rows are in, said plainly. */}
      {decided ? (
        <div className="rounded-lg border border-green-300 bg-surface-success p-4 text-body text-content-success">
          <p>
            <span className="font-medium">
              {winner.persona_name} is switched ON.
            </span>{" "}
            Saved as{" "}
            <span className="font-medium">{winner.title}</span>, and now
            available in the create-assignment list. Attach a rubric when you
            create the assignment and it will be graded; leave the rubric off
            and the practice is conversation only.
          </p>
          <p className="mt-2">
            Before anyone else sees this case, role-play it once yourself through
            a normal assignment. Reading the fields shows whether the case is
            coherent; only a conversation shows how the persona actually behaves.
          </p>
          {retainedLosers.length > 0 && (
            <p className="mt-2 rounded-md bg-surface-warning p-2 text-content-warning">
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
            <div className="mt-4 rounded-md border border-line-secondary bg-white p-3 text-content-primary">
              <p className="font-medium text-content-primary">
                Build the second meeting for this case
              </p>
              <p className="mt-1 text-content-primary">
                {winner.persona_name} is a gatekeeper, so this case has a second
                meeting in it: the decision maker they control access to. The
                shared details carry over, so you only choose who that person is
                and what the seller has to earn from them. Same shape as Jordan
                following Alex, and the two stay independently assignable.
              </p>
              <Link
                href={`/instructor/scaffold/chain/${winner.id}`}
                className={buttonClasses({ size: "sm", className: "mt-3" })}
              >
                Generate the decision maker
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {/* PD-8g: this card describes an UNDECIDED PAIR, so it is gated on
          `picked` rather than on `decided`. Once a persona has been chosen it is
          simply removed: "both are saved and turned off" is false the moment
          there is only one of them, and it stayed on screen in the
          chosen-then-turned-off state, which is where the wrong sentence was
          actually being read. */}
      {!picked && (
        <div className={cardClasses({ tone: "muted", className: "text-body text-content-primary" })}>
          <p>
            <span className="font-medium">Both are saved and turned OFF.</span>{" "}
            Neither can be assigned to a student or started by one. Whether a
            case is graded is decided by the rubric on the assignment, not here.
          </p>
          <p className="mt-2 text-content-secondary">
            Choosing one switches it on and permanently deletes the other. Before
            you choose, you can customise either candidate: your edits rebuild
            its briefing and persona instructions from the same fixed template,
            with no AI involved, and they carry through to the live case if you
            then choose it.
          </p>
        </div>
      )}

      {/* ONE SLOT, TWO MEANINGS, decided by whether a pick has been made.
          A single row after a pick is the NORMAL outcome (the loser is deleted),
          so it is labelled as the chosen persona. A single row with no pick
          behind it is still the anomaly the old warning was written for, and it
          keeps the warning. */}
      {rows.length === 1 && picked ? (
        <p className={cardClasses({ tone: "muted", className: "text-body text-content-primary" })}>
          This is your selected candidate.
        </p>
      ) : !picked && rows.length !== 2 ? (
        <p className="rounded-lg border border-amber-300 bg-surface-warning p-4 text-body text-content-warning">
          This generation has {rows.length} candidate
          {rows.length === 1 ? "" : "s"} saved rather than the usual two.
        </p>
      ) : null}

      {/* The aligned comparison. One row per field, candidates side by side. */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-body">
          <thead>
            <tr className="border-b border-line-secondary">
              <th className="w-52 p-3 text-left align-bottom text-meta font-medium uppercase tracking-wide text-content-secondary">
                Field
              </th>
              {/* PD-8g: the "Candidate 1" / "Candidate 2" line above each name
                  is gone, in BOTH states. The persona's own name is the heading
                  now: the column position already says which is which, and
                  numbering them added a label nobody refers to. The "Chosen"
                  marker stays, because that one carries state rather than an
                  index, and it moves up beside the name it belongs to. */}
              {rows.map((row) => (
                <th key={row.id} className="p-3 text-left align-bottom">
                  <span className="block text-body font-semibold text-content-primary">
                    {row.persona_name}
                    {decided && row.enabled && (
                      <span className="ml-2 rounded bg-surface-success px-1.5 py-0.5 text-meta font-medium uppercase tracking-wide text-content-success">
                        Chosen
                      </span>
                    )}
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
                    ? "border-b border-line-tertiary bg-surface-secondary"
                    : "border-b border-line-tertiary"
                }
              >
                <th className="p-3 text-left align-top font-medium text-content-primary">
                  {field.label}
                  {field.hint && (
                    <span className="mt-1 block text-meta font-normal text-content-secondary">
                      {field.hint}
                    </span>
                  )}
                </th>
                {rows.map((row) => (
                  <td key={row.id} className="p-3 align-top text-content-primary">
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
              generation is still undecided.

              Customise sits with it, above the pick, because both are decisions
              about the same candidate and editing is something you do INSTEAD of
              picking, at least for now. Editing is candidates-only, before a
              winner is chosen, which is exactly when this footer is shown. */}
          {!decided && (
            <tfoot>
              <tr>
                <td className="p-3" />
                {rows.map((row) => (
                  <td key={row.id} className="space-y-2 p-3 align-top">
                    <Link
                      href={`/instructor/scaffold/edit/${row.id}`}
                      className={buttonClasses({ variant: "secondary", fullWidth: true })}
                    >
                      Customise {row.persona_name}
                    </Link>
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
      <div className={cardClasses()}>
        <h2 className="text-section font-medium text-content-secondary">
          Where the argument landed
        </h2>
        <p className="mt-1 text-body text-content-secondary">
          The win condition is read by the STUDENT in their briefing. What earns
          the win is hidden and is what actually gates the close. If the
          persuasive argument sits in the win condition, the student is handed
          part of the case they were supposed to build themselves.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {rows.map((row) => {
            const candidate = row.generation_fields?.candidate;
            return (
              <div key={row.id} className="space-y-3 rounded-md bg-surface-secondary p-3">
                {/* PD-8g: the persona's name alone, with the "Candidate N:"
                    prefix dropped here for the same reason it went from the
                    table head. */}
                <h3 className="text-body font-semibold">{row.persona_name}</h3>
                <div>
                  <h4 className="text-meta font-medium uppercase tracking-wide text-content-secondary">
                    Win condition (shown to the student)
                  </h4>
                  <p className="mt-1 text-body text-content-primary">
                    {candidate?.win_condition || <Missing />}
                  </p>
                </div>
                <div>
                  <h4 className="text-meta font-medium uppercase tracking-wide text-content-secondary">
                    What earns the win (hidden)
                  </h4>
                  <div className="mt-1 text-body text-content-primary">
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
        <h2 className="text-section font-medium text-content-secondary">
          The assembled scenario text
        </h2>
        <p className="text-body text-content-secondary">
          Built from the fields above by the fixed template, so the case you
          compare and the persona a student would meet cannot drift apart.
        </p>
        {rows.map((row) => (
          <details
            key={row.id}
            className={cardClasses()}
          >
            <summary className="cursor-pointer text-body font-medium">
              {row.persona_name}
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-meta font-medium uppercase tracking-wide text-content-secondary">
                  Scenario context (what the student is briefed on)
                </h3>
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-surface-secondary p-3 text-body">
                  {row.scenario_context}
                </p>
              </div>
              <div>
                <h3 className="text-meta font-medium uppercase tracking-wide text-content-secondary">
                  Persona system prompt (what the AI is told to be)
                </h3>
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-surface-secondary p-3 text-body">
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
