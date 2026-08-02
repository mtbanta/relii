"use client";

// The persona scaffolding form.
//
// The instructor fills in the case and clicks Generate. The server route writes
// TWO candidate personas into the database as DISABLED, conversation-only
// scenarios sharing one generation group, and returns that group's id.
//
// The candidates are not rendered here any more. They are read back from the
// database by the compare view, which is what makes the comparison survive a
// reload.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { controlClasses, labelClasses } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";

// This form styled its own controls before the shared layer existed. The two
// names stay, so every use site below is unchanged; they now hand the work to
// the shared form primitives.
const inputClass = controlClasses();
const labelClass = labelClasses("mb-1");

export function ScaffoldForm() {
  const router = useRouter();
  const [industry, setIndustry] = useState("");
  const [personaRole, setPersonaRole] = useState("");
  const [productOrService, setProductOrService] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [chainPosition, setChainPosition] = useState("gatekeeper");
  const [gatesAccessTo, setGatesAccessTo] = useState("");
  const [winCondition, setWinCondition] = useState("");
  const [sellerCompanyType, setSellerCompanyType] = useState("");

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
          industry,
          personaRole,
          productOrService,
          companySize,
          chainPosition,
          gatesAccessTo,
          winCondition,
          sellerCompanyType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Generation failed. Please try again.");
        setLoading(false);
        return;
      }

      // Both candidates are saved, so send the instructor to the compare view
      // for the pair. The group id is in the web address and the candidates are
      // in the database, which is what lets that page survive a reload.
      //
      // The loading state is deliberately NOT switched off here: the button
      // stays busy until the next page paints, so there is no dead moment where
      // the form looks idle and invites a second generation.
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
        className={cardClasses({ className: "space-y-3" })}
      >
        <h2 className="text-card-title font-medium">Case inputs</h2>

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

        {/* Chain position is the ONLY question here. The meeting type follows
            from it (gatekeeper means a discovery meeting, decision maker means
            the presentation and close), so it is no longer asked separately and
            the two can never disagree. */}
        <div>
          <label className={labelClass}>Chain position</label>
          <select
            value={chainPosition}
            onChange={(e) => setChainPosition(e.target.value)}
            className={inputClass}
          >
            <option value="gatekeeper">
              Gatekeeper (discovery meeting)
            </option>
            <option value="decision_maker">
              Decision maker (presentation and close)
            </option>
          </select>
          <p className="mt-1 text-meta text-content-secondary">
            {chainPosition === "gatekeeper"
              ? "A discovery meeting, like Alex. This persona controls access to someone else."
              : "A presentation and close, like Jordan. This persona can decide themselves."}
          </p>
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

        <Button
          type="submit"
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate two candidates"}
        </Button>

        {loading && (
          <p className="text-body text-content-secondary">
            Writing two personas. This usually takes twenty to sixty seconds,
            so please leave this page open.
          </p>
        )}

        {error && <p className="text-body text-content-danger">{error}</p>}
      </form>

      {/* Normally the redirect above has already happened by now. This is the
          fallback link, so a slow or blocked navigation never strands the
          instructor on a page with no way to reach what was just saved. */}
      {savedGroupId && (
        <div className={cardClasses()}>
          <h2 className="text-card-title font-medium">Two candidates saved</h2>
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
