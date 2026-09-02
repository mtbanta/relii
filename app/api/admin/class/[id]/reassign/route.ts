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
// ==> GATE 6 RELAXED THIS ROUTE'S CENTRAL GUARD, AND THE REASON THE GUARD
//     EXISTED IS THE REASON IT COULD GO. IT IS NOT A SILENT RELAXATION: it was
//     put to the owner in the Gate 6 plan and ruled on 2026-09-02.
//
//     WHAT THE GUARD WAS AND WHY. getInstructorClassId() used to take an
//     instructor's OLDEST class and stop at one, and every instructor page and
//     every write path went through it. So handing a class to somebody who
//     ALREADY OWNED ONE gave them two and the app silently picked the older.
//     Because the historical class is the oldest class in the system, handing it
//     to an instructor with content of their own would have flipped every scoped
//     read on their surface to the reassigned class and made THEIR OWN CONTENT
//     INVISIBLE TO THEM, with nothing on screen saying why. So the route refused
//     unless the receiving instructor's own class was EMPTY, and deleted that
//     empty class as part of the handover to keep them at exactly one.
//
//     WHY THAT IS GONE. Gate 6 replaced getInstructorClassId() with
//     resolveWorkingClassId(), which honours the instructor's own selection.
//     Owning several classes is now ordinary, and the receiver's working class
//     does not move when they are handed another one (their remembered selection
//     still names a class they own), so their own content stays exactly where it
//     was. The silent failure is prevented by construction rather than by a
//     guard, and "the receiver ends up with exactly one class" stopped being a
//     property worth preserving the moment a picker existed.
//
//     WHAT IS STILL CHECKED: the target must be an instructor, must not already
//     own this class, and must not already have a class of the SAME NAME. That
//     last one is new, and it is new BECAUSE of this relaxation, see below. <==
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

  // ==> 3. THE NAME COLLISION, AND IT IS REACHABLE ONLY BECAUSE OF THE
  //     RELAXATION ABOVE. `classes` carries unique (instructor_id, name) from
  //     Gate 1. Until Gate 6 a collision here was STRUCTURALLY IMPOSSIBLE,
  //     because the receiving instructor's own class was deleted BEFORE the
  //     update, so they held nothing to clash with. Remove that delete and it
  //     becomes reachable: instructors now rename their classes, so two of them
  //     each holding a "Sales 300" is an ordinary Tuesday.
  //
  //     WITHOUT THIS PRE-CHECK the update below fails with a raw 23505, and,
  //     worse, its existing error text says the target "may now have no class of
  //     their own; try the reassignment again", which would be both WRONG (they
  //     still have every class they had) and alarming. That is precisely the
  //     class of failure Gate 4a spent a piece making legible.
  //
  //     IT DOES NOT AUTO-RENAME. Picking a new name for somebody else's class on
  //     their behalf is a decision, and the administrator is standing right
  //     there. <==
  const { data: ownClasses, error: ownError } = await admin
    .from("classes")
    .select("id, name")
    .eq("instructor_id", toInstructorId);
  if (ownError) {
    return NextResponse.json(
      { error: "Could not check that instructor's own classes. Nothing was changed." },
      { status: 500 },
    );
  }

  const clash = (ownClasses ?? []).find((own) => own.name === cls.name);
  if (clash) {
    return NextResponse.json(
      {
        error: `${target.email} already has a class called "${cls.name}", and one instructor cannot have two classes with the same name. Rename one of them first, then hand this one over. Nothing was changed.`,
      },
      { status: 409 },
    );
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
        // GATE 6: this used to warn that the receiver "may now have no class of
        // their own", which was true only while their own class was deleted
        // first. Nothing is deleted any more, so a failure here changes nothing
        // at all and the message says so.
        error: `Could not hand over the class: ${updateError.message}. Nothing was changed; the class still belongs to its current owner.`,
      },
      { status: 500 },
    );
  }

  const alsoHolds = (ownClasses ?? []).length;
  return NextResponse.json({
    ok: true,
    message: `"${cls.name}" now belongs to ${target.email}. Every student, assignment, persona, submission and recording in it is untouched.${
      alsoHolds > 0
        ? ` They now hold ${alsoHolds + 1} classes and can switch between them with the class picker; their own work is unaffected.`
        : ""
    }`,
  });
}
