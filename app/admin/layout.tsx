// THE SUPER ADMIN SHELL. Wraps every route under /admin.
//
// ==> IT IS A SEPARATE SURFACE, NOT A SECTION OF THE INSTRUCTOR ONE, and that is
//     the architecture rather than a layout choice. Locked decision 3 rejected
//     "the super admin is an instructor who sees everything" because that design
//     threads an exception through every instructor policy and query, which is
//     where isolation bugs come from. So this shell has its own guard
//     (lib/super-admin.ts), its own reads, and no shared code with the
//     instructor surface at all: nothing under /admin imports lib/class-scope.ts,
//     and nothing under /instructor imports lib/super-admin.ts. <==
//
// The guard has to be here rather than in middleware, because
// lib/supabase/middleware.ts only enforces "is this visitor signed in" and knows
// nothing about roles. Every page below re-checks for itself as well, since a
// page can be requested directly.
//
// There is no name gate here. A super admin is an instructor, so they have
// already been through it on the instructor surface.
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireSuperAdmin } from "@/lib/super-admin";
import { displayName } from "@/lib/name";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireSuperAdmin();

  return (
    <>
      <div className="mx-auto w-full max-w-page px-6">
        <AppHeader
          name={displayName({ ...profile, email: user.email ?? "" })}
          email={user.email ?? ""}
          qualifier="administration"
          homeHref="/admin"
        />
        <nav
          aria-label="Administration"
          className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line-tertiary"
        >
          <Link
            href="/admin"
            className="-mb-px inline-block border-b-2 border-content-info py-1.5 text-card-title font-medium text-content-primary"
          >
            All instructors
          </Link>
          <Link
            href="/instructor"
            className="-mb-px inline-block border-b-2 border-transparent py-1.5 text-card-title text-content-secondary hover:text-content-primary"
          >
            Back to my own class
          </Link>
        </nav>
      </div>

      {children}
    </>
  );
}
