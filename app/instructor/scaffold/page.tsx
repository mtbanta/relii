// Persona scaffolding: the instructor fills in a case and the AI writes two
// candidate personas in the Alex and Jordan style, shown here for review.
//
// This page is gated the same way the instructor dashboard is: signed in, with
// the role read from the database. The generate route checks the caller's role
// again for itself, because a route can be reached without ever loading this
// page.
//
// Generating writes both candidates into the database as DISABLED,
// conversation-only scenarios. Choosing a winner enables it and deletes the
// loser.
//
// ==> PHASE 3b SPLIT THE ONE LIST BELOW INTO TWO SECTIONS, AND IT WAS A BUG FIX
//     RATHER THAN A LAYOUT PREFERENCE.
//
//     The old list showed the 8 most recent generations of every kind, which
//     was fine while it was only a record of recent activity. It stopped being
//     fine the moment this page became the place you switch a persona on and
//     off: a chosen persona older than the 8 most recent generations dropped
//     off the page, and a persona that is not on the page can never be switched
//     back on.
//
//     So CHOSEN PERSONAS are all listed, however old, and the cap now applies
//     to UNDECIDED CANDIDATE PAIRS only, which is what it was always for. The
//     two sections are not interleaved by date, deliberately: the sentence
//     saying only 8 are shown has to sit under the heading it is true of. <==
import Link from "next/link";
import { requireInstructor } from "@/lib/instructor-auth";
import { ScaffoldForm } from "@/components/scaffold-form";
import { GenerationActions } from "@/components/generation-actions";
import { ChosenPersonaEntry } from "@/components/chosen-persona-entry";
import { PersonaPairing } from "@/components/persona-pairing";
import { DiscardAllGenerations } from "@/components/discard-all-generations";
import { loadPersonaList, chainRoleLabel } from "@/lib/scaffold-candidates";
import { formatInstant } from "@/lib/app-time";

export default async function ScaffoldPage() {
  // The shared instructor layout already gated this page (signed in, an
  // instructor, and past the name gate); this confirms it again for the page
  // itself, since a page can be requested directly.
  //
  // GATE 3b: the class id is KEPT rather than discarded, because the lists below
  // show THIS class's personas only.
  const { classId } = await requireInstructor();

  // FAILS CLOSED. An instructor with no class sees nothing rather than
  // everybody's. After the Gate 3a repair that cannot happen, which is exactly
  // why the empty case shows nothing instead of falling back to an unscoped
  // read. The generate form below still renders; its route refuses with a
  // readable message for the same reason.
  const list = classId
    ? await loadPersonaList(classId)
    : { chosen: [], undecided: [], undecidedLimit: 8 };

  return (
    <main className="mx-auto w-full max-w-page space-y-5 px-6 pb-10 pt-5">
      {/* No back link: this is one of the five destinations in the instructor
          nav above, so the nav is how you leave it. The heading is an h2,
          because the page title in the shared header is the h1. */}
      <div>
        {/* PD-8g: the destination is called "AI Persona Framework" now. The
            ROUTE is still /instructor/scaffold, deliberately: renaming the path
            would break bookmarks and existing links and would show nobody
            anything. Label only. */}
        <h2 className="text-page-title font-medium">AI Persona Framework</h2>
        <p className="mt-1 max-w-reading text-body text-content-secondary">
          Describe a sales case and the AI writes two candidate buyer personas
          in the same style as Alex and Jordan. Both are saved turned OFF, so no
          student can be given one, and you compare them side by side before
          anything goes live.
        </p>
      </div>

      <ScaffoldForm />

      {/* SECTION ONE: the personas that are actually in service, or could be.
          Never capped. */}
      <div className="space-y-2">
        <h3 className="text-card-title font-medium">Chosen personas</h3>
        {list.chosen.length === 0 ? (
          <p className="text-body text-content-secondary">
            Nothing chosen yet. Once you pick a winner from a candidate pair it
            is listed here, with a switch to turn it on and off.
          </p>
        ) : (
          <ul className="divide-y divide-line-tertiary rounded-lg border border-line-tertiary">
            {list.chosen.map((persona) => (
              <ChosenPersonaEntry key={persona.row.id} persona={persona} />
            ))}
          </ul>
        )}
      </div>

      {/* SECTION TWO: pairs nobody has decided between yet. Capped. */}
      <div className="space-y-2">
        <h3 className="text-card-title font-medium">Recent candidate pairs</h3>
        <p className="max-w-reading text-body text-content-secondary">
          This shows the {list.undecidedLimit} most recent undecided pairs; every
          persona you have chosen stays listed above, however old.
        </p>
        {list.undecided.length === 0 ? (
          <p className="text-body text-content-secondary">
            Nothing waiting on a decision. Your saved candidate pairs will be
            listed here.
          </p>
        ) : (
          <ul className="divide-y divide-line-tertiary rounded-lg border border-line-tertiary">
            {list.undecided.map((generation) => (
              <li
                key={generation.groupId}
                className="flex items-start justify-between gap-4 p-3"
              >
                <div className="text-body">
                  <span className="font-medium">
                    {generation.rows.map((row) => row.personaName).join(" and ")}
                  </span>
                  <span className="text-content-secondary">
                    {generation.industry ? `, ${generation.industry}` : ""}
                  </span>
                  <span className="mt-0.5 block text-meta text-content-secondary">
                    {chainRoleLabel(generation.chainRole)}, generated{" "}
                    {formatInstant(generation.createdAt)}
                  </span>
                  {/* Both candidates of a chained pair come from the same
                      gatekeeper, so the line is shown once for the pair. */}
                  <PersonaPairing
                    pairedWith={
                      generation.rows.find((row) => row.pairedWith)?.pairedWith ??
                      null
                    }
                  />
                  <Link
                    href={`/instructor/scaffold/compare/${generation.groupId}`}
                    className="mt-1 inline-block text-body underline"
                  >
                    Compare
                  </Link>
                </div>
                <GenerationActions
                  groupId={generation.groupId}
                  rows={generation.rows}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The bulk tidy-up, kept at the bottom and away from everything else,
          because it is the one control here that can delete a lot at once. */}
      <div className="space-y-2 border-t border-line-tertiary pt-6">
        <h3 className="text-card-title font-medium">Clean up</h3>
        <p className="text-body text-content-secondary">
          Testing leaves candidate pairs behind. This removes every generated
          persona that is switched off and has never been used. It cannot touch
          Alex, Jordan, a chosen persona that is switched on, or anything a
          student has role-played.
        </p>
        <DiscardAllGenerations />
      </div>
    </main>
  );
}
