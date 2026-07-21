// Persona scaffolding: the generation prompt, the output contract, and the
// validation the app runs before it will show a candidate.
//
// This file implements Parts A and B of docs/Relii-Piece2b-Persona-Generation-Prompt.md
// FAITHFULLY, not paraphrased. That doc is the source of truth: if the wording
// there changes, change it here to match.
//
// The model call runs on the server only, through the existing chatComplete
// helper and the existing OPENAI_API_KEY. The key never reaches the browser.
// There is deliberately NO web search and no external tool: model knowledge
// only (Piece 2 design decision 8).
import { chatComplete } from "./openai";

// ---------------------------------------------------------------------------
// The admin's inputs (the scaffolding form)
// ---------------------------------------------------------------------------

export type ChainPosition = "gatekeeper" | "decision_maker";
export type ScaffoldMeetingType = "discovery" | "presentation";

export type ScaffoldInputs = {
  industry: string;
  personaRole: string;
  productOrService: string;
  // An approximate employee count, e.g. "250". Kept as text: the admin may
  // reasonably type "about 250" or "250-300", and it is only ever describing.
  companySize: string;
  meetingType: ScaffoldMeetingType;
  chainPosition: ChainPosition;
  // Who this persona gates access to. Only meaningful for a gatekeeper.
  gatesAccessTo: string;
  winCondition: string;
  sellerCompanyType: string;
};

// ---------------------------------------------------------------------------
// The candidate the model returns (Part B)
// ---------------------------------------------------------------------------

export type HiddenFact = { fact: string; detail: string };

export type PersonaCandidate = {
  persona_name: string;
  role: string;
  company: { type: string; size: string };
  meeting_type: ScaffoldMeetingType;
  chain_position: { position: ChainPosition; gates_access_to: string | null };
  win_condition: string;
  demeanor: string[];
  decision_criteria: string[];
  hidden_facts: HiddenFact[];
  objections: string[];
  earns_win: string[];
  fails_win: string[];
};

// ---------------------------------------------------------------------------
// Part A: the generation prompt, verbatim from the design doc
// ---------------------------------------------------------------------------

const PART_A_PROMPT = [
  "You are building a sales-training role-play persona for a university sales course. A student will play a seller and hold a spoken or typed meeting with the persona you design. Your job is to produce ONE realistic, coherent buyer persona and its scenario, as structured JSON only.",
  "",
  "GROUND RULES",
  "- Use general knowledge only. Do NOT reference real companies, real people, or current events. This is plausible training fiction, not fact.",
  "- Price is already settled in every case. The student must win on non-price value and risk, never on discounts. Do not create a price objection as the path to the win.",
  "- Assume the buyer already uses an incumbent product or service. Invent that incumbent's common, believable shortfalls and make them the hidden facts the seller must uncover.",
  "- Not every trial can be risk-free. Where the win is a trial that cannot be truly risk-free, the seller earns it by showing the trial clearly reduces risk versus the incumbent, not by eliminating risk.",
  "- The meeting runs about 15 minutes. The buyer is busy, realistic, and never coaches or grades the seller.",
  "- Difficulty and demeanor match a skeptical-but-fair, proof-driven professional: polite, unimpressed by fluff, opens up to specific and well-informed questions, guarded with vague or generic ones.",
  "- The buyer must NOT volunteer the hidden facts or any numbers. Those are revealed only in response to good, specific questions.",
  "",
  "INPUTS (provided by the admin)",
  "- industry",
  "- persona role",
  "- product or service being sold",
  "- prospect company size, given as an approximate employee count",
  "- meeting type and chain position: whether this persona is the gatekeeper or the decision maker, and who they gate access to",
  "- win condition: what the seller must earn (if it is a trial, its concrete terms)",
  "- seller company type",
  "",
  "TASK",
  "Produce the persona and scenario as JSON matching the schema in Part B. Fill every field. Keep the hidden facts concrete and quantified where a real operator would know numbers (costs, frequencies, defect rates), but keep any one runaway metric plausible. Keep line-level specifics qualitative if a number would be guessed rather than known. The objections must push the seller toward proof and a low-risk next step, not toward price.",
  "",
  "Return JSON only, no prose around it.",
].join("\n");

// Part A tells the model to match "the schema in Part B", so Part B travels with
// it. The response_format below enforces this shape mechanically as well; this
// copy is here so the instruction in Part A actually resolves to something.
const PART_B_SCHEMA_TEXT = [
  "Part B. Required JSON output schema",
  "",
  "{",
  '  "persona_name": "string, a first name only",',
  '  "role": "string, the persona\'s job title",',
  '  "company": { "type": "string, generic descriptor, no real name", "size": "string, a size descriptor based on the employee-count input, e.g. mid-sized (roughly 250 employees)" },',
  '  "meeting_type": "discovery | presentation",',
  '  "chain_position": { "position": "gatekeeper | decision_maker", "gates_access_to": "string or null, who they gate" },',
  '  "win_condition": "string: exactly what the seller must earn; if a trial, the concrete terms (what, how much, how long, and either what risk-free means or, where the trial cannot be risk-free, how it clearly reduces risk versus the buyer\'s current vendor)",',
  '  "demeanor": ["3 to 5 short descriptors"],',
  '  "decision_criteria": ["ranked list, most important first"],',
  '  "hidden_facts": [',
  '    { "fact": "string, an incumbent shortfall or pressure", "detail": "string, the concrete detail or number revealed only to a good question" }',
  "  ],",
  '  "objections": ["3 short first-person objections that push toward proof and a low-risk trial, never price"],',
  '  "earns_win": ["what a seller must do to earn the win condition"],',
  '  "fails_win": ["what makes the buyer decline"]',
  "}",
].join("\n");

// The static "differ" nudge added to the SECOND call only (Part D). It is
// deliberately static rather than a description of candidate one, so both calls
// can run at the same time instead of one after the other. Halving the wall
// clock matters here: two slow calls in series is the Vercel timeout risk.
const DIFFER_NUDGE = [
  "ADDITIONAL INSTRUCTION FOR THIS CANDIDATE",
  "A separate candidate persona is being generated independently from these same inputs. Make this one MEANINGFULLY DIFFERENT from the obvious first take on this buyer: choose a different primary pressure driving them, a different angle within the skeptical-but-fair range, and a different set of hidden facts and objections. Do not simply rename the same persona or reshuffle the same concerns. Stay fully inside the ground rules above.",
].join("\n");

// The admin's answers, handed to the model as the INPUTS section Part A expects.
function buildInputsMessage(inputs: ScaffoldInputs): string {
  const chainLine =
    inputs.chainPosition === "gatekeeper"
      ? `gatekeeper, who gates access to: ${inputs.gatesAccessTo}`
      : "decision maker (they can decide themselves, they gate nobody)";

  return [
    "INPUTS",
    `- industry: ${inputs.industry}`,
    `- persona role: ${inputs.personaRole}`,
    `- product or service being sold: ${inputs.productOrService}`,
    `- prospect company size (approximate employee count): ${inputs.companySize}`,
    `- meeting type: ${inputs.meetingType}`,
    `- chain position: ${chainLine}`,
    `- win condition: ${inputs.winCondition}`,
    `- seller company type: ${inputs.sellerCompanyType}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The strict JSON shape we force OpenAI to return (the same mechanism the
// scorer uses). This guarantees the FIELD NAMES and TYPES. It cannot enforce
// "at least 3 hidden facts" or "not empty", which is why validateCandidate
// below is a real second pass and not a formality.
// ---------------------------------------------------------------------------

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "persona_candidate",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        persona_name: { type: "string" },
        role: { type: "string" },
        company: {
          type: "object",
          additionalProperties: false,
          properties: { type: { type: "string" }, size: { type: "string" } },
          required: ["type", "size"],
        },
        meeting_type: { type: "string", enum: ["discovery", "presentation"] },
        chain_position: {
          type: "object",
          additionalProperties: false,
          properties: {
            position: { type: "string", enum: ["gatekeeper", "decision_maker"] },
            gates_access_to: { type: ["string", "null"] },
          },
          required: ["position", "gates_access_to"],
        },
        win_condition: { type: "string" },
        demeanor: { type: "array", items: { type: "string" } },
        decision_criteria: { type: "array", items: { type: "string" } },
        hidden_facts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { fact: { type: "string" }, detail: { type: "string" } },
            required: ["fact", "detail"],
          },
        },
        objections: { type: "array", items: { type: "string" } },
        earns_win: { type: "array", items: { type: "string" } },
        fails_win: { type: "array", items: { type: "string" } },
      },
      required: [
        "persona_name",
        "role",
        "company",
        "meeting_type",
        "chain_position",
        "win_condition",
        "demeanor",
        "decision_criteria",
        "hidden_facts",
        "objections",
        "earns_win",
        "fails_win",
      ],
    },
  },
};

// Generation wants VARIETY, so it uses a real temperature and NO fixed seed.
// This is the deliberate opposite of lib/scoring.ts, which pins temperature 0
// and a fixed seed so re-scoring a transcript is repeatable. Two calls with the
// same inputs at temperature 0 would come back nearly identical, which would
// defeat the whole point of generating two candidates to compare.
const GENERATION_TEMPERATURE = 0.9;

// ---------------------------------------------------------------------------
// Part B validation: the rules the doc says the app enforces before saving.
// "Every field present and non-empty; meeting_type is one of the two allowed
// values; chain_position.position is one of the two allowed values; at least 3
// hidden_facts, 3 objections."
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { ok: true; candidate: PersonaCandidate }
  | { ok: false; problems: string[] };

function isFilledString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// An array of non-empty strings, with a minimum length.
function checkStringList(
  value: unknown,
  field: string,
  min: number,
  problems: string[],
): void {
  if (!Array.isArray(value) || value.length < min) {
    problems.push(`${field} needs at least ${min} entr${min === 1 ? "y" : "ies"}.`);
    return;
  }
  if (!value.every(isFilledString)) {
    problems.push(`${field} contains an empty entry.`);
  }
}

export function validateCandidate(raw: unknown): ValidationResult {
  const problems: string[] = [];
  const c = raw as Partial<PersonaCandidate> | null;

  if (!c || typeof c !== "object") {
    return { ok: false, problems: ["The model did not return a JSON object."] };
  }

  if (!isFilledString(c.persona_name)) problems.push("persona_name is empty.");
  if (!isFilledString(c.role)) problems.push("role is empty.");

  if (!c.company || typeof c.company !== "object") {
    problems.push("company is missing.");
  } else {
    if (!isFilledString(c.company.type)) problems.push("company.type is empty.");
    if (!isFilledString(c.company.size)) problems.push("company.size is empty.");
  }

  // The two enums.
  if (c.meeting_type !== "discovery" && c.meeting_type !== "presentation") {
    problems.push("meeting_type is not discovery or presentation.");
  }

  if (!c.chain_position || typeof c.chain_position !== "object") {
    problems.push("chain_position is missing.");
  } else {
    const position = c.chain_position.position;
    if (position !== "gatekeeper" && position !== "decision_maker") {
      problems.push("chain_position.position is not gatekeeper or decision_maker.");
    }
    // gates_access_to may legitimately be null for a decision maker. For a
    // gatekeeper it is the whole point of the position, so it must be filled in.
    if (position === "gatekeeper" && !isFilledString(c.chain_position.gates_access_to)) {
      problems.push("chain_position.gates_access_to is empty for a gatekeeper.");
    }
  }

  if (!isFilledString(c.win_condition)) problems.push("win_condition is empty.");

  checkStringList(c.demeanor, "demeanor", 1, problems);
  checkStringList(c.decision_criteria, "decision_criteria", 1, problems);
  checkStringList(c.objections, "objections", 3, problems);
  checkStringList(c.earns_win, "earns_win", 1, problems);
  checkStringList(c.fails_win, "fails_win", 1, problems);

  // hidden_facts is a list of objects, so it gets its own check.
  if (!Array.isArray(c.hidden_facts) || c.hidden_facts.length < 3) {
    problems.push("hidden_facts needs at least 3 entries.");
  } else if (
    !c.hidden_facts.every(
      (h) => h && isFilledString(h.fact) && isFilledString(h.detail),
    )
  ) {
    problems.push("hidden_facts contains an entry with an empty fact or detail.");
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, candidate: c as PersonaCandidate };
}

// ---------------------------------------------------------------------------
// Generating one candidate, with ONE re-request if the JSON fails the rules
// ---------------------------------------------------------------------------

// Two attempts per candidate. The doc says to re-request rather than show a
// partial case; the retry is bounded because every extra attempt adds to the
// request time, which is the risk this piece is watching.
const MAX_ATTEMPTS = 2;

async function generateOneCandidate(
  inputs: ScaffoldInputs,
  useDifferNudge: boolean,
): Promise<PersonaCandidate> {
  const systemContent = [PART_A_PROMPT, "", PART_B_SCHEMA_TEXT]
    .concat(useDifferNudge ? ["", DIFFER_NUDGE] : [])
    .join("\n");

  let lastProblems: string[] = ["The model returned nothing usable."];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const rawText = await chatComplete({
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: buildInputsMessage(inputs) },
      ],
      temperature: GENERATION_TEMPERATURE,
      responseFormat: RESPONSE_FORMAT,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      lastProblems = ["The model returned text that was not valid JSON."];
      continue;
    }

    const result = validateCandidate(parsed);
    if (result.ok) return result.candidate;

    lastProblems = result.problems;
    console.warn(
      `Persona candidate failed validation on attempt ${attempt}:`,
      result.problems.join(" "),
    );
  }

  throw new Error(
    `The generated persona did not meet the required shape after ${MAX_ATTEMPTS} attempts: ${lastProblems.join(" ")}`,
  );
}

// Generate the TWO candidates the compare view needs: the same prompt called
// twice with the same inputs, the second carrying the differ nudge (Part D).
// They run AT THE SAME TIME, so the whole request takes about as long as one
// call rather than two. If either candidate cannot be produced validly, the
// whole thing fails: a half-generated case is never shown.
export async function generateTwoCandidates(
  inputs: ScaffoldInputs,
): Promise<[PersonaCandidate, PersonaCandidate]> {
  const [first, second] = await Promise.all([
    generateOneCandidate(inputs, false),
    generateOneCandidate(inputs, true),
  ]);
  return [first, second];
}
