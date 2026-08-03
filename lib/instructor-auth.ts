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

export type InstructorProfile = {
  role: string;
  first_name: string | null;
  last_name: string | null;
};

// Returns the signed-in instructor and their profile. Anyone not signed in goes
// to the login page; anyone who is not an instructor goes to the student page.
// Neither case ever returns, so callers can use the result directly.
export async function requireInstructor(): Promise<{
  user: { id: string; email?: string };
  profile: InstructorProfile;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .single();

  // Students who land on any instructor page get sent to their own page.
  if (profile?.role !== "instructor") {
    redirect("/student");
  }

  return { user, profile: profile as InstructorProfile };
}
