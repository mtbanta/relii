// The student home page. Empty for now (real features arrive in later stages).
// It confirms the visitor is a logged-in student; otherwise it redirects.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { PracticeButton } from "@/components/practice-button";

export default async function StudentHome() {
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

  // Instructors who land here get sent to their own page.
  if (profile?.role !== "student") {
    redirect("/instructor");
  }

  // The role-play cases this student can practice. Any logged-in user may read
  // scenarios (enforced by Row Level Security), so the ordinary client is fine.
  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("id, title, persona_name, scenario_context")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Student home</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <h2 className="mb-3 text-lg font-medium">Practice scenarios</h2>

      {!scenarios || scenarios.length === 0 ? (
        <p className="text-gray-600">
          No scenarios yet. They will appear here once your instructor adds one.
        </p>
      ) : (
        <ul className="space-y-4">
          {scenarios.map((scenario) => (
            <li
              key={scenario.id}
              className="rounded-lg border border-gray-200 p-5"
            >
              <h3 className="font-semibold">{scenario.title}</h3>
              <p className="mt-0.5 text-sm text-gray-500">
                You will speak with {scenario.persona_name}.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                {scenario.scenario_context}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <PracticeButton scenarioId={scenario.id} mode="voice" />
                <PracticeButton scenarioId={scenario.id} mode="text" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
