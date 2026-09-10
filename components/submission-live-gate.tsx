"use client";

// The front-line guard for a graded submission's live screen, used only while
// the server has already confirmed the attempt is still inside its resume window.
//
// It reads the short-lived browser marker the Start button set. If present, this
// is the original continuous attempt (a refresh keeps the marker, so an
// accidental refresh stays live) and it shows the live conversation. If the
// marker is gone, the student navigated away and came back, so it shows the
// locked screen. When the student leaves the live screen (a real in-app
// navigation), React runs the cleanup below and clears the marker, which locks
// any later return. A full reload or tab close does NOT run the cleanup, so a
// refresh stays lenient while a closed tab (its sessionStorage gone) locks.
//
// This is only the UX layer: the server resume window is the real guarantee.
import { useEffect, useRef, useState } from "react";
import { liveMarkerKey } from "@/lib/submission";
import { LockedSubmission } from "@/components/locked-submission";

export function SubmissionLiveGate({
  sessionId,
  assignmentTitle,
  lockOnReload = false,
  children,
}: {
  sessionId: string;
  assignmentTitle?: string;
  // Voice+video submissions set this. A page reload physically ends the live
  // call and the in-progress recording, so a reloaded voice attempt must not
  // continue: clearing the marker on unload makes the reload fall through to the
  // locked screen. Text submissions leave this false and resume on reload.
  lockOnReload?: boolean;
  children: React.ReactNode;
}) {
  // "pending" until we have checked the marker on the client (avoids a flash of
  // the wrong screen during hydration).
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // ==> PHASE 3a: THE DECIDE-ONCE GUARD MOVED OUT OF THE STATE AND INTO A REF,
  //     AND THE PROPERTY IT PROTECTS IS UNCHANGED. It used to be written as
  //     setAllowed(prev => prev === null ? present : prev): a functional update
  //     that ignored itself on any run after the first. That tripped eslint's
  //     react-hooks/set-state-in-effect, which was the only error in the repo.
  //
  //     WHY THE GUARD CANNOT SIMPLY BE DELETED, since that is what "fixing a
  //     lint error" usually means. The cleanup below CLEARS the marker. React
  //     Strict Mode runs an effect, its cleanup, and then the effect again, so
  //     the second run reads a marker this component itself just removed. Set
  //     the state unconditionally and a legitimate live attempt flips to LOCKED
  //     on the second pass, which on a graded one-shot submission is a student
  //     losing their attempt to a development-mode re-render.
  //
  //     A ref is the right home for it: refs survive the double-invoke on one
  //     mounted instance (that is the whole point of Strict Mode reusing the
  //     instance), and they reset together with state on a real remount, so a
  //     genuinely new mount still decides afresh. The guard is now visible on
  //     its own line instead of hidden inside an updater, and setAllowed is
  //     provably reachable at most once per mount: it sits inside the only
  //     branch that can see decided.current false, and that branch sets it true
  //     in the same synchronous block before calling. <==
  const decided = useRef(false);

  useEffect(() => {
    const key = liveMarkerKey(sessionId);
    const present =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(key) === "1";
    if (!decided.current) {
      decided.current = true;
      setAllowed(present);
    }

    // Clear the marker when the student leaves this live screen by navigating
    // within the app (this cleanup does not run on a full reload or tab close,
    // so an accidental refresh stays live for text).
    return () => {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    };
  }, [sessionId]);

  // While the live screen is showing, warn before a reload or tab close (a
  // graded attempt should not be left by accident), and for voice+video clear
  // the marker when the page actually unloads so a confirmed reload lands in the
  // locked screen instead of silently restarting a now-gapped attempt.
  useEffect(() => {
    if (allowed !== true) return;

    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);

    let onPageHide: (() => void) | undefined;
    if (lockOnReload) {
      onPageHide = () => {
        try {
          window.sessionStorage.removeItem(liveMarkerKey(sessionId));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pagehide", onPageHide);
    }

    return () => {
      window.removeEventListener("beforeunload", warn);
      if (onPageHide) window.removeEventListener("pagehide", onPageHide);
    };
  }, [allowed, lockOnReload, sessionId]);

  if (allowed === null) {
    return <div className="py-16 text-center text-body text-content-tertiary">Loading...</div>;
  }
  if (!allowed) {
    return <LockedSubmission assignmentTitle={assignmentTitle} />;
  }
  return <>{children}</>;
}
