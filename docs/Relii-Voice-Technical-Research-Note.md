# Relii Voice Technical Research Note

Reference for the voice stage (Claude Code build step 4) and the model bake-off. No code, just the decisions and numbers so the voice work starts informed. Prepared June 9, 2026. Pricing and latency change often, so reconfirm at build time.

## The architecture in plain English

- Voice uses the OpenAI Realtime API. The student's browser connects directly to OpenAI over WebRTC, which OpenAI recommends for browsers because it gives the lowest and most consistent latency.
- The browser must never use your real OpenAI key. Instead, your server mints a short-lived ephemeral token (a client secret that expires after about one minute) using the real key server-side, and the browser uses that token to open the voice session. The real key stays server-only, which satisfies our hard key-safety rule.
- The flow: the browser asks our server to start a session, our server calls OpenAI with the real key to mint an ephemeral token, the browser opens a WebRTC connection to OpenAI using that token, and audio then flows directly between the browser and OpenAI for low latency. Our server supplies the persona prompt and session settings.

## Latency expectations

- Glass-to-glass latency is roughly 500 to 1,200 ms on the first turn and 300 to 600 ms on later turns. It feels human under about 1,200 ms on the first turn and 600 ms after. Over about 2 seconds and it feels like the call dropped.
- Our build-plan target is sub-2-second responses, which WebRTC comfortably meets.
- The biggest latency wins are using WebRTC rather than WebSockets from the browser, keeping playback buffers small, and tuning voice-activity detection so Alex does not cut the student off.

## Model options

- gpt-realtime (standard): best quality and reasoning. Audio runs about $32 per 1M input tokens and $64 per 1M output tokens, which works out to roughly $0.18 to $0.46 per minute uncached (about $0.30 a common midpoint), dropping to about $0.05 to $0.10 per minute with prompt caching.
- gpt-realtime-mini: faster and cheaper (about $0.60 per 1M input tokens and $2.40 per 1M output tokens), optimized for low latency, but weaker at nuanced reasoning. Quality can suffer when pushed on subtle persona behavior.
- Recommendation: a sales persona that must stay in character, withhold information until earned, and react to nuance is exactly the kind of nuance the mini model can fumble. Lead with gpt-realtime for quality, and only consider the mini for cost if quality holds up in testing. Settle it in the bake-off.

## Cost ballpark for Relii

- 25 students doing about 10 sessions of roughly 15 minutes is about 3,750 minutes per semester.
- At about $0.30 per minute uncached that is roughly $1,125. With prompt caching at about $0.08 per minute it is roughly $300. So a few hundred dollars for the semester, matching the earlier estimate.
- The 270-student version scales close to 10 times that, so caching and model choice matter much more there. This is a v2 planning point, not a v1 one.
- The Realtime API also produces a transcript, which we save through the same transcript pipeline as the text demo.

## Turn detection and interruptions

- Use OpenAI's server-side voice-activity detection for turn-taking, and optionally a lightweight client-side detector (Silero or the browser Web Audio API) so the interface feels responsive before the first packet reaches the server.
- Tuning this is the main user-experience risk. Detection that ends the student's turn too early (cutting them off) is the most common way these demos feel broken, so budget testing time for it.

## How this connects to our stack

- The voice session reuses the same persona prompt (the scenario's persona_system_prompt) and the same transcript-saving pipeline built for the text demo. Voice replaces only the input and output layer. Scenarios, sessions, transcripts, and scoring stay the same.
- Webcam recording (the stage after voice, using the browser MediaRecorder) runs alongside the call. The webcam video capture is separate from the Realtime audio.

## Risks and watch items

- Voice-activity-detection tuning is the main user-experience risk (false turn-ends). Budget testing time.
- First-turn latency is the highest, so a brief connecting state on screen helps the student understand the short wait.
- Cost scales linearly with minutes. Enable prompt caching and watch the OpenAI usage dashboard, especially before any 270-student expansion.
- The ephemeral-token flow is mandatory. The real key must never reach the browser, and the security pass checks for this.

## Recommendation summary

- Browser connects over WebRTC to the OpenAI Realtime API, authenticated by server-minted ephemeral tokens so the real key stays server-side.
- Start with gpt-realtime (standard) for persona quality, and bake it off against gpt-realtime-mini for cost.
- Target sub-2-second responses, tune voice-activity detection, and enable prompt caching.
- Reuse the persona and transcript pipeline from the text demo. Voice is an input/output swap, not a rebuild.

## Sources

- [Realtime API with WebRTC, OpenAI](https://platform.openai.com/docs/guides/realtime-webrtc)
- [Realtime and audio guide, OpenAI](https://developers.openai.com/api/docs/guides/realtime)
- [Client secrets (ephemeral tokens), OpenAI API reference](https://developers.openai.com/api/reference/typescript/resources/realtime/subresources/client_secrets)
- [Integrating OpenAI Realtime API with WebRTC, SIP, and WebSockets, Forasoft](https://www.forasoft.com/blog/article/openai-realtime-api-webrtc-sip-websockets-integration)
- [How OpenAI scales low latency realtime voice AI, n1n.ai](https://explore.n1n.ai/blog/how-openai-scales-low-latency-realtime-voice-ai-2026-05-05)
- [GPT Realtime Mini pricing 2026, eesel](https://www.eesel.ai/blog/gpt-realtime-mini-pricing)
- [GPT-Realtime mini model, OpenAI](https://developers.openai.com/api/docs/models/gpt-realtime-mini)
- [OpenAI API pricing](https://openai.com/api/pricing/)
- [OpenAI Realtime cost per minute math 2026, CallSphere](https://callsphere.ai/blog/vw2c-openai-realtime-cost-per-minute-math-2026)
