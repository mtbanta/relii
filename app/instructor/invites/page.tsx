// INVITE USERS: the two ways to put people on the invite list, together on one
// page. Single invite (one email plus a role) and bulk invite (a CSV file).
//
// Both forms were moved here from the old single instructor page, unchanged.
// Each form does its own work and reports its own result, so this page has no
// database reads of its own beyond the shared instructor gate.
//
// GATE 6: an ordinary instructor may no longer invite another INSTRUCTOR. Since
// Gate 4b, adding an instructor is a super admin operation, and Invite Users was
// a second path to the same privileged action that bypassed the administration
// section entirely. Both forms below hide the option, and BOTH SERVER ROUTES
// refuse it, which is the part that actually holds.
//
// One behavior note from the move: on the old page the pending-invite list sat
// directly below these forms, so a successful invite appeared there right away.
// The forms still report exactly what they did (the bulk form lists every added
// and skipped row with the reason), and the Roster link below is where the new
// pending invites are seen.
import Link from "next/link";
import { AddEmailForm } from "@/components/add-email-form";
import { BulkInviteForm } from "@/components/bulk-invite-form";
import { requireInstructor } from "@/lib/instructor-auth";

export default async function InstructorInvites() {
  // The layout already gated this page; this confirms it again for the page
  // itself, since a page can be requested directly.
  //
  // GATE 6: the class id is no longer handed to the form at all. The single
  // invite now goes through /api/instructor/invite, which reads the working
  // class from the signed-in session on the server, so the browser never says
  // which class an invite belongs to. What IS handed down is whether the caller
  // is a super admin, which decides whether the Instructor role is offered.
  //
  // ==> IT DECIDES WHAT IS OFFERED, NOT WHAT IS ALLOWED. The rule is held by the
  //     server in both invite routes. This flag only stops an ordinary
  //     instructor being shown an option that would be refused. <==
  const { profile } = await requireInstructor();

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      <h2 className="mb-1 text-page-title font-medium text-content-primary">
        Invite Users
      </h2>
      <p className="mb-4 max-w-reading text-body text-content-secondary">
        Only invited email addresses can register. Add one person at a time, or
        upload a CSV file to invite a whole class at once. New invites appear on
        the{" "}
        <Link href="/instructor/roster" className="underline">
          Roster
        </Link>{" "}
        under &quot;Invited, pending&quot; until that person signs up.
      </p>

      <AddEmailForm isSuperAdmin={profile.is_super_admin} />
      <BulkInviteForm isSuperAdmin={profile.is_super_admin} />
    </main>
  );
}
