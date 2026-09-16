// ALL INSTRUCTORS: the super admin overview. Every instructor in the system,
// the class each one owns, what is in it, and who is in it.
//
// READ-ONLY FOR STUDENT DATA, and deliberately so. This page says WHO is in a
// class and HOW MUCH work they have done. It shows no transcript, no score and
// no recording, and mints no signed video link. Seeing across classes is what
// this section is for; reading a student's work is not.
//
// Every read here uses the service-role key, like the rest of the instructor
// surface, and none of them is scoped to a class. That is the one place in the
// app where that is correct, and it is why this page lives behind its own guard
// on its own route rather than as a section of the instructor surface.
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddInstructorForm } from "@/components/admin-add-instructor-form";
import { RemoveInstructorButton } from "@/components/admin-remove-instructor-button";
import { requireSuperAdmin } from "@/lib/super-admin";
import type { AdminClient } from "@/lib/super-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/name";
import { ServerTimingReport } from "@/components/server-timing-report";

export const dynamic = "force-dynamic";

type Person = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

type Klass = {
  id: string;
  name: string;
  instructor_id: string;
};

type ClassRow = { class_id: string | null; video_path?: string | null };

// Supabase's default cap is 1000 rows per request, so at today's size each
// table is one request. Nothing depends on the cap being exactly that: each
// page starts where the rows in hand end, so a smaller cap only means more pages.
const PAGE_SIZE = 1000;

// Every row of one table, read in pages until the rows in hand match the exact
// count the API reported. Ordered by the primary key so the pages cannot
// overlap or skip. See section 3 below for why it throws.
async function readAllRows(
  admin: AdminClient,
  table: string,
  columns: string,
  primaryKey: string,
): Promise<ClassRow[]> {
  const rows: ClassRow[] = [];
  let total = 0;
  do {
    const { data, count, error } = await admin
      .from(table)
      .select(columns, { count: "exact" })
      .order(primaryKey, { ascending: true })
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error || count == null) {
      throw new Error(
        `Could not read ${table} for the class counts: ${error?.message ?? "no count returned"}`,
      );
    }
    total = count;
    const page = (data ?? []) as unknown as ClassRow[];
    if (page.length === 0) break;
    rows.push(...page);
  } while (rows.length < total);

  if (rows.length < total) {
    throw new Error(
      `Read ${rows.length} of ${total} rows from ${table}, so the class counts would be wrong.`,
    );
  }
  return rows;
}

export default async function AdminOverview() {
  // The layout already gated this page; this confirms it again for the page
  // itself, since a page can be requested directly.
  const { user } = await requireSuperAdmin();
  const admin = createAdminClient();

  // 1. Everyone.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name, role, is_super_admin, created_at")
    .order("email", { ascending: true });

  const instructors = (profiles ?? []).filter((p) => p.role === "instructor");
  const students = (profiles ?? []).filter((p) => p.role === "student");

  // 2. Every class, and every membership.
  const { data: classes } = await admin
    .from("classes")
    .select("id, name, instructor_id, created_at")
    .order("created_at", { ascending: true });

  const { data: memberships } = await admin
    .from("class_members")
    .select("class_id, user_id");

  const membersByClass = new Map<string, string[]>();
  const classesByStudent = new Map<string, number>();
  for (const m of memberships ?? []) {
    const classId = m.class_id as string;
    const userId = m.user_id as string;
    membersByClass.set(classId, [...(membersByClass.get(classId) ?? []), userId]);
    classesByStudent.set(userId, (classesByStudent.get(userId) ?? 0) + 1);
  }

  const personById = new Map<string, Person>(
    (profiles ?? []).map((p) => [p.id as string, p as Person]),
  );

  // 3. What is in each class.
  //
  // ==> FIVE READS ACROSS EVERY CLASS, TALLIED HERE (page performance,
  //     2026-09-16). This used to be six head-only counts PER CLASS, awaited one
  //     after another: with 6 classes that was 36 round trips, measured at 7.8
  //     seconds on its own, and it grew by six with every class added. It is now
  //     five reads however many classes there are, sent together.
  //
  //     THE OLD COMMENT'S WARNING STILL HOLDS, AND THIS CODE IS BUILT AROUND
  //     IT: the API caps how many rows one request returns and says nothing when
  //     it truncates, so a plain read would quietly under-report a busy class.
  //     readAllRows() therefore asks for the exact count in the same response
  //     and keeps reading pages until it has that many rows. If it still comes
  //     up short it THROWS, because a page that fails loudly is worth more than
  //     one that is confidently wrong about how much work a class holds. The
  //     old loop showed 0 for a failed count; this shows an error instead. <==
  const [rubricRows, scenarioRows, assignmentRows, sessionRows, inviteRows] =
    await Promise.all([
      readAllRows(admin, "rubrics", "class_id", "id"),
      readAllRows(admin, "scenarios", "class_id", "id"),
      readAllRows(admin, "assignments", "class_id", "id"),
      readAllRows(admin, "sessions", "class_id, video_path", "id"),
      readAllRows(admin, "allowed_emails", "class_id", "email"),
    ]);

  // The labels are created in this order on purpose: the page prints them in
  // insertion order, and this is the order the per-class loop printed them in.
  const countsByClass = new Map<string, Record<string, number>>();
  for (const cls of classes ?? []) {
    countsByClass.set(cls.id as string, {
      Rubrics: 0,
      Personas: 0,
      Assignments: 0,
      Sessions: 0,
      Invites: 0,
      Recordings: 0,
    });
  }

  // A row with no class, or a class not in the list above, is skipped, which
  // is exactly what the per-class ".eq(class_id)" counts did.
  const tally = (rows: ClassRow[], label: string) => {
    for (const row of rows) {
      const counts = row.class_id ? countsByClass.get(row.class_id) : undefined;
      if (counts) counts[label] += 1;
    }
  };
  tally(rubricRows, "Rubrics");
  tally(scenarioRows, "Personas");
  tally(assignmentRows, "Assignments");
  tally(sessionRows, "Sessions");
  tally(inviteRows, "Invites");
  tally(
    sessionRows.filter((row) => row.video_path != null),
    "Recordings",
  );

  // 4. THE CANARY. Registered students who are in no class at all.
  //
  //    ==> THIS LIST SHOULD ALWAYS BE EMPTY, AND THAT IS THE POINT OF IT. It is
  //        a monitoring view, not a to-do list. Every student gets their class
  //        membership from the signup rule when they register, and the class
  //        cascade delete removes the accounts that belonged only to the class
  //        it destroyed rather than leaving them behind. So a name appearing
  //        here means something has gone wrong: a delete that stopped part way
  //        through, or a row changed by hand.
  //
  //        It matters because there is NO PATH IN THE APP that adds an
  //        already-registered student to a class. The signup rule fires once, at
  //        first registration, and nothing else writes class_members. A student
  //        who ends up here cannot be helped from inside the app, and re-inviting
  //        their address would create an invite that does nothing. <==
  const orphans = students.filter((s) => (classesByStudent.get(s.id as string) ?? 0) === 0);

  const classByInstructor = new Map<string, Klass[]>();
  for (const cls of (classes ?? []) as Klass[]) {
    const owner = cls.instructor_id;
    classByInstructor.set(owner, [...(classByInstructor.get(owner) ?? []), cls]);
  }

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      <h2 className="mb-1 text-page-title font-medium text-content-primary">
        All instructors
      </h2>
      <p className="mb-5 max-w-reading text-body text-content-secondary">
        Every instructor in Relii, the class each one owns, and who is in it.
        This is the only place in the app that sees across classes. It is
        read-only for student work: no transcript, score or recording is shown or
        downloadable here.
      </p>

      {/* The canary, first on the page when it is not empty. */}
      <Card
        tone={orphans.length > 0 ? "warning" : "muted"}
        padding="md"
        className="mb-5"
      >
        <p className="text-card-title font-medium text-content-primary">
          Students in no class
        </p>
        {orphans.length === 0 ? (
          <p className="mt-1 text-meta text-content-secondary">
            None, which is the expected state. Every student gets a class when
            they register, and deleting a class removes the accounts that
            belonged only to it. A name here would mean something had gone wrong.
          </p>
        ) : (
          <>
            <p className="mt-1 text-meta text-content-secondary">
              These accounts are in no class, so they see an empty dashboard and
              nothing in the app can put them in one. This should not happen: it
              means a class deletion stopped part way through, or a row was
              changed by hand.
            </p>
            <ul className="mt-2 space-y-1">
              {orphans.map((s) => (
                <li key={s.id as string} className="text-body text-content-primary">
                  {displayName(s as Person)}{" "}
                  <span className="text-meta text-content-tertiary">
                    {s.email as string}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <AddInstructorForm />

      <ul className="mt-5 space-y-3">
        {instructors.map((person) => {
          const owned = classByInstructor.get(person.id as string) ?? [];
          return (
            <Card as="li" key={person.id as string} padding="lg">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-card-title font-medium text-content-primary">
                    {displayName(person as Person)}
                    {person.is_super_admin && (
                      <span className="ml-2 align-middle">
                        <Badge tone="info">super admin</Badge>
                      </span>
                    )}
                    {person.id === user.id && (
                      <span className="ml-2 align-middle">
                        <Badge tone="neutral">you</Badge>
                      </span>
                    )}
                  </p>
                  <p className="text-meta text-content-tertiary">
                    {person.email as string}
                  </p>
                </div>

                {/* Removing an account is only offered once it owns no class.
                    The database refuses it otherwise (classes.instructor_id is
                    on delete restrict), so the page says the same thing rather
                    than offering a control that cannot work. */}
                {owned.length === 0 && person.id !== user.id && (
                  <RemoveInstructorButton
                    instructorId={person.id as string}
                    email={person.email as string}
                  />
                )}
              </div>

              {owned.length === 0 ? (
                <p className="mt-2 text-meta text-content-secondary">
                  Owns no class. {person.id === user.id ? "" : "This account can be removed."}
                </p>
              ) : (
                owned.map((cls) => {
                  const counts = countsByClass.get(cls.id as string) ?? {};
                  const memberIds = membersByClass.get(cls.id as string) ?? [];
                  return (
                    <div key={cls.id as string} className="mt-3">
                      <p className="text-body font-medium text-content-primary">
                        <Link
                          href={`/admin/class/${cls.id as string}`}
                          className="underline"
                        >
                          {cls.name as string}
                        </Link>
                      </p>
                      <p className="mt-1 text-meta text-content-secondary">
                        {memberIds.length} student
                        {memberIds.length === 1 ? "" : "s"}
                        {Object.entries(counts).map(([label, n]) => (
                          <span key={label}>
                            {", "}
                            {n} {label.toLowerCase()}
                          </span>
                        ))}
                      </p>
                      {memberIds.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {memberIds
                            .map((id) => personById.get(id))
                            .filter((p): p is Person => Boolean(p))
                            .sort((a, b) => (a.email < b.email ? -1 : 1))
                            .map((s) => (
                              <li key={s.id} className="text-meta text-content-secondary">
                                {displayName(s)}{" "}
                                <span className="text-content-tertiary">{s.email}</span>
                                {(classesByStudent.get(s.id) ?? 0) > 1 && (
                                  <span className="ml-1 text-content-warning">
                                    (in {classesByStudent.get(s.id)} classes)
                                  </span>
                                )}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </Card>
          );
        })}
      </ul>
      {/* PAGE PERFORMANCE INSTRUMENT: renders nothing unless RELII_SERVER_TIMING=1. */}
      <ServerTimingReport segment="page /admin" />
    </main>
  );
}
