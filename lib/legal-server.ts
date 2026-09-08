// Reading a legal document off disk (Phase 5). SERVER ONLY.
//
// This is separate from lib/legal.ts for one reason: that file holds the version
// constants, app/register/page.tsx is a client component, and it needs them. A
// "node:fs" import in a module a client component pulls in breaks the browser
// bundle for the registration page. So the filesystem lives here, imported only
// by the two policy pages, which are server components.
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  LEGAL_DOCS,
  parseLegalMarkdown,
  type LegalBlock,
  type LegalSlug,
} from "@/lib/legal";

// Read one document and parse it. Neither page uses cookies or headers, so both
// prerender at BUILD time, which means docs/ has to exist when the app is built
// (it always does, it is in the repo) rather than when a student visits.
export async function readLegalDocument(slug: LegalSlug): Promise<LegalBlock[]> {
  const source = await readFile(
    path.join(process.cwd(), LEGAL_DOCS[slug].file),
    "utf8",
  );
  return parseLegalMarkdown(source);
}
