// THE PAGE THAT SHOWS ONE LEGAL DOCUMENT (Phase 5), used by /privacy and
// /agreement.
//
// It takes the parsed blocks from lib/legal.ts and draws them. It adds nothing
// to the document and takes nothing away: the words on screen are the words in
// docs/, and the acceptance test for this piece is a text diff between the two,
// not a look at the page.
//
// NO "use client". This is markup only, so both pages stay server-rendered and
// the markdown never has to reach a browser.
//
// THE WIDTH IS max-w-reading (30rem), NOT max-w-page. That token exists for
// exactly this: long-form prose at the 70rem page width is measurably harder to
// read. See the note on --container-reading in app/globals.css.
//
// A SIGNED-OUT VISITOR HAS NO HEADER AND NO NAV HERE, because these two pages
// are reachable signed out (that is the point of them: app/register/page.tsx
// links to them before an account exists). So the page carries its own way back
// rather than stranding someone who typed the address or followed a link out of
// a half-filled registration form.
import Link from "next/link";
import type { LegalBlock, Span } from "@/lib/legal";

// One line's worth of plain and bold runs. Bold is font-semibold rather than the
// app's usual font-medium because in these documents bold is doing real work: it
// labels the numbered items and carries the defined terms, and it has to be
// visible against body copy at 13px.
function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, i) =>
        span.bold ? (
          <strong key={i} className="font-semibold">
            {span.text}
          </strong>
        ) : (
          <span key={i}>{span.text}</span>
        ),
      )}
    </>
  );
}

export function LegalDocument({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <main className="mx-auto w-full max-w-reading px-6 py-10">
      <p className="mb-8 text-meta">
        <Link href="/register" className="text-content-info underline">
          Back to Relii
        </Link>
      </p>

      <article className="text-body text-content-primary">
        {blocks.map((block, i) => {
          switch (block.kind) {
            case "h1":
              return (
                <h1
                  key={i}
                  className="mb-4 text-page-title font-medium text-content-primary"
                >
                  <Spans spans={block.spans} />
                </h1>
              );

            // The section headings here are part of the document rather than
            // chrome, so they are primary-coloured, unlike the quiet
            // text-content-secondary section labels elsewhere in the app.
            case "h2":
              return (
                <h2
                  key={i}
                  className="mt-7 mb-2 text-section font-semibold text-content-primary"
                >
                  <Spans spans={block.spans} />
                </h2>
              );

            // Numbered items keep the source's own numbering (it is part of the
            // item's text), so list-none suppresses the markers the browser
            // would otherwise add on top. pl-6 with -indent-6 gives the hanging
            // indent, so a wrapped line starts under the words rather than under
            // the number.
            case "list":
              return (
                <ol key={i} className="mt-2 list-none space-y-2">
                  {block.items.map((item, j) => (
                    <li key={j} className="pl-6 -indent-6">
                      <Spans spans={item} />
                    </li>
                  ))}
                </ol>
              );

            case "p":
              return (
                <p key={i} className="mt-3">
                  <Spans spans={block.spans} />
                </p>
              );
          }
        })}
      </article>
    </main>
  );
}
