// GATE 6. Where the instructor's WORKING CLASS is remembered between requests.
//
// Before this piece an instructor owned exactly one class, so "which class am I
// acting in" was DERIVED from the signed-in user and could not be influenced
// from the browser at all. An instructor may now own several, so the answer
// becomes a REMEMBERED CHOICE, and a remembered choice lives somewhere the
// person holding it can edit.
//
// ==> THAT IS THE HAZARD THIS WHOLE PIECE TURNS ON, AND IT IS WHY THIS FILE
//     HOLDS NOTHING BUT A NAME. The value below is a HINT and never an
//     authority. Nothing may act on it until resolveWorkingClassId() in
//     lib/instructor-auth.ts has checked it against classes.instructor_id for
//     the signed-in account, on THIS request, not on the request that set it.
//     A hand-edited cookie must be able to name any class in the system and
//     still get the caller nothing but their own oldest class. <==
//
// WHY A COOKIE RATHER THAN A COLUMN ON profiles. A column would be a schema
// change, which this piece rules out, and it would make the choice follow the
// person across devices, which is the wrong behaviour: two browser tabs open on
// two different classes is a normal way to work. A cookie is per browser, which
// is what a "working" anything should be.
//
// WHY IT IS SET BY A ROUTE. Cookies cannot be set from a Server Component (see
// the catch block in lib/supabase/server.ts), there are no server actions in
// this codebase, and classes has Row Level Security switched on with NO
// policies, so the browser cannot read or write that table to check anything for
// itself. The picker therefore posts to /api/instructor/class/select, which
// verifies ownership server-side and sets this cookie on its own response.

export const WORKING_CLASS_COOKIE = "relii_working_class";

// A year. The choice is a convenience, so it should outlive a browser restart;
// nothing is lost if it expires, because the resolver falls back to the oldest
// owned class, which is exactly how the app behaved before this piece.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// httpOnly, so no page script can read or write it. That is not the security
// boundary (a person with devtools can still edit any cookie of their own, and
// the ownership check is what makes that harmless); it is there so the value
// cannot be changed by accident, by an extension, or by any code we ship.
export const WORKING_CLASS_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_YEAR_SECONDS,
};
