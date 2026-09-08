// HAS THIS PERSON ACCEPTED THE CLICK-THROUGH? (Phase 5). SERVER ONLY.
//
// Used by the two dashboards to decide whether to show the consent gate. Every
// account created from the register page has a consent row already, written by
// the signup trigger in the same transaction as the account, so this only ever
// answers "no" for an account that existed BEFORE Phase 5 shipped: Michael, Tom,
// the second instructor account and the test students.
//
// THE READ USES THE SERVICE-ROLE KEY, and public.consents has row level security
// on with NO POLICIES AT ALL. That is the whole access design: nothing reachable
// from a browser can read, write or forge a consent row, and there is no policy
// to get wrong. It is the same pattern as app/api/profile/name/route.ts.
import { createAdminClient } from "@/lib/supabase/admin";

// ==> THIS CHECK FAILS OPEN, AND IT IS THE ONLY GUARD IN RELII THAT DOES. IT IS
//     DELIBERATE. DO NOT "CORRECT" IT.
//
//     Every other guard we built fails CLOSED on purpose: refuseOutsideClass()
//     and loadClassStudents() refuse when they cannot prove the caller is
//     entitled, because the cost of wrongly allowing is a data leak across
//     classes and the cost of wrongly refusing is one error message.
//
//     HERE THE COSTS ARE THE OTHER WAY AROUND. This gate blocks the ENTIRE
//     instructor surface (it is mounted in app/instructor/layout.tsx), so
//     failing closed on a transient database error would lock Tom out of his own
//     dashboard in the middle of a class. Failing open costs one ungated
//     pageview for one of about five known legacy accounts, none of which is a
//     real student, and the gate returns on the next load. It is also NOT the
//     thing enforcing consent for anyone who registers from now on: the database
//     is, at the moment the account is created, and nothing here can weaken that.
export async function hasConsented(userId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("consents")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  // See the note above: an error means "let them through", not "block them".
  // This also covers the window between the code deploy and the SQL run, when
  // the table does not exist yet.
  if (error) {
    return true;
  }

  return (data?.length ?? 0) > 0;
}
