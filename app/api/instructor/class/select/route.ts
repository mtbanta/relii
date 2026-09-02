// POST /api/instructor/class/select
// Body: { classId }
//
// GATE 6. Sets the instructor's WORKING CLASS, which every scoped read and every
// write on the instructor surface then uses.
//
// ==> THIS ROUTE IS NOT THE SECURITY BOUNDARY, AND SAYING SO OUT LOUD MATTERS
//     MORE THAN THE CHECK IT MAKES. It verifies ownership before setting the
//     cookie, which is right and stops an honest mistake. But a cookie is
//     editable by the person holding it, so a check made HERE proves nothing
//     about what the cookie says LATER. The check that counts is the one in
//     resolveWorkingClassId() (lib/instructor-auth.ts), which re-reads
//     classes.instructor_id on EVERY request and ignores anything the caller
//     does not own. This route could be bypassed entirely and nothing would be
//     reachable that is not reachable now. <==
//
// WHY A ROUTE AT ALL, rather than a client write or a server action. Three
// separate reasons, any one of which is sufficient: `classes` has Row Level
// Security switched ON with NO policies (Gate 1), so the browser cannot read or
// write that table at all and could not check ownership for itself; cookies
// cannot be set from a Server Component (see the catch block in
// lib/supabase/server.ts); and there are no server actions anywhere in this
// codebase. So it follows the existing form-and-route pattern: post here, then
// router.refresh().
import { NextResponse } from "next/server";
import { requireInstructorRequest } from "@/lib/class-scope";
import { listInstructorClasses } from "@/lib/instructor-auth";
import {
  WORKING_CLASS_COOKIE,
  WORKING_CLASS_COOKIE_OPTIONS,
} from "@/lib/working-class";

export async function POST(request: Request) {
  const gate = await requireInstructorRequest("switch class");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { userId } = gate;

  let classId = "";
  try {
    const body = await request.json();
    classId = typeof body?.classId === "string" ? body.classId : "";
  } catch {
    // falls through to the check below
  }
  if (!classId) {
    return NextResponse.json({ error: "Choose a class." }, { status: 400 });
  }

  // Ownership, read from the database. The list is filtered by
  // classes.instructor_id, so membership of it IS the authorisation.
  const classes = await listInstructorClasses(userId);
  const target = classes.find((c) => c.id === classId);
  if (!target) {
    // The same shape of refusal refuseOutsideClass() makes, and for the same
    // reason: it does not confirm that a class with this id exists somewhere
    // else. The log line is where the real reason goes.
    console.warn(
      `Gate 6 refused a class switch: ${classId} is not owned by ${userId}.`,
    );
    return NextResponse.json(
      { error: "That class was not found." },
      { status: 404 },
    );
  }

  const response = NextResponse.json({ ok: true, name: target.name });
  response.cookies.set(
    WORKING_CLASS_COOKIE,
    target.id,
    WORKING_CLASS_COOKIE_OPTIONS,
  );
  return response;
}
