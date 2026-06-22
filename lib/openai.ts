// Server-side OpenAI helper.
//
// The API key is read from the environment and used only here, on the server.
// It is never exposed to the browser. We call OpenAI's web API directly with
// the built-in fetch, so there is no extra software dependency to install.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// Which model to use. Defaults to gpt-4o; override with the OPENAI_MODEL env var.
export function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o";
}

// Run one chat completion and return the assistant's text reply.
// Pass responseFormat to force structured JSON output (used by the scorer).
export async function chatComplete(options: {
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: unknown;
  seed?: number;
}): Promise<string> {
  // Strip any whitespace or line breaks. Long keys often pick up a stray line
  // break when pasted into a hosting dashboard, and an Authorization header
  // cannot contain newlines, so we clean it before use.
  const apiKey = process.env.OPENAI_API_KEY?.replace(/\s/g, "");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in the environment.");
  }

  const body: Record<string, unknown> = {
    model: getModel(),
    messages: options.messages,
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.responseFormat) body.response_format = options.responseFormat;
  // A fixed seed makes sampling reproducible, so re-scoring is consistent.
  if (options.seed !== undefined) body.seed = options.seed;

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const content: unknown = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI returned an unexpected response shape.");
  }
  return content;
}
