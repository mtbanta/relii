// POST /api/instructor/bulk-invite
// Body: { csv }  (the raw text of the uploaded .csv file)
//
// Adds every VALID new row of a two-column (email, role) CSV to the invite list
// (allowed_emails) in one go. This is a batch of the single-invite insert: the
// same table and the same constraints, so there is NO schema change. Bad rows are
// SKIPPED and reported per row with a plain reason; the whole file is never
// rejected (partial success).
//
// It is guarded exactly like the uninvite route: the caller must be a signed-in
// instructor (role read from the DATABASE, never trusted from the browser), and
// all work runs server-side with the service-role key. Parsing, validation, and
// case-insensitive dedup happen here on the server so they cannot be spoofed; the
// browser only sends the raw file text and shows the result.
import { NextResponse } from "next/server";
import { requireInstructorRequest } from "@/lib/class-scope";
import { listInstructorClasses } from "@/lib/instructor-auth";
import {
  parseCsv,
  classifyRows,
  alreadyInvitedReason,
  type SkippedRow,
} from "@/lib/bulk-invite";

export async function POST(request: Request) {
  // 1 and 2, plus the caller's class, in one call. GATE 3b replaced the
  // signed-in check and the profiles role check that used to be written out
  // here, and identically in ten sibling routes, with the shared guard in
  // lib/class-scope.ts. It answers the same two questions and one new one:
  // WHICH CLASS may this caller act inside.
  //
  // It cannot be requireInstructor(): that calls redirect(), a page mechanism,
  // which throws here instead of returning a JSON error.
  const gate = await requireInstructorRequest("bulk invite");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId, userId, isSuperAdmin } = gate;

  // GATE 3a's class lookup used to be written out again here. GATE 3b folded it
  // into the shared guard above, which refuses a caller with no class before this
  // route gets a chance to run, so an import can never produce a whole roster of
  // students in no class.

  // 3. Read the CSV text from the request.
  let csv: unknown;
  try {
    const body = await request.json();
    csv = body?.csv;
  } catch {
    // fall through to the missing-file check
  }
  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json(
      { error: "No CSV text was uploaded." },
      { status: 400 },
    );
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "The file had no rows to import (after any header row)." },
      { status: 400 },
    );
  }

  // 4. Build the two dedup sets from the database, the same way the roster and
  //    the uninvite route do: LOWERCASED emails, so every comparison is
  //    case-insensitive (matching the signup trigger).
  //
  //    ==> GATE 3b ADDED NO TARGET CHECK TO THIS ROUTE AND LEFT BOTH OF THESE
  //        READS GLOBAL. It is the only one of the eleven with nothing to scope,
  //        and that is not an oversight in either half.
  //
  //        NOTHING TO SCOPE: this route only WRITES. It has no target row handed
  //        to it by id, and every invite it creates is stamped with the caller's
  //        own class (Gate 3a write path 3). The shared guard above already
  //        refuses a caller who owns no class.
  //
  //        WHY THE DEDUP STAYS GLOBAL, and this is the load bearing half:
  //        allowed_emails.email is the PRIMARY KEY, so an address can exist only
  //        ONCE across the entire system, not once per class. If another
  //        instructor has already invited an address, this route cannot insert it
  //        at all. Scoped to this class the address would look new, the insert
  //        would be attempted, and the instructor would get a raw duplicate-key
  //        error instead of a readable reason. The listing is scoped; the fact
  //        check is not. See lib/class-scope.ts.
  //
  //        THAT COLLISION IS REAL AND IT IS PARKED FOR GATE 5 as a design
  //        ruling, not a bug to fix here: a student taking two instructors'
  //        courses can only ever be invited by one of them. <==
  //
  // GATE 4a ADDED class_id TO THE FIRST READ AND NOTHING ELSE. It costs no extra
  // round trip: the same read answers both questions at once, "does this address
  // exist anywhere" (global, and it has to be) and "whose class invited it",
  // which is what turns a dead-end skip reason into one the instructor can act
  // on. The four possible reasons live in alreadyInvitedReason() in
  // lib/bulk-invite.ts, so the dedup here and the collision handler further down
  // cannot drift apart.
  const { data: invites, error: invitesError } = await admin
    .from("allowed_emails")
    .select("email, class_id");
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("email");
  if (invitesError || profilesError) {
    console.error(
      "Reading the invite list or profiles failed:",
      invitesError,
      profilesError,
    );
    return NextResponse.json(
      { error: "Could not read the invite list. Please try again." },
      { status: 500 },
    );
  }

  // Every invited address, mapped to the class that invited it.
  const inviteClassByEmail = new Map<string, string | null>(
    (invites ?? []).map((i) => [i.email.toLowerCase(), i.class_id]),
  );
  const registeredUsers = new Set(
    (profiles ?? []).map((p) => p.email.toLowerCase()),
  );

  // GATE 6: every class this instructor owns, so a collision on one of their OWN
  // other invite lists reads as that rather than as "another instructor". One
  // small read per import, on a path that already does two much larger ones.
  const ownedClassNames = new Map(
    (await listInstructorClasses(userId)).map((c) => [c.id, c.name]),
  );

  // 5. Classify every row. Only the valid rows are inserted; the rest are
  //    reported with a reason.
  // GATE 6 ADDED THE LAST ARGUMENT. An ordinary instructor may no longer invite
  // another INSTRUCTOR, and the flag comes from the profiles read the shared
  // guard above already does, never from anything the browser sent.
  //
  // ==> WHY THE CHECK IS INSIDE classifyRows RATHER THAN A REFUSAL HERE. This
  //     route's contract is partial success: the whole file is never rejected.
  //     A roster of thirty students carrying one instructor row must add the
  //     thirty and explain the one, which is what every other row rule does.
  //     Refusing the upload here would make this the only rule in the import
  //     that works differently. It is still a server-side rule: classifyRows is
  //     pure, but it runs here. <==
  const { valid, skipped } = classifyRows(
    rows,
    inviteClassByEmail,
    registeredUsers,
    classId,
    isSuperAdmin,
    ownedClassNames,
  );

  // 6. Insert the valid rows. Try one batch first; on a duplicate-key race
  //    (23505) fall back to inserting one at a time so a single collision moves
  //    that row to "skipped" instead of sinking the whole batch (partial success
  //    at the database layer too). added_by records who ran the import (an
  //    existing nullable column; no schema change).
  const added: string[] = [];
  const skippedAtInsert: SkippedRow[] = [];
  // GATE 4a: the rows that collided at the MOMENT OF INSERT rather than at the
  // dedup above. Their position in skippedAtInsert is remembered so the exact
  // reason can be filled in afterwards, in one read for the whole batch rather
  // than one read per row.
  const collidedAtInsert: { index: number; email: string }[] = [];

  if (valid.length > 0) {
    const toInsert = valid.map((v) => ({
      email: v.email,
      role: v.role,
      added_by: userId,
      // GATE 3a, write path 3 of 9 (the batch half).
      class_id: classId,
    }));
    const { error: batchError } = await admin
      .from("allowed_emails")
      .insert(toInsert);

    if (!batchError) {
      added.push(...valid.map((v) => v.email));
    } else {
      // Degrade to per-row so one collision does not fail the rest.
      for (const v of valid) {
        const { error: rowError } = await admin
          .from("allowed_emails")
          // GATE 3a, write path 3 of 9 (the per-row fallback half). It has to
          // set class_id too, or a batch that hit one duplicate would write
          // every remaining invite with no class.
          .insert({
            email: v.email,
            role: v.role,
            added_by: userId,
            class_id: classId,
          });
        if (!rowError) {
          added.push(v.email);
        } else if (rowError.code === "23505") {
          // GATE 4a. A collision HERE, rather than at the dedup above, means the
          // address was added by somebody else in the moments between that read
          // and this insert. So its class is not in inviteClassByEmail and has
          // to be looked up. The reason below is a safe fallback that is
          // replaced with the exact one after the loop.
          collidedAtInsert.push({ index: skippedAtInsert.length, email: v.email });
          skippedAtInsert.push({
            value: v.email,
            reason: "Already invited",
          });
        } else {
          console.error("Inserting an invite row failed:", rowError);
          skippedAtInsert.push({
            value: v.email,
            reason: "Could not be added (database error)",
          });
        }
      }
    }
  }

  // GATE 4a. Give every insert-time collision the same exact reason the dedup
  // gives, so one CSV upload can never report the same situation two different
  // ways depending on which check happened to catch it. This runs only on a
  // genuine race, so it is one extra read that almost never happens; if it
  // fails, the fallback reason set above stands and nothing else is affected.
  if (collidedAtInsert.length > 0) {
    const { data: late } = await admin
      .from("allowed_emails")
      .select("email, class_id")
      .in(
        "email",
        collidedAtInsert.map((c) => c.email),
      );
    const lateClassByEmail = new Map<string, string | null>(
      (late ?? []).map((i) => [i.email.toLowerCase(), i.class_id]),
    );
    for (const c of collidedAtInsert) {
      skippedAtInsert[c.index].reason = alreadyInvitedReason(
        lateClassByEmail.get(c.email),
        classId,
        registeredUsers.has(c.email),
        ownedClassNames,
      );
    }
  }

  const allSkipped = [...skipped, ...skippedAtInsert];

  return NextResponse.json({
    ok: true,
    addedCount: added.length,
    skippedCount: allSkipped.length,
    added,
    skipped: allSkipped,
  });
}
