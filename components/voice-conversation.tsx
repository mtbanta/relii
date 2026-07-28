"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PracticeClock } from "@/components/practice-clock";
import { OPENING_NUDGE } from "@/lib/persona";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
import type { TranscriptTurn } from "@/lib/types";

// The live VOICE conversation with the persona (Alex), over the OpenAI Realtime
// API via WebRTC, with optional WEBCAM RECORDING (Stage 5).
//
// How it works in plain English:
// - The browser asks our server for a short-lived token (it never sees the real
//   OpenAI key), then opens a direct audio connection to OpenAI with that token.
// - Audio flows straight between the browser and OpenAI for the lowest delay.
// - OpenAI sends back a written transcript of both sides over a side "data
//   channel". We show it on screen as it arrives and save each finished turn to
//   our server (the server is still the only thing that writes to the database).
// - If the camera is on, we ALSO record the student's webcam video with a mixed
//   audio track: the student's microphone PLUS Alex's incoming voice, combined
//   with the Web Audio API so the recording is a complete record of the call.
// - Ending the call uploads the recording to private Storage, saves its path,
//   then scores the saved transcript with the same scorer the text demo uses,
//   and shows the results screen. A video problem never loses the score.

// Volume dials for the recording mix (1.0 = unchanged). These let us balance the
// two voices in the saved file without touching the live call. Bump or trim one
// if the student or Alex sounds too quiet on playback.
const MIC_GAIN = 1.0; // the student's microphone
const ALEX_GAIN = 1.0; // Alex's incoming voice

// Recording quality. We cap the bitrate so the file size stays modest and
// predictable (uploads stay reliable and storage stays cheap as we scale). At
// roughly 1.1 Mbps the file is about 8 MB per minute of call, so even a long
// role-play stays well under the bucket's size limit. Raise these for sharper
// video at the cost of bigger files.
const VIDEO_BITS_PER_SECOND = 1_000_000; // ~1 Mbps webcam video
const AUDIO_BITS_PER_SECOND = 96_000; // ~96 kbps for the mixed voices

// Webcam capture settings. We cap the resolution and frame rate so the video
// encoder has less work to do, which keeps recording from competing with the
// live voice call for the processor (the cause of the occasional choppiness in
// early testing). 720p at 24fps is still clear enough for later delivery review.
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 24 },
};

// Where the browser sends its connection request. The token (not the real key)
// authorizes it, and OpenAI returns the matching audio "answer".
const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

// Shown when a graded voice+video submission cannot get the camera (permission
// denied or blocked, no camera, or the camera is in use by another app). The
// camera is required for a graded assignment, so the attempt cannot proceed
// until it is enabled.
const CAMERA_REQUIRED_MESSAGE =
  "Your camera is required for a graded assignment, and it stays on for the whole submission. Please allow camera and microphone access in your browser, then start again. In most browsers, click the camera or lock icon in the address bar, choose Allow, and reload this page.";

// Pick a video format the browser supports, preferring webm. We try VP8 before
// VP9 on purpose: VP8 is lighter to encode, so it leaves more processor headroom
// for the live call (VP9 makes slightly smaller files but costs more CPU, and
// our bitrate cap already bounds the file size). Returns "" if the browser will
// choose its own default.
function pickRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

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
  isSubmission = false,
  conversationOnly = false,
}: {
  sessionId: string;
  personaName: string;
  scenarioTitle: string;
  // A graded submission ends with an explicit submit-and-score confirmation
  // step (its one official attempt), instead of practice's quick pop-up.
  isSubmission?: boolean;
  // A conversation-only case (its scenario has no rubric) is never scored, so
  // the wording must not promise a score that is not coming.
  conversationOnly?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  // The practice clock reached its thirty-minute hard stop; the practice is
  // being auto-ended (practice only; never set for a graded submission).
  const [expired, setExpired] = useState(false);
  const autoEndStartedRef = useRef(false);

  // Camera on/off, chosen before the call. Defaults on, because voice plus video
  // is the graded format, so practice should resemble it.
  const [cameraOn, setCameraOn] = useState(true);

  // For a graded voice+video submission the camera is REQUIRED and LOCKED ON:
  // the student cannot turn it off, and cannot proceed without it. (Practice
  // keeps the normal on/off toggle.) This component only renders for voice_video,
  // so isSubmission here always means a graded voice+video submission. We read an
  // EFFECTIVE camera value so the rest of the call logic stays unchanged: forced
  // on for a submission, the student's choice for practice.
  const cameraLocked = isSubmission;
  const effectiveCameraOn = cameraLocked || cameraOn;

  // The transcript is the source of truth in a ref (so event handlers always see
  // the latest), with a counter to trigger re-renders when it changes.
  const turnsRef = useRef<LiveTurn[]>([]);
  const [, forceRender] = useReducer((n) => n + 1, 0);

  // Connection objects we need to clean up at the end.
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  // The student's local camera+mic stream (audio-only if the camera is off). Its
  // audio track feeds the call; its video track (if any) drives the self-view
  // and the recording.
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selfViewRef = useRef<HTMLVideoElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Recording machinery (only used when the camera is on).
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recordingEnabledRef = useRef(false); // was the camera on when we started?
  const recordingStartedRef = useRef(false); // guard so we only start once

  // A short status line shown while the call is wrapping up ("Saving your
  // recording...", then "Scoring...").
  const [endNote, setEndNote] = useState("");

  // Keep the newest line in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  // Show the live self-view once we have the camera stream.
  useEffect(() => {
    if (
      selfViewRef.current &&
      localStreamRef.current &&
      (status === "connecting" || status === "live" || status === "ending")
    ) {
      selfViewRef.current.srcObject = localStreamRef.current;
    }
  }, [status]);

  // Tear everything down if the student navigates away mid-call.
  useEffect(() => {
    return () => cleanup();
  }, []);

  // SINGLE CONTROL POINT for whether the practice clock is running. The clock is
  // a practice-only feature, so it never runs for a graded submission, and it
  // only advances while the call is live. Piece 6's pause will stop the clock by
  // AND-ing `&& !paused` here; nothing else changes.
  const clockActive = !isSubmission && status === "live" && !expired;

  // When the clock hits the thirty-minute hard stop, end the call the SAME way
  // the student's End button does (endCall, which reuses /api/session/end). Fire
  // once, only from a live call.
  useEffect(() => {
    if (!expired || autoEndStartedRef.current) return;
    if (status !== "live") return;
    autoEndStartedRef.current = true;
    void endCall();
    // endCall is intentionally omitted from deps: it is guarded to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, status]);

  function cleanup() {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
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
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    if (selfViewRef.current) {
      selfViewRef.current.srcObject = null;
    }
    dcRef.current = null;
    pcRef.current = null;
    localStreamRef.current = null;
    audioCtxRef.current = null;
  }

  // --- Recording --------------------------------------------------------------

  // Start recording the webcam video together with a mixed audio track (the
  // student's mic + Alex's incoming voice). Called once, when Alex's audio track
  // arrives, so both sides are available to mix. Any failure here is swallowed:
  // a recording problem must never break the call, the transcript, or the score.
  function startRecording(remoteStream: MediaStream) {
    if (recordingStartedRef.current) return;
    const local = localStreamRef.current;
    const videoTrack = local?.getVideoTracks()[0];
    if (!local || !videoTrack) return; // camera off; nothing to record

    try {
      const AudioCtx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      void audioCtx.resume();

      const dest = audioCtx.createMediaStreamDestination();

      // The student's microphone, through its own volume dial, into the mix.
      const micSource = audioCtx.createMediaStreamSource(local);
      const micGain = audioCtx.createGain();
      micGain.gain.value = MIC_GAIN;
      micSource.connect(micGain).connect(dest);

      // Alex's incoming voice, through its own volume dial, into the mix. This is
      // only a tap; Alex still plays through the <audio> element unchanged.
      const remoteSource = audioCtx.createMediaStreamSource(remoteStream);
      const remoteGain = audioCtx.createGain();
      remoteGain.gain.value = ALEX_GAIN;
      remoteSource.connect(remoteGain).connect(dest);

      // The file's audio = the mixed track; the file's video = the webcam.
      const mixedAudioTrack = dest.stream.getAudioTracks()[0];
      const recordStream = new MediaStream([videoTrack, mixedAudioTrack]);

      const mimeType = pickRecordingMimeType();
      const recorder = new MediaRecorder(recordStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      recordingStartedRef.current = true;
    } catch (err) {
      console.error("Could not start the recording:", err);
      // Leave recordingStartedRef false-ish but do not throw; the call goes on.
    }
  }

  // Stop the recorder and hand back the finished clip (or null if there is none).
  function stopRecording(): Promise<Blob | null> {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        if (!chunks.length) {
          resolve(null);
          return;
        }
        const blob = new Blob(chunks, {
          type: chunks[0].type || "video/webm",
        });
        resolve(blob);
      };
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });
  }

  // Upload the finished recording to private Storage, then tell the server to
  // record its path on the session. Throws if any step fails, so the caller can
  // treat it as "no video saved" and carry on to scoring.
  async function uploadVideo(blob: Blob) {
    // 1. Ask our server for a one-time signed upload link (the server picks the
    //    path; the browser never sees the service-role key).
    const urlRes = await fetch("/api/voice/video/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const urlData = await urlRes.json();
    if (!urlRes.ok) {
      throw new Error(urlData?.error ?? "Could not prepare the video upload.");
    }

    // 2. Send the file straight to Supabase Storage with that signed link.
    const supabase = createBrowserSupabase();
    const { error: uploadError } = await supabase.storage
      .from(SESSION_VIDEOS_BUCKET)
      .uploadToSignedUrl(urlData.path, urlData.token, blob, {
        contentType: "video/webm",
      });
    if (uploadError) throw uploadError;

    // 3. Record the path on the session row (server-side write).
    const saveRes = await fetch("/api/voice/video/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (!saveRes.ok) {
      const saveData = await saveRes.json().catch(() => ({}));
      throw new Error(saveData?.error ?? "Could not save the recording.");
    }
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
    setEndNote("");
    recordingStartedRef.current = false;
    setStatus("connecting");

    try {
      // 1. Ask for the camera and microphone in ONE prompt. If the camera is
      //    off, ask for the microphone only (today's behavior). The capped video
      //    settings keep the encoder light so it does not compete with the call.
      const localStream = await navigator.mediaDevices.getUserMedia(
        effectiveCameraOn
          ? { video: VIDEO_CONSTRAINTS, audio: true }
          : { audio: true },
      );
      localStreamRef.current = localStream;
      recordingEnabledRef.current =
        effectiveCameraOn && localStream.getVideoTracks().length > 0;

      // Show the self-view right away (muted, so there is no feedback).
      if (selfViewRef.current) {
        selfViewRef.current.srcObject = localStream;
      }

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

      // 3. Open the peer connection. Play Alex's incoming audio, and (if the
      //    camera is on) start the recording once Alex's audio track arrives, so
      //    both voices are available to mix.
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (e) => {
        const remoteStream = e.streams[0];
        if (audioRef.current) {
          audioRef.current.srcObject = remoteStream;
          audioRef.current.play().catch(() => {
            /* autoplay may need a click; the Start button click covers it */
          });
        }
        if (recordingEnabledRef.current) {
          startRecording(remoteStream);
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          setError(
            conversationOnly
              ? "The voice connection dropped. End the session to keep what you have, or try again."
              : "The voice connection dropped. End the session to score what you have, or try again.",
          );
        }
      };

      // 4. Send only the MICROPHONE audio to OpenAI (the call is audio-only; the
      //    webcam video is for the recording, not for OpenAI).
      localStream
        .getAudioTracks()
        .forEach((track) => pc.addTrack(track, localStream));

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
      // A graded submission cannot proceed without the camera. If asking for the
      // camera/mic failed (denied, blocked, missing, or in use), show the clear
      // "camera required" guidance instead of the raw browser error.
      const mediaAccessError =
        err instanceof DOMException &&
        [
          "NotAllowedError",
          "NotFoundError",
          "NotReadableError",
          "OverconstrainedError",
          "SecurityError",
          "AbortError",
        ].includes(err.name);
      if (cameraLocked && mediaAccessError) {
        setError(CAMERA_REQUIRED_MESSAGE);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Could not start the voice session. Please allow camera and microphone access and try again.",
        );
      }
    }
  }

  // --- Ending -----------------------------------------------------------------

  // Clicking the header button. Practice confirms with a quick pop-up; a graded
  // submission opens an explicit inline confirmation step instead.
  function requestEndCall() {
    if (status === "ending" || status === "ended") return;
    if (isSubmission) {
      setConfirming(true);
      return;
    }
    const ok = window.confirm(
      conversationOnly
        ? "End this session? You will not be able to add more. This practice is not scored."
        : "End this session and see your score? You will not be able to add more.",
    );
    if (ok) void endCall();
  }

  async function endCall() {
    if (status === "ending" || status === "ended") return;

    setConfirming(false);
    setError("");
    setStatus("ending");

    // Stop the recording first and grab the finished clip while the streams are
    // still alive, then tear down the call and make sure the transcript is saved.
    const blob = recordingEnabledRef.current ? await stopRecording() : null;
    cleanup();
    await saveTranscript();

    // Upload the recording if we have one. A video problem must NEVER lose the
    // score: if the upload fails we just note it and carry on to scoring, leaving
    // video_path null. The student still gets their transcript and score.
    let videoFailed = false;
    if (blob) {
      setEndNote("Saving your recording...");
      try {
        await uploadVideo(blob);
      } catch (err) {
        console.error("Video upload failed:", err);
        videoFailed = true;
      }
    }

    // Always finish the session, no matter what happened to the video. For a
    // graded case that means scoring it; a conversation-only case just ends.
    setEndNote(conversationOnly ? "Finishing..." : "Scoring...");
    try {
      const res = await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error ??
            (conversationOnly
              ? "Could not end the session."
              : "Could not score the session."),
        );
      }
      setStatus("ended");
      router.push(
        `/student/session/${sessionId}/results${videoFailed ? "?videoError=1" : ""}`,
      );
    } catch (err) {
      // Finishing failed (rare). The transcript is saved, so the student can
      // click End again to retry; the recording, if any, is already uploaded.
      setStatus("live");
      setEndNote("");
      setError(
        err instanceof Error
          ? err.message
          : conversationOnly
            ? "Could not end the session."
            : "Could not score the session.",
      );
    }
  }

  // --- Screen -----------------------------------------------------------------

  const turns = turnsRef.current;
  const canEnd = status === "live" || status === "ending";
  const showSelfView =
    recordingEnabledRef.current &&
    (status === "connecting" || status === "live");

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col">
      <audio ref={audioRef} autoPlay hidden />

      <header className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
        <div>
          <h1 className="text-lg font-semibold">{scenarioTitle}</h1>
          <p className="text-sm text-gray-500">
            {isSubmission ? "Graded submission with " : "Voice call with "}
            {personaName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isSubmission &&
            (status === "live" ||
              status === "ending" ||
              status === "ended") && (
              <PracticeClock
                active={clockActive}
                onExpire={() => setExpired(true)}
              />
            )}
          <button
            onClick={requestEndCall}
            disabled={!canEnd}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {status === "ending"
              ? "Finishing..."
              : isSubmission
                ? "Submit assignment"
                : "End session"}
          </button>
        </div>
      </header>

      {/* Graded submission: the explicit submit-and-score step. */}
      {isSubmission && confirming && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="text-amber-900">
            Submit this graded assignment for scoring? This ends the call and is
            your one official attempt; it cannot be redone.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
            >
              Keep talking
            </button>
            <button
              onClick={endCall}
              className="rounded-md bg-black px-3 py-1.5 text-white"
            >
              Submit and score
            </button>
          </div>
        </div>
      )}

      {expired && (
        <p className="mb-3 text-sm text-red-600">
          Time is up. Ending your practice...
        </p>
      )}

      {/* The live self-view, shown while the camera is recording. */}
      {showSelfView && (
        <div className="mb-3 flex items-center gap-3">
          <video
            ref={selfViewRef}
            autoPlay
            muted
            playsInline
            className="h-28 w-40 rounded-md border border-gray-200 bg-black object-cover"
          />
          <p className="text-xs text-gray-500">
            Your camera is on and recording.
          </p>
        </div>
      )}

      {/* Before the call: a short explainer, the camera toggle, and a Start
          button. Starting from a click also lets the browser play Alex's audio. */}
      {status === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="max-w-md text-gray-600">
            You are about to start{" "}
            {isSubmission
              ? "your graded voice submission"
              : "a spoken practice call"}{" "}
            with {personaName}. Your browser will ask to use your camera and
            microphone. {personaName} will speak first, then you reply by
            talking. Speak naturally, and click{" "}
            <span className="font-medium">
              {isSubmission ? "Submit assignment" : "End session"}
            </span>{" "}
            when you are done.
            {isSubmission && (
              <>
                {" "}
                This is a single, one-time attempt: if you leave before
                submitting, it cannot be resumed.
              </>
            )}
          </p>

          {cameraLocked ? (
            // Graded submission: the camera is required and locked on. No toggle.
            <div className="mt-5 max-w-md rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-center">
              <p className="text-sm text-gray-700">
                Your camera will stay on for this graded submission.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Camera stays on for graded assignments. It can be turned off in
                practice. Tip: wear headphones to avoid echo in the recording.
              </p>
            </div>
          ) : (
            <>
              <label className="mt-5 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cameraOn}
                  onChange={(e) => setCameraOn(e.target.checked)}
                  className="h-4 w-4"
                />
                Record my camera during this practice
              </label>
              <p className="mt-1 max-w-md text-xs text-gray-400">
                {cameraOn
                  ? "Your webcam will record (video plus your voice and Alex's voice). Tip: wear headphones to avoid echo in the recording."
                  : "Camera off: nothing will be recorded for this practice."}
              </p>
            </>
          )}

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
            Connecting... allow camera and microphone access if your browser asks.
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
              : status === "ending"
                ? endNote || "Finishing..."
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
                    {turn.text || <span className="opacity-60">...</span>}
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
