# Phase 3b: Persona On and Off, Decision-Maker Pairing, and the Two Renames

The first of two sessions that finish Phase 3. **Phases 2, 3a, 4 and the Central-time session are closed; do not reopen them.** Persona voice is Phase 3c and is NOT in this piece. **There should be no migration.** If you find you need one, stop and say why before writing it.

**Before anything else, state the filename and line count you read.**

## READ FIRST

**PROJECT_STATE.md, "Phase 3 (the rest) handoff"** (line 1016 at `f301ef7`). **AUDIT THE CODE BEFORE YOU PLAN**; line numbers were checked against `f301ef7`. **STATE YOUR PLAN AND WAIT FOR APPROVAL.**

## The owner's rulings (September 11, 2026). Build to them; do not reopen them.

1. **DASHBOARD LABEL.** "Active Assignments" becomes **"Published Assignments"** (`app/instructor/page.tsx` line 369). Correct the two comments that name the old label (`app/instructor/page.tsx` line 363 and `components/assignment-selector.tsx` line 19).
2. **"WORKING IN" BECOMES "CLASS", AND EVERY SENTENCE SAYS "THE SELECTED CLASS".** Eight strings:
   - `components/class-picker.tsx` line 77: "Working in" becomes **"Class"**. Line 86, the screen-reader label "Working class", becomes **"Class"**.
   - `app/instructor/roster/page.tsx` line 115: **"Everyone in the selected class, grouped by status."** (the sentence after it stays as it is)
   - `app/instructor/assignments/page.tsx` line 200: **"This page shows the selected class; switch class at the top of the page to see another one."**
   - `components/bulk-invite-form.tsx` line 87: **"Everyone imported joins the selected class."**
   - `components/other-class-notice.tsx` line 72: **"A different class is selected at the moment, so this {thing} is not on screen."**
   - `components/class-manager.tsx` line 94: **"Created "{name}". It is now the selected class."**; line 103: **"Everything on the instructor pages shows the selected class, which you switch at the top of any page."**
3. **TURN A CHOSEN PERSONA OFF AND BACK ON FROM THE AI PERSONA FRAMEWORK PAGE.** Today turning one back on means opening View Persona, where a switched-off chosen persona shows "Choose this one" again (`app/instructor/scaffold/compare/[groupId]/page.tsx` line 414, because `!decided`). The owner wants an On/Off toggle on the list. **Alex, Jordan and every hand-written persona stay off this page on purpose**; the route refuses them, as `disable` already does.
4. **CHOSEN PERSONAS ARE ALWAYS LISTED; UNDECIDED CANDIDATES ARE CAPPED AT 8.** `loadRecentGenerations` (`lib/scaffold-candidates.ts` line 221) shows the 8 most recent generations of every kind, so a chosen persona older than that drops off and could never be toggled. **Every chosen persona in the selected class stays listed with its toggle, however old. Undecided candidate pairs show the 8 most recent, and the page says so in one plain sentence.** Propose the wording.
5. **PAIRING IS FOR NEW GENERATIONS ONLY.** A decision maker generated from here on records which gatekeeper it came from, and the list shows the pair. Decision makers that already exist stay unpaired; **no backfill and no name matching.**

6. **BUILD SO A LATER ALEX AND JORDAN IMPORT STAYS CHEAP, WITHOUT BUILDING THE IMPORT.** Tom may later want Alex and Jordan copied into his class as a linked pair, unedited. Those rows have `generation_fields` null. **Every surface this session touches (the chosen list, the toggle, the pairing line, and the View Persona link it offers) must render and behave correctly for a chosen persona with no generated details**, falling back to its title and persona name. The refusal of hand-written personas stays keyed on an empty `generation_group_id`, not on missing details, so a future imported copy with a group id is not locked out by accident. Do NOT add Alex or Jordan to the list or build any import now.

**Already true, confirmed by the owner on the live site (do not re-test):** turning a persona off leaves its assignment card, its practice buttons and existing practices visible to students, and **starting a new practice is refused** with "This scenario has been turned off and cannot be started." The Off confirm must say so honestly, and should name the assignments that use the persona. Propose the copy.

## What the audit found, to verify rather than trust

- **The turn-back-on route is new.** `app/api/instructor/scaffold/disable/route.ts` is the model: the class guard through `refuseOutsideClass`, and a refusal for an empty `generation_group_id`. **Do not reuse `choose` to switch a persona back on**; it renames titles and deletes losers, which is the wrong action for a toggle.
- **Only a CHOSEN persona may be switched on by the new route**, never an undecided candidate, which is still the compare page's decision. Find the data that marks "chosen" and prove it against the rows that exist. The candidate title reads "Scaffold candidate N (...)" and the live title reads "Discovery-Close: ..." (`lib/scaffold-candidates.ts` lines 402 and 419), and a decided group usually has one row. **Watch the case the compare page calls `retainedLosers`**: a group keeping a used loser beside its winner. Switching on must never leave two rows on in one group.
- **STORE THE GATEKEEPER LINK WHERE THE FROZEN TEMPLATE CANNOT SEE IT.** `generate/route.ts` reads `chainFromScenarioId` (line 75) and discards it. `ChainContext` (`lib/persona-scaffold.ts` line 152) feeds `assembleScenario`, and the edit route's round-trip check requires the rebuilt text to match the saved text exactly (`app/api/instructor/scaffold/edit/route.ts` around line 262). **Put the id OUTSIDE `chain`**, as its own key on `generation_fields`, prove the assembled text is byte-identical with and without it, and **do not bump `GENERATION_FIELDS_VERSION`** unless you show why it is required.
- **A linked gatekeeper can later be discarded or switched off.** Discarded means the link dangles, so show the decision maker unpaired rather than erroring. Switched off still shows the pair.
- **The class guard is the gate.** An instructor may toggle only personas in the selected class, measured as a matched pair against their own other class and against another instructor's class.

## Not in scope

Persona voice (3c). Any toggle for hand-written personas. Backfilling or name-matching existing pairs. Hiding anything from students when a persona is off. The typed-`DISCARD` bulk control's word, which is enforced server-side and must not change.

## Proof, run by you end to end

**relii.vercel.app, "B1: A demo class" only, baseline first**, including `assignment_deletes` at 2. **Tom now has a real registered instructor account, `tbbanta@ksu.edu`. Never sign in as it, and never read or change anything in his classes**, including through the Supabase MCP. If a query would touch his class, scope it away from his class or stop and ask.

1. **Both renames observed on the live site**, each of the eight strings, plus the dashboard label. **Confirm the deploy by one of them**, since only the new build can render it.
2. **Toggle as a matched pair.** Switch a chosen persona off from the list and back on from the list, then start a practice on it as the student and see it start. Screenshot the Off confirm naming its assignment.
3. **Refusals beside successes, by direct POST:** the new route refusing a hand-written persona, an undecided candidate, and a persona in your own other class B2, each beside a success on a chosen B1 persona. **Also the two-on-in-one-group case, if any retained-loser group exists**; if none does, say so.
4. **The cap.** Do not generate nine pairs to prove it. Show the query or its check proving that chosen personas are all returned and candidates are limited to 8, and show the note on the page.
5. **Pairing, on a real chain.** Generate a gatekeeper pair in B1, choose one, generate its decision maker, and choose one. The list shows the pair. The stored assembled text for the decision maker is byte-identical to what it would be without the new key. An existing unlinked decision maker, if B1 has one, shows unpaired.
6. **Ruling 6 by a check, not live data:** render the chosen list, the toggle and the pairing line from a fixture persona with `generation_fields` null, and show it renders without error and falls back to title and persona name. Show that check can fail.
7. A clean `tsc`, eslint, and `npm run build` after deleting `.next`, with the exit code and timestamp, plus the existing check scripts still passing with counts read from the runs. Any new check must be shown able to fail.

**Cleanup:** discard the test generations you created with the per-generation Discard (a plain confirm). A chosen persona must be switched off before it can be discarded, and a role-played one cannot be discarded at all, so **plan the test so the practice in item 2 uses a persona you will keep, or an existing one.** Never type DELETE or DISCARD. Record the id of any new permanent row.

## How testing runs: you run it

SQL is read-only, and each section returns its answer as its last statement. The click-through goes through the Playwright MCP on the live site. Generation calls hit OpenAI; keep them to what item 5 needs. The owner supplies passwords; **ask which accounts.** Announce every destructive click. git commit and push stay behind their ask rules.

## Rules this project paid for

**A UI CHANGE IS NOT A RULE; THE SERVER HOLDS THE RULE. A REFUSAL BESIDE A MATCHING SUCCESS IS A MEASUREMENT. A CHECK THAT CANNOT FAIL IS DECORATION.**

## Conventions

No em or en dashes outside chat. Record each owner ruling in PROJECT_STATE when it is given. Update PROJECT_STATE before the owner clears the session, and write the **Phase 3c (persona voice) handoff**, naming where a voice control belongs on the list this session builds.
