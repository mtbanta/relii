"use client";

// The "save my own copy" controls on the results page: a Download video button
// and a Print / Save results button, with a short instruction so a brand-new
// student knows to choose "Save as PDF" in the print window.
//
// This is read-only. It downloads the recording the page already has a
// short-lived signed link to (no service-role key in the browser), and it opens
// the browser's own print dialog. Nothing is written or deleted.
//
// The whole bar is hidden when printing (print:hidden), so the saved PDF shows
// only the score and transcript, not these buttons.
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { downloadRecording, recordingFileName } from "@/lib/recording-download";

export function ResultsActions({
  downloadUrl,
  isVoice,
  filePrefix,
  conversationOnly = false,
}: {
  // The short-lived signed link to the recording, or null when there is no
  // recording to download (a text practice, the camera was off, or the upload
  // failed). When null we show a brief note instead of the button.
  downloadUrl: string | null;
  // Whether this was a voice session, used only to word the no-recording note.
  isVoice: boolean;
  // The start of the download filename, e.g. "relii-practice". The date and
  // time of the download are added on click.
  filePrefix: string;
  // A conversation-only session has no score, so the print hint must not offer
  // to save one.
  conversationOnly?: boolean;
}) {
  function downloadVideo() {
    if (!downloadUrl) return;
    downloadRecording(downloadUrl, recordingFileName(filePrefix));
  }

  return (
    <section className={cardClasses({ className: "mb-6 print:hidden" })}>
      <p className="mb-3 text-body font-medium">Save a copy for your records</p>

      <div className="flex flex-wrap items-center gap-3">
        {downloadUrl ? (
          <Button
            variant="secondary"
            onClick={downloadVideo}
          >
            Download video
          </Button>
        ) : (
          <p className="text-body text-content-secondary">
            {isVoice
              ? "No recording was saved for this session, so there is nothing to download."
              : "There is no recording for a text practice."}
          </p>
        )}

        <Button
          variant="secondary"
          onClick={() => window.print()}
        >
          Print / Save results
        </Button>
      </div>

      <p className="mt-2 text-meta text-content-secondary">
        Opens your browser&apos;s print window. Choose &quot;Save as PDF&quot; to
        download your {conversationOnly ? "transcript" : "score and transcript"}.
      </p>
    </section>
  );
}
