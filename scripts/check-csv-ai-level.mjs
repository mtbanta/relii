// PHASE 4b. THE CSV'S "AI level" COLUMN, EXECUTED RATHER THAN REASONED ABOUT.
//
// ==> WHY THIS EXISTS. The column has four branches and exactly one of them
//     cannot be reached on the live site: a submission marked REVIEWED with no
//     AI original on record. 4a's editor refuses to create it and 4a's retake
//     refuses to leave it behind, so producing one on relii.vercel.app would
//     mean deleting an audit row, and this project's audit rows carry no
//     foreign key precisely so that nothing can delete them.
//
//     THE LIVE RUN THEREFORE PROVES THREE BRANCHES AND THIS FILE PROVES FOUR.
//     Neither replaces the other, and the shape of that gap is written down
//     rather than quietly rounded off.
//
// ==> AND IT RUNS THE SHIPPED FILE, NOT A COPY OF THE RULE. lib/submission-ai-
//     level.ts is compiled here and called. A check that retypes the logic it
//     is checking proves only that somebody can type the same thing twice.
//
//   node scripts/check-csv-ai-level.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
const work = mkdtempSync(join(tmpdir(), "relii-ailevel-"));
mkdirSync(join(work, "lib"), { recursive: true });

for (const f of ["types.ts", "submission-ai-level.ts"]) {
  writeFileSync(
    join(work, "lib", f),
    readFileSync(join(REPO, "lib", f), "utf8").replaceAll("@/lib/", "./"),
  );
}
symlinkSync(join(REPO, "node_modules"), join(work, "node_modules"), "dir");
writeFileSync(
  join(work, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2021", module: "CommonJS", moduleResolution: "node",
      strict: true, esModuleInterop: true, skipLibCheck: true,
      lib: ["ES2021"], outDir: "out",
    },
    include: ["lib/**/*.ts", "check.ts"],
  }, null, 2),
);

const CHECK = String.raw`
import { aiLevelFor } from "./lib/submission-ai-level";
import type { ScoreItem, SessionScore } from "./lib/types";

const line = (id: string, level: string | undefined, by: "ai" | "instructor"): ScoreItem => ({
  id,
  ...(level === undefined ? {} : { level }),
  points_earned: 1,
  points_max: 10,
  comment: "c",
  scored_by: by,
});

// The stored score AFTER a review: the instructor raised "close".
const STORED_REVIEWED = line("close", "Minimal", "instructor");
// The stored score with nobody having touched it.
const STORED_FRESH = line("close", "Unsatisfactory", "ai");
// What the AI actually said.
const ORIGINAL: SessionScore = {
  total: 3, max_total: 30, items: [line("close", "Unsatisfactory", "ai")],
};
// An original that somehow has no line for this criterion.
const ORIGINAL_MISSING_LINE: SessionScore = {
  total: 0, max_total: 30, items: [line("approach", "Excellent", "ai")],
};
const WHEN = "2026-09-11T03:21:00Z";

let failures = 0, ran = 0;
function check(what: string, got: string, want: string) {
  ran++;
  const pass = got === want;
  if (!pass) failures++;
  console.log(String(ran).padStart(2) + "  " + (pass ? "PASSED" : "FAILED") + "  " + what +
    (pass ? "" : "\n      got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want)));
}

// 1. ORIGINAL ON RECORD. The column is the AI's, never the level in force.
check("reviewed, original on record: the AI's own level, NOT the instructor's",
  aiLevelFor({ item: STORED_REVIEWED, original: ORIGINAL, reviewedAt: WHEN, unreadable: false }),
  "Unsatisfactory");
check("and it does not leak the instructor's level into the column",
  aiLevelFor({ item: STORED_REVIEWED, original: ORIGINAL, reviewedAt: WHEN, unreadable: false }) === "Minimal" ? "LEAKED" : "clean",
  "clean");

// 2. NO ORIGINAL, NOT REVIEWED. An unreviewed score IS the AI's.
check("not reviewed, no original: equals the stored level, because that IS the AI's",
  aiLevelFor({ item: STORED_FRESH, original: null, reviewedAt: null, unreadable: false }),
  "Unsatisfactory");

// 3. THE BRANCH THE LIVE RUN CANNOT REACH. Reviewed, nothing on record.
check("REVIEWED WITH NO ORIGINAL: blank, never the level in force",
  aiLevelFor({ item: STORED_REVIEWED, original: null, reviewedAt: WHEN, unreadable: false }),
  "");

// 4. THE READ FAILED. Different fact from "there is nothing", same honest cell.
check("unreadable, not reviewed: blank rather than the stored level",
  aiLevelFor({ item: STORED_FRESH, original: null, reviewedAt: null, unreadable: true }),
  "");
check("unreadable, reviewed: blank",
  aiLevelFor({ item: STORED_REVIEWED, original: null, reviewedAt: WHEN, unreadable: true }),
  "");

// 5. THE SHAPES THAT HAVE BITTEN THIS PROJECT BEFORE.
check("an original with no line for this criterion: blank, not the stored level",
  aiLevelFor({ item: STORED_REVIEWED, original: ORIGINAL_MISSING_LINE, reviewedAt: WHEN, unreadable: false }),
  "");
check("a score that predates ScoreItem.level, unreviewed: blank, like the Level column beside it",
  aiLevelFor({ item: line("close", undefined, "ai"), original: null, reviewedAt: null, unreadable: false }),
  "");
check("an original whose line predates ScoreItem.level: blank",
  aiLevelFor({
    item: STORED_REVIEWED,
    original: { total: 0, max_total: 30, items: [line("close", undefined, "ai")] },
    reviewedAt: WHEN, unreadable: false }),
  "");
// An original is ALWAYS preferred, even when reviewedAt is somehow null. This is
// the state 4a's matched-pair saves leave behind, and there the two answers
// agree anyway, so preferring the original costs nothing and cannot mislead.
check("original on record but reviewed_at null: still the original's level",
  aiLevelFor({ item: STORED_FRESH, original: ORIGINAL, reviewedAt: null, unreadable: false }),
  "Unsatisfactory");

console.log("");
if (failures > 0) { console.log(failures + " of " + ran + " CHECK(S) FAILED"); process.exit(1); }
console.log("All " + ran + " checks passed.");
`;

writeFileSync(join(work, "check.ts"), CHECK);
try {
  execFileSync(join(REPO, "node_modules/.bin/tsc"), ["-p", work], { stdio: "inherit" });
  execFileSync("node", [join(work, "out/check.js")], { stdio: "inherit" });
} finally {
  rmSync(work, { recursive: true, force: true });
}
