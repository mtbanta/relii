"use client";

import { useEffect, useRef, useState } from "react";

// The count-up practice clock, shared by BOTH practice screens (the text
// conversation and the voice+video call). It counts elapsed time up from 00:00,
// warns with color at ten and fifteen minutes, and at thirty minutes stops and
// asks the screen to auto-end (which reuses the student's normal End routine).
//
// It is a PRACTICE-ONLY feature: the two screens only render it for a practice,
// never for a graded submission.
//
// ---------------------------------------------------------------------------
// TIME THRESHOLDS. These three numbers are the only place the timing lives.
//   - YELLOW_AT_SECONDS: the clock text turns yellow at this elapsed time.
//   - RED_AT_SECONDS:    the clock text turns red at this time and stays red.
//   - AUTO_END_AT_SECONDS: the clock stops here and the practice auto-ends.
//
// >>> TEST VALUES BELOW: shortened so all four states (default, yellow, red,
// >>> auto-end) can be watched in under a minute on relii.vercel.app.
// >>> Restore the REAL values (shown in the comments) before the final build.
// ---------------------------------------------------------------------------
const YELLOW_AT_SECONDS = 15; // REAL: 10 * 60  (10:00)
const RED_AT_SECONDS = 30; // REAL: 15 * 60  (15:00)
const AUTO_END_AT_SECONDS = 45; // REAL: 30 * 60  (30:00)

// The timer itself. It measures REAL elapsed time from wall-clock timestamps and
// only advances while `active` is true, folding each running stretch into an
// accumulator whenever it stops. Two upshots: it stays accurate even if the
// browser tab is in the background (it catches up from the clock instead of
// counting missed ticks), and it can be paused later just by flipping `active`
// to false and back. It stops counting at AUTO_END_AT_SECONDS and calls
// `onExpire` exactly once.
function useCountUp({
  active,
  onExpire,
}: {
  active: boolean;
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

      if (totalSeconds >= AUTO_END_AT_SECONDS) {
        setElapsedSeconds(AUTO_END_AT_SECONDS); // freeze at the hard stop
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
  }, [active]);

  return elapsedSeconds;
}

// The on-screen clock. Given whether it should be running and what to do when it
// hits the hard stop, it shows mm:ss and colors itself by elapsed time.
export function PracticeClock({
  active,
  onExpire,
}: {
  // The SINGLE control point for whether the clock is advancing. Practice sets
  // this true while the conversation is live; Piece 6's pause will hold it false.
  active: boolean;
  // Called once, when the clock reaches the thirty-minute hard stop.
  onExpire: () => void;
}) {
  const seconds = useCountUp({ active, onExpire });

  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const label = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  // Default (dark gray) before the yellow mark, yellow from the yellow mark, red
  // from the red mark onward (and it stays red through the hard stop).
  const color =
    seconds >= RED_AT_SECONDS
      ? "text-red-600"
      : seconds >= YELLOW_AT_SECONDS
        ? "text-yellow-600"
        : "text-gray-700";

  return (
    <span
      aria-label={`Elapsed time ${label}`}
      className={`font-mono text-base font-semibold tabular-nums ${color}`}
    >
      {label}
    </span>
  );
}
