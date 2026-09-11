// The pairing line under a persona in the AI Persona Framework list.
//
// A decision maker generated from a chosen gatekeeper records which gatekeeper
// it came from, and this is where that shows. It reads from BOTH sides: the
// decision maker names its gatekeeper, and the gatekeeper names the decision
// maker built from it. Only one id is stored; the reverse direction is worked
// out in lib/scaffold-candidates.ts from the rows that were already read.
//
// ==> IT RENDERS NOTHING WHEN THERE IS NO PAIR, AND THAT IS THE OWNER'S RULING
//     RATHER THAN A STYLE CHOICE. Pairing is recorded on NEW generations only,
//     so a line reading "no pair recorded" would print under every persona that
//     already exists, which reads as a defect on personas that are perfectly
//     healthy. Absence of the line is what unpaired looks like. <==
//
// No "use client": it renders text and nothing else, so it stays a plain
// component that the server page and the ruling 6 check can both render.
import type { PairedWith } from "@/lib/scaffold-candidates";

export function PersonaPairing({
  pairedWith,
}: {
  pairedWith: PairedWith | null;
}) {
  if (!pairedWith) return null;

  return (
    <span className="mt-0.5 block text-meta text-content-secondary">
      Paired with the{" "}
      {pairedWith.role === "gatekeeper" ? "gatekeeper" : "decision maker"}{" "}
      <span className="font-medium">{pairedWith.name}</span>.
    </span>
  );
}
