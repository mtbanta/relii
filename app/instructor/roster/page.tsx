// ROSTER: everyone with access to Relii, grouped by status. Registered students
// (each with the delete action), registered instructors (display only), and the
// invites that have not been used yet.
//
// Moved from the old single instructor page unchanged, along with the two reads
// it needs: every profile, and the whole invite list.
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeleteStudentButton } from "@/components/delete-student-button";
import { UninviteButton } from "@/components/uninvite-button";
import { requireInstructor } from "@/lib/instructor-auth";
import { displayName, hasName } from "@/lib/name";

export default async function InstructorRoster() {
  // The layout already gated this page; this confirms it again for the page
  // itself, and is also how it knows which account is "you".
  const { user } = await requireInstructor();

  // The admin (service-role) client reads data ordinary browser rules do not
  // allow (other people's emails). It runs only here on the server; the key
  // never reaches the browser, so no database security rule needs to change.
  const admin = createAdminClient();

  // Every REGISTERED user (both roles).
  const { data: allProfiles } = await admin
    .from("profiles")
    .select("id, email, role, first_name, last_name")
    .order("email", { ascending: true });

  const profilesAll = allProfiles ?? [];
  const students = profilesAll.filter((p) => p.role === "student");
  const registeredInstructors = profilesAll.filter(
    (p) => p.role === "instructor",
  );

  // The full invite list. A person's status is derived by matching emails
  // (case-insensitive, the same way the signup trigger does): an invite whose
  // email has no matching profile row is a PENDING invite; one that does match a
  // profile is already registered (and appears in the registered lists above).
  const { data: invites } = await admin
    .from("allowed_emails")
    .select("email, role")
    .order("email", { ascending: true });

  const registeredEmails = new Set(
    profilesAll.map((p) => p.email.toLowerCase()),
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
        <p>Everyone with access to Relii, grouped by status.</p>
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
