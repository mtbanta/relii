// DATES AND TIMES IN US CENTRAL, EXECUTED RATHER THAN REASONED ABOUT.
//
//   node scripts/check-app-time.mjs
//
// ==> THE TRAP THIS SCRIPT EXISTS TO AVOID, AND IT IS NOT HYPOTHETICAL. The
//     machine this was written on has its own default timezone set to
//     America/Chicago. Every check below ALSO PASSES ON THE UNFIXED CODE there,
//     because code that names no timezone at all picks up the machine's. A
//     green run on that machine would have measured nothing whatsoever.
//
//     SO THIS SCRIPT NEVER RUNS ITS CHECKS IN THE AMBIENT TIMEZONE. It runs
//     them TWICE, as child processes, under TZ=UTC and TZ=Asia/Tokyo, and
//     requires the two runs to produce BYTE-IDENTICAL output. Two machines on
//     opposite sides of the planet agreeing on every string is the actual claim
//     being made: the zone is PINNED, not inherited. A run that produced the
//     right answers under one zone and different ones under the other would be
//     the unfixed app, and it would go red here.
//
// ==> AND IT RUNS THE SHIPPED FILES. Small dependency-free modules are compiled
//     and called directly. Functions that live inside a page, a component or a
//     route file (which cannot be imported here: Next.js allows only GET, POST
//     and friends to be exported from a route) are EXTRACTED FROM THE SHIPPED
//     SOURCE BY NAME and compiled. Nothing below restates a rule it checks,
//     because a check that retypes what it checks proves only that somebody can
//     type the same thing twice.
//
// ==> THE DATE-ONLY HALF IS A BEFORE-AND-AFTER MEASUREMENT, NOT A TRANSCRIPTION.
//     Four formatters must NOT move (ruling 4: a date picked as "Sep 14" still
//     reads "Sep 14"). The script pulls their OLD source out of git at 95ec986,
//     extracts them from the old file and the current one, runs both, and
//     requires identical output. The expectations are not literals somebody
//     typed from a previous run, so nobody can quietly re-baseline them.
//
//     THE SAME TRICK CARRIES THE ONE BEHAVIOUR CHANGE. The old isLockedUntil is
//     extracted and run beside the new one, so the unlock moving from midnight
//     UTC to midnight Central is shown as the two builds DISAGREEING on a real
//     instant, rather than asserted.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const BASE = "95ec986"; // the commit this session started from

// ---------------------------------------------------------------------------
// THE PARENT: run the checks twice, in two timezones, and compare.
// ---------------------------------------------------------------------------
if (!process.env.RELII_TZ_RUN) {
  const zones = ["UTC", "Asia/Tokyo"];
  const outputs = [];
  for (const tz of zones) {
    let out;
    try {
      out = execFileSync("node", [process.argv[1]], {
        env: { ...process.env, TZ: tz, RELII_TZ_RUN: tz },
        encoding: "utf8",
        stdio: ["inherit", "pipe", "inherit"],
      });
    } catch (err) {
      process.stdout.write(err.stdout ?? "");
      console.log(`\nTHE RUN UNDER TZ=${tz} FAILED. See above.`);
      process.exit(1);
    }
    outputs.push(out);
  }

  process.stdout.write(outputs[0]);
  console.log("");
  if (outputs[0] !== outputs[1]) {
    console.log(
      `THE TWO RUNS DISAGREE. TZ=${zones[0]} and TZ=${zones[1]} produced different\n` +
        `output, which means something below still reads the machine's own timezone.`,
    );
    console.log("--- TZ=" + zones[1] + " ---");
    process.stdout.write(outputs[1]);
    process.exit(1);
  }
  console.log(
    `Byte-identical under TZ=${zones[0]} and TZ=${zones[1]}, so nothing above reads\n` +
      `the machine's own timezone.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// THE CHILD: compile the shipped code and run the checks.
// ---------------------------------------------------------------------------
if (Intl.DateTimeFormat().resolvedOptions().timeZone === "America/Chicago") {
  console.log(
    "REFUSING TO RUN: the ambient timezone is America/Chicago, so these checks\n" +
      "could pass without the app pinning anything. Run the script without TZ set.",
  );
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "relii-apptime-"));
mkdirSync(join(work, "lib"), { recursive: true });
mkdirSync(join(work, "components"), { recursive: true });

// Whole modules, copied as shipped. Each is small and imports nothing outside
// lib/, which is why they can be run rather than read.
//
// ==> types.ts JOINED THIS LIST ON 2026-09-13, AND THE SCRIPT EARNED ITS KEEP
//     BY GOING RED FIRST. The display-fix bundle routed reset-history.tsx's
//     prior score through formatPoints(), which added an import of @/lib/types
//     to a component this script copies into a temp directory and compiles.
//     The rewrite turned it into ../lib/types, which was not there, and the run
//     died on TS2307 rather than on any behaviour. THE HARNESS INVARIANT ABOVE
//     STILL HOLDS: lib/types.ts imports nothing at all, by a rule stated in its
//     own header, so copying it drags nothing else in.
for (const f of ["app-time.ts", "available-date.ts", "date-taken.ts", "recording-download.ts", "types.ts"]) {
  writeFileSync(
    join(work, "lib", f),
    readFileSync(join(REPO, "lib", f), "utf8").replaceAll("@/lib/", "./"),
  );
}
writeFileSync(
  join(work, "components", "reset-history.tsx"),
  readFileSync(join(REPO, "components", "reset-history.tsx"), "utf8").replaceAll(
    "@/lib/",
    "../lib/",
  ),
);

// ---------------------------------------------------------------------------
// THE EXTRACTOR. Lifts one named function out of a source file.
// ---------------------------------------------------------------------------
// IT THROWS RATHER THAN RETURNING NOTHING when it does not find exactly one
// match. A regex that quietly matches nothing produces an empty module, every
// check against it fails to compile or trivially passes, and the result is a
// check that cannot fail wearing a new costume. If a function is renamed, this
// stops the run and says so.
function extract(source, name, where) {
  const pattern = new RegExp(`^(export )?function ${name}\\(`, "m");
  const hits = source.match(new RegExp(`^(export )?function ${name}\\(`, "gm")) ?? [];
  if (hits.length !== 1) {
    throw new Error(
      `EXTRACTION FAILED: expected exactly one "function ${name}(" in ${where}, found ${hits.length}.`,
    );
  }
  const start = source.search(pattern);
  const end = source.indexOf("\n}\n", start);
  if (end === -1) {
    throw new Error(`EXTRACTION FAILED: no closing brace for ${name} in ${where}.`);
  }
  return source.slice(start, end + 3).replace(/^export /, "");
}

function atBase(path) {
  return execFileSync("git", ["show", `${BASE}:${path}`], { cwd: REPO, encoding: "utf8" });
}
function now(path) {
  return readFileSync(join(REPO, path), "utf8");
}

const STUDENT_PAGE = "app/student/page.tsx";
const EDIT_FORM = "components/edit-assignment-form.tsx";
const AVAILABLE = "lib/available-date.ts";
const TRANSCRIPT = "app/api/instructor/submission/[id]/transcript/route.ts";
const SUBMISSION = "lib/instructor-submission.ts";
const CLASS_EXPORT = "lib/class-export.ts";

// The four date-only formatters, from the CURRENT files and from 95ec986.
// Named apart so both can be called in one process and compared.
const dateOnly = [
  ["dueStudent", STUDENT_PAGE, "formatDueDate"],
  ["dueForm", EDIT_FORM, "formatDueDate"],
  ["availableDate", AVAILABLE, "formatAvailableDate"],
  ["dateInput", EDIT_FORM, "toDateInputValue"],
];

// The CURRENT four always load: they are read from the working tree, so the
// checks that do not compare against the old build always run.
let dateOnlyModule = "";
for (const [alias, path, fn] of dateOnly) {
  dateOnlyModule +=
    extract(now(path), fn, path).replace(`function ${fn}(`, `export function new_${alias}(`) + "\n";
}

// ==> THE COMPARISON AGAINST 95ec986 IS THE ONE PART OF THIS SCRIPT THAT CAN
//     ROT, AND IT MUST NOT TAKE THE OTHER THIRTY-SIX CHECKS DOWN WITH IT. It
//     reaches into git history, so it stops working the day that commit becomes
//     unreachable (a shallow clone, a rewritten history, an export of the tree
//     without its .git). The failure would arrive as an EXTRACTION FAILED that
//     kills the whole run, and a reader a year from now would see a red script
//     and no idea which part actually broke.
//
//     SO A GIT FAILURE DEGRADES RATHER THAN KILLS: the before-and-after half is
//     SKIPPED, loudly and by name, and the skipped count is printed beside the
//     passing one so the total cannot quietly shrink. Everything measurable
//     without git still runs.
let baseReason = "";
let oldLockModule = "";
try {
  for (const [alias, path, fn] of dateOnly) {
    dateOnlyModule +=
      extract(atBase(path), fn, `${BASE}:${path}`).replace(
        `function ${fn}(`,
        `export function old_${alias}(`,
      ) + "\n";
  }
  oldLockModule = extract(atBase(AVAILABLE), "isLockedUntil", `${BASE}:${AVAILABLE}`).replace(
    "function isLockedUntil(",
    "export function oldIsLockedUntil(",
  );
} catch (err) {
  baseReason = String(err.message ?? err).split("\n")[0];
  // Stubs, so the file still compiles. Guarded by BASE_AVAILABLE below and
  // never called: they throw rather than returning a plausible answer, because
  // a stub that quietly returns something is how a skipped check becomes a
  // passing one.
  dateOnlyModule = "";
  for (const [alias, path, fn] of dateOnly) {
    dateOnlyModule +=
      extract(now(path), fn, path).replace(`function ${fn}(`, `export function new_${alias}(`) + "\n";
    dateOnlyModule +=
      `export function old_${alias}(_v: any): any { throw new Error("${BASE} unavailable"); }\n`;
  }
  oldLockModule =
    `export function oldIsLockedUntil(_v: any, _n?: number): boolean { throw new Error("${BASE} unavailable"); }`;
}

writeFileSync(join(work, "lib", "date-only.ts"), dateOnlyModule);
writeFileSync(join(work, "lib", "old-lock.ts"), oldLockModule);
writeFileSync(
  join(work, "lib", "base.ts"),
  `export const BASE_AVAILABLE = ${baseReason === "" ? "true" : "false"};\n` +
    `export const BASE_LABEL = ${JSON.stringify(BASE)};\n` +
    `export const BASE_REASON = ${JSON.stringify(baseReason)};\n`,
);

// The shipped functions that live inside a page or a route file.
writeFileSync(
  join(work, "lib", "lifted.ts"),
  `import { formatInstant, formatInstantShortDay, instantDayStamp } from "./app-time";\n\n` +
    extract(now(TRANSCRIPT), "formatDateTime", TRANSCRIPT).replace(
      "function formatDateTime(",
      "export function formatDateTime(",
    ) +
    "\n" +
    extract(now(STUDENT_PAGE), "formatShortDate", STUDENT_PAGE).replace(
      "function formatShortDate(",
      "export function formatShortDate(",
    ) +
    "\n" +
    extract(now(SUBMISSION), "fileDate", SUBMISSION).replace(
      "function fileDate(",
      "export function fileDate(",
    ) +
    "\n" +
    "export " +
    extract(now(CLASS_EXPORT), "classExportFilename", CLASS_EXPORT) +
    "\n",
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

const CHECK = String.raw`
import { renderToStaticMarkup } from "react-dom/server";
import {
  APP_TIME_ZONE,
  formatElapsed,
  formatInstant,
  formatInstantDay,
  instantDayStamp,
  startOfAppDay,
} from "./lib/app-time";
import { isLockedUntil, formatAvailableDate } from "./lib/available-date";
import { oldIsLockedUntil } from "./lib/old-lock";
import { formatDateTaken, dateTaken } from "./lib/date-taken";
import { recordingFileName } from "./lib/recording-download";
import { formatDateTime, formatShortDate, fileDate, classExportFilename } from "./lib/lifted";
import * as dateOnly from "./lib/date-only";
import { BASE_AVAILABLE, BASE_LABEL, BASE_REASON } from "./lib/base";
import { ResetHistory } from "./components/reset-history";

let ran = 0;
let failures = 0;
let skipped = 0;
// A SKIP IS PRINTED, COUNTED AND NAMED. A check that silently disappears is
// worse than one that fails, because the total still looks healthy.
function skip(name: string, why: string) {
  skipped += 1;
  console.log("  skip    " + name + "\n         " + why);
}
function check(name: string, got: unknown, want: unknown) {
  ran += 1;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(
    (ok ? "  ok  " : "  FAIL") + " " + String(ran).padStart(2) + ". " + name +
    (ok ? "  ->  " + JSON.stringify(got)
        : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)),
  );
}

const ms = (iso: string) => new Date(iso).getTime();

// The ambient zone goes to STDERR, not stdout: it is the one thing that is
// SUPPOSED to differ between the two runs, so it must stay out of the text the
// parent compares byte for byte.
console.error("  [running with ambient default " +
  Intl.DateTimeFormat().resolvedOptions().timeZone + "; the app pins " + APP_TIME_ZONE + "]");
console.log("");

// ---------------------------------------------------------------------------
console.log("");
console.log("A. A STORED TIMESTAMP READS CENTRAL, ACROSS BOTH CLOCK CHANGES.");
// ---------------------------------------------------------------------------
// 03:21 UTC is 10:21 PM the PREVIOUS DAY in Central. This is the exact instant
// the 4b proof run saved a review at, and the string the student was shown for
// it ("Sep 11, 2026, 3:21 AM") is the defect that opened this session.
check("the 4b review instant, 03:21Z, is the previous evening in Central",
  formatInstant("2026-09-11T03:21:00Z"), "Sep 10, 2026, 10:21 PM");
// The live discriminator: B1 session 0ae456b3, measured reading "11:47 PM" on
// the old build before this session changed anything.
check("B1 session 0ae456b3, stored 2026-09-03 23:47:11Z",
  formatInstant("2026-09-03T23:47:11Z"), "Sep 3, 2026, 6:47 PM");
check("December is standard time, so UTC-6 rather than UTC-5",
  formatInstant("2026-12-15T03:21:00Z"), "Dec 14, 2026, 9:21 PM");
// Nov 1 2026 is the fall-back. 1:00 to 2:00 AM Central happens TWICE, and the
// two instants an hour apart below are those two passes. Both format sensibly,
// and the hour before the change still reads as daylight time.
check("fall back, the hour before the change (still CDT)",
  formatInstant("2026-11-01T05:30:00Z"), "Nov 1, 2026, 12:30 AM");
check("fall back, 1:30 AM the FIRST time (CDT)",
  formatInstant("2026-11-01T06:30:00Z"), "Nov 1, 2026, 1:30 AM");
check("fall back, 1:30 AM the SECOND time, an hour later (CST)",
  formatInstant("2026-11-01T07:30:00Z"), "Nov 1, 2026, 1:30 AM");
// Mar 8 2026 is the spring forward: 2:00 AM Central does not exist that day.
check("spring forward, before the change (CST)",
  formatInstant("2026-03-08T07:30:00Z"), "Mar 8, 2026, 1:30 AM");
check("spring forward, an hour later the clock reads 3:30 not 2:30 (CDT)",
  formatInstant("2026-03-08T08:30:00Z"), "Mar 8, 2026, 3:30 AM");
check("one second before a Central day begins",
  formatInstant("2026-09-14T04:59:59Z"), "Sep 13, 2026, 11:59 PM");
check("the moment a Central day begins reads 12:00 AM, not 24:00",
  formatInstant("2026-09-14T05:00:00Z"), "Sep 14, 2026, 12:00 AM");
check("nothing stored formats as nothing", formatInstant(null), null);
check("an unreadable value formats as nothing, not \"Invalid Date\"",
  formatInstant("not a date"), null);

// ---------------------------------------------------------------------------
console.log("");
console.log("B. EVERY SHIPPED CALLER, RUN RATHER THAN READ.");
// ---------------------------------------------------------------------------
// lib/date-taken.ts feeds Date Taken, the "Reviewed by your instructor on"
// sentence, the instructor submission page and the CSV Status line.
check("formatDateTaken (lib/date-taken.ts)",
  formatDateTaken("2026-09-11T03:21:00Z"), "Sep 10, 2026, 10:21 PM");
check("dateTaken prefers submitted_at over created_at",
  dateTaken({ submitted_at: "2026-09-10T19:45:45Z", created_at: "2026-09-03T23:47:11Z" }),
  "Sep 10, 2026, 2:45 PM");
check("dateTaken falls back to created_at for a practice",
  dateTaken({ submitted_at: null, created_at: "2026-09-03T23:47:11Z" }),
  "Sep 3, 2026, 6:47 PM");
// The transcript download's file header. The value is B3 submission 4098e62d,
// which read "Sep 10, 2026, 7:45 PM" in the downloaded file on the old build.
check("formatDateTime (the transcript download header)",
  formatDateTime("2026-09-10T19:45:45.965Z"), "Sep 10, 2026, 2:45 PM");
// The student home's practice dates. 03:21Z is Sep 11 in UTC and Sep 10 in
// Central, so this check discriminates the two builds on the DAY, not the hour.
check("formatShortDate (student home practice dates)",
  formatShortDate("2026-09-11T03:21:00Z"), "Sep 10");
check("formatInstantDay (the admin class page's Created line)",
  formatInstantDay("2026-09-11T03:21:00Z"), "Sep 10, 2026");

// The reset history, rendered. Its " UTC" suffix is what ruling 2 removes, and
// the only way to measure a removal is to render the component and look.
const RESET_ROW = {
  id: "r1",
  student_id: "s1",
  student_email: "student@example.com",
  reset_type: "retake",
  prior_score_total: 32,
  prior_score_max: 200,
  created_at: "2026-09-11T03:21:00Z",
  instructor_email: "instructor@example.com",
  studentName: "A Student",
};
const resetHtml = renderToStaticMarkup(ResetHistory({ resets: [RESET_ROW] }) as any);
check("the reset history renders the Central time",
  resetHtml.includes("Sep 10, 2026, 10:21 PM"), true);
check("and the word UTC appears nowhere in it (ruling 2)",
  /UTC/.test(resetHtml) ? "UTC is still there" : "no UTC anywhere", "no UTC anywhere");

// ==> TWO CHECKS THAT ARE NOT ABOUT TIMEZONES, AND WHY THEY LIVE IN THE
//     TIMEZONE SCRIPT ANYWAY. The display fix of 2026-09-13 closed the second
//     of two raw-score leaks by routing this component's prior score through
//     formatPoints(). ResetHistory is stood up HERE and nowhere else in the
//     repo, and a second harness for one small component is a second harness to
//     drift out of step with the first.
//
//     THERE IS NO LIVE VENUE FOR THIS, WHICH IS WHY IT IS EXECUTED RATHER THAN
//     CLICKED. Every submission_resets row in the test classes points at an
//     assignment that has since been deleted, and the dashboard loads them with
//     .eq("assignment_id", selected.id), so not one of them can ever be
//     selected on screen. This render IS the proof, not a rehearsal for one.
const DUSTY_RESET = {
  ...RESET_ROW,
  id: "r2",
  prior_score_total: 62.50000000000001,
  prior_score_max: 100.00000000000001,
};
const dustyResetHtml = renderToStaticMarkup(ResetHistory({ resets: [DUSTY_RESET] }) as any);
check("the reset history's prior score is rounded to one decimal (leak 2 of 2)",
  dustyResetHtml.includes("(62.5 / 100)"), true);
check("and no float dust survives anywhere in the reset history markup",
  /\d\.\d{3,}/.test(dustyResetHtml) ? "dust is still there" : "no dust", "no dust");

// ---------------------------------------------------------------------------
// ==> formatElapsed. A DURATION, WHICH IS THE ONE THING IN THIS FILE THAT HAS
//     NO TIMEZONE. Added 2026-09-13 for the transcript timestamps.
//
//     IT IS CHECKED IN THIS SCRIPT FOR A REASON THAT IS NOT OBVIOUS. The script
//     already re-runs itself byte-for-byte under TZ=UTC and TZ=Asia/Tokyo, and
//     that comparison is the strongest available proof that this function never
//     reaches for APP_TIME_ZONE: a duration that quietly formatted through a
//     zone would still agree with itself here, but a duration built out of
//     LOCAL calendar parts would not. Nothing else in the repo would catch it.
const T0 = "2026-09-10T19:35:59.821Z";
check("the first turn reads 00:00, because it is measured against itself",
  formatElapsed(T0, T0), "00:00");
check("seconds only", formatElapsed(T0, "2026-09-10T19:36:07.000Z"), "00:07");
check("minutes and seconds", formatElapsed(T0, "2026-09-10T19:37:25.479Z"), "01:25");
check("it truncates rather than rounding, so a stamp never runs ahead of the clock",
  formatElapsed(T0, "2026-09-10T19:36:00.820Z"), "00:00");
check("it rolls to h:mm:ss past an hour and not before",
  [formatElapsed(T0, "2026-09-10T20:35:58.821Z"), formatElapsed(T0, "2026-09-10T20:36:00.821Z")],
  ["59:59", "1:00:01"]);
// A TEXT practice resumes across reloads onto ONE transcript, so this value is
// real rather than hypothetical. It renders as what it is; there is no
// per-sitting reset and inventing one would mean guessing.
check("a resumed practice renders a genuinely large elapsed value in full",
  formatElapsed(T0, "2026-09-12T01:14:30.821Z"), "29:38:31");
check("negatives clamp to 00:00 rather than printing a negative duration",
  formatElapsed("2026-09-10T19:36:10.000Z", T0), "00:00");
check("an unreadable value is null, matching formatInstant, so the caller drops the stamp",
  [formatElapsed("not a date", T0), formatElapsed(T0, "not a date"), formatElapsed(null, T0), formatElapsed(T0, "")],
  [null, null, null, null]);
// ==> THE NAMING RULE, MEASURED RATHER THAN TRUSTED. Every other export in
//     lib/app-time.ts means "a moment, rendered in US Central". This one does
//     not, and its name has to say so or the file's whole purpose fails.
check("the duration helper carries neither Instant nor Day in its name",
  /Instant|Day/.test(formatElapsed.name) ? "it does" : "it does not", "it does not");

// ---------------------------------------------------------------------------
console.log("");
console.log("C. FILENAMES CARRY THE CENTRAL DAY.");
// ---------------------------------------------------------------------------
// 03:00Z is 10:00 PM Central the previous day. A file named for the UTC day
// would be dated the 11th for work done on the evening of the 10th.
check("instantDayStamp at 22:00 Central",
  instantDayStamp(new Date("2026-09-11T03:00:00Z")), "2026-09-10");
check("fileDate, the submission download filename's date part",
  fileDate("2026-09-11T03:00:00Z"), "2026-09-10");
check("classExportFilename",
  classExportFilename("B1: A demo class", new Date("2026-09-11T03:00:00Z")),
  "relii-class-export-b1-a-demo-class-2026-09-10.csv");

// recordingFileName reads the clock itself, so the clock is frozen around the
// call rather than the rule being retyped here. 22:00 Central on the 10th.
const RealDate = Date;
class FrozenDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) super("2026-09-11T03:00:00Z");
    else super(...(args as [any]));
  }
}
(globalThis as any).Date = FrozenDate;
let recordingName: string;
try {
  recordingName = recordingFileName("relii-practice");
} finally {
  (globalThis as any).Date = RealDate;
}
check("recordingFileName, stamped at the moment of download",
  recordingName, "relii-practice-2026-09-10-2200.webm");

// ---------------------------------------------------------------------------
console.log("");
console.log("D. THE FOUR DATE-ONLY FORMATTERS DID NOT MOVE (RULING 4).");
// ---------------------------------------------------------------------------
// Each is run in BOTH its 95ec986 form and its current form. The expectation is
// the OLD BUILD'S OWN OUTPUT, not a literal somebody transcribed, so these
// cannot be quietly re-baselined.
const DATE_ONLY_INPUTS = [
  "2026-09-14T00:00:00Z", // an ordinary day
  "2026-03-08T00:00:00Z", // the spring-forward day
  "2026-11-01T00:00:00Z", // the fall-back day
  "2026-12-14T00:00:00Z", // standard time
  "2026-01-01T00:00:00Z", // a year boundary
];
const PAIRS: [string, (v: any) => unknown, (v: any) => unknown][] = [
  ["formatDueDate (app/student/page.tsx)", dateOnly.old_dueStudent, dateOnly.new_dueStudent],
  ["formatDueDate (components/edit-assignment-form.tsx)", dateOnly.old_dueForm, dateOnly.new_dueForm],
  ["formatAvailableDate (lib/available-date.ts)", dateOnly.old_availableDate, dateOnly.new_availableDate],
  ["toDateInputValue (components/edit-assignment-form.tsx)", dateOnly.old_dateInput, dateOnly.new_dateInput],
];
for (const [name, oldFn, newFn] of PAIRS) {
  if (!BASE_AVAILABLE) {
    skip(name + ", byte-identical to " + BASE_LABEL,
      "the " + BASE_LABEL + " comparison could not run: " + BASE_REASON);
    continue;
  }
  const before = DATE_ONLY_INPUTS.map((v) => oldFn(v));
  const after = DATE_ONLY_INPUTS.map((v) => newFn(v));
  check(name + ", byte-identical to " + BASE_LABEL, after, before);
}
// And the thing those four exist for, stated once as a value rather than a
// comparison: a day picked as Sep 14 still reads Sep 14.
check("a date picked as Sep 14 still reads Sep 14",
  dateOnly.new_dueStudent("2026-09-14T00:00:00Z"), "Sep 14, 2026");
check("and still fills the date picker as 2026-09-14",
  dateOnly.new_dateInput("2026-09-14T00:00:00Z"), "2026-09-14");

// ---------------------------------------------------------------------------
console.log("");
console.log("E. THE UNLOCK: 12:00 AM CENTRAL ON THE PICKED DAY.");
// ---------------------------------------------------------------------------
// Matched pairs. A refusal with no matching success measures nothing, so every
// locked instant below sits one second before an unlocked one.
check("Sep 14: locked at 04:59:59Z",
  isLockedUntil("2026-09-14T00:00:00Z", ms("2026-09-14T04:59:59Z")), true);
check("Sep 14: unlocked at 05:00:00Z",
  isLockedUntil("2026-09-14T00:00:00Z", ms("2026-09-14T05:00:00Z")), false);
check("Dec 14 (standard time): locked at 05:59:59Z",
  isLockedUntil("2026-12-14T00:00:00Z", ms("2026-12-14T05:59:59Z")), true);
check("Dec 14 (standard time): unlocked at 06:00:00Z",
  isLockedUntil("2026-12-14T00:00:00Z", ms("2026-12-14T06:00:00Z")), false);
// The two days the offset changes ON. Midnight Central on Mar 8 is still CST,
// because the clocks do not move until 2 AM; midnight on Nov 1 is still CDT for
// the same reason. A one-pass calculation gets one of these wrong.
check("the spring-forward day: locked at 05:59:59Z (midnight is still CST)",
  isLockedUntil("2026-03-08T00:00:00Z", ms("2026-03-08T05:59:59Z")), true);
check("the spring-forward day: unlocked at 06:00:00Z",
  isLockedUntil("2026-03-08T00:00:00Z", ms("2026-03-08T06:00:00Z")), false);
check("the fall-back day: locked at 04:59:59Z (midnight is still CDT)",
  isLockedUntil("2026-11-01T00:00:00Z", ms("2026-11-01T04:59:59Z")), true);
check("the fall-back day: unlocked at 05:00:00Z",
  isLockedUntil("2026-11-01T00:00:00Z", ms("2026-11-01T05:00:00Z")), false);
check("no available date means available now",
  isLockedUntil(null, ms("2026-09-14T00:00:00Z")), false);
check("an unreadable available date never locks anybody out",
  isLockedUntil("not a date", ms("2026-09-14T00:00:00Z")), false);

// THE BEHAVIOUR CHANGE, SHOWN AS A DISAGREEMENT BETWEEN THE TWO BUILDS rather
// than asserted. 2026-09-14T02:00:00Z is 9pm Central on the 13th: the old rule
// had already opened the assignment, the new one has not.
const EVENING_BEFORE = ms("2026-09-14T02:00:00Z");
if (BASE_AVAILABLE) {
  check(BASE_LABEL + " said an assignment dated Sep 14 was OPEN at 9pm Central on the 13th",
    oldIsLockedUntil("2026-09-14T00:00:00Z", EVENING_BEFORE), false);
} else {
  skip(BASE_LABEL + " said an assignment dated Sep 14 was OPEN at 9pm Central on the 13th",
    "the " + BASE_LABEL + " comparison could not run: " + BASE_REASON);
}
check("and it is now still LOCKED at that instant, which is the whole change",
  isLockedUntil("2026-09-14T00:00:00Z", EVENING_BEFORE), true);

// THE INVARIANT THE KICKOFF ASKS FOR IN WORDS: the date the student is shown
// and the moment the lock lifts name the SAME DAY. Checked as a property over
// every input above, so it holds for a legacy row too, not just for the pairs.
const agree = DATE_ONLY_INPUTS.map((v) => {
  const opensAt = startOfAppDay(v);
  return formatAvailableDate(v) === formatInstantDay(new Date(opensAt as number).toISOString());
});
check("the date shown and the day the lock lifts agree, on every input above",
  agree, DATE_ONLY_INPUTS.map(() => true));

console.log("");
if (failures > 0) {
  console.log(failures + " of " + ran + " CHECK(S) FAILED");
  process.exit(1);
}
console.log("All " + ran + " checks passed." +
  (skipped > 0 ? "  " + skipped + " SKIPPED, see above." : ""));
`;

writeFileSync(join(work, "check.tsx"), CHECK);
try {
  execFileSync(join(REPO, "node_modules/.bin/tsc"), ["-p", work], { stdio: "inherit" });
  execFileSync("node", [join(work, "out/check.js")], { stdio: "inherit" });
} finally {
  rmSync(work, { recursive: true, force: true });
}
