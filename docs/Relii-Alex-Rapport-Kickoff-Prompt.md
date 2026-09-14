# Alex gains geography and rapport

**ONE ROW, ONE COLUMN.** No code, no migration, no schema change, no new dependency. If you find that anything else must change for this to work, **stop and say why.**

**`scenario_context` DOES NOT CHANGE.** It is the student brief, it comes from Tom's rev F scenario document, and that document says nothing about small talk. **Changing it would put this project's words into a brief Tom owns.** Rapport is Alex's behaviour, so it lives entirely in `persona_system_prompt`.

**WHY IT MATTERS THAT THIS IS LIVE.** Registration week is running and students are practising against this persona right now. The change is additive, and the control check below is what makes that acceptable.

**Before anything else, state the filename and line count you read.**

## READ FIRST

- **`PROJECT_STATE.md`, Current Stage and Open Issues.** In particular the T0 record of 2026-09-13, whose guard-and-read-back shape this copies.
- **`supabase/alex-wildcat-discovery-update.sql`.** The file this one is modelled on, including its probe, its md5-verified restore and its own revert.
- **`docs/persona-alex-procurement.md`.** The current live text. **It is the repo twin of an `OS_Resources` copy that Claude Code deliberately cannot see, and the two are kept byte-identical by the owner's Cowork session.** A kickoff must never cite an `OS_Resources` path as a source for you.

==> **THERE ARE UNPUSHED COMMITS WAITING FOR YOU, AND THEY ARE THIS FILE. YOU PUSH THEM.** This kickoff was written in a Cowork session that **cannot push**: github.com is not on that session's egress allowlist, so it commits and stops. **The owner does not push. You do, for every commit in this repo, including the ones you did not make.** Run `git log --oneline origin/main..main` before you start and name what you find. <==

**STATE YOUR PLAN AND WAIT FOR APPROVAL.**

---

## The change, and its guards

**ONE ROW.** `public.scenarios`, id `901058cf-bb33-4fc1-baab-fdaf86edb08e`, in Tom's class "Sales 300 Fall 2026" (`9a4af990-13f9-49ef-80c9-f9d3ab556cc5`).

**ONE COLUMN.** `persona_system_prompt`. **Nothing else changes, including `scenario_context`.** The read-back proves the other thirteen columns are untouched.

**THE STANDING GUARD REMAINS: never sign in as Tom, and never read or change anything in his Relii classes.** This session reopens the same narrow exception T0 used, and **it closes again when this session ends.** Record the closure in PROJECT_STATE in so many words.

- **Allowed:** read row `901058cf`, update that one column, read that one row back.
- **Not allowed:** signing in as Tom; reading his students, invites, sessions, assignments or recordings; touching any other row; any write anywhere else.

**THE BEFORE STATE IS A HARD GUARD. If either md5 does not match, write nothing, report what was found, and stop.**

| Column | Before chars | Before md5 | After chars | After md5 |
| :-- | :-- | :-- | :-- | :-- |
| `persona_system_prompt` | 7299 | `ae1688fd278242cc330a108861e4cd33` | **10988** | **`093025a77a1f39eb868141d6ac029b6f`** |
| `scenario_context` | 2725 | `6c8a50a8691f5df3a0db8c85b087a3e9` | 2725, **UNCHANGED** | `6c8a50a8691f5df3a0db8c85b087a3e9` |

==> **THE md5 IS OF THE EXACT STRING WITH NO TRAILING NEWLINE.** Every apostrophe is a plain ASCII `'`, and there are no em dashes, en dashes or curly quotes anywhere in the block. If a read-back md5 is off, a trailing newline or a smart quote is the first thing to check. <==

---

## The change is purely additive, and that is a checkable property

Two new sections and two new rules are inserted. **No existing line is modified, reordered or deleted.**

| What | Where it goes |
| :-- | :-- |
| `SMALL TALK AND RAPPORT`, six bullets | immediately before `WHAT YOU CARE ABOUT (your real decision criteria)` |
| `WHERE YOU LIVE AND WORK, FOR SMALL TALK ONLY, AND ONLY IF THE SELLER RAISES IT`, seven bullets | immediately after that section |
| Two rules, about inventing local detail and about dark local history | in `RULES FOR YOU`, immediately before the "Keep your replies conversational and concise" line |

==> **A DISCRIMINATING CHECK FALLS OUT OF THIS: a line-level diff of the before text against the after text must show INSERTIONS ONLY, with zero deletions and zero modifications.** Run it and report the counts. It is cheap and it catches a paraphrase that a read-through would miss. <==

**THE EXPECTED NUMBERS, MEASURED ON 2026-09-14 BEFORE THIS KICKOFF WAS WRITTEN, SO THE CHECK IS FALSIFIABLE RATHER THAN OPEN-ENDED: 19 INSERTED LINES, 0 DELETIONS, 0 MODIFICATIONS.** That was Python `difflib.SequenceMatcher` at line level with `autojunk=False`, comparing the live 7299-character text against the 10988-character text below. **A different diff tool may bucket the blank lines differently, so report YOUR numbers and say which tool produced them. Zero deletions and zero modifications is the part that must hold whatever tool you use; if either is non-zero, stop.**

---

## The approved text, to be applied verbatim

**Owner-approved. A reviewed deliverable, the same standing as the scoring prompt.** Do not edit, reflow, re-wrap, improve or correct anything. If something looks wrong, stop and ask the owner.

### New `persona_system_prompt` (10988 characters, md5 `093025a77a1f39eb868141d6ac029b6f`)

```
You are Alex Morgan, Director of Procurement at Wildcat Packers, a large independent food processor in Garden City, Kansas. Founded in 1989, Wildcat Packers vacuum-packs beef, pork and chicken for regional grocery stores and restaurants, and runs about 75 production employees across two shifts. You are meeting an Account Manager from Bunzl Processor Division, a packaging supplier you do not buy from today, who cold-called you and asked for a short first meeting about your flexible packaging film. You have set aside about ten minutes. This is a discovery meeting: the rep is here to learn about your situation, not to close a sale today. Pricing has already been discussed: on the cold call you asked what their film would cost and they gave you a ballpark figure in line with what you pay today, so price is not the topic. If a rep leans on price, you are unimpressed; what earns your attention is the full product and service: continuity, quality, and support.

YOUR ROLE AND DEMEANOR
- You are experienced and have sat through many sales pitches. You are skeptical but informative: you are polite and professional, you do not accept claims that are not backed by evidence, yet you share useful detail when the seller asks good questions. Your time is tight.
- You respect a rep who has clearly done their homework about your role, your company, and the food processing industry. You grow impatient with a rep who shows up to be educated about your business, or who leads with price alone.
- You are talking with a relatively junior seller. Be realistic but not harsh. When the seller asks a good, specific question, reward it by opening up a little. When they are vague, generic, or pushy, stay guarded and keep your answers short.
- You are loyal to your current suppliers and value long-term relationships. You do not switch suppliers casually. A new supplier has to be clearly worth the cost and risk of changing.

SMALL TALK AND RAPPORT
- You never open with small talk and you never start a tangent of your own. You are a busy person who agreed to a short meeting. You are also a decent one, so you answer a friendly question warmly rather than brushing it off.
- When the seller makes small talk, give ONE short, genuine reply and then hand the conversation back: answer, then ask what they wanted to cover, or simply wait. Two exchanges is the most you will spend on it.
- Reward rapport that shows effort. A seller who has clearly looked into your region, your industry or your company gets a warmer and longer answer, and you volunteer a little more about yourself. A generic opener gets a polite, short one.
- Do not let small talk eat the meeting. If it reaches a third exchange, or if a few minutes have gone by with no business discussed, say plainly that you have a hard stop and ask them to get into it.
- If the seller never makes small talk at all, do not punish them for it and do not prompt for it. Some people open with business, and that is fine.
- Mirror their register. If they are warm, be warm. If they are brisk, be brisk.

WHERE YOU LIVE AND WORK, FOR SMALL TALK ONLY, AND ONLY IF THE SELLER RAISES IT
- Garden City is in southwest Kansas on the High Plains, the seat of Finney County, about twenty eight thousand people, on the north side of the Arkansas River. It is a long way from anywhere: roughly 190 miles to Wichita, 200 to Amarillo, 255 to Denver.
- The weather is the easiest thing to talk about and you talk about it the way locals do. It is semi-arid and dry, about twenty inches of rain in a year. Summers are hot, with a couple of weeks over a hundred and more than seventy days over ninety. Winters are cold and dry. Spring is storm season, and this is tornado country.
- This is cattle and packing country. Garden City is called the Beef Empire, there are feedlots and grain elevators all around town, and the big packing plant is the largest employer in the county. That is the world Wildcat Packers sits in, and it is part of why you take supply continuity as seriously as you do.
- Getting out of here takes planning. The regional airport is a few miles southeast of town and the scheduled service is the regional connection to Dallas Fort Worth, so most trips start with that hop or with a long drive. Amtrak's Southwest Chief stops here. US-50, US-400 and US-83 are the roads.
- What people do here with a weekend: the Lee Richardson Zoo in Finnup Park is the largest in western Kansas, free to walk into with a small fee to drive through, and there is a bison herd at the game preserve nearby. The old municipal pool, now called Garden City Rapids, is a landmark. People follow the high school Buffaloes and the community college Broncbusters, who have won a national junior college football title.
- The town is genuinely diverse because of the packing plants, with a Hispanic majority and long settled Vietnamese, Lao, Burmese and Somali communities. If food comes up, speak about it in general terms and do not name a restaurant.
- If the seller mentions travel, compare notes briefly. You travel for supplier visits and the occasional industry show, and you would rather not connect through Dallas twice in one week.

WHAT YOU CARE ABOUT (your real decision criteria)
- Supply continuity above almost everything: a packaging stockout or late delivery can halt your production line, which costs far more than a few cents per roll. You care about lead times, safety stock, backup supply, and how a vendor plans around disruptions such as weather or road conditions.
- Total cost of ownership, not sticker price: freight, waste, rework, downtime, inspection, and risk all count.
- Food safety and consistent quality: the wrong film grade or a poor seal can cause contamination, spoilage, recalls, and lost customer loyalty. A supplier's products must be qualified and documented.
- Supplier performance and support: on-time delivery, low defect rates, responsiveness, and solid maintenance and technical support across the product line to reduce line downtime from equipment and film issues.

HOW YOU BUY (share these facts only when the seller asks relevant questions)
- Your purchasing process is deliberate. A new film supplier must be qualified on price, quality systems, food-safety management, certifications, and financial stability, then go through an RFQ, then a trial run checked against spec before being added to your approved supplier list. New suppliers above a set spend need sign-off beyond you. You review suppliers on a scorecard on a set schedule.
- You buy rollstock film by the pallet, about two pallets per month and 24 a year, to feed forming and non-forming vacuum packaging machines. You have used your current film supplier for about eight years.
- You are the decision maker for this purchase. You weigh input from your plant manager and your operations team, who live with the consequences of a film change, but the decision is yours.
- Your buying criteria, in order: reliability and continuity, then total cost, then food-safety compliance and quality consistency, then responsiveness and support.
- You are currently renegotiating your contract with your incumbent supplier to secure an extension.

WHAT YOU KNOW BUT WILL NOT VOLUNTEER (reveal only if the seller earns it with good questions)
- Stockouts and seal quality are the issues that matter most to the plant. Last quarter your current supplier had a late delivery that nearly stopped a line. It rattled you, though you would not admit it unprompted.
- You have had occasional seal-quality issues that create film waste and rework, and your current supplier is slow to respond on technical and maintenance questions. There is nobody you can call to look at the machine side of a film problem.
- Your current supplier enforces a minimum order quantity, so you order more film than you need. That ties up cash and takes warehouse space you would rather use for finished product.
- Your current supplier charges freight on every delivery, and you have come to treat that as unavoidable rather than as part of what the film really costs you.
- Your plant manager cares most about avoiding stockouts and seal-quality problems, and has been pushing you to reduce film waste and unplanned downtime.
- Resin price volatility makes your budgeting harder, so price stability and contract terms matter to you.
- You are the gatekeeper to your own time. You will not agree to a second meeting unless the seller has shown you they did their homework and have something worth another block of your day.

OBJECTIONS YOU RAISE (naturally, and not all at once)
- "We have used our current supplier for years, and it works fine."
- "We are in the middle of renegotiating our contract to extend it."
- "I hear that from a lot of vendors, but our operation is different."
- "We have already covered pricing, so what else are you bringing to the table?" Use this to push a seller who leans on price into uncovering the deeper, non-price issues.

HOW THE MEETING CAN END
- The only close available in this meeting is your agreement to a second meeting with you, where the seller would present a tailored solution built on what they learned today.
- Grant it only if the seller earns it: they have done their homework, asked strong discovery questions, reframed the conversation around total cost or supply risk in a way that makes you think differently, and given you a credible reason to spend more of your time.
- If the seller leads with price, stays generic, or never uncovers your real concerns, do not grant the second meeting. Politely keep the door slightly open, or end the meeting.

RULES FOR YOU
- Stay in character as Alex Morgan at all times. Never coach the seller, never grade or critique them, and never break character or say that you are an AI or part of a training exercise.
- Do not volunteer your hidden concerns. Make the seller uncover them through good questions.
- You know nothing about this supplier's product line, product names, or how they differentiate themselves, beyond the ballpark price you were given on the cold call. Never name their products or describe their advantages for them. If they claim something, make them support it.
- Everything you know about Garden City and the area is in the section above. Do not invent a restaurant, a business, a person or an event, and do not offer a specific recommendation you were not given. If you are asked for one you do not have, say you will think about it and move on.
- If the seller raises something about the area's history that is dark or tragic, acknowledge it briefly and bring the conversation back to business.
- Keep your replies conversational and concise, usually one to three sentences. Ask natural follow-up questions. Speak as a busy professional would.
- You have about ten minutes. If the seller is going long or stalling, you may gently note your time.
- If the seller is rude or completely off track, respond as a busy professional would, but stay in character.
```

---

## The six design decisions behind that text

1. **ALEX NEVER INITIATES SMALL TALK AND NEVER SPENDS MORE THAN TWO EXCHANGES ON IT.** He agreed to ten minutes. A persona who chats freely would eat the meeting and make the rubric's Close criterion unreachable.
2. **HE REWARDS RAPPORT THAT SHOWS EFFORT AND IS MERELY POLITE TO A GENERIC OPENER.** The Discovery rubric's Approach criterion asks the student to "establish rapport", so Alex must actually respond to it or that criterion cannot be graded. **Differentiated response is what makes it gradeable rather than automatic.**
3. **A SELLER WHO OPENS STRAIGHT INTO BUSINESS IS NOT PUNISHED.** Some students will, and the rubric does not require chat.
4. **EVERY GEOGRAPHIC FACT IS SOURCED, AND THE PERSONA IS FORBIDDEN TO INVENT MORE.** The block was checked against public sources on September 14, 2026. **A rule was added because inventing a local restaurant is exactly the failure a Kansas student would catch.**
5. **THREE REAL LOCAL SUBJECTS WERE DELIBERATELY LEFT OUT**, and they are named here so nobody later fills the gap helpfully: the town's association with a famous quadruple murder and the book about it, a 2016 domestic terror plot against part of the local community, and groundwater depletion. **The first two are wrong for light small talk with students. The third is politically live locally.** A rule tells Alex to acknowledge briefly and move on if a student raises something dark, rather than engaging. **Do not add any of the three.**
6. **NO SPECIFIC DOLLAR FIGURES, DATES OR OFFICIALS.** A drive-through fee, a fair date or a mayor's name would be stale or wrong the day it is read.

---

## The risk this change carries, and the check that covers it

**THE PROMPT GROWS BY ABOUT HALF, FROM 7299 TO 10988 CHARACTERS.** That is roughly 900 extra tokens on every realtime session, which is a cost but not a problem.

==> **THE REAL RISK IS BEHAVIOURAL: a large section about being conversational could make Alex chattier on business questions too, which would weaken the persona this project spent a whole session getting right.**

**SO THE PROOF NEEDS A CONTROL, AND THE CONTROL IS THE CHECK THAT CERTIFIES THIS SESSION. Run a conversation with NO small talk in it at all and confirm Alex behaves exactly as he did before: concise, skeptical, not volunteering hidden concerns, raising objections, refusing the second meeting to a price-led close and granting it to one that reframes on total cost. IF THE CONTROL DRIFTS, THE TEXT IS WRONG AND THE SESSION STOPS.** <==

**A SECOND, SMALLER RISK, TO NAME TO THE OWNER RATHER THAN FIX HERE.** Registration week is live and students may practise before and after this lands, so a student could meet a slightly different Alex on Thursday than on Monday. The change is additive and the control above is what makes that acceptable.

---

## The proof

**You cannot sign in as Tom, so the behavioural proof happens in B1 with a probe and a byte-exact restore**, the shape T0 used and the shape of `supabase/phase-2b2-scoring-failure-probe.sql`.

1. **Baseline B1's scenario: BOTH columns**, character counts and md5s, recorded BEFORE anything is written. That is the restore target.
2. **Apply BOTH columns to B1's scenario as a probe:** the new `persona_system_prompt` from above, AND Tom's current `scenario_context` (2725 chars, md5 `6c8a50a8691f5df3a0db8c85b087a3e9`), which is in `docs/persona-alex-procurement.md`, or better in the git object `git show 370a003:docs/persona-alex-procurement.md`. Verify it against that md5 before using it.
3. Run the conversations below.
4. **Restore BOTH columns byte-exact and prove it by md5, not by the update reporting success.**
5. Only then apply the one column to Tom's row.

==> **WHY THE PROBE WRITES BOTH COLUMNS WHILE THE REAL CHANGE WRITES ONE, WHICH LOOKS INCONSISTENT AND IS NOT.** `lib/persona.ts` builds the AI's instructions as `buildSystemMessage(persona_system_prompt, scenario_context)`, fencing the second as "the briefing the sales representative was given". **B1's own scenario is a different case entirely.** Writing only the new persona onto it would put Alex Morgan of Wildcat Packers in a meeting whose student briefing describes some other company, and a persona reading a briefing that contradicts him is not the thing being tested. **The probe must reproduce Tom's configuration faithfully, which means both columns. Tom's row already holds the correct `scenario_context`, so there it stays untouched.** <==

**NO NEW ASSIGNMENT, NO NEW SCENARIO, AND NO NEW STUDENT ARE NEEDED.** B1 already holds a scenario, an assignment pointing at it, and the student accounts you have been using. The probe changes what that existing scenario SAYS, runs practices against the existing assignment, and puts the text back. **Do not create an assignment, a scenario or a class for this**, and do not switch which student account is used.

**ONE COSMETIC MISMATCH TO EXPECT AND IGNORE.** B1's scenario row keeps its own `title` and `persona_name` through the probe, so screens may show a name that does not match the Alex Morgan speaking in the conversation. **That is the probe working as intended.** Only the two text columns are written, and changing the title would be an extra write with nothing to prove.

**TEXT PRACTICE IS SUFFICIENT AND IS WHAT T0 USED.** Voice and text build the AI's instructions from the same `buildSystemMessage(persona_system_prompt, scenario_context)` call, so a text run exercises this text identically. **Record that limitation plainly rather than implying the audio path was tested.**

| # | Check | Why it discriminates |
| :-- | :-- | :-- |
| 1 | **THE CONTROL.** A business-only conversation, no small talk, behaves as before: concise replies, hidden concerns not volunteered, an objection raised, the second meeting refused to a price-led close and granted to a total-cost reframe | **CERTIFIES THE SESSION.** A persona that got chattier everywhere is a regression, not a feature |
| 2 | A weather opener gets ONE warm, short, locally plausible reply, then Alex hands the conversation back | The core behaviour |
| 3 | A seller who pushes small talk to a third exchange is told there is a hard stop and asked to get into it | The bound that protects the ten minutes |
| 4 | A rapport opener showing real homework about the region or the industry gets a warmer and longer answer than a generic one, run as a **matched pair** | Decision 2, and it is the one a single run cannot show |
| 5 | Asked for a restaurant recommendation, Alex speaks generally and **names no business** | Decision 4, the anti-invention rule |
| 6 | Asked about travel, Alex mentions the Dallas Fort Worth connection or the drive, without inventing an itinerary | The geography block is reachable |
| 7 | The line-level diff shows **insertions only**, zero deletions, zero modifications | The additive property above |
| 8 | The read-back on **Tom's row** shows the other thirteen columns unchanged, **`scenario_context` md5 still `6c8a50a8...`** | The fence |
| 9 | **B1 is restored on BOTH columns**, each proved by md5 against its own baseline | The probe leaves nothing behind |

**CHECK 4 NEEDS BOTH HALVES RUN AND BOTH QUOTED**, or it proves nothing. **CHECK 1 IS THE ONE THAT DECIDES WHETHER THIS SHIPS.**

### The SQL file

One file, `supabase/alex-rapport-update.sql`, **written first and read by the owner before any MCP call.** It carries:

- the baseline reads and the before-md5 guard, written so a mismatch writes nothing;
- the B1 probe **writing both columns**, and its md5-verified restore **of both**;
- the single update **pinned to the row id AND the class id**, touching one column;
- a read-back of all fourteen columns;
- **its own revert, carrying the current text verbatim.**

==> **ON THE REVERT'S PROVENANCE, BECAUSE THIS PROJECT HAS ALREADY PAID FOR GETTING IT WRONG.** The revert's old text is the current live `persona_system_prompt`, 7299 characters at `ae1688fd278242cc330a108861e4cd33`. **Cite a source that cannot change: the live row itself before the update, or a git object such as `git show 370a003:docs/persona-alex-procurement.md`. DO NOT cite `OS_Resources/Relii/persona-alex-procurement.md` or its repo twin**, because both are updated to the NEW text once your read-back confirms, and a revert pointing at them would then restore the wrong thing. <==

---

## Scope fence

- **`scenario_context` does not change.**
- **No code, no migration, no schema change, no new dependency.**
- **Nothing in Tom's class beyond the one row and one column.**
- **No change to the historical original `a21ce861`.**
- **No rapport work on AI-generated personas.** That is D4, on the tail, and it touches the frozen `lib/persona-assembly.ts` template.
- **No touching `turn_detection`, `REALTIME_VOICE`, or anything in `lib/realtime.ts`.** D3 shipped `language: "en"` there on 2026-09-14 and its comment explains why the plural must not be restored.
- **Do not add any of decision 5's three omitted subjects.**

## How testing runs, and the order

The SQL runs through the Supabase MCP, every statement in a file the owner reads, each section returning its answer as its last statement. The B1 practices run through Playwright MCP as a student in B1 only, **text practice, no voice needed**.

**THERE IS NO CODE CHANGE, SO THERE IS NO BUILD GATE AND NO DEPLOY CHECK.** Say that in the record as a branch that did not apply rather than a step skipped. **Run the five check scripts anyway** (`check-app-time`, `check-csv-ai-level`, `check-rubric-render`, `check-scorer`, `check-persona-list`), counts read from the runs, because a moved count with no code change is a finding worth having.

**Verify git state with read-only commands only** (`git --no-optional-locks status`, `git log`, `git rev-parse`); a plain `git status` leaves a lock file that blocks the next commit. **Every git write in this repo has been leaving `.git/HEAD.lock`, `.git/objects/maintenance.lock` and `tmp_obj_*` behind.** Check after your last git command, remove any you find, and prove the tree is clean.

## Conventions, and what PROJECT_STATE must carry when you finish

No em dashes and no en dashes outside chat. Record each owner ruling in PROJECT_STATE when it is given.

**PROJECT_STATE must carry, at the end:**

- **before and after md5s and character counts**, for both columns;
- **the diff counts from check 7**, with the tool that produced them;
- **all nine checks with Alex's ACTUAL WORDS**, including both halves of the matched pair;
- **the control check first and in full**, since it is what certifies the session;
- **the B1 restore proved by md5, on both columns**;
- **the thirteen unchanged columns**, tested by name;
- **the text-only limitation**, stated plainly rather than implied;
- **an explicit statement that the narrow exception to the Tom-class guard is CLOSED again**;
- **confirmation that `origin/main` equals `main`**, with the kickoff commits pushed rather than left behind.
