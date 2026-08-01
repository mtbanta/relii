// Editing ONE generated candidate persona, before a winner is chosen.
//
// WHY THIS IS ITS OWN PAGE rather than inline editing in the compare grid: the
// compare view is a fixed two-column table whose whole job is reading two
// candidates side by side, field by field. Eight editable fields, five of them
// multi-line lists and one of them paired fact-and-detail rows, would destroy
// that reading. This page gives one candidate the room it needs, and saving
// returns to the comparison, so the edit is visible there in one click.
//
// Nothing here rewrites the persona. Saving sends the edited structured fields
// to /api/instructor/scaffold/edit, which re-runs the existing fixed template
// over them. There is no AI call in the edit path at all.
//
// Instructor-gated like every other scaffolding page. The save route checks the
// caller's role again for itself, because a route can be reached directly.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInstructor } from "@/lib/instructor-auth";
import {
  loadCandidateById,
  loadGenerationGroup,
  resolveChainForReassembly,
  chainRoleLabel,
  meetingTypeLabel,
} from "@/lib/scaffold-candidates";
import { EditCandidateForm } from "@/components/edit-candidate-form";

// The two states worth explaining rather than 404ing, because the instructor can
// act on both. Same shape as the chain page's refusals.
function Blocked({
  groupId,
  heading,
  children,
}: {
  groupId: string | null;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-8 pb-12 pt-6">
      <Link
        href="/instructor/scaffold"
        className="text-sm text-gray-500 underline"
      >
        Back to Persona Scaffolding
      </Link>
      {/* An h2, not an h1: the page title in the shared instructor header above
          is the h1. */}
      <h2 className="text-section font-semibold">{heading}</h2>
      <div className="space-y-3 text-sm text-gray-600">{children}</div>
      {groupId && (
        <Link
          href={`/instructor/scaffold/compare/${groupId}`}
          className="inline-block text-sm underline"
        >
          Back to the comparison
        </Link>
      )}
    </main>
  );
}

export default async function EditCandidatePage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;

  await requireInstructor();

  const row = await loadCandidateById(candidateId);
  const candidate = row?.generation_fields?.candidate;
  const inputs = row?.generation_fields?.inputs;

  // It has to be a generated candidate with its fields intact. Anything else,
  // including Alex and Jordan (which have no generation fields at all), has
  // nothing to edit.
  if (!row || !row.generation_group_id || !candidate || !inputs) notFound();

  // Editing is for candidates BEFORE a winner is chosen. Checked here at page
  // load as well as in the save route, so a tab left open since before the pick
  // shows an explanation instead of a form whose save would be refused.
  const group = await loadGenerationGroup(row.generation_group_id);
  if (group.some((other) => other.enabled)) {
    return (
      <Blocked groupId={row.generation_group_id} heading="This case is already decided">
        <p>
          A winner has been chosen for this generation, so its candidates are no
          longer editable. Editing applies to candidates only, while you are
          still deciding between them.
        </p>
      </Blocked>
    );
  }

  // Can this candidate's text be rebuilt faithfully? For a chained decision maker
  // generated before the chain was stored, the answer is no, and the honest
  // thing is to say so here rather than to let the form be filled in and then
  // refuse the save.
  const resolution = resolveChainForReassembly(
    row.chain_role,
    row.generation_fields ?? {},
  );
  if (!resolution.ok) {
    return (
      <Blocked
        groupId={row.generation_group_id}
        heading="This candidate cannot be edited"
      >
        <p>{resolution.reason}</p>
        <p>
          Nothing is wrong with the case itself: it can still be compared,
          chosen, and role-played exactly as it is. Only editing is unavailable.
        </p>
      </Blocked>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-8 pb-12 pt-6">
      <div>
        <Link
          href={`/instructor/scaffold/compare/${row.generation_group_id}`}
          className="text-sm text-gray-500 underline"
        >
          Back to the comparison
        </Link>
        <h2 className="mt-2 text-section font-semibold">
          Customise {candidate.persona_name}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Change what this buyer is like, and the briefing and the persona
          instructions are rebuilt from your edits by the same fixed template
          that wrote them in the first place. Nothing is re-invented and no AI is
          called, so what you compare on screen stays exactly what a student
          would meet.
        </p>
      </div>

      {/* The three locked pairs, shown so it is clear they are structural rather
          than missing. The save route never reads them from the browser, so
          this panel is a description of the case, not a disabled input. */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
        <h3 className="font-medium text-gray-900">
          Fixed for this case, and not editable here
        </h3>
        <p className="mt-1 text-gray-600">
          These three are structural: the rest of the case, and the second
          meeting if this one has one, are all built on them.
        </p>
        <dl className="mt-3 space-y-3 text-gray-800">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Meeting type and chain position
            </dt>
            <dd>
              {meetingTypeLabel(row.meeting_type)}.{" "}
              {chainRoleLabel(row.chain_role)}
              {candidate.chain_position?.gates_access_to
                ? `, gating access to ${candidate.chain_position.gates_access_to}`
                : ""}
              .
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Win condition and close terms
            </dt>
            <dd>{candidate.win_condition}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Company (type and size)
            </dt>
            <dd>
              {candidate.company.size} {candidate.company.type}
            </dd>
          </div>
        </dl>
      </div>

      <EditCandidateForm
        candidateId={row.id}
        groupId={row.generation_group_id}
        candidate={candidate}
      />
    </main>
  );
}
