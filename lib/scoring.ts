// PHASE 2b-1. Scoring a role-play (text or voice) against the assignment's
// weighted rubric.
//
// ==> WHAT CHANGED IN 2b-1, AND WHY EACH HALF OF IT MATTERS.
//
//     1. THE RUBRIC NOW COMES FROM THE ASSIGNMENT, NOT THE SCENARIO. That
//        decision is made by the callers; this file just receives criteria.
//
//     2. THE AI EMITS A LEVEL NAME AND NOTHING ELSE. It used to return a number
//        of points. Now it returns the short name of one performance level, and
//        THE POINTS ARE LOOKED UP HERE, server-side, from that criterion's own
//        ladder. The model cannot invent a number that looks valid, because it
//        never supplies a number at all. This is the owner's ruling and it is
//        the single most important property of this file.
//
//     3. EVERY CRITERION IS SCORED. contentItemsForMeeting(), `applies_to` and
//        the `meetings` tags are GONE from scoring. A weighted rubric has no
//        sub-items and no voice-only concept: it has six or seven criteria and
//        all of them are graded, Communication Skills and Overall Impression
//        included, from the transcript alone. Scoring applies whenever a rubric
//        is attached, REGARDLESS of the scenario's meeting_type.
//
//     4. HALF POINTS SURVIVE. The old code clamped with Math.round(), which
//        turned Tom's 49.5 into 50. There is nothing to round here: the number
//        is copied out of the rubric. <==
//
// ==> THERE IS ONE RUBRIC SHAPE AND THERE IS NO DISCRIMINATOR. The legacy flat
//     rubric (29 items, 10 points each) was put OUT OF REACH by this piece's
//     migration rather than supported alongside the new one, so every rubric a
//     reader can now resolve is a levels rubric. Do not add a shape probe, a
//     version field, or a second code path. What IS here is a REFUSAL: a rubric
//     whose criteria carry no levels stops scoring with a legible error instead
//     of walking the wrong shape. A refusal is enforcement of the ruling, not an
//     exception to it. <==
//
// The scoring runs as a single low-temperature, structured (JSON) OpenAI call so
// that re-scoring the same transcript gives consistent results.
import { chatComplete } from "./openai";
import type {
  RubricCriterion,
  RubricLevel,
  ScoreItem,
  SessionScore,
  TranscriptTurn,
} from "./types";

// ==> A FIXED SEED AND A ZERO TEMPERATURE ARE THE CLAIM THAT RE-SCORING THE
//     SAME TRANSCRIPT GIVES THE SAME ANSWER. They are not the measurement.
//     Tom's fairness argument rests on that property, and it is the kind of
//     thing that is assumed right up until it is not. Scoring one transcript
//     twice and comparing the level names is the check, and it is written down
//     as a 2b-2 item rather than left in a comment nobody runs. <==
const SCORING_SEED = 7;

// The grader names the persona so a Jordan transcript is graded as Jordan.
const buildScoringSystemMessage = (personaName: string) =>
  [
    "You are an impartial, consistent sales-training grader.",
    `You grade ONLY the student's performance in a role-play sales meeting transcript. The student plays a sales representative; the persona named ${personaName} is the customer. Never grade the customer.`,
    "",
    "Each criterion below carries its own ladder of six performance levels, listed from the strongest performance to the weakest, each with the rubric's own description of what that level means. For each criterion, choose EXACTLY ONE level and return its name copied exactly as it is written in that criterion's list. Do not invent a level, do not combine two of them, and do not return a number.",
    "",
    // ==> THE RUBRIC'S OWN WORDS DECIDE THE BOUNDARY, NOT OURS. This paragraph
    //     used to be a six-rung ladder we wrote ("excellent", "solid", "a clear
    //     but partial attempt", and so on). The owner struck it on 2026-09-10
    //     for a reason worth keeping in view: with a ladder of our own here, OUR
    //     PROMPT WOULD BE THE GRADE BOUNDARY INSTEAD OF TOM'S RUBRIC. What is
    //     left is a positional note, which is a fact about the list's ORDER and
    //     not a claim about what any level means.
    "Choose the level whose description matches the evidence in the student's own messages, judged against what that criterion asks for. The rubric's own descriptions decide where one level ends and the next begins. Where two seem close, the order of the list is the tie-breaker: earlier in the list is the stronger performance, and the last entry is the weakest.",
    "",
    "Judge each criterion on its own. A strong showing on one criterion must not raise another.",
    "",
    "Grade EVERY criterion, including any about communication skills or overall impression. Judge those from the transcript alone, on what the student's own words show, and say so in the comment when the transcript cannot show something the criterion asks for.",
    "",
    "Apply the same standard every time, so the same transcript always produces the same levels.",
    "",
    "In each comment, give one or two sentences that justify the level and quote a short piece of evidence from the student's own messages when there is any (a few words is enough). Do not reward mere length or politeness.",
  ].join("\n");

function formatTranscript(
  transcript: TranscriptTurn[],
  personaName: string,
): string {
  if (transcript.length === 0) return "(The transcript is empty.)";
  return transcript
    .map((turn) => {
      const who =
        turn.role === "student"
          ? "STUDENT (sales rep)"
          : `${personaName.toUpperCase()} (customer)`;
      return `${who}: ${turn.text}`;
    })
    .join("\n");
}

// ==> THE LADDER IS WRITTEN OUT UNDER EVERY CRITERION, AND THE REPETITION IS
//     DELIBERATE. In Tom's files the six names come from one header row, so
//     every criterion shares them and stating them once would be shorter. That
//     shortcut assumes a uniformity nothing in the stored shape guarantees, and
//     the instruction the model is following is "copied exactly from THAT
//     CRITERION'S OWN LIST". Validation below is per criterion for the same
//     reason. One prompt shape, no branch: the prompt that was reviewed is the
//     prompt that runs. <==
function formatLevels(levels: RubricLevel[]): string {
  return levels
    .map((level) =>
      level.descriptor
        ? `    ${level.name}: ${level.descriptor}`
        : `    ${level.name}`,
    )
    .join("\n");
}

function buildUserMessage(
  criteria: RubricCriterion[],
  transcript: TranscriptTurn[],
  personaName: string,
): string {
  const criteriaBlock = criteria
    .map((criterion) => {
      const lines = [`- id: ${criterion.id}`, `  criterion: ${criterion.name}`];
      // A criterion with no description is allowed by the parser (it is shown to
      // students but is not part of the arithmetic), so the line is omitted
      // rather than left dangling and empty.
      if (criterion.description) {
        lines.push(`  what it asks for: ${criterion.description}`);
      }
      lines.push("  levels, strongest first:", formatLevels(criterion.levels));
      return lines.join("\n");
    })
    .join("\n\n");

  return [
    "Score the STUDENT against each criterion below.",
    "",
    "CRITERIA:",
    criteriaBlock,
    "",
    "TRANSCRIPT:",
    formatTranscript(transcript, personaName),
    "",
    `Return JSON with an "items" array containing exactly one entry for each of the ${criteria.length} criteria above, each with its id, the level name you chose copied exactly from that criterion's own list, and a short comment.`,
  ].join("\n");
}

// The strict JSON shape we force OpenAI to return.
//
// ==> "level" IS A STRING AND THERE IS NO points FIELD. A schema that accepted a
//     number would be a schema that lets the model choose the grade. The string
//     is validated below against the criterion's own level names, because those
//     names come from the uploaded file rather than from us and cannot be
//     written into an enum here. <==
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "rubric_levels",
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
              level: { type: "string" },
              comment: { type: "string" },
            },
            required: ["id", "level", "comment"],
          },
        },
      },
      required: ["items"],
    },
  },
};

type RawScore = { id: string; level: string; comment: string };

// Find the level the model named, in THIS criterion's own ladder. Case and
// surrounding whitespace are forgiven because "proficient" and "Proficient" are
// the same rung of the same ladder; nothing else is.
function findLevel(
  criterion: RubricCriterion,
  named: unknown,
): RubricLevel | null {
  if (typeof named !== "string") return null;
  const want = named.trim().toLowerCase();
  if (!want) return null;
  return (
    criterion.levels.find((level) => level.name.trim().toLowerCase() === want) ??
    null
  );
}

// ==> EVERY REFUSAL IN ONE PLACE, AND THEY ARE REFUSALS RATHER THAN DEFAULTS.
//     Each of these means the rubric is not one this scorer can grade against.
//     Stopping is loud: the caller returns a scoring failure the student sees
//     and can retry. The alternative in every case is a saved score that is
//     wrong and looks entirely legitimate, which is the failure this whole
//     project keeps paying for. <==
function assertUsableRubric(criteria: RubricCriterion[], maxTotal: number) {
  if (criteria.length === 0) {
    throw new Error("This rubric has no criteria to score against.");
  }

  if (!Number.isFinite(maxTotal) || maxTotal <= 0) {
    // rubrics.max_total is the number the spreadsheet states next to "Maximum
    // points:". It is null on the one rubric that came from a seed file rather
    // than an upload. Deriving a maximum by summing the criteria instead would
    // be a second way to reach a number the file already states, and two records
    // that can disagree about a grade is exactly what 2a refused to build.
    throw new Error(
      "This rubric does not state a maximum score, so a total cannot be reported against it.",
    );
  }

  for (const criterion of criteria) {
    if (!Array.isArray(criterion.levels) || criterion.levels.length === 0) {
      // This is what a LEGACY FLAT RUBRIC looks like from in here: 29 items with
      // points and no levels at all. It is out of reach by migration, and this
      // is the backstop that turns a re-attachment into a legible refusal
      // instead of a TypeError deep inside a map().
      throw new Error(
        `The criterion "${criterion.name ?? criterion.id}" has no performance levels. This is not a levels rubric.`,
      );
    }

    // ==> THE LADDER IS ORDERED HIGHEST FIRST, AND BOTH ENDS ARE READ BY
    //     POSITION. points_max is the FIRST entry and the fallback rung is the
    //     LAST one. Checking that the first is worth at least as much as the
    //     last is how a scrambled ladder becomes a refusal instead of a quiet
    //     mis-grade: on a scrambled ladder every name-to-points pairing is
    //     wrong, not merely the fallback, so taking the cheapest level by price
    //     instead would paper over the real fault. One notion of the ladder,
    //     used at both ends. <==
    const top = criterion.levels[0];
    const bottom = criterion.levels[criterion.levels.length - 1];
    if (!(top.points >= bottom.points)) {
      throw new Error(
        `The criterion "${criterion.name ?? criterion.id}" lists its performance levels out of order, so its points cannot be trusted.`,
      );
    }
  }
}

// Score one transcript against a weighted rubric's criteria.
//
// maxTotal is rubrics.max_total, the number the spreadsheet states. It is passed
// in rather than computed, on purpose: see assertUsableRubric above.
export async function scoreTranscriptAgainstRubric(
  transcript: TranscriptTurn[],
  criteria: RubricCriterion[],
  maxTotal: number,
  personaName: string,
): Promise<SessionScore> {
  assertUsableRubric(criteria, maxTotal);

  const raw = await chatComplete({
    messages: [
      { role: "system", content: buildScoringSystemMessage(personaName) },
      {
        role: "user",
        content: buildUserMessage(criteria, transcript, personaName),
      },
    ],
    temperature: 0,
    seed: SCORING_SEED,
    responseFormat: RESPONSE_FORMAT,
  });

  // Parse the model's JSON and index it by criterion id.
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

  // Build the final score in rubric order.
  const scoredItems: ScoreItem[] = criteria.map((criterion) => {
    const got = byId.get(criterion.id);
    const chosen = findLevel(criterion, got?.level);

    // ==> A CRITERION THE MODEL OMITTED, OR A LEVEL IT NAMED THAT IS NOT ON THIS
    //     CRITERION'S LADDER, TAKES THE BOTTOM RUNG. NOT ZERO.
    //
    //     Tom's ladder bottoms out at 10 per cent and there is no true zero
    //     anywhere in it: the weakest level of a 55-point criterion is worth
    //     5.5, not 0. Awarding a 0 would be inventing a grade the rubric does
    //     not contain, which is a bigger wrong than awarding the lowest grade it
    //     does. Stick to the rubric.
    //
    //     The consequence, stated plainly because it is a grading policy and not
    //     a coding detail: a student who says nothing at all still scores the
    //     bottom rung of every criterion, which on the Discovery rubric is 10
    //     out of 100. That is Tom's ladder working as designed. <==
    const level = chosen ?? criterion.levels[criterion.levels.length - 1];

    const comment =
      got && typeof got.comment === "string" && got.comment.trim()
        ? got.comment.trim()
        : "No evidence of this in the transcript.";

    return {
      id: criterion.id,
      level: level.name,
      // ==> STRAIGHT OUT OF THE RUBRIC. NO ROUNDING, NO CLAMPING, EVER.
      //     Rounding is what the old scorer did and it turned 49.5 into 50.
      //     Clamping is unnecessary because this number was never supplied by
      //     the model: it was looked up here from the criterion's own ladder,
      //     so it cannot be out of range. <==
      points_earned: level.points,
      points_max: criterion.levels[0].points,
      comment,
      scored_by: "ai",
    };
  });

  // Every value in Tom's rubrics is a whole number or a half, and one half is
  // exactly representable in binary floating point, so this sum is exact and
  // needs no rounding to tidy it. Do not add one.
  const total = scoredItems.reduce((sum, item) => sum + item.points_earned, 0);

  return { total, max_total: maxTotal, items: scoredItems };
}
