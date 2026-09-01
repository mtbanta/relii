// POST /api/admin/class/<id>/reassign
// Body: { toInstructorId }
//
// Hands a whole class to a different instructor. Super admin only.
//
// WHY THIS EXISTS AND WHY IT COMES FIRST ON THE PAGE. If an instructor leaves
// and their students still need their work, reassigning the class is obviously
// better than destroying it. It changes ONE COLUMN, classes.instructor_id, and
// no class_id anywhere, so the Gate 4a "on update restrict" rules never come
// into it: not a single row moves between classes. Nothing is deleted, no
// student loses an account, no recording is touched. The export-first cascade
// delete still exists because someone eventually needs it, but it should not be
// the only answer, or it becomes the common one.
//
// ==> THE HAZARD THAT SHAPES THIS WHOLE ROUTE, and it is not obvious from the
//     one-column update. getInstructorClassId() in lib/instructor-auth.ts takes
//     the instructor's OLDEST class and stops at one, and every instructor page
//     and every write path goes through it. So handing a class to someone who
//     ALREADY OWNS ONE gives them two, and the app silently picks the older.
//     The historical class is the oldest class in the system, so reassigning it
//     to an instructor with content of their own would flip every scoped read on
//     their surface to the reassigned class and make THEIR OWN CONTENT INVISIBLE
//     TO THEM, with nothing on screen saying why. That is exactly the shape of
//     silent failure this gate has spent five pieces removing.
//
//     So a class is only ever handed to an instructor whose own class is EMPTY,
//     and that empty class is deleted in the same operation, leaving them with
//     exactly one class again. In practice that means a freshly added instructor
//     who has registered and done nothing yet, which is the realistic case for
//     "somebody is taking over this course". <==
import { NextResponse } from "next/server";
import { requireSuperAdminRequest } from "@/lib/super-admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminRequest("reassign a class");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin } = gate;

  const { id: classId } = await params;

  let toInstructorId = "";
  try {
    const body = await request.json();
    toInstructorId = typeof body?.toInstructorId === "string" ? body.toInstructorId : "";
  } catch {
    // falls through to the check below
  }
  if (!toInstructorId) {
    return NextResponse.json({ error: "Choose an instructor." }, { status: 400 });
  }

  // 1. The class being handed over.
  const { data: cls, error: classError } = await admin
    .from("classes")
    .select("id, name, instructor_id")
    .eq("id", classId)
    .maybeSingle();
  if (classError || !cls) {
    return NextResponse.json({ error: "That class was not found." }, { status: 404 });
  }
  if (cls.instructor_id === toInstructorId) {
    return NextResponse.json(
      { error: "That instructor already owns this class." },
      { status: 400 },
    );
  }

  // 2. The receiving instructor. Read from the database, never trusted from the
  //    request beyond the id.
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", toInstructorId)
    .maybeSingle();
  if (targetError || !target) {
    return NextResponse.json({ error: "That instructor was not found." }, { status: 404 });
  }
  if (target.role !== "instructor") {
    return NextResponse.json(
      { error: "A class can only be handed to an instructor account." },
      { status: 400 },
    );
  }

  // 3. Their own class, if they have one. It has to go, or they end up with two
  //    and the app quietly uses the older.
  const { data: ownClasses, error: ownError } = await admin
    .from("classes")
    .select("id, name")
    .eq("instructor_id", toInstructorId);
  if (ownError) {
    return NextResponse.json(
      { error: "Could not check that instructor's own class. Nothing was changed." },
      { status: 500 },
    );
  }

  for (const own of ownClasses ?? []) {
    // THE ONE CHECK THE DATABASE CANNOT MAKE FOR US. class_members.class_id is
    // "on delete cascade", so a class with students would be deleted quietly,
    // taking their memberships with it. Every other child link (rubrics,
    // scenarios, assignments, sessions, allowed_emails) is "on delete restrict",
    // so the delete below FAILS LOUDLY if any of them has a row. That is the
    // guard: not a read followed by a hopeful delete, but a delete the database
    // itself refuses if the class is not empty.
    const { count: memberCount, error: memberError } = await admin
      .from("class_members")
      .select("user_id", { count: "exact", head: true })
      .eq("class_id", own.id);
    if (memberError) {
      return NextResponse.json(
        { error: "Could not check that instructor's own class. Nothing was changed." },
        { status: 500 },
      );
    }
    if ((memberCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `${target.email} already has students in their own class, so they cannot take on another one. The app gives each instructor a single class.`,
        },
        { status: 409 },
      );
    }

    // THE ORDER IS DELIBERATE: their empty class is deleted BEFORE the handover.
    // If it fails (because it turned out not to be empty), nothing has happened
    // yet and the class stays with its current owner. Done the other way round,
    // a failure here would leave them owning two classes, which is the state
    // this route exists to prevent.
    const { error: dropError } = await admin.from("classes").delete().eq("id", own.id);
    if (dropError) {
      return NextResponse.json(
        {
          error: `${target.email} has content in their own class ("${own.name}"), so they cannot take on another one. The app gives each instructor a single class. Nothing was changed.`,
        },
        { status: 409 },
      );
    }
  }

  // 4. The handover itself: one column.
  const { error: updateError } = await admin
    .from("classes")
    .update({ instructor_id: toInstructorId })
    .eq("id", classId);
  if (updateError) {
    console.error("Reassigning the class failed:", classId, updateError);
    return NextResponse.json(
      {
        error: `Could not hand over the class: ${updateError.message}. ${target.email} may now have no class of their own; try the reassignment again.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: `"${cls.name}" now belongs to ${target.email}. Every student, assignment, persona, submission and recording in it is untouched.`,
  });
}
