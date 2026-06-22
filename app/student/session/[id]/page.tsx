// The live conversation screen for one session. A Server Component: it confirms
// the visitor owns this session (via Row Level Security), then hands the
// transcript to the client Conversation component.
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Conversation } from "@/components/conversation";
import type { TranscriptTurn } from "@/lib/types";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS ensures a student can only read their own sessions.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, status, mode, scenario_id, transcript")
    .eq("id", id)
    .single();

  if (!session) notFound();

  // If this session is already finished, send the student to its results.
  if (session.status !== "in_progress") {
    redirect(`/student/session/${id}/results`);
  }

  const { data: scenario } = await supabase
    .from("scenarios")
    .select("title, persona_name")
    .eq("id", session.scenario_id)
    .single();

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Conversation
        sessionId={session.id}
        personaName={scenario?.persona_name ?? "the customer"}
        scenarioTitle={scenario?.title ?? "Practice session"}
        initialTranscript={(session.transcript ?? []) as TranscriptTurn[]}
      />
    </main>
  );
}
