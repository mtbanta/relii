// The live conversation screen for one session. A Server Component: it confirms
// the visitor owns this session (via Row Level Security), then hands the
// transcript to the client Conversation component.
//
// Practice sessions render the live screen directly. A graded SUBMISSION is a
// single, one-shot attempt: the server only treats it as live while it is still
// inside its resume window (lenient on an accidental refresh, locked after); a
// front-line browser-marker gate then distinguishes a refresh from a deliberate
// "leave and come back". Either way it cannot be resumed once left.
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Conversation } from "@/components/conversation";
import { VoiceConversation } from "@/components/voice-conversation";
import { SubmissionLiveGate } from "@/components/submission-live-gate";
import { LockedSubmission } from "@/components/locked-submission";
import { isSubmissionLocked } from "@/lib/submission";
import { resolveMeetingMinutes } from "@/lib/meeting-length";
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
    .select("id, status, mode, kind, scenario_id, assignment_id, created_at, transcript")
    .eq("id", id)
    .single();

  if (!session) notFound();

  // If this session is already finished, send the student to its results.
  if (session.status !== "in_progress") {
    redirect(`/student/session/${id}/results`);
  }

  const { data: scenario } = await supabase
    .from("scenarios")
    .select("title, persona_name, rubric_id")
    .eq("id", session.scenario_id)
    .single();

  const isSubmission = session.kind === "submission";
  // No rubric means this case is never scored, so the end-of-session wording
  // must not promise a score.
  const conversationOnly = scenario?.rubric_id === null;

  // The assignment behind this session, when there is one. Two things come from
  // it: the title, used only on the locked screen for a submission, and the
  // meeting length (PD-4), which is how long a PRACTICE's count-up clock runs
  // before it auto-ends. One read covers both.
  //
  // A practice with no assignment link (pre-Stage-7 test data) and an assignment
  // with no duration set (every assignment created before PD-4) both fall back
  // to the standard 30 minutes, so the clock always has a working auto-end.
  let assignmentTitle: string | undefined;
  let assignmentDuration: number | null = null;
  if (session.assignment_id) {
    const { data: assignment } = await supabase
      .from("assignments")
      .select("title, duration_minutes")
      .eq("id", session.assignment_id)
      .single();
    assignmentTitle = assignment?.title ?? undefined;
    assignmentDuration = assignment?.duration_minutes ?? null;
  }
  const meetingMinutes = resolveMeetingMinutes(assignmentDuration);

  // A graded submission whose single-attempt window has elapsed is locked
  // server-side: no resume, no restart.
  if (isSubmission && isSubmissionLocked(session)) {
    return (
      <main className="mx-auto w-full max-w-page px-6 py-4">
        <LockedSubmission assignmentTitle={assignmentTitle} />
      </main>
    );
  }

  // The live screen for this mode. Voice sessions (stored as voice_video) get the
  // spoken call screen; text sessions get the typed screen. Both end on the same
  // results screen with the same content score.
  const liveScreen =
    session.mode === "voice_video" ? (
      <VoiceConversation
        sessionId={session.id}
        personaName={scenario?.persona_name ?? "the customer"}
        scenarioTitle={scenario?.title ?? "Practice session"}
        isSubmission={isSubmission}
        conversationOnly={conversationOnly}
        meetingMinutes={meetingMinutes}
      />
    ) : (
      <Conversation
        sessionId={session.id}
        personaName={scenario?.persona_name ?? "the customer"}
        scenarioTitle={scenario?.title ?? "Practice session"}
        initialTranscript={(session.transcript ?? []) as TranscriptTurn[]}
        isSubmission={isSubmission}
        conversationOnly={conversationOnly}
        meetingMinutes={meetingMinutes}
      />
    );

  return (
    <main className="mx-auto w-full max-w-page px-6 py-4">
      {isSubmission ? (
        <SubmissionLiveGate
          sessionId={session.id}
          assignmentTitle={assignmentTitle}
          lockOnReload={session.mode === "voice_video"}
        >
          {liveScreen}
        </SubmissionLiveGate>
      ) : (
        liveScreen
      )}
    </main>
  );
}
