# Relii Data Model (Stage 2)

This is the plain-English description of Relii's database. It is meant to be readable by a non-coder and shareable with the team. It builds on the Stage 1 setup and does not change anything Stage 1 created.

## What Stage 1 already gave us

Two tables and some security plumbing:

- **allowed_emails**: the invite list. An email, a role (student or instructor), who added it, and when. Only emails on this list can register.
- **profiles**: one row per real logged-in user. Their account id, email, and role.

Plus a reusable helper, **is_instructor()**, that answers "is the person making this request an instructor?", and Row Level Security ("RLS"), which is the database-level wall that decides which rows each person is allowed to see. RLS cannot be bypassed from the app, so it is what keeps grades and private sessions safe.

## The four new tables and how they connect

```
  rubrics        (the grading criteria, stored as flexible data)
     |
     |  each scenario is scored by one rubric
     v
 scenarios       (the role-play cases: persona, prompt, context)
     |
     |  each assignment uses one scenario
     v
assignments      (an instructor says "do THIS scenario, in THIS mode")
     |
     |  a session can belong to an assignment (or be free practice)
     v
  sessions       (one row per attempt: practice or submission, the
                  transcript, the video, the score) ---- and belongs
                  to one student (profiles)
```

### 1. rubrics

The grading sheet. The list of scored items is stored as flexible data (a JSON list), not as fixed columns. That is what lets us swap in a Bunzel-specific rubric later with no code changes. The default Great Northwoods 290-point rubric is loaded later, not now.

Holds:

- **name**, for example "Great Northwoods 290-point".
- **description** (optional).
- **items**: the list of scored lines. Each line carries a stable id, a label, its points, and a tag of "both" or "voice-only" (so spoken-only items like verbal fillers and tone are skipped when grading a text session).

Shape of one rubric's item list:

```json
[
  { "id": "open-discovery",  "label": "Asks open discovery questions", "points": 20, "applies_to": "both" },
  { "id": "verbal-fillers",  "label": "Avoids verbal fillers",         "points": 10, "applies_to": "voice-only" }
]
```

### 2. scenarios

One row per role-play case. The persona lives inside the scenario (decision E), so each scenario holds:

- **title**, a friendly label, for example "Bunzel cost-reduction negotiation".
- **persona_name**, for example "Alex" or "Jordan".
- **persona_system_prompt**, the instructions that make the AI behave like that procurement director or plant manager.
- **scenario_context**, the situation the student walks into.
- a link to **which rubric** scores it (required, so every scenario is gradable).

If two scenarios both use "Alex", his prompt is stored twice. For two personas and a handful of scenarios that is fine. If we later want one shared "Alex" reused across many scenarios, we can split personas into their own table without a rebuild.

### 3. assignments

What an instructor assigns. Holds:

- **title**.
- **instructions** (optional free text, decision D).
- a link to **which scenario** to run.
- **required_mode**: either "text" or "voice_video" (voice plus video), the mode the graded submission must use.
- **due_at** (optional due date, decision D).
- who created it, and when.

### 4. sessions

The heart of the model. One row per role-play attempt. Holds:

- **student_id**: which student it belongs to.
- **scenario_id**: which scenario was run (required).
- **assignment_id**: which assignment it is for (optional, so free practice not tied to an assignment is allowed, decision C).
- **kind**: "practice" or "submission".
- **mode**: "text" or "voice_video".
- **status**: where it is in its life, one of "in_progress", "completed", "scored".
- **transcript**: the conversation, stored as a structured list so it can be replayed turn by turn.
- **video_path**: the location of the video file. The actual video lives in Supabase file storage, which is wired up in Stage 5. This column just holds the path.
- **score**: the itemized grade as JSON (per rubric line: points earned, the max, and an optional comment).
- **score_total**: a single number copied alongside the JSON, so the instructor dashboard can sort by score without digging into the JSON.
- **submitted_at** and **scored_at**: timestamps for the two key moments.
- **created_at**.

Shape of the transcript:

```json
[
  { "role": "persona",  "text": "Thanks for coming in. What did you want to discuss?", "at": "2026-08-10T15:00:01Z" },
  { "role": "student",  "text": "I wanted to talk about your packaging costs.",         "at": "2026-08-10T15:00:09Z" }
]
```

Shape of the score:

```json
{
  "total": 230,
  "max_total": 290,
  "items": [
    { "id": "open-discovery", "points_earned": 16, "points_max": 20, "comment": "Good open questions, missed budget." }
  ]
}
```

One built-in safety rule: a row whose kind is "submission" must have an assignment_id (you cannot submit toward nothing). Practice rows may have an assignment or be free practice.

## How the course rules are supported

Two of these are lifecycle rules whose full logic is built in Stage 7. The schema does not block them:

- **Cap of 3 stored practice sessions per student per assignment.** Counting is one simple question: how many session rows have this student, this assignment, and kind = practice? Stage 7 enforces the limit (in the server code or a small database guard).
- **Submitting deletes that student's practices for that assignment.** When a submission is recorded, the server deletes the matching practice rows for that student and assignment.

The third rule is set up now, with Row Level Security:

- A student can read only their own sessions (practice and submission).
- An instructor can read submissions, but not anyone's practice runs.
- Any instructor can see any student's submission (decision B).
- Scenarios, rubrics, and assignments are readable by any logged-in user (students need to see their assignment), and only instructors can create or edit them.

## Who can write to sessions (decision A)

Only the app's server writes sessions (creating them, saving the transcript, and writing the score). Students can read their own sessions but cannot write them. This keeps scores tamper-proof and keeps the cap and the delete-on-submit logic in one trustworthy place. It relies on a server-only secret key that never goes near the browser. Scenarios, rubrics, and assignments are different: instructors manage those directly from the instructor screens, protected by the is_instructor() rule.

## Foreign-key safety behavior

The general rule is "you cannot delete a thing that other things still depend on", which protects you from accidentally wiping graded work:

- You cannot delete a rubric that a scenario still uses.
- You cannot delete a scenario that an assignment or session still uses.
- You cannot delete an assignment that still has sessions.
- The one exception: deleting a student removes that student's sessions, which is what you would want (this is the cleanup deferred to Stage 7).
- If the instructor who created a rubric, scenario, or assignment is ever removed, the content stays (the "created by" simply goes blank).

## How we verify a student cannot read another student's sessions

Two ways:

1. **In the database, right now.** A short script (in supabase/stage-2-data-model.sql notes and in the chat handoff) creates throwaway sessions inside a transaction, pretends to be a different student, and confirms zero rows come back, then pretends to be the owner and confirms the rows do come back. The whole thing is rolled back so nothing is saved.
2. **In the real app, once there are two student accounts.** Log in as student A and do a session. Log in as student B and confirm you cannot see A's session. Log in as an instructor and confirm you see submissions but not practice runs.
