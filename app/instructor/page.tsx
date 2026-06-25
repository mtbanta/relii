// The instructor home page. Mostly empty for now, but it includes a working
// form to add emails to the invite list. It confirms the visitor is a
// logged-in instructor; otherwise it redirects.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignOutButton } from "@/components/sign-out-button";
import { AddEmailForm } from "@/components/add-email-form";
import { DeleteStudentButton } from "@/components/delete-student-button";
import { CreateAssignmentForm } from "@/components/create-assignment-form";

// Turn the stored mode value into a friendly label.
function modeLabel(mode: string): string {
  return mode === "voice_video" ? "Voice + video" : "Text";
}

// Show a stored timestamp as a plain date. We read it in UTC so a date picked as
// "Aug 14" always shows as "Aug 14" (it is stored as midnight UTC).
function formatDueDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// One assignment row as read from the database, with its scenario embedded.
type AssignmentRow = {
  id: string;
  title: string;
  required_mode: string;
  due_at: string | null;
  instructions: string | null;
  scenarios: { title: string; persona_name: string } | null;
};

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

  // The scenarios this instructor can assign (the dropdown in the form). Any
  // logged-in user may read scenarios, so the ordinary client is fine.
  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("id, title, persona_name")
    .order("created_at", { ascending: true });

  // The assignments this instructor has created, newest first, with each one's
  // scenario embedded so we can show the persona and title.
  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, required_mode, due_at, instructions, scenarios ( title, persona_name )")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .returns<AssignmentRow[]>();

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
        <h2 className="mb-1 font-medium">Assignments</h2>
        <p className="mb-3 text-sm text-gray-500">
          Create an assignment for a scenario and pick the mode the graded
          submission must use. Each student can submit an assignment once.
        </p>

        <CreateAssignmentForm
          scenarios={scenarios ?? []}
          createdBy={user.id}
        />

        <div className="mt-4">
          {assignments && assignments.length > 0 ? (
            <ul className="space-y-2">
              {assignments.map((a) => {
                const due = formatDueDate(a.due_at);
                return (
                  <li
                    key={a.id}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {a.scenarios?.title ?? "Scenario"}
                      {a.scenarios?.persona_name
                        ? ` (with ${a.scenarios.persona_name})`
                        : ""}{" "}
                      &middot; {modeLabel(a.required_mode)}
                      {due ? ` · due ${due}` : ""}
                    </p>
                    {a.instructions && (
                      <p className="mt-1.5 text-sm text-gray-600">
                        {a.instructions}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              You have not created any assignments yet.
            </p>
          )}
        </div>
      </section>

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
