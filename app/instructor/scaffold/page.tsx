// Persona scaffolding: the instructor fills in a case and the AI writes two
// candidate personas in the Alex and Jordan style, shown here for review.
//
// This page is gated the same way the instructor dashboard is: signed in, with
// the role read from the database. The generate route checks the caller's role
// again for itself, because a route can be reached without ever loading this
// page.
//
// Generating writes both candidates into the database as DISABLED,
// conversation-only scenarios. Picking a winner, enabling it, and deleting the
// loser is chunk 2d.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScaffoldForm } from "@/components/scaffold-form";

export default async function ScaffoldPage() {
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
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <Link href="/instructor" className="text-sm text-gray-500 underline">
          Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Persona scaffolding</h1>
        <p className="mt-1 text-sm text-gray-600">
          Describe a sales case and the AI writes two candidate buyer personas
          in the same style as Alex and Jordan. Both are saved turned OFF, so no
          student can be given one, and you compare them side by side before
          anything goes live.
        </p>
      </div>

      <ScaffoldForm />
    </main>
  );
}
