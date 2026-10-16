// V1. DOES THE SCORER GIVE THE SAME GRADE TWICE. A MEASUREMENT, NOT A CHECK.
//
// ==> THIS IS NOT ONE OF THE FIVE STANDING CHECK SCRIPTS AND MUST NOT BE RUN AS
//     ONE. Every other scripts/check-*.mjs is free, offline and deterministic.
//     This one READS LIVE ROWS from Supabase with the service-role key and SPENDS
//     MONEY at OpenAI: five real scoring calls per submission. Run it on purpose,
//     with the owner's say-so, and record what it printed. <==
//
// WHAT IT MEASURES. lib/scoring.ts claims that temperature 0 and a fixed seed
// give the same levels for the same transcript. This scores one stored
// transcript five times through the SHIPPED scorer and prints, per criterion,
// the level every run chose, with each run's total and system_fingerprint. The
// first record of it is the V1 entry in PROJECT_STATE, 2026-10-15.
//
// HOW IT RUNS. The scripts/check-scorer.mjs pattern with two changes. It copies
// lib/types.ts, lib/scoring.ts and the REAL lib/openai.ts (not a stub), verbatim,
// into a scratch directory and compiles them with a standalone tsc, then loads the
// result into THIS process instead of generating a check file. That keeps the
// reads, the guards and the scoring in one place, and it means no row is ever
// written into a file: the transcript exists only in memory.
//
// ==> NOTHING HERE MAY WRITE ANYWHERE, AND THAT IS ENFORCED RATHER THAN PROMISED.
//     The service-role key bypasses Row Level Security completely, so the only
//     thing between this script and the database is the script. Every request it
//     makes, its own reads and the scorer's OpenAI call alike, goes through one
//     gatekeeper: GET to Supabase's REST API, POST to OpenAI's chat endpoint
//     (never under --dry-run), and nothing else at all. <==
//
// ==> ONLY instructor@test.com's CLASSES, CHECKED BEFORE ANY TRANSCRIPT IS READ.
//     Each id is resolved session, assignment, class, owner's email, and the
//     script exits non-zero unless every owner is instructor@test.com. Never
//     Tom's class, never Ashley Ward's ICSC class, never a real student. <==
//
// The runs are INTERLEAVED (A, B, A, B, ...) and strictly one at a time, so each
// submission's runs span the whole session and any backend drift lands on all of
// them alike. A refusal to score is a RESULT: it is recorded and the next run
// starts. An OpenAI error (a rate limit, say) is counted apart from refusals.
//
//   node scripts/check-scorer-determinism.mjs <session-id> [<session-id> ...] [--dry-run]
//
// --dry-run does everything up to the first OpenAI call, including building the
// scorer's real request, and the gatekeeper refuses that call.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REPO = process.cwd();
const RUNS = 5;
const TEST_OWNER = "instructor@test.com";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ids = args.filter((a) => !a.startsWith("--"));
const badFlags = args.filter((a) => a.startsWith("--") && a !== "--dry-run");
if (ids.length === 0 || badFlags.length > 0 || ids.some((id) => !UUID.test(id)) || new Set(ids).size !== ids.length) {
  console.error("Usage: node scripts/check-scorer-determinism.mjs <session-id> [<session-id> ...] [--dry-run]");
  console.error("Each id is a full UUID written out whole, and each appears once.");
  process.exit(2);
}

const sha = (text) => createHash("sha256").update(text).digest("hex");
const central = (d) =>
  d.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "medium" }) + " Central";

// ---------------------------------------------------------------------------
// THE ENVIRONMENT. .env.local WINS OVER THE SHELL, ON PURPOSE: the owner
// confirmed the model against production from what this file says, so nothing
// else may decide it. A blank value stays blank, exactly as Next.js loads it,
// so getModel() falls back the same way it does in the app.
// ---------------------------------------------------------------------------
for (const line of readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let value = m[2].trim();
  if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
  process.env[m[1]] = value;
}
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"]) {
  if (!process.env[name]) {
    console.error(`${name} is missing from .env.local.`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// THE GATEKEEPER. Every fetch in this process goes through here, the scorer's
// included, because the compiled lib/openai.ts calls the bare global fetch.
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;
const SUPABASE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const MAX_OPENAI_CALLS = RUNS * ids.length;
const traffic = { supabaseReads: 0, openaiCalls: 0 };
// What the gatekeeper saw of the most recent OpenAI call. Reset before each run,
// so a run that refuses to score still keeps its own fingerprint.
let capture = null;

async function gatekeeper(input, init = {}) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

  if (url.origin === SUPABASE_ORIGIN) {
    if ((method === "GET" || method === "HEAD") && url.pathname.startsWith("/rest/v1/")) {
      traffic.supabaseReads += 1;
      return realFetch(input, init);
    }
    throw new Error(`REFUSED: ${method} ${url.pathname} on Supabase. This script only reads.`);
  }

  if (url.href === OPENAI_URL && method === "POST") {
    const sent = typeof init.body === "string" ? init.body : "";
    capture = { request: sent };
    if (DRY_RUN) throw new Error("REFUSED: an OpenAI call under --dry-run.");
    if (traffic.openaiCalls >= MAX_OPENAI_CALLS) {
      throw new Error(`REFUSED: more than ${MAX_OPENAI_CALLS} OpenAI calls.`);
    }
    traffic.openaiCalls += 1;
    const res = await realFetch(input, init);
    // ==> CAPTURE ONLY, FROM A CLONE. chatComplete reads the ORIGINAL body with
    //     res.json(), and a body can be read once, so this reads res.clone()
    //     and hands back the untouched original. Nothing here can change what
    //     the scorer sees, and a failure to capture is recorded, not thrown. <==
    capture.status = res.status;
    try {
      capture.reply = await res.clone().text();
    } catch (err) {
      capture.captureError = err instanceof Error ? err.message : String(err);
    }
    return res;
  }

  throw new Error(`REFUSED: ${method} ${url.origin}. This script talks to Supabase (reads) and OpenAI only.`);
}
globalThis.fetch = gatekeeper;

// What one OpenAI exchange says about itself. The reply's id and timestamp
// differ on every call, so "were the answers identical" hashes the model's
// message content only.
function readCapture(c) {
  const out = { fingerprint: null, model: null, usage: null, replyHash: null, rawLevels: {}, sent: null };
  if (!c) return out;
  try {
    const body = JSON.parse(c.request);
    out.sent = { model: body.model, temperature: body.temperature, seed: body.seed, bytes: c.request.length, hash: sha(c.request) };
  } catch {
    // An unparseable request would show up as a missing "sent" line.
  }
  if (typeof c.reply !== "string") return out;
  try {
    const body = JSON.parse(c.reply);
    out.fingerprint = body.system_fingerprint ?? null;
    out.model = body.model ?? null;
    out.usage = body.usage ?? null;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      out.replyHash = sha(content);
      for (const item of JSON.parse(content).items ?? []) {
        if (item && typeof item.id === "string") out.rawLevels[item.id] = item.level;
      }
    }
  } catch {
    // A reply that is not JSON is the scorer's to refuse, and it will say so.
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE CLASS GUARD. Resolves an id to its class and owner and decides, before
// anything else about that session is read. Any missing link fails closed.
// ---------------------------------------------------------------------------
const ownerIsTest = (email) => email === TEST_OWNER;

async function resolveClass(db, id) {
  const refuse = (why, extra = {}) => ({ ok: false, id, why, ...extra });
  const { data: session, error: e1 } = await db
    .from("sessions").select("id, kind, status, assignment_id, class_id, scenario_id").eq("id", id).maybeSingle();
  if (e1) return refuse(`the sessions read failed: ${e1.message}`);
  if (!session) return refuse("no session has this id");
  if (!session.assignment_id) return refuse("the session has no assignment, so no class");

  const { data: assignment, error: e2 } = await db
    .from("assignments").select("id, title, class_id, rubric_id").eq("id", session.assignment_id).maybeSingle();
  if (e2) return refuse(`the assignments read failed: ${e2.message}`);
  if (!assignment || !assignment.class_id) return refuse("the session's assignment or its class is missing");
  if (session.class_id !== assignment.class_id) {
    return refuse(`the session's class ${session.class_id} and its assignment's class ${assignment.class_id} disagree`);
  }

  const { data: klass, error: e3 } = await db
    .from("classes").select("id, name, instructor_id").eq("id", assignment.class_id).maybeSingle();
  if (e3) return refuse(`the classes read failed: ${e3.message}`);
  if (!klass) return refuse("the class is missing");

  const { data: owner, error: e4 } = await db.from("profiles").select("email").eq("id", klass.instructor_id).maybeSingle();
  if (e4) return refuse(`the profiles read failed: ${e4.message}`, { klass });
  const ownerEmail = owner?.email ?? null;
  if (!ownerIsTest(ownerEmail)) {
    return refuse(`the class owner is ${ownerEmail ?? "(not found)"}, not ${TEST_OWNER}`, { klass, ownerEmail });
  }
  return { ok: true, id, session, assignment, klass, ownerEmail };
}

// The scorer's inputs, assembled exactly as app/api/session/end/route.ts does.
async function readInputs(db, g) {
  const one = async (query, what) => {
    const { data, error } = await query;
    if (error) throw new Error(`the ${what} read failed: ${error.message}`);
    return data;
  };
  const s = await one(db.from("sessions").select("transcript, score, scored_at").eq("id", g.id).single(), "sessions");
  const ai = await one(
    db.from("submission_ai_scores").select("score").eq("session_id", g.id).maybeSingle(), "submission_ai_scores");
  const rubric = await one(
    db.from("rubrics").select("id, name, items, max_total, created_at").eq("id", g.assignment.rubric_id).maybeSingle(),
    "rubrics");
  const scenario = await one(
    db.from("scenarios").select("persona_name").eq("id", g.session.scenario_id).maybeSingle(), "scenarios");
  if (!rubric) throw new Error("the assignment has no rubric, so there is nothing to score");
  if (!scenario) throw new Error("the session's scenario is missing");

  // The reference is what the AI said. An instructor's override changes the
  // stored score, and submission_ai_scores keeps the AI's original beside it.
  const reference = ai?.score ?? s.score ?? null;
  const refItems = new Map((reference?.items ?? []).map((i) => [i.id, i]));
  return {
    transcript: s.transcript ?? [],
    criteria: rubric.items ?? [],
    // Number() at the boundary, as the route does: a Postgres numeric can
    // arrive as a string, and the scorer refuses anything that is not a number.
    maxTotal: Number(rubric.max_total),
    maxTotalArrivedAs: typeof rubric.max_total,
    personaName: scenario.persona_name ?? "the customer",
    rubric,
    scoredAt: s.scored_at,
    reference,
    refItems,
    referenceSource: ai ? "the AI's original, from submission_ai_scores (an instructor has since reviewed it)" : "sessions.score",
  };
}

// ---------------------------------------------------------------------------
// THE REPORT.
// ---------------------------------------------------------------------------
function table(rows) {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => String(r[col]).length)));
  return rows.map((r) => "    " + r.map((cell, col) => String(cell).padEnd(widths[col])).join("  ").trimEnd()).join("\n");
}

function reportSubject(t, mine) {
  const scored = mine.filter((r) => r.outcome === "scored");
  console.log("");
  console.log(`${t.label}. ${t.id}`);
  console.log(`   ${t.g.klass.name}, "${t.g.assignment.title}", persona ${t.personaName}, ${t.transcript.length} turns`);
  console.log(`   rubric "${t.rubric.name}", ${t.criteria.length} criteria, max ${t.maxTotal}`);

  const rows = [["criterion", ...mine.map((r) => `run ${r.round}`), "reference", "all agree", "rungs apart"]];
  for (const c of t.criteria) {
    const chosen = scored.map((r) => r.levels[c.id]);
    const distinct = new Set(chosen);
    const rungs = chosen.map((name) => c.levels.findIndex((l) => l.name === name));
    rows.push([
      c.name,
      ...mine.map((r) => (r.outcome === "scored" ? r.levels[c.id] : `(${r.outcome})`)),
      t.refItems.get(c.id)?.level ?? "(none)",
      chosen.length === 0 ? "n/a" : distinct.size === 1 ? (chosen.length === mine.length ? "yes" : `yes, of ${chosen.length}`) : `NO, ${distinct.size} levels`,
      chosen.length === 0 ? "n/a" : Math.max(...rungs) - Math.min(...rungs),
    ]);
  }
  console.log(table(rows));

  const totals = scored.map((r) => r.total);
  console.log(`   totals, run by run: ${mine.map((r) => (r.outcome === "scored" ? r.total : `(${r.outcome})`)).join(", ")}`);
  if (totals.length > 0) {
    const lo = Math.min(...totals);
    const hi = Math.max(...totals);
    console.log(`   lowest ${lo}, highest ${hi}, range ${hi - lo} (of ${t.maxTotal})`);
  }
  console.log(`   reference total ${t.reference?.total ?? "(none)"}, from ${t.referenceSource}, scored ${t.scoredAt}`);
  console.log(`   system_fingerprint, run by run: ${mine.map((r) => r.fingerprint ?? "null").join(", ")}`);
  console.log(`   distinct fingerprints: ${new Set(mine.map((r) => r.fingerprint ?? "null")).size}`);
  console.log(`   model reported back: ${[...new Set(mine.map((r) => r.model ?? "null"))].join(", ")}`);
  console.log(`   distinct requests sent: ${new Set(mine.map((r) => r.sent?.hash ?? "none")).size}`
    + `, distinct replies received: ${new Set(scored.map((r) => r.replyHash ?? "none")).size} of ${scored.length} scored`);
  const echoed = mine.flatMap((r) => Object.entries(r.rawLevels)
    .filter(([id, raw]) => r.levels[id] !== undefined && raw !== r.levels[id])
    .map(([id, raw]) => `run ${r.round} ${id}: ${JSON.stringify(raw)}`));
  console.log(`   raw level strings that were not the bare name: ${echoed.length === 0 ? "none" : echoed.join("; ")}`);
  const refused = mine.filter((r) => r.outcome === "refused");
  const errored = mine.filter((r) => r.outcome === "openai-error");
  console.log(`   refused to score: ${refused.length}${refused.map((r) => `\n     run ${r.round}: ${r.error}`).join("")}`);
  console.log(`   OpenAI errors: ${errored.length}${errored.map((r) => `\n     run ${r.round}: ${r.error.slice(0, 300)}`).join("")}`);
}

// ---------------------------------------------------------------------------
// MAIN.
// ---------------------------------------------------------------------------
const work = mkdtempSync(join(tmpdir(), "relii-determinism-"));

async function main() {
  console.log(DRY_RUN ? "V1 DETERMINISM, DRY RUN: no OpenAI call will be made." : "V1 DETERMINISM, LIVE RUN.");
  console.log(`OPENAI_MODEL in .env.local: ${process.env.OPENAI_MODEL === undefined ? "(absent)" : JSON.stringify(process.env.OPENAI_MODEL)}`);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: gatekeeper },
  });

  console.log("");
  console.log("THE CLASS GUARD");
  const guards = [];
  for (const id of ids) {
    const g = await resolveClass(db, id);
    console.log(`  ${id}: class ${g.klass ? `"${g.klass.name}" (${g.klass.id})` : "(unresolved)"}, owner ${g.ownerEmail ?? "(not found)"}, ${g.ok ? "ALLOWED" : `REFUSED: ${g.why}`}`);
    guards.push(g);
  }
  if (traffic.supabaseReads === 0) {
    console.log("  FAIL: the reads did not pass through the gatekeeper, so it is not guarding anything.");
    return 1;
  }
  if (guards.some((g) => !g.ok)) {
    console.log("  Stopping before any transcript is read.");
    return 1;
  }

  const subjects = [];
  for (const [index, g] of guards.entries()) {
    subjects.push({ label: String.fromCharCode(65 + index), id: g.id, g, ...(await readInputs(db, g)) });
  }

  console.log("");
  console.log("THE SHIPPED SCORER, COPIED AND COMPILED");
  mkdirSync(join(work, "lib"), { recursive: true });
  // ==> COPIED VERBATIM, WITH NO ALIAS REWRITE, SO WHAT RUNS IS BYTE-IDENTICAL
  //     TO WHAT SHIPS. scoring.ts imports "./openai" and "./types", never
  //     "@/lib/". The string does appear in it, inside a comment, so the
  //     check-scorer.mjs rewrite would have edited that comment and nothing
  //     else. If an "@/lib/" import is ever added, tsc fails here, loudly. <==
  for (const name of ["types.ts", "scoring.ts", "openai.ts"]) {
    const shipped = readFileSync(join(REPO, "lib", name), "utf8");
    writeFileSync(join(work, "lib", name), shipped);
    const copied = readFileSync(join(work, "lib", name), "utf8");
    console.log(`  lib/${name}: ${copied === shipped ? "byte-identical to the shipped file" : "DIFFERS FROM THE SHIPPED FILE"}, sha256 ${sha(shipped).slice(0, 16)}`);
  }
  symlinkSync(join(REPO, "node_modules"), join(work, "node_modules"), "dir");
  writeFileSync(join(work, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2021", module: "CommonJS", moduleResolution: "node", strict: true,
      esModuleInterop: true, skipLibCheck: true, rootDir: ".", outDir: "out",
    },
    include: ["lib/**/*.ts"],
  }, null, 2));
  execFileSync("npx", ["tsc", "-p", join(work, "tsconfig.json")], { cwd: REPO, stdio: "inherit" });
  const load = createRequire(import.meta.url);
  const { scoreTranscriptAgainstRubric } = load(join(work, "out", "lib", "scoring.js"));
  const { getModel } = load(join(work, "out", "lib", "openai.js"));
  console.log(`  getModel(), asked inside the compiled code: ${getModel()}`);

  console.log("");
  console.log("THE INPUTS, read-only, assembled as app/api/session/end/route.ts assembles them");
  for (const t of subjects) {
    const matching = [...t.refItems.values()].filter((i) => {
      const c = t.criteria.find((x) => x.id === i.id);
      const l = c?.levels.find((x) => x.name === i.level);
      return Boolean(l) && l.points === i.points_earned && c.levels[0].points === i.points_max;
    }).length;
    console.log(`  ${t.label}. ${t.id}`);
    console.log(`     ${t.g.klass.name}, "${t.g.assignment.title}", ${t.g.session.kind}, ${t.g.session.status}`);
    console.log(`     rubric "${t.rubric.name}" (${t.rubric.id}), ${t.criteria.length} criteria, max_total arrived as a ${t.maxTotalArrivedAs} and is passed as ${t.maxTotal}`);
    console.log(`     rubric created ${t.rubric.created_at}, submission scored ${t.scoredAt}`);
    console.log(`     persona "${t.personaName}", ${t.transcript.length} turns`);
    console.log(`     reference: ${t.referenceSource}, total ${t.reference?.total ?? "(none)"}`);
    console.log(`     reference items that match the current ladder on id, level, points and maximum: ${matching} of ${t.refItems.size}`);
  }

  if (DRY_RUN) {
    let failures = 0;
    console.log("");
    console.log("THE SCORER, RUN UP TO ITS OPENAI CALL, WHICH THE GATEKEEPER REFUSES");
    for (const t of subjects) {
      capture = null;
      let message = "(it did not throw)";
      try {
        await scoreTranscriptAgainstRubric(t.transcript, t.criteria, t.maxTotal, t.personaName);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      const { sent } = readCapture(capture);
      const ok = message.startsWith("REFUSED: an OpenAI call under --dry-run") && sent !== null;
      if (!ok) failures += 1;
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${t.label}: ${message}`);
      if (sent) console.log(`        the request it built: model ${sent.model}, temperature ${sent.temperature}, seed ${sent.seed}, ${sent.bytes} bytes, sha256 ${sent.hash.slice(0, 16)}`);
    }

    console.log("");
    console.log("THE GUARDS, PROBED. Each probe is harmless even if the guard it tests were broken.");
    const probe = async (label, fn) => {
      let message = "(it was not refused)";
      try {
        await fn();
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      const ok = message.startsWith("REFUSED");
      if (!ok) failures += 1;
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${message}`);
    };
    // No key is sent and the table does not exist, so a broken gatekeeper
    // would get a 401 from a table that is not there, and change nothing.
    await probe("a write to Supabase", () =>
      gatekeeper(`${SUPABASE_ORIGIN}/rest/v1/v1_guard_probe_no_such_table`, { method: "PATCH", body: "{}" }));
    await probe("any other host", () => gatekeeper("https://example.com/"));
    for (const email of [null, "", "someone@example.edu", " instructor@test.com", "INSTRUCTOR@TEST.COM", "instructor@test.com.example.org"]) {
      const ok = !ownerIsTest(email);
      if (!ok) failures += 1;
      console.log(`  ${ok ? "PASS" : "FAIL"}  the owner check refuses ${JSON.stringify(email)}`);
    }
    const allows = ownerIsTest(TEST_OWNER);
    if (!allows) failures += 1;
    console.log(`  ${allows ? "PASS" : "FAIL"}  the owner check allows ${JSON.stringify(TEST_OWNER)}`);

    console.log("");
    console.log(`The live run would make ${MAX_OPENAI_CALLS} calls, one at a time, in this order: ${Array.from({ length: RUNS }, () => subjects.map((t) => t.label).join(", ")).join(", ")}.`);
    console.log(`Traffic: ${traffic.supabaseReads} Supabase reads, all GET; ${traffic.openaiCalls} OpenAI calls made.`);
    console.log(failures === 0 ? "DRY RUN PASSED" : `${failures} DRY-RUN CHECK(S) FAILED`);
    return failures === 0 ? 0 : 1;
  }

  console.log("");
  console.log("THE RUNS, interleaved, one at a time");
  const runs = [];
  for (let round = 1; round <= RUNS; round += 1) {
    for (const t of subjects) {
      capture = null;
      const started = new Date();
      let score = null;
      let error = null;
      try {
        score = await scoreTranscriptAgainstRubric(t.transcript, t.criteria, t.maxTotal, t.personaName);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const ended = new Date();
      const seen = readCapture(capture);
      const outcome = score
        ? "scored"
        : !capture || capture.status !== 200 || error.startsWith("OpenAI ") ? "openai-error" : "refused";
      const run = {
        call: runs.length + 1, round, subject: t.label, started, ended, outcome, error, ...seen,
        levels: Object.fromEntries((score?.items ?? []).map((i) => [i.id, i.level])),
        total: score?.total ?? null,
      };
      runs.push(run);
      console.log(`  call ${run.call} of ${MAX_OPENAI_CALLS}, ${t.label} run ${round}: ${started.toISOString()} (${central(started)}), `
        + `${((ended - started) / 1000).toFixed(1)} s, ${outcome}${score ? ` ${score.total}/${score.max_total}` : ""}, `
        + `${seen.fingerprint ?? "no fingerprint"}, ${seen.model ?? "no model"}`
        + `${seen.sent ? `, sent ${seen.sent.model} temperature ${seen.sent.temperature} seed ${seen.sent.seed}` : ""}`);
    }
  }

  console.log("");
  console.log("THE REPORT");
  for (const t of subjects) reportSubject(t, runs.filter((r) => r.subject === t.label));

  const first = runs[0].started;
  const last = runs[runs.length - 1].ended;
  const sum = (pick) => runs.reduce((n, r) => n + (pick(r) ?? 0), 0);
  console.log("");
  console.log(`Wall-clock span of the ${runs.length} calls: ${first.toISOString()} to ${last.toISOString()}, `
    + `${((last - first) / 1000).toFixed(0)} s (${central(first)} to ${central(last)}).`);
  console.log(`Tokens: ${sum((r) => r.usage?.prompt_tokens)} prompt (${sum((r) => r.usage?.prompt_tokens_details?.cached_tokens)} of them cached), `
    + `${sum((r) => r.usage?.completion_tokens)} completion.`);
  console.log(`Traffic: ${traffic.supabaseReads} Supabase reads, all GET; ${traffic.openaiCalls} OpenAI calls. Nothing was written.`);
  return 0;
}

let code = 1;
try {
  code = await main();
} catch (err) {
  console.error(`STOPPED: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(code);
