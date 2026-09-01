// One place that answers "is this visitor a signed-in instructor, and what is
// their name?" for every page under /instructor.
//
// It exists because the instructor surface is now several sibling pages
// (Submissions, AI Persona Framework, Manage Assignments, Roster, Invite Users)
// instead of one long page, and each of them needs the same three things: the
// signed-in user, their role read from the DATABASE (never trusted from the
// browser), and the profile fields the header shows.
//
// The shared layout calls this to draw the header and to decide whether the
// name gate blocks the page. Each page calls it again for itself, because a
// page can be requested directly and because every page needs the user's id for
// its own reads anyway. It is the same check in one function, not the same
// check written out five times.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type InstructorProfile = {
  role: string;
  // GATE 3b added email. The Roster now builds the signed-in instructor's own
  // row from this profile rather than from a query, because scoping the Roster
  // to one class means the instructor is the OWNER of it and not a member, so a
  // membership query would render an instructor section with nobody in it. The
  // email is what displayName() falls back to when no name is set, and
  // user.email is optional on the auth object, so reading it here is what makes
  // that row impossible to render blank.
  email: string;
  first_name: string | null;
  last_name: string | null;
  // GATE 4b added this, and it is read for ONE purpose: deciding whether to draw
  // the Administration link in the instructor nav. IT FILTERS NOTHING AND
  // BRANCHES NOTHING ELSE. A super admin is an ordinary instructor everywhere on
  // this surface, with one class and no wider sight, which is what locked
  // decision 3 requires: the super admin exception must not be threaded through
  // the instructor surface, because that is where isolation bugs come from. The
  // /admin routes do their own check with their own guard (lib/super-admin.ts),
  // so this value being wrong could only ever hide or show a link.
  is_super_admin: boolean;
};

// GATE 3a: which class does this instructor own?
//
// Every instructor owns exactly one class. Gate 1 created one for the seeded
// first instructor and gives every new instructor their own at signup, and Gate
// 1's verification confirmed nobody owns more than one. The "oldest first" sort
// is a tiebreaker that should never have to break a tie; it is there so this
// function can never return a different answer on two different calls.
//
// IT USES THE SERVICE-ROLE KEY ON PURPOSE, AND IT HAS TO. Gate 1 switched Row
// Level Security ON for the classes table with NO policies attached, so a read
// through the ordinary logged-in client returns zero rows for everybody. The
// alternative, adding a read policy to classes, would be a new security rule on
// a table this piece was not asked to touch. Reading it server-side with the
// service-role key is what the rest of the instructor surface already does.
//
// WHY IT IS EXPORTED SEPARATELY from requireInstructor below. requireInstructor
// calls redirect(), which is a page mechanism: called from an API route it
// throws instead of returning a JSON error. So the four server routes that need
// the caller's class (bulk invite, persona generation, and the two audit
// writers) cannot call it and call this instead. One lookup, two callers.
//
// It returns null rather than throwing if the instructor somehow owns no class
// (only possible if one was deleted by hand). Callers decide what to do; the two
// browser forms refuse to write rather than save a row with no class.
export async function getInstructorClassId(
  userId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("classes")
    .select("id")
    .eq("instructor_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

// Returns the signed-in instructor, their profile, and the id of the class they
// own. Anyone not signed in goes to the login page; anyone who is not an
// instructor goes to the student page. Neither case ever returns, so callers can
// use the result directly.
//
// GATE 3a added classId. It is the class that every row this instructor creates
// belongs to. NOTHING HERE FILTERS ANYTHING: this function still answers "who is
// this and are they an instructor".
//
// GATE 3b is what uses it to filter. Pages take the classId from here and scope
// their own reads with it; API routes cannot call this function at all (it calls
// redirect(), a page mechanism) and use requireInstructorRequest() in
// lib/class-scope.ts instead, which wraps getInstructorClassId above.
export async function requireInstructor(): Promise<{
  user: { id: string; email?: string };
  profile: InstructorProfile;
  classId: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // GATE 4b added is_super_admin to this select. It is not a new query, and the
  // "read own profile" policy already covers it: a user reads their own row and
  // only their own. The column cannot be forged from the browser either, because
  // profiles has no update policy at all.
  //
  // ==> supabase/gate-4b-super-admin.sql HAS TO HAVE BEEN RUN BEFORE THIS CODE
  //     IS LIVE. This read is on EVERY instructor page, so a missing column
  //     breaks the whole instructor surface, not just the new section. <==
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, first_name, last_name, is_super_admin")
    .eq("id", user.id)
    .single();

  // Students who land on any instructor page get sent to their own page.
  if (profile?.role !== "instructor") {
    redirect("/student");
  }

  const classId = await getInstructorClassId(user.id);

  return { user, profile: profile as InstructorProfile, classId };
}
