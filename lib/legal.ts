// THE LEGAL DOCUMENTS, THEIR VERSIONS, AND THE READER THAT RENDERS THEM (Phase 5).
//
// THE SOURCE OF TRUTH IS THE MARKDOWN FILE IN docs/, NOT THIS FILE AND NOT THE
// PAGE. Tom wrote both documents; the copies in docs/ are the cleaned canonical
// versions (headings normalised, export artifacts removed, not one word of prose
// changed). /privacy and /agreement read those files and render them. A revision
// from Tom is a file swap plus a version bump below, with no page to re-type and
// no chance of the page and the document drifting apart.
//
// ==> THE ONE EM DASH IN THIS REPO IS DELIBERATE AND MUST STAY. It is in the
//     acknowledgment sentence, line 51 of docs/Relii-clickthrough-agreement.md:
//     '**I Agree** - By checking this box...' (with a real em dash, not that
//     hyphen). The project's no-em-dash rule governs PROSE WE AUTHOR. It does
//     not govern legal text we reproduce, because reproducing it means
//     reproducing it. A repo-wide dash grep will find that line and it is not a
//     defect: see the Conventions section of CLAUDE.md, which carries the same
//     exemption next to the rule itself.
//
//     DO NOT "FIX" IT BY MOVING THE SENTENCE INTO THE CHECKBOX LABEL EITHER.
//     The agreement page shows Tom's full text verbatim, and the checkbox on the
//     register page carries a SHORT LABEL OF OUR OWN (see app/register/page.tsx),
//     which is ours to write and therefore follows the convention on its own.
//     Two different sentences with two different authors, and that is the point.
//
// THIS FILE HAS NO NODE IMPORTS AND THAT IS DELIBERATE. app/register/page.tsx is
// a client component and needs the two version constants, so anything that
// touches the filesystem lives in lib/legal-server.ts instead. Putting a
// "node:fs" import in here would break the browser bundle for the registration
// page, which is the one page that must never break.

// THE VERSION STRINGS. These are what a consent row records, and they are the
// ONLY place either version is named. The database refuses to create an account
// without a version (supabase/phase-5-consent.sql) but deliberately does not
// check WHICH version, so revising a document is a code deploy and the signup
// trigger is never touched again.
//
// GIT IS THE ARCHIVE, THE VERSION STRING IS THE KEY. We do not store a hash of
// the text, because the text of any version is recoverable from this repo's
// history forever. Bump the constant when the file changes and the consent rows
// separate old acceptances from new ones by themselves.
//
// The privacy policy dates itself (its own Effective Date, line 3). The pilot
// agreement carries no date at all, so we assign one: the date Tom confirmed it
// as the version to use. That assigned version is NOT printed on the page, on
// purpose. It is a number we invented and Tom did not write, and on a legal page
// it would read as part of his document.
export const PRIVACY_VERSION = "2026-09-07";
export const AGREEMENT_VERSION = "2026-09-05";

export type LegalSlug = "privacy" | "agreement";

export type LegalDoc = {
  slug: LegalSlug;
  // The file in docs/, relative to the repo root.
  file: string;
  version: string;
  // How the document is named in a link or a sentence. Not its heading: the
  // heading is inside the file and is rendered from there.
  label: string;
};

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  privacy: {
    slug: "privacy",
    file: "docs/Relii-Privacy-Policy.md",
    version: PRIVACY_VERSION,
    label: "Privacy Policy",
  },
  agreement: {
    slug: "agreement",
    file: "docs/Relii-clickthrough-agreement.md",
    version: AGREEMENT_VERSION,
    label: "Pilot Agreement",
  },
};

// ---------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------
// WHY THERE IS NO MARKDOWN LIBRARY HERE. Both documents use four shapes and
// nothing else, verified line by line against both files: a top heading, section
// headings, numbered items, and paragraphs, with bold as the only inline mark.
// A library would be a new dependency and a much larger surface for the sake of
// features neither document uses.
//
// TWO RULES MAKE THIS SAFE, AND THEY ARE WHAT THE ACCEPTANCE TEST MEASURES:
//   1. EVERY non-blank input line produces exactly one block or one list item.
//      Nothing is ever dropped. A line this parser does not recognise becomes a
//      paragraph carrying the line verbatim, so an unexpected shape renders
//      plainly rather than disappearing.
//   2. A block's plain text equals its input line with the heading marker and
//      the bold markers removed, and NOTHING else. In particular a numbered item
//      KEEPS ITS OWN NUMBER from the source rather than being renumbered by an
//      HTML list, so the page can never quietly renumber a legal document.
//
// A parser that silently drops a clause from a privacy policy is us rewording
// the legal text, which is the one thing this piece may not do. Hence rule 1.

export type Span = { text: string; bold: boolean };

export type LegalBlock =
  | { kind: "h1"; spans: Span[] }
  | { kind: "h2"; spans: Span[] }
  | { kind: "p"; spans: Span[] }
  | { kind: "list"; items: Span[][] };

// Split one line into plain and bold runs. "a **b** c" becomes three spans.
//
// THE UNMATCHED-MARKER GUARD: if a line holds an odd number of ** markers, the
// line is returned as a single plain span with its markers INTACT, because the
// alternative is deciding which marker to throw away and losing two characters
// of a legal document. Neither file has such a line today; this is here so that
// a future revision that does cannot lose text.
export function parseInline(line: string): Span[] {
  const parts = line.split("**");

  // An even number of markers splits into an odd number of parts.
  if (parts.length % 2 === 0) {
    return [{ text: line, bold: false }];
  }

  return parts
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((span) => span.text !== "");
}

// A numbered item: "1. ", "2. ", and so on at the start of a line.
const NUMBERED_ITEM = /^\d+\.\s/;

export function parseLegalMarkdown(source: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  // The list currently being collected, so consecutive numbered lines become one
  // list rather than one list each.
  let openList: Span[][] | null = null;

  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      openList = null;
      continue;
    }

    if (NUMBERED_ITEM.test(line)) {
      // The WHOLE line, its number included, is the item's text.
      const item = parseInline(line);
      if (openList) {
        openList.push(item);
      } else {
        openList = [item];
        blocks.push({ kind: "list", items: openList });
      }
      continue;
    }

    openList = null;

    if (line.startsWith("## ")) {
      blocks.push({ kind: "h2", spans: parseInline(line.slice(3)) });
    } else if (line.startsWith("# ")) {
      blocks.push({ kind: "h1", spans: parseInline(line.slice(2)) });
    } else {
      // Rule 1: anything else is a paragraph carrying the line verbatim.
      blocks.push({ kind: "p", spans: parseInline(line) });
    }
  }

  return blocks;
}
