# English-only transcription

**One file, one object, one field.** No migration, no schema change, no new dependency. If you find that anything else must change for this to work, **stop and say why.**

**WHY IT RUNS NOW, AHEAD OF ALEX GEOGRAPHY AND RAPPORT (D2).** Registration week started September 14, students practise this week, and **the transcript is the only input to scoring**. A mis-transcribed turn is graded as gibberish and the student never learns why. D2 is quality of experience; this is correctness on live student work.

**THE EVIDENCE, from Tom's own September 11 practice.** A student turn reading `Moikka!` (Finnish). A student turn reading `دررست.` (Arabic script). Two student turns rendered empty. **The student was speaking English throughout.** These are short-utterance language mis-detections, which is exactly what a language hint exists to prevent.

**Before anything else, state the filename and line count you read.**

## READ FIRST

- **`PROJECT_STATE.md`, Current Stage and Open Issues.**
- **`lib/realtime.ts` in full.** It is 106 lines and the whole change lives in it.

**LINE NUMBERS WERE RE-VERIFIED ON 2026-09-14 AGAINST `cccda6a`, EVERY ONE OF THEM, AND ALL WERE EXACT.** The change brief verified against `cad67fa`; the only commit since touched `PROJECT_STATE.md` alone, so nothing moved. **Re-verify before you edit, and report anything that drifted.**

==> **THERE ARE UNPUSHED COMMITS WAITING FOR YOU, AND THEY ARE THIS FILE. YOU PUSH THEM.** This kickoff was written in a Cowork session that **cannot push**: github.com is not on that session's egress allowlist, so it commits and stops. **The owner does not push. You do, for every commit in this repo, including the ones you did not make.** Run `git log --oneline origin/main..main` before you start and name what you find. <==

**STATE YOUR PLAN AND WAIT FOR APPROVAL.**

---

## Where the change goes

**`lib/realtime.ts`.** The transcription config is a single object.

| Line | What is there |
| :-- | :-- |
| **18** | `export const REALTIME_VOICE = "cedar";` **Do not touch.** Persona voice is Phase 3c, a separate session with a migration. |
| **22** | `const INPUT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";` |
| **35** | `export async function mintRealtimeClientSecret(instructions: string)` |
| **59** | `transcription: { model: INPUT_TRANSCRIPTION_MODEL },` inside `session.audio.input` |
| **70** | `silence_duration_ms: 1600` inside `turn_detection`. **Do not touch.** |

**`mintRealtimeClientSecret` has exactly one caller:** `app/api/voice/token/route.ts` line **89**, inside a try block at line 88. Confirmed by search, not assumed.

**NOTHING ELSE IN THE APP TRANSCRIBES.** The text practice path (`app/api/chat/route.ts`) has no audio. The only other mentions anywhere are the two client-side event handlers in `components/voice-conversation.tsx` at lines **490** and **494**, which consume transcription results and do not configure anything.

---

## ==> THE FIELD IS `languages`, PLURAL, AND IT IS AN ARRAY. AND THERE IS A REAL UNCERTAINTY UNDER IT. <==

**Checked against OpenAI's current documentation on September 14, 2026**, the Realtime transcription guide and the speech-to-text guide.

**The field.** Inside `session.audio.input.transcription`, as a direct sibling of `model`:

```json
"transcription": {
  "model": "...",
  "languages": ["en"]
}
```

- It is **`languages`** (array of strings), **not** the singular `language`. The guide says in as many words: **"Don't send both."**
- `"en"` is a valid ISO 639-1 code.
- **"The Realtime API rejects unsupported or incorrectly formatted language codes."**

==> **THE UNCERTAINTY, AND YOU MUST RESOLVE IT BY MEASUREMENT, NOT BY ASSUMPTION.** The documentation describes `languages` for the CURRENT Realtime transcription models, `gpt-live-transcribe` and `gpt-transcribe`. **This app is on `gpt-4o-transcribe`, which the docs now treat as legacy, and they do NOT state whether it accepts `languages`.** So there are two possible outcomes and they lead to different places. <==

### Outcome A: `gpt-4o-transcribe` accepts `languages` and the session succeeds

**Ship it. That is the whole change.**

### Outcome B: the session update is rejected, or it is accepted and ignored

==> **STOP AND REPORT. DO NOT SWITCH THE TRANSCRIPTION MODEL TO FIX IT.** Moving to `gpt-live-transcribe` changes what every future transcript looks like, and the transcript is the only input to scoring, **mid-semester, with real student work already flowing. THAT IS AN OWNER RULING, NOT A SESSION DECISION.** <==

**Outcome B is a successful session, not a failed one.** It returns a decision to the owner, which is the right result.

### How to tell A from B, since a rejection and a silent ignore look different

- **A REJECTION surfaces on the client-secrets call** in `mintRealtimeClientSecret` and can be read from the response. `lib/realtime.ts` lines **91 to 96** already capture it: a non-ok response throws `OpenAI client-secret request failed (${res.status}): ${detail}`, with the body text included. **You do not need to add logging to see a rejection; you need to read that error.**
- **A SILENT IGNORE needs a behavioural check.** See check 4 below. Nothing in the response distinguishes it.

---

## What is deliberately NOT in scope, though it sits in the same object

The same transcription object accepts three more fields. **All three are recorded here and none is in this session**, because each changes what the grader is fed and each needs its own measurement:

- **`prompt`**, "Use `prompt` to describe the recording or its setting." A sentence naming a sales role-play about flexible packaging film would plausibly help with domain terms.
- **`keywords`**, "for product names, acronyms, and other literal terms." Bunzl, rollstock, Wildcat Packers, Clarity.
- **`delay`**, which trades latency against word error rate, with documented values `minimal` through `xhigh`.

==> **NOTE HONESTLY WHAT IS NOT CLAIMED, AND DO NOT LET IT DRIFT INTO THE RECORD.** The documentation does **not** say that setting the language improves accuracy or reduces latency. It presents `languages` as a hint for expected input languages. **The measured problem here is mis-detection, which is precisely what the hint addresses**, but do not write a claim into PROJECT_STATE that the docs do not support. <==

---

## The proof

**ALL OF IT IN B1. NOTHING IN TOM'S CLASS**, read or write. The standing guard is in force with no exception.

| # | Check | Why it discriminates |
| :-- | :-- | :-- |
| 1 | The request body sent to the client-secrets endpoint carries `languages: ["en"]` beside `model`, read server-side at `lib/realtime.ts` | Proves the config is actually sent, and it needs no ears and no microphone |
| 2 | The client-secrets call returns success, not a rejection | **Separates outcome A from a hard outcome B** |
| 3 | A real voice practice in B1 through the fake-media rig completes and produces a transcript with student turns in it | Proves nothing regressed: a broken transcription config would empty the transcript, and an empty transcript is an ungradeable submission |
| 4 | **THE DISCRIMINATING BEHAVIOURAL CHECK:** a `.wav` containing a short, ambiguous English utterance of the kind that failed for Tom, transcribed with the new config | **This is the only check that can show a silent ignore** |
| 5 | The two empty-turn instances are looked for and **reported, not fixed** | See below |
| 6 | The five existing check scripts run, counts read from the runs | Standing practice |

==> **ON CHECK 4, STATE THE LIMIT HONESTLY IN THE RECORD.** One clean sample does not prove mis-detection is gone. It shows the config did not break anything and that the specific failure shape is not trivially reproducible. **THE REAL VERDICT COMES FROM TOM'S COHORT THIS WEEK**, and the record should say so rather than claim more. <==

**THE RIG RECIPE IS UNCHANGED:** both Chrome flags, a `.wav` ending in several seconds of silence, **track labels read BEFORE the run**, and `page.on("dialog", d => d.accept())` registered before any click. The submit flow and the practice delete both use in-page two-step confirms rather than browser dialogs.

==> **THE FLAGS ARE NOT SET TODAY AND THIS SESSION GENUINELY NEEDS VOICE.** Measured 2026-09-13: the Playwright MCP is configured in `.mcp.json` with no arguments, so the Chrome it launches carries none of `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream` or `--use-file-for-fake-audio-capture`. **Starting a voice practice in that browser opens the owner's real camera and microphone.** Unlike the last two sessions, checks 3 and 4 cannot be done any other way, so **the rig has to be stood up properly and its track labels read before the run** (`fake_device_0`, "Fake Default Audio Input"). A hardware name means stop. <==

### The empty turns are a separate defect and this session does not fix them

Two of Tom's student turns rendered with no text. That is most likely silence or noise being committed as a turn by `server_vad`, which is a **`turn_detection` question, not a transcription one.**

**THE MECHANISM IS VISIBLE IN THE CODE, WHICH IS WHY IT IS WORTH OBSERVING RATHER THAN GUESSING AT.** `components/voice-conversation.tsx` line **485** creates a student turn on `input_audio_buffer.committed`, as soon as VAD commits the buffer, and the transcribed words arrive later at lines 490 and 494. **So an empty turn is a buffer that committed and never received text.** Note also that the switch handles `delta` and `completed` only: there is **no case for a failed transcription event**, so if one is emitted it falls through and the turn keeps what it had, which is nothing.

**MEASURE WHETHER THEY STILL OCCUR AND REPORT. DO NOT TOUCH `turn_detection`**: `silence_duration_ms` was deliberately raised to 1600 so a student is not cut off mid-thought, and that is a tuned value.

---

## Scope fence

- **Do not change the transcription MODEL.** If `languages` is not honoured, stop and report.
- **Do not add `prompt`, `keywords` or `delay`.**
- **Do not touch `turn_detection`** or any of its values.
- **Do not touch `REALTIME_VOICE`** at line 18. Persona voice is Phase 3c, a separate session with a migration.
- **Do not add a handler for a failed transcription event.** Report it; it is a separate decision.
- No migration, no schema change, no new dependency.
- **Nothing in Tom's class**, read or write.
- No persona changes. Geography and rapport are D2, the next session.

---

## The build gate, and the order everything runs in

**NOTHING ON SCREEN PROVES ANYTHING UNTIL THE NEW BUILD IS LIVE.** Run in this order and do not reorder it.

**1. THE BUILD GATE, BEFORE ANY COMMIT.** `rm -rf .next`, then `tsc`, then `eslint`, then `npm run build`. **Report each exit code and the timestamp.** All three exit 0, or stop and say what failed. **The five check scripts read SOURCE, not a build, so all five can pass green over code that does not compile.**

**2. THE FIVE CHECK SCRIPTS**, counts read from the runs: `check-app-time`, `check-csv-ai-level`, `check-rubric-render`, `check-scorer`, `check-persona-list`. **Before the commit, so a red script never reaches main.** A count that moves is a finding, not a nuisance.

**3. COMMIT AND PUSH**, behind their ask rules. **The push carries the Cowork session's kickoff commits too**, since that session cannot push and the owner does not; `git log --oneline origin/main..main` must read empty afterwards. Then clear any lock files git leaves behind and prove the tree is clean.

**4. CONFIRM THE DEPLOY BY A REAL REQUEST, NOT BY ELAPSED TIME.** Request a prerendered page and watch the **etag change and `age` reset to 0**. A deploy confirmed by waiting is not confirmed. **If the build is red, stop and say so.**

**5. ONLY THEN, CHECKS 1 TO 5 AGAINST THE LIVE SITE**, in B1, through the fake-media rig with its labels read first.

**6. IF ANYTHING NEEDS FIXING**, fix it, then **re-run the build gate and re-confirm the deploy** before re-running the affected checks. A check that passed against a build you have since replaced is not evidence.

==> **IF OUTCOME B OCCURS, STOP AT WHATEVER STEP YOU ARE ON AND REPORT.** Do not push a change that the API rejects, and do not push a change you have proved is ignored without the owner ruling on what replaces it. <==

## How testing runs

The click-through and the voice practice run through Playwright MCP, headed, against the live site, **in B1 only**. Any SQL is a read through the Supabase MCP, and this session may well need none; say so rather than inventing a query. **Verify git state with read-only commands only** (`git --no-optional-locks status`, `git log`, `git rev-parse`); a plain `git status` leaves a lock file that blocks the next commit.

**Every git write in this repo has been leaving `.git/HEAD.lock`, `.git/objects/maintenance.lock` and `tmp_obj_*` behind.** Check after your last git command, remove any you find, and prove the tree is clean.

## Conventions, and what PROJECT_STATE must carry when you finish

No em dashes and no en dashes outside chat. Record each owner ruling in PROJECT_STATE when it is given.

**PROJECT_STATE must carry, at the end:**

- **WHICH OUTCOME OCCURRED, A or B**, said plainly in the first sentence;
- **the request body as sent**, showing `languages` beside `model`;
- **the transcript from the live practice, with its student turns quoted**;
- **whether empty turns recurred**, and what the buffer-committed mechanism looked like if they did;
- **the five script counts, read from their runs**;
- **the honest limit on check 4**: one clean sample is not proof that mis-detection is gone, and the real verdict comes from Tom's cohort this week;
- **confirmation that `origin/main` equals `main`**, with the kickoff commits pushed rather than left behind.
