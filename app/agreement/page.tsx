// The Relii.io Pilot Agreement, readable WITHOUT signing in (Phase 5).
//
// Signed out on purpose, for the same reason as /privacy: app/register/page.tsx
// links here, and the checkbox beside that link is what records consent, so the
// text has to be readable before the account exists.
//
// The words come from docs/Relii-clickthrough-agreement.md and are not re-typed
// here. THAT FILE'S LAST LINE CONTAINS AN EM DASH AND IT STAYS THERE: it is
// Tom's acknowledgment sentence, not ours. See the note at the top of
// lib/legal.ts and the Conventions section of CLAUDE.md.
import type { Metadata } from "next";
import { readLegalDocument } from "@/lib/legal-server";
import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Pilot Agreement | Relii",
};

export default async function PilotAgreementPage() {
  const blocks = await readLegalDocument("agreement");
  return <LegalDocument blocks={blocks} />;
}
