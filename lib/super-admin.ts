// GATE 4b. The super admin guard, for the cross-tenant administration section.
//
// ==> WHY THIS IS ITS OWN FILE, AND WHY IT DUPLICATES ABOUT TWENTY LINES OF
//     lib/class-scope.ts RATHER THAN SHARING THEM. Locked decision 3 rejected
//     "the super admin is an instructor who sees everything" on ARCHITECTURAL
//     grounds: that design threads a super admin exception through the
//     instructor surface, and the instructor surface is where isolation bugs
//     come from. Factoring these two guards together would put an "unless they
//     are a super admin" branch inside requireInstructorRequest(), which is the
//     single function every instructor route trusts to tell it which class it
//     may act inside. THE DUPLICATION IS THE POINT: no instructor route can ever
//     accidentally inherit cross-class powers, because the code that grants them
//     is not on that path at all.
//
//     The same rule runs the other way. NOTHING IN THIS FILE, OR ANYWHERE UNDER
//     /admin, IMPORTS lib/class-scope.ts, and no instructor page or route
//     imports this. Even the Refusal shape below is declared here rather than
//     imported, so the two surfaces share no code at all. <==
//
// HOW A SUPER ADMIN IS IDENTIFIED: profiles.is_super_admin, a boolean added by
// supabase/gate-4b-super-admin.sql. The role column is untouched, so a super
// admin is still an ordinary instructor everywhere else in the app, with one
// class and no special sight into anyone else's.
//
// THE FLAG CANNOT BE SELF-GRANTED. public.profiles has a select policy and no
// update policy, and Row Level Security denies what it has no rule for, so no
// browser can write any column of profiles. The flag is settable only in the
// SQL editor or with the service-role key.
//
// IT IS ALWAYS READ FROM THE DATABASE, never from anything the browser sent.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminClient = ReturnType<typeof createAdminClient>;

// The same shape lib/class-scope.ts returns, declared separately on purpose (see
// the note above). Each route turns it into JSON in one line.
export type Refusal = { ok: false; status: number; error: string };

export type SuperAdminProfile = {
  role: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_super_admin: boolean;
};

export type SuperAdminRequest = {
  ok: true;
  userId: string;
  email: string | null;
  admin: AdminClient;
};

// THE PAGE GUARD. Used by app/admin/layout.tsx and by each page under it.
//
// It has to be a per-page guard rather than middleware: lib/supabase/middleware.ts
// only enforces "is this visitor signed in" and knows nothing about roles, which
// is why every other role gate in this app is written where the page is.
//
// Anyone who is not a super admin is sent to their own home rather than shown an
// error, so an ordinary instructor who follows a stale link simply lands back on
// Submissions. Neither branch ever returns, so callers can use the result
// directly.
export async function requireSuperAdmin(): Promise<{
  user: { id: string; email?: string };
  profile: SuperAdminProfile;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Read through the ordinary client: the "read own profile" policy lets a user
  // read their own row and only their own, which is all this needs.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, first_name, last_name, is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_super_admin) {
    redirect(profile?.role === "instructor" ? "/instructor" : "/student");
  }

  return { user, profile: profile as SuperAdminProfile };
}

// THE ROUTE GUARD. "Is this request from a signed-in super admin?"
//
// It cannot be requireSuperAdmin() above: that calls redirect(), which is a page
// mechanism and throws inside an API route instead of returning a JSON error.
// Gate 3a lost time to exactly that confusion on the instructor side.
//
// `action` completes the sentence "Only a super admin can ...".
//
// NOTE WHAT IS NOT HERE: there is no classId. Every instructor request is scoped
// to one class because that is the isolation rule; a super admin request is
// scoped to no class at all, and each route names the class it is acting on in
// its own address. Keeping the two guards different in shape as well as in file
// is deliberate.
export async function requireSuperAdminRequest(
  action: string,
): Promise<SuperAdminRequest | Refusal> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Not signed in." };
  }

  const admin = createAdminClient();

  // Verified on the server against the database. The browser is never trusted
  // to say who is a super admin.
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("email, is_super_admin")
    .eq("id", user.id)
    .single();

  if (callerError || !caller?.is_super_admin) {
    return { ok: false, status: 403, error: `Only a super admin can ${action}.` };
  }

  return { ok: true, userId: user.id, email: caller.email ?? null, admin };
}
