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
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCsv, classifyRows, type SkippedRow } from "@/lib/bulk-invite";

export async function POST(request: Request) {
  // 1. The caller must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = createAdminClient();

  // 2. The caller must be an instructor, verified on the server against the
  //    database (never trusting the browser), the same way uninvite does.
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "instructor") {
    return NextResponse.json(
      { error: "Only instructors can bulk invite." },
      { status: 403 },
    );
  }

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
  const { data: invites, error: invitesError } = await admin
    .from("allowed_emails")
    .select("email");
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

  const existingInvites = new Set(
    (invites ?? []).map((i) => i.email.toLowerCase()),
  );
  const registeredUsers = new Set(
    (profiles ?? []).map((p) => p.email.toLowerCase()),
  );

  // 5. Classify every row. Only the valid rows are inserted; the rest are
  //    reported with a reason.
  const { valid, skipped } = classifyRows(
    rows,
    existingInvites,
    registeredUsers,
  );

  // 6. Insert the valid rows. Try one batch first; on a duplicate-key race
  //    (23505) fall back to inserting one at a time so a single collision moves
  //    that row to "skipped" instead of sinking the whole batch (partial success
  //    at the database layer too). added_by records who ran the import (an
  //    existing nullable column; no schema change).
  const added: string[] = [];
  const skippedAtInsert: SkippedRow[] = [];

  if (valid.length > 0) {
    const toInsert = valid.map((v) => ({
      email: v.email,
      role: v.role,
      added_by: user.id,
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
          .insert({ email: v.email, role: v.role, added_by: user.id });
        if (!rowError) {
          added.push(v.email);
        } else if (rowError.code === "23505") {
          skippedAtInsert.push({
            value: v.email,
            reason: "Already on the invite list",
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

  const allSkipped = [...skipped, ...skippedAtInsert];

  return NextResponse.json({
    ok: true,
    addedCount: added.length,
    skippedCount: allSkipped.length,
    added,
    skipped: allSkipped,
  });
}
