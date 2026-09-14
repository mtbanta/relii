// PHASE 2b-2. The renderer's behavioural check, EXECUTED rather than reasoned about.
//
// ==> WHY THIS EXISTS. 2b-2 has NO MIGRATION, so it has no SQL file anybody runs
//     and no migration report to read. A piece with no migration is not a piece
//     with no proof: this script is the artifact that takes its place, and it is
//     the only part of the proof that measures the renderer's behaviour rather
//     than one screenshot of one score.
//
// ==> WHY THE RUBRIC IN IT IS INVENTED, AND WHY IT IS NOT EVEN ABOUT SELLING.
//
//     Phase 2a shipped a row-scan bug that survived eight fixtures because six
//     were built from Tom's real workbooks and both of those workbooks happened
//     to hide it. THE PROJECT RULE THAT CAME OUT OF IT: a fixture derived from
//     the samples can only ever confirm what the samples already show.
//
//     So the rubric below is a POTTERY rubric. Its criteria are Centring and
//     Trimming, its levels are Kiln-ready and Cracked, and nothing in it
//     resembles Tom's Approach-through-Overall-Impression or his Excellent
//     through Unsatisfactory. Any code that quietly assumed his names, his six
//     rungs, or the sales vocabulary fails here instead of passing by luck.
//
//     IT ALSO CARRIES TWO CRITERIA WITH THE SAME NAME, on purpose. Nothing in a
//     spreadsheet stops that, and the renderer anchors and keys sections by
//     criterion ID for exactly this reason. A name-keyed renderer passes every
//     other check in this file and fails check 13.
//
// HOW IT RUNS. The component is TSX and imports through the "@/" path alias,
// which tsc does not rewrite in its output. So this script copies the SHIPPED
// component and the SHIPPED types into a scratch directory, rewrites that alias
// to a relative path, drops in a stub for the icon module (which reaches
// @tabler/icons-react, a browser package this check has no use for), compiles
// the lot with a standalone tsc, and renders it to static HTML with react-dom.
// The alias rewrite and the icon stub are the ONLY edits made to shipped source.
//
//   node scripts/check-rubric-render.mjs
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const work = mkdtempSync(join(tmpdir(), "relii-render-"));
mkdirSync(join(work, "lib"), { recursive: true });
mkdirSync(join(work, "components", "ui"), { recursive: true });

// The shipped source. "@/lib/x" becomes "../lib/x" and "@/components/ui/x"
// becomes "./ui/x", because the copy keeps the same folder shape. Nothing else
// changes.
writeFileSync(
  join(work, "lib", "types.ts"),
  readFileSync(join(REPO, "lib", "types.ts"), "utf8"),
);
writeFileSync(
  join(work, "components", "ui", "badge.tsx"),
  readFileSync(join(REPO, "components", "ui", "badge.tsx"), "utf8"),
);
writeFileSync(
  join(work, "components", "rubric-score.tsx"),
  readFileSync(join(REPO, "components", "rubric-score.tsx"), "utf8")
    .replaceAll("@/lib/", "../lib/")
    .replaceAll("@/components/", "./"),
);

// The icon stub. The real module re-exports @tabler/icons-react, which draws
// SVG for a browser; what this check cares about is the text and the structure
// around it.
writeFileSync(
  join(work, "components", "ui", "icon.tsx"),
  `import type { ComponentType } from "react";
export const IconChevronDown: ComponentType = () => null;
export const IconChevronUp: ComponentType = () => null;
export function Icon({ className }: { icon: unknown; className?: string }) {
  return <i className={className} />;
}
`,
);

symlinkSync(join(REPO, "node_modules"), join(work, "node_modules"), "dir");

writeFileSync(
  join(work, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2021",
        module: "CommonJS",
        moduleResolution: "node",
        jsx: "react-jsx",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        lib: ["ES2021", "DOM"],
        outDir: "out",
      },
      include: ["lib/**/*.ts", "components/**/*.tsx", "check.tsx"],
    },
    null,
    2,
  ),
);

// ---------------------------------------------------------------------------
// THE INVENTED RUBRIC. Four criteria, four levels, no sales anywhere in it.
// ---------------------------------------------------------------------------
// The ladder is HIGHEST FIRST, which is the order the parser produces. Halves
// sit at BOTH ends of it, so "a half survives" is measured on a top rung and a
// bottom rung rather than hoped for once in the middle.
const CHECK = String.raw`
import { renderToStaticMarkup } from "react-dom/server";
import { RubricScore } from "./components/rubric-score";
import { formatPoints } from "./lib/types";
import type { RubricCriterion, ScoreItem } from "./lib/types";

const LADDER = (top: number, second: number, third: number, bottom: number) => [
  { name: "Kiln-ready", descriptor: "Would survive a firing.", points: top },
  { name: "Sound", descriptor: "Even walls, no wobble.", points: second },
  { name: "Rough", descriptor: "Usable, visibly hurried.", points: third },
  { name: "Cracked", descriptor: "Came apart on the wheel.", points: bottom },
];

const CRITERIA: RubricCriterion[] = [
  { id: "1-centring", name: "Centring", description: "Bring the clay true before opening it.", weight: 0.3, levels: LADDER(30, 22.5, 15, 7.5) },
  { id: "2-pulling", name: "Pulling", description: "Raise an even wall without thinning the base.", weight: 0.3, levels: LADDER(20, 15, 10, 5) },
  // TWO CRITERIA CALLED "Trimming", WITH DIFFERENT IDS. See the note at the top.
  { id: "3-trimming", name: "Trimming", description: "Cut a foot ring that carries the weight.", weight: 0.2, levels: LADDER(15, 12, 9, 4.5) },
  { id: "4-trimming", name: "Trimming", description: "Leave no tool marks on the outer curve.", weight: 0.2, levels: LADDER(15, 12, 9, 4.5) },
];

const item = (
  id: string,
  level: string | undefined,
  earned: number,
  max: number,
  comment: string,
): ScoreItem => ({
  id,
  ...(level === undefined ? {} : { level }),
  points_earned: earned,
  points_max: max,
  comment,
  scored_by: "ai",
});

// A full score: one half at the top of the range, one whole, one half at the
// bottom of the range, and one more whole.
const FULL: ScoreItem[] = [
  item("1-centring", "Sound", 22.5, 30, "True by the third pull."),
  item("2-pulling", "Rough", 10, 20, "Wall thins near the rim."),
  item("3-trimming", "Cracked", 4.5, 15, "Foot ring cut through."),
  item("4-trimming", "Kiln-ready", 15, 15, "No tool marks at all."),
];

const html = renderToStaticMarkup(<RubricScore items={FULL} criteria={CRITERIA} audience="student" />);

// The same single criterion rendered WITH and WITHOUT a level. Every other
// field is identical, so anything that differs between the two is the level and
// nothing else.
const withLevel = renderToStaticMarkup(
  <RubricScore items={[item("2-pulling", "Sound", 15, 20, "Even to the rim.")]} criteria={CRITERIA} audience="student" />,
);
const withoutLevel = renderToStaticMarkup(
  <RubricScore items={[item("2-pulling", undefined, 15, 20, "Even to the rim.")]} criteria={CRITERIA} audience="student" />,
);

// A stored item whose criterion is not in the rubric at all: the shape of every
// one of the 32 scores saved before Phase 2a existed.
const orphan = renderToStaticMarkup(
  <RubricScore items={[item("intro-3", undefined, 7, 10, "From a rubric nobody can resolve.")]} criteria={[]} audience="student" />,
);

// ---------------------------------------------------------------------------
// PHASE 4b. THE REVIEWED FIXTURE: TWO PEOPLE SPEAKING ON ONE SCORE.
// ---------------------------------------------------------------------------
// ==> IT CARRIES ALL THREE SHAPES A REVIEWED SCORE CAN HOLD, because two of
//     them are the ones a careless renderer gets wrong:
//
//       1. level CHANGED, so scored_by is "instructor", carrying a note.
//       2. level UNCHANGED but carrying a note. scored_by is "ai" AND THAT IS
//          CORRECT: the marker tracks the LEVEL, never the note, so this line
//          must show its note and must NOT show the flag. A renderer that reads
//          scored_by as "this line was touched" passes every other check here
//          and fails checks 30 and 31.
//       3. unchanged, no note at all.
//
// THE NOTE ON LINE 1 IS FULL OF CHARACTERS THAT ARE MARKUP IF ANYTHING EVER
// STOPS ESCAPING THEM. The instructor's note is student-facing text typed by a
// human, and the one thing that must never happen to it is being interpreted.
const NOTE_LITERAL = 'Watch the <b>bold</b> & "quotes" on the rim.';
const NOTE_PLAIN = "Agreed with the AI on this one, for a different reason.";

const reviewedItem = (
  id: string,
  level: string,
  earned: number,
  max: number,
  comment: string,
  scoredBy: "ai" | "instructor",
  note?: string,
): ScoreItem => ({
  id,
  level,
  points_earned: earned,
  points_max: max,
  comment,
  ...(note === undefined ? {} : { instructor_note: note }),
  scored_by: scoredBy,
});

const REVIEWED: ScoreItem[] = [
  reviewedItem("1-centring", "Kiln-ready", 30, 30, "True by the third pull.", "instructor", NOTE_LITERAL),
  reviewedItem("2-pulling", "Rough", 10, 20, "Wall thins near the rim.", "ai", NOTE_PLAIN),
  reviewedItem("3-trimming", "Cracked", 4.5, 15, "Foot ring cut through.", "ai"),
];

const studentHtml = renderToStaticMarkup(
  <RubricScore items={REVIEWED} criteria={CRITERIA} audience="student" />,
);
const instructorHtml = renderToStaticMarkup(
  <RubricScore items={REVIEWED} criteria={CRITERIA} audience="instructor" />,
);

const STUDENT_FLAG = "Level set by your instructor";
const INSTRUCTOR_FLAG = "Level set in review";

// One criterion's rendered section, sliced out of the markup, so an order check
// measures the order WITHIN a criterion rather than across the whole page.
// Section anchors are id="rubric-<criterion id>"; the panel inside each one adds
// "-detail", so the slice runs to the next anchor that is not a panel.
function section(markup: string, id: string): string {
  const start = markup.indexOf('id="rubric-' + id + '"');
  if (start < 0) return "";
  const rest = markup.slice(start + 1);
  const nextRelative = [...rest.matchAll(/id="(rubric-[a-z0-9-]+)"/g)]
    .filter((m) => !m[1].endsWith("-detail"))
    .map((m) => m.index ?? -1)
    .filter((i) => i >= 0)[0];
  return nextRelative === undefined ? markup.slice(start) : rest.slice(0, nextRelative);
}

const countOf = (markup: string, needle: string) =>
  markup.split(needle).length - 1;

let failures = 0;
let ran = 0;
function check(n: number, what: string, pass: boolean, detail = "") {
  ran++;
  if (!pass) failures++;
  const verdict = pass ? "PASSED" : "FAILED";
  console.log(String(n).padStart(2) + "  " + verdict + "  " + what + (detail && !pass ? "\n      " + detail : ""));
}

// --- The formatter, on its own, before anything is rendered. ---------------
check(1, "formatPoints keeps a half", formatPoints(3.5) === "3.5", "got " + formatPoints(3.5));
check(2, "formatPoints leaves a whole number bare (no .0)", formatPoints(44) === "44", "got " + formatPoints(44));
check(3, "formatPoints keeps a half on a total", formatPoints(59.5) === "59.5", "got " + formatPoints(59.5));
check(4, "formatPoints keeps a half below one", formatPoints(0.5) === "0.5", "got " + formatPoints(0.5));

// --- What the criterion sections say. --------------------------------------
check(5, "every criterion name is rendered", CRITERIA.every((c) => html.includes(c.name)));
check(6, "every criterion description is rendered", CRITERIA.every((c) => html.includes(c.description)));
check(7, "every comment is rendered", FULL.every((i) => html.includes(i.comment)));
check(8, "every chosen level name is rendered", ["Sound", "Rough", "Cracked", "Kiln-ready"].every((n) => html.includes(n)));

// A level the grader did NOT choose must not appear. The whole ladder is in the
// rubric; only the chosen rung belongs on screen.
check(9, "an unchosen level's descriptor is never rendered", !html.includes("Even walls, no wobble."));

// --- The halves, which are the point of the session. -----------------------
//
// ==> EVERY POINTS PAIR IS EXTRACTED AND COMPARED AS A WHOLE, RATHER THAN HUNTED
//     FOR WITH includes(). THE FIRST VERSION OF THIS FILE USED includes() AND
//     WAS WRONG IN BOTH DIRECTIONS, which is worth leaving written down.
//     "4.5 / 15" CONTAINS the substring "5 / 15", so a check asserting that a
//     rounded "5 / 15" never appears failed against markup that was perfectly
//     correct. The same trap runs the other way: a check that "22.5 / 30" is
//     present would also pass on "122.5 / 30". Comparing the complete multiset
//     of pairs cannot do either, and it is strictly stronger, because it also
//     proves no pair the score does not contain is on the page at all. <==
const pairs = [...html.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)]
  .map((m) => m[1] + "/" + m[2])
  .sort();
// Each criterion states its pair three times: once in its chip, once in its
// section header, once in the row inside.
const expectedPairs = FULL.flatMap((i) => {
  const pair = formatPoints(i.points_earned) + "/" + formatPoints(i.points_max);
  return [pair, pair, pair];
}).sort();

check(10, "every points pair is exactly what the score holds, halves included",
  pairs.join(" ") === expectedPairs.join(" "),
  "rendered: " + pairs.join(" ") + "\n      expected: " + expectedPairs.join(" "));
check(11, "nothing else numeric is on the page, so nothing was rounded into it",
  pairs.length === FULL.length * 3,
  "found " + pairs.length + " pairs, expected " + FULL.length * 3);
check(12, "a whole number renders bare, with no trailing .0",
  !/\d\.0\b/.test(html));

// --- Ids, order and structure. ---------------------------------------------
// The panel each section reveals also carries an id beginning "rubric-", so the
// section anchors are the ones NOT ending in "-detail". Getting this wrong is
// what made the first run of this file report 8 anchors for 4 criteria.
const anchors = [...html.matchAll(/id="(rubric-[a-z0-9-]+)"/g)]
  .map((m) => m[1])
  .filter((id) => !id.endsWith("-detail"));
check(13, "one anchor per criterion and all unique (two share a NAME)",
  anchors.length === CRITERIA.length && new Set(anchors).size === CRITERIA.length,
  "anchors: " + anchors.join(", "));

const positions = FULL.map((i) => html.indexOf(i.comment));
check(14, "sections appear in the score's own order",
  positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])));

check(15, "one chip and one header button per criterion",
  (html.match(/<button/g) ?? []).length === CRITERIA.length * 2,
  "found " + (html.match(/<button/g) ?? []).length + " buttons");

check(16, "exactly one section starts open",
  (html.match(/aria-expanded="true"/g) ?? []).length === 1);

// --- THE PRINT PROPERTY, half of it. ---------------------------------------
// This proves the collapsed content is still IN the document and still carries
// the print class. It does NOT prove the printed sheet is right, because that
// depends on Tailwind's variant ordering making print:block win over hidden.
// The live print check in the browser is what proves that, and this check does
// not replace it.
check(17, "collapsed sections stay in the document, carrying the print class",
  (html.match(/hidden print:block/g) ?? []).length === CRITERIA.length - 1);
check(18, "a collapsed section's comment is still in the document",
  html.includes("Foot ring cut through.") && html.includes("No tool marks at all."));

// --- A score with no level, which 32 stored scores are. --------------------
check(19, "a score with no level renders at all", withoutLevel.length > 0 && withoutLevel.includes("Even to the rim."));
check(20, "with no level, the level is simply absent", !withoutLevel.includes("Sound"));
check(21, "with a level, the same row shows it", withLevel.includes("Sound"));
check(22, "the level is the ONLY difference between the two",
  withLevel.replace(/<span class="inline-flex[^"]*">Sound<\/span>/, "").replace(/\s+/g, " ") ===
  withoutLevel.replace(/\s+/g, " "),
  "something other than the level changed");

// --- An item the rubric cannot explain. ------------------------------------
check(23, "an item with no matching criterion still renders, under its id",
  orphan.includes("intro-3") && orphan.includes("From a rubric nobody can resolve."));
check(24, "and its points are still shown", orphan.includes("7 / 10"));

// --- PHASE 4b: ATTRIBUTION. WHO SAID WHAT, AND WHERE IT SITS. --------------
//
// ==> THE ONE THING 4b EXISTS TO STOP: a student reading a level their
//     instructor chose, directly above an unlabelled comment explaining the
//     DIFFERENT level the AI chose, with the instructor's note nowhere on the
//     page. Every check below is one half of that sentence.

// The label is on EVERY comment, not only reviewed ones. A label that appears
// only in the case somebody predicted is a label that will one day be missing
// from the case nobody did, so this is measured on the PRACTICE-shaped render
// (FULL: no notes, nothing changed) as well as on the reviewed one.
check(25, "every comment on an unreviewed score is labelled AI feedback",
  countOf(html, "AI feedback") === FULL.length,
  "found " + countOf(html, "AI feedback") + " labels for " + FULL.length + " comments");
check(26, "every comment on a reviewed score is labelled AI feedback",
  countOf(studentHtml, "AI feedback") === REVIEWED.length,
  "found " + countOf(studentHtml, "AI feedback") + " labels for " + REVIEWED.length + " comments");

// The flag marks the LEVEL, so it belongs on exactly the lines whose level a
// human changed: one of the three, not the two carrying notes.
check(27, "the changed level is flagged, exactly once",
  countOf(studentHtml, STUDENT_FLAG) === 1,
  "found " + countOf(studentHtml, STUDENT_FLAG));
check(28, "the flag is inside the CHANGED criterion's own section",
  section(studentHtml, "1-centring").includes(STUDENT_FLAG));
check(29, "and nowhere near the unchanged ones",
  !section(studentHtml, "2-pulling").includes(STUDENT_FLAG) &&
  !section(studentHtml, "3-trimming").includes(STUDENT_FLAG));

// scored_by MARKS THE LEVEL AND NOT THE NOTE. "2-pulling" carries a note while
// reading "ai", which is correct by construction, and it must show the note
// without the flag. This is the pair of checks a renderer that reads scored_by
// as "this line was touched" fails.
check(30, "a note on an UNCHANGED level still renders",
  section(studentHtml, "2-pulling").includes(NOTE_PLAIN));
check(31, "and that line is NOT flagged as the instructor's level",
  !section(studentHtml, "2-pulling").includes(STUDENT_FLAG));
check(32, "the note label appears once per note and no more",
  countOf(studentHtml, "Instructor note") === 2,
  "found " + countOf(studentHtml, "Instructor note"));
check(33, "a criterion with no note shows no note label",
  !section(studentHtml, "3-trimming").includes("Instructor note"));

// ==> THE ORDER, WHICH IS THE OWNER'S RULING OF 2026-09-11 AND IS FIXED: the
//     instructor's note ALWAYS sits above the AI's comment wherever a note
//     exists, changed level or not. Measured inside each criterion's own
//     section, because "before" across the whole page would also be satisfied
//     by a note landing under the wrong criterion.
const changedSection = section(studentHtml, "1-centring");
const unchangedSection = section(studentHtml, "2-pulling");
check(34, "on a CHANGED line the note comes before the AI's comment",
  changedSection.indexOf("Instructor note") >= 0 &&
  changedSection.indexOf("Instructor note") < changedSection.indexOf("AI feedback"));
check(35, "on an UNCHANGED line the note comes before it too, so the order never varies",
  unchangedSection.indexOf("Instructor note") >= 0 &&
  unchangedSection.indexOf("Instructor note") < unchangedSection.indexOf("AI feedback"));
check(36, "and the flag comes before both, beside the level it is about",
  changedSection.indexOf(STUDENT_FLAG) < changedSection.indexOf("Instructor note"));

// ==> THE NOTE IS TEXT AND MUST NEVER BE MARKUP. Checked in BOTH directions,
//     because "the escaped form is present" alone would also pass on a page
//     that rendered the note twice, once escaped and once live.
check(37, "a note's angle brackets are escaped, so <b> is characters and not a tag",
  studentHtml.includes("&lt;b&gt;bold&lt;/b&gt;"));
check(38, "and no real <b> element was produced anywhere",
  !studentHtml.includes("<b>"));
check(39, "an ampersand in a note is escaped too",
  studentHtml.includes("&amp;"));
check(40, "the note's quotes survive as characters",
  studentHtml.includes('"quotes"') || studentHtml.includes("&quot;quotes&quot;"));

// --- PHASE 4b: THE TWO AUDIENCES, ONE COMPONENT. ---------------------------
//
// ==> ONE STRING VARIES AND THE CHECK IS THAT ONLY ONE DOES. This is the same
//     shape as check 22: strip the one thing that is meant to differ and the
//     two renders must be byte-identical. It is what stops the instructor's
//     read-only view and the student's page drifting into two screens that
//     tell different stories about one submission.
check(41, "the instructor render never addresses the student",
  !instructorHtml.includes(STUDENT_FLAG));
check(42, "the instructor render uses its own neutral wording instead",
  countOf(instructorHtml, INSTRUCTOR_FLAG) === 1,
  "found " + countOf(instructorHtml, INSTRUCTOR_FLAG));
check(43, "the student render never uses the instructor's wording",
  !studentHtml.includes(INSTRUCTOR_FLAG));
check(44, "the audience changes that ONE string and nothing else",
  studentHtml.split(STUDENT_FLAG).join("<<FLAG>>") ===
  instructorHtml.split(INSTRUCTOR_FLAG).join("<<FLAG>>"),
  "something other than the flag wording differs between the two audiences");

// ==> WHAT IS NOT ON THE PAGE, AND IT IS THE STRONGEST PROPERTY IN THE PIECE.
//     The student must never see the level the AI chose before their instructor
//     overruled it. That is not enforced by a rule this render follows; the
//     AI's original is not a field on ScoreItem and is not reachable from the
//     component at all. What this check measures is the observable consequence:
//     of the four rungs on the changed criterion's ladder, exactly ONE appears
//     in its section, and it is the one now in force. A future change that
//     started printing "AI: Sound" beside the new level fails here.
const CHANGED_LADDER = CRITERIA[0].levels.map((l) => l.name);
const shown = CHANGED_LADDER.filter((n) => changedSection.includes(n));
check(45, "only the level in force appears in the changed criterion's section",
  shown.length === 1 && shown[0] === "Kiln-ready",
  "found: " + shown.join(", "));

// --- PD DISPLAY FIX, 2026-09-13. THE FLOAT DUST. ---------------------------
//
// ==> THERE IS NO LIVE VENUE FOR THIS, AND THAT ABSENCE IS THE REASON IT IS
//     HERE. Tom's September 11 practice renders its Discovery criterion as
//     49.50000000000001 / 55.00000000000001 while every other criterion on the
//     same page prints clean. NOT ONE STORED SCORE IN THE TEST CLASSES CARRIES
//     DUST, measured 2026-09-13: B3's Discovery stores a clean 49.5 / 55, the
//     very same criterion. So a click-through against test data renders the
//     same text before and after the fix. That proves no regression and proves
//     nothing whatever about the fix. These checks are the discriminating half.
//
//     THE TWO VALUES ARE NOT INVENTED. They are the two numbers off his screen.
//
//     WHERE THE DUST IS BORN IS STILL UNMEASURED and deliberately out of scope:
//     lib/scoring.ts line 437 sums points_earned with plain float addition and
//     app/api/session/end/route.ts line 272 stores that sum, so a STORED total
//     may carry dust that every screen now hides. This is a render fix.
check(46, "formatPoints rounds dust off a half",
  formatPoints(49.50000000000001) === "49.5", "got " + formatPoints(49.50000000000001));
check(47, "formatPoints rounds dust off a whole and drops the .0",
  formatPoints(55.00000000000001) === "55", "got " + formatPoints(55.00000000000001));
check(48, "formatPoints leaves a plain integer alone",
  formatPoints(12) === "12", "got " + formatPoints(12));
check(49, "formatPoints keeps a half at one decimal, never rounding it to a whole",
  formatPoints(4.5) === "4.5", "got " + formatPoints(4.5));
check(50, "formatPoints renders zero as 0",
  formatPoints(0) === "0", "got " + formatPoints(0));
check(51, "formatPoints still hands back a non-finite value unchanged",
  formatPoints(NaN) === "NaN" && formatPoints(Infinity) === "Infinity",
  "got " + formatPoints(NaN) + " and " + formatPoints(Infinity));

// ==> AND THE SAME THING THROUGH THE SHIPPED COMPONENT, not the helper alone.
//     The criterion's own ladder is irrelevant to this: rubric-score.tsx renders
//     the ITEM's points_earned and points_max and never a level's points, which
//     is why a 55-point item on a 30-point criterion is not a mismatch here.
const dusty = renderToStaticMarkup(
  <RubricScore
    items={[item("1-centring", "Sound", 49.50000000000001, 55.00000000000001, "Dust on both numbers.")]}
    criteria={CRITERIA}
    audience="student"
  />,
);
const dustyPairs = [...dusty.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)].map((m) => m[1] + "/" + m[2]);
check(52, "the rendered pair reads 49.5 / 55, all three times it is stated",
  dustyPairs.length === 3 && dustyPairs.every((p) => p === "49.5/55"),
  "rendered: " + dustyPairs.join(" "));
check(53, "no number with three or more decimal places survives in the markup",
  !/\d\.\d{3,}/.test(dusty),
  "found: " + (dusty.match(/\d\.\d{3,}/) ?? [""])[0]);

console.log("");
if (failures > 0) {
  console.log(failures + " of " + ran + " CHECK(S) FAILED");
  process.exit(1);
}
// COUNTED, NOT TYPED. The old line read "All 24 checks passed." as a literal,
// which is a number that goes stale the first time somebody adds a check and
// forgets it. It now reports what actually ran.
console.log("All " + ran + " checks passed.");
`;

writeFileSync(join(work, "check.tsx"), CHECK);

try {
  execFileSync(join(REPO, "node_modules/.bin/tsc"), ["-p", work], {
    stdio: "inherit",
  });
  execFileSync("node", [join(work, "out/check.js")], { stdio: "inherit" });
} finally {
  rmSync(work, { recursive: true, force: true });
}
