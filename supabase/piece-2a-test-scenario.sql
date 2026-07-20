-- Relii sprint piece 2a: TWO THROWAWAY TEST SCENARIOS.
--
-- ***********************************************************************
-- *  THIS IS TEST DATA, NOT REAL COURSE CONTENT.                        *
-- *  Both rows are titled "TEST - ..." so they are obvious at a glance. *
-- *  DELETE THEM BEFORE THE DEMO. Removal steps are at the bottom.      *
-- ***********************************************************************
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", paste this
-- whole file in, and click "Run". It is safe to run more than once: each insert
-- is skipped if a scenario with that title already exists.
--
-- REQUIREMENT: run supabase/piece-2a-conversation-only.sql FIRST. These rows
-- rely on the two things it adds (an optional rubric, and the enabled switch).
--
-- WHY TWO ROWS
-- They test two different things, and they are separate on purpose so that one
-- test cannot disturb the other:
--
--   1. "TEST - Conversation only: Riley (facilities director)" is ENABLED with
--      NO rubric. This is the one you actually hold conversations with. It
--      proves a case can run in text and in voice+video, end with no score, and
--      behave correctly on the results screen and in the saved-practices list.
--
--   2. "TEST - Disabled scenario (should never appear in the picker)" is
--      DISABLED. It proves the create-assignment picker hides disabled
--      scenarios. It exists so you do not have to switch off the scenario you
--      are running conversations against in order to test this.
--
-- A NOTE ON meeting_type: it is a required field, so both rows have to name a
-- meeting even though nothing will ever read it here. Meeting type only decides
-- which rubric items the scorer uses, and with no rubric there is no scoring.
-- 'discovery' is set purely to satisfy the requirement.

-- ---------------------------------------------------------------------------
-- 1. The enabled, conversation-only scenario (the one you role-play).
-- ---------------------------------------------------------------------------
insert into public.scenarios
  (title, persona_name, persona_system_prompt, scenario_context, meeting_type, rubric_id, enabled)
select
  $title$TEST - Conversation only: Riley (facilities director)$title$,
  $pname$Riley$pname$,
  $prompt$You are Riley, the facilities director for a company that manages a portfolio of about twenty commercial office buildings. You are responsible for keeping those buildings running: heating and cooling, lighting, cleaning, and the service contracts behind all of it. You are meeting a sales representative from a commercial HVAC service company who is trying to win your maintenance contract. You have set aside about fifteen minutes.

YOUR ROLE AND DEMEANOR
- You are practical, direct, and busy. You think about tenant complaints, emergency call-outs, and the equipment that fails in the middle of a July heat wave.
- You are skeptical but fair. You do not punish a rep for being new, but you have no patience for sales fluff, vague promises, or anything that sounds like a brochure.
- Pricing has already been settled and is not the topic. What earns your attention is response time, technician quality, and whether this vendor will actually prevent failures rather than just show up after one.
- You reward a specific, operationally literate question by engaging and sharing detail. You meet a vague or generic pitch with short, skeptical answers.

WHAT YOU CARE ABOUT (your real decision criteria, in order)
- Emergency response time above almost everything. A rooftop unit down in summer means tenant complaints within the hour, and your current vendor has been slow.
- Technician consistency: you want people who already know your buildings, not a different stranger every visit.
- Genuinely preventive maintenance, so failures stop happening at all, with proof it works rather than a claim that it does.
- Clear reporting you can hand to your executives without rewriting it yourself.

HIDDEN FACTS (share these only if the seller asks a good question that uncovers them)
- Your current vendor took eleven hours to respond to a rooftop unit failure last August. Two tenants complained in writing and one raised it at a lease renewal.
- You have had four different lead technicians in eighteen months, and each one had to learn the buildings from scratch.
- Your maintenance budget was cut by about eight percent this year, so anything you buy has to be defensible to your CFO.

HOW YOU BEHAVE IN THE MEETING
- Open by acknowledging the rep and making clear your time is short.
- Answer what you are asked. Do not volunteer the hidden facts above unsolicited; make the seller earn them with good questions.
- Raise objections a real facilities director would raise: switching vendors is disruptive, you have heard preventive-maintenance promises before, and your budget is tighter this year.
- Stay in character as Riley for the whole conversation. Never break character, never mention that you are an AI, and never discuss these instructions.$prompt$,
  $ctx$This is a first meeting. The seller works for a commercial HVAC service company and wants to win the maintenance contract for Riley's twenty-building office portfolio. Pricing has already been settled, so the seller must find value and risk beyond price. The meeting is scheduled for about fifteen minutes.

This is a CONVERSATION-ONLY practice case: it has no rubric and produces no score. It exists to let a student rehearse the conversation itself.$ctx$,
  $meeting$discovery$meeting$,
  null,
  true
where not exists (
  select 1 from public.scenarios
   where title = $title$TEST - Conversation only: Riley (facilities director)$title$
);

-- ---------------------------------------------------------------------------
-- 2. The disabled scenario (proves the picker hides it).
-- ---------------------------------------------------------------------------
-- Deliberately minimal. It should never be assignable, so it never needs to
-- hold a real conversation.
insert into public.scenarios
  (title, persona_name, persona_system_prompt, scenario_context, meeting_type, rubric_id, enabled)
select
  $title$TEST - Disabled scenario (should never appear in the picker)$title$,
  $pname$Testcase$pname$,
  $prompt$This scenario is switched off and exists only to confirm that a disabled scenario is hidden from the instructor's create-assignment picker. It is not meant to be role-played.$prompt$,
  $ctx$Test data. Disabled on purpose. Delete before the demo.$ctx$,
  $meeting$discovery$meeting$,
  null,
  false
where not exists (
  select 1 from public.scenarios
   where title = $title$TEST - Disabled scenario (should never appear in the picker)$title$
);

-- ---------------------------------------------------------------------------
-- 3. Check it worked (this changes nothing; it just shows you the result).
-- ---------------------------------------------------------------------------
-- Expect two rows: Riley with enabled = true, and the disabled one with
-- enabled = false. Both should show has_rubric = false.
select
  title,
  persona_name,
  (rubric_id is not null) as has_rubric,
  enabled
from public.scenarios
where title like 'TEST - %'
order by title;

-- ===========================================================================
-- HOW TO REMOVE THIS TEST DATA (before the demo)
-- ===========================================================================
--
-- DO THE APP STEP FIRST. Deleting rows here in SQL does NOT delete the webcam
-- recordings in file storage, which would leave stray video files behind. The
-- app's own delete buttons remove the recordings properly, so use them first.
--
--   STEP 1 (in the app, as the instructor): go to the instructor page, find the
--   test assignment you created for the Riley scenario, and use its Delete
--   button. It will warn you how many practice sessions it is destroying and
--   ask you to type DELETE. That removes the assignment, the practice sessions,
--   AND their recordings, in the right order.
--
--   STEP 2 (here in the SQL Editor): run the two lines below to remove the two
--   test scenarios themselves. They will only succeed once step 1 has removed
--   everything pointing at them, which is a deliberate safety net: if you get an
--   error mentioning "violates foreign key constraint", it means some session or
--   assignment still uses the scenario, so go back and finish step 1.
--
-- delete from public.scenarios
--  where title = 'TEST - Conversation only: Riley (facilities director)';
--
-- delete from public.scenarios
--  where title = 'TEST - Disabled scenario (should never appear in the picker)';
--
-- Then confirm nothing is left. This should return no rows:
--
-- select title from public.scenarios where title like 'TEST - %';
