// Downloading a recording, in ONE place (PD-8d).
//
// This was written inline in components/results-actions.tsx, where it was the
// only way for a student to save a practice: they had to open the results page
// first. PD-8d adds a download to each saved-practice row on the home page, so
// the logic moved here rather than being written a second time. Both callers now
// use these two functions, so the filename shape and the download mechanism
// cannot drift apart.
//
// Nothing here grants access. The caller passes a signed link that the SERVER
// already minted after its own ownership check, exactly as before; the
// service-role key never reaches the browser.
import { APP_TIME_ZONE, instantDayStamp } from "@/lib/app-time";

// The hour and minute of the stamp, in Central. h23 so midnight is "00", which
// keeps the filename sorting in the same order as the clock.
const APP_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

// The filename for a saved recording, stamped with the moment of THIS download
// so repeated saves never collide, e.g. relii-practice-2026-06-29-1432.webm.
//
// The moment is still read fresh from the browser's clock on every call, which
// is what keeps repeated saves from colliding. WHAT CHANGED on 2026-09-11 is
// the zone it is read IN: US Central, like every other date in Relii, instead
// of whatever the student's own laptop is set to. The one consequence worth
// knowing: a student working outside Central gets a filename that does not
// match their own wall clock. That is the deliberate trade in ruling 1, and the
// alternative is a date in a downloaded file that means something different for
// every student who saves one.
export function recordingFileName(prefix: string): string {
  const now = new Date();
  const stamp = `${instantDayStamp(now)}-${APP_CLOCK.format(now).replace(":", "")}`;
  return `${prefix}-${stamp}.webm`;
}

// Start the download. Asking Supabase to serve the file as an attachment with
// our filename is what makes the browser SAVE the .webm instead of playing it;
// the signed link already proves access, and we only add the download name.
// A throwaway link click is the standard way to begin a file download without
// navigating the page away.
export function downloadRecording(signedUrl: string, filename: string): void {
  const separator = signedUrl.includes("?") ? "&" : "?";
  const url = `${signedUrl}${separator}download=${encodeURIComponent(filename)}`;

  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
