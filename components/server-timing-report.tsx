// PAGE PERFORMANCE INSTRUMENT (2026-09-16). Renders NOTHING unless
// RELII_SERVER_TIMING=1. See lib/server-timing.ts for what is measured and why
// it is written into the page rather than sent as a header.
//
// It is a JSON block with a non-script type, so the browser never runs it and
// nobody sees it; the measurement harness reads it with JSON.parse. It sits at
// the END of each measured layout and page, because a segment is drawn only
// after every await in it has finished, so the copy taken here holds every
// round trip that segment made. The layout and the page of one request share
// one store, so on a full load the later of the two copies holds both.
import { readTimingReport, serverTimingEnabled } from "@/lib/server-timing";

export function ServerTimingReport({ segment }: { segment: string }) {
  if (!serverTimingEnabled()) return null;
  const json = JSON.stringify(readTimingReport(segment)).replace(/</g, "\\u003c");
  return (
    <script
      type="application/json"
      data-relii-timing={segment}
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
