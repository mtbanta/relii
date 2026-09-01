// POST /api/admin/class/<id>/delete
// Body: { token, confirm: "REMOVE" }
//
// THE MOST DESTRUCTIVE OPERATION IN THE APP. It permanently deletes a class,
// every rubric, persona, assignment and session in it, every webcam recording
// belonging to those sessions, the invite list, and the student accounts that
// existed only for this class.
//
// Super admin only, service-role key, server-side. An instructor cannot reach
// this route at all, whatever they send.
//
// ==> THE FOUR GATES, AND WHY THE FIRST TWO ARE THE ONES THAT MATTER.
//
//   1. A VALID, UNUSED, RECENT TOKEN NAMING THIS CLASS. The token is only ever
//      issued by the export route, so there is no way to reach a delete without
//      an export having been taken. "Export first" is therefore a server rule,
//      not a sequence the page happens to present. A crafted request that skips
//      the export has nothing to send.
//   2. THE FINGERPRINT STILL MATCHES. The snapshot is rebuilt from the live
//      database and compared with the one hashed at export time. If ANYTHING in
//      the class changed (a new submission, a reset, an edited assignment, a
//      recording uploaded), the export no longer describes what is about to be
//      destroyed, and an export that describes the wrong thing is worse than no
//      export at all. Refused, with the changed sections named.
//   3. The typed word, checked on the server, never merely in the page.
//   4. The caller is a super admin, checked against the database.
//
//   Gates 3 and 4 are the ordinary strong-confirmation pattern this codebase
//   already uses. Gates 1 and 2 are what this piece adds. <==
//
// ==> STORAGE FIRST, BEFORE ANY ROW. app/api/instructor/delete-student/route.ts
//     is the precedent and its reason is the right one: never leave a recording
//     whose owning row is already gone. The recordings are the one irreplaceable
//     thing in this system, and once the session rows are deleted nothing knows
//     where the files were. <==
//
// ==> THE ORDER OF THE ROW DELETES IS FORCED BY THE GATE 4a CONSTRAINTS and is
//     not a preference: sessions, assignments, scenarios, rubrics, then
//     allowed_emails and class_members, then the class row. Every link is
//     "on delete restrict", so a wrong order stops with a foreign key error and
//     changes nothing. That also makes a partial failure SAFE: children go
//     before parents, so a run that stops half way leaves a smaller class that
//     is still referentially valid, never a dangling reference. These are
//     separate API calls and cannot be one transaction, so that property is what
//     stands in for one. <==
import { NextResponse } from "next/server";
import { requireSuperAdminRequest } from "@/lib/super-admin";
import { buildClassSnapshot } from "@/lib/class-export";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";

// Distinct from DELETE (the assignment delete) and DISCARD (the bulk persona
// sweep). The reason DISCARD exists at all is documented in its own route: so
// muscle memory from one confirm cannot fire another.
const CONFIRM_WORD = "REMOVE";

// How long an export stays usable. The fingerprint check makes this close to
// redundant, since a class that changed cannot be deleted on an old token
// anyway. It is kept as hygiene: an authorisation to destroy student work should
// not sit around all week waiting to be clicked.
const EXPORT_TOKEN_TTL_MS = 60 * 60 * 1000;

// The seven class-carrying tables, in the only order the database permits. The
// two audit logs are deliberately absent; see the note further down.
const DELETE_ORDER = [
  "sessions",
  "assignments",
  "scenarios",
  "rubrics",
  "allowed_emails",
  "class_members",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminRequest("delete a class");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, userId } = gate;

  const { id: classId } = await params;

  // 1. Read the request.
  let token = "";
  let confirm = "";
  try {
    const body = await request.json();
    token = typeof body?.token === "string" ? body.token : "";
    confirm = typeof body?.confirm === "string" ? body.confirm : "";
  } catch {
    // No body: both checks below refuse.
  }

  // 2. The cheap checks first, so a request that was never going to succeed
  //    does no reading at all.
  // EVERY REFUSAL BELOW SAYS WHETHER THE EXPORT HAS TO BE TAKEN AGAIN, in a
  // retryExport field. Only the server knows: a wrong confirm word leaves a
  // perfectly good token, while a spent, stale, foreign or no-longer-matching
  // one has to be replaced. Without it the page would have to guess from the
  // wording, and it guessed wrong in the safe direction, sending the operator
  // back to re-export after a refusal that never touched their token.
  if (confirm !== CONFIRM_WORD) {
    return NextResponse.json(
      { error: `Type ${CONFIRM_WORD} to confirm this deletion.`, retryExport: false },
      { status: 400 },
    );
  }
  if (!token) {
    return NextResponse.json(
      {
        error:
          "This class has not been exported. Export it first: the delete cannot run without the token the export issues.",
        retryExport: true,
      },
      { status: 400 },
    );
  }

  // 3. The token. Every condition on it is a refusal, and each one is separate
  //    so the message can say which.
  //
  //    The shape is checked before the database sees it. A token that is not a
  //    uuid would make Postgres raise a type error, which this route would
  //    report as "could not check the export" (a 500) when the honest answer is
  //    "that is not a valid export" (a 400). It refuses either way; this makes
  //    the refusal say the right thing.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json(
      { error: "That export is not valid. Export this class again.", retryExport: true },
      { status: 400 },
    );
  }
  const { data: tokenRow, error: tokenError } = await admin
    .from("class_exports")
    .select("id, class_id, fingerprint, counts, used_at, created_at")
    .eq("id", token)
    .maybeSingle();

  if (tokenError) {
    console.error("Reading the export token failed:", token, tokenError);
    return NextResponse.json(
      { error: "Could not check the export. Nothing was deleted.", retryExport: false },
      { status: 500 },
    );
  }
  if (!tokenRow) {
    // Covers a made-up token and a token from an export that was never issued.
    // The wording never distinguishes them: there is nothing useful to learn
    // from the difference and something to learn from being told.
    return NextResponse.json(
      { error: "That export is not valid. Export this class again.", retryExport: true },
      { status: 400 },
    );
  }
  // THE SUBSTITUTION CHECK. A token is issued FOR ONE CLASS. Without this, a
  // valid export of an empty throwaway class would authorise the destruction of
  // any other class in the system.
  if (tokenRow.class_id !== classId) {
    console.warn(
      `Gate 4b refused a class delete: token ${token} was issued for class ${tokenRow.class_id}, request named ${classId}.`,
    );
    return NextResponse.json(
      {
        error:
          "That export was taken for a different class, so it cannot authorise this deletion. Export this class.",
        retryExport: true,
      },
      { status: 400 },
    );
  }
  if (tokenRow.used_at) {
    return NextResponse.json(
      { error: "That export has already been used. Export this class again.", retryExport: true },
      { status: 400 },
    );
  }
  if (Date.now() - new Date(tokenRow.created_at as string).getTime() > EXPORT_TOKEN_TTL_MS) {
    return NextResponse.json(
      { error: "That export is more than an hour old. Export this class again.", retryExport: true },
      { status: 400 },
    );
  }

  // 4. Rebuild the snapshot and compare. THE GATE THAT MAKES THE EXPORT MEAN
  //    SOMETHING.
  let built;
  try {
    built = await buildClassSnapshot(admin, classId);
  } catch (error) {
    console.error("Rebuilding the class snapshot failed:", classId, error);
    return NextResponse.json(
      { error: "Could not read this class. Nothing was deleted.", retryExport: false },
      { status: 500 },
    );
  }
  const { snapshot, counts, fingerprint } = built;

  if (fingerprint !== tokenRow.fingerprint) {
    // Name what moved, so the message is actionable rather than just a refusal.
    const before = (tokenRow.counts ?? {}) as Record<string, number>;
    const changed = Object.entries(counts)
      .filter(([key, value]) => before[key] !== value)
      .map(([key, value]) => `${key.replace(/_/g, " ")} ${before[key] ?? 0} to ${value}`);

    return NextResponse.json(
      {
        error:
          "This class has changed since the export, so the export no longer describes what would be destroyed. Export it again and check the new file." +
          (changed.length > 0 ? ` What changed: ${changed.join(", ")}.` : ""),
        // The token is untouched and still unused, but it can never match again
        // unless the class goes back to exactly how it was, so the honest answer
        // is still "export again".
        retryExport: true,
      },
      { status: 409 },
    );
  }

  // 5. CLAIM THE TOKEN BEFORE ANYTHING IS DESTROYED, and claim it in a way that
  //    two simultaneous requests cannot both win: the update only matches a row
  //    whose used_at is still empty, so exactly one of them gets a row back.
  //    A run that then fails part way through leaves a USED token on purpose.
  //    The operator exports again and sees the new state, rather than replaying
  //    an authorisation for a class that no longer looks like the file.
  const { data: claimed, error: claimError } = await admin
    .from("class_exports")
    .update({ used_at: new Date().toISOString() })
    .eq("id", token)
    .is("used_at", null)
    .select("id");

  if (claimError) {
    console.error("Claiming the export token failed:", token, claimError);
    return NextResponse.json(
      { error: "Could not start the deletion. Nothing was deleted.", retryExport: false },
      { status: 500 },
    );
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: "That export has already been used. Export this class again.", retryExport: true },
      { status: 400 },
    );
  }

  const removed: Record<string, number> = {};
  const notes: string[] = [];

  // 6. STORAGE FIRST. The paths come from the snapshot, which built them from
  //    sessions.video_path (plus any leftover file in a folder belonging to an
  //    account that is going anyway). NOT from a class_members sweep: an
  //    instructor who role-plays their own scenario has recordings under their
  //    own user id and is never a member of the class, so a membership sweep
  //    would leave those files behind for good.
  const paths = snapshot.recordings
    .filter((r) => r.kind !== "missing")
    .map((r) => r.path);

  // Removed in batches: one call with a thousand paths in it is a request the
  // Storage API may refuse whole, and a refusal here stops the whole deletion.
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error: removeError } = await admin.storage
      .from(SESSION_VIDEOS_BUCKET)
      .remove(batch);
    if (removeError) {
      console.error("Removing the class recordings failed:", classId, removeError);
      return NextResponse.json(
        {
          error: `Could not remove the recordings (${i} of ${paths.length} were removed). NO ROWS WERE DELETED and the class is otherwise untouched. The export has been used, so export again before retrying.`,
        },
        { status: 500 },
      );
    }
  }
  removed.recordings = paths.length;
  const missing = snapshot.recordings.filter((r) => r.kind === "missing").length;
  if (missing > 0) {
    notes.push(
      `${missing} session${missing === 1 ? "" : "s"} named a recording that was not in Storage. Nothing was there to remove.`,
    );
  }

  // 7. The rows, in the order the constraints force.
  for (const table of DELETE_ORDER) {
    const { count, error } = await admin
      .from(table)
      .delete({ count: "exact" })
      .eq("class_id", classId);

    if (error) {
      console.error(`Deleting ${table} for class ${classId} failed:`, error);
      return NextResponse.json(
        {
          error: `Removed the recordings, then stopped while deleting ${table}: ${error.message}. Everything after it is untouched.`,
          removed,
        },
        { status: 500 },
      );
    }
    removed[table] = count ?? 0;
  }

  // 8. The class row itself.
  const { error: classError } = await admin
    .from("classes")
    .delete()
    .eq("id", classId);
  if (classError) {
    console.error(`Deleting class ${classId} failed:`, classError);
    return NextResponse.json(
      {
        error: `Emptied the class but could not delete the class row: ${classError.message}.`,
        removed,
      },
      { status: 500 },
    );
  }
  removed.classes = 1;

  // 9. THE STUDENT ACCOUNTS, LAST, AND ONLY THE ONES THAT BELONG TO NOBODY ELSE.
  //
  //    WHY THE ACCOUNTS GO AT ALL, since the safer-sounding answer is to orphan
  //    them: there is no path anywhere in this app that adds an
  //    already-registered student to a class. The only inserts into class_members
  //    are the signup trigger (which fires once, at first registration) and the
  //    Gate 3a repair backfill. So an orphaned student is a one-way door: nobody
  //    could put them in a class again, and re-inviting their address would
  //    create an invite that does nothing. Deleting the account frees the email
  //    to be invited into a new class and leaves no dormant data behind.
  //
  //    ==> THE TWO CONDITIONS ARE CONDITIONS, NOT CONVENIENCES, and both are
  //        re-checked HERE against the live database rather than trusted from
  //        the snapshot:
  //
  //          a. role = 'student'. An instructor account is removed through the
  //             instructor-remove path and is never swept up by a class delete.
  //             This is the same refusal delete-student makes.
  //          b. No membership of any OTHER class. class_members is keyed
  //             (class_id, user_id) and permits more than one row, so "a student
  //             is only ever in one class" is a convention the schema does not
  //             enforce. Gate 4a spent a whole piece replacing conventions with
  //             constraints; leaving one in front of an irreversible account
  //             delete would be the odd one out. A student in another class
  //             keeps their account and loses only this membership.
  //
  //        The check runs AFTER step 7 removed this class's class_members rows,
  //        so "any row left" means exactly "in another class". <==
  const candidates = snapshot.students.filter((s) => s.account_will_be === "deleted");
  let accountsDeleted = 0;

  if (candidates.length > 0) {
    const ids = candidates.map((s) => s.id);

    const { data: stillMembers, error: stillError } = await admin
      .from("class_members")
      .select("user_id")
      .in("user_id", ids);
    const { data: liveProfiles, error: profileError } = await admin
      .from("profiles")
      .select("id, email, role")
      .in("id", ids);

    if (stillError || profileError) {
      console.error("Re-checking the student accounts failed:", stillError, profileError);
      return NextResponse.json(
        {
          error:
            "The class was deleted, but the student accounts could not be checked and were left in place. They now appear under Students in no class.",
          removed,
        },
        { status: 500 },
      );
    }

    const inAnotherClass = new Set((stillMembers ?? []).map((m) => m.user_id as string));
    const roleById = new Map(
      (liveProfiles ?? []).map((p) => [p.id as string, p.role as string]),
    );

    for (const student of candidates) {
      if (inAnotherClass.has(student.id)) {
        notes.push(
          `${student.email} is in another class, so their account was kept and only this class's membership was removed.`,
        );
        continue;
      }
      if (roleById.get(student.id) !== "student") {
        notes.push(
          `${student.email} is not a student account, so it was kept. Remove an instructor through the instructor controls.`,
        );
        continue;
      }
      if (student.id === userId) {
        // Unreachable (a super admin is an instructor, so the role check above
        // already refused) and guarded anyway, exactly as delete-student does.
        notes.push("Your own account was not deleted.");
        continue;
      }

      const { error: deleteUserError } = await admin.auth.admin.deleteUser(student.id);
      if (deleteUserError) {
        console.error("Deleting a student account failed:", student.id, deleteUserError);
        notes.push(
          `${student.email}: the account could not be deleted and is now in no class. It can be removed by hand.`,
        );
        continue;
      }
      accountsDeleted += 1;
    }
  }
  removed.student_accounts = accountsDeleted;

  // NOTE ON THE TWO AUDIT LOGS, because someone will count the tables and ask.
  // submission_resets and assignment_deletes are NOT deleted. They have no
  // foreign key to classes (Gate 1's deliberate decision, so that no later
  // delete could remove or blank a log entry), so nothing forces the choice, and
  // deleting them here would be this piece quietly reversing that decision. They
  // survive pointing at a class id that no longer exists, which is the log
  // working as designed. The export carries them, so the record exists in both
  // places.

  // 10. Close the record. This is the audit trail of the operation: one row
  //     saying what was there, who exported it, when it was used, and what came
  //     out.
  const { error: recordError } = await admin
    .from("class_exports")
    .update({ deleted_counts: removed })
    .eq("id", token);
  if (recordError) {
    console.error("Recording what the delete removed failed:", token, recordError);
    notes.push("The deletion finished but could not be written to the export record.");
  }

  return NextResponse.json({ ok: true, removed, notes });
}
