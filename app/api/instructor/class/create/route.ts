// POST /api/instructor/class/create
// Body: { name }
//
// GATE 6. Creates a new class owned by the signed-in instructor, and makes it
// the working class straight away.
//
// NOTHING IN THE APP CREATED A CLASS BEFORE THIS ROUTE. The only paths were the
// signup rule in the database (which gives each new instructor one class named
// "<localpart>'s Class") and the super admin's delete and reassign. That gap is
// why an instructor could never hold a second section, and closing it is the
// point of this piece.
//
// IT HAS TO BE A ROUTE WITH THE SERVICE-ROLE KEY. Gate 1 switched Row Level
// Security ON for `classes` with NO policies attached, so a browser insert is
// refused outright and a browser read returns nothing. This is the same trap
// Gate 3b named on the instructor side and app/student/page.tsx names on the
// student side.
//
// THE NEW CLASS BECOMES THE WORKING CLASS. You created it in order to set it up,
// so leaving you in the old one would mean every invite and every persona you
// made next landed in the wrong place. It is one cookie write on the same
// response, so it cannot half-happen.
import { NextResponse } from "next/server";
import { requireInstructorRequest } from "@/lib/class-scope";
import {
  WORKING_CLASS_COOKIE,
  WORKING_CLASS_COOKIE_OPTIONS,
} from "@/lib/working-class";
import { MAX_CLASS_NAME_LENGTH, cleanClassName } from "@/lib/class-name";

export async function POST(request: Request) {
  const gate = await requireInstructorRequest("create a class");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, userId } = gate;

  let raw = "";
  try {
    const body = await request.json();
    raw = typeof body?.name === "string" ? body.name : "";
  } catch {
    // falls through to the check below
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

  const { data, error } = await admin
    .from("classes")
    .insert({ name, instructor_id: userId })
    .select("id, name")
    .single();

  if (error) {
    // 23505 is the unique (instructor_id, name) rule from Gate 1. It is a
    // REALISTIC collision rather than a theoretical one, and it gets a sentence
    // that says what happened and what to do, in the spirit of Gate 4a's invite
    // rewrites: a raw duplicate-key error is not an acceptable message.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `You already have a class called "${name}". Pick another name.` },
        { status: 409 },
      );
    }
    console.error("Creating a class failed:", error);
    return NextResponse.json(
      { error: "Could not create the class. Please try again." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true, id: data.id, name: data.name });
  response.cookies.set(
    WORKING_CLASS_COOKIE,
    data.id,
    WORKING_CLASS_COOKIE_OPTIONS,
  );
  return response;
}
