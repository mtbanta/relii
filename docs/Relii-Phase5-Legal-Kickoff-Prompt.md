# Phase 5: Policy Pages and the Consent Click-Through (CC Kickoff)

**Before you plan, tell me the filename and the line count of the prompt you just read.** This document lives in the repo rather than being pasted in, so a stale copy after a /clear is a real possibility and one line rules it out.

You are building **Phase 5**, the first piece after the isolation gate. Read PROJECT_STATE.md first. Follow plan-first discipline: read, verify, present a plan, and WAIT for my approval before writing code.

## Why this is first, ahead of the rest of the plan

**It is the only remaining item gated by a date rather than a dependency.** Roughly 64 students across Tom's three classes opt in and register **next week**. The click-through gates registration, so a student who registers before it exists has registered without consenting, and that cannot be fixed after the fact by adding a checkbox later.

Everything else in the plan gates grading, which is weeks downstream of students actually doing work.

## What you are building

**1. Two policy pages, reachable WITHOUT signing in.** Source files, confirmed by Tom on September 5 as the versions to use, **already copied into the repo for you:**
- `docs/Relii-Privacy-Policy.md` (47 lines, **Effective Date: September 7, 2026**)
- `docs/Relii-clickthrough-agreement.md` (51 lines, the Relii.io Pilot Agreement)

Read both before you plan. You do not need filesystem access outside the project for this piece.

**2. The consent click-through at registration**, recorded per user.

## THE RULE THAT GOVERNS THE CONTENT, AND IT IS NOT NEGOTIABLE

**DO NOT REWORD THE LEGAL TEXT.**

**THE STRUCTURAL CLEANUP IS ALREADY DONE, SO YOU DO NOT HAVE TO JUDGE IT.** The Google Docs export had applied heading styles to list items (`1. ### **Information We Collect**`, and worse, `1. ### **Security:**` nested inside a list), which no renderer handles consistently and which would have made you invent a heading hierarchy for a legal document mid-build. The two files in `docs/` are the cleaned canonical source: headings normalized, escaped periods and `\!` resolved, empty heading artifacts removed. **A word-level diff against Tom's originals confirms not one word of prose changed**; the originals are preserved untouched outside the repo.

**So render these files as they are.** If a passage still looks genuinely broken rather than merely ugly, **list it for me rather than fixing it**. I will take it to Tom.

**Two deliberate carries you should not "fix":** the acknowledgment line contains an em dash, preserved because it is Tom's sentence rather than ours, and the literal `[ ]` checkbox glyph was dropped from that line because the page carries a real checkbox instead.

## THREE COPY DECISIONS ALREADY MADE (owner, September 8, 2026). Do not reopen them.

1. **The pages say nothing about response time.** No "we aim to respond within X". A response-time promise in a privacy policy is a commitment nobody scheduled.
2. **No person is named, on the pages or in the click-through. The address alone.** Naming a person makes the page wrong the day either of us steps back.
3. **`contact@relii.io` is real and is the contact route.** It is a live Microsoft 365 mailbox, verified in the GoDaddy account on September 8. **This closes a note that has been in the plan since August saying the mailbox did not exist.** The privacy policy names it, and that is now true.

## THE DESIGN QUESTION I WANT YOUR PROPOSAL ON, BECAUSE IT TOUCHES THE MOST DANGEROUS FUNCTION IN THE APP

**How does consent get recorded, and is it atomic with account creation?**

The two shapes I can see, and I want your recommendation with the risk stated plainly:

**Shape A, a server route after signup.** `app/register/page.tsx` line 46 calls `supabase.auth.signUp()` and then `router.push("/")`. A route called after a successful signup writes the consent row. **The risk is a gap: if that second call fails, an account exists with no consent record**, and nothing on screen would say so.

**Shape B, through the signup trigger.** `signUp()` accepts `options.data`, which lands in `raw_user_meta_data`, and `public.handle_new_user()` (supabase/gate-1-class-spine.sql line 264) already inserts the profile row inside the same transaction. Consent written there is **atomic with account creation and cannot drift**.

**==> BUT SHAPE B EDITS THE SIGNUP TRIGGER, AND THAT FUNCTION IS THE SINGLE MOST LOAD-BEARING BLOCK IN THE SCHEMA.** Its own comment says it is the only thing standing between Relii and open registration. It also creates the class for a new instructor and the membership row for a new student, so a mistake there does not fail cleanly, it fails at registration for everyone. **And `supabase/gate-1-class-spine.sql` is only re-runnable while michaeltbanta@gmail.com exists as an instructor** (see PROJECT_STATE Open Issues), which constrains how a change to it gets shipped and reverted. <==

**Say which you recommend and why.** If you propose B, say exactly how it is reverted if registration breaks, and remember that a broken registration on launch week is the worst possible failure in this app.

## FOUR THINGS TO DECIDE AND TELL ME, NOT GUESS

**A. The version string.** The plan's standing rule is **store the VERSION, not a boolean**, because a boolean cannot tell who accepted which text if Tom ever revises it, and re-consent then becomes impossible to track. The privacy policy carries `Effective Date: September 7, 2026`. **The pilot agreement carries no date at all.** Propose how both are versioned as one consent record or two.

**B. What happens to accounts that already exist.** Michael, Tom, the second instructor account and the test students all registered before any of this. **The ~64 real students are all downstream of this shipping, so the retroactive question is small, but it is not zero.** Say whether existing users get a gate on next login, are backfilled, or are left alone, and why.

**C. Where the pages live and how they are reached.** They must work signed out, because `app/register/page.tsx` will link to them. Say the routes. Note that `app/page.tsx` redirects anyone not signed in to `/login`, so a policy route has to sit outside that behaviour.

**D. Whether the checkbox blocks the button, and how that is enforced.** **A checkbox the browser can bypass is not consent, it is decoration**, and this project has spent two gate pieces removing conventions enforced by nothing. Say what the server does if a signup arrives without an accepted version.

## Out of scope

- **No change to any invite, class or isolation code.** The gate is finished and certified.
- **No rewording of the legal text**, per the rule above.
- **No third-party consent tool.** For roughly 64 users a recorded checkbox is the right answer, and adding a vendor here means a data processor in a privacy policy that does not mention one.
- **No email sending.** There are no invite or registration emails in v1, by Tom's July decision.
- Do not touch `contact@relii.io` or any DNS. That is settled and it is mine.

## Standing conventions

- Present your PLAN first (the consent shape and its risk, all four decisions, the routes, and anything you disagree with) and WAIT for my approval before writing code.
- **If your plan needs SQL, propose it and STOP for my approval before I run it in Cursor.** A consent table is additive and expected; the trigger is not, see above.
- Test on the deployed URL relii.vercel.app, not localhost. Commits AND pushes stay manual and you perform them.
- **Do not mark PROJECT_STATE done before I have confirmed the click-through.**
- **Verify at the layer that consumes the thing, not just the layer you changed.** For this piece that means registering a real throwaway account end to end and confirming the consent row exists, not confirming the checkbox renders.
- No em or en dashes in any file or content.

## Testing

**The first rule: test registration with a THROWAWAY invite, never with a real student address.** Every address is global (`allowed_emails.email` is the primary key), so a burnt address is a student who cannot register.

1. **A signed-out visitor can open both policy pages** by typing the address, with no redirect to /login.
2. **Register a throwaway account with the box ticked.** The account is created, the profile and class membership land as before, and the consent row records the version.
3. **Attempt a signup with the box unticked, and then attempt one bypassing the browser**, the way the crafted requests worked in Gate 4b and Gate 5. **The server must refuse the second one**, or the checkbox is decoration.
4. **The existing instructor and student surfaces still work**, and registration still works for an ordinary invited student. This is the regression that matters: everything else in this piece is additive, and registration is the one path it can break.
5. Both pages render correctly on a phone. Students will read them on one.
