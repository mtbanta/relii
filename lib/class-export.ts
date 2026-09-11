// GATE 4b. The class snapshot: one function that answers "exactly what is in
// this class right now", used by BOTH the export and the delete.
//
// ==> THIS FILE IS WHAT MAKES "EXPORT FIRST" A SERVER RULE INSTEAD OF A
//     CONVENTION. If the export were a button the page made you click before it
//     enabled the confirm field, "export first" would be enforced by nothing: a
//     crafted request skips the button, and the failure destroys graded student
//     work. That is precisely the class of bug Gate 4a deleted rather than
//     documented.
//
//     So the server issues something on export and the delete refuses without
//     it. The export writes a class_exports row and hands back its id as a
//     one-time token. The delete demands that token AND rebuilds the snapshot
//     from the live database and requires the fingerprint to still match.
//
//     THE EXPORT AND THE DELETE CALL THE SAME FUNCTION BELOW, which is what
//     stops them drifting apart. An export that no longer describes what is
//     about to be destroyed is worse than no export, because it is a record of
//     the wrong thing. The fingerprint is how the server knows the difference. <==
//
// WHAT THE FINGERPRINT COVERS: everything the export reports, with no
// exceptions. That is a deliberately simple rule. It would be possible to argue
// that a new audit-log row need not invalidate an export (the audit logs are not
// deleted), but then "does this change matter?" becomes a judgment somebody has
// to keep right forever. One rule instead: if it is in the export, it is in the
// fingerprint, and a difference means export again.
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";

type AdminClient = ReturnType<typeof createAdminClient>;

// A row read with select("*"). The export deliberately does not name columns.
export type Row = Record<string, unknown>;

export type SnapshotStudent = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  created_at: string | null;
  // How many OTHER classes this person is in. Load bearing, not decoration: it
  // decides whether the delete removes their account or only their membership,
  // so it belongs in the export (which must say what will happen) and therefore
  // in the fingerprint (so the export cannot go stale about it unnoticed).
  other_class_memberships: number;
  // The consequence spelled out, so the CSV says it in words rather than
  // leaving the reader to work it out from a number.
  account_will_be: "deleted" | "kept";
};

export type SnapshotRecording = {
  path: string;
  owner_id: string;
  session_id: string | null;
  size_bytes: number | null;
  updated_at: string | null;
  // "session"   a recording belonging to a session in this class.
  // "extra"     a file in a to-be-deleted account's folder with no session row
  //             in this class. Almost always a leftover from a session deleted
  //             directly in SQL during earlier testing (see Open Issues in
  //             PROJECT_STATE.md). It goes with the account.
  // "missing"   a session row naming a file that is not in Storage.
  kind: "session" | "extra" | "missing";
};

export type ClassSnapshot = {
  class: Row;
  instructor: Row | null;
  students: SnapshotStudent[];
  invites: Row[];
  rubrics: Row[];
  scenarios: Row[];
  assignments: Row[];
  sessions: Row[];
  recordings: SnapshotRecording[];
  submission_resets: Row[];
  assignment_deletes: Row[];
  // ==> PHASE 4a. TWO NEW TABLES, AND THEY ARE HERE BECAUSE OF WHAT THIS FILE
  //     IS FOR RATHER THAN FOR COMPLETENESS' SAKE. Between them they hold what
  //     the AI originally graded every reviewed submission, and who changed
  //     which grade to what and when. A class export that omitted them would be
  //     a record of the grades with no record of how they got that way, and the
  //     fingerprint would be BLIND to a professor changing a mark: a review
  //     could be saved between an export and a delete without invalidating the
  //     export that authorised it.
  //
  //     NEITHER IS IN DELETE_ORDER in app/api/admin/class/[id]/delete/route.ts,
  //     and that is deliberate and matches the two audit logs above: both carry
  //     a plain class_id with no foreign key, so nothing forces the choice and
  //     they SURVIVE a class delete. See supabase/phase-4a-review.sql section 2
  //     for why the AI original follows the audit precedent even though it is a
  //     value rather than a record of an action. <==
  submission_ai_scores: Row[];
  submission_reviews: Row[];
};

export type SnapshotCounts = {
  students: number;
  student_accounts_to_delete: number;
  invites: number;
  rubrics: number;
  scenarios: number;
  assignments: number;
  sessions: number;
  recordings: number;
  submission_resets: number;
  assignment_deletes: number;
  submission_ai_scores: number;
  submission_reviews: number;
};

export type BuiltSnapshot = {
  snapshot: ClassSnapshot;
  counts: SnapshotCounts;
  fingerprint: string;
};

// ---------------------------------------------------------------------------
// The canonical form, and why it is written by hand.
// ---------------------------------------------------------------------------
// JSON.stringify preserves whatever key order the object happens to have, and
// these rows come back from an HTTP API. If the API ever returned the same row
// with its keys in a different order, the hash would change and every export
// would be refused for a change that never happened. Sorting keys at every level
// makes the fingerprint depend on the DATA and nothing else.
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprintSnapshot(snapshot: ClassSnapshot): string {
  return createHash("sha256").update(canonical(snapshot)).digest("hex");
}

// Sort helper: every list in the snapshot is ordered by a stable key, because an
// unordered list would hash differently on two reads of identical data.
function byKey<T extends Row>(rows: T[], key: string): T[] {
  return [...rows].sort((a, b) => {
    const x = String(a[key] ?? "");
    const y = String(b[key] ?? "");
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

// ==> EVERY READ IN THIS FILE IS PAGED, AND THAT IS NOT PRECAUTION, IT IS THE
//     DIFFERENCE BETWEEN A COMPLETE EXPORT AND A SILENTLY SHORT ONE. The
//     Supabase API returns at most a set number of rows per request (1000 by
//     default) and says nothing when it truncates. An export that quietly
//     stopped at a thousand sessions would still hash consistently on both
//     sides, so the fingerprint would MATCH and the delete would go ahead
//     against a file missing hundreds of submissions. Relii has around 25
//     students today and is meant to reach about 270 by configuration, where
//     sessions passes a thousand rows easily. <==
const PAGE = 1000;

async function readAll(
  admin: AdminClient,
  table: string,
  classId: string,
  sortKey: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    // ==> select("*") IS DELIBERATE HERE AND NOWHERE ELSE IN THE CODEBASE. Every
    //     other read in this app names its columns. An export must not: a column
    //     added later would silently drop out of the file, and the one job of
    //     this file is to be a complete record of something about to be
    //     destroyed forever. Naming columns here would make the export quietly
    //     wrong the first time anyone adds one.
    //
    //     It is safe from the column-grant trap Gate 2 set on scenarios (a
    //     column added after that migration is granted to nobody), because this
    //     read uses the service-role key, which those grants do not apply to. <==
    const { data, error } = await admin
      .from(table)
      .select("*")
      .eq("class_id", classId)
      // A stable order is required for paging to be meaningful: without one the
      // database may return the same row on two pages and miss another.
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`Could not read ${table} for this class: ${error.message}`);
    }
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) break;
  }
  return byKey(rows, sortKey);
}

// ---------------------------------------------------------------------------
// The snapshot.
// ---------------------------------------------------------------------------
// IT THROWS ON ANY FAILED READ rather than returning what it managed to get.
// Same reasoning as loadClassStudents() in lib/class-scope.ts, but with much
// higher stakes: a partial snapshot would produce an export that is missing rows
// and a fingerprint that matches it, so the delete would go ahead against a file
// that does not describe what it destroyed.
export async function buildClassSnapshot(
  admin: AdminClient,
  classId: string,
): Promise<BuiltSnapshot> {
  // 1. The class itself.
  const { data: classRow, error: classError } = await admin
    .from("classes")
    .select("*")
    .eq("id", classId)
    .maybeSingle();
  if (classError) {
    throw new Error(`Could not read the class: ${classError.message}`);
  }
  if (!classRow) {
    throw new Error("That class was not found.");
  }

  // 2. Its owner.
  const { data: instructor, error: instructorError } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name, role, created_at")
    .eq("id", classRow.instructor_id as string)
    .maybeSingle();
  if (instructorError) {
    throw new Error(`Could not read the instructor: ${instructorError.message}`);
  }

  // 3. The members, then their profiles, then how many OTHER classes each one
  //    is in. Three small reads rather than a join, the same way
  //    loadClassStudents() does it, because at this scale it is trivial and far
  //    easier to read.
  const { data: members, error: membersError } = await admin
    .from("class_members")
    .select("user_id")
    .eq("class_id", classId);
  if (membersError) {
    throw new Error(`Could not read the class members: ${membersError.message}`);
  }
  const memberIds = (members ?? []).map((m) => m.user_id as string);

  let students: SnapshotStudent[] = [];
  if (memberIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, email, first_name, last_name, role, created_at")
      .in("id", memberIds);
    if (profilesError) {
      throw new Error(`Could not read the student profiles: ${profilesError.message}`);
    }

    const { data: elsewhere, error: elsewhereError } = await admin
      .from("class_members")
      .select("user_id, class_id")
      .in("user_id", memberIds)
      .neq("class_id", classId);
    if (elsewhereError) {
      throw new Error(
        `Could not check whether these students are in another class: ${elsewhereError.message}`,
      );
    }
    const otherCount = new Map<string, number>();
    for (const row of elsewhere ?? []) {
      const id = row.user_id as string;
      otherCount.set(id, (otherCount.get(id) ?? 0) + 1);
    }

    students = (profiles ?? []).map((p) => {
      const others = otherCount.get(p.id as string) ?? 0;
      return {
        id: p.id as string,
        email: p.email as string,
        first_name: (p.first_name as string) ?? null,
        last_name: (p.last_name as string) ?? null,
        role: p.role as string,
        created_at: (p.created_at as string) ?? null,
        other_class_memberships: others,
        // Only a STUDENT with no other class loses their account. Both halves
        // are conditions, not conveniences: see the delete route.
        account_will_be:
          p.role === "student" && others === 0 ? "deleted" : "kept",
      };
    });
    students.sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0));
  }

  // 4. The five class-carrying content tables plus the two audit logs.
  const invites = await readAll(admin, "allowed_emails", classId, "email");
  const rubrics = await readAll(admin, "rubrics", classId, "id");
  const scenarios = await readAll(admin, "scenarios", classId, "id");
  const assignments = await readAll(admin, "assignments", classId, "id");
  const sessions = await readAll(admin, "sessions", classId, "id");
  const submissionResets = await readAll(admin, "submission_resets", classId, "id");
  const assignmentDeletes = await readAll(admin, "assignment_deletes", classId, "id");
  // PHASE 4a. Read exactly like the two audit logs, by class_id, paged, with
  // select("*") so a column added later cannot silently drop out of the file.
  const aiScores = await readAll(admin, "submission_ai_scores", classId, "id");
  const reviews = await readAll(admin, "submission_reviews", classId, "id");

  // 5. THE RECORDINGS, AND WHERE THEY ARE FOUND FROM MATTERS.
  //
  //    They come from sessions.video_path for THIS CLASS, not from a sweep of
  //    the students' folders. A recording is stored at <owner-id>/<session-id>.webm,
  //    and an INSTRUCTOR who role-plays their own scenario (the winner role-play
  //    gate is a standing manual step in PROJECT_STATE.md) has recordings under
  //    their own user id while never being a member of the class. A class_members
  //    sweep would miss those and leave video behind whose owning row was gone,
  //    which is exactly what app/api/instructor/delete-student/route.ts says must
  //    never happen.
  const sessionPaths = new Map<string, { sessionId: string; ownerId: string }>();
  for (const s of sessions) {
    const path = s.video_path as string | null;
    if (!path) continue;
    sessionPaths.set(path, {
      sessionId: s.id as string,
      ownerId: path.split("/")[0] ?? "",
    });
  }

  // Folders worth listing: everyone who owns a recording in this class, plus
  // every student whose whole account is going (their folder goes with it,
  // leftovers included).
  const folders = new Set<string>();
  for (const { ownerId } of sessionPaths.values()) {
    if (ownerId) folders.add(ownerId);
  }
  for (const s of students) {
    if (s.account_will_be === "deleted") folders.add(s.id);
  }

  const listed = new Map<string, { size: number | null; updated_at: string | null }>();
  for (const folder of [...folders].sort()) {
    // Paged for the same reason the table reads are: a folder listing is capped
    // per request, and a short list here means recordings left behind after
    // their session rows are gone.
    for (let offset = 0; ; offset += PAGE) {
      const { data: files, error: listError } = await admin.storage
        .from(SESSION_VIDEOS_BUCKET)
        .list(folder, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      // A failed listing means the export cannot say what is in Storage, so it
      // fails rather than issuing a token against an incomplete picture.
      if (listError) {
        throw new Error(
          `Could not read the recordings in Storage: ${listError.message}`,
        );
      }
      for (const f of files ?? []) {
        const size = (f.metadata as { size?: number } | null)?.size;
        listed.set(`${folder}/${f.name}`, {
          size: typeof size === "number" ? size : null,
          updated_at: f.updated_at ?? null,
        });
      }
      if ((files ?? []).length < PAGE) break;
    }
  }

  const deletedAccountIds = new Set(
    students.filter((s) => s.account_will_be === "deleted").map((s) => s.id),
  );

  const recordings: SnapshotRecording[] = [];
  for (const [path, { sessionId, ownerId }] of sessionPaths) {
    const file = listed.get(path);
    recordings.push({
      path,
      owner_id: ownerId,
      session_id: sessionId,
      size_bytes: file?.size ?? null,
      updated_at: file?.updated_at ?? null,
      kind: file ? "session" : "missing",
    });
  }
  for (const [path, file] of listed) {
    if (sessionPaths.has(path)) continue;
    const ownerId = path.split("/")[0] ?? "";
    if (!deletedAccountIds.has(ownerId)) continue;
    recordings.push({
      path,
      owner_id: ownerId,
      session_id: null,
      size_bytes: file.size,
      updated_at: file.updated_at,
      kind: "extra",
    });
  }
  recordings.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const snapshot: ClassSnapshot = {
    class: classRow as Row,
    instructor: (instructor as Row) ?? null,
    students,
    invites,
    rubrics,
    scenarios,
    assignments,
    sessions,
    recordings,
    submission_resets: submissionResets,
    assignment_deletes: assignmentDeletes,
    submission_ai_scores: aiScores,
    submission_reviews: reviews,
  };

  const counts: SnapshotCounts = {
    students: students.length,
    student_accounts_to_delete: deletedAccountIds.size,
    invites: invites.length,
    rubrics: rubrics.length,
    scenarios: scenarios.length,
    assignments: assignments.length,
    sessions: sessions.length,
    recordings: recordings.length,
    submission_resets: submissionResets.length,
    assignment_deletes: assignmentDeletes.length,
    submission_ai_scores: aiScores.length,
    submission_reviews: reviews.length,
  };

  return { snapshot, counts, fingerprint: fingerprintSnapshot(snapshot) };
}

// ---------------------------------------------------------------------------
// The CSV.
// ---------------------------------------------------------------------------
// One value as a safe CSV cell: always quoted, inner quotes doubled. Copied in
// shape from app/api/instructor/submission/[id]/csv/route.ts, which is the
// export precedent in this codebase. Quoting everything is what lets a
// transcript, which is full of commas and line breaks, sit inside one cell.
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

// A table section: the title, a header row built from every column present
// across the rows, then the rows. The header is derived rather than written out
// for the same reason the reads use select("*").
function section(title: string, rows: Row[]): string[] {
  const out: string[] = [cell(title), ""];
  if (rows.length === 0) {
    out[1] = cell("(none)");
    out.push("");
    return out;
  }
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
  out[1] = columns.map(cell).join(",");
  for (const row of rows) {
    out.push(columns.map((c) => cell(row[c])).join(","));
  }
  out.push("");
  return out;
}

export type ExportMeta = {
  tokenId: string;
  exportedAt: string;
  exportedByEmail: string | null;
  fingerprint: string;
};

// The file. Everything the class holds, in one CSV with a section per table.
//
// NOTE WHAT IS IN THE HEADER BLOCK AND NOT IN THE FINGERPRINT: the token, the
// timestamp and who exported. Those describe the EXPORT, not the class, and
// hashing them would make every export differ from every other by construction.
export function snapshotToCsv(
  snapshot: ClassSnapshot,
  counts: SnapshotCounts,
  meta: ExportMeta,
): string {
  const rows: string[] = [];
  const cls = snapshot.class;

  rows.push(cell("Relii class export"));
  rows.push([cell("Class"), cell(cls.name)].join(","));
  rows.push([cell("Class id"), cell(cls.id)].join(","));
  rows.push([cell("Instructor"), cell(snapshot.instructor?.email ?? "unknown")].join(","));
  rows.push([cell("Exported by"), cell(meta.exportedByEmail ?? "unknown")].join(","));
  rows.push([cell("Exported at"), cell(meta.exportedAt)].join(","));
  rows.push([cell("Export token"), cell(meta.tokenId)].join(","));
  rows.push([cell("Fingerprint"), cell(meta.fingerprint)].join(","));
  rows.push("");

  // ==> THE ONE THING THIS FILE CANNOT DO, SAID BEFORE ANY DATA. A CSV cannot
  //     carry video. The recordings are listed below by path, owner and size,
  //     and the files themselves are destroyed by the delete and are not
  //     recoverable from this file or from anywhere else. <==
  rows.push(cell("WARNING: THE RECORDINGS ARE NOT IN THIS FILE"));
  rows.push(
    cell(
      `The ${counts.recordings} webcam recording(s) listed below are deleted permanently. This file records that they existed, their size and which session they belonged to. It does not contain the video itself, and there is no other copy. Everything else in this file (transcripts, scores, rubric, personas, assignments) IS here in full.`,
    ),
  );
  rows.push("");

  rows.push(cell("What this export contains"));
  rows.push([cell("Section"), cell("Rows")].join(","));
  for (const [key, value] of Object.entries(counts)) {
    rows.push([cell(key.replace(/_/g, " ")), cell(value)].join(","));
  }
  rows.push("");

  rows.push(...section("CLASS", [cls]));
  rows.push(...section("INSTRUCTOR", snapshot.instructor ? [snapshot.instructor] : []));
  rows.push(...section("STUDENTS", snapshot.students as unknown as Row[]));
  rows.push(...section("INVITE LIST", snapshot.invites));
  rows.push(...section("RUBRICS", snapshot.rubrics));
  rows.push(...section("SCENARIOS (personas)", snapshot.scenarios));
  rows.push(...section("ASSIGNMENTS", snapshot.assignments));
  rows.push(
    ...section("SESSIONS (transcripts and scores)", snapshot.sessions),
  );
  rows.push(...section("RECORDINGS (files, not video)", snapshot.recordings as unknown as Row[]));
  rows.push(...section("AUDIT: SUBMISSION RESETS", snapshot.submission_resets));
  rows.push(...section("AUDIT: ASSIGNMENT DELETES", snapshot.assignment_deletes));
  // PHASE 4a. The two halves of the review record. The first says what the AI
  // graded before any human touched it, which is the one thing in this file
  // that exists nowhere else at all once the class is gone; the second says who
  // changed what, when, and from which total.
  rows.push(
    ...section(
      "THE AI'S ORIGINAL SCORES (before any instructor review)",
      snapshot.submission_ai_scores,
    ),
  );
  rows.push(...section("AUDIT: INSTRUCTOR REVIEWS", snapshot.submission_reviews));

  // Said at the end as well as the top, because a long file is read from both
  // ends and this is the sentence nobody should miss.
  rows.push(
    cell(
      "END OF EXPORT. The recordings listed above are permanently deleted and are not contained in this file.",
    ),
  );

  return rows.join("\n");
}

// A filename that sorts by date and names the class, in the shape
// submissionFileBase() uses in lib/instructor-submission.ts.
export function classExportFilename(className: string, when: Date): string {
  const safe = className.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const date = when.toISOString().slice(0, 10);
  return `relii-class-export-${safe || "class"}-${date}.csv`;
}
