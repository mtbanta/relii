# Phase 2c finding: a correctly graded answer was silently converted into the lowest grade on the rubric

Found and fixed 2026-09-10, during the Phase 2c certification run. Found on
commit `e5fdb98`.

**The defect was ours, not OpenAI's.** An earlier draft of this file blamed
model non-determinism. That was wrong, and the measurement that disproved it is
below. The wrong theory is recorded rather than deleted, because the reason it
looked right for an hour is the useful part.

## What went wrong, in one sentence

The prompt wrote each performance level as `Excellent: Ready for an entry-level
sales role.` and instructed the model to return the level's name "copied exactly
as it is written in that criterion's list", while the lookup matched against the
name alone. A model that obeyed literally returned the whole string, the lookup
rejected it, and the criterion fell to the bottom rung.

## The measurement that proves it

A scratch copy of the scorer was instrumented to log the RAW level string the
model returned beside the level the lookup accepted. The shipped file was not
touched. Two consecutive calls, same transcript, same rubric, same seed:

    ===== ATTEMPT 1 =====  total 200/200
      1-approach   raw="Excellent"                                        stored="Excellent"
      ... seven of seven identical ...

    ===== ATTEMPT 2 =====  total 20/200
      1-approach   raw="Excellent: Ready for an entry-level sales role."  stored=null
      2-discovery  raw="Excellent: Ready for an entry-level sales role."  stored=null
      3-presentation           raw="Excellent: Ready for an ..."          stored=null
      4-close                  raw="Excellent: Ready for an ..."          stored=null
      5-overcoming-objections  raw="Excellent: Ready for an ..."          stored=null
      6-communication-skills   raw="Excellent: Ready for an ..."          stored=null
      7-overall-impression     raw="Excellent: Ready for an ..."          stored=null

**The model's JUDGMENT never varied. It said Excellent, seven out of seven, in
both.** The only thing that changed was whether it wrote the name bare or copied
it the way the prompt asked. `findLevel` returned null, and
`criterion.levels[criterion.levels.length - 1]` awarded the bottom rung.

## Why it looked like non-determinism, and why that mattered

The same transcript scored five times against Tom's Presentation rubric before
the cause was known:

| Run | Where | Level for all seven | Total |
|---|---|---|---|
| 1 | production, live app | Unsatisfactory | 20 / 200 |
| 2 | local, shipped scorer | Excellent | 200 / 200 |
| 3 | local, shipped scorer | Unsatisfactory | 20 / 200 |
| 4 | local, shipped scorer | Unsatisfactory | 20 / 200 |
| 5 | local, shipped scorer | Excellent | 200 / 200 |

That table is still accurate. What it MEANS changed completely. It is not
sampling variance in the grade. It is one prompt admitting two legal output
formats, and a lookup that accepts only one of them. **The all-or-nothing shape
was the tell and it was misread**: genuine judgment variance produces MIXED
levels, never a clean collapse to one end with every criterion moving together.
A single reply picks one output style and applies it to every criterion, which
is exactly why the result was bistable rather than noisy.

## The six Discovery runs, and what they are NOT

The same exercise on Tom's Discovery rubric returned byte-identical results six
times (once in production, five times locally), totalling 57.5 out of 100 every
time.

==> **THAT IS NOT EVIDENCE THAT DISCOVERY IS SAFER, AND IT MUST NOT BE QUOTED AS
SUCH.** Discovery runs the same function, the same prompt and the same match.
Those six runs are the ones where the model happened to return bare names. It is
format luck, not immunity. No Discovery failure was ever caught, and no attempt
was made to catch one, by the owner's ruling of 2026-09-10: a caught failure
would only confirm what the code already proves, and a run of clean results
would be actively harmful, because someone would later cite it as evidence of
safety. <==

## The part that made it a defect rather than a hard grading call

In production's run the comment and the level disagree inside the same reply.
The page the student saw read:

    Approach              Unsatisfactory   2 / 20
      "The student professionally reconnected with Alex, reinforced the meeting's
       purpose, and established an agenda: ..."

All seven read like that: a comment describing the student doing the thing, and
the bottom rung awarded for it. The failure was completely silent. No error, no
log line, no refusal.

## How it was actually found, which is not how it was planned

**By a bug in the test script, not by the test.** The script's "click the button
in the card with this title" helper walked up the DOM from each button until an
ancestor contained the title, and that walk goes past the card into the list
holding every card, so the first card's button matched the last card's title. It
practised the Presentation assignment while reporting the Discovery one.

That accident put a seven-criterion score beside a six-criterion one on the same
afternoon. Without the comparison the Presentation result would have read as
harsh but plausible grading. **A script that mislabels which thing it is testing
is more dangerous than one that crashes.**

## Why the existing checks did not catch it

- `scripts/check-scorer.mjs` deliberately does not call OpenAI. It proves what
  the server does WITH a reply, so it could never see which replies the prompt
  actually elicits. It passed throughout.
- Every live check before this session used the Discovery rubric, which is where
  the luck ran the other way.
- Phase 3's "re-scoring stayed within a 3-point spread" was measured against the
  OLD anchor-value content scorer, not the level-based scorer 2b-1 built.

**THE TRANSFERABLE RULE: a check that stubs the model cannot certify the prompt.
The contract between what the prompt ASKS FOR and what the parser ACCEPTS needs
its own test, and that test has to be a fixture of the exact string the model
sends.** Two of those fixtures are now in `check-scorer.mjs`.

## The fix, applied as an explicitly separate act

Three parts, all in `lib/scoring.ts`. Approved by the owner on 2026-09-10.

**a. The prompt no longer writes a level as `Name: descriptor`.** Each level is
now two labelled lines, a `name:` line and a `means:` line, and the instruction
says to return only the text after `name:`. Tom's descriptors STAY: the owner's
2026-09-09 decision to keep them stands, because without them the six names are
bare labels and our prompt would become the grade boundary instead of his
rubric. What was removed is the ambiguity, not his words.

**b. The match accepts an answer whose name portion matches.** Belt and braces
with (a), not a substitute. It strips a `name:` label, takes the first line, and
takes the text before a colon, but every candidate must still match a real level
name exactly. Nothing guesses at a nearest rung.

**c. An unmatched level, or an omitted criterion, now REFUSES to score.**

==> **THIS REVERSES THE OWNER'S OWN RULING OF 2026-09-09 AND HE REVERSED IT
DELIBERATELY.** The old fallback could not tell "the model invented a level" from
"the model named the right level and wrote it the way we asked", and resolved
both into the lowest grade on the rubric. An unmatched level is a SYSTEM failure,
not a student performing badly, and the two must not share an outcome. It now
surfaces through the scoring-failure note and retry that 2b-2 already built. A
student reading "ask your instructor to provide a score or try again" is strictly
better off than a student reading 10 per cent for excellent work. <==

**Tom's 10 per cent floor is untouched.** A student who genuinely earns the
weakest rung still scores it, because the model NAMED that rung and it matched.
There is still no true zero anywhere. What changed is that our parse failure no
longer borrows his floor to hide behind.

## The before-and-after measurement

Both builds were run against the real API on the same afternoon, on the same
transcript and rubric. **The `system_fingerprint` turned out to track the PROMPT
rather than the clock**: the old prompt reports `fp_ffd8308b42` and the new one
`fp_27008f43d1`, and both were being served concurrently. So this is a clean A/B
and not a comparison across a backend change.

| | Old code | New code |
|---|---|---|
| Fingerprint | `fp_ffd8308b42` | `fp_27008f43d1` |
| Attempts | 4 | 8 |
| Result | 4 of 4 at **20 / 200** | 8 of 8 at **200 / 200** |
| Level strings returned | 28 of 28 carried the descriptor | 56 of 56 were bare names |

Worth recording: the old code failed **4 out of 4** in this control, where hours
earlier it was roughly half and half. The failure rate is itself unstable, so
"it only happens sometimes" was never a safe reading.

`scripts/check-scorer.mjs` carries the deterministic half of the proof, with no
API call involved: 22 checks, all passing, including a level with the descriptor
joined on, a level with the `name:` label echoed, and the two new refusals.

## What this does NOT cover

- **No Discovery failure was ever reproduced.** See the callout above. Do not
  read the six clean runs as safety.
- **The mechanism inside the model was not investigated.** Why a given reply
  chooses one format over the other was not measured and is not claimed.
- **Eight clean runs after the fix is not a proof of permanence.** It is
  evidence that the new prompt elicits bare names today. Part (b) is what covers
  the case where a future model does something else, and part (c) is what makes
  the remaining unknown loud instead of silent.
- **The redirect loop is unchanged and is now more reachable.** Open Issues
  records that a graded practice whose scoring FAILED sits at `completed` and is
  a redirect loop, reachable only while the student stays on the tab. Part (c)
  turns a silent wrong grade into exactly that state. It is the right trade and
  it is not free. That issue is filed separately and was not fixed here.
