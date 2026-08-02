"use client";

// The chain form: generating the decision maker that pairs with a chosen
// gatekeeper.
//
// Most of the case is NOT asked for again. The industry, the product, the seller
// company type, the company size, and the company the gatekeeper works at all
// carry over from the winner, and they are shown here read-only so the admin can
// see exactly what is being reused. Only two things are genuinely about this
// second meeting, so only two things are editable: who this person is, and what
// the seller has to earn from them.
//
// Nothing typed here decides what carries over. The server reads the shared
// details from the gatekeeper's own row, so the carryover cannot be altered from
// the browser; these read-only boxes are a display of that, not the source.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { controlClasses, labelClasses } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

// The two control names stay, so every use site below is unchanged; they now
// hand the work to the shared form primitives. carriedClass is not a control at
// all: it is the read-only box showing what was carried over from the
// gatekeeper, so it keeps the quieter panel surface.
const inputClass = controlClasses();
const labelClass = labelClasses("mb-1");
const carriedClass =
  "rounded-md border border-line-tertiary bg-surface-secondary px-3 py-2 text-body text-content-secondary";

export function ChainForm({
  gatekeeperId,
  gatekeeperName,
  gatekeeperRole,
  gatekeeperWinCondition,
  company,
  industry,
  productOrService,
  sellerCompanyType,
  suggestedRole,
}: {
  gatekeeperId: string;
  gatekeeperName: string;
  gatekeeperRole: string;
  gatekeeperWinCondition: string;
  company: string;
  industry: string;
  productOrService: string;
  sellerCompanyType: string;
  suggestedRole: string;
}) {
  const router = useRouter();
  // Pre-filled from who the gatekeeper gates access to, since that field names
  // this exact person. Editable, because it is usually a description ("the
  // operations director who approves the trial") rather than a job title.
  const [personaRole, setPersonaRole] = useState(suggestedRole);
  const [winCondition, setWinCondition] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedGroupId, setSavedGroupId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSavedGroupId("");
    setLoading(true);

    try {
      const res = await fetch("/api/instructor/scaffold/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainFromScenarioId: gatekeeperId,
          personaRole,
          winCondition,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Generation failed. Please try again.");
        setLoading(false);
        return;
      }

      // Same destination as an ordinary generation: the compare view for the new
      // pair. The loading state stays on until the next page paints, so there is
      // no idle-looking moment that invites a second generation.
      setSavedGroupId(String(data.groupId ?? ""));
      router.push(`/instructor/scaffold/compare/${data.groupId}`);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className={cardClasses({ className: "space-y-4" })}
      >
        {/* What carries over, shown so the admin can see the case is shared. */}
        <div>
          <h2 className="font-medium">Carried over from {gatekeeperName}</h2>
          <p className="mt-1 mb-3 text-body text-content-secondary">
            These are reused so both meetings are one coherent case at one
            company. They cannot be edited here.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={labelClass}>The company</span>
              <p className={carriedClass}>{company}</p>
            </div>
            <div>
              <span className={labelClass}>Industry</span>
              <p className={carriedClass}>{industry}</p>
            </div>
            <div>
              <span className={labelClass}>Product or service</span>
              <p className={carriedClass}>{productOrService}</p>
            </div>
            <div>
              <span className={labelClass}>Seller company type</span>
              <p className={carriedClass}>{sellerCompanyType}</p>
            </div>
          </div>
          <div className="mt-3">
            <span className={labelClass}>
              The first meeting: what the seller earned from {gatekeeperName},
              the {gatekeeperRole}
            </span>
            <p className={carriedClass}>{gatekeeperWinCondition}</p>
          </div>
        </div>

        <div className="border-t border-line-tertiary pt-4">
          <h2 className="font-medium">The decision maker</h2>
          <p className="mt-1 mb-3 text-body text-content-secondary">
            The two things that are about this second meeting.
          </p>

          <div className="space-y-3">
            <div>
              <label className={labelClass}>Their role</label>
              <input
                type="text"
                required
                value={personaRole}
                onChange={(e) => setPersonaRole(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-meta text-content-secondary">
                Pre-filled from who {gatekeeperName} gates access to. Trim it to
                a job title if it reads as a description.
              </p>
            </div>

            <div>
              <label className={labelClass}>
                Win condition (if it is a trial, give the terms)
              </label>
              <textarea
                required
                rows={3}
                placeholder="A trial order of one pallet on a single line"
                value={winCondition}
                onChange={(e) => setWinCondition(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-meta text-content-secondary">
                This is the real close, not another meeting. The first meeting
                already earned the introduction.
              </p>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate two decision makers"}
        </Button>

        {loading && (
          <p className="text-body text-content-secondary">
            Writing two personas. This usually takes twenty to sixty seconds, so
            please leave this page open.
          </p>
        )}

        {error && <p className="text-body text-content-danger">{error}</p>}
      </form>

      {/* Fallback, so a slow or blocked navigation never strands the instructor
          on a page with no way to reach what was just saved. */}
      {savedGroupId && (
        <div className={cardClasses()}>
          <h2 className="font-medium">Two candidates saved</h2>
          <p className="mt-1 text-body text-content-secondary">
            <Link
              href={`/instructor/scaffold/compare/${savedGroupId}`}
              className="underline"
            >
              Compare them side by side
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
