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

// Two zeros wide, e.g. 9 -> "09".
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// The filename for a saved recording, stamped with the moment of THIS download
// so repeated saves never collide, e.g. relii-practice-2026-06-29-1432.webm.
// The clock is the student's own browser, read fresh on each call.
export function recordingFileName(prefix: string): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}-${pad(d.getHours())}${pad(d.getMinutes())}`;
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
