"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_MEETING_MINUTES } from "@/lib/meeting-length";

// The count-up practice clock, shared by BOTH practice screens (the text
// conversation and the voice+video call). It counts elapsed time up from 00:00,
// and when it reaches the assignment's meeting length it stops and asks the
// screen to auto-end (which reuses the student's normal End routine).
//
// It is a PRACTICE-ONLY feature: the two screens only render it for a practice,
// never for a graded submission.
//
// ---------------------------------------------------------------------------
// THE MEETING LENGTH IS PER ASSIGNMENT (PD-4). It arrives as the autoEndSeconds
// prop, threaded down from the assignment's duration_minutes; an assignment with
// no duration set reads as the standard 30 minutes. The allowed range and that
// fallback live in one file, lib/meeting-length.ts.
//
// NO COLOR THRESHOLDS. The clock text is a single default color for the whole
// meeting. The old yellow-at-10:00 and red-at-15:00 warnings were removed in
// PD-4: with a meeting that can be 5 or 10 minutes long they would fire late or
// never, so a warning that only works at one length is worse than none. The
// clock instead shows its target ("03:12 / 05:00") so a short auto-end is never
// a surprise.
// ---------------------------------------------------------------------------

// mm:ss for a whole number of seconds.
function formatClock(totalSeconds: number): string {
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// The timer itself. It measures REAL elapsed time from wall-clock timestamps and
// only advances while `active` is true, folding each running stretch into an
// accumulator whenever it stops. Two upshots: it stays accurate even if the
// browser tab is in the background (it catches up from the clock instead of
// counting missed ticks), and it can be paused later just by flipping `active`
// to false and back. It stops counting at `autoEndSeconds` and calls `onExpire`
// exactly once.
function useCountUp({
  active,
  autoEndSeconds,
  onExpire,
}: {
  active: boolean;
  autoEndSeconds: number;
  onExpire: () => void;
}): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Time already counted before the current running stretch (milliseconds).
  const countedMsRef = useRef(0);
  // When the current running stretch began (ms since epoch), or null if stopped.
  const runningSinceRef = useRef<number | null>(null);
  // onExpire must fire once, ever.
  const firedRef = useRef(false);
  // Hold the latest onExpire without restarting the interval.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    // Start or stop the running stretch when `active` flips.
    if (active) {
      if (runningSinceRef.current === null) {
        runningSinceRef.current = Date.now();
      }
    } else if (runningSinceRef.current !== null) {
      // Stopping (or pausing): fold this stretch into the accumulator and hold.
      countedMsRef.current += Date.now() - runningSinceRef.current;
      runningSinceRef.current = null;
    }

    if (!active) return;

    // While running, recompute elapsed from the wall clock twice a second.
    const tick = () => {
      const runningMs =
        runningSinceRef.current !== null
          ? Date.now() - runningSinceRef.current
          : 0;
      const totalSeconds = Math.floor((countedMsRef.current + runningMs) / 1000);

      if (totalSeconds >= autoEndSeconds) {
        setElapsedSeconds(autoEndSeconds); // freeze at the meeting length
        if (!firedRef.current) {
          firedRef.current = true;
          onExpireRef.current();
        }
        return;
      }
      setElapsedSeconds(totalSeconds);
    };

    tick(); // update immediately so the display never lags a (re)start
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [active, autoEndSeconds]);

  return elapsedSeconds;
}

// The on-screen clock. Given whether it should be running and how long the
// meeting is, it shows mm:ss counting up toward that length.
export function PracticeClock({
  active,
  autoEndSeconds = DEFAULT_MEETING_MINUTES * 60,
  onExpire,
}: {
  // The SINGLE control point for whether the clock is advancing. Practice sets
  // this true while the conversation is live; Piece 6's pause will hold it false.
  active: boolean;
  // How long this assignment's meeting runs, in seconds. Defaults to the
  // standard 30 minute meeting, which is what an assignment with no duration set
  // (every assignment created before PD-4) uses.
  autoEndSeconds?: number;
  // Called once, when the clock reaches the meeting length.
  onExpire: () => void;
}) {
  const seconds = useCountUp({ active, autoEndSeconds, onExpire });

  const label = formatClock(seconds);
  const targetLabel = formatClock(autoEndSeconds);

  return (
    <span
      aria-label={`Elapsed time ${label} of a ${targetLabel} meeting`}
      className="font-mono text-base font-semibold tabular-nums text-content-primary"
    >
      {label}
      <span className="font-normal text-content-tertiary"> / {targetLabel}</span>
    </span>
  );
}
