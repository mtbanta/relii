// The chain: generating the decision maker that pairs with a chosen gatekeeper.
//
// This is the Alex-and-Jordan shape applied to a generated case. The gatekeeper
// meeting is the discovery; this second meeting is the presentation and close
// with the person that gatekeeper controls access to.
//
// The two resulting scenarios are INDEPENDENT. The decision maker's text refers
// back to the gatekeeper by name, exactly as Jordan's text refers to Alex, but
// that is narrative only: there is no prerequisite, no unlock, and nothing in
// the database links the two rows. Either can be assigned on its own.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCandidateById } from "@/lib/scaffold-candidates";
import { ChainForm } from "@/components/chain-form";

export default async function ChainPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;

  // Instructor-gated, like every other scaffolding page. The generate route
  // checks the caller's role again for itself.
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

  const gatekeeper = await loadCandidateById(scenarioId);
  const candidate = gatekeeper?.generation_fields?.candidate;
  const inputs = gatekeeper?.generation_fields?.inputs;

  // It has to be a generated candidate with its fields intact. Anything else
  // (including Alex and Jordan, which have no generation fields at all) has
  // nothing to carry over.
  if (!gatekeeper || !candidate || !inputs) notFound();

  // The two states that are worth explaining rather than 404ing, because the
  // admin can act on both.
  if (gatekeeper.chain_role !== "gatekeeper") {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-8 pb-12 pt-6">
        <Link href="/instructor/scaffold" className="text-sm text-gray-500 underline">
          Back to Persona Scaffolding
        </Link>
        {/* An h2, not an h1: the page title in the shared instructor header
            above is the h1. */}
        <h2 className="text-xl font-semibold">Nothing to chain from</h2>
        <p className="text-sm text-gray-600">
          {gatekeeper.persona_name} is a decision maker, and a decision maker
          gates nobody, so there is no second meeting to build. The chain starts
          from a gatekeeper.
        </p>
      </main>
    );
  }

  if (!gatekeeper.enabled) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-8 pb-12 pt-6">
        <Link href="/instructor/scaffold" className="text-sm text-gray-500 underline">
          Back to Persona Scaffolding
        </Link>
        <h2 className="text-xl font-semibold">Choose this gatekeeper first</h2>
        <p className="text-sm text-gray-600">
          {gatekeeper.persona_name} is switched off, so it is not a case anyone
          has settled on yet. Choose it first, and then come back to build its
          decision maker.
        </p>
        <Link
          href={`/instructor/scaffold/compare/${gatekeeper.generation_group_id}`}
          className="inline-block text-sm underline"
        >
          Open the comparison for {gatekeeper.persona_name}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-8 pb-12 pt-6">
      <div>
        <Link
          href="/instructor/scaffold"
          className="text-sm text-gray-500 underline"
        >
          Back to Persona Scaffolding
        </Link>
        <h2 className="mt-2 text-xl font-semibold">
          Build the decision maker for this case
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {gatekeeper.persona_name} is the gatekeeper. This builds the person
          they gate access to: the second meeting, where the seller presents and
          closes. It is the same shape as Jordan following Alex.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <p>
          You will get two candidates to compare and pick from, exactly as
          before, and both are saved switched OFF.
        </p>
        <p className="mt-2 text-gray-600">
          The two cases stay <span className="font-medium">independent</span>.
          The decision maker&apos;s briefing will mention the meeting with{" "}
          {gatekeeper.persona_name} the way Jordan&apos;s mentions Alex, but that
          is wording only: there is no prerequisite and no unlock, and either can
          be assigned on its own.
        </p>
      </div>

      <ChainForm
        gatekeeperId={gatekeeper.id}
        gatekeeperName={gatekeeper.persona_name}
        gatekeeperRole={candidate.role}
        gatekeeperWinCondition={candidate.win_condition}
        company={`${candidate.company.size} ${candidate.company.type}`}
        industry={inputs.industry}
        productOrService={inputs.productOrService}
        sellerCompanyType={inputs.sellerCompanyType}
        suggestedRole={candidate.chain_position?.gates_access_to ?? ""}
      />
    </main>
  );
}
