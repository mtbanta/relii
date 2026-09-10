// PHASE 3a. WHAT COUNTS AS FINISHED WORK ON AN ASSIGNMENT, IN ONE PLACE.
//
// Three callers ask this question and they must never disagree about it:
//
//   app/instructor/assignments/page.tsx          decides what to SHOW
//   components/delete-assignment-button.tsx      decides which CONFIRM to open
//   app/api/instructor/assignment/[id]/delete    decides what to actually DO
//
// The route is the only one of the three that DECIDES anything: it counts from
// its own read, server-side, at the moment of the request. The other two only
// choose what the instructor looks at. They still share this module so that a
// screen offering the plain confirm and a route accepting it can never drift
// apart in their reasoning, only in their timing (see the race note below).
//
// ==> WHY THIS RULE EXISTS AT ALL, AND IT IS NOT HOUSEKEEPING. A rubric can
//     never be replaced on an existing assignment: the upload happens at
//     creation and nowhere else. So "delete the assignment and create it again"
//     is THE ONLY REPAIR PATH for a wrong or mis-parsed rubric. Until now ANY
//     session forced the typed-DELETE confirm, and an unfinished session appears
//     on no screen anybody can reach, so a single abandoned practice held its
//     assignment hostage and left only the confirm that destroys real student
//     submissions. Two defensible decisions collided exactly there. <==
//
// ==> THE RULE IS TOTAL, AND THAT WAS MEASURED RATHER THAN ASSUMED. The database
//     permits exactly three statuses and two kinds:
//       sessions_status_check  in_progress | completed | scored
//       sessions_kind_check    practice    | submission
//     read from pg_constraint on 2026-09-10 and pasted into
//     supabase/phase-3a-baseline.sql. All six pairs are decided below, so no row
//     the database can hold falls through this function. If a status or kind is
//     ever added, this is the function that has to be opened first. <==

// The only two fields the rule reads. Deliberately structural rather than a
// named row type: the page, the button and the route each read a different set
// of columns, and all three can satisfy this.
export type AssignmentSessionRow = {
  kind: string;
  status: string;
};

// UNFINISHED: started, never carried to its finished state, and visible to
// nobody. The three clauses, and each one is a ruling rather than a guess:
//
//   A SUBMISSION IS ALWAYS FINISHED WORK, whatever its status. An in_progress
//   submission is the INTERRUPTED state, which is not abandoned rubbish: it is a
//   student's one graded attempt, it shows on the student home with its own
//   explanation, and an instructor resets it through the reset route. It must
//   keep demanding the typed DELETE.
//
//   A PRACTICE AT in_progress IS UNFINISHED. The student closed the tab or
//   reloaded mid-conversation. Tom ruled on 2026-08-02 that this stays invisible
//   to the STUDENT, and that ruling is untouched here: this only lets the
//   INSTRUCTOR's plain delete through.
//
//   A PRACTICE AT completed DEPENDS ENTIRELY ON THE RUBRIC, and this is the
//   clause that is got wrong by reading status alone. On a GRADED assignment,
//   completed means the conversation ended and the score never saved: a scoring
//   failure, which Phase 2c's refusal made more reachable on purpose. On a
//   CONVERSATION-ONLY assignment, completed IS the finished state and always
//   was; that practice is real work, it shows on the student home, and it is not
//   ours to sweep away. B1's own "HVAC Alex - trial close" carries three of
//   exactly these, which is why the baseline recorded them.
//
//   A PRACTICE AT scored IS FINISHED, on any assignment.
export function isUnfinishedSession(
  session: AssignmentSessionRow,
  assignmentHasRubric: boolean,
): boolean {
  if (session.kind !== "practice") return false;
  if (session.status === "in_progress") return true;
  if (session.status === "completed") return assignmentHasRubric;
  return false;
}

// The counts one assignment's delete control is decided from.
export type SessionTally = {
  submissions: number;
  practices: number;
  // Of those sessions, how many are unfinished, and how many are real work.
  // finished is what the decision below actually turns on; unfinished is carried
  // so the confirm can say how many rows it is about to remove.
  unfinished: number;
  finished: number;
};

export const EMPTY_TALLY: SessionTally = {
  submissions: 0,
  practices: 0,
  unfinished: 0,
  finished: 0,
};

export function tallySessions(
  rows: AssignmentSessionRow[],
  assignmentHasRubric: boolean,
): SessionTally {
  const tally: SessionTally = { ...EMPTY_TALLY };
  for (const row of rows) {
    if (row.kind === "submission") tally.submissions += 1;
    else if (row.kind === "practice") tally.practices += 1;
    if (isUnfinishedSession(row, assignmentHasRubric)) tally.unfinished += 1;
    else tally.finished += 1;
  }
  return tally;
}

// ==> THE ONE RULE, AND IT IS DELIBERATELY ONE LINE. The plain confirm applies
//     when there is NO FINISHED WORK. That covers the assignment with no
//     sessions at all (the case that already had the plain confirm, unchanged)
//     and the assignment whose only sessions are unfinished (the case Phase 3a
//     adds), without either being a special branch.
//
//     IT IS WRITTEN AS finished === 0 RATHER THAN AS unfinished === total ON
//     PURPOSE. Those are the same number today. They stop being the same the
//     moment a status is added that is neither, and of the two, "destroy nothing
//     that counts" is the half that must survive such a change. This one fails
//     closed: an undecided row counts as finished and keeps the typed DELETE. <==
//
// ==> WHAT THIS DOES NOT DECIDE, AND THE DISTINCTION IS THE WHOLE SAFETY STORY.
//     The page and the button call this to choose a SCREEN, from counts read
//     when the page loaded. The route calls it to choose an ACTION, from counts
//     read inside the request. Those can disagree, and when they do the route
//     wins: if a student finishes a practice between the page loading and the
//     instructor clicking, the browser sends no acknowledgment, the route's own
//     tally says finished work exists, and it refuses with the existing 409
//     rather than deleting. Sharing this function removes drift in the REASONING
//     and deliberately does not remove the gap in TIME, because the gap in time
//     is what the server-side re-count exists to catch. <==
export function plainDeleteApplies(tally: Pick<SessionTally, "finished">): boolean {
  return tally.finished === 0;
}
