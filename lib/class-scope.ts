// GATE 3b. One place that answers two questions for the instructor surface:
// "is this thing mine?" and "what is mine?".
//
// WHY THIS FILE EXISTS AT ALL. Every instructor page and route reads with the
// service-role key, which bypasses Row Level Security completely. So the Gate 2
// and Gate 3a policies are a BACKSTOP, and the real isolation between
// instructors is whatever the application code checks for itself. Before this
// file, that check did not exist anywhere: eleven routes and two shared helpers
// loaded a target by id and acted on it with nothing but a role check, which
// meant any instructor account could read, download and act on any other
// instructor's data.
//
// WHY IT IS NOT IN lib/instructor-auth.ts, which would be the obvious home. That
// file holds requireInstructor(), which calls redirect(). redirect() is a PAGE
// mechanism: called from an API route it throws instead of returning a JSON
// error. Gate 3a lost time to exactly that confusion. Keeping the route-side
// guard in its own file keeps the boundary visible.
//
// ==> THE RULE THIS WHOLE PIECE IS BUILT ON, WRITTEN OUT ONCE. Several reads in
//     the instructor surface are deliberately NOT scoped, and they look like
//     oversights until you have read this:
//
//       THE LISTING IS SCOPED. THE FACT CHECK IS NOT.
//
//       A read that decides WHAT YOU SEE is scoped to your class.
//       A read that decides WHETHER AN OPERATION WILL SUCCEED stays global,
//       because the constraint it is checking is itself global.
//
//     The four places that stay global, each with the global constraint behind
//     it, so nobody "finishes the job" later and breaks one of them:
//
//       1. countScenarioUsage() in lib/scaffold-candidates.ts.
//          sessions.scenario_id and assignments.scenario_id are both
//          "on delete restrict". A scenario used by another class must report as
//          used, or the UI offers a delete that fails at the database with a raw
//          foreign-key error the user cannot act on.
//       2. The Roster's "is this email already registered" match.
//          Registration is a global fact. Scoped, another instructor's
//          registered account would be labelled "pending" forever.
//       3. The invite dedup in the bulk invite route.
//          allowed_emails.email is the PRIMARY KEY, so it is unique across every
//          class. A scoped dedup would let the insert through and fail with a
//          raw duplicate-key error instead of a readable "already invited".
//       4. The in-use counts on Manage Assignments, for the same reason as 1.
//
//     And the second rule, which is what keeps eleven guards from becoming
//     thirty: GUARD THE ROW YOU WERE HANDED BY ID. A read derived from a row
//     that has already been checked needs no second filter. <==
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWorkingClassId } from "@/lib/instructor-auth";
import type { InstructorClass } from "@/lib/instructor-auth";

export type AdminClient = ReturnType<typeof createAdminClient>;

// The shared refusal. DELIBERATELY NOT a NextResponse: lib/instructor-submission.ts
// already returns this exact shape, so the download helper and the eleven routes
// share one guard instead of growing two. Each route turns it into JSON with a
// single line.
export type Refusal = { ok: false; status: number; error: string };

export type InstructorRequest = {
  ok: true;
  userId: string;
  // The caller's own email, which the two audit-writing routes need for their
  // snapshot. Read here so they do not need a second profiles query.
  email: string | null;
  // The class this instructor is WORKING IN. Never null on the ok branch: a
  // caller with no class is refused below.
  //
  // GATE 6 CHANGED WHERE THIS COMES FROM AND NOT WHAT IT MEANS. It used to be
  // the instructor's only class; it is now the one they have selected, verified
  // against classes.instructor_id on this request. Every route below it is
  // unchanged, which is the point: the routes ask "which class may I act inside"
  // and still get exactly one answer.
  classId: string;
  // GATE 6. Whether the caller is a super admin.
  //
  // ==> READ THIS BEFORE USING IT. IT GATES WHICH ROLES YOU MAY INVITE. IT DOES
  //     NOT GATE WHICH CLASS YOU MAY ACT INSIDE, and it must never be made to.
  //     Every route below still acts inside classId and nothing else, super
  //     admin or not. The cross-tenant surface is /admin, which has its own
  //     guard in lib/super-admin.ts and shares no code with this file on
  //     purpose; putting an "unless they are a super admin" branch into the
  //     scoping here is precisely what that separation exists to prevent.
  //
  // It is used by exactly one thing: the bulk invite route, which must refuse
  // role = instructor from an ordinary instructor now that adding an instructor
  // is a super admin operation. It costs no extra query, because the profiles
  // read below was already happening.
  isSuperAdmin: boolean;
  admin: AdminClient;
};

// THE CALLER HALF. "Is this request from a signed-in instructor, and which class
// do they own?" Replaces the signed-in check and the profiles role check that
// were copy-pasted into all eleven /api/instructor routes.
//
// `action` completes the sentence "Only instructors can ...", so each route
// keeps the wording it had.
export async function requireInstructorRequest(
  action: string,
): Promise<InstructorRequest | Refusal> {
  // 1. Must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Not signed in." };
  }

  const admin = createAdminClient();

  // 2. Must be an instructor, verified on the server against the database. The
  //    browser is never trusted to say who is an instructor.
  //
  // GATE 6 ADDED is_super_admin TO THIS SELECT AND NOTHING ELSE. Same query, one
  // more column, exactly as Gate 4a added class_id to the bulk route's existing
  // read. See the note on the type above for what it may and may not gate.
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role, email, is_super_admin")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "instructor") {
    return { ok: false, status: 403, error: `Only instructors can ${action}.` };
  }

  // 3. Must own a class, because the class is what everything below is scoped
  //    to. FAILS CLOSED. An instructor with no class is a real state (they can
  //    hand their last class away, or have it deleted), which is precisely why
  //    this refuses rather than waving the request through unscoped.
  //
  //    GATE 6: this now resolves the WORKING class, which honours the
  //    instructor's remembered selection only after checking it against
  //    classes.instructor_id on this request. A hand-edited cookie gets the
  //    caller their own oldest class and a line in the server log, never
  //    somebody else's class. The whole check is written out at
  //    resolveWorkingClassId() in lib/instructor-auth.ts.
  const classId = await resolveWorkingClassId(user.id);
  if (!classId) {
    return {
      ok: false,
      status: 409,
      error:
        "Your instructor account is not linked to a class, so this cannot be done.",
    };
  }

  return {
    ok: true,
    userId: user.id,
    email: caller.email ?? null,
    classId,
    isSuperAdmin: caller.is_super_admin === true,
    admin,
  };
}

// ==> GATE 6. "IS THIS ONE OF MY OTHER CLASSES?", WHICH IS THE ANSWER TO DESIGN
//     QUESTION A AND THE THING THAT MUST NOT WEAKEN refuseOutsideClass BELOW.
//
//     refuseOutsideClass answers 404 and hides whether the row exists at all.
//     That is right for a STRANGER and wrong for the OWNER: an instructor who
//     opens a bookmark from their other class is told their own submission does
//     not exist. So the four detail pages ask this first, and show "this is in
//     your other class, switch to it" when the answer is yes.
//
//     IT CANNOT LEAK ANYTHING, AND THE REASON IS STRUCTURAL RATHER THAN
//     CAREFUL. `classes` comes from listInstructorClasses(), which filters by
//     classes.instructor_id, so every id in it is provably owned by the
//     signed-in account. A row in a stranger's class matches nothing here, this
//     returns null, and the caller falls through to the SAME 404 with the SAME
//     wording it would have shown before this piece. The stranger's experience
//     is byte for byte unchanged.
//
//     It is pure and does no reads: every caller already has both halves. <==
export function otherOwnedClass(
  targetClassId: string | null | undefined,
  classes: InstructorClass[],
  workingClassId: string | null,
): InstructorClass | null {
  if (!targetClassId) return null;
  if (targetClassId === workingClassId) return null;
  return classes.find((c) => c.id === targetClassId) ?? null;
}

// THE TARGET HALF, shape one: a ROW that carries a class of its own.
//
// Returns null when the row is the caller's (carry on), or a Refusal when it is
// not (return it).
//
// IT FAILS CLOSED IN BOTH DIRECTIONS. A row whose class is empty is refused just
// as firmly as a row belonging to someone else. After Gate 3a no row is in that
// state, and that is exactly why the empty case must refuse: if it ever happens
// again it is a bug in a write path, and the safe response to "this row belongs
// to nobody" is never "so anybody may have it".
//
// IT ANSWERS 404, NOT 403, AND THAT IS DELIBERATE. A 403 would confirm that a
// row with this id exists in some other instructor's class, which is a small
// leak of exactly the kind this gate exists to close. The caller sees the same
// wording it would see for an id that does not exist at all. The real reason is
// written to the server log, so a genuine mix-up is still diagnosable.
export function refuseOutsideClass(
  targetClassId: string | null | undefined,
  classId: string,
  thing: string,
): Refusal | null {
  if (targetClassId === classId) return null;

  console.warn(
    `Gate 3b refused a cross-class ${thing}: target class ${
      targetClassId ?? "none"
    }, caller class ${classId}.`,
  );
  return {
    ok: false,
    status: 404,
    error: `That ${thing} was not found.`,
  };
}

// THE TARGET HALF, shape two: a PERSON who belongs to a class.
//
// A student's class is NOT a column on their profile. It is a row in
// class_members, because an instructor owns a class through classes.instructor_id
// and is not a member of it. So "is this student mine" is a membership lookup,
// not a column comparison, and it needs its own helper.
//
// Fails closed the same way: no membership row means refused.
export async function refuseNonMemberStudent(
  admin: AdminClient,
  classId: string,
  studentId: string,
): Promise<Refusal | null> {
  const { data, error } = await admin
    .from("class_members")
    .select("user_id")
    .eq("class_id", classId)
    .eq("user_id", studentId)
    .maybeSingle();

  if (error) {
    console.error("Checking class membership failed:", studentId, error);
    return {
      ok: false,
      status: 500,
      error: "Could not confirm that student is in your class. Nothing was changed.",
    };
  }

  if (!data) {
    console.warn(
      `Gate 3b refused a cross-class student: ${studentId} is not in class ${classId}.`,
    );
    return { ok: false, status: 404, error: "That student was not found." };
  }

  return null;
}

export type ClassStudent = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

// WHAT IS MINE: the registered students in one class, sorted by email, for the
// two pages that list them (the dashboard table and the Roster).
//
// Two reads rather than a join, because class_members holds only ids and the
// display needs the profile fields. At this scale (about 25 students now, about
// 270 at the ceiling in CLAUDE.md) the second read is trivial, and two plain
// queries are far easier to read than a nested select.
//
// The role filter is belt and braces: only students are ever put in
// class_members, and an instructor owns their class instead of joining it.
//
// ==> IT THROWS ON A FAILED READ RATHER THAN RETURNING AN EMPTY LIST, and that
//     is deliberate for the same reason countScenarioUsage() throws in
//     lib/scaffold-candidates.ts: an empty array is a STATEMENT, not an absence.
//     Both callers would render it as "this class has no students", so a
//     transient database failure would quietly produce a Roster reading "No
//     students have registered yet" and a dashboard reading 0 enrolled, with
//     nothing to say the read had failed. A page that fails loudly is worth far
//     more than a page that is confidently wrong about who is in the class.
//     An empty array from this function therefore means exactly one thing: the
//     class really has no students. <==
export async function loadClassStudents(
  admin: AdminClient,
  classId: string,
): Promise<ClassStudent[]> {
  const { data: members, error: membersError } = await admin
    .from("class_members")
    .select("user_id")
    .eq("class_id", classId);

  if (membersError) {
    throw new Error(
      `Could not read the students in this class: ${membersError.message}`,
    );
  }

  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name")
    .in("id", ids)
    .eq("role", "student")
    .order("email", { ascending: true });

  if (profilesError) {
    throw new Error(
      `Could not read the profiles for this class: ${profilesError.message}`,
    );
  }

  return (profiles ?? []) as ClassStudent[];
}
