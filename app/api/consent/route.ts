// Records the click-through for an account that already existed before Phase 5
// (Michael, Tom, the second instructor account, the test students).
//
// THIS IS NOT THE PATH THAT MATTERS FOR STUDENTS. Everyone who registers from
// now on gets their consent row from the signup trigger, in the same transaction
// as their account, and never reaches this route. This is the legacy path and
// the re-consent path.
//
// Same shape as app/api/profile/name/route.ts: the user id comes from the
// signed-in session cookie and never from the browser, and the write uses the
// service-role key, so a caller can only ever record their OWN consent. No
// browser write rule is opened on public.consents; this route and the signup
// trigger are the entire write path.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIVACY_VERSION, AGREEMENT_VERSION } from "@/lib/legal";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { accepted?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The box has to have been ticked. A request that does not say so records
  // nothing, for the same reason the signup trigger refuses: a consent row whose
  // whole purpose is to say a person agreed must never be written for a person
  // who did not.
  if (body.accepted !== true) {
    return NextResponse.json(
      { error: "You must accept the terms to continue." },
      { status: 400 },
    );
  }

  // THE VERSIONS COME FROM THE SERVER (lib/legal.ts), NOT FROM THE REQUEST. The
  // page that showed the documents and this route are the same deploy, so the
  // versions here are the versions that were on screen, and a caller cannot name
  // a version of their own.
  const admin = createAdminClient();
  const { error } = await admin.from("consents").insert({
    user_id: user.id,
    privacy_version: PRIVACY_VERSION,
    agreement_version: AGREEMENT_VERSION,
  });

  // 23505 is the unique constraint on (user_id, privacy_version,
  // agreement_version): this person has already accepted these exact versions,
  // so the record is already right and a double submit is not an error.
  if (error && error.code !== "23505") {
    return NextResponse.json(
      { error: "Could not record your acceptance." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
