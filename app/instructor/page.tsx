// The instructor home page. Mostly empty for now, but it includes a working
// form to add emails to the invite list. It confirms the visitor is a
// logged-in instructor; otherwise it redirects.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignOutButton } from "@/components/sign-out-button";
import { AddEmailForm } from "@/components/add-email-form";
import { DeleteStudentButton } from "@/components/delete-student-button";

export default async function InstructorHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Students who land here get sent to their own page.
  if (profile?.role !== "instructor") {
    redirect("/student");
  }

  // The roster of registered students. We read it here on the server with the
  // service-role key, because the normal browser rules only let a user read
  // their own profile. The key never reaches the browser (this runs on the
  // server), so no database security rule needs to change.
  const admin = createAdminClient();
  const { data: students } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role", "student")
    .order("email", { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Instructor home</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <p className="mb-6 text-gray-600">
        Welcome to Relii. The full instructor dashboard arrives in a later
        stage. For now, you can invite students and other instructors below.
      </p>

      <AddEmailForm />

      <section className="mt-8">
        <h2 className="mb-1 font-medium">Students</h2>
        <p className="mb-3 text-sm text-gray-500">
          Deleting a student permanently removes their account, sessions, and
          recorded videos, and frees their email from the invite list.
        </p>

        {students && students.length > 0 ? (
          <ul className="space-y-2">
            {students.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-gray-200 p-3"
              >
                <DeleteStudentButton studentId={s.id} email={s.email} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">
            No students have signed up yet.
          </p>
        )}
      </section>
    </main>
  );
}
