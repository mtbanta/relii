// POST /api/instructor/class/rename
// Body: { classId, name }
//
// GATE 6. Renames one of the signed-in instructor's own classes.
//
// It renames a class and nothing else: no row moves, no class_id changes, and
// the Gate 4a same-class constraints never come into it. The name is a label.
//
// ==> ONE CONSEQUENCE WORTH KNOWING, because it is a reading skill this project
//     already relies on. The signup rule names a class after the person it
//     creates it for, so Gate 4b was able to spot a class handover in the data
//     purely from the name disagreeing with the owner. Renaming is now a normal
//     thing an instructor does, so a name that does not match its owner no
//     longer implies a handover. It never implied a fault either way. <==
//
// Service-role key for the same reason as create: `classes` has Row Level
// Security switched on with no policies, so the browser cannot write it.
import { NextResponse } from "next/server";
import { requireInstructorRequest } from "@/lib/class-scope";
import { listInstructorClasses } from "@/lib/instructor-auth";
import { MAX_CLASS_NAME_LENGTH, cleanClassName } from "@/lib/class-name";

export async function POST(request: Request) {
  const gate = await requireInstructorRequest("rename a class");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, userId } = gate;

  let classId = "";
  let raw = "";
  try {
    const body = await request.json();
    classId = typeof body?.classId === "string" ? body.classId : "";
    raw = typeof body?.name === "string" ? body.name : "";
  } catch {
    // falls through to the checks below
  }

  const name = cleanClassName(raw);
  if (!name) {
    return NextResponse.json(
      { error: "Give the class a name." },
      { status: 400 },
    );
  }
  if (name.length > MAX_CLASS_NAME_LENGTH) {
    return NextResponse.json(
      {
        error: `A class name can be at most ${MAX_CLASS_NAME_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  // OWNERSHIP, READ FROM THE DATABASE, NEVER TAKEN FROM THE REQUEST. The class
  // id arrives from the browser, so it is checked against the caller's own
  // classes exactly the way the select route checks a switch. The 404 wording
  // matches refuseOutsideClass(): it does not confirm that a class with this id
  // exists in somebody else's account.
  const classes = await listInstructorClasses(userId);
  if (!classes.some((c) => c.id === classId)) {
    console.warn(
      `Gate 6 refused a class rename: ${classId} is not owned by ${userId}.`,
    );
    return NextResponse.json(
      { error: "That class was not found." },
      { status: 404 },
    );
  }

  const { error } = await admin
    .from("classes")
    .update({ name })
    .eq("id", classId)
    // Belt and braces on top of the ownership check above: even with a wrong id
    // this update can only ever touch a row this instructor owns.
    .eq("instructor_id", userId);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `You already have a class called "${name}". Pick another name.` },
        { status: 409 },
      );
    }
    console.error("Renaming a class failed:", classId, error);
    return NextResponse.json(
      { error: "Could not rename the class. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, name });
}
