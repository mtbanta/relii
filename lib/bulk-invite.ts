// Pure logic for bulk invite via CSV. It parses the uploaded text into two-column
// (email, role) rows, then classifies each row as VALID or SKIPPED-with-a-reason.
// It does NO database work and holds NO secrets: the route handler
// (app/api/instructor/bulk-invite/route.ts) reads the existing invites and
// registered users, hands them to classifyRows, and inserts only the valid rows.
// Keeping the rules here in one place (like lib/submission.ts and lib/practice.ts)
// makes them easy to read and reason about.

export type Role = "student" | "instructor";

// One row of the CSV as parsed: the raw email and role cells, plus the original
// line so a skipped row can be shown back to the instructor to fix.
export type ParsedRow = {
  emailRaw: string;
  roleRaw: string;
  line: string;
};

export type ValidRow = { email: string; role: Role };

// A skipped row for the result report: the value we can show (the cleaned email,
// or the whole raw line when there was no usable email) and a plain reason.
export type SkippedRow = { value: string; reason: string };

export type ClassifyResult = {
  valid: ValidRow[];
  skipped: SkippedRow[];
};

// A deliberately simple email shape check: one "@", no spaces, and a dot in the
// domain. It mirrors the browser's type="email" gate on the single-invite form.
// The real gate on who may register is still the database signup trigger.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strip a single pair of wrapping double quotes from a cell (some spreadsheets
// quote values), then trim what is inside.
function stripQuotes(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).trim();
  }
  return s;
}

// Parse the uploaded CSV text into rows. Tolerates a trailing newline and blank
// lines (skipped), an optional header row ("email,role"), and quoted values.
// Only the first two columns are used; any extra columns are ignored. Emails and
// the two role words never contain commas, so a plain comma split is safe here.
export function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const rows: ParsedRow[] = lines.map((line) => {
    const cells = line.split(",").map((c) => stripQuotes(c.trim()));
    return {
      emailRaw: cells[0] ?? "",
      roleRaw: cells[1] ?? "",
      line,
    };
  });

  // Optional header: if the first row's first cell is "email" or its second cell
  // is "role" (case-insensitive), drop it. Otherwise every row is treated as
  // data, so a genuinely malformed first data row is still reported rather than
  // silently swallowed as a "header".
  const first = rows[0];
  const looksLikeHeader =
    first.emailRaw.toLowerCase() === "email" ||
    first.roleRaw.toLowerCase() === "role";

  return looksLikeHeader ? rows.slice(1) : rows;
}

// Classify each parsed row against the existing data. `existingInvites` and
// `registeredUsers` are sets of LOWERCASED emails (built by the route from
// allowed_emails and profiles), so every comparison here is case-insensitive,
// the same way the signup trigger matches. The first matching rule wins, so the
// reason shown is the most specific one, and the whole file is never rejected:
// bad rows are collected into `skipped`, good rows into `valid`.
export function classifyRows(
  rows: ParsedRow[],
  existingInvites: Set<string>,
  registeredUsers: Set<string>,
): ClassifyResult {
  const valid: ValidRow[] = [];
  const skipped: SkippedRow[] = [];
  const seenInFile = new Set<string>();

  for (const row of rows) {
    const email = row.emailRaw.trim().toLowerCase();
    const role = row.roleRaw.trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      skipped.push({ value: row.line, reason: "Not a valid email" });
      continue;
    }
    if (!role) {
      skipped.push({ value: email, reason: "Missing role" });
      continue;
    }
    if (role !== "student" && role !== "instructor") {
      skipped.push({
        value: email,
        reason: "Invalid role (must be student or instructor)",
      });
      continue;
    }
    if (seenInFile.has(email)) {
      skipped.push({ value: email, reason: "Duplicate within this file" });
      continue;
    }
    // Registered is checked before invite-list because a registered user is also
    // on the invite list; "already a registered user" is the more informative
    // reason of the two.
    if (registeredUsers.has(email)) {
      skipped.push({ value: email, reason: "Already a registered user" });
      continue;
    }
    if (existingInvites.has(email)) {
      skipped.push({ value: email, reason: "Already on the invite list" });
      continue;
    }

    valid.push({ email, role });
    seenInFile.add(email);
  }

  return { valid, skipped };
}
