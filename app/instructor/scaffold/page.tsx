// Persona scaffolding: the instructor fills in a case and the AI writes two
// candidate personas in the Alex and Jordan style, shown here for review.
//
// This page is gated the same way the instructor dashboard is: signed in, with
// the role read from the database. The generate route checks the caller's role
// again for itself, because a route can be reached without ever loading this
// page.
//
// Generating writes both candidates into the database as DISABLED,
// conversation-only scenarios. Picking a winner, enabling it, and deleting the
// loser is chunk 2d.
import Link from "next/link";
import { requireInstructor } from "@/lib/instructor-auth";
import { ScaffoldForm } from "@/components/scaffold-form";
import { GenerationActions } from "@/components/generation-actions";
import { DiscardAllGenerations } from "@/components/discard-all-generations";
import {
  loadRecentGenerations,
  chainRoleLabel,
} from "@/lib/scaffold-candidates";

export default async function ScaffoldPage() {
  // The shared instructor layout already gated this page (signed in, an
  // instructor, and past the name gate); this confirms it again for the page
  // itself, since a page can be requested directly.
  await requireInstructor();

  const recent = await loadRecentGenerations();

  return (
    <main className="mx-auto w-full max-w-page space-y-5 px-6 pb-10 pt-5">
      {/* No back link: this is one of the five destinations in the instructor
          nav above, so the nav is how you leave it. The heading is an h2,
          because the page title in the shared header is the h1. */}
      <div>
        <h2 className="text-page-title font-medium">Persona Scaffolding</h2>
        <p className="mt-1 text-body text-content-secondary">
          Describe a sales case and the AI writes two candidate buyer personas
          in the same style as Alex and Jordan. Both are saved turned OFF, so no
          student can be given one, and you compare them side by side before
          anything goes live.
        </p>
      </div>

      <ScaffoldForm />

      {/* Past generations, so a compare view is never lost just because the web
          address was not kept. */}
      <div className="space-y-2">
        <h3 className="text-card-title font-medium">Recent generations</h3>
        {recent.length === 0 ? (
          <p className="text-body text-content-secondary">
            Nothing generated yet. Your saved candidate pairs will be listed
            here.
          </p>
        ) : (
          <ul className="divide-y divide-line-tertiary rounded-lg border border-line-tertiary">
            {recent.map((generation) => (
              <li
                key={generation.groupId}
                className="flex items-start justify-between gap-4 p-3"
              >
                <div className="text-body">
                  <span className="font-medium">
                    {generation.personaNames.join(" and ")}
                  </span>
                  <span className="text-content-secondary">
                    {generation.industry ? `, ${generation.industry}` : ""}
                  </span>
                  <span className="mt-0.5 block text-meta text-content-secondary">
                    {chainRoleLabel(generation.chainRole)}, generated{" "}
                    {new Date(generation.createdAt).toLocaleString()}
                  </span>
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
