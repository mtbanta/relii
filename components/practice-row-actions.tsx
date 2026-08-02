"use client";

// THE ACTION GROUP ON ONE SAVED-PRACTICE ROW (PD-8d): Review, Download, Delete.
//
// WHY ALL THREE LIVE IN ONE COMPONENT. They used to be three unrelated things,
// and every one of them was hard to see. "Review" was a plain text link, Delete
// was a bare word in the exact colour of the date beside it with no underline at
// all (the app's clearest invisible control, carried on PD-8b's list), and there
// was no download here whatsoever: a student could not save a practice without
// first clicking into its results page. PD-8c then made the two existing ones
// read as even quieter, because the score beside them became a Badge with real
// visual weight. Fixing that is ONE design decision about the row's actions, not
// three separate patches, so the three now share a component and a look.
//
// THE LOOK: Review as a visible text link, then Download and Delete as small
// bordered icon buttons. PD-8d made all three icons; PD-8e brought Review back to
// text, because a row needs its primary action labelled (see the note at the
// control itself). The two icons carry real accessible names and tooltips, so
// "Download recording" and "Delete" are still announced and still appear on
// hover.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionIcon, IconDownload, IconTrash } from "@/components/ui/icon";
import { downloadRecording, recordingFileName } from "@/lib/recording-download";

// One shared shape for the icon controls. They carry BOTH a border and the
// accent colour at rest, so they are distinguishable from the row's data
// without any hover: a hover-only treatment cannot advertise a control, because
// the reader has to already know it is there to hover it, and on a touch screen
// there is no hover at all.
const ACTION =
  "inline-flex h-6 w-6 items-center justify-center rounded-md border border-line-tertiary bg-surface-primary text-content-info transition-colors hover:border-line-secondary hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:text-content-tertiary disabled:opacity-50";

export function PracticeRowActions({
  sessionId,
  downloadUrl,
}: {
  sessionId: string;
  // The short-lived signed link to this practice's recording, minted on the
  // server. Null when there is nothing to download: a text practice, a voice
  // practice where the camera was declined, or a recording whose upload failed.
  // In that case the control is rendered DISABLED with a plain explanation
  // rather than hidden, so the row keeps the same shape either way and the
  // student is never offered a file that does not exist.
  downloadUrl: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/practice/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Could not delete the practice.");
      }
      // The server removed the row and any recording; refresh to update the list.
      router.refresh();
    } catch (err) {
      setBusy(false);
      setConfirming(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  // The confirm step replaces the group in place, so the row never grows and the
  // question sits exactly where the action was.
  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-micro">
        <span className="text-content-secondary">Delete this practice?</span>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-md border border-content-danger px-2 py-0.5 font-medium text-content-danger transition-colors hover:bg-surface-danger disabled:opacity-50"
        >
          {busy ? "Deleting..." : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-md border border-line-tertiary px-2 py-0.5 text-content-secondary transition-colors hover:border-line-secondary disabled:opacity-50"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {error && (
        <span className="mr-1 text-micro text-content-danger">{error}</span>
      )}

      {/* REVIEW IS A VISIBLE TEXT LINK, and the two icons beside it are not.
          That asymmetry is deliberate. This row's primary action is opening the
          result, and a primary action needs a visible label: an eye glyph is
          ambiguous for "open my results", and this app already uses an eye-like
          control to mean show/hide on the PD-6 transcript toggle. Three
          same-weight icons would also give the row no hierarchy between its
          primary action and its destructive one.

          Note that the instructor submissions table takes the OPPOSITE decision
          and is icon-only with an explanatory footnote. Also deliberate:
          students are novices on a screen they visit occasionally, instructors
          are repeat users of a dense table they read all day. */}
      <Link
        href={`/student/session/${sessionId}/results`}
        className="mr-0.5 rounded-md px-1.5 py-0.5 text-micro font-medium text-content-info hover:underline"
      >
        Review
      </Link>

      <button
        type="button"
        onClick={() =>
          downloadUrl &&
          downloadRecording(downloadUrl, recordingFileName("relii-practice"))
        }
        disabled={!downloadUrl}
        title={
          downloadUrl
            ? "Download recording"
            : "There is no recording for this practice"
        }
        className={ACTION}
      >
        <ActionIcon
          icon={IconDownload}
          label={
            downloadUrl
              ? "Download recording"
              : "There is no recording for this practice"
          }
        />
      </button>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`${ACTION} hover:border-content-danger hover:text-content-danger`}
      >
        <ActionIcon icon={IconTrash} label="Delete this practice" />
      </button>
    </span>
  );
}
