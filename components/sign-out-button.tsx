"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
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
