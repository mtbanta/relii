// PHASE 2b-1. The scorer's behavioural check, EXECUTED rather than reasoned about.
//
// ==> WHY THIS EXISTS AND WHY THE RUBRIC IN IT IS INVENTED.
//
//     Phase 2a shipped a row-scan bug that survived eight fixtures, because six
//     of them were built from Tom's real workbooks and both of those workbooks
//     happened to hide it. THE LESSON, and it is now a project rule: A FIXTURE
//     DERIVED FROM THE SAMPLES CAN ONLY EVER CONFIRM WHAT THE SAMPLES ALREADY
//     SHOW.
//
//     So the rubric below is built from nothing. Its six level names are Gold,
//     Silver, Bronze, Copper, Tin and Slag, which are deliberately NOTHING like
//     Tom's Excellent through Unsatisfactory: any code that quietly assumed his
//     names, or a fixed ladder, fails here instead of passing by luck. Its
//     points are not his either, and its BOTTOM rung is worth a half so that
//     "the fallback is not zero" and "half points survive" are the same
//     measurement rather than two hopeful ones. <==
//
// ==> IT DOES NOT CALL OPENAI. The model's reply is canned, which is the point:
//     the property under test is what the SERVER does with a reply, and a real
//     call would make the test non-deterministic and cost money to run. The
//     canned reply carries, on purpose, every malformed answer the scorer has to
//     survive: a level named in the wrong case, one padded with whitespace, one
//     that is not on the ladder at all, and a criterion the model simply forgot.
//
// HOW IT RUNS. lib/scoring.ts and lib/rubric-xlsx.ts are TypeScript and import
// each other through the "@/" path alias, which tsc does not rewrite in its
// output. So this script copies them into a scratch directory, rewrites that one
// alias to a relative path, drops in a stub for lib/openai.ts, compiles the lot
// with a standalone tsc, and runs the result on node. The rewrite is mechanical
// and is the ONLY edit made to the shipped source.
//
//   node scripts/check-scorer.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = process.cwd();
const work = mkdtempSync(join(tmpdir(), "relii-scorer-"));
mkdirSync(join(work, "lib"), { recursive: true });

// The shipped source, with "@/lib/x" rewritten to "./x". Nothing else changes.
for (const name of ["types.ts", "scoring.ts", "rubric-xlsx.ts"]) {
  const src = readFileSync(join(REPO, "lib", name), "utf8");
  writeFileSync(join(work, "lib", name), src.replaceAll("@/lib/", "./"));
}

// The stub. It returns whatever the test most recently queued, so one compiled
// build can serve every case below.
writeFileSync(
  join(work, "lib", "openai.ts"),
  `export let queued = "";
export function queue(reply: string) { queued = reply; }
export async function chatComplete(_opts: unknown): Promise<string> {
  return queued;
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
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: "out",
      },
      include: ["lib/**/*.ts", "check.ts"],
    },
    null,
    2,
  ),
);

// ---------------------------------------------------------------------------
// THE INVENTED RUBRIC. Six criteria, six levels, none of it Tom's.
// ---------------------------------------------------------------------------
// Every ladder here is HIGHEST FIRST, which is the order the parser produces and
// the order the scorer reads at both ends: points_max is the first entry and the
// fallback rung is the last one.
//
// The bottom rung of every criterion is a HALF and is never zero, which is what
// makes the fallback assertions below measure two things at once.
const LADDER = (top, second, third, fourth, fifth, bottom) => [
  { name: "Gold", descriptor: "Exemplary throughout.", points: top },
  { name: "Silver", descriptor: "Strong, with real specifics.", points: second },
  { name: "Bronze", descriptor: "Adequate but shallow.", points: third },
  { name: "Copper", descriptor: "Thin or generic.", points: fourth },
  { name: "Tin", descriptor: "Barely attempted.", points: fifth },
  { name: "Slag", descriptor: "Nothing to point at.", points: bottom },
];

const CRITERIA = [
  { id: "1-groundwork", name: "Groundwork", description: "Open the meeting and agree an agenda.", weight: 0.3, levels: LADDER(30, 25.5, 21, 16.5, 12, 4.5) },
  { id: "2-probing", name: "Probing", description: "Ask questions that uncover a real constraint.", weight: 0.25, levels: LADDER(25, 21, 17.5, 14, 10, 3.5) },
  { id: "3-framing", name: "Framing", description: "Connect what was heard to a specific outcome.", weight: 0.2, levels: LADDER(20, 17, 14, 11, 8, 2.5) },
  { id: "4-handling", name: "Handling", description: "Meet a stated objection without conceding the point.", weight: 0.15, levels: LADDER(15, 13, 10.5, 8, 6, 1.5) },
  { id: "5-manner", name: "Manner", description: "Hold a professional, unscripted tone.", weight: 0.05, levels: LADDER(5, 4.5, 3.5, 2.5, 2, 0.5) },
  { id: "6-overall", name: "Overall", description: "The impression the whole meeting leaves.", weight: 0.05, levels: LADDER(5, 4.5, 3.5, 2.5, 2, 0.5) },
];

// THE STATED MAXIMUM. Deliberately NOT the sum of the top rungs (which is 100),
// so a scorer that quietly derived a maximum by adding the criteria up would
// report 100 here and be caught.
const STATED_MAX = 96;

// The canned reply, carrying one of every malformed answer the scorer must
// survive. Criterion 5 is ABSENT on purpose.
const REPLY = JSON.stringify({
  items: [
    { id: "1-groundwork", level: "Silver", comment: "Set an agenda in the first turn." },
    { id: "2-probing", level: "bRoNzE", comment: "Asked, but did not follow up." },
    { id: "3-framing", level: "  Copper  ", comment: "Generic value statement." },
    { id: "4-handling", level: "Platinum", comment: "A level that does not exist." },
    // 5-manner is missing entirely.
    { id: "6-overall", level: "Gold", comment: "   " },
  ],
});

const CHECK = `
import { queue } from "./lib/openai";
import { scoreTranscriptAgainstRubric } from "./lib/scoring";
import { parseRubricXlsx } from "./lib/rubric-xlsx";
import { readFileSync } from "node:fs";
import type { RubricCriterion } from "./lib/types";

const CRITERIA: RubricCriterion[] = ${JSON.stringify(CRITERIA, null, 2)};
const STATED_MAX = ${STATED_MAX};
const REPLY = ${JSON.stringify(REPLY)};

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log((ok ? "  PASS  " : "  FAIL  ") + label +
    "   expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}
async function refuses(label: string, fn: () => Promise<unknown>, fragment: string) {
  let message = "(it did not throw)";
  try { await fn(); } catch (err) { message = (err as Error).message; }
  const ok = message.includes(fragment);
  if (!ok) failures += 1;
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + "   " + message);
}

async function main() {
  console.log("A. THE LOOKUP, against an invented rubric and a deliberately messy reply");
  queue(REPLY);
  const score = await scoreTranscriptAgainstRubric(
    [{ role: "student", text: "Thanks for making time.", at: "2026-09-10T00:00:00Z" }],
    CRITERIA, STATED_MAX, "Riley",
  );
  const by = new Map(score.items.map((i) => [i.id, i]));

  check("exact name matches",            [by.get("1-groundwork")!.level, by.get("1-groundwork")!.points_earned], ["Silver", 25.5]);
  check("wrong case still matches",      [by.get("2-probing")!.level,    by.get("2-probing")!.points_earned],    ["Bronze", 17.5]);
  check("padded name still matches",     [by.get("3-framing")!.level,    by.get("3-framing")!.points_earned],    ["Copper", 11]);

  // ==> THE TWO FALLBACK CASES. Both must land on the LAST rung of that
  //     criterion's own ladder, and neither may be 0.
  check("invented level -> bottom rung", [by.get("4-handling")!.level,   by.get("4-handling")!.points_earned],   ["Slag", 1.5]);
  check("omitted criterion -> bottom",   [by.get("5-manner")!.level,     by.get("5-manner")!.points_earned],     ["Slag", 0.5]);
  check("a fallback is never zero",      score.items.filter((i) => i.points_earned === 0).length, 0);

  check("empty comment gets a default",  by.get("6-overall")!.comment, "No evidence of this in the transcript.");
  check("every criterion is scored",     score.items.length, CRITERIA.length);
  check("rubric order is preserved",     score.items.map((i) => i.id), CRITERIA.map((c) => c.id));
  check("points_max is the top rung",    score.items.map((i) => i.points_max), [30, 25, 20, 15, 5, 5]);

  // ==> THE HALF POINT, MEASURED RATHER THAN HOPED FOR. 25.5 + 17.5 + 11 + 1.5
  //     + 0.5 + 5 = 61. Two of those addends carry a half and the sum does not,
  //     which is the case a stray Math.round() would still pass; so the item
  //     values are asserted individually above as well as in this total.
  check("the total is exact",            score.total, 61);
  check("max_total is the STATED one",   score.max_total, STATED_MAX);

  console.log("");
  console.log("B. THE REFUSALS. Each one is a rubric this scorer must not grade against.");
  queue(REPLY);
  await refuses("a legacy flat rubric (no levels)",
    () => scoreTranscriptAgainstRubric([], [{ id: "1-x", name: "X", description: "", weight: 1, levels: [] }] as unknown as RubricCriterion[], 100, "Riley"),
    "not a levels rubric");
  await refuses("no criteria at all",
    () => scoreTranscriptAgainstRubric([], [], 100, "Riley"),
    "no criteria");
  await refuses("no stated maximum",
    () => scoreTranscriptAgainstRubric([], CRITERIA, null as unknown as number, "Riley"),
    "does not state a maximum");
  await refuses("a scrambled ladder",
    () => scoreTranscriptAgainstRubric([], [{ ...CRITERIA[0], levels: [...CRITERIA[0].levels].reverse() }], 100, "Riley"),
    "out of order");

  console.log("");
  console.log("C. THE PARSER KEEPS TOM'S LEVEL DESCRIPTORS (Phase 2b-1 added this).");
  const real = readFileSync("${resolve(REPO, "docs/_Discovery-role-play-rubric-Sales-300-Fall-2026-copy.xlsx")}");
  const parsed = await parseRubricXlsx(real.buffer.slice(real.byteOffset, real.byteOffset + real.byteLength) as ArrayBuffer);
  if (!parsed.ok) {
    failures += 1;
    console.log("  FAIL  the real Discovery rubric no longer parses: " + parsed.error);
  } else {
    check("level names are unchanged", parsed.rubric.criteria[0].levels.map((l) => l.name),
      ["Excellent", "Proficient", "Developing", "Limited", "Minimal", "Unsatisfactory"]);
    check("descriptors are now stored", parsed.rubric.criteria[0].levels.map((l) => l.descriptor),
      ["Ready for an entry-level sales role.", "Emerging professional skills", "Growth opportunity",
       "Partially conducted this aspect", "Initial effort shown", "No effort shown or does not meet expectations"]);
    check("half points still parse", parsed.rubric.criteria[1].levels.map((l) => l.points),
      [55, 49.5, 44, 38.5, 27.5, 5.5]);
    check("the stated maximum still parses", parsed.rubric.maxTotal, 100);
  }

  console.log("");
  console.log(failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED");
  process.exit(failures === 0 ? 0 : 1);
}
main();
`;

writeFileSync(join(work, "check.ts"), CHECK);

try {
  execFileSync("npx", ["tsc", "-p", join(work, "tsconfig.json")], {
    cwd: REPO,
    stdio: "inherit",
  });
  execFileSync("node", [join(work, "out", "check.js")], { stdio: "inherit" });
} finally {
  rmSync(work, { recursive: true, force: true });
}
