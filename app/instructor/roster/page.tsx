// ROSTER: everyone in THE CLASS YOU ARE WORKING IN, grouped by status. Your
// registered students (each with the delete action), yourself (display only),
// and the invites for that class that have not been used yet.
//
// GATE 6 ADDED TWO SECTIONS AND CHANGED NOTHING ABOUT THE READS. "Your classes"
// (create and rename) is here because the Roster is already the page about one
// class and the people in it, and it is a set-up screen rather than a daily one.
// "Add an existing student" is the other half of Invite Users: an invite is for
// somebody who has not signed up, that form is for somebody who has. The reads
// below already took a class id, so they follow the picker with no edit.
//
// GATE 3b SCOPED THIS PAGE, and it is the one whose appearance changes most. It
// used to list every profile and every invite in the whole system. It now lists
// one class. With a single instructor that is the same set of people; with two
// it is the point of the entire isolation gate.
//
// ==> THE FAILURE THIS PAGE IS MOST LIKELY TO HIT, written here because it looks
//     like a bug and is not obvious from the code: CLASS MEMBERSHIP IS STUDENTS
//     ONLY. An instructor OWNS a class through classes.instructor_id and is not
//     a row in class_members. So "everyone in this class" written as a
//     membership query returns the students and NOBODY ELSE, and the Registered
//     instructors section renders empty. That is why the instructor half below
//     is not a query at all: it is the signed-in instructor's own profile,
//     which cannot come back empty. <==
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeleteStudentButton } from "@/components/delete-student-button";
import { UninviteButton } from "@/components/uninvite-button";
import { requireInstructor } from "@/lib/instructor-auth";
import { loadClassStudents } from "@/lib/class-scope";
import { displayName, hasName } from "@/lib/name";
import { ClassManager } from "@/components/class-manager";
import { AddExistingStudentForm } from "@/components/add-existing-student-form";

export default async function InstructorRoster() {
  // The layout already gated this page; this confirms it again for the page
  // itself, and is also how it knows which account is "you" and which class is
  // yours.
  const { user, profile, classId, classes } = await requireInstructor();

  // The admin (service-role) client reads data ordinary browser rules do not
  // allow (other people's emails). It runs only here on the server; the key
  // never reaches the browser, so no database security rule needs to change.
  const admin = createAdminClient();

  // YOUR registered students. Fails closed: an instructor with no class sees an
  // empty student list rather than everybody's students.
  const students = classId ? await loadClassStudents(admin, classId) : [];

  // YOU. Not a query, for the reason at the top of this file: you own this class
  // rather than being a member of it, so a membership read would leave this
  // section empty and look broken. requireInstructor() reads email alongside the
  // name fields precisely so this row can never render blank (displayName falls
  // back to the email when no name is set).
  //
  // It is a list of one today. It stays a LIST because co-instructors are a
  // later feature, and when they arrive this is where they join.
  const registeredInstructors = [
    {
      id: user.id,
      email: profile.email,
      first_name: profile.first_name,
      last_name: profile.last_name,
    },
  ];

  // YOUR class's invite list.
  const { data: invites } = classId
    ? await admin
        .from("allowed_emails")
        .select("email, role")
        .eq("class_id", classId)
        .order("email", { ascending: true })
    : { data: [] };

  // ==> THIS READ STAYS GLOBAL ON PURPOSE, and it is the second of the four
  //     places in the app where a scoped read would be wrong. The rule is
  //     written out once in lib/class-scope.ts: THE LISTING IS SCOPED, THE FACT
  //     CHECK IS NOT.
  //
  //     "Has this email registered yet" is a GLOBAL fact. allowed_emails.email
  //     is the primary key, so an address exists once across the whole system,
  //     and the person who accepted it has an account or does not.
  //
  //     WHAT SCOPING IT WOULD DO: an instructor-role invite that you sent, and
  //     that the person accepted, would stop matching any profile in your class,
  //     because a new instructor gets a class of their OWN at signup. Your Roster
  //     would then show them as "Invited, pending" forever, and offer an
  //     Un-invite that the route correctly refuses. Reading every email and
  //     rendering none of them outside this class is the honest version.
  //
  //     Nothing from this read is displayed. Only the yes/no it produces is.
  const { data: everyProfile } = await admin.from("profiles").select("email");

  const registeredEmails = new Set(
    (everyProfile ?? []).map((p) => p.email.toLowerCase()),
  );
  const pendingInvites = (invites ?? []).filter(
    (i) => !registeredEmails.has(i.email.toLowerCase()),
  );

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      <h2 className="mb-1 text-page-title font-medium text-content-primary">
        Roster
      </h2>
      {/* PD-8f: one sentence per line rather than one running paragraph, and
          capped at the reading measure now that the page is 1120px wide. The
          wording is unchanged. */}
      <div className="mb-4 max-w-reading space-y-0.5 text-body text-content-secondary">
        {/* GATE 3b: the wording follows the scoping. This page shows one
            class, so promising "everyone with access to Relii" would now be
            false. */}
        <p>
          Everyone in the class you are working in, grouped by status. Switch
          class at the top of the page to see another one.
        </p>
        <p>
          Registered users have signed up; pending invites are on the invite list
          but have not registered yet.
        </p>
        <p>
          Add more people on the{" "}
          <Link href="/instructor/invites" className="underline">
            Invite Users
          </Link>{" "}
          page.
        </p>
        <p>
          Deleting a student permanently removes their account, sessions, and
          recorded videos, and frees their email from the invite list.
        </p>
      </div>

      {/* GATE 6: YOUR CLASSES. The id is what the "Manage classes" link beside
          the class picker jumps to, which is how this stays discoverable from
          the chrome without putting a form into the chrome. */}
      <section id="classes" className="mb-6 scroll-mt-4">
        <h3 className="mb-2 text-body font-medium text-content-primary">
          Your classes{" "}
          <span className="font-normal text-content-tertiary">
            ({classes.length})
          </span>
        </h3>
        <ClassManager classes={classes} currentClassId={classId} />
      </section>

      {/* Registered students: the existing Delete action, unchanged. */}
      <h3 className="mb-2 text-body font-medium text-content-primary">
        Registered students{" "}
        <span className="font-normal text-content-tertiary">({students.length})</span>
      </h3>
      {students.length > 0 ? (
        <ul className="space-y-2">
          {students.map((s) => (
            <li key={s.id} className="rounded-lg border border-line-tertiary p-3">
              <DeleteStudentButton
                studentId={s.id}
                email={s.email}
                name={displayName(s)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-content-secondary">No students have registered yet.</p>
      )}

      {/* GATE 6: the other half of Invite Users. An invite is for somebody who
          has not signed up; this is for somebody who has. Before this piece the
          second case had no path at all, which is what made a student in no
          class unrecoverable. */}
      <div className="mt-3">
        <AddExistingStudentForm />
      </div>

      {/* Registered instructors: display only. There is no delete for an
          instructor (the delete-student route refuses a non-student), and you
          cannot delete yourself. Your own account is marked "(you)". */}
      <h3 className="mb-2 mt-6 text-body font-medium text-content-primary">
        Registered instructors{" "}
        <span className="font-normal text-content-tertiary">
          ({registeredInstructors.length})
        </span>
      </h3>
      {registeredInstructors.length > 0 ? (
        <ul className="space-y-2">
          {registeredInstructors.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-2 rounded-lg border border-line-tertiary p-3 text-body"
            >
              <span>{displayName(p)}</span>
              {p.id === user.id && (
                <span className="text-meta text-content-tertiary">(you)</span>
              )}
              {hasName(p) && (
                <span className="text-meta text-content-tertiary">· {p.email}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-content-secondary">
          No instructors have registered yet.
        </p>
      )}

      {/* Pending invites: on the invite list but not registered yet. Either
          role can be pending. Each has an Un-invite action that removes just
          that one invite-list row (verified pending, server-side). */}
      <h3 className="mb-2 mt-6 text-body font-medium text-content-primary">
        Invited, pending{" "}
        <span className="font-normal text-content-tertiary">
          ({pendingInvites.length})
        </span>
      </h3>
      {pendingInvites.length > 0 ? (
        <ul className="space-y-2">
          {pendingInvites.map((i) => (
            <li key={i.email} className="rounded-lg border border-line-tertiary p-3">
              <UninviteButton email={i.email} role={i.role} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-content-secondary">No pending invites.</p>
      )}
    </main>
  );
}
