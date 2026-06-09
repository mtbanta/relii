// The instructor home page. Mostly empty for now, but it includes a working
// form to add emails to the invite list. It confirms the visitor is a
// logged-in instructor; otherwise it redirects.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { AddEmailForm } from "@/components/add-email-form";

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
    </main>
  );
}
