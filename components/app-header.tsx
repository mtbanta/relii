// THE APP HEADER (PD-8c), shared by the student and instructor surfaces so the
// two feel like one product.
//
// WHAT THIS REPLACES. The instructor surface used to open with a 24px "Instructor
// dashboard" title, then the name, then the email, then the nav row, and only
// then the page's own heading. That is four things before any content, and it
// meant the page you had actually navigated to announced itself fourth.
//
// The mockup's shell instead: a small "Relii" wordmark in the accent colour with
// a lightweight qualifier beside it, and the user affordance compact on the
// right. The page's own heading then becomes the first real thing on the page.
//
// Nothing about navigation, auth or the name gate lives here. This is
// presentation only: PD-1's five destinations, their routes and their
// active-state behaviour are untouched, and the gates stay where they are in
// app/instructor/layout.tsx.
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";

export function AppHeader({
  name,
  email,
  qualifier,
  homeHref,
}: {
  name: string;
  email: string;
  // The word beside the wordmark ("instructor"). Omitted on the student side,
  // where there is nothing to qualify.
  qualifier?: string;
  homeHref: string;
}) {
  return (
    <header className="flex items-center justify-between gap-4 py-3">
      {/* PD-8g: the wordmark, a "Beta" designation, then the qualifier.
          The qualifier moved OUT of the link in the same change, so the link is
          exactly the wordmark: its accessible name is now "Relii" rather than
          "Relii Beta instructor", and neither the badge nor the word
          "instructor" is a click target that silently navigates home.
          The badge is the shared Badge primitive rather than a one-off span, so
          it carries the same pill shape, size and contrast as every other
          status pill in the app. */}
      <div className="flex min-w-0 items-baseline gap-1.5">
        <Link
          href={homeHref}
          className="text-wordmark font-medium text-content-info"
        >
          Relii
        </Link>
        <Badge tone="info">Beta</Badge>
        {qualifier && (
          <span className="text-meta font-normal text-content-tertiary">
            {qualifier}
          </span>
        )}
      </div>

      {/* Compact, but nothing is hidden: the signed-in person and the account
          they are in are both still on screen, and sign out is still a real
          button rather than something behind a menu. */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 text-right">
          <p className="truncate text-meta text-content-secondary">{name}</p>
          <p className="truncate text-micro text-content-tertiary">{email}</p>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
