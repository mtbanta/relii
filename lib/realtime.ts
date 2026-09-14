// Server-side helper for the OpenAI Realtime API (voice role-play).
//
// The browser never uses the real OpenAI key. Instead this code (on the server)
// uses the real key to mint a short-lived "client secret" (an ephemeral token
// that expires after about a minute). The browser uses only that token to open
// the voice connection. The real key stays server-side, which is the hard
// security rule for this stage.
//
// We call OpenAI's web API directly with the built-in fetch, so there is no
// extra software dependency to install (same approach as lib/openai.ts).

const OPENAI_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";

// The spoken voice Alex uses. "cedar" is one of the newer, natural-sounding
// realtime voices and reads as neutral, which fits the Alex persona. Change this
// one value to swap voices later.
export const REALTIME_VOICE = "cedar";

// The model that turns the student's speech into text for the transcript. This
// is separate from the conversation model and only affects transcript quality.
const INPUT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

// Which realtime conversation model to use. Defaults to gpt-realtime (the
// standard, higher-quality model). Override with the OPENAI_REALTIME_MODEL env
// var, mirroring how OPENAI_MODEL works for the text demo, so we can swap models
// without code changes.
export function getRealtimeModel(): string {
  return process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime";
}

// Mint a short-lived client secret for one voice session. The persona
// instructions, voice, turn-taking, and transcription settings are baked into
// the token here, so the browser cannot change them.
export async function mintRealtimeClientSecret(instructions: string): Promise<{
  value: string;
  expiresAt: number | null;
  model: string;
}> {
  // Strip any stray whitespace/line breaks (a common dashboard paste artifact),
  // the same cleanup the text demo does for the key.
  const apiKey = process.env.OPENAI_API_KEY?.replace(/\s/g, "");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in the environment.");
  }

  const model = getRealtimeModel();

  const body = {
    session: {
      type: "realtime",
      model,
      // The persona prompt plus scenario context, identical to the text demo.
      instructions,
      audio: {
        input: {
          // Transcribe the student's speech so it lands in the saved transcript
          // (the transcript is the only input to scoring).
          //
          // "language" tells the transcriber what to expect to hear. Tom's
          // September 11 practice came back with two English turns rendered in
          // Finnish and Arabic, and a mis-transcribed turn is graded as
          // gibberish without the student ever learning why.
          //
          // ==> IT IS THE SINGULAR FIELD HERE, AND THAT IS MEASURED RATHER THAN
          //     ASSUMED. The plural "languages" is the field on the CURRENT
          //     transcription models, and this model is not one of them:
          //     gpt-4o-transcribe answers a request carrying "languages" with
          //     HTTP 400, "The 'languages' parameter is not supported for this
          //     model." The client-secrets response advertises this model's own
          //     schema as "language" and "prompt", singular, with no plural key
          //     at all. DO NOT "CORRECT" THIS TO THE PLURAL: doing so returns
          //     400 on every mint, which app/api/voice/token/route.ts turns
          //     into a 502 and NO VOICE AT ALL for the student.
          //
          //     Sending both is refused too, so the two are alternatives and
          //     never a pair.
          //
          //     WHAT IT FIXES AND WHAT IT DOES NOT. Measured 2026-09-14 over a
          //     paired run, same audio, 8 sessions each way: with the hint, 72
          //     of 72 turns transcribed as English; without it, a short "Yeah."
          //     came back as German "Ja." on 6 of 8 runs. It addresses
          //     MIS-DETECTION ONLY. The empty and truncated turns in Tom's
          //     practice are turn-detection and missing-text problems, neither
          //     of them is touched by this line, and neither was reproduced.
          transcription: { model: INPUT_TRANSCRIPTION_MODEL, language: "en" },
          // Server-side voice-activity detection decides when the student has
          // finished a turn. silence_duration_ms is the main "do not cut me off"
          // dial: a longer silence means Alex waits longer before replying.
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            // How long the student can pause before Alex decides they are done
            // and replies. Raised to 1600ms (from 800ms) so the student has room
            // to gather a thought mid-sentence without being cut off.
            silence_duration_ms: 1600,
            // Let Alex reply automatically when the student stops, and let the
            // student interrupt (talk over) Alex if they jump back in.
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: REALTIME_VOICE },
      },
    },
  };

  const res = await fetch(OPENAI_CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `OpenAI client-secret request failed (${res.status}): ${detail}`,
    );
  }

  const data = await res.json();
  const value: unknown = data?.value;
  if (typeof value !== "string") {
    throw new Error("OpenAI returned an unexpected client-secret shape.");
  }
  const expiresAt = typeof data?.expires_at === "number" ? data.expires_at : null;

  return { value, expiresAt, model };
}
