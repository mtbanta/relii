// Part C: the FIXED assembly template.
//
// Turns one generated candidate (the structured JSON) into the two scenario
// columns the app already uses: scenario_context (the student briefing) and
// persona_system_prompt (the instructions that drive the AI persona).
//
// Why a fixed template (Piece 2 design decision 4): the compare view shows the
// structured fields, and the live conversation is driven by these two strings.
// If a human or a second model rewrote the strings, the two could drift apart
// and the case you picked would not be the case the student meets. Assembling
// from one source makes that impossible.
//
// This is a pure function with no database and no model call, so chunk 2c can
// import it unchanged and only has to persist what it returns.
import type { PersonaCandidate, ScaffoldInputs } from "./persona-scaffold";

export type AssembledScenario = {
  scenario_context: string;
  persona_system_prompt: string;
};

// "practical", "blunt", "time-pressed" -> "practical, blunt, and time-pressed".
function toSentenceList(items: string[]): string {
  const clean = items.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

// Join list entries into one inline run of text, e.g. for "earns_win".
function toInlineList(items: string[]): string {
  return items
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .join("; ");
}

// A bulleted block, matching the "- " bullets Alex and Jordan already use.
function toBullets(items: string[]): string {
  return items
    .map((s) => `- ${s.trim()}`)
    .filter((line) => line !== "- ")
    .join("\n");
}

// The demeanor descriptors read as a sentence, so a leading capital from the
// model ("Practical") does not land mid-sentence.
function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text;
}

export function assembleScenario(
  candidate: PersonaCandidate,
  inputs: ScaffoldInputs,
): AssembledScenario {
  const {
    persona_name,
    role,
    company,
    chain_position,
    win_condition,
    demeanor,
    decision_criteria,
    hidden_facts,
    objections,
    earns_win,
    fails_win,
  } = candidate;

  const sellerType = inputs.sellerCompanyType.trim();
  const companyDescription = `${company.size} ${company.type}`;

  // Only a gatekeeper gets the "they gate access to X" sentence.
  const isGatekeeper = chain_position.position === "gatekeeper";
  const gatekeeperSentence =
    isGatekeeper && chain_position.gates_access_to
      ? ` They are the gatekeeper to ${chain_position.gates_access_to}.`
      : "";

  // ---- scenario_context: the STUDENT BRIEFING. -----------------------------
  // It is built only from the name, role, company, gated person, and win
  // condition. It deliberately never touches hidden_facts, so the hidden
  // numbers the student is supposed to uncover can never leak into the briefing.
  const scenario_context =
    `You are about to role-play a sales meeting. You play a sales representative from a ${sellerType}. ` +
    `The buyer is ${persona_name}, the ${role} at a ${companyDescription}.${gatekeeperSentence} ` +
    `You have about fifteen minutes. Pricing has already been settled, so this is not a price negotiation. ` +
    `Your job is to show you did your homework, uncover ${persona_name}'s real concerns, and earn ${trimTrailingPeriod(win_condition)}. ` +
    `You earn it only by presenting specific, credible, low-risk value, not by competing on price.`;

  // ---- persona_system_prompt: what drives the AI persona. ------------------
  const demeanorSentence = lowerFirst(toSentenceList(demeanor));

  const hiddenFactLines = hidden_facts
    .map((h) => `- ${h.fact.trim().replace(/\.$/, "")}: ${h.detail.trim()}`)
    .join("\n");

  const objectionLines = objections
    .map((o) => `- "${o.trim().replace(/^"|"$/g, "")}"`)
    .join("\n");

  const persona_system_prompt = [
    `You are ${persona_name}, the ${role} at a ${companyDescription}. You are meeting a sales representative from a ${sellerType}. You have set aside about fifteen minutes. Pricing has already been settled, so price is not the topic.`,
    "",
    "YOUR ROLE AND DEMEANOR",
    `You are ${demeanorSentence}. You are blunt but fair: you do not punish a rep for being new, but you have no patience for sales fluff, vague claims, or anything that sounds like a brochure. You reward a specific, well-informed question by engaging and sharing detail, and you meet a vague or generic pitch with short, skeptical answers.`,
    "",
    "WHAT YOU CARE ABOUT (your real decision criteria, in order)",
    toBullets(decision_criteria),
    "",
    "WHAT YOU KNOW BUT WILL NOT VOLUNTEER (reveal only if the seller earns it with good, specific questions)",
    hiddenFactLines,
    "Do not volunteer these or any numbers; make the seller uncover them.",
    "",
    "OBJECTIONS YOU RAISE (naturally, and not all at once)",
    objectionLines,
    "Use these to push the seller toward proof, specifics, and a low-risk next step, never toward price.",
    "",
    "HOW THE MEETING CAN END",
    `The only close available is ${trimTrailingPeriod(win_condition)}. Grant it only if the seller earns it: ${toInlineList(earns_win)}. If the seller is generic, leans on price, over-promises without proof, or never addresses your real concerns, do not grant it: ${toInlineList(fails_win)}. Politely keep the door slightly open, or end the meeting.`,
    "",
    "RULES FOR YOU",
    "Stay in character at all times. Never coach, grade, or critique the seller, and never break character or say you are an AI or part of a training exercise. Keep replies conversational and concise, usually one to three sentences, and ask natural follow-up questions. You have about fifteen minutes; if the seller stalls, you may gently note the time.",
  ].join("\n");

  return { scenario_context, persona_system_prompt };
}

// The win condition is dropped into the middle of sentences in both fields, so
// a trailing period from the model would produce "earn a trial.. You earn it".
function trimTrailingPeriod(text: string): string {
  return text.trim().replace(/\.$/, "");
}
