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
  //    Counted with head-only count queries, one per table per class, rather
  //    than by reading the rows and tallying them here. That is not the cheaper
  //    way, it is the CORRECT one: the API caps how many rows one request
  //    returns and says nothing when it truncates, so a tally built from a
  //    plain read would quietly under-report a busy class. Six small counts per
  //    class is nothing at this scale (about five classes at most for a while).
  const COUNTED = [
    ["rubrics", "Rubrics"],
    ["scenarios", "Personas"],
    ["assignments", "Assignments"],
    ["sessions", "Sessions"],
    ["allowed_emails", "Invites"],
  ] as const;

  const countsByClass = new Map<string, Record<string, number>>();
  for (const cls of classes ?? []) {
    const counts: Record<string, number> = {};
    for (const [table, label] of COUNTED) {
      const { count } = await admin
        .from(table)
        .select("class_id", { count: "exact", head: true })
        .eq("class_id", cls.id as string);
      counts[label] = count ?? 0;
    }
    const { count: recordings } = await admin
      .from("sessions")
      .select("class_id", { count: "exact", head: true })
      .eq("class_id", cls.id as string)
      .not("video_path", "is", null);
    counts.Recordings = recordings ?? 0;
    countsByClass.set(cls.id as string, counts);
  }

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
