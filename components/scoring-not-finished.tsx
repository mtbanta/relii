"use client";

// PHASE 3a, FIX 1. THE SCREEN A STUDENT SEES WHEN SCORING DID NOT FINISH.
//
// ==> THE BUG THIS EXISTS TO END, WRITTEN OUT BECAUSE IT SURVIVED TWO COMMENTS
//     THAT SAID IT COULD NOT HAPPEN. app/student/session/[id]/page.tsx used to
//     send ANY session that was not in_progress to its results, and the results
//     page sends a graded session that is not scored back to the session page.
//     A graded practice sitting at 'completed' with no score IS a scoring
//     failure, so those two rules pointed at each other and the browser gave up
//     with ERR_TOO_MANY_REDIRECTS. The retry the student was offered worked only
//     while they stayed on the tab; one reload and the session was unreachable
//     for good. Phase 2c made this state MORE reachable on purpose, by turning
//     an unmatched level into a refusal rather than a silently wrong grade. This
//     screen is the other half of that trade. <==
//
// It renders in place of the live conversation, on the session URL the student
// already has. There is no entry for it on the student home and there should not
// be: the home lists FINISHED practices, and this session is not one.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { Icon, IconArrowLeft } from "@/components/ui/icon";

export function ScoringNotFinished({
  sessionId,
  // ==> A PRACTICE CAN RETRY. A SUBMISSION CANNOT, AND THAT IS THE OWNER'S
  //     RULING RATHER THAN A LIMITATION. A graded submission is one attempt;
  //     re-running the scorer on it unasked is not a recovery a student should
  //     be able to perform on their own grade. It gets the same heading and a
  //     different second sentence, and its remedy is the instructor.
  //
  //     BOTH CASES LIVE IN ONE COMPONENT ON PURPOSE. The submission half needs
  //     no interactivity at all and could have been static markup on the server
  //     page. It is here instead so the heading exists ONCE: two screens wording
  //     the same failure differently is a thing this project has already paid
  //     for, in this exact area (see the note on the scoring error string in
  //     app/api/session/end/route.ts). <==
  canRetry,
}: {
  sessionId: string;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  // THE RETRY REUSES /api/session/end RATHER THAN GROWING A SECOND SCORING PATH.
  // That route already refuses only a 'scored' session, so calling it again on a
  // 'completed' one re-runs the scorer against the same transcript. It is the
  // same request the End button makes, so there is one scoring path in the app
  // and this screen cannot score differently from the conversation screen.
  //
  // A SUCCESSFUL RETRY ALSO RUNS THE RETENTION CAP, exactly as a first-time
  // success does, so a student at the cap can see their oldest kept practice
  // drop off afterwards. That is the ordinary rule doing its job on a session
  // that has only now become finished, not a side effect of retrying.
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    setError("");
    try {
      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The route's own message is shown verbatim. On a second scoring failure
        // that message already ends with "Ask your instructor to provide a score
        // or try again", which is the ONLY place this screen mentions an
        // instructor: the first attempt at recovery should not send a student
        // away, and a repeated failure should.
        setError(data?.error || "Scoring could not be run again.");
        setRetrying(false);
        return;
      }
      router.push(`/student/session/${sessionId}/results`);
    } catch {
      setError("Something went wrong. Please try again.");
      setRetrying(false);
    }
  }

  return (
    <div className="mx-auto max-w-reading py-10">
      <Link
        href="/student"
        className="mb-3 inline-flex items-center gap-1 text-meta text-content-info hover:underline"
      >
        <Icon icon={IconArrowLeft} />
        Back to home
      </Link>

      <div className={cardClasses({ tone: "warning", padding: "lg" })}>
        <h1 className="text-card-title font-medium text-content-primary">
          Scoring did not finish
        </h1>
        {canRetry ? (
          <>
            <p className="mt-2 text-body text-content-secondary">
              Your conversation was saved, but the AI scoring did not finish, so
              there is no score to show yet.
            </p>
            <Button className="mt-4" onClick={retry} disabled={retrying}>
              {retrying ? "Scoring..." : "Try scoring again"}
            </Button>
          </>
        ) : (
          <p className="mt-2 text-body text-content-secondary">
            Your submission was saved, but it has no score yet. Ask your
            instructor.
          </p>
        )}
        {error && (
          <p className="mt-3 text-body text-content-danger">{error}</p>
        )}
      </div>
    </div>
  );
}
