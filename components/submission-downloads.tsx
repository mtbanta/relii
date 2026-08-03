// THE DOWNLOAD CELL on one submissions-table row.
//
// THREE SEPARATE ICONS: video, transcript, scores. This REVERSES PD-8e, which
// put a single download icon here opening a native <details> menu, and it is the
// owner's call rather than a rebuild: one click instead of two, and every
// download visible without opening anything. The menu's two good properties are
// carried over deliberately, because they are what made it defensible:
//
//   1. AN UNAVAILABLE DOWNLOAD IS DIMMED, NEVER DROPPED. A text submission has
//      no recording, so its video icon greys out and stays in place. Every row
//      then has the same shape, and an instructor is never left wondering
//      whether a control is missing or simply does not apply to that row.
//   2. EVERY ICON KEEPS ITS ACCESSIBLE NAME AND ITS TOOLTIP, both naming the
//      student and the file, since three bare glyphs in a 13% column are
//      otherwise a guessing game. That is what <ActionIcon> exists for.
//
// The routes are untouched. Each icon hits the same instructor-gated endpoint the
// menu items did, and the server does its own gating, so nothing here is a
// permission boundary. No JavaScript: these are three plain links.
import {
  ActionIcon,
  IconFileText,
  IconTable,
  IconVideo,
} from "@/components/ui/icon";

// The accent colour is on at REST, never on hover alone: a hover-only treatment
// cannot advertise a control, because the reader has to already know it is there
// to hover it, and a touch screen has no hover. (The third resting-affordance
// audit, PD-8e.)
const LINK =
  "inline-flex rounded-md p-1 text-content-info hover:bg-surface-tertiary";

export function SubmissionDownloads({
  sessionId,
  // Null when this submission has no recording (a text submission, or a call
  // where the camera never produced a file). See rule 1 above.
  hasVideo,
  // Named in every tooltip and accessible name, so a screen reader user knows
  // which row's downloads they are on.
  studentName,
}: {
  sessionId: string;
  hasVideo: boolean;
  studentName: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {hasVideo ? (
        <a
          href={`/api/instructor/submission/${sessionId}/video`}
          className={LINK}
        >
          <ActionIcon
            icon={IconVideo}
            label={`Download ${studentName}'s video`}
          />
        </a>
      ) : (
        // DIMMED, not removed. It is a <span> rather than a disabled link
        // because there is nothing to go to; the title says why, and the
        // aria-label says the same thing to a screen reader.
        <span className="inline-flex p-1 text-content-tertiary">
          <ActionIcon
            icon={IconVideo}
            label={`No recording for ${studentName}`}
          />
        </span>
      )}

      <a
        href={`/api/instructor/submission/${sessionId}/transcript`}
        className={LINK}
      >
        <ActionIcon
          icon={IconFileText}
          label={`Download ${studentName}'s transcript`}
        />
      </a>

      <a href={`/api/instructor/submission/${sessionId}/csv`} className={LINK}>
        <ActionIcon
          icon={IconTable}
          label={`Download ${studentName}'s scores (CSV)`}
        />
      </a>
    </div>
  );
}
