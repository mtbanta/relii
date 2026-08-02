// The shared shell for every instructor page. It draws the header (the page
// title, the instructor's name and email, and the sign-out button) and the
// navigation menu below it, and it wraps every route under /instructor, so the
// nav is always there and the chrome is written once.
//
// It also holds the two gates for the whole instructor surface:
//   1. Signed in AND an instructor (role read from the database).
//   2. The required name gate. With no first and last name set, this renders the
//      gate INSTEAD of the page, so no instructor destination can be reached,
//      not even by typing its address, until a name is entered.
//
// The name check lives here and only here. Each page re-checks the user and the
// role for itself (it needs the user's id for its own reads anyway), but does
// NOT re-check the name, because a page that redirected on a missing name would
// bounce against this gate forever.
import { AppHeader } from "@/components/app-header";
import { InstructorNav } from "@/components/instructor-nav";
import { NameGate } from "@/components/name-gate";
import { requireInstructor } from "@/lib/instructor-auth";
import { displayName, hasName } from "@/lib/name";

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireInstructor();

  // No name yet: the gate replaces the entire instructor surface, header and
  // nav included, so there is nothing else on screen to click.
  if (!hasName(profile)) {
    return <NameGate email={user.email ?? ""} />;
  }

  return (
    <>
      <div className="mx-auto w-full max-w-page px-6">
        <AppHeader
          name={displayName({ ...profile, email: user.email ?? "" })}
          email={user.email ?? ""}
          qualifier="instructor"
          homeHref="/instructor"
        />
        <InstructorNav />
      </div>

      {children}
    </>
  );
}
