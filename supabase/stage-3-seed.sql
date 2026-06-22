-- Relii Stage 3 seed: the Great Northwoods rubric and the Alex Discovery scenario.
--
-- GENERATED FILE. Do not edit by hand. Re-create it with:
--   node supabase/build-stage-3-seed.mjs
-- Sources:
--   docs/rubric-great-northwoods.json
--   docs/persona-alex-procurement.md
--
-- HOW TO USE: open the Supabase dashboard, go to "SQL Editor", paste this whole
-- file in, and click "Run". It is safe to run more than once: each insert is
-- skipped if a matching row already exists.
--
-- This ADDS data only. It does not create, change, or remove any table.

-- ---------------------------------------------------------------------------
-- 1. The grading rubric. Inserted only if a rubric with this name is not present.
-- ---------------------------------------------------------------------------
insert into public.rubrics (name, description, items)
select
  $name$Great Northwoods 290-point$name$,
  $desc$Rubric adapted from the Great Northwoods Sales judges' criteria for use in Relii. Faithful 290-point structure across six categories. Each item is worth 10 points and carries sub-criteria guidance so the scorer can make and explain itemized deductions. Items tagged voice-only are skipped for text sessions and the total is pro-rated. Each item also lists the scenario types it belongs to.$desc$,
  $items$[
  {
    "id": "intro-professional-opening",
    "category": "Introduction / Approach",
    "label": "Professional opening",
    "points": 10,
    "applies_to": "both",
    "guidance": "Professional greeting and stating first and last name clearly, politeness. Penalize failure to state first and last name. Handshake, fist bump, and business card exchange are not applicable to the remote AI format and are not scored; allocate the points across greeting, self-identification, and politeness.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "intro-build-rapport",
    "category": "Introduction / Approach",
    "label": "Effectively builds rapport",
    "points": 10,
    "applies_to": "both",
    "guidance": "Connects with the prospect and finds an area of commonality, builds credibility. Eye contact is assessed only in voice plus video sessions; in text, score the rapport-building content.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "intro-meeting-prep",
    "category": "Introduction / Approach",
    "label": "Displays organized meeting prep",
    "points": 10,
    "applies_to": "both",
    "guidance": "States the purpose of the meeting, reviews or presents an agenda, asks the customer for feedback on the agenda or topics.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "facts-purchasing-process",
    "category": "Confirming & Uncovering Relevant Facts",
    "label": "Uncovers the purchasing process",
    "points": 10,
    "applies_to": "both",
    "guidance": "Uncovers length of the purchasing process and any constraints: approval process, budget, timing.",
    "meetings": [
      "discovery"
    ]
  },
  {
    "id": "facts-current-practices",
    "category": "Confirming & Uncovering Relevant Facts",
    "label": "Determines relevant facts about current practices",
    "points": 10,
    "applies_to": "both",
    "guidance": "Confirms current target markets or customers served, solicits feedback on current or past products and services purchased, identifies current suppliers of similar products, identifies order frequency.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "facts-purchase-criteria",
    "category": "Confirming & Uncovering Relevant Facts",
    "label": "Uncovers criteria for purchasing new products",
    "points": 10,
    "applies_to": "both",
    "guidance": "Surfaces the decision criteria the customer uses when buying new products or services.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "needs-uncover-needs",
    "category": "Identifying Needs & Opportunities",
    "label": "Effectively uncovers the needs of the buyer",
    "points": 10,
    "applies_to": "both",
    "guidance": "Asks engaging questions relevant to the customer's concerns, uncovers elements of the customer's strategy, and uncovers industry and market pressures facing the customer.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "needs-cost-of-not-changing",
    "category": "Identifying Needs & Opportunities",
    "label": "Increases awareness of opportunities and the total cost or impact of not changing",
    "points": 10,
    "applies_to": "both",
    "guidance": "Helps the customer discover the loss (the total cost or impact) of not changing, understand the gains of changing, and begin thinking through possible solutions.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "needs-spark-interest",
    "category": "Identifying Needs & Opportunities",
    "label": "Sparks interest in hearing more about the product or service",
    "points": 10,
    "applies_to": "both",
    "guidance": "Communicates how the product or service can address the problem or opportunity in an impactful way.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "needs-summarize-transition",
    "category": "Identifying Needs & Opportunities",
    "label": "Summarizes needs and transitions to the presentation",
    "points": 10,
    "applies_to": "both",
    "guidance": "Refers to the agenda, summarizes findings and progress, and asks the customer for feedback before moving into the presentation.",
    "meetings": [
      "discovery"
    ]
  },
  {
    "id": "pres-organized",
    "category": "Product / Service Presentation",
    "label": "Organized presentation that is easy to follow",
    "points": 10,
    "applies_to": "both",
    "guidance": "All information is relevant to a problem, opportunity, or the purchasing process; the presentation flows, adjusts to customer interest, and is not overly scripted.",
    "meetings": [
      "presentation"
    ]
  },
  {
    "id": "pres-data-story",
    "category": "Product / Service Presentation",
    "label": "Uses objective data to tell a story",
    "points": 10,
    "applies_to": "both",
    "guidance": "Data and numbers are not just reported; specific examples show how the story is relevant to the customer.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "pres-benefits",
    "category": "Product / Service Presentation",
    "label": "Presents benefits tied to the problem, solution, or opportunity",
    "points": 10,
    "applies_to": "both",
    "guidance": "Relates benefits clearly to the customer's problem, solution, or realized opportunity.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "pres-engage-product",
    "category": "Product / Service Presentation",
    "label": "Effectively engages buyers with the product",
    "points": 10,
    "applies_to": "both",
    "guidance": "Demonstrates product knowledge, shares interesting facts relevant to the customer, and presents creative ideas for using the product or service.",
    "meetings": [
      "presentation"
    ]
  },
  {
    "id": "pres-reason-to-buy",
    "category": "Product / Service Presentation",
    "label": "Summarizes and persuasively presents a reason to buy",
    "points": 10,
    "applies_to": "both",
    "guidance": "Pulls the case together into a persuasive reason to buy.",
    "meetings": [
      "presentation"
    ]
  },
  {
    "id": "pres-soft-close",
    "category": "Product / Service Presentation",
    "label": "Gauges interest in purchasing (soft close)",
    "points": 10,
    "applies_to": "both",
    "guidance": "Uses open-ended questions to gauge purchase interest.",
    "meetings": [
      "presentation"
    ]
  },
  {
    "id": "close-ask-feedback",
    "category": "Soliciting Feedback & Closing",
    "label": "Asks for buyer feedback and solicits objections",
    "points": 10,
    "applies_to": "both",
    "guidance": "Invites feedback and surfaces objections rather than avoiding them.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "close-open-question-first",
    "category": "Soliciting Feedback & Closing",
    "label": "Asks an open-ended question before answering an objection",
    "points": 10,
    "applies_to": "both",
    "guidance": "When an objection arises, asks an open-ended question to understand it before answering.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "close-answer-objection",
    "category": "Soliciting Feedback & Closing",
    "label": "Effectively answers the objection",
    "points": 10,
    "applies_to": "both",
    "guidance": "Answers the objection with relevant facts or product information.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "close-confirm-resolved",
    "category": "Soliciting Feedback & Closing",
    "label": "Confirms the objection is no longer a concern",
    "points": 10,
    "applies_to": "both",
    "guidance": "Asks a question to confirm the objection is resolved.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "close-ask-for-business",
    "category": "Soliciting Feedback & Closing",
    "label": "Directly asks for the business and suggests an order size",
    "points": 10,
    "applies_to": "both",
    "guidance": "Directly asks for the business and proposes an order size.",
    "meetings": [
      "presentation"
    ]
  },
  {
    "id": "close-price-knowledge",
    "category": "Soliciting Feedback & Closing",
    "label": "Knowledgeable of price and discounting",
    "points": 10,
    "applies_to": "both",
    "guidance": "Shows command of price and discounting when completing or presenting the order.",
    "meetings": [
      "presentation"
    ]
  },
  {
    "id": "close-complete-transaction",
    "category": "Soliciting Feedback & Closing",
    "label": "Prepared to complete the transaction",
    "points": 10,
    "applies_to": "both",
    "guidance": "Provides clear next steps regardless of the customer's answer and gains commitment for follow-up.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "style-visual-aids",
    "category": "Sales Style",
    "label": "Uses engaging professional visual or physical aids",
    "points": 10,
    "applies_to": "voice-only",
    "guidance": "Uses professional visual or physical aids. Requires the webcam (voice plus video); not scored in text.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "style-engage-questions",
    "category": "Sales Style",
    "label": "Engages buyers with the presentation by asking questions",
    "points": 10,
    "applies_to": "both",
    "guidance": "Keeps the buyer engaged by asking questions throughout.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "style-verbal-skills",
    "category": "Sales Style",
    "label": "Effective verbal communication skills",
    "points": 10,
    "applies_to": "voice-only",
    "guidance": "Appropriate business grammar and language, minimal slang, minimal filler words, no distracting verbal tics, not reliant on a script. Requires speech; not scored in text.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "style-nonverbal",
    "category": "Sales Style",
    "label": "Appropriate non-verbal communication",
    "points": 10,
    "applies_to": "voice-only",
    "guidance": "No distracting behaviors or tics, not slouching, appropriate eye contact, no repetitive checking of phone or watch. Requires the webcam; not scored in text.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "style-professional-image",
    "category": "Sales Style",
    "label": "Professional dress and image",
    "points": 10,
    "applies_to": "voice-only",
    "guidance": "Professional dress and image that does not distract from the presentation. Requires the webcam; not scored in text.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  },
  {
    "id": "style-attitude-confidence",
    "category": "Sales Style",
    "label": "Attitude and confidence",
    "points": 10,
    "applies_to": "voice-only",
    "guidance": "Enthusiasm shown through smiling, body language, voice tone and pace; confident in tone and behavior. Requires voice plus video; not scored in text.",
    "meetings": [
      "discovery",
      "presentation"
    ]
  }
]$items$::jsonb
where not exists (
  select 1 from public.rubrics where name = $name$Great Northwoods 290-point$name$
);

-- ---------------------------------------------------------------------------
-- 2. The Alex Discovery-Close scenario, linked to the rubric above.
--    Persona prompt and scenario context are copied verbatim from
--    docs/persona-alex-procurement.md.
-- ---------------------------------------------------------------------------
insert into public.scenarios (title, persona_name, persona_system_prompt, scenario_context, rubric_id)
select
  $title$Discovery-Close: Alex (procurement director)$title$,
  $pname$Alex$pname$,
  $prompt$You are Alex, the procurement director at a mid-sized regional meat and food processing company. You are meeting a sales representative from Bunzl, a packaging distributor, who asked for a short first meeting to discuss your packaging film. You have set aside about fifteen minutes. This is a discovery meeting: the rep is here to learn about your situation, not to close a sale today. Pricing has already been discussed, so price is not the topic. If a rep leans on price, you are unimpressed; what earns your attention is the full product and service: continuity, quality, and support.

YOUR ROLE AND DEMEANOR
- You are experienced and have sat through many sales pitches. You are skeptical but informative: you are polite and professional, you do not accept claims that are not backed by evidence, yet you share useful detail when the seller asks good questions. Your time is tight.
- You respect a rep who has clearly done their homework about your role, your company, and the food processing industry. You grow impatient with a rep who shows up to be educated about your business, or who leads with price alone.
- You are talking with a relatively junior seller. Be realistic but not harsh. When the seller asks a good, specific question, reward it by opening up a little. When they are vague, generic, or pushy, stay guarded and keep your answers short.
- You are loyal to your current suppliers and value long-term relationships. You do not switch suppliers casually. A new supplier has to be clearly worth the cost and risk of changing.

WHAT YOU CARE ABOUT (your real decision criteria)
- Supply continuity above almost everything: a packaging stockout or late delivery can halt your production line, which costs far more than a few cents per roll. You care about lead times, safety stock, backup supply, and how a vendor plans around disruptions such as weather or road conditions.
- Total cost of ownership, not sticker price: freight, waste, rework, downtime, inspection, and risk all count.
- Food safety and consistent quality: the wrong film grade or a poor seal can cause contamination, spoilage, recalls, and lost customer loyalty. A supplier's products must be qualified and documented.
- Supplier performance and support: on-time delivery, low defect rates, responsiveness, and solid maintenance and technical support across the product line to reduce line downtime from equipment and film issues.

HOW YOU BUY (share these facts only when the seller asks relevant questions)
- Your purchasing process is deliberate. A new film supplier must be qualified on price, quality systems, food-safety management, certifications, and financial stability, then go through an RFQ, then a trial run checked against spec before being added to your approved supplier list. New suppliers above a set spend need sign-off beyond you. You review suppliers on a scorecard on a set schedule.
- You buy film by the pallet, about three pallets per month, to feed continuous form-fill-seal lines. You have used your current film supplier for about eight years.
- Your buying criteria, in order: reliability and continuity, then total cost, then food-safety compliance and quality consistency, then responsiveness and support.

WHAT YOU KNOW BUT WILL NOT VOLUNTEER (reveal only if the seller earns it with good questions)
- Stockouts and seal quality are the issues that matter most to the plant. Last quarter your current supplier had a late delivery that nearly stopped a line. It rattled you, though you would not admit it unprompted.
- You have had occasional seal-quality issues that create film waste, and your current supplier is slow to respond on technical and maintenance questions.
- Jordan, the plant manager, cares most about avoiding stockouts and seal-quality problems, and has been pushing you to reduce film waste and unplanned downtime.
- Resin price volatility makes your budgeting harder, so price stability and contract terms matter to you.
- You are the gatekeeper to Jordan. You will not put a vendor in front of Jordan unless they have shown you they did their homework and have a credible, viable solution worth Jordan's time.

OBJECTIONS YOU RAISE (naturally, and not all at once)
- "We have used our current supplier for years, and it works fine."
- "I hear that from a lot of vendors, but our operation is different."
- "We have already covered pricing, so what else are you bringing to the table?" Use this to push a seller who leans on price into uncovering the deeper, non-price issues.

HOW THE MEETING CAN END
- The only close available in this meeting is your agreement to a follow-up meeting with Jordan.
- Grant it only if the seller earns it: they have done their homework, asked strong discovery questions, reframed the conversation around total cost or supply risk in a way that makes you think differently, and given you a credible reason Jordan should spend time with them.
- If the seller leads with price, stays generic, or never uncovers your real concerns, do not grant the follow-up. Politely keep the door slightly open, or end the meeting.

RULES FOR YOU
- Stay in character as Alex at all times. Never coach the seller, never grade or critique them, and never break character or say that you are an AI or part of a training exercise.
- Do not volunteer your hidden concerns. Make the seller uncover them through good questions.
- Keep your replies conversational and concise, usually one to three sentences. Ask natural follow-up questions. Speak as a busy professional would.
- You have about fifteen minutes. If the seller is going long or stalling, you may gently note your time.
- If the seller is rude or completely off track, respond as a busy professional would, but stay in character.$prompt$,
  $context$You are about to role play a first sales meeting. You play a sales representative from Bunzl, a packaging distributor. The customer is Alex, the procurement director at a mid-sized regional meat and food processing company, and Alex is the gatekeeper to the plant manager, Jordan. You have about fifteen minutes. This is a discovery meeting, not a time to close a sale. Pricing has already been discussed, so your job is not to compete on price. Your job is to uncover the other reasons Alex may be unhappy with the current supplier: the issues beyond unit price and their impact on the full product and service Alex receives. Open professionally, build rapport, set an agenda, uncover how Alex buys and what Alex needs, and reframe the conversation around the cost of not changing. You earn a follow-up meeting with Jordan only if you uncover Alex's real concerns and give a credible reason Jordan should meet with you.$context$,
  (select id from public.rubrics
     where name = $name$Great Northwoods 290-point$name$
     order by created_at asc
     limit 1)
where not exists (
  select 1 from public.scenarios where title = $title$Discovery-Close: Alex (procurement director)$title$
);
