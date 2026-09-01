// POST /api/admin/class/<id>/export
//
// Builds the complete export of one class and issues the one-time token the
// delete route demands. Super admin only, service-role key, server-side.
//
// WHY THIS IS A POST AND NOT A DOWNLOAD LINK. It has a side effect: it writes a
// class_exports row. A GET that changes the database is a link a browser may
// follow on its own (a prefetch, a bookmark check), and every one of those would
// mint a fresh delete authorisation. The browser fetches this, saves the file
// itself, and keeps the token for the delete step.
//
// IT IS THE ONLY THING IN THE APP THAT ISSUES A TOKEN, which is what makes
// "export first" a rule the server enforces rather than a sequence the page
// happens to present.
import { NextResponse } from "next/server";
import { requireSuperAdminRequest } from "@/lib/super-admin";
import {
  buildClassSnapshot,
  snapshotToCsv,
  classExportFilename,
} from "@/lib/class-export";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminRequest("export a class");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, userId, email } = gate;

  const { id: classId } = await params;

  // Everything in the class, plus the fingerprint of it. Throws rather than
  // returning a partial picture; a half-read export with a matching fingerprint
  // would be the worst possible outcome of this piece.
  let built;
  try {
    built = await buildClassSnapshot(admin, classId);
  } catch (error) {
    console.error("Building the class export failed:", classId, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === "That class was not found."
            ? "That class was not found."
            : "Could not read this class. No export was issued.",
      },
      { status: 500 },
    );
  }

  const { snapshot, counts, fingerprint } = built;
  const exportedAt = new Date();

  // The token row. Written BEFORE the file is handed over, so a token can never
  // exist only in a browser, and every export leaves a record whether or not a
  // delete ever follows.
  const { data: tokenRow, error: tokenError } = await admin
    .from("class_exports")
    .insert({
      class_id: classId,
      class_name: String(snapshot.class.name ?? ""),
      instructor_id: snapshot.class.instructor_id ?? null,
      instructor_email: snapshot.instructor?.email ?? null,
      exported_by: userId,
      exported_by_email: email,
      fingerprint,
      counts,
    })
    .select("id")
    .single();

  if (tokenError || !tokenRow) {
    console.error("Recording the class export failed:", classId, tokenError);
    return NextResponse.json(
      { error: "Could not record the export, so no export was issued." },
      { status: 500 },
    );
  }

  const csv = snapshotToCsv(snapshot, counts, {
    tokenId: tokenRow.id as string,
    exportedAt: exportedAt.toISOString(),
    exportedByEmail: email,
    fingerprint,
  });

  return NextResponse.json({
    ok: true,
    token: tokenRow.id,
    fingerprint,
    counts,
    filename: classExportFilename(String(snapshot.class.name ?? "class"), exportedAt),
    csv,
  });
}
