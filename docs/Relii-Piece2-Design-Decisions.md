# Relii Piece 2 Design Decisions: Admin Scaffolding (July 18, 2026)

Internal working doc (.md). Settles the open design questions for Piece 2 (admin scaffolding) so each of the four sub-session kickoffs can be handed to CC without re-deciding mid-build. This is the detailed spec; where it is more specific than the Piece 2 section of Relii-Two-Week-Plan-Jul2026.md, this doc governs Piece 2 (the plan carries a pointer to here).

Piece 2 lets an instructor trigger AI to build Alex/Jordan-style personas and scenarios for other industries, then run them as ungraded conversation-only cases. It is chunked into four sub-sessions (2a, 2b, 2c, 2d), each its own fresh CC chat with its own kickoff and a clean commit boundary.

## Decisions from the July 18 design pass

1. GENERATION INTERFACE: an in-app admin form in Relii, instructor-gated, with fields for industry, persona role, product or service, prospect company size, meeting type and chain position (gatekeeper or decision maker, and who they gate), win condition and trial terms, and seller company type, plus a Generate button. This is the demo artifact Dawn sees. Not a free-text brief.

2. GENERATED OUTPUT: no downloadable markdown file and no Storage bucket for v1. The generator writes the scenario straight into the database; the admin reviews it in-app. This removes the bucket and signed-link work and one of the two Vercel-timeout surfaces. A .md or .docx export can be added later if Tom ever needs a copy (Michael would send the scenario to Cowork for conversion).

3. CANDIDATE COMPARISON: the admin compares the two candidates by reading STRUCTURED FIELDS side by side, not by role-playing them, and not as prose. The generator emits each candidate as structured fields (see the field list below); the compare view renders both candidates in aligned rows. This doubles as a clean demo screen.

4. NO-DRIFT ASSEMBLY: the generator produces the structured fields; the live persona_system_prompt and scenario_context are assembled from those fields by a FIXED template that mirrors the Alex/Jordan structure. The comparison view and the persona that actually drives the conversation are therefore always the same source, so they cannot drift apart.

5. WINNER ROLE-PLAY GATE (quality safeguard): because we compare by text, coherence is visible but conversational behavior is not. So after the admin picks and enables a winner, Michael role-plays that winner once himself, through the normal enabled flow, before Dawn sees it. This is the plan's existing risk-3 mitigation, moved to just after the pick. No feature to build.

6. ACCESS: any instructor (reuse the existing is_instructor check). No new admin role for v1.

7. GENERATION ARCHITECTURE: build it synchronous first. Escalate to a background-job-and-poll design only if the live test in 2c actually hits the Vercel function time limit. Do not pre-build the background path.

8. GENERATION CONSTRAINTS (fixed, from the plan): model knowledge only, NO web search. Price is already settled, so the student must find non-price value and risk. The meeting is about 15 minutes with the count-up-to-30:00 timer. Demeanor and difficulty match Alex and Jordan (skeptical but fair, proof-driven). The AI assumes an incumbent product or service and generates its common issues and shortfalls as the hidden facts.

## Structured field set (generator output, compare view, and seed source)

Each candidate is generated as these fields. The compare view shows two candidates in aligned rows; the seed assembles persona_system_prompt and scenario_context from them.

- Persona name and role
- Company (type and size)
- Meeting type and chain position (gatekeeper or decision maker, and who they gate access to)
- Win condition and close terms (trial specifics if the win is a trial)
- Demeanor (a few descriptors)
- Top decision criteria, ranked
- Hidden facts and incumbent shortfalls, with any numbers (the meat of the case)
- Objections they raise
- What earns the win versus what fails it

## Cross-cutting schema decisions

- scenarios.rubric_id becomes NULLABLE. A null rubric means conversation-only (no scoring). Alex and Jordan keep their rubric link and are unaffected.
- scenarios gets an enabled flag: boolean, NOT NULL, default true. Existing scenarios (Alex, Jordan) backfill to true. A disabled scenario is hidden from the create-assignment scenario picker and cannot be started; it is visible only in the scaffolding admin. Generated candidates are written disabled.
- Candidate grouping columns (generation group id and chain role: gatekeeper or decision maker), needed only when candidates are first written, are added in the chunk that writes them (2c), not in 2a. Both nullable; Alex and Jordan leave them null.

All schema changes are additive. No Row Level Security or Storage rule is weakened in any chunk.

---

## 2a: Conversation-only foundations (the next kickoff, fully specced)

GOAL: the app can run a scenario that has NO rubric (conversation-only), reached through an ungraded assignment, in both text and voice+video, with no score, playing correctly with the results screen and the practice retention cap. Plus the enabled/disabled flag. NO AI generation yet; tested by hand-seeding a no-rubric scenario.

SCHEMA (2a):
1. scenarios.rubric_id: make nullable. Null means conversation-only.
2. scenarios.enabled: boolean NOT NULL default true; backfill existing rows to true. Save the SQL in a new file (for example supabase/piece-2a-conversation-only.sql) with run instructions; propose the shape and STOP for approval before running. This is the only schema change in 2a.

BEHAVIOR (2a):
3. Session end for a null-rubric scenario does NOT score. It saves the transcript (and the video for voice+video), marks the session terminal status = 'completed' (never 'scored'), and writes no score JSON and no total. Rubric scenarios (Alex, Jordan) are unchanged and still score.
4. Results screen: today it redirects unless the session is 'scored'. Add a branch so a 'completed' null-rubric session renders the results page WITHOUT a rubric breakdown: transcript, the recording if any, the existing Download video and Print/Save controls, and a clear "conversation-only practice, no score" note. It must not redirect.
5. Practice retention cap (FIFO): today it keeps the newest 3 'scored' practices per student per assignment and prunes older ones with their recordings. Broaden "finished practice" to include a 'completed' null-rubric practice, so conversation-only practices are kept and pruned by the same rule (keep last 3, delete older plus recordings). Keep the scoping identical (this student, this assignment, kind = practice); only the finished filter widens. Confirm graded submissions and scored practices are untouched. The saved-practices list on the student home shows conversation-only entries with "no score" instead of a number.
6. Ungraded assignability: an instructor can create an assignment pointing to a null-rubric scenario. With no rubric there is nothing to grade, so the assignment is practice-only: it offers Practice (text) and Practice (voice+video) and NO graded submission path (no Start Assignment). Gate the graded submit control on "the scenario has a rubric." This works under the current pre-Piece-4 model and anticipates Piece 4's required_mode repurpose cleanly.
7. The create-assignment scenario picker lists ENABLED scenarios only; disabled scenarios never appear there.

TEST (2a, hand-seeded, no generation): seed one enabled null-rubric scenario by hand, create an ungraded assignment to it, and confirm in both text and voice+video: no score is produced; the results screen shows transcript, recording, and save/print with the no-score note and does not redirect; the practice counts toward "keep last 3" and prunes correctly with its recording; no graded submit control appears; and a hand-disabled scenario does not show in the assignment picker. Alex and Jordan still score 180 and 220.

GUARDRAILS: additive schema only (rubric_id nullable, enabled boolean); no RLS or Storage rule weakened; the scoring path for rubric scenarios unchanged.

---

## 2b: Generation to structured fields (outline)

- The in-app admin form (instructor-gated) with the fields in Decision 1. Generate calls a server route that prompts the model (knowledge only, no web search, constraints in Decision 8) to produce TWO candidate personas for the first chain position (the gatekeeper), each as the structured field set above, as structured data (not prose, not .md, not to Storage).
- The persona_system_prompt and scenario_context are assembled from the fields by the fixed template (Decision 4).
- Tested by generating a case and viewing the two candidates' structured fields.

## 2c: Write candidates live plus the compare view (outline)

- Write the two generated candidates into the database as DISABLED scenarios (enabled = false), with the grouping columns (generation group id, chain role = gatekeeper) set. Render the side-by-side structured compare view.
- This is where the Vercel timeout risk lands. If generation cannot finish inside a request, escalate to background-and-poll (Decision 7); otherwise keep it synchronous.

## 2d: Pick, enable, delete, and the chain (outline)

- The compare view lets the admin pick a winner in one action: enable the winner (enabled = true) and delete the loser (delete-if-unused, safe because a disabled candidate has never been used). Deletion is delete-if-unused only; the app refuses to delete a used case and points to disable instead.
- Then generate the paired second persona (the decision maker) using the winner as input, producing two more candidates, compare, pick, enable, delete.
- After the chain, apply the winner role-play gate (Decision 5) before the case is shown to Dawn.

---

## Deferred / not in Piece 2
- Per-scenario voice: all generated personas use Alex's "cedar" voice for now (no per-scenario voice setting). Add only if trivial and time allows; not required for the demo.
- .md or .docx export of a generated case: skipped for v1 (Decision 2); add later if Tom needs it.

## Risks carried into Piece 2 (from the plan)
- Vercel timeout, landing in 2c (mitigated by the sync-first, escalate-if-needed approach).
- Scaffolding quality cannot be verified by an automated test (mitigated by the structured compare plus the winner role-play gate).
- Generated personas go live with no human content review (mitigated by disabled candidates, compare-and-pick, and delete-if-unused).
