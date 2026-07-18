// Shared data shapes used across the role-play feature.

// One line of the saved conversation. "persona" is the AI (Alex); "student" is
// the human sales rep. Stored as a JSON list on sessions.transcript.
export type TranscriptTurn = {
  role: "persona" | "student";
  text: string;
  at: string; // ISO timestamp
};

// One scored rubric line, saved inside sessions.score.items.
export type ScoreItem = {
  id: string;
  points_earned: number;
  points_max: number;
  comment: string;
  scored_by: "ai";
};

// The full itemized score, saved to sessions.score.
export type SessionScore = {
  total: number;
  max_total: number;
  items: ScoreItem[];
};

// Which of the two meetings a scenario is, stored on scenarios.meeting_type and
// matched against each rubric item's "meetings" tags. The database enforces the
// same two values with a check constraint.
export type MeetingType = "discovery" | "presentation";

export function isMeetingType(value: unknown): value is MeetingType {
  return value === "discovery" || value === "presentation";
}

// A single rubric line as stored in rubrics.items.
export type RubricItem = {
  id: string;
  category?: string;
  label: string;
  points: number;
  applies_to: "both" | "voice-only";
  guidance?: string;
  meetings: string[];
};
