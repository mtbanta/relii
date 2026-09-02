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
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WORKING_CLASS_COOKIE } from "@/lib/working-class";

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

// One class an instructor owns, as the picker and the "in your other class"
// answers need it.
export type InstructorClass = { id: string; name: string };

// GATE 6: every class this instructor owns, oldest first.
//
// GATE 3a's getInstructorClassId() read this same table and stopped at one row,
// because an instructor owned exactly one class. This is that read with the
// "limit 1" taken off, and it is the foundation of everything else in this
// piece: the picker lists it, the resolver below validates against it, and the
// detail pages compare a row's class against it to tell "yours, elsewhere" from
// "not yours at all".
//
// IT USES THE SERVICE-ROLE KEY ON PURPOSE, AND IT HAS TO. Gate 1 switched Row
// Level Security ON for the classes table with NO policies attached, so a read
// through the ordinary logged-in client returns zero rows for everybody. The
// alternative, adding a read policy to classes, would be a new security rule on
// a table this piece was explicitly told not to touch. Reading it server-side
// with the service-role key is what the rest of the instructor surface does.
//
// OLDEST FIRST IS LOAD BEARING, not cosmetic. The first element is the fallback
// the resolver returns whenever the remembered choice cannot be honoured, so
// this order is what makes "no cookie" behave exactly as the app did before this
// piece, and what makes two calls in one request agree with each other.
export async function listInstructorClasses(
  userId: string,
): Promise<InstructorClass[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("classes")
    .select("id, name")
    .eq("instructor_id", userId)
    .order("created_at", { ascending: true });

  return (data ?? []) as InstructorClass[];
}

// ==> GATE 6, AND THIS IS THE MOST SECURITY-SENSITIVE FUNCTION IN THE PIECE.
//     WHICH CLASS IS THIS INSTRUCTOR WORKING IN? <==
//
// It replaces Gate 3a's getInstructorClassId(). That function DERIVED its answer
// from the signed-in user and nothing else, so the browser could not influence
// it. This one honours a REMEMBERED CHOICE, and whatever carries that choice, a
// cookie included, is editable by the person holding it.
//
// ==> SO THE STORED VALUE IS CHECKED AGAINST classes.instructor_id ON EVERY
//     CALL, NOT ONCE WHEN IT WAS SET. A selection is honoured only if it appears
//     in the list of classes this account owns as read from the database on THIS
//     request. Anything else (absent, unparseable, deleted, reassigned away, or
//     simply somebody else's) falls back to the oldest owned class. Without that
//     check, one hand-edited cookie would point every scoped read and every
//     write on the instructor surface at another instructor's class, and undo
//     five gate pieces in one line. <==
//
// IT FAILS CLOSED IN THE ONLY DIRECTION AVAILABLE TO IT: the fallback is a class
// the caller definitely owns, never "no filter" and never the class that was
// asked for. The refusal is logged in the same shape refuseOutsideClass() uses,
// so a hand-edited cookie leaves a trail.
//
// It still returns null when the instructor owns NO class, exactly as before
// (possible only if one was deleted or handed away). Callers decide what to do;
// the browser forms refuse to write rather than save a row with no class.
//
// WHY IT IS EXPORTED SEPARATELY from requireInstructor below. requireInstructor
// calls redirect(), which is a page mechanism: called from an API route it
// throws instead of returning a JSON error. So the routes reach this through
// requireInstructorRequest() in lib/class-scope.ts instead. One lookup, two
// callers, unchanged from Gate 3a.
export async function resolveWorkingClassId(
  userId: string,
  // Callers that have ALREADY read the list (requireInstructor below does, to
  // draw the picker) pass it in so this is not a second query. Everything else
  // omits it and gets one read, the same as before this piece.
  known?: InstructorClass[],
): Promise<string | null> {
  const classes = known ?? (await listInstructorClasses(userId));
  if (classes.length === 0) return null;

  const oldest = classes[0].id;

  const store = await cookies();
  const stored = store.get(WORKING_CLASS_COOKIE)?.value;
  if (!stored) return oldest;

  // THE CHECK. Membership of this list is the whole authorisation: the list came
  // from classes filtered by instructor_id, so anything in it is provably owned
  // by the signed-in account.
  if (classes.some((c) => c.id === stored)) return stored;

  console.warn(
    `Gate 6 refused a stored class selection: ${stored} is not owned by ${userId}. Falling back to ${oldest}.`,
  );
  return oldest;
}

// Returns the signed-in instructor, their profile, the class they are WORKING
// IN, and every class they own. Anyone not signed in goes to the login page;
// anyone who is not an instructor goes to the student page. Neither case ever
// returns, so callers can use the result directly.
//
// GATE 3a added classId. It is the class that every row this instructor creates
// belongs to. NOTHING HERE FILTERS ANYTHING: this function still answers "who is
// this and are they an instructor".
//
// GATE 3b is what uses it to filter. Pages take the classId from here and scope
// their own reads with it; API routes cannot call this function at all (it calls
// redirect(), a page mechanism) and use requireInstructorRequest() in
// lib/class-scope.ts instead, which wraps the same resolver.
//
// GATE 6 ADDED classes, AND IT COSTS NOTHING: resolving the working class has to
// read the whole list anyway in order to validate the remembered choice against
// it, so handing that list back is free. THREE THINGS USE IT. The layout draws
// the picker from it. The four detail pages compare a row's class against it to
// tell "this is in your other class" from "this is not yours", which is what
// makes that answer provably leak-free: it is computed only from classes the
// caller owns. And the dashboard uses it for the same answer on ?assignment=.
export async function requireInstructor(): Promise<{
  user: { id: string; email?: string };
  profile: InstructorProfile;
  classId: string | null;
  classes: InstructorClass[];
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

  // One read of the class list, used twice: to resolve the working class and to
  // hand the list back for the picker.
  const classes = await listInstructorClasses(user.id);
  const classId = await resolveWorkingClassId(user.id, classes);

  return { user, profile: profile as InstructorProfile, classId, classes };
}
