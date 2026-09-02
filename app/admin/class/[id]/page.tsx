// ONE CLASS, seen by the super admin: what is in it, who is in it, and the two
// ways to dispose of it.
//
// THE TWO WAYS ARE DELIBERATELY IN THIS ORDER ON THE PAGE. Handing the class to
// another instructor destroys nothing and keeps every student's work; the
// export-first delete destroys all of it. The delete has to exist, because
// someone eventually needs it, but building it as the only path would make it
// the common one.
//
// Read-only for student work here too: this page counts what each student has
// done and never shows or links to any of it.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReassignClassForm } from "@/components/admin-reassign-class-form";
import { ClassDeletePanel } from "@/components/admin-class-delete-panel";
import { requireSuperAdmin } from "@/lib/super-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/name";

export const dynamic = "force-dynamic";

type Person = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

export default async function AdminClassDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id: classId } = await params;
  const admin = createAdminClient();

  const { data: cls } = await admin
    .from("classes")
    .select("id, name, instructor_id, created_at")
    .eq("id", classId)
    .maybeSingle();
  if (!cls) notFound();

  const { data: owner } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name")
    .eq("id", cls.instructor_id as string)
    .maybeSingle();

  // Who is in it, and whether each of them belongs anywhere else. The second
  // half decides what a deletion would do to their account, so the page states
  // it rather than leaving it to be discovered.
  const { data: members } = await admin
    .from("class_members")
    .select("user_id")
    .eq("class_id", classId);
  const memberIds = (members ?? []).map((m) => m.user_id as string);

  let students: (Person & { sessions: number; otherClasses: number })[] = [];
  if (memberIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, first_name, last_name")
      .in("id", memberIds);
    const { data: elsewhere } = await admin
      .from("class_members")
      .select("user_id")
      .in("user_id", memberIds)
      .neq("class_id", classId);

    const otherCount = new Map<string, number>();
    for (const row of elsewhere ?? []) {
      const id = row.user_id as string;
      otherCount.set(id, (otherCount.get(id) ?? 0) + 1);
    }

    students = [];
    for (const p of (profiles ?? []) as Person[]) {
      const { count } = await admin
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("class_id", classId)
        .eq("student_id", p.id);
      students.push({
        ...p,
        sessions: count ?? 0,
        otherClasses: otherCount.get(p.id) ?? 0,
      });
    }
    students.sort((a, b) => (a.email < b.email ? -1 : 1));
  }

  // Pending invites: on the list for this class with no account behind them yet.
  const { data: invites } = await admin
    .from("allowed_emails")
    .select("email, role, created_at")
    .eq("class_id", classId)
    .order("email", { ascending: true });

  const { data: registered } = await admin
    .from("profiles")
    .select("email")
    .in("email", (invites ?? []).map((i) => i.email as string));
  const registeredEmails = new Set(
    (registered ?? []).map((r) => (r.email as string).toLowerCase()),
  );
  const pending = (invites ?? []).filter(
    (i) => !registeredEmails.has((i.email as string).toLowerCase()),
  );

  // Head-only counts, for the reason written out on the overview page: a tally
  // built from a plain read would silently under-report a busy class.
  const COUNTED = [
    ["rubrics", "Rubrics"],
    ["scenarios", "Personas"],
    ["assignments", "Assignments"],
    ["sessions", "Sessions"],
  ] as const;
  const counts: Record<string, number> = {};
  for (const [table, label] of COUNTED) {
    const { count } = await admin
      .from(table)
      .select("class_id", { count: "exact", head: true })
      .eq("class_id", classId);
    counts[label] = count ?? 0;
  }
  const { count: recordings } = await admin
    .from("sessions")
    .select("class_id", { count: "exact", head: true })
    .eq("class_id", classId)
    .not("video_path", "is", null);

  // ==> WHO COULD TAKE THIS CLASS ON. GATE 6 CHANGED THE ANSWER FROM "ONLY AN
  //     INSTRUCTOR WHOSE OWN CLASS IS EMPTY" TO "ANY OTHER INSTRUCTOR", and the
  //     reason the old rule existed is the reason it could go.
  //
  //     It was there because getInstructorClassId() took an instructor's oldest
  //     class and stopped at one, so giving somebody a second class silently hid
  //     their first. Gate 6 replaced that with resolveWorkingClassId(), which
  //     honours the instructor's own selection, so holding several classes is
  //     ordinary and the receiver's own work stays exactly where it is. The
  //     whole content sweep that used to run here (six count queries per class
  //     per instructor) went with it.
  //
  //     ONE THING IS STILL CHECKED, and it is new BECAUSE of the relaxation:
  //     `classes` carries unique (instructor_id, name), so an instructor who
  //     already has a class of the SAME NAME cannot take this one until one of
  //     them is renamed. That was structurally impossible before, when the
  //     receiver's own class was deleted first. The route checks it again for
  //     itself; this is here so the page says WHY somebody is not offered,
  //     rather than offering a choice that will be refused. <==
  const { data: otherInstructors } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name")
    .eq("role", "instructor")
    .neq("id", cls.instructor_id as string)
    .order("email", { ascending: true });

  const candidates: { id: string; email: string; eligible: boolean; reason: string }[] = [];
  for (const person of (otherInstructors ?? []) as Person[]) {
    const { data: ownClasses } = await admin
      .from("classes")
      .select("id, name")
      .eq("instructor_id", person.id);

    const nameClash = (ownClasses ?? []).some(
      (own) => own.name === (cls.name as string),
    );

    candidates.push({
      id: person.id,
      email: person.email,
      eligible: !nameClash,
      reason: nameClash
        ? `already has a class called "${cls.name}", and one instructor cannot have two classes with the same name. Rename one of them first`
        : "",
    });
  }

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      <p className="mb-1 text-meta text-content-tertiary">
        <Link href="/admin" className="underline">
          All instructors
        </Link>
      </p>
      <h2 className="mb-1 text-page-title font-medium text-content-primary">
        {cls.name as string}
      </h2>
      <p className="mb-5 max-w-reading text-body text-content-secondary">
        Owned by {owner ? displayName(owner as Person) : "an account that no longer exists"}
        {owner ? ` (${owner.email as string})` : ""}. Created{" "}
        {new Date(cls.created_at as string).toLocaleDateString()}.
      </p>

      <Card padding="md" className="mb-5">
        <p className="text-card-title font-medium text-content-primary">
          What is in this class
        </p>
        <p className="mt-1 text-meta text-content-secondary">
          {students.length} student{students.length === 1 ? "" : "s"},{" "}
          {pending.length} pending invite{pending.length === 1 ? "" : "s"},{" "}
          {Object.entries(counts)
            .map(([label, n]) => `${n} ${label.toLowerCase()}`)
            .join(", ")}
          , {recordings ?? 0} recording{(recordings ?? 0) === 1 ? "" : "s"}.
        </p>

        {students.length > 0 && (
          <ul className="mt-3 space-y-1">
            {students.map((s) => (
              <li key={s.id} className="text-meta text-content-secondary">
                {displayName(s)}{" "}
                <span className="text-content-tertiary">{s.email}</span>
                {" - "}
                {s.sessions} session{s.sessions === 1 ? "" : "s"}
                {s.otherClasses > 0 && (
                  <span className="ml-1">
                    <Badge tone="warning">also in another class</Badge>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {pending.length > 0 && (
          <p className="mt-3 text-meta text-content-tertiary">
            Pending invites: {pending.map((i) => i.email as string).join(", ")}.
          </p>
        )}
      </Card>

      <ReassignClassForm
        classId={classId}
        classLabel={cls.name as string}
        candidates={candidates}
      />

      <ClassDeletePanel
        classId={classId}
        classLabel={cls.name as string}
        studentCount={students.length}
        accountsToDelete={students.filter((s) => s.otherClasses === 0).length}
        recordingCount={recordings ?? 0}
      />
    </main>
  );
}
