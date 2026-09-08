// The Privacy Policy, readable WITHOUT signing in (Phase 5).
//
// Signed out on purpose: app/register/page.tsx links here, so it has to be
// readable before an account exists. lib/supabase/middleware.ts lists this path
// as public, which is what keeps the proxy from bouncing a signed-out visitor to
// /login. app/page.tsx is not involved: that redirect is on "/" only.
//
// The words come from docs/Relii-Privacy-Policy.md and are not re-typed here.
import type { Metadata } from "next";
import { readLegalDocument } from "@/lib/legal-server";
import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy | Relii",
};

export default async function PrivacyPolicyPage() {
  const blocks = await readLegalDocument("privacy");
  return <LegalDocument blocks={blocks} />;
}
