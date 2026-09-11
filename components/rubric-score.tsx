"use client";

// THE RUBRIC SCORE. The itemized score, one collapsible section per criterion,
// shared by the student results page and the instructor submission view so the
// two can never drift.
//
// ==> PHASE 2b-2 REWROTE WHAT THIS READS, AND THE OLD VERSION WAS NOT MERELY
//     OUT OF DATE, IT WAS RENDERING THE WRONG THING.
//
//     It grouped by a `category` and labelled by a `label`, which belong to the
//     ORIGINAL flat rubric (29 items at 10 points each). Since 2b-1 every rubric
//     a reader can resolve is a LEVELS rubric: weighted criteria, each with its
//     own ladder of six performance levels. A criterion has neither of those two
//     fields, so both lookups fell through their defaults and the screen would
//     have shown every row in one group called "Other", named by internal ids
//     like "2-discovery", with the level the grader chose not shown at all.
//     Nothing reached a real user, because 2b-1's migration left the app
//     scoring nothing until this session turned the upload on. <==
//
// THE SHAPE, WHICH IS THE OWNER'S DECISION AND NOT A LAYOUT PREFERENCE:
//
//   - Each criterion is its own collapsible section. The header carries the
//     criterion's name and its earned over possible.
//   - One row inside, carrying the criterion's description, the level the
//     grader chose, the points, and the comment.
//   - The jump chips stay, one per criterion.
//
// PHASE 4b ADDED THE ATTRIBUTION, WHICH IS THE WHOLE OF ITS WORK HERE: every
// comment is labelled "AI feedback", a level an instructor changed says so
// beside the level, and the instructor's own note renders above the AI's
// comment under its own label. Until 4b a reviewed submission showed the
// student the instructor's level directly under the AI's unlabelled comment
// about a DIFFERENT level, with the instructor's note rendering nowhere at all.
//
// WHY THIS IS A CLIENT COMPONENT RATHER THAN <details>. <details> would be
// server-rendered, keyboard accessible and JavaScript-free, which is genuinely
// better, and it was the first choice in PD-8d. Two requirements rule it out,
// and both still hold:
//
//   1. PRINT. Student print-to-PDF is a shipped feature. A collapsed <details>
//      does not render its content, and CSS cannot force it open, because the
//      `open` ATTRIBUTE is the only thing that reveals it. A student saving
//      their results would get six headings and no feedback at all. Here, a
//      collapsed section stays in the DOM as `hidden print:block`, so the
//      printed sheet always contains every criterion fully expanded no matter
//      what is open on screen.
//   2. THE CHIP JUMP. Jumping to a criterion and landing on a closed row is
//      worse than having no chip, so a chip has to OPEN its target as well as
//      scroll to it. That needs state.
//
// Accessibility is kept by hand instead: each section header is a real button
// with aria-expanded and aria-controls, so it is reachable and announced.
import { useState } from "react";
import { Icon, IconChevronDown, IconChevronUp } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { formatPoints } from "@/lib/types";
import type { RubricCriterion, ScoreItem } from "@/lib/types";

// ==> PHASE 4b. WHO IS READING THIS RENDER. It is REQUIRED and has no default,
//     and that is the whole reason it is a prop rather than a constant.
//
//     This component draws on two pages: the student's own results page and the
//     instructor's read-only view of the same submission. One label has to
//     differ between them, because "Level set by your instructor" addresses a
//     student and would be nonsense shown to the instructor who set it.
//
//     THE ALTERNATIVE WAS TO FORK THE COMPONENT IN TWO, AND THAT IS EXACTLY
//     WHAT 2b-2 EXISTED TO UNDO. Two renderers of one score drift, and the two
//     screens then tell different stories about one submission. A defaulted
//     prop was the other tempting shape and it is worse than it looks: a third
//     call site added later would silently inherit whichever wording the
//     default happened to be, which is the quiet mislabel this project keeps
//     paying for. Required means every caller, the render check included, has
//     to say out loud who it is drawing for. <==
export type ScoreAudience = "student" | "instructor";

// ==> EXACTLY ONE STRING VARIES BY AUDIENCE, AND KEEPING IT TO ONE IS THE
//     POINT. "AI feedback" and "Instructor note" NAME WHOSE WORDS FOLLOW; they
//     address nobody, so they read correctly to either reader and are written
//     once, below, as plain text. Only the flag on a changed LEVEL speaks to
//     somebody, so only the flag is in this map. Every string added here is
//     another pair of wordings that can drift apart. <==
const CHANGED_LEVEL_FLAG: Record<ScoreAudience, string> = {
  student: "Level set by your instructor",
  instructor: "Level set in review",
};

// ==> THERE IS NO SHORT-LABEL MAP ANY MORE, AND ITS REMOVAL IS THE POINT RATHER
//     THAN A TIDY-UP. PD-8d carried an explicit map turning the flat rubric's
//     six category names into chip-sized ones ("Introduction / Approach" became
//     "Intro"). Those keys belong to a shape nothing can resolve now, and a
//     criterion name today comes out of the file the instructor uploaded. A map
//     of OUR words over THEIRS is exactly the quiet mislabel this project keeps
//     paying for, and it would have sat there matching nothing until somebody
//     happened to name a criterion the way our map spelled it. A chip carries
//     the criterion's own name and the row wraps. <==

// A criterion name or id turned into an id we can scroll to.
//
// ==> IT IS BUILT FROM THE CRITERION'S ID, NEVER ITS NAME. Ids encode position
//     and are unique inside a rubric by construction; names are whatever the
//     spreadsheet says and nothing stops two of them matching. Two sections
//     sharing an anchor would make one chip unreachable and give React two
//     children with the same key. <==
function anchorId(criterionId: string): string {
  return `rubric-${criterionId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

type Row = {
  // The criterion id, which is also the score item's id: one row per criterion.
  id: string;
  name: string;
  description: string;
  item: ScoreItem;
};

// ==> THE ROWS COME FROM THE SCORE, NOT FROM THE RUBRIC, AND THE DIRECTION
//     MATTERS. The score is the record of what was actually graded; the rubric
//     is looked up only to put a name and a description on each line. Walking
//     the RUBRIC instead would silently drop any stored item whose criterion is
//     no longer in it, which is a student's mark disappearing from their own
//     results page. Walking the score cannot lose a line: a criterion the rubric
//     can no longer explain still shows its points and its comment, under its
//     id. The scorer already writes items in rubric order, so the order on
//     screen is the rubric's own. <==
function buildRows(items: ScoreItem[], criteria: RubricCriterion[]): Row[] {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  return items.map((item) => {
    const criterion = byId.get(item.id);
    return {
      id: item.id,
      name: criterion?.name ?? item.id,
      description: criterion?.description ?? "",
      item,
    };
  });
}

// ==> PHASE 4b. WHAT THIS COMPONENT IS NOT GIVEN, WHICH IS THE STRONGEST
//     GUARANTEE IN THE PIECE AND IS WORTH FINDING HERE RATHER THAN IN A TEST.
//
//     THE AI'S ORIGINAL LEVEL IS NOT REACHABLE FROM THIS FILE AT ALL. It lives
//     in public.submission_ai_scores, which no student may read (proved in 4a
//     with the student's own browser key), and it is not a field on ScoreItem.
//     So "never show a student the level the AI chose before their instructor
//     overruled it" is not a rule this render remembers to follow; there is
//     nothing here to show. A future change that adds the original to the props
//     of this component is the change that breaks it, and that is the review
//     this comment is asking for.
//
//     ScoreItem.scored_by MARKS THE LEVEL AND NOT THE NOTE. It reads
//     "instructor" exactly when the chosen level differs from the AI's, and it
//     goes back to "ai" if the instructor puts the level back. A note is always
//     the instructor's by construction, so a note needs no marker and a
//     criterion carrying a note while reading "ai" is correct rather than a
//     bug. See the type in lib/types.ts and Phase 4b handoff item 3. <==
export function RubricScore({
  items,
  criteria,
  audience,
}: {
  items: ScoreItem[];
  criteria: RubricCriterion[];
  audience: ScoreAudience;
}) {
  const rows = buildRows(items, criteria);

  // The first section open, the rest collapsed, which is what PD-8d chose and
  // what the mockup draws: chevron-up on the first, chevron-down on the others.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(rows.length > 0 ? [rows[0].id] : []),
  );

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // A chip OPENS its criterion and then scrolls to it. Opening first is the
  // whole point: landing on a closed row would be worse than having no chip.
  function jumpTo(id: string) {
    setOpen((prev) => new Set(prev).add(id));
    // Wait for the section to be expanded before scrolling, so the browser
    // measures the final position rather than the collapsed one.
    requestAnimationFrame(() => {
      document
        .getElementById(anchorId(id))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (rows.length === 0) return null;

  return (
    <div>
      {/* The chip row: one per criterion, earned over possible, jump to it. */}
      <div className="mb-2.5 flex flex-wrap gap-1.5 print:hidden">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => jumpTo(row.id)}
            className="rounded-md bg-surface-secondary px-2.5 py-1 text-micro text-content-secondary transition-colors hover:bg-surface-info hover:text-content-info"
          >
            {row.name}{" "}
            <span className="tabular-nums">
              {formatPoints(row.item.points_earned)}/
              {formatPoints(row.item.points_max)}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-line-tertiary bg-surface-primary">
        {rows.map((row, i) => {
          const isOpen = open.has(row.id);
          const panelId = `${anchorId(row.id)}-detail`;
          return (
            <div
              key={row.id}
              id={anchorId(row.id)}
              className={i > 0 ? "border-t border-line-tertiary" : ""}
            >
              <h3>
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-tertiary"
                >
                  <span className="flex items-center gap-1.5 text-body font-medium text-content-primary">
                    {/* The chevron announces the DISCLOSURE, and it carries the
                        accent colour at REST rather than only on hover. Without
                        that, this row looked exactly like the detail beneath it,
                        which is not a control: a chevron on its own is not an
                        affordance, and a hover-only treatment cannot advertise a
                        control at all, since the reader must already know it is
                        there to hover it and a touch screen has no hover.
                        The button still announces its own state through
                        aria-expanded, and the chevron is hidden in print, where
                        everything is expanded and a chevron would lie. */}
                    <Icon
                      icon={isOpen ? IconChevronUp : IconChevronDown}
                      className="text-content-info print:hidden"
                    />
                    {row.name}
                  </span>
                  <span className="shrink-0 text-body font-medium tabular-nums text-content-secondary">
                    {formatPoints(row.item.points_earned)} /{" "}
                    {formatPoints(row.item.points_max)}
                  </span>
                </button>
              </h3>

              {/* COLLAPSED CONTENT STAYS IN THE DOM. `hidden` removes it from the
                  screen; `print:block` puts it back for the printed sheet, so a
                  student's PDF always has every criterion and every comment.
                  This was a named regression risk for 2b-2 and it is verified by
                  forcing print, not by reading this comment. */}
              <div
                id={panelId}
                className={isOpen ? "block" : "hidden print:block"}
              >
                <div className="border-t border-line-tertiary px-3.5 py-2.5 pl-9">
                  {/* What the criterion asks for, in the rubric's own words. It
                      takes the narrower reading measure: the rubric runs the
                      full width of a 1120px page and these are full sentences. */}
                  {row.description && (
                    <p className="max-w-reading text-meta text-content-secondary">
                      {row.description}
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                    {/* ==> THE LEVEL IS OPTIONAL AND THIS IS WHERE THAT IS
                            HANDLED. 32 stored scores were saved before
                            ScoreItem.level existed and carry none. A neutral
                            pill, not a coloured one: the tone would be US
                            grading the grade, and a ladder that bottoms out at
                            "Unsatisfactory" is Tom's judgment to make, not a
                            colour for this component to assign. <== */}
                    {row.item.level && (
                      <Badge tone="neutral">{row.item.level}</Badge>
                    )}
                    {/* ==> PHASE 4b. THE FLAG ON A LEVEL A HUMAN CHANGED, AND
                            IT SITS BESIDE THE LEVEL BECAUSE THAT IS WHAT IT IS
                            ABOUT. scored_by is "instructor" exactly when the
                            chosen level differs from the AI's.
                            An INFO pill rather than a second neutral one: at
                            the same tone as the level beside it, the eye reads
                            the pair as one pill that wrapped. <== */}
                    {row.item.scored_by === "instructor" && (
                      <Badge tone="info">{CHANGED_LEVEL_FLAG[audience]}</Badge>
                    )}
                    <span className="ml-auto shrink-0 text-meta font-medium tabular-nums text-content-secondary">
                      {formatPoints(row.item.points_earned)} /{" "}
                      {formatPoints(row.item.points_max)}
                    </span>
                  </div>

                  {/* ==> PHASE 4b. THE ORDER OF THESE TWO BLOCKS IS THE OWNER'S
                          RULING OF 2026-09-11 AND IT NEVER VARIES: the
                          INSTRUCTOR'S NOTE ALWAYS SITS ABOVE THE AI'S COMMENT
                          WHENEVER A NOTE EXISTS, whether or not the level was
                          changed.

                          WHY THAT WAY ROUND. On a changed criterion the student
                          is looking at a level their instructor chose, and the
                          AI's comment underneath explains the DIFFERENT level
                          the AI chose. Read in the other order, the first
                          explanation under a human's grade is the machine's
                          argument for a grade nobody is being given, which
                          reads as one person contradicting themselves. Putting
                          the note first means the instructor's reasoning
                          arrives beside the instructor's level.

                          AND A FIXED ORDER IS ITSELF THE FEATURE. An order that
                          depended on scored_by would put the same two
                          paragraphs in two different arrangements on one page,
                          and a reader would have to work out which one they are
                          looking at before they could read either. <== */}

                  {/* THE INSTRUCTOR'S NOTE. Plain text: React escapes it, and
                      nothing anywhere puts it into HTML by hand. It is bounded
                      at MAX_REVIEW_NOTE_CHARS on the way IN, on a trimmed
                      string, and stored as ABSENT rather than as an empty
                      string, so there is nothing to re-validate on the way out
                      and "is there a note" has one answer. whitespace-pre-wrap
                      keeps the paragraphs Tom typed.
                      NOT ITALIC, and in the primary text colour: these are a
                      person's own words about this student's work, and the
                      quieter italic treatment below belongs to the machine. */}
                  {row.item.instructor_note && (
                    <>
                      <p className="mt-2 text-micro font-medium text-content-tertiary">
                        Instructor note
                      </p>
                      <p className="mt-0.5 max-w-reading whitespace-pre-wrap text-micro text-content-primary">
                        {row.item.instructor_note}
                      </p>
                    </>
                  )}

                  {/* THE AI'S COMMENT, LABELLED AS THE AI'S EVERY TIME IT IS
                      DRAWN, on practices and submissions alike and whoever is
                      reading. The label is not conditional on anything: an
                      unlabelled comment sitting under a level a human chose is
                      the exact sentence Phase 4b handoff item 1 was written to
                      stop, and a label that appears only in the case somebody
                      predicted is a label that will one day be missing from the
                      case nobody did. */}
                  {row.item.comment && (
                    <>
                      <p className="mt-2 text-micro font-medium text-content-tertiary">
                        AI feedback
                      </p>
                      <p className="mt-0.5 max-w-reading text-micro italic text-content-secondary">
                        {row.item.comment}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
