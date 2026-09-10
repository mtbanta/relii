// Shared data shapes used across the role-play feature.
//
// ==> THIS FILE IMPORTS NOTHING, AND THAT IS A RULE RATHER THAN AN ACCIDENT.
//     Client components pull types from here. Anything this file imports, the
//     browser bundle inherits. Adding a single import of a Node library or a
//     heavy package at the top of this file would push it into every page that
//     names one of these shapes. Keep the imports at zero. <==

// One line of the saved conversation. "persona" is the AI (Alex); "student" is
// the human sales rep. Stored as a JSON list on sessions.transcript.
export type TranscriptTurn = {
  role: "persona" | "student";
  text: string;
  at: string; // ISO timestamp
};

// One scored rubric line, saved inside sessions.score.items.
export type ScoreItem = {
  id: string;
  // PHASE 2b-1. The short name of the performance level the grader chose, copied
  // exactly from the criterion's own ladder ("Proficient", "Limited", and so
  // on). points_earned below is the value looked up FOR THAT LEVEL, server-side,
  // from the criterion's own levels. The model never supplies a number.
  //
  // ==> OPTIONAL, AND THAT IS HONESTY RATHER THAN LAZINESS. 32 scores were
  //     saved before this field existed and they do not carry one. Marking it
  //     required would make this type lie about every one of them, and the
  //     reader that eventually renders a level (Phase 2b-2) has to handle a
  //     score that has none anyway. The scorer always writes it. <==
  level?: string;
  // ==> HALF POINTS ARE REAL AND MUST NOT BE ROUNDED. Tom's Discovery rubric
  //     awards 49.5, 38.5, 13.5, 4.5 and 0.5 on four of its six criteria. This
  //     number is copied straight out of the rubric, so there is nothing to
  //     clamp and nothing to round: a Math.round() anywhere near it turns 49.5
  //     into 50 and silently changes a grade. sessions.score_total is numeric,
  //     so the database keeps the fraction too. <==
  points_earned: number;
  points_max: number;
  comment: string;
  scored_by: "ai";
};

// The full itemized score, saved to sessions.score.
export type SessionScore = {
  total: number;
  max_total: number;
  items: ScoreItem[];
};

// Which of the two meetings a scenario is, stored on scenarios.meeting_type and
// matched against each rubric item's "meetings" tags. The database enforces the
// same two values with a check constraint.
export type MeetingType = "discovery" | "presentation";

export function isMeetingType(value: unknown): value is MeetingType {
  return value === "discovery" || value === "presentation";
}

// A single rubric line as stored in rubrics.items.
//
// ==> PHASE 2b-2: NOTHING IN THE APP READS THIS TYPE ANY MORE, AND IT IS KEPT ON
//     PURPOSE RATHER THAN OVERLOOKED. It is the ORIGINAL flat shape, 29 items
//     each worth 10 points. 2b-1 put it out of reach (no assignment names the
//     legacy rubric, so no reader can resolve one) and 2b-2 moved the last four
//     readers, the two instructor surfaces included, onto RubricCriterion.
//
//     THE ROW IT DESCRIBES STILL EXISTS IN THE DATABASE, which is the reason to
//     keep the description of it. One legacy rubric is stored, two scenarios
//     still name it, and 32 stored scores were produced against it. Deleting
//     this type would leave that data with nothing in the codebase saying what
//     shape it is in.
//
//     DO NOT RE-INTRODUCE A READER FOR IT. There is no discriminator, no version
//     field and no shape probe on rubrics.items, and 2b-1 settled that
//     deliberately: what enforces the ruling is the REFUSAL in lib/scoring.ts,
//     which stops with a legible error on a rubric whose criteria carry no
//     levels. <==
export type RubricItem = {
  id: string;
  category?: string;
  label: string;
  points: number;
  applies_to: "both" | "voice-only";
  guidance?: string;
  meetings: string[];
};

// ---------------------------------------------------------------------------
// PHASE 2a. The uploaded rubric: weighted criteria, each scored by picking one
// of six performance levels.
// ---------------------------------------------------------------------------
// ==> THESE SHAPES LIVE HERE, AND NOT BESIDE THE PARSER THAT PRODUCES THEM, ON
//     PURPOSE. lib/rubric-xlsx.ts imports ExcelJS, which is 96 packages of Node
//     library. components/create-assignment-form.tsx is a CLIENT component and
//     needs these shapes for the preview. If it imported them from the parser
//     module and anybody ever wrote a plain "import { ParsedRubric }" instead of
//     "import type", ExcelJS would land in the browser bundle.
//
//     Putting them in this import-free file makes that impossible rather than
//     merely discouraged. It is the same split, for the same reason, as
//     lib/legal.ts against lib/legal-server.ts in Phase 5. The parser therefore
//     does NOT re-export these: there must be exactly one place to import them
//     from, and it must be the safe one. <==

// ==> RULE ZERO: HOW BIG AN UPLOAD MAY BE, CHECKED BEFORE ANYTHING IS PARSED.
//
//     WHY IT EXISTS. Both routes hand the upload to ExcelJS, which reads the
//     whole workbook into memory inside a serverless function, and Next.js
//     route handlers do NOT impose the body limit the old pages API did. With
//     no cap, an oversized upload fails as an exhausted function rather than as
//     a refusal anyone can act on.
//
//     THE NUMBERS COME FROM THE REAL FILES, measured 2026-09-09:
//       on disk        55,994 and 55,050 bytes
//       uncompressed  557,384 and 528,870 bytes across 11 to 12 zip entries
//       natural ratio  about 10x
//
//     TWO LIMITS, AND WHAT EACH ONE ACTUALLY BUYS. An .xlsx is a zip.
//
//       The byte cap bounds a LARGE UPLOAD, and it is the only limit here that
//       an attacker cannot talk their way around.
//
//       The expanded cap is read from the sizes the zip DECLARES about itself,
//       without inflating anything. It catches an honest workbook that is
//       genuinely too big, and a naive bomb that declares its true size.
//
//     ==> WHAT THE EXPANDED CAP DOES NOT DO, WRITTEN DOWN SO NOBODY LATER READS
//         IT AS A ZIP-BOMB DEFENCE. The uncompressed size in a central
//         directory is written by whoever made the file. A crafted archive can
//         declare 1 KB and still carry a deflate stream that expands to
//         gigabytes, because the inflater works from the STREAM and never
//         consults the declaration. A liar walks straight past this check.
//
//         So the real bound on worst-case memory is the byte cap, and deflate's
//         maximum ratio is about 1032:1: 512 KB of hostile input can still
//         reach roughly 500 MB. THAT IS ACCEPTED RATHER THAN SOLVED. The
//         genuine fix is a bounded inflate, ExcelJS does not expose one, and
//         replacing the unzip layer is not justified here: this route sits
//         behind requireInstructorRequest(), instructors are added only by a
//         super admin, and the realistic event is Tom uploading the wrong file,
//         which these checks catch cleanly and explain in plain words. <==
export const MAX_RUBRIC_FILE_BYTES = 512 * 1024;
export const MAX_RUBRIC_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;

//     WHY THESE TWO NUMBERS, AND WHY THEY ARE NOT IN PROPORTION TO EACH OTHER.
//
//     512 KB on disk is about 9 times the largest real file. That still leaves
//     room for an Excel re-save that adds an image or a theme, and a rubric is
//     seven rows of numbers, so nothing honest approaches it.
//
//     20 MB expanded is about 36 times the real files' 557 KB. THE RATIO
//     BETWEEN THE TWO LIMITS IS NOT A QUANTITY THAT MEANS ANYTHING, and making
//     them symmetrical would make this worse rather than tidier:
//
//       The byte cap is a POLICY about how big an honest rubric can be. It is
//       also the only real bound on worst-case memory, for the reason in the
//       next comment block.
//
//       The expanded cap is a CEILING WHOSE ONLY JOB IS TO AVOID FALSE
//       REFUSALS while still catching an honest oversized workbook. Spreadsheet
//       XML compresses far better than our two samples' 10x when a sheet is
//       text-heavy: 25x is ordinary. A 512 KB file at 25x is 12.8 MB, so
//       tightening this toward the observed 10x would start refusing legitimate
//       workbooks. It would also buy nothing in the worst case, which is
//       governed by the byte cap and not by this number. <==

// A byte count as a person reads it, for the refusal messages, because
// "512 KB" is clearer to Tom than "524288 bytes".
//
// ==> IT ROUNDS UP, NEVER TO NEAREST, AND THAT IS THE WHOLE POINT. With
//     rounding to nearest, a file ONE BYTE over the cap formats to exactly the
//     same string as the cap, and the refusal reads "That file is 512 KB and
//     the limit is 512 KB", which tells the reader their file is precisely the
//     limit and was rejected anyway. Rounding up means a file over the limit
//     always DISPLAYS as over the limit. Found by the boundary fixture on
//     2026-09-09; a comfortably oversized test file would never have shown it.
//
//     THE RULE, WHICH IS DIRECTIONAL: A SIZE ROUNDS UP AND A LIMIT ROUNDS
//     DOWN. Rounding both the same way reintroduces the bug from whichever
//     side the rounding happens to fall, and a message must never be able to
//     claim a file sits inside a limit it actually exceeds. Rounding a size up
//     never understates it; rounding a limit down never overstates it; so the
//     displayed size is over the displayed limit whenever the real one is.
//
//     IT CANNOT BITE TODAY, because both caps are exact powers of two and floor
//     and ceil agree on them. It is written this way for the cap that is not,
//     which is the one a later session will choose without thinking about
//     rounding at all. That is why these are two named functions rather than
//     one with a flag: the call site has to say which kind of number it holds. <==
function formatBytesRounded(bytes: number, direction: "up" | "down"): string {
  const round = direction === "up" ? Math.ceil : Math.floor;
  if (bytes >= 1024 * 1024) {
    return `${(round((bytes / (1024 * 1024)) * 10) / 10).toFixed(1)} MB`;
  }
  if (bytes >= 1024) return `${round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

// The size of something that exists. Rounds UP.
export function formatSize(bytes: number): string {
  return formatBytesRounded(bytes, "up");
}

// A ceiling we are enforcing. Rounds DOWN.
export function formatLimit(bytes: number): string {
  return formatBytesRounded(bytes, "down");
}

// ==> PHASE 2b-2. A POINTS VALUE AS A PERSON READS IT, AND THE WHOLE JOB OF THIS
//     FUNCTION IS TO NOT ROUND.
//
//     Tom's rubrics award halves: 49.5, 38.5, 13.5, 4.5, 0.5. A criterion has to
//     read `44 / 55` when the number is whole and `3.5 / 5` when it is not, and
//     a total has to read `59.5 / 100`. JavaScript's own number-to-text does
//     exactly that: 44 gives "44" and 3.5 gives "3.5". So this function's real
//     content is the Number() at the top and the comment you are reading.
//
//     WHY Number() AND NOT A CAST. This is the lesson 2b-1 paid for on
//     rubrics.max_total: a Postgres `numeric` does not always cross a JSON
//     boundary as a JavaScript number, and TypeScript cannot see that. Points
//     inside sessions.score are jsonb and do arrive as numbers, but this helper
//     is the one place points become text, so the conversion belongs here rather
//     than in each caller. A value that is not a number at all is returned
//     unchanged instead of becoming "NaN", because showing a student the raw
//     stored value is more honest than showing them a word.
//
//     IT DOES NOT ROUND ANYTHING, INCLUDING TO ONE DECIMAL. Every value in a
//     rubric is a whole number or a half by construction, so there is nothing to
//     tidy. If a rubric ever carried a third, this prints it in full rather than
//     rounding it away, which is the safer of the two failures: a long number is
//     visibly odd, a quietly rounded grade is not. <==
export function formatPoints(value: number): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}

// One performance level of one criterion, as stored.
export type RubricLevel = {
  // The short name: "Excellent", "Proficient", "Limited". It is the FIRST LINE
  // of the header cell, and it is what the grader returns and what the student
  // is shown.
  name: string;
  // ==> PHASE 2b-1. THE SECOND LINE OF THE HEADER CELL, AND IT IS THE ONLY
  //     THING IN TOM'S FILE THAT SAYS WHAT A LEVEL MEANS.
  //
  //         Excellent       Ready for an entry-level sales role.
  //         Proficient      Emerging professional skills
  //         Developing      Growth opportunity
  //         Limited         Partially conducted this aspect
  //         Minimal         Initial effort shown
  //         Unsatisfactory  No effort shown or does not meet expectations
  //
  //     2a stored the left column and discarded the right one, which was
  //     correct for 2a: nothing read a level. 2b-1 makes an AI choose one of
  //     these names for every criterion, and WITHOUT THE DESCRIPTOR THE SIX
  //     NAMES ARE BARE LABELS. The only thing left defining where one level
  //     ends and the next begins would be a generic ladder WE wrote, which
  //     would make our prompt the grade boundary instead of Tom's rubric.
  //     Owner's ruling, 2026-09-10: keep his words.
  //
  //     OPTIONAL because a header cell may carry a name and nothing else, which
  //     is not a defect worth refusing a whole file over. Absent means the
  //     grader is told the name and the ladder position only.
  //
  //     THE COST OF DOING THIS NOW WAS ONE PARSER CHANGE AND NOTHING ELSE,
  //     because at the time it was made there were ZERO levels-rubrics stored
  //     anywhere. After 2b-2 ships and Tom uploads, the same change means
  //     asking him to re-upload every rubric. <==
  descriptor?: string;
  // Absolute points for this level of this criterion. Half points are real
  // (49.5, 38.5, 4.5) and are stored exactly as the spreadsheet states them.
  points: number;
};

// One weighted criterion.
export type RubricCriterion = {
  // Stable within one rubric. Encodes the criterion's POSITION in the parsed
  // list, not the number in column A, which is why "Close" is 3-close in
  // Discovery and 4-close in Presentation.
  //
  // ==> DO NOT "SIMPLIFY" THIS TO A NAME-ONLY SLUG. Position makes it unique by
  //     construction. A name-only slug would introduce a collision risk that
  //     does not exist today, and ids only ever need to be unique inside a
  //     single rubric. <==
  id: string;
  name: string;
  description: string;
  // Column B: this criterion's share of the total, so 0.1 means 10 per cent.
  // Carried for Phase 2b. NEVER used to recompute a points value, because every
  // level already stores its absolute points and two ways to reach one number
  // is two records that can disagree about a grade.
  weight: number;
  // Six levels, HIGHEST FIRST, which is the order the columns are in.
  levels: RubricLevel[];
};

// A whole parsed rubric, as the parser returns it and the route stores it.
// maxTotal goes to the rubrics.max_total COLUMN, never inside rubrics.items:
// items is constrained to an array and every consumer treats each element as a
// criterion.
export type ParsedRubric = {
  name: string;
  maxTotal: number;
  criteria: RubricCriterion[];
};

// What the parser hands back. The refusal half matches the Refusal shape in
// lib/class-scope.ts, so a route can pass either straight to the browser.
export type ParseResult =
  | { ok: true; rubric: ParsedRubric }
  | { ok: false; error: string };
