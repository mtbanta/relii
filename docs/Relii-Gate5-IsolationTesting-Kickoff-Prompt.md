# Gate 5: Isolation Testing (CC Kickoff)

**Before you plan, tell me the filename and the line count of the prompt you just read.** This document lives in the repo rather than being pasted in, so a stale copy after a /clear is a real possibility and one line rules it out.

You are running **Gate 5**, the last piece of the isolation gate. Read PROJECT_STATE.md first, then the three matrices this piece executes: the bottom of `supabase/gate-3b-tests.sql` (23 items), the bottom of `supabase/gate-4b-tests.sql` (its handoff items, two of which G6 rewrote in place), and the bottom of `supabase/gate-6-checks.sql` (10 more). Also read `docs/Relii-Gate6-Handoff.md`, which already carries several of the snippets you will need.

**THIS PIECE BUILDS NOTHING.** No feature, no schema, no migration, no revert. Follow plan-first discipline: read, verify, present a plan, and WAIT for my approval before doing anything.

## What G5 is for, and what a pass means

G1 through G4b and G6 made the claim. **G5 is where the claim gets tested rather than reasoned about.** The distinction this whole gate has turned on, stated once more because it is the thing that makes this piece worth doing: **"the scoped surface renders" and "the other instructor cannot reach my data" are different claims, and only the first has ever been demonstrated.** Nothing has yet aimed a route at another class's ids.

So: **do not verify any item by reading the code.** You wrote most of it and it will look correct. Every item is a request that gets made and an answer that gets observed.

## WHAT INSTRUCTOR B ACTUALLY HOLDS, CONFIRMED BY THE OWNER

**B OWNS THREE CLASSES, AND ALL THREE ARE EMPTY: no scenario, no assignment, no student, no submission.** So "G5's setup is already done" was only ever true of the account, not of its data. B existing and rendering is not the same as B having ids to aim at, which is the same distinction this whole gate has turned on.

**Three classes under one instructor is a gift rather than a problem.** Group 2 below is written for one instructor holding several classes, and B is that instructor without anything having to be created.

**AND INSTRUCTOR A NOW OWNS TWO CLASSES**, both from the Gate 6 run: the historical class with **4 students**, and a second class with **1**. That matters twice. It gives group 2 a second instructor to run under, and more usefully **it gives the picker sweep a concrete expected value rather than "the numbers should change": the dashboard enrolled tile must read 4 in one class and 1 in the other, and the Roster must agree with it both times.** A number that is merely different is a weaker pass than a number that is right.

**THE OWNER WILL POPULATE B HIMSELF AND DOES NOT WANT STEP-BY-STEP INSTRUCTIONS FOR IT.** He can add students and practices to any of B's classes. **What he needs from you is the SHOPPING LIST: which of B's classes needs what, and why each item is needed**, so nothing is built that no test consumes and nothing is missing when the run starts.

**THE HARD CONSTRAINT, AND IT SHAPES THE MATRIX: THERE CAN BE NO SUBMISSION IN ANY OF B's CLASSES.** A generated persona cannot have a rubric attached until Phase 2, so a scenario in B's class is conversation-only and nothing there can be graded or submitted. **Practices are the only sessions B can have.**

**WHAT THAT COSTS, VERIFIED IN THE CODE RATHER THAN ASSUMED.** `lib/instructor-submission.ts` line 115 and `app/instructor/submission/[id]/page.tsx` line 73 both filter `.eq("kind", "submission")`, so **a practice can never be reached through the submission detail page or any of the three download routes.** Consequences, and state them back to me in your plan so I know they were read:

- **Items 1 to 4 are unaffected**, because they were always B aimed at A's submissions, and A has them. No practice of any mode changes those.
- **Items 5 to 7, 8, 9, 10, 20 and 21 all work with what B can hold**: students, invites, generated candidates and practices.
- **Group 2's second run of items 1 to 4, the "this is in your other class" panel on a submission, cannot be run by B at all**, because only A has submissions. **IT NEEDS NO SETUP EITHER, BECAUSE A ALREADY OWNS TWO CLASSES:** the historical class with 4 students, and a second class with 1, both created during the Gate 6 run. So A switches the picker to the second class and opens a submission id from the historical one. **That is a READ, it destroys nothing, and it exercises the panel on the surface it matters most on.**

**THE MODE QUESTION, ANSWERED: TEXT PRACTICES ARE ENOUGH.** Voice and video buys nothing for this matrix, because the only instructor-side paths that read a recording are the three download routes, and those refuse a practice by kind before class ever enters into it. **One voice and video practice in one of B's classes is optional and cheap insurance**, for a single reason worth naming: query 2 of `supabase/gate-6-checks.sql` counts recordings per class, and a non-zero number there for B makes that column meaningful instead of comparing zero against zero. **If you disagree and believe a mode difference matters somewhere in the matrix, say exactly which item and why, before I build anything.**

**B IS NOT A THROWAWAY. It is the account this piece certifies with, and it stays afterwards.** Do not delete it or its classes at the end.


## THE FIRST RULE OF RUNNING THIS PIECE

**SEVERAL ITEMS ARE DESTRUCTIVE IF THEY PASS THE WRONG WAY ROUND.** Items 11, 12, 13, 14 and 20 delete things. Each is aimed at instructor A's data expecting a refusal, **and A is the historical class, which holds every recording and every piece of demo content this project has made, and it is what Tom sees.**

**A refusal that does not refuse is a deletion.** So for each destructive item, say in your plan what is destroyed if the guard has already failed, and order the matrix so the read items run first: a read that wrongly succeeds tells you the guard is broken before any write is attempted. **If any read item fails, stop the run and tell me before executing a single write item.**

## How to organise the run

I am the one clicking, and you cannot log in, so **the deliverable is a runbook I execute top to bottom, not a description of what should be tested.** Follow the G4b handoff's form: exact steps, exact snippets, expected answer stated before each one.

- **Group by account and by session**, so I sign in as B once and run everything that needs B, rather than switching accounts forty times. Say where each id comes from and how I capture it before I need it.
- **Crafted requests go in the browser devtools console**, because it carries the session cookie and curl does not. **Write them as promise chains. Do not put `await` on the right of a `const`.**
- **Tell me to set the Safari console filter to All before anything else.** With Evaluations and Errors selected a `console.log` is hidden entirely, so a PASSING test shows nothing and reads as hung. That cost the G6 run twice.
- **Every item states its expected answer, and "not found" versus "forbidden" is part of the expectation, not a detail.** The 404 wording is deliberate: a 403 would confirm the row exists in somebody else's class.

## The three groups, and what is new in each

**Group 1, the original 23 (gate-3b-tests.sql).** B aimed at A. Items 1 to 7 are reads, 8 to 10 are listings, 11 to 20 are writes and deletes, 21 is the invite list over the web API. **Items 22 and 23 are SETTLED and are no longer tests**: the invite collision by the multi-class rulings, the cross-class reference question by G4a's constraints. Confirm the constraint bites rather than re-opening the question.

**Group 2, G6's ten (gate-6-checks.sql).** These ask a different question from group 1: not "can B reach A" but **"does one instructor's own surface follow the class they chose".** Items 1 to 3 there re-run parts of group 1 aimed at the caller's OWN other class, with different expected answers on pages than on routes. **Item 7, the cookie-tamper matrix, is the item that certifies G6** and it is the highest-value single test in this piece.

**Group 3, G4b's handoff.** The super admin surface aimed at as an ordinary instructor AND as a student, and the four crafted delete requests. **Do not re-run the cascade delete against anything real.** G4b already proved it against a throwaway; if you want it re-proved, that needs a new throwaway class and my approval first.

## TWO ITEMS I AM ADDING, AND THE FIRST ONE HAS THE NEARER DEADLINE

**1. THE STUDENT-SIDE COLUMN LEAK, TESTED FROM A REAL STUDENT SESSION.** G2 closed `persona_system_prompt` at the column level with a revoke and a per-column grant, and `gate-2-policies-tests.sql` verified **the grant table**. That is a database check, not an attempt. **Nobody has ever signed in as a student and asked the web API for that column.** Every other item in this piece protects against a second instructor; this one protects against the thirty students arriving the week of September 7, which is sooner. Sign in as a student, and with the browser key select `persona_system_prompt` and `scenario_context` from `scenarios`. Both must fail or come back absent. **This is the same shape of gap the whole gate exists to close: a thing proved at the layer that was changed rather than the layer that consumes it.**

**2. RUN GROUP 2 UNDER B, NOT UNDER A.** Group 2's items need one instructor holding several classes, and **B already holds three**, so nothing has to be created to get them. Use B for the picker sweep, the cookie-tamper matrix and item 20's scoped discard, so **no test with a destructive tail is ever pointed at the historical class.** The one exception is the submission panel described above, which only A can exercise and which is a read. **A's own picker sweep is still worth running for the 4-and-1 check**, since it is also a read.

## What happens when something fails

**A failure here is not a bug report, it is a build.** So:

- **Stop the affected group and tell me.** Do not fix it in flight.
- **Say what the failure proves and what it does not.** One route refusing wrongly is different from a shared helper failing, and the second invalidates every item that went through it.
- **A fix means the items that ran before it are no longer evidence**, exactly as a G5 pass earned before G6 would have been void. Say which ones need re-running.

## The deliverable

**A durable record, because this is the piece that certifies the gate and "we tested it" is not a record.** `docs/Relii-Gate5-Results.md`: the date, the accounts used, every item with its expected and actual answer, and anything skipped with the reason. Then PROJECT_STATE.

**If everything passes, say plainly what that does and does not certify.** It certifies isolation between two instructor accounts and between one instructor's own classes, as of a commit, with the data that existed. It does not certify anything about a third instructor, and it is not a promise about code written after it.

## Out of scope

- **No feature work, no schema change, no migration, no revert.**
- **No code changes at all unless a test fails and I approve the fix.**
- **Do not remove or relax the "instructors add to invite list" policy on `allowed_emails`.** It has no live browser user in the app any more, and it is still a live backstop against a browser key calling the web API directly. G6's handoff says so explicitly.
- Do not re-run G4b's cascade delete against real data, and do not delete instructor B.

## Standing conventions

- Present your PLAN first (the setup check and what B needs, the run order, the account grouping, both added items, and what you will do on a failure) and WAIT for my approval.
- **THERE IS NO SQL IN THIS PIECE, so the usual hard stop does not fire.** The read-only queries in the three files are ones I run to observe, not migrations. If your plan concludes a migration is needed, stop and say so, because that reverses this.
- Test on the deployed URL relii.vercel.app, not localhost. Commits AND pushes stay manual and you perform them.
- **Do not mark PROJECT_STATE done before I have completed the run and given you the answers.** You cannot log in, so every actual result in this piece comes from me.
- No em or en dashes in any file or content.
