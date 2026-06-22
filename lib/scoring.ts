// Content-only scoring for a text role-play.
//
// We score the student's side of the conversation against the Discovery CONTENT
// rubric: the items that apply to both text and voice ("both") AND belong to the
// discovery meeting. Voice-only items (tone, eye contact, etc.) and presentation-
// only items are skipped. For the Great Northwoods rubric that is 18 items worth
// 180 points.
//
// The scoring runs as a single low-temperature, structured (JSON) OpenAI call so
// that re-scoring the same transcript gives consistent results.
import { chatComplete } from "./openai";
import type { RubricItem, ScoreItem, SessionScore, TranscriptTurn } from "./types";

// Keep only the content items that belong to the discovery meeting.
export function contentDiscoveryItems(items: RubricItem[]): RubricItem[] {
  return items.filter(
    (item) =>
      item.applies_to === "both" &&
      Array.isArray(item.meetings) &&
      item.meetings.includes("discovery"),
  );
}

const SCORING_SYSTEM_MESSAGE = [
  "You are an impartial, consistent sales-training grader.",
  "You grade ONLY the student's performance in a role-play sales meeting transcript. The student plays a sales representative; the persona named Alex is the customer. Never grade the customer.",
  "",
  "For each rubric item (each is out of 10), award EXACTLY ONE of these five values: 0, 3, 6, 8, or 10. Do not use any other number. Choose the single value whose description best matches the evidence in the transcript and the item's guidance:",
  "- 0: no evidence of the behavior at all.",
  "- 3: barely touched on it; vague, generic, or only implied.",
  "- 6: a clear but partial or shallow attempt.",
  "- 8: solid; clearly done with specifics relevant to this customer.",
  "- 10: excellent; thorough and effective.",
  "Apply the same thresholds every time, so the same transcript always produces the same scores.",
  "",
  "In each comment, give one or two sentences that justify the score and quote a short piece of evidence from the student's own messages when there is any (a few words is enough). Do not reward mere length or politeness.",
].join("\n");

// A fixed seed so OpenAI's sampling is reproducible from one scoring to the next.
const SCORING_SEED = 7;

function formatTranscript(transcript: TranscriptTurn[]): string {
  if (transcript.length === 0) return "(The transcript is empty.)";
  return transcript
    .map((turn) => {
      const who =
        turn.role === "student" ? "STUDENT (sales rep)" : "ALEX (customer)";
      return `${who}: ${turn.text}`;
    })
    .join("\n");
}

function buildUserMessage(
  items: RubricItem[],
  transcript: TranscriptTurn[],
): string {
  const itemBlock = items
    .map(
      (item) =>
        `- id: ${item.id}\n  name: ${item.label}\n  guidance: ${item.guidance ?? ""}`,
    )
    .join("\n");

  return [
    "Score the STUDENT against each rubric item below.",
    "",
    "RUBRIC ITEMS:",
    itemBlock,
    "",
    "TRANSCRIPT:",
    formatTranscript(transcript),
    "",
    `Return JSON with an "items" array containing exactly one entry for each of the ${items.length} rubric items above, each with its id, points_earned (one of 0, 3, 6, 8, or 10), and a short comment.`,
  ].join("\n");
}

// The strict JSON shape we force OpenAI to return.
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "rubric_scores",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              points_earned: { type: "integer" },
              comment: { type: "string" },
            },
            required: ["id", "points_earned", "comment"],
          },
        },
      },
      required: ["items"],
    },
  },
};

type RawScore = { id: string; points_earned: number; comment: string };

// Score one transcript. Returns the itemized SessionScore.
export async function scoreTranscriptContent(
  transcript: TranscriptTurn[],
  rubricItems: RubricItem[],
): Promise<SessionScore> {
  const items = contentDiscoveryItems(rubricItems);
  const maxTotal = items.reduce((sum, item) => sum + item.points, 0);

  const raw = await chatComplete({
    messages: [
      { role: "system", content: SCORING_SYSTEM_MESSAGE },
      { role: "user", content: buildUserMessage(items, transcript) },
    ],
    temperature: 0,
    seed: SCORING_SEED,
    responseFormat: RESPONSE_FORMAT,
  });

  // Parse the model's JSON and index it by item id.
  let parsed: { items?: RawScore[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The scorer returned invalid JSON.");
  }
  const byId = new Map<string, RawScore>();
  for (const entry of parsed.items ?? []) {
    if (entry && typeof entry.id === "string") byId.set(entry.id, entry);
  }

  // Build the final score in rubric order, clamping every value to a safe range
  // so a misbehaving model can never exceed an item's max or go negative.
  const scoredItems: ScoreItem[] = items.map((item) => {
    const got = byId.get(item.id);
    const rawPoints = typeof got?.points_earned === "number" ? got.points_earned : 0;
    const points = Math.max(0, Math.min(item.points, Math.round(rawPoints)));
    const comment =
      got && typeof got.comment === "string" && got.comment.trim()
        ? got.comment.trim()
        : "No evidence of this in the transcript.";
    return {
      id: item.id,
      points_earned: points,
      points_max: item.points,
      comment,
      scored_by: "ai",
    };
  });

  const total = scoredItems.reduce((sum, item) => sum + item.points_earned, 0);

  return { total, max_total: maxTotal, items: scoredItems };
}
