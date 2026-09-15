// One CHOSEN persona as the AI Persona Framework list renders it: what it is,
// the pairing line, the link to View Persona, and the On and Off toggle.
//
// ==> WHY THIS IS A COMPONENT OF ITS OWN RATHER THAN MARKUP INSIDE THE PAGE.
//     The page is an async Server Component that begins by checking who is
//     signed in, so it cannot be rendered in a check script. This entry can, and
//     scripts/check-persona-list.mjs renders THIS FILE, not a copy of it. That
//     is the difference between a check that measures the shipped list and a
//     check that measures a second version of the list written to pass. <==
//
// ==> EVERY VALUE IT DISPLAYS COMES FROM A SCENARIO COLUMN AND NEVER FROM THE
//     GENERATED JSON. Tom may later want Alex and Jordan copied into his class
//     as a linked pair, and those rows would carry generation_fields null: no
//     industry, no candidate details, nothing. The persona name and the title
//     are columns on every scenario row that has ever existed, so this entry
//     still renders and still identifies the persona. The industry line simply
//     does not appear. That is what the ruling 6 check measures. <==
import Link from "next/link";
import { PersonaToggle } from "@/components/persona-toggle";
import { PersonaPairing } from "@/components/persona-pairing";
import { chainRoleLabel } from "@/lib/scaffold-candidates";
import type { ChosenPersona } from "@/lib/scaffold-candidates";
import { formatInstant } from "@/lib/app-time";

export function ChosenPersonaEntry({ persona }: { persona: ChosenPersona }) {
  // A generation can only be discarded as a whole, and only when every row in
  // it is switched off and unused. A chosen persona that kept a used losing
  // candidate therefore cannot be discarded at all, which is why the retained
  // rows are checked here and not only the chosen one.
  const anyUsed = persona.row.used || persona.retained.some((row) => row.used);

  return (
    <li className="flex items-start justify-between gap-4 p-3">
      <div className="text-body">
        <span className="font-medium">{persona.row.personaName}</span>
        <span className="text-content-secondary">
          {persona.industry ? `, ${persona.industry}` : ""}
        </span>
        <span className="mt-0.5 block text-meta text-content-secondary">
          {persona.row.title}
        </span>
        <span className="mt-0.5 block text-meta text-content-secondary">
          {chainRoleLabel(persona.row.chainRole)}, added{" "}
          {formatInstant(persona.createdAt)}
        </span>
        <PersonaPairing pairedWith={persona.row.pairedWith} />
        {persona.retained.length > 0 && (
          <span className="mt-0.5 block text-meta text-content-secondary">
            The losing candidate (
            {persona.retained.map((row) => row.personaName).join(", ")}) could
            not be deleted, because a session or an assignment is using it. It is
            switched off.
          </span>
        )}
        <Link
          href={`/instructor/scaffold/compare/${persona.groupId}`}
          className="mt-1 inline-block text-body underline"
        >
          View Persona
        </Link>
      </div>
      <PersonaToggle
        scenarioId={persona.row.id}
        groupId={persona.groupId}
        personaName={persona.row.personaName}
        enabled={persona.row.enabled}
        assignmentTitles={persona.row.assignmentTitles}
        canDiscard={!persona.row.enabled && !anyUsed}
        usedNote={anyUsed}
      />
    </li>
  );
}
