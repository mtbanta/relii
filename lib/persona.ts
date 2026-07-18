// Builds the messages we send to OpenAI so the AI stays in character as the
// scenario's persona (Alex, Jordan, ...) for a role-play.
import type { ChatMessage } from "./openai";
import type { TranscriptTurn } from "./types";

// The system message defines who the AI is. It is the scenario's persona prompt,
// followed by the scenario context clearly labeled as background only, so the AI
// does not mistake the seller's briefing for its own role. (The scenario context
// is written to the student, "You play a sales representative...", so we must
// fence it off.)
export function buildSystemMessage(
  personaSystemPrompt: string,
  scenarioContext: string,
): string {
  return [
    personaSystemPrompt,
    "",
    "BACKGROUND FOR YOUR CONTEXT ONLY:",
    // Worded without naming a persona so it is correct for every scenario. It
    // used to say "you remain Alex at all times", which would have told the
    // Jordan persona to be Alex.
    "The text below is the briefing the sales representative you are meeting was given before this conversation. It describes their goals and role, not yours. Do not adopt their role; you remain in character as the persona described above at all times.",
    "",
    scenarioContext,
  ].join("\n");
}

// A hidden nudge used only to get the persona to speak first. It is NOT saved to
// the transcript; only the persona's resulting greeting is saved.
export const OPENING_NUDGE =
  "The sales representative has just joined the call for your meeting. Greet them briefly and naturally to open, in one or two sentences, then let them lead.";

// Turn the saved transcript into OpenAI chat messages. The persona's lines are
// "assistant" (the AI's own past replies); the student's lines are "user".
export function transcriptToMessages(
  transcript: TranscriptTurn[],
): ChatMessage[] {
  return transcript.map((turn) => ({
    role: turn.role === "persona" ? "assistant" : "user",
    content: turn.text,
  }));
}
