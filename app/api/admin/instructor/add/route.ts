// POST /api/admin/instructor/add
// Body: { email }
//
// Puts one address on the invite list as an INSTRUCTOR. Super admin only.
//
// That is the whole operation: no account is created here. They register at
// /register like anyone else, and the signup rule in the database
// (public.handle_new_user, supabase/gate-1-class-spine.sql) reads the role off
// the invite, creates their profile and gives them a class of their own, empty,
// per locked decision 3.
import { NextResponse } from "next/server";
import { requireSuperAdminRequest } from "@/lib/super-admin";

export async function POST(request: Request) {
  const gate = await requireSuperAdminRequest("add an instructor");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, userId } = gate;

  let email = "";
  try {
    const body = await request.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    // falls through
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
  }

  // Already invited? allowed_emails.email is the PRIMARY KEY, so an address
  // exists at most once across the whole system. Saying which case it is beats a
  // raw duplicate-key error, and here the super admin may be told the class,
  // unlike the instructor-facing messages: seeing across classes is this
  // section's entire purpose.
  const { data: existing, error: existingError } = await admin
    .from("allowed_emails")
    .select("email, role, class_id")
    .eq("email", email)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json(
      { error: "Could not check the invite list. Nothing was changed." },
      { status: 500 },
    );
  }
  if (existing) {
    return NextResponse.json(
      {
        error:
          existing.role === "instructor"
            ? `${email} is already invited as an instructor.`
            : `${email} is already invited as a student. Remove that invite first if they should be an instructor instead.`,
      },
      { status: 409 },
    );
  }

  // WHICH CLASS GOES ON AN INSTRUCTOR'S INVITE, and it is a formality rather
  // than a meaning. allowed_emails.class_id is "not null" as of Gate 4a, so
  // every invite row must name one, but the signup rule IGNORES it for an
  // instructor and creates them a class of their own instead. The super admin's
  // own class is used, which is exactly what the instructor-facing invite form
  // does with the inviter's class.
  //
  // THE CONSEQUENCE, worth knowing before it surprises someone: an instructor
  // invite that has not been taken up yet is deleted along with the class it was
  // created from, because the class cascade sweeps allowed_emails by class_id.
  // The class delete report names any it removes.
  const { data: ownClass, error: ownClassError } = await admin
    .from("classes")
    .select("id")
    .eq("instructor_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownClassError || !ownClass) {
    return NextResponse.json(
      {
        error:
          "Your own account is not linked to a class, so an invite cannot be created. Every invite row has to name one.",
      },
      { status: 409 },
    );
  }

  const { error: insertError } = await admin.from("allowed_emails").insert({
    email,
    role: "instructor",
    class_id: ownClass.id,
    added_by: userId,
  });
  if (insertError) {
    console.error("Adding an instructor invite failed:", email, insertError);
    return NextResponse.json(
      { error: "Could not add that invite. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: `${email} can now register as an instructor. They will get their own empty class when they do.`,
  });
}
