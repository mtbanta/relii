"use client";

// The instructor reset controls on a submissions-table row. There are TWO of
// them, chosen by the `type` prop, deliberately different because they carry
// very different stakes:
//
//   type = "interrupted"  "Reset". This is the DESTRUCTIVE one: the route
//     permanently deletes the stuck attempt's row AND removes its recording from
//     Storage. It is styled with the DANGER tokens for exactly that reason.
//
//   type = "retake"       "Allow retake". Piece 4 made this NON-destructive: the
//     route returns the submission to the student's practice pool (kind
//     submission -> practice, submitted_at cleared), KEEPING the score and the
//     recording, so they can submit again. It is styled as an ordinary quiet
//     action.
//
// The authority for which is which is the route itself,
// app/api/instructor/submission/[id]/reset/route.ts, not the comments that used
// to sit here. Both POST to /api/instructor/submission/<id>/reset with the
// matching type; the server re-verifies the session qualifies for that path
// before acting. On success the page refreshes so the row updates.
//
// -----------------------------------------------------------------------------
// PD-8f: WHY THIS FILE IS THREE PIECES RATHER THAN ONE BUTTON.
//
// The confirm panel used to render INSIDE the Status <td>, which is a 17% column
// of a fixed-layout table. That is roughly 180px, so the panel came out as a
// narrow vertical ribbon and any long word in it (a student's email was the
// worst case) pushed straight through its own rounded border. That was never a
// page-width problem: the panel was trapped in the cell, so widening the page
// could not have fixed it.
//
// The fix is structural and needs no JavaScript positioning, no popover and no
// overlay: the TRIGGER stays in a table cell, and the PANEL is rendered as a
// SECOND TABLE ROW beneath that submission's row, spanning every column. A
// trigger in one row and a panel in another cannot share React state directly,
// so a tiny context (rendered by SubmissionResetProvider, which emits no DOM of
// its own and so is legal directly inside <tbody>) holds the id of the one open
// confirm. Only one can be open at a time, which is also the behaviour we want.
//
// WHERE THE TRIGGER LIVES: the Manage column, next to the Status it changes.
// It used to sit INSIDE the Status cell on its own line, because at the old
// 896px page a ninth column did not fit. At 1120px it does, and moving it out
// stopped that cell stacking, which took 8px off every row carrying a control.
// -----------------------------------------------------------------------------
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KEPT_PRACTICES } from "@/lib/practice";

type ResetType = "interrupted" | "retake";

// Which row's confirm is open, if any. Null means none.
const OpenConfirmContext = createContext<{
  openId: string | null;
  setOpenId: (id: string | null) => void;
}>({ openId: null, setOpenId: () => {} });

// Wraps the table body. It renders NO element of its own, which is what makes it
// safe to place directly inside <tbody> (only <tr> may live there).
export function SubmissionResetProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <OpenConfirmContext.Provider value={{ openId, setOpenId }}>
      {children}
    </OpenConfirmContext.Provider>
  );
}

function panelId(sessionId: string): string {
  return `reset-confirm-${sessionId}`;
}

// ---- The trigger, which sits in the Manage cell. ----------------------------
// Labelled text rather than an icon: these are consequential and rare, and
// icon-only is for routine, universally understood actions.
export function SubmissionResetTrigger({
  sessionId,
  type,
}: {
  sessionId: string;
  type: ResetType;
}) {
  const { openId, setOpenId } = useContext(OpenConfirmContext);
  const isOpen = openId === sessionId;

  return (
    <button
      onClick={() => setOpenId(isOpen ? null : sessionId)}
      aria-expanded={isOpen}
      // Only while it is open, because the panel does not exist in the page
      // when it is closed and aria-controls must not point at a missing id.
      aria-controls={isOpen ? panelId(sessionId) : undefined}
      // whitespace-nowrap because these now live in the Manage column, which is
      // sized to hold "Allow retake" on ONE line. Without it a narrow viewport
      // could break the label across two lines and put the row height back.
      className={
        type === "interrupted"
          ? // THE DESTRUCTIVE ONE wears the danger tokens.
            "whitespace-nowrap rounded-md border border-content-danger px-2 py-0.5 text-micro text-content-danger hover:bg-surface-danger"
          : // A quiet, ordinary action: a hairline border is its resting
            // affordance, and it deliberately does NOT wear a warning colour,
            // because nothing here is lost.
            "whitespace-nowrap rounded-md border border-line-secondary px-2 py-0.5 text-micro text-content-secondary hover:bg-surface-tertiary hover:text-content-primary"
      }
    >
      {type === "interrupted" ? "Reset" : "Allow retake"}
    </button>
  );
}

// ---- The confirm, which is its own full-width table row. --------------------
export function SubmissionResetConfirmRow({
  sessionId,
  studentName,
  type,
  colSpan,
}: {
  sessionId: string;
  // The student's DISPLAY NAME, never their email. The dashboard already has the
  // name in scope, and an email is both harder to read in a sentence and the
  // long unbreakable token that used to overflow the panel.
  studentName: string;
  type: ResetType;
  colSpan: number;
}) {
  const router = useRouter();
  const { openId, setOpenId } = useContext(OpenConfirmContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (openId !== sessionId) return null;

  async function handleReset() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/instructor/submission/${sessionId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not reset that submission.");
        setLoading(false);
        return;
      }
      // Re-run the dashboard query so this row reflects the reset.
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function cancel() {
    setOpenId(null);
    setError("");
  }

  const destructive = type === "interrupted";

  return (
    <tr className="border-b border-line-tertiary last:border-0">
      {/* Spanning every column is the whole point: the panel is no longer inside
          the 17% Status column, so its text has room to sit on normal lines. */}
      <td colSpan={colSpan} className="px-2.5 pb-2.5 pt-0">
        <div
          id={panelId(sessionId)}
          className={
            destructive
              ? "rounded-md border border-content-danger bg-surface-danger p-3"
              : "rounded-md border border-line-tertiary bg-surface-secondary p-3"
          }
        >
          {/* The TEXT is capped at the reading measure even though the panel is
              full width, for the same reason the page's other prose is: a single
              line running the whole 1120px is hard to read. */}
          <p
            className={`max-w-reading text-meta ${
              destructive ? "text-content-danger" : "text-content-primary"
            }`}
          >
            {destructive ? (
              <>
                Reset <span className="font-medium">{studentName}</span>&apos;s
                interrupted attempt? This permanently deletes the attempt and its
                recording so they can start over. It cannot be undone.
              </>
            ) : (
              <>
                Allow <span className="font-medium">{studentName}</span> to
                retake this case? This returns the submission to their practice
                pool. The recording and the score are kept.
              </>
            )}
          </p>

          {/* ONE SHORT LINE, kept deliberately. The retake route re-runs
              prunePractices with keepId after returning the row. The returned
              practice carries its ORIGINAL date, so force-keeping it can push
              the pool over the cap and drop the student's oldest other practice
              along with that practice's recording. That is a genuinely
              destructive consequence of a control that otherwise deletes
              nothing, and it was undocumented until PD-8e. The number is read
              from KEPT_PRACTICES so this copy cannot drift from the cap. */}
          {!destructive && (
            <p className="mt-1 max-w-reading text-meta text-content-secondary">
              If they already have {KEPT_PRACTICES} saved practices, their oldest
              one and its recording are dropped.
            </p>
          )}

          <div className="mt-2.5 flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              onClick={cancel}
              disabled={loading}
            >
              Cancel
            </Button>
            {destructive ? (
              <Button
                variant="destructive"
                size="xs"
                onClick={handleReset}
                disabled={loading}
              >
                {loading ? "Deleting..." : "Permanently delete attempt"}
              </Button>
            ) : (
              <Button size="xs" onClick={handleReset} disabled={loading}>
                {loading ? "Returning..." : "Allow retake"}
              </Button>
            )}
          </div>

          {error && (
            <p className="mt-2 max-w-reading text-meta text-content-danger">
              {error}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}
