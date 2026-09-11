// PHASE 3b. The AI Persona Framework list, EXECUTED rather than reasoned about.
//
// ==> WHY THIS EXISTS. Phase 3b has NO MIGRATION, so it has no SQL file anybody
//     runs and no migration report to read. A piece with no migration is not a
//     piece with no proof: this script is the artifact that takes its place.
//
//     It measures four things the live run cannot:
//
//       1. RULING 6. A chosen persona whose generation_fields are NULL still
//          appears in the list, still renders, and falls back to its title and
//          persona name. No such row exists in the database, and building one
//          would mean inventing production data. Here it is a fixture.
//       2. RULING 4, THE CAP. Chosen personas are never capped and undecided
//          pairs are capped at 8. Proving that live would mean generating nine
//          pairs against a paid API.
//       3. THE CHOSEN RULE, including the retained-loser case, which does not
//          exist anywhere in the database today.
//       4. THAT THE NEW PAIRING KEY MOVES NO STORED TEXT, by running the edit
//          route's own round-trip comparison with the key present.
//
// ==> WHY THE FIXTURES ARE NOT ABOUT SELLING. Phase 2a shipped a bug that
//     survived eight fixtures because six were built from Tom's real workbooks.
//     THE PROJECT RULE THAT CAME OUT OF IT: a fixture derived from the samples
//     can only ever confirm what the samples already show. So the personas below
//     are a LOCKSMITH and a KILN TECHNICIAN, with names nothing else in the
//     project uses, and the titles are deliberately the wrong shape in places so
//     that any code which starts reading a TITLE to decide state fails here.
//
// HOW IT RUNS, the same recipe check-rubric-render.mjs proved: it copies the
// SHIPPED source into a scratch directory, rewrites the "@/" path alias that
// tsc does not rewrite for itself, stubs the three modules that reach outside
// (the Supabase admin client, the OpenAI client, and Next's Link and router),
// compiles with a standalone tsc, and renders with react-dom. The alias rewrite
// and those stubs are the ONLY edits made to shipped source.
//
//   node scripts/check-persona-list.mjs
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
const work = mkdtempSync(join(tmpdir(), "relii-persona-"));
mkdirSync(join(work, "lib", "supabase"), { recursive: true });
mkdirSync(join(work, "components", "ui"), { recursive: true });

// "@/lib/x" becomes "./x" inside lib, and "../lib/x" inside components;
// "@/components/x" becomes "./x". Next's own modules become local stubs.
const libAlias = (s) => s.replaceAll('"@/lib/', '"./');
const compAlias = (s) =>
  s
    .replaceAll('"@/lib/', '"../lib/')
    .replaceAll('"@/components/', '"./')
    .replaceAll('"next/link"', '"./next-link"')
    .replaceAll('"next/navigation"', '"./next-navigation"');

const copy = (rel, rewrite) =>
  writeFileSync(
    join(work, rel),
    rewrite(readFileSync(join(REPO, rel), "utf8")),
  );

copy("lib/app-time.ts", libAlias);
copy("lib/persona-scaffold.ts", libAlias);
copy("lib/persona-assembly.ts", libAlias);
copy("lib/scaffold-candidates.ts", libAlias);
copy("components/ui/button.tsx", compAlias);
copy("components/persona-pairing.tsx", compAlias);
copy("components/persona-toggle.tsx", compAlias);
copy("components/chosen-persona-entry.tsx", compAlias);

// The three stubs. Each replaces a module that reaches OUTSIDE this check: a
// database, a paid API, and Next's runtime. None of them is on any path this
// check measures; every function under test here is pure or renders text.
writeFileSync(
  join(work, "lib", "supabase", "admin.ts"),
  "// Typed loosely on purpose: the check never reaches a database, so this\n" +
    "// stub only has to satisfy the compiler at the eleven call sites it has.\n" +
    "/* eslint-disable @typescript-eslint/no-explicit-any */\n" +
    "export function createAdminClient(): any {\n" +
    '  throw new Error("The persona list check never touches a database.");\n' +
    "}\n",
);
writeFileSync(
  join(work, "lib", "openai.ts"),
  "export async function chatComplete(..._args: unknown[]): Promise<any> {\n" +
    '  throw new Error("The persona list check never calls OpenAI.");\n' +
    "}\n",
);
writeFileSync(
  join(work, "components", "next-link.tsx"),
  'import type { ReactNode } from "react";\n' +
    "export default function Link(props: {\n" +
    "  href: string;\n" +
    "  className?: string;\n" +
    "  children: ReactNode;\n" +
    "}) {\n" +
    "  return (\n" +
    "    <a href={props.href} className={props.className}>\n" +
    "      {props.children}\n" +
    "    </a>\n" +
    "  );\n" +
    "}\n",
);
writeFileSync(
  join(work, "components", "next-navigation.ts"),
  "export function useRouter() {\n" +
    "  return { refresh() {}, push(_href: string) {} };\n" +
    "}\n",
);

// Where the shipped source lives, so the source-level checks can read it.
writeFileSync(
  join(work, "repo.ts"),
  "export const REPO = " + JSON.stringify(REPO) + ";\n",
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
      include: ["lib/**/*.ts", "components/**/*.tsx", "repo.ts", "check.tsx"],
    },
    null,
    2,
  ),
);

// NOTE ON THE TEXT BELOW: it is a String.raw template, so a dollar sign
// followed by a brace would still interpolate. Everything here uses string
// concatenation instead, exactly as check-rubric-render.mjs does.
const CHECK = String.raw`
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { REPO } from "./repo";
import {
  buildPersonaList,
  chosenRowOf,
  resolveChainForReassembly,
  GENERATION_FIELDS_VERSION,
  UNDECIDED_LIMIT,
} from "./lib/scaffold-candidates";
import type {
  CandidateRow,
  GenerationFields,
  ScenarioUsage,
} from "./lib/scaffold-candidates";
import { assembleScenario } from "./lib/persona-assembly";
import type {
  PersonaCandidate,
  ScaffoldInputs,
  ChainContext,
} from "./lib/persona-scaffold";
import { ChosenPersonaEntry } from "./components/chosen-persona-entry";

let ran = 0;
let failures = 0;
function check(n: number, what: string, passed: boolean, detail?: string) {
  ran += 1;
  if (passed) {
    console.log("  " + n + ". PASS  " + what);
  } else {
    failures += 1;
    console.log("  " + n + ". FAIL  " + what + (detail ? "  (" + detail + ")" : ""));
  }
}

const NO_USAGE = new Map<string, ScenarioUsage>();
const NO_TITLES = new Map<string, string[]>();

type RowOver = Partial<CandidateRow> & { id: string; generation_group_id: string };

function row(over: RowOver): CandidateRow {
  return {
    id: over.id,
    title: over.title ?? "Scaffold candidate 1 (gatekeeper): Wren, night locksmith",
    persona_name: over.persona_name ?? "Wren",
    meeting_type: over.meeting_type ?? "discovery",
    chain_role: over.chain_role ?? "gatekeeper",
    enabled: over.enabled ?? false,
    rubric_id: null,
    scenario_context: "context",
    persona_system_prompt: "prompt",
    generation_fields:
      over.generation_fields === undefined
        ? { version: 2, candidate_index: 1 }
        : over.generation_fields,
    generation_group_id: over.generation_group_id,
    created_at: over.created_at ?? "2026-01-01T00:00:00Z",
  };
}

console.log("");
console.log("A. WHICH ROW OF A GENERATION IS THE CHOSEN ONE");

// g1: one row, switched ON, no marker. The ordinary live case.
const g1 = [row({ id: "g1a", generation_group_id: "g1", enabled: true })];
// g2: THE RETAINED-LOSER CASE. A winner that was chosen and then switched off,
//     beside a losing candidate that survived the pick because something was
//     using it. No group of this shape exists in the database, which is exactly
//     why it is a fixture.
const g2 = [
  row({
    id: "g2winner",
    generation_group_id: "g2",
    persona_name: "Bracken",
    generation_fields: { version: 2, candidate_index: 1, chosen_at: "2026-02-02T10:00:00Z" },
  }),
  row({ id: "g2loser", generation_group_id: "g2", persona_name: "Thistle" }),
];
// g3: one row, off, no marker. A persona chosen BEFORE Phase 3b and later
//     switched off, which is what group cdf87d4f in the historical class is.
const g3 = [row({ id: "g3a", generation_group_id: "g3", persona_name: "Leveret" })];
// g4: two rows, off, no marker. A genuine undecided pair.
const g4 = [
  row({ id: "g4a", generation_group_id: "g4" }),
  row({ id: "g4b", generation_group_id: "g4", persona_name: "Sorrel" }),
];
// g5: TWO ROWS, OFF, NO MARKER, BUT BOTH CARRYING LIVE-SHAPED TITLES. Still
//     undecided. THIS IS THE CHECK THAT GOES RED IF ANYBODY MAKES THE TITLE
//     LOAD BEARING.
const g5 = [
  row({ id: "g5a", generation_group_id: "g5", title: "Discovery-Close: Wren (night locksmith)" }),
  row({ id: "g5b", generation_group_id: "g5", title: "Discovery-Close: Sorrel (kiln technician)", persona_name: "Sorrel" }),
];
// g6: ONE ROW, OFF, CARRYING A CANDIDATE-SHAPED TITLE. Still chosen, because a
//     group can only come down to one row by having been decided. The other
//     half of the same trap.
const g6 = [row({ id: "g6a", generation_group_id: "g6", persona_name: "Quill" })];

const ruleList = buildPersonaList([...g1, ...g2, ...g3, ...g4, ...g5, ...g6], NO_USAGE, NO_TITLES);
const chosenIds = ruleList.chosen.map((c) => c.row.id).sort();
const undecidedGroups = ruleList.undecided.map((u) => u.groupId).sort();

check(1, "a switched-ON persona is chosen",
  chosenIds.includes("g1a"));
check(2, "a switched-off persona carrying chosen_at is chosen",
  chosenIds.includes("g2winner"));
check(3, "the losing candidate beside it is NOT a chosen persona of its own",
  !chosenIds.includes("g2loser"));
check(4, "that losing candidate is carried under the winner instead",
  (ruleList.chosen.find((c) => c.row.id === "g2winner")?.retained ?? []).map((r) => r.id).join() === "g2loser");
check(5, "a switched-off persona alone in its group is chosen",
  chosenIds.includes("g3a"));
check(6, "a two-row group with nothing switched on is undecided",
  undecidedGroups.includes("g4"));
check(7, "a two-row group is STILL undecided when both titles look live",
  undecidedGroups.includes("g5"),
  "the title has become load bearing");
check(8, "a one-row group is STILL chosen when its title looks like a candidate",
  chosenIds.includes("g6a"),
  "the title has become load bearing");
check(9, "every group landed in exactly one of the two sections",
  ruleList.chosen.length + ruleList.undecided.length === 6,
  "chosen " + ruleList.chosen.length + ", undecided " + ruleList.undecided.length);
check(10, "chosenRowOf returns nothing for an undecided pair",
  chosenRowOf(g4) === null);

// The source of the rule itself, read from the SHIPPED file. A check on
// behaviour can be satisfied by a title test that happens to agree with the
// fixtures; this one cannot.
const shippedLib = readFileSync(join(REPO, "lib", "scaffold-candidates.ts"), "utf8");
const ruleStart = shippedLib.indexOf("export function chosenRowOf");
const ruleBody = shippedLib.slice(ruleStart, shippedLib.indexOf("\n}", ruleStart));
check(11, "the shipped chosen rule never reads a title",
  ruleStart > 0 && !ruleBody.includes("title") && !ruleBody.includes("-Close:") && !ruleBody.includes("Scaffold candidate"),
  "chosenRowOf mentions a title");

console.log("");
console.log("B. THE CAP: CHOSEN PERSONAS ARE NEVER CAPPED, CANDIDATE PAIRS ARE");

const capRows: CandidateRow[] = [];
// Twelve undecided pairs, newest last.
for (let i = 1; i <= 12; i += 1) {
  const day = i < 10 ? "0" + i : "" + i;
  capRows.push(row({ id: "u" + i + "a", generation_group_id: "u" + i, created_at: "2026-03-" + day + "T00:00:00Z" }));
  capRows.push(row({ id: "u" + i + "b", generation_group_id: "u" + i, persona_name: "Sorrel", created_at: "2026-03-" + day + "T00:00:00Z" }));
}
// Twelve chosen personas, ALL OLDER than every pair above. Under the old list
// every one of these would have fallen off the page.
for (let i = 1; i <= 12; i += 1) {
  const day = i < 10 ? "0" + i : "" + i;
  capRows.push(row({ id: "c" + i, generation_group_id: "cg" + i, persona_name: "Quill", created_at: "2020-01-" + day + "T00:00:00Z" }));
}
const capList = buildPersonaList(capRows, NO_USAGE, NO_TITLES);

check(12, "the cap is the shipped constant and it is 8",
  UNDECIDED_LIMIT === 8, "UNDECIDED_LIMIT is " + UNDECIDED_LIMIT);
check(13, "exactly 8 undecided pairs are returned out of 12",
  capList.undecided.length === 8, "got " + capList.undecided.length);
check(14, "they are the 8 MOST RECENT",
  capList.undecided[0].groupId === "u12" && capList.undecided[7].groupId === "u5",
  "newest " + capList.undecided[0].groupId + ", oldest " + capList.undecided[7].groupId);
check(15, "ALL 12 chosen personas are returned, none capped",
  capList.chosen.length === 12, "got " + capList.chosen.length);
check(16, "the oldest chosen persona of all is still listed",
  capList.chosen.some((c) => c.row.id === "c1"),
  "the oldest chosen persona fell off the list, which is the bug this fixes");
check(17, "the page is told which number to print in the cap sentence",
  capList.undecidedLimit === 8);

console.log("");
console.log("C. PAIRING, FROM ONE STORED ID, READ BOTH WAYS");

const gate = row({ id: "gate1", generation_group_id: "p1", persona_name: "Wren", enabled: true, chain_role: "gatekeeper" });
const maker = row({
  id: "maker1",
  generation_group_id: "p2",
  persona_name: "Bracken",
  enabled: true,
  chain_role: "decision_maker",
  created_at: "2026-04-01T00:00:00Z",
  generation_fields: { version: 2, candidate_index: 1, chain_from_scenario_id: "gate1" },
});
const orphanMaker = row({
  id: "maker2",
  generation_group_id: "p3",
  persona_name: "Thistle",
  enabled: true,
  chain_role: "decision_maker",
  generation_fields: { version: 2, candidate_index: 1, chain_from_scenario_id: "a-gatekeeper-that-was-discarded" },
});
const lonelyMaker = row({
  id: "maker3",
  generation_group_id: "p4",
  persona_name: "Leveret",
  enabled: true,
  chain_role: "decision_maker",
});
const pairList = buildPersonaList([gate, maker, orphanMaker, lonelyMaker], NO_USAGE, NO_TITLES);
const find = (id: string) => pairList.chosen.find((c) => c.row.id === id)?.row.pairedWith ?? null;

check(18, "the decision maker names the gatekeeper it came from",
  find("maker1")?.name === "Wren" && find("maker1")?.role === "gatekeeper");
check(19, "the gatekeeper names the decision maker built from it",
  find("gate1")?.name === "Bracken" && find("gate1")?.role === "decision_maker",
  "the reverse direction is not resolved");
check(20, "a dangling link shows UNPAIRED rather than erroring",
  find("maker2") === null);
check(21, "a decision maker that records no pair is unpaired",
  find("maker3") === null);

// A SWITCHED-OFF gatekeeper is still a row, so the pair still shows.
const offGate = row({ id: "gate1", generation_group_id: "p1", persona_name: "Wren", enabled: false, chain_role: "gatekeeper", generation_fields: { version: 2, candidate_index: 1, chosen_at: "2026-01-01T00:00:00Z" } });
const offList = buildPersonaList([offGate, maker], NO_USAGE, NO_TITLES);
const offFind = (id: string) => offList.chosen.find((c) => c.row.id === id)?.row.pairedWith ?? null;
check(22, "a switched-OFF gatekeeper still shows its pair",
  offFind("maker1")?.name === "Wren" && offFind("gate1")?.name === "Bracken");

console.log("");
console.log("D. RULING 6: A CHOSEN PERSONA WITH NO GENERATED DETAILS AT ALL");

// The shape a later Alex and Jordan import would have: a generation group id,
// so the hand-written refusal does not lock it out, and generation_fields NULL.
const imported = row({
  id: "import-alex",
  generation_group_id: "imported-pair",
  persona_name: "Alex",
  title: "Discovery-Close: Alex (procurement director)",
  chain_role: "gatekeeper",
  enabled: true,
  generation_fields: null,
});
const importedMaker = row({
  id: "import-jordan-maker",
  generation_group_id: "chained-onto-import",
  persona_name: "Jordan",
  title: "Presentation-Close: Jordan (plant manager)",
  chain_role: "decision_maker",
  enabled: true,
  generation_fields: { version: 2, candidate_index: 1, chain_from_scenario_id: "import-alex" },
});
const importedList = buildPersonaList([imported, importedMaker], NO_USAGE, new Map([["import-alex", ["Week 3 discovery call"]]]));
const importedEntry = importedList.chosen.find((c) => c.row.id === "import-alex");

check(23, "a persona with NULL generation_fields is listed as chosen",
  importedEntry !== undefined,
  "a future imported pair would be invisible on this page");
check(24, "its persona name falls back to the column",
  importedEntry?.row.personaName === "Alex");
check(25, "its title falls back to the column",
  importedEntry?.row.title === "Discovery-Close: Alex (procurement director)");
check(26, "it has no industry to show, and that is not an error",
  importedEntry?.industry === null);
check(27, "it can still be named as one half of a pair",
  importedEntry?.row.pairedWith?.name === "Jordan");

// THE RENDER. This is the shipped list entry, the shipped toggle and the
// shipped pairing line, not a copy of them.
let onHtml = "";
let renderThrew = "";
try {
  onHtml = renderToStaticMarkup(<ChosenPersonaEntry persona={importedEntry!} />);
} catch (error) {
  renderThrew = String(error);
}
check(28, "the list entry RENDERS for it, without throwing",
  renderThrew === "" && onHtml.length > 0, renderThrew);
check(29, "the rendered entry shows the persona name",
  onHtml.includes("Alex"));
check(30, "the rendered entry shows the title it fell back to",
  onHtml.includes("Discovery-Close: Alex (procurement director)"),
  "the title fallback is gone, so this persona renders unidentifiable");
check(31, "the rendered entry leaks no undefined or null into the page",
  !onHtml.includes("undefined") && !onHtml.includes("null"));
check(32, "the toggle renders it as chosen and ON",
  onHtml.includes("Chosen and ON") && onHtml.includes("Turn off"));
check(33, "the pairing line renders on it",
  onHtml.includes("Paired with the decision maker") && onHtml.includes("Jordan"));
check(34, "View Persona still points at its generation",
  onHtml.includes("/instructor/scaffold/compare/imported-pair"));

// The same persona switched OFF: the toggle has to offer the other direction.
//
// ==> THESE TWO GUARD THEIR OWN INPUT RATHER THAN ASSERTING IT. A check that
//     CRASHES is as bad as a check that cannot fail: the next person gets a
//     stack trace and no summary line, and has to work out for themselves which
//     checks ran. Both entries below are absent exactly when an earlier rule has
//     been broken, so they report a failure and let the run finish. <==
const importedOff = buildPersonaList(
  [{ ...imported, enabled: false }, importedMaker],
  NO_USAGE,
  NO_TITLES,
).chosen.find((c) => c.row.id === "import-alex");
const offHtml = importedOff
  ? renderToStaticMarkup(<ChosenPersonaEntry persona={importedOff} />)
  : "";
check(35, "switched off, the same entry offers Turn on",
  importedOff !== undefined && offHtml.includes("Chosen and OFF") && offHtml.includes("Turn on"),
  importedOff === undefined
    ? "it is no longer listed as chosen once it is switched off"
    : "a switched-off chosen persona could not be switched back on");

const lonelyEntry = buildPersonaList([lonelyMaker], NO_USAGE, NO_TITLES).chosen[0];
check(36, "an unpaired persona renders NO pairing line at all",
  lonelyEntry !== undefined &&
    !renderToStaticMarkup(<ChosenPersonaEntry persona={lonelyEntry} />).includes("Paired with"),
  lonelyEntry === undefined
    ? "the one-row rule is gone, so this persona is not listed as chosen at all"
    : "every existing persona would print a pairing line");

console.log("");
console.log("E. THE NEW PAIRING KEY MOVES NO STORED TEXT");

const candidate: PersonaCandidate = {
  persona_name: "Bracken",
  role: "kiln technician",
  company: { type: "community pottery", size: "40" },
  meeting_type: "presentation",
  chain_position: { position: "decision_maker", gates_access_to: null },
  win_condition: "Agree to a paid firing trial before the autumn term.",
  demeanor: ["blunt", "busy", "fond of detail"],
  decision_criteria: ["kiln uptime", "glaze consistency", "cost per firing"],
  hidden_facts: [
    { fact: "The old kiln", detail: "trips the breaker twice a week." },
    { fact: "The budget", detail: "was already spent on a wheel." },
    { fact: "The deadline", detail: "is the autumn open studio." },
  ],
  objections: ["We have no budget left.", "The last supplier vanished.", "Nobody here can recalibrate it."],
  earns_win: ["Name the breaker fault unprompted.", "Offer a trial with no purchase."],
  fails_win: ["Quote a price before hearing the fault.", "Promise a delivery date you cannot hold."],
};
const inputs: ScaffoldInputs = {
  industry: "ceramics",
  personaRole: "kiln technician",
  productOrService: "a replacement kiln controller",
  companySize: "40",
  chainPosition: "decision_maker",
  gatesAccessTo: "",
  winCondition: "Agree to a paid firing trial before the autumn term.",
  sellerCompanyType: "equipment supplier",
};
const chain: ChainContext = {
  gatekeeperName: "Wren",
  gatekeeperRole: "studio manager",
  companyType: "community pottery",
  companySize: "40",
  gatekeeperWinCondition: "Let the seller meet the kiln technician.",
};

// What the generate route stores today, and what it stores from Phase 3b on.
const without: GenerationFields = { version: 2, candidate_index: 1, candidate, inputs, chain };
const with_: GenerationFields = { ...without, chain_from_scenario_id: "gate1" };

// The text as it was SAVED, assembled from the fields that carry no key.
const saved = assembleScenario(candidate, inputs, chain);

// THE EDIT ROUTE'S OWN ROUND TRIP, run against the fields that DO carry the key.
// This is the comparison that would refuse an edit if the key had leaked into
// what the frozen template sees.
const resolved = resolveChainForReassembly("decision_maker", with_);
const rebuilt = resolved.ok
  ? assembleScenario(with_.candidate!, with_.inputs!, resolved.chain)
  : null;

check(37, "the chain still resolves with the new key stored beside it",
  resolved.ok, resolved.ok ? "" : resolved.reason);
check(38, "the briefing rebuilds BYTE FOR BYTE with the key present",
  rebuilt !== null && rebuilt.scenario_context === saved.scenario_context);
check(39, "the persona prompt rebuilds BYTE FOR BYTE with the key present",
  rebuilt !== null && rebuilt.persona_system_prompt === saved.persona_system_prompt);
check(40, "the resolved chain is the stored chain and nothing has been added to it",
  JSON.stringify(resolved.ok ? resolved.chain : null) === JSON.stringify(chain));
check(41, "a gatekeeper is still resolved as having no chain",
  (() => { const r = resolveChainForReassembly("gatekeeper", with_); return r.ok && r.chain === undefined; })());
check(42, "the stored version is NOT bumped, so existing candidates stay editable",
  GENERATION_FIELDS_VERSION === 2, "version is " + GENERATION_FIELDS_VERSION);

// The structural half, read from the SHIPPED generate route. The checks above
// prove the text does not move for THESE inputs; this one proves the key is not
// somewhere the template could ever reach.
const shippedGenerate = readFileSync(join(REPO, "app", "api", "instructor", "scaffold", "generate", "route.ts"), "utf8");
const chainLiteralStart = shippedGenerate.indexOf("    chain = {");
const chainLiteral = shippedGenerate.slice(chainLiteralStart, shippedGenerate.indexOf("\n    };", chainLiteralStart));
check(43, "the gatekeeper id is NOT inside the chain the template is handed",
  chainLiteralStart > 0 && !chainLiteral.includes("chain_from_scenario_id"),
  "the id has moved inside ChainContext, which changes every assembled text");
check(44, "the template is still called with the candidate, the inputs and the chain only",
  shippedGenerate.includes("assembleScenario(candidate, inputs, chain)"),
  "the assembleScenario call has changed shape");

console.log("");
if (failures > 0) {
  console.log(failures + " of " + ran + " CHECK(S) FAILED");
  process.exit(1);
}
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
