"use client";

// The instructor navigation menu. It sits in the shared instructor layout,
// below the name, email, and sign-out button, and is the same on every
// instructor page.
//
// Each entry is a real route, so every destination has its own web address and
// loads only its own data. This is a client component for one reason: it reads
// the current path to mark which destination you are on.
import Link from "next/link";
import { usePathname } from "next/navigation";

// The five destinations, in the order they are shown. Submissions is the
// default: it lives at /instructor, which is where an instructor lands on login.
const DESTINATIONS = [
  { href: "/instructor", label: "Submissions" },
  { href: "/instructor/invites", label: "Invite Users" },
  { href: "/instructor/assignments", label: "Manage Assignments" },
  { href: "/instructor/roster", label: "Roster" },
  { href: "/instructor/scaffold", label: "Persona Scaffolding" },
];

// Which destination the current page belongs to. Submissions is matched exactly
// (plus the submission detail view, which is opened from it), and the others by
// prefix, so a sub-page such as a scaffolding comparison still highlights the
// destination it was reached through.
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/instructor") {
    return pathname === "/instructor" || pathname.startsWith("/instructor/submission");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function InstructorNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Instructor sections" className="mt-4 border-b border-gray-200">
      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        {DESTINATIONS.map((d) => {
          const current = isCurrent(pathname, d.href);
          return (
            <li key={d.href}>
              <Link
                href={d.href}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "-mb-px inline-block border-b-2 border-black py-2 text-sm font-medium text-black"
                    : "-mb-px inline-block border-b-2 border-transparent py-2 text-sm text-gray-500 hover:text-black"
                }
              >
                {d.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
