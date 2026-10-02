"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient();
    // ==> scope: "local" IS LOAD BEARING. <== Supabase's default is "global",
    // which ends EVERY session on the account, on every device, and deletes
    // their records. Measured on 2026-10-02: one click took the test account
    // from 15 sessions to 0. So an instructor signing out on a laptop was
    // silently signed out of their office browser too, and anyone signing out
    // of a shared test account signed everyone else out of it. "local" ends
    // this browser's session and no other.
    await supabase.auth.signOut({ scope: "local" });
    // A FULL PAGE LOAD ON PURPOSE, for the reason written out in
    // app/login/page.tsx: it throws away everything the page remembered about
    // the account that just signed out, including where its links led.
    window.location.assign("/login");
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={signOut}>
      Sign out
    </Button>
  );
}
