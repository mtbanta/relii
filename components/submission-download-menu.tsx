// THE DOWNLOAD MENU on one submissions-table row (PD-8e).
//
// One icon per row, opening a compact menu with the three downloads. This
// replaces the old stacked "Video / Transcript / CSV" cluster, which put four
// lines of controls in every row and was the single largest reason the table's
// rows were tall and ragged.
//
// NATIVE <details> AND <summary>, deliberately, and for the same reasons the
// PD-8d rubric reached for them first: it is server-rendered, it needs no
// JavaScript, and it is keyboard accessible for free. Unlike the rubric, nothing
// here has to survive printing or be opened from elsewhere on the page, so the
// two things that ruled <details> out there do not apply.
//
// KNOWN AND ACCEPTED: a native <details> does not close when you click outside
// it. That is a deliberate trade rather than an oversight; closing it would mean
// adding a client component and a document listener for a menu of three links.
//
// The routes are untouched. Each item hits the same instructor-gated endpoint it
// always did, and the server does its own gating, so nothing here is a
// permission boundary.
import { Icon, IconDownload, IconFileText, IconTable, IconVideo } from "@/components/ui/icon";

export function SubmissionDownloadMenu({
  sessionId,
  // Null when this submission has no recording (a text submission, or a call
  // where the camera never produced a file). The menu still SHOWS the video row,
  // dimmed and relabelled, rather than dropping it: every row's menu then has the
  // same shape, so an instructor is never left wondering whether a control is
  // missing or simply does not apply here.
  hasVideo,
  // Named in the tooltip and the accessible name, so a screen reader user knows
  // which row's menu they opened.
  studentName,
}: {
  sessionId: string;
  hasVideo: boolean;
  studentName: string;
}) {
  const item =
    "flex items-center gap-1.5 px-2.5 py-1.5 text-micro text-content-info hover:bg-surface-tertiary";

  return (
    <details className="group relative inline-block">
      {/* The default disclosure triangle is suppressed (marker:hidden plus the
          webkit pseudo-element) so the icon is the only affordance. The icon
          carries the accent colour at REST, never on hover alone: a hover-only
          treatment cannot advertise a control, because the reader has to already
          know it is there to hover it, and a touch screen has no hover. */}
      <summary
        aria-label={`Download files for ${studentName}`}
        title={`Download files for ${studentName}`}
        className="inline-flex cursor-pointer list-none items-center rounded-md p-1 text-content-info marker:hidden hover:bg-surface-tertiary [&::-webkit-details-marker]:hidden"
      >
        <Icon icon={IconDownload} />
      </summary>

      <div className="absolute right-0 z-10 mt-1 min-w-36 overflow-hidden rounded-md border border-line-tertiary bg-surface-primary py-1 shadow-sm">
        {hasVideo ? (
          <a href={`/api/instructor/submission/${sessionId}/video`} className={item}>
            <Icon icon={IconVideo} />
            Video
          </a>
        ) : (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-micro text-content-tertiary"
            title="This submission has no recording"
          >
            <Icon icon={IconVideo} />
            No recording
          </span>
        )}

        <a href={`/api/instructor/submission/${sessionId}/transcript`} className={item}>
          <Icon icon={IconFileText} />
          Transcript
        </a>

        <a href={`/api/instructor/submission/${sessionId}/csv`} className={item}>
          <Icon icon={IconTable} />
          Scores (CSV)
        </a>
      </div>
    </details>
  );
}
