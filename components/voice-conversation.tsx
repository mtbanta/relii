"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OPENING_NUDGE } from "@/lib/persona";
import type { TranscriptTurn } from "@/lib/types";

// The live VOICE conversation with the persona (Alex), over the OpenAI Realtime
// API via WebRTC.
//
// How it works in plain English:
// - The browser asks our server for a short-lived token (it never sees the real
//   OpenAI key), then opens a direct audio connection to OpenAI with that token.
// - Audio flows straight between the browser and OpenAI for the lowest delay.
// - OpenAI sends back a written transcript of both sides over a side "data
//   channel". We show it on screen as it arrives and save each finished turn to
//   our server (the server is still the only thing that writes to the database).
// - Ending the call scores the saved transcript with the same scorer the text
//   demo uses, then shows the results screen.

// Where the browser sends its connection request. The token (not the real key)
// authorizes it, and OpenAI returns the matching audio "answer".
const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

// One line of the live transcript while the call is happening. itemId ties it to
// the matching item in OpenAI's conversation so streaming text lands in the
// right turn; done means the turn is finished and safe to save.
type LiveTurn = {
  itemId: string;
  role: "persona" | "student";
  text: string;
  done: boolean;
  at: string;
};

// A loose shape for the events OpenAI sends over the data channel. We only read
// the few fields we care about and ignore the rest.
type RealtimeEvent = {
  type?: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  item?: { id?: string; role?: string };
  error?: { message?: string };
};

type Status = "idle" | "connecting" | "live" | "ending" | "ended";

export function VoiceConversation({
  sessionId,
  personaName,
  scenarioTitle,
}: {
  sessionId: string;
  personaName: string;
  scenarioTitle: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  // The transcript is the source of truth in a ref (so event handlers always see
  // the latest), with a counter to trigger re-renders when it changes.
  const turnsRef = useRef<LiveTurn[]>([]);
  const [, forceRender] = useReducer((n) => n + 1, 0);

  // Connection objects we need to clean up at the end.
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the newest line in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  // Tear everything down if the student navigates away mid-call.
  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    try {
      dcRef.current?.close();
    } catch {
      /* ignore */
    }
    try {
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    dcRef.current = null;
    pcRef.current = null;
    micStreamRef.current = null;
  }

  // --- Transcript building ----------------------------------------------------

  // Make sure a turn exists for this item id (in arrival order), then return it.
  function ensureTurn(itemId: string, role: "persona" | "student"): LiveTurn {
    let turn = turnsRef.current.find((t) => t.itemId === itemId);
    if (!turn) {
      turn = {
        itemId,
        role,
        text: "",
        done: false,
        at: new Date().toISOString(),
      };
      turnsRef.current.push(turn);
    }
    return turn;
  }

  function appendText(itemId: string, role: "persona" | "student", delta: string) {
    const turn = ensureTurn(itemId, role);
    turn.text += delta;
    forceRender();
  }

  function finalizeTurn(
    itemId: string,
    role: "persona" | "student",
    finalText: string | undefined,
  ) {
    const turn = ensureTurn(itemId, role);
    if (typeof finalText === "string" && finalText.trim()) {
      turn.text = finalText;
    }
    turn.done = true;
    forceRender();
    void saveTranscript();
  }

  // Save the finished turns to our server (the server writes the database). Sends
  // the whole conversation so far, so the saved order is always correct.
  async function saveTranscript() {
    const transcript: TranscriptTurn[] = turnsRef.current
      .filter((t) => t.done && t.text.trim())
      .map((t) => ({ role: t.role, text: t.text.trim(), at: t.at }));
    try {
      await fetch("/api/voice/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, transcript }),
      });
    } catch {
      // A failed mid-call save is not fatal; the next finished turn re-sends the
      // whole transcript, and we also save again right before scoring.
    }
  }

  // --- Handling events from OpenAI -------------------------------------------

  function handleEvent(raw: string) {
    let msg: RealtimeEvent;
    try {
      msg = JSON.parse(raw) as RealtimeEvent;
    } catch {
      return;
    }
    const itemId = msg.item_id;

    switch (msg.type) {
      // The student finished speaking and OpenAI created their turn. Create the
      // placeholder now so it sits before Alex's reply in the transcript, even
      // though the student's transcribed words may arrive a moment later.
      case "input_audio_buffer.committed":
        if (itemId) ensureTurn(itemId, "student");
        break;

      // The student's transcribed words (streaming, then final).
      case "conversation.item.input_audio_transcription.delta":
        if (itemId && typeof msg.delta === "string")
          appendText(itemId, "student", msg.delta);
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (itemId) finalizeTurn(itemId, "student", msg.transcript);
        break;

      // Alex's spoken reply, as text (streaming, then final).
      case "response.output_audio_transcript.delta":
        if (itemId && typeof msg.delta === "string")
          appendText(itemId, "persona", msg.delta);
        break;
      case "response.output_audio_transcript.done":
        if (itemId) finalizeTurn(itemId, "persona", msg.transcript);
        break;

      case "error":
        console.error("Realtime error event:", msg.error);
        break;

      default:
        break;
    }
  }

  // --- Connecting -------------------------------------------------------------

  async function startCall() {
    if (status !== "idle") return;
    setError("");
    setStatus("connecting");

    try {
      // 1. Ask for the microphone.
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      micStreamRef.current = micStream;

      // 2. Get a short-lived token from our server (mints with the real key).
      const tokenRes = await fetch("/api/voice/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(
          tokenData?.error ?? "Could not start the voice session.",
        );
      }
      const ephemeralToken: string = tokenData.value;

      // 3. Open the peer connection. Play Alex's incoming audio.
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current.play().catch(() => {
            /* autoplay may need a click; the Start button click covers it */
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          setError(
            "The voice connection dropped. End the session to score what you have, or try again.",
          );
        }
      };

      // 4. Send the microphone audio.
      micStream.getTracks().forEach((track) => pc.addTrack(track, micStream));

      // 5. Open the data channel for the transcript and control messages.
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => handleEvent(e.data);
      dc.onopen = () => {
        // Nudge Alex to open the meeting first. This nudge is sent as a hidden
        // message and is NOT saved to the transcript; only Alex's resulting
        // greeting is captured. Mirrors how the text demo opens the meeting.
        try {
          dc.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: OPENING_NUDGE }],
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
        } catch {
          /* ignore; if this fails the student can simply speak first */
        }
      };

      // 6. Create the offer and exchange it with OpenAI for an answer.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(OPENAI_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });
      if (!sdpRes.ok) {
        const detail = await sdpRes.text();
        throw new Error(`Voice connection failed (${sdpRes.status}): ${detail}`);
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setStatus("live");
    } catch (err) {
      console.error("startCall failed:", err);
      cleanup();
      setStatus("idle");
      setError(
        err instanceof Error
          ? err.message
          : "Could not start the voice session. Please allow microphone access and try again.",
      );
    }
  }

  // --- Ending -----------------------------------------------------------------

  async function endCall() {
    if (status === "ending" || status === "ended") return;
    const ok = window.confirm(
      "End this session and see your score? You will not be able to add more.",
    );
    if (!ok) return;

    setError("");
    setStatus("ending");

    // Stop the audio first so nothing keeps talking, then make sure the latest
    // transcript is saved before scoring.
    cleanup();
    await saveTranscript();

    try {
      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Could not score the session.");
      }
      setStatus("ended");
      router.push(`/student/session/${sessionId}/results`);
    } catch (err) {
      setStatus("live");
      setError(
        err instanceof Error ? err.message : "Could not score the session.",
      );
    }
  }

  // --- Screen -----------------------------------------------------------------

  const turns = turnsRef.current;
  const canEnd = status === "live" || status === "ending";

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col">
      <audio ref={audioRef} autoPlay hidden />

      <header className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
        <div>
          <h1 className="text-lg font-semibold">{scenarioTitle}</h1>
          <p className="text-sm text-gray-500">Voice call with {personaName}</p>
        </div>
        <button
          onClick={endCall}
          disabled={!canEnd}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {status === "ending" ? "Scoring..." : "End session"}
        </button>
      </header>

      {/* Before the call: a short explainer and a Start button. Starting from a
          click also lets the browser play Alex's audio. */}
      {status === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="max-w-md text-gray-600">
            You are about to start a spoken practice call with {personaName}. Your
            browser will ask to use your microphone. {personaName} will speak
            first, then you reply by talking. Speak naturally, and click{" "}
            <span className="font-medium">End session</span> when you are done to
            see your score.
          </p>
          <button
            onClick={startCall}
            className="mt-6 rounded-md bg-black px-5 py-2.5 text-sm text-white"
          >
            Start call
          </button>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      )}

      {status === "connecting" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-gray-600">
            Connecting... allow microphone access if your browser asks.
          </p>
        </div>
      )}

      {/* During and after the call: the live transcript. */}
      {(status === "live" || status === "ending" || status === "ended") && (
        <>
          <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            {status === "live"
              ? "Live. Speak naturally; pause when you finish a thought."
              : "Call ended."}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {turns.length === 0 && (
              <p className="text-sm text-gray-400">
                {personaName} will speak first. The conversation will appear here
                as you talk.
              </p>
            )}
            {turns.map((turn) => (
              <div
                key={turn.itemId}
                className={
                  turn.role === "student" ? "flex justify-end" : "flex justify-start"
                }
              >
                <div
                  className={
                    turn.role === "student"
                      ? "max-w-[80%] rounded-2xl bg-black px-4 py-2 text-sm text-white"
                      : "max-w-[80%] rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-900"
                  }
                >
                  <p className="mb-0.5 text-xs font-medium opacity-70">
                    {turn.role === "student" ? "You" : personaName}
                  </p>
                  <p className="whitespace-pre-wrap">
                    {turn.text || (
                      <span className="opacity-60">...</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
