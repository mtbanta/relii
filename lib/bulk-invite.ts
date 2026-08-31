// Pure logic for bulk invite via CSV. It parses the uploaded text into two-column
// (email, role) rows, then classifies each row as VALID or SKIPPED-with-a-reason.
// It does NO database work and holds NO secrets: the route handler
// (app/api/instructor/bulk-invite/route.ts) reads the existing invites (with the
// class that invited each one) and the registered users, hands them to
// classifyRows, and inserts only the valid rows.
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

// GATE 4a. THE FOUR MESSAGES FOR AN ADDRESS THAT CANNOT BE INVITED AGAIN, in
// one place, because the bulk route needs the same wording in two different
// spots (the dedup below, and a collision at the moment of insert).
//
// ==> WHY THIS TAKES A CLASS AT ALL, WHICH IS THE WHOLE POINT OF THE FIX. <==
// allowed_emails.email is the PRIMARY KEY, so an address exists AT MOST ONCE
// across the entire system, not once per class. That is a deliberate decision:
// an address belongs to exactly one instructor's invite list.
//
// Before Gate 3b that made "already on the invite list" a complete answer,
// because there was one list and every instructor could see it. After Gate 3b
// the invite list is scoped to your own class, so that sentence became a dead
// end: it tells instructor B that an address is on a list they cannot see, on a
// Roster that does not show it, with nothing they can do next.
//
// So the reason has to say WHOSE list, and point somewhere. It never names the
// other instructor or their class: knowing that an invite exists elsewhere is
// what lets you act, knowing who holds it is not.
//
// `inviteClassId` is the class on the existing allowed_emails row.
// `undefined` means there is no invite row at all, which should be impossible
// for a registered user (registering requires being invited first) but is
// handled rather than assumed.
export function alreadyInvitedReason(
  inviteClassId: string | null | undefined,
  callerClassId: string,
  isRegistered: boolean,
): string {
  if (inviteClassId === undefined) {
    // No invite row at all, so the only way to be here is being registered.
    return "Already a registered user";
  }
  if (inviteClassId === null) {
    // An invite row carrying no class. Gate 4a made that impossible at the
    // database level, so this cannot happen; it is handled anyway, because
    // "unreachable" should not quietly mean "answers the wrong thing if it ever
    // is reached". We genuinely do not know whose list it is, so this says only
    // what is certain and still points somewhere.
    return isRegistered
      ? "Already a registered user (ask your administrator)"
      : "Already invited (ask your administrator)";
  }

  const yours = inviteClassId === callerClassId;

  if (isRegistered) {
    return yours
      ? "Already a registered user in your class"
      : "Already registered with another instructor (ask your administrator)";
  }
  return yours
    ? "Already on your invite list"
    : "Invited by another instructor (ask your administrator)";
}

// Classify each parsed row against the existing data. `inviteClassByEmail` maps
// every invited address to the class that invited it, and `registeredUsers` is a
// set of addresses that have registered. Both are keyed on LOWERCASED emails
// (built by the route from allowed_emails and profiles), so every comparison
// here is case-insensitive, the same way the signup trigger matches. The first
// matching rule wins, so the reason shown is the most specific one, and the
// whole file is never rejected: bad rows are collected into `skipped`, good rows
// into `valid`.
//
// GATE 4a CHANGED THE FIRST OF THOSE TWO FROM A SET TO A MAP, and required
// `callerClassId` alongside it, for the reason written out on
// alreadyInvitedReason() above.
//
// ==> BOTH INPUTS ARE STILL BUILT GLOBALLY BY THE ROUTE, AND THAT IS NOT AN
//     OVERSIGHT. Whether an address can be inserted at all is a GLOBAL fact,
//     because the email is the primary key. Scoping either of them would let the
//     insert be attempted and fail with a raw duplicate-key error instead of a
//     readable reason. The listing is scoped; the fact check is not. See the
//     rule written out at the top of lib/class-scope.ts. What Gate 4a added is
//     the CLASS on each global fact, which is what makes the reason exact
//     instead of merely polite. <==
export function classifyRows(
  rows: ParsedRow[],
  inviteClassByEmail: Map<string, string | null>,
  registeredUsers: Set<string>,
  callerClassId: string,
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
    // Registered and invited used to be two separate checks here, with
    // registered first because it was the more informative of the two reasons.
    // GATE 4a merged them into one, because the reason now depends on BOTH
    // facts together plus the class: "registered in your class" and "registered
    // with another instructor" are different situations and need to read
    // differently. A registered user is also always on the invite list, so
    // seeing both at once is normal rather than a conflict.
    const isRegistered = registeredUsers.has(email);
    const isInvited = inviteClassByEmail.has(email);
    if (isRegistered || isInvited) {
      skipped.push({
        value: email,
        reason: alreadyInvitedReason(
          inviteClassByEmail.get(email),
          callerClassId,
          isRegistered,
        ),
      });
      continue;
    }

    valid.push({ email, role });
    seenInFile.add(email);
  }

  return { valid, skipped };
}
