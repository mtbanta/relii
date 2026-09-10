// The live conversation screen for one session. A Server Component: it confirms
// the visitor owns this session (via Row Level Security), then hands the
// transcript to the client Conversation component.
//
// Practice sessions render the live screen directly. A graded SUBMISSION is a
// single, one-shot attempt: the server only treats it as live while it is still
// inside its resume window (lenient on an accidental refresh, locked after); a
// front-line browser-marker gate then distinguishes a refresh from a deliberate
// "leave and come back". Either way it cannot be resumed once left.
//
// ==> PHASE 3a: THIS PAGE NO LONGER REDIRECTS EVERY FINISHED SESSION AWAY. One
//     case stops here instead: a session whose results page would only send it
//     straight back, which is a graded case with no score, which is a scoring
//     failure. It renders a recovery screen. See the block below the rubric
//     lookup, which is where the check had to move to before it could tell a
//     graded case from a conversation-only one at all. <==
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Conversation } from "@/components/conversation";
import { VoiceConversation } from "@/components/voice-conversation";
import { SubmissionLiveGate } from "@/components/submission-live-gate";
import { LockedSubmission } from "@/components/locked-submission";
import { ScoringNotFinished } from "@/components/scoring-not-finished";
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
    // PHASE 3a: score joins this read. The redirect decision below is written as
    // the exact complement of the results page rule, and that rule reads score.
    .select(
      "id, status, mode, kind, scenario_id, assignment_id, created_at, transcript, score",
    )
    .eq("id", id)
    .single();

  if (!session) notFound();

  const { data: scenario } = await supabase
    .from("scenarios")
    .select("title, persona_name")
    .eq("id", session.scenario_id)
    .single();

  const isSubmission = session.kind === "submission";

  // The assignment behind this session, when there is one. THREE things come
  // from it: the title, used only on the locked screen for a submission; the
  // meeting length (PD-4), which is how long a PRACTICE's count-up clock runs
  // before it auto-ends; and, since Phase 2b-1, whether this case is scored at
  // all. One read covers all three.
  //
  // A practice with no assignment link (pre-Stage-7 test data) and an assignment
  // with no duration set (every assignment created before PD-4) both fall back
  // to the standard 30 minutes, so the clock always has a working auto-end.
  let assignmentTitle: string | undefined;
  let assignmentDuration: number | null = null;
  let assignmentRubricId: string | null = null;
  if (session.assignment_id) {
    const { data: assignment } = await supabase
      .from("assignments")
      .select("title, duration_minutes, rubric_id")
      .eq("id", session.assignment_id)
      .single();
    assignmentTitle = assignment?.title ?? undefined;
    assignmentDuration = assignment?.duration_minutes ?? null;
    assignmentRubricId = assignment?.rubric_id ?? null;
  }
  const meetingMinutes = resolveMeetingMinutes(assignmentDuration);

  // PHASE 2b-1: no rubric means this case is never scored, so the end-of-session
  // wording must not promise a score. The rubric is THE ASSIGNMENT'S now, not
  // the scenario's, which is why this line moved below the assignment read.
  //
  // ==> A SESSION WITH NO ASSIGNMENT IS CONVERSATION-ONLY, and that falls out of
  //     the initialiser above rather than needing its own branch: no assignment
  //     leaves assignmentRubricId null, which is exactly "nothing to grade".
  //     Twenty-five such rows exist (pre-Stage-7 practices). See PROJECT_STATE. <==
  const conversationOnly = assignmentRubricId === null;

  // ==> PHASE 3a, FIX 1. THIS CHECK USED TO BE THE FIRST THING THE PAGE DID, ON
  //     LINE 43, AND THAT POSITION WAS THE BUG. It sent every session that was
  //     not in_progress to its results. The results page sends a graded session
  //     that is not scored BACK here. A graded practice sitting at 'completed'
  //     with no score is exactly a scoring failure, so the two rules pointed at
  //     each other and the browser gave up with ERR_TOO_MANY_REDIRECTS.
  //
  //     IT COULD NOT HAVE BEEN FIXED IN PLACE. Whether this case is graded is
  //     the ASSIGNMENT's answer, and the assignment is not read until below, so
  //     up there the page did not yet know what it was redirecting. Moving the
  //     check under the rubric lookup is most of the repair.
  //
  //     BOTH FILES CARRIED COMMENTS ASSERTING THE LOOP COULD NOT HAPPEN, which
  //     is how it survived to be found by accident. So this is written as the
  //     LITERAL COMPLEMENT of the other page's rule rather than as a condition
  //     that ought to line up with it: the line below is the results page's
  //     line 105 with its own conversationOnly branch folded in. If that rule is
  //     ever edited, this one has to be edited to match, and the two are now
  //     close enough in shape that the mismatch is visible. <==
  const resultsWouldSendThemBack =
    !conversationOnly && (session.status !== "scored" || !session.score);

  if (session.status !== "in_progress") {
    // Finished, and the results page will keep it: go there. That is a scored
    // graded case, and a conversation-only case at 'completed'.
    if (!resultsWouldSendThemBack) {
      redirect(`/student/session/${id}/results`);
    }

    // ==> OTHERWISE THE RESULTS PAGE WOULD BOUNCE IT STRAIGHT BACK, SO THIS PAGE
    //     STOPS AND SAYS SO. EVERY ROW REACHING HERE RENDERS, AND NONE
    //     REDIRECTS, WHICH IS WHAT MAKES THE LOOP IMPOSSIBLE RATHER THAN
    //     UNLIKELY. It would have been cheaper to let a submission fall through
    //     to the old redirect and note in a comment that a submission can never
    //     be in this state. That is the precise move that kept the original loop
    //     alive, so it is not made here: a submission gets a screen too, with no
    //     retry button, because re-running the scorer on a one-shot graded
    //     attempt is the instructor's call and not the student's.
    //
    //     (For the record, and as a reason rather than a guarantee: no route can
    //     currently produce a submission in this state. A submission is only
    //     ever converted from an already-scored practice by
    //     app/api/practice/submit/route.ts, and the live one-shot path that used
    //     to create one directly is disabled at app/student/page.tsx. That is
    //     why the case is unreachable TODAY. It is not why it is handled.) <==
    return (
      <main className="mx-auto w-full max-w-page px-6 py-4">
        <ScoringNotFinished
          sessionId={session.id}
          canRetry={session.kind === "practice"}
        />
      </main>
    );
  }

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
