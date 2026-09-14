// The results screen: the itemized content score with a short evidence comment
// per item, the full transcript beside it, and a link back home. Server
// Component; reads the student's own session via Row Level Security.
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
import { ResultsActions } from "@/components/results-actions";
import { displayName, hasName } from "@/lib/name";
import { dateTaken, formatDateTaken } from "@/lib/date-taken";
import {
  RECORDING_LENGTH_LABEL,
  recordingLengthText,
} from "@/lib/recording-length";
import { formatPoints } from "@/lib/types";
import type {
  RubricCriterion,
  SessionScore,
  TranscriptTurn,
} from "@/lib/types";
import { formatElapsed } from "@/lib/app-time";
import { cardClasses } from "@/components/ui/card";
import { Icon, IconArrowLeft } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { RubricScore } from "@/components/rubric-score";

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ videoError?: string }>;
}) {
  const { id } = await params;
  const { videoError } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The student's own name, for the results header and the printed sheet. RLS
  // only lets a student read this session if it is theirs, so this is the
  // session owner's name. Falls back to email if no name is set.
  const { data: nameProfile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();
  const student = { ...(nameProfile ?? {}), email: user.email ?? "" };

  const { data: session } = await supabase
    .from("sessions")
    .select(
      // PHASE 2b-1: assignment_id joins this read because the rubric is now
      // reached through the assignment rather than through the scenario.
      // PHASE 4b: reviewed_at joins this read. It is the only field the
      // student's Pending Review / Reviewed state is built from, it lives on
      // sessions (which a student may read their own row of), and it is null
      // on every practice because only a submission can be reviewed.
      "id, kind, status, mode, scenario_id, assignment_id, transcript, score, score_total, video_path, recorded_seconds, submitted_at, created_at, reviewed_at",
    )
    .eq("id", id)
    .single();

  if (!session) notFound();

  // The scenario is read for its title and persona name only. PHASE 2b-1 took
  // the rubric off it: whether this session was scored is now the ASSIGNMENT's
  // answer, resolved just below.
  const { data: scenario } = await supabase
    .from("scenarios")
    .select("title, persona_name")
    .eq("id", session.scenario_id)
    .single();

  // The assignment is loaded BEFORE deciding whether to show this page, because
  // whether it has a rubric is what decides which kind of results page this is.
  //
  // ==> A SESSION WITH NO ASSIGNMENT IS CONVERSATION-ONLY. The initialiser is
  //     the whole implementation of that rule: no assignment leaves this null,
  //     which reads as "nothing to grade". Twenty-five such rows exist
  //     (pre-Stage-7 practices), and they are recorded in PROJECT_STATE so a
  //     later session does not read them as corruption. <==
  let assignmentRubricId: string | null = null;
  if (session.assignment_id) {
    const { data: assignment } = await supabase
      .from("assignments")
      .select("rubric_id")
      .eq("id", session.assignment_id)
      .single();
    assignmentRubricId = assignment?.rubric_id ?? null;
  }

  // An assignment with NO rubric is conversation-only: it is never scored, so its
  // finished state is 'completed' and there is no score to show. Note this keys
  // on there being no rubric, NOT on the status being 'completed'. A scored case
  // also passes through 'completed', and stays there if its scoring failed; that
  // student must still be sent back to end the session again rather than shown a
  // permanent "no score" page.
  const conversationOnly = assignmentRubricId === null;

  if (conversationOnly) {
    // Still talking? Back to the live conversation. Otherwise show the results.
    if (session.status === "in_progress") {
      redirect(`/student/session/${id}`);
    }
  } else if (session.status !== "scored" || !session.score) {
    // Not scored yet? Send them back to the live conversation.
    redirect(`/student/session/${id}`);
  }

  const score = session.score as SessionScore | null;
  const transcript = (session.transcript ?? []) as TranscriptTurn[];
  // Elapsed timestamps run from the FIRST turn, so the first one reads 00:00.
  // Hoisted out of the map below rather than read as transcript[0] inside it,
  // which keeps the empty case obvious and does the read once.
  const transcriptStart = transcript.length > 0 ? transcript[0].at : null;
  const isVoice = session.mode === "voice_video";

  // If this session has a recording, mint a short-lived signed link to it. We can
  // safely use the admin client here because we have already confirmed (via the
  // RLS read above) that this user is allowed to see this session. The link
  // expires after an hour; reload the page to get a fresh one.
  let videoUrl: string | null = null;
  if (session.video_path) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from(SESSION_VIDEOS_BUCKET)
      .createSignedUrl(session.video_path, 60 * 60);
    videoUrl = signed?.signedUrl ?? null;
  }

  // Load the rubric so each scored line can carry its criterion's name and the
  // description of what that criterion asks for. A conversation-only session has
  // no rubric and no itemized score to label, so this is skipped entirely.
  const { data: rubric } = conversationOnly
    ? { data: null }
    : await supabase
        .from("rubrics")
        .select("items")
        .eq("id", assignmentRubricId)
        .single();

  // ==> PHASE 2b-2 CORRECTED THIS CAST, AND WHAT IT USED TO SAY IS WORTH ONE
  //     LINE: it claimed the flat RubricItem[] shape, which since 2b-1 nothing
  //     reachable from here has. It was labelled as knowingly wrong rather than
  //     left to read as fine, because half-rewriting the renderer in 2b-1 would
  //     have left this screen in a state neither piece owned.
  //
  //     items is jsonb, so TypeScript cannot check either version of this line.
  //     What makes the new one true is structural rather than hopeful: 2b-1's
  //     migration put the legacy flat shape out of reach (no assignment points
  //     at it), and the scorer REFUSES a rubric whose criteria carry no levels,
  //     so a rubric that reaches this page and was scored is a levels rubric. <==
  const criteria = (rubric?.items ?? []) as RubricCriterion[];

  // PD-5: a submission shows the moment it was handed in (the same stamp the
  // instructor view shows), a practice the moment it was started.
  const takenOn = dateTaken(session);

  // ==> PHASE 4b. WHEN AN INSTRUCTOR REVIEWED THIS, FORMATTED, OR NULL. ONE
  //     VALUE DECIDES BOTH THE STATUS SENTENCE AND THE FOOTNOTE, so the two
  //     cannot end up describing different states of one page.
  //
  //     IT ALSO ANSWERS "IS THIS A PRACTICE" FOR FREE AND THAT IS NOT A TRICK.
  //     Only a submission can be reviewed: the review route reads
  //     kind = 'submission' through lib/instructor-submission.ts and a retake
  //     clears reviewed_at on its way back to being a practice. So this is null
  //     on every practice, and a practice keeps today's footnote word for word
  //     without any test of kind. The status SENTENCE is gated on kind anyway,
  //     below, because "Pending Review" on a practice would be a promise
  //     nothing in the app can keep.
  //
  //     formatDateTaken IS USED UNCHANGED, ON THE OWNER'S RULING OF
  //     2026-09-11. The live site renders UTC (measured: a 23:47:11 UTC stamp
  //     renders "11:47 PM"), so this date can read a day late for a review
  //     saved late in the US evening. A timezone on this one new string would
  //     make it disagree with the Date Taken directly above it. THE WHOLE APP
  //     MOVES TO US CENTRAL IN THE SESSION IMMEDIATELY AFTER 4b. <==
  const reviewedOn = formatDateTaken(session.reviewed_at);

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      {/* A small accent link, not a bordered button: leaving is not one of this
          page's actions, it is just the way back. */}
      <Link
        href="/student"
        className="mb-3 inline-flex items-center gap-1 text-meta text-content-info hover:underline print:hidden"
      >
        <Icon icon={IconArrowLeft} />
        Back to home
      </Link>

      {/* THE SCORE IS THE SUBJECT OF THIS PAGE. It used to sit in a gray box
          below the header, which made the page lead with who and when rather
          than with how they did. Now it is the header's right-hand side, with
          everything identifying the attempt on the left. */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-line-tertiary pb-4">
        <div className="min-w-0">
          <h1 className="text-page-title font-medium">Your results</h1>
          <p className="mt-0.5 text-body text-content-secondary">
            {scenario?.title ?? "Practice session"}
          </p>
          {/* The mode pill beside the date, and PD-5's Recording Length and Date
              Taken folded into this one line rather than stacked as three. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-content-secondary">
            <Badge tone={isVoice ? "info" : "neutral"}>
              {isVoice ? "Voice + video" : "Text"}
            </Badge>
            {takenOn && <span>{takenOn}</span>}
            <span aria-hidden="true" className="text-content-tertiary">
              &middot;
            </span>
            <span>
              {RECORDING_LENGTH_LABEL}{" "}
              <span className="tabular-nums">
                {recordingLengthText(session.recorded_seconds)}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-micro text-content-tertiary">
            {displayName(student)}
            {hasName(student) ? ` · ${user.email}` : ""}
          </p>
        </div>

        {score && !conversationOnly && (
          <div className="shrink-0 text-right">
            <p className="text-stat font-medium tabular-nums text-content-primary">
              {formatPoints(score.total)}
              <span className="text-card-title font-normal text-content-tertiary">
                {" "}
                / {formatPoints(score.max_total)}
              </span>
            </p>
            {/* ==> THE PERCENTAGE KEEPS A HALF TOO, AND IT USED TO NOT. This
                    line rounded to a whole number, so a 59.5 out of 100 sat
                    directly beneath the words "59.5 / 100" reading "60%": two
                    numbers on one screen disagreeing about one grade, which is
                    the failure this project keeps paying for. It now rounds to
                    at most ONE decimal, because unlike the points themselves a
                    percentage genuinely can run on (59.5 out of 180 is 33.05...),
                    so something has to stop it. A half can no longer be rounded
                    away, and formatPoints drops a trailing .0 so an ordinary
                    score still reads "65%". <== */}
            {score.max_total > 0 && (
              <p className="text-meta font-medium text-content-success">
                {formatPoints(
                  Math.round((score.total / score.max_total) * 1000) / 10,
                )}
                %
              </p>
            )}
          </div>
        )}
      </header>

      {/* ==> PHASE 4b. THE REVIEW STATE, AND IT IS THE FIRST THING UNDER THE
              SCORE ON PURPOSE. A submission is always an already-scored
              practice the student chose to hand in, so they have already seen
              this number: the question this line answers is whether the number
              is final. Amber before, green after, the same two colours and the
              same idea as the instructor's dashboard, so a student and their
              instructor are never looking at two different accounts of one
              submission.

              IT IS NOT print:hidden. Both sentences belong on the saved PDF:
              a printed sheet that does not say a grade was provisional is a
              document that will be waved at somebody later.

              GATED ON kind = 'submission' AS WELL AS ON THERE BEING A SCORE.
              A practice is never reviewed, so neither sentence is true of one,
              and a score with no rubric behind it is not waiting on anybody. */}
      {session.kind === "submission" && score && !conversationOnly && (
        <p
          className={`mb-4 text-body font-medium ${
            reviewedOn ? "text-content-success" : "text-content-warning"
          }`}
        >
          {reviewedOn
            ? `Reviewed by your instructor on ${reviewedOn}.`
            : "Pending Review. Your instructor may adjust this score."}
        </p>
      )}

      {conversationOnly || !score ? (
        // A conversation-only case has no rubric behind it, so there is nothing
        // to score. Say so plainly, so an unscored result never looks like a
        // score that failed to load.
        <div className={cardClasses({ tone: "muted", className: "mb-5" })}>
          <p className="text-body font-medium">
            Conversation-only practice, no score
          </p>
          <p className="mt-1 text-body text-content-secondary">
            This case is for practising the conversation itself, so it is not
            graded and no score is given. Your full transcript
            {isVoice ? " and recording are" : " is"} saved below.
          </p>
        </div>
      ) : null}

      {/* Save-a-copy controls: download the recording and print/save the score
          and transcript. Read-only; hidden when printing. We pass the same
          signed link the player uses, so no extra access is granted. */}
      <ResultsActions
        downloadUrl={videoUrl}
        isVoice={isVoice}
        filePrefix={session.kind === "submission" ? "relii-submission" : "relii-practice"}
        conversationOnly={conversationOnly}
      />

      {/* PD-8f: THE RECORDING AND THE TRANSCRIPT SIT SIDE BY SIDE, with the
          rubric full width beneath them. The instructor's view of this same
          submission now uses the identical arrangement, which is the point: two
          screens showing the same material two different ways was the exact
          inconsistency this sprint exists to remove.

          HOW THE HEIGHTS MATCH: both columns are the same width, the player is
          pinned to 16:9, and the transcript's scroll box takes the SAME ratio,
          so the two bodies compute to the same height with no measuring.

          THE PRINT TRAP, and it is the thing that would have shipped broken.
          Print-to-PDF is a shipped feature here. A fixed-height, internally
          scrolling transcript prints CLIPPED: a student would get only the first
          screenful of their own conversation. So in print the ratio and the
          scroll are both switched off (print:aspect-auto, print:overflow-visible,
          print:max-h-none) and the grid collapses to one column. Same family as
          the collapsed-rubric trap from PD-8d, and verified the same way, by
          forcing print rather than by reasoning about it. */}
      <div className={`mb-6 grid gap-6 print:grid-cols-1 ${isVoice ? "md:grid-cols-2" : ""}`}>
        {/* The student's own recording (voice sessions only). Hidden when
            printing so the saved PDF is a clean score-and-transcript sheet. */}
        {isVoice && (
          <section className="min-w-0 print:hidden">
            {/* PD-8g, AND THE DEFECT IS IN THE FILE RATHER THAN THE PLAYER, so
                read this before "fixing" the scrubber. The recording is a
                browser-made WebM (components/voice-conversation.tsx), and a
                browser-made WebM carries NO DURATION IN ITS HEADER, because
                MediaRecorder is writing a live stream and cannot know the length
                in advance. So the player's own scrubber reads 0:00 until it has
                seeked all the way to the end. Nothing is wrong with the file or
                the upload; the number simply is not in it.
                The authoritative length is sessions.recorded_seconds, captured
                in PD-5, and it now sits beside the player as well as in the
                header block above. preload="metadata" is on the element so the
                browser fetches what header there is without downloading the
                whole recording.
                DELIBERATELY NOT DONE: remuxing or re-encoding, or any change to
                the recording upload path. */}
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-section font-medium text-content-secondary">Your recording</h2>
              {videoUrl && (
                <span className="text-meta text-content-secondary">
                  {RECORDING_LENGTH_LABEL}{" "}
                  <span className="tabular-nums">
                    {recordingLengthText(session.recorded_seconds)}
                  </span>
                </span>
              )}
            </div>
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full rounded-lg border border-line-tertiary bg-black object-contain"
              />
            ) : videoError === "1" ? (
              <p className="rounded-md border border-amber-300 bg-surface-warning p-3 text-body text-content-warning">
                Your recording could not be saved this time, but your{" "}
                {conversationOnly ? "transcript" : "score"} below was saved. You
                can run another practice if you want a recording.
              </p>
            ) : (
              <p className="text-body text-content-secondary">
                No recording was saved for this session (the camera was off).
              </p>
            )}
          </section>
        )}

        {/* Transcript */}
        <section className="min-w-0">
          <h2 className="mb-2 text-section font-medium text-content-secondary">Transcript</h2>
          <div
            className={cardClasses({
              className: `space-y-3 print:aspect-auto print:max-h-none print:overflow-visible ${
                isVoice ? "md:aspect-video md:overflow-y-auto" : ""
              }`,
            })}
          >
            {transcript.map((turn, i) => {
              // HOW FAR INTO THE CALL THIS TURN CAME. A duration, not a clock
              // time; see formatElapsed in lib/app-time.ts. It sits inline in
              // the speaker line on purpose: nothing is positioned, so the
              // print stylesheet above needs no rule of its own and the stamp
              // cannot be clipped away.
              const elapsed = formatElapsed(transcriptStart, turn.at);
              return (
                <div key={i}>
                  <p className="text-meta font-medium text-content-tertiary">
                    {turn.role === "student"
                      ? "You"
                      : (scenario?.persona_name ?? "Customer")}
                    {elapsed && (
                      <span className="ml-2 font-normal tabular-nums">
                        {elapsed}
                      </span>
                    )}
                  </p>
                  <p className="max-w-reading text-body whitespace-pre-wrap text-content-primary">
                    {turn.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* The itemized rubric (graded cases only), now FULL WIDTH beneath the
          pair above, which is where PD-8d's collapsible categories read best.
          PD-7 renamed this heading from "Itemized score" to "Rubric score", so
          the student and the instructor call the same list by the same name. */}
      {/* ==> GATED ON conversationOnly AS WELL AS ON THERE BEING A SCORE, AND
              THE SECOND HALF WAS MISSING. The 32 scores stored before 2b-1 sit
              on sessions whose assignment now names no rubric, so this page
              shows them the "no score" card above and then rendered this
              heading underneath it with nothing at all beneath, because the
              rubric read was skipped and the component correctly draws nothing
              from an empty one. One condition on the card and a different one
              on the section is how a screen ends up contradicting itself. <== */}
      {score && !conversationOnly && (
        <section>
          <h2 className="mb-2 text-section font-medium text-content-secondary">Rubric score</h2>
          <RubricScore
            items={score.items}
            criteria={criteria}
            audience="student"
          />
          {/* Kept from the old score box, restyled: it explains why the total is
              out of what it is, which is the first thing a student wonders.

              ==> PHASE 2b-2 REPLACED WHAT THIS SAID, AND BOTH HALVES OF IT HAD
                  BECOME FALSE. It read "Scored by AI on the discovery content
                  items. Delivery items (tone, pace, and other spoken-only
                  points) are added in a later stage." Since 2b-1 EVERY criterion
                  is scored, communication and overall impression included, and
                  there are no delivery items to add later: a weighted rubric has
                  no such concept. It also has to explain the LEVEL, which is the
                  one thing a student seeing this screen for the first time will
                  not otherwise understand. It deliberately does NOT mention an
                  instructor adjusting the grade: that is Phase 4 and it is not
                  true yet. <==

              ==> PHASE 4b MADE THAT LAST SENTENCE FALSE, AND THE OWNER RULED ON
                  EXACTLY TWO VARIANTS RATHER THAN THREE (2026-09-11).

                  A PRACTICE AND A PENDING SUBMISSION KEEP TODAY'S WORDING, WORD
                  FOR WORD. The "your instructor may adjust this score" promise
                  is made ONCE, by the amber status line near the top of this
                  page, and is deliberately not repeated here: said twice on one
                  screen it starts to read as two different claims. On a practice
                  it would simply be untrue, since nobody reviews a practice.

                  ONLY A REVIEWED SUBMISSION'S FOOTNOTE CHANGES, AND THE CHANGE
                  IS NOT COSMETIC. "Every criterion is graded from the
                  transcript" stops being true the moment an instructor sets a
                  level: they may have judged from the recording, or from their
                  own assessment of the student, and the app has no idea which.
                  So the reviewed wording attributes that claim to the party it
                  IS true of ("The AI graded every criterion from the
                  transcript") and then points at the per-criterion flag.

                  reviewedOn IS THE SWITCH, and it is the same value the status
                  sentence above uses, so the two halves of this page cannot
                  describe different states. It is null on every practice. <== */}
          {reviewedOn ? (
            <p className="mt-2 max-w-reading text-micro text-content-tertiary">
              Scored by AI against this assignment&apos;s rubric, then reviewed
              by your instructor. The AI graded every criterion from the
              transcript, and its points come from the level chosen. Where your
              instructor set a different level, that criterion says so.
            </p>
          ) : (
            <p className="mt-2 max-w-reading text-micro text-content-tertiary">
              Scored by AI against this assignment&apos;s rubric. Every criterion
              is graded from the transcript, and its points come from the level
              chosen.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
