// PHASE 2a. Taking an uploaded rubric off a request and parsing it. SERVER ONLY
// (it reaches lib/rubric-xlsx.ts, which imports ExcelJS).
//
// ==> WHY THE PREVIEW ROUTE AND THE CREATE ROUTE SHARE THIS RATHER THAN EACH
//     READING THE UPLOAD THEMSELVES. The whole safety argument for the two-call
//     design is that the create route re-parses the file and stores what IT
//     parsed, so nothing the browser sends in between is trusted. That argument
//     only holds if both routes parse the SAME WAY. Two copies of this logic
//     would be two places to drift, and a drift between them is invisible: the
//     preview would show Tom one thing and the database would hold another,
//     which is precisely the failure the design exists to prevent. <==
import { parseRubricXlsx } from "@/lib/rubric-xlsx";
import {
  MAX_RUBRIC_FILE_BYTES,
  formatLimit,
  formatSize,
} from "@/lib/types";
import type { ParseResult } from "@/lib/types";

// The multipart field name, named once so the form and both routes agree.
export const RUBRIC_FIELD = "rubric";

// Room for the multipart envelope: the boundary markers, the per-part headers
// and the other form fields that ride along with the file. Generous, because
// this is a pre-filter and the exact check happens below on the file itself.
const ENVELOPE_SLACK = 64 * 1024;

const tooBig = (bytes: number) =>
  `That file is ${formatSize(bytes)} and the limit is ${formatLimit(
    MAX_RUBRIC_FILE_BYTES,
  )}. A rubric is a few rows of numbers, so a file this large is not one.`;

// Is there a file on this request at all? Used by the create route, which
// accepts an assignment with no rubric and must not treat "none" as "invalid".
export async function hasRubricFile(form: FormData): Promise<boolean> {
  const file = form.get(RUBRIC_FIELD);
  return file instanceof File && file.size > 0;
}

// ==> THE EARLIEST REFUSAL AVAILABLE TO US, AND WHY IT IS NOT THE ONLY ONE.
//
//     request.formData() BUFFERS THE WHOLE BODY. By the time we can ask a File
//     for its size, the bytes are already in the function's memory, so a size
//     check at that point limits what we PARSE but not what we RECEIVE.
//
//     Content-Length is the only thing we can read before that happens, so it
//     is checked first. It is a claim by the sender rather than a measurement,
//     which is fine here: a lying sender only ever gets itself refused later by
//     the real check, and an honest oversized upload is turned away before the
//     body is read at all.
//
//     It can also be ABSENT, on a chunked request. That is why the file's own
//     size is checked again below rather than instead. <==
export function refuseOversizedBody(request: Request): string | null {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (!Number.isFinite(declared) || declared <= 0) return null;
  if (declared > MAX_RUBRIC_FILE_BYTES + ENVELOPE_SLACK) {
    return tooBig(declared);
  }
  return null;
}

// Pull the file out of an already-read form and parse it.
//
// Returns the parser's own ParseResult, so every refusal message in the app for
// a bad rubric comes from one place and reads the same way.
export async function parseRubricFromForm(form: FormData): Promise<ParseResult> {
  const file = form.get(RUBRIC_FIELD);

  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: "No rubric file was uploaded. Choose an .xlsx file and try again.",
    };
  }

  // The second half of the size guard. The body is already in memory by now,
  // but this stops us handing it to ExcelJS, which is where the real cost is.
  if (file.size > MAX_RUBRIC_FILE_BYTES) {
    return { ok: false, error: tooBig(file.size) };
  }

  return parseRubricXlsx(await file.arrayBuffer());
}
