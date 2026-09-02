"use client";

// GATE 6, DESIGN QUESTION A. What an instructor sees when they open a URL that
// belongs to ANOTHER OF THEIR OWN CLASSES.
//
// ==> WHY THIS EXISTS AND WHAT IT MUST NOT WEAKEN. refuseOutsideClass() answers
//     404 and hides whether the row exists at all. That wording was chosen
//     deliberately in Gate 3b so that one instructor cannot use a 403 to confirm
//     another instructor's id is real. It is exactly right for a STRANGER, and
//     it is wrong for the OWNER: an instructor following a bookmark from their
//     own other section should not be told their own submission does not exist.
//
//     SO THE 404 IS UNCHANGED FOR EVERYONE ELSE. The page that renders this has
//     already established, from the list of classes the signed-in account owns,
//     that the row is in one of THEIR classes. Anything else falls through to
//     the same notFound() with the same wording as before this piece, so a
//     stranger's experience is byte for byte identical.
//
//     AND IT DOES NOT AUTO-SWITCH. A link that silently changes which class you
//     are working in is a link that rewrites the state every other page reads,
//     and the next thing you created would land somewhere you did not choose.
//     The switch is one click and it is yours to make. <==
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function OtherClassNotice({
  className,
  classId,
  // What the reader was trying to open, completing "This ... is in another of
  // your classes": "submission", "persona", "comparison", "assignment".
  thing,
}: {
  className: string;
  classId: string;
  thing: string;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  async function switchAndOpen() {
    setSwitching(true);
    setError("");

    const res = await fetch("/api/instructor/class/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSwitching(false);
      setError(body?.error ?? "Could not switch class.");
      return;
    }

    // The address is already the right one. Once the working class has moved,
    // re-running this page's own server read is all that is needed to open it.
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      <Card padding="md" className="max-w-reading space-y-3">
        <h2 className="text-card-title font-medium text-content-primary">
          This {thing} is in another of your classes
        </h2>
        <p className="text-body text-content-secondary">
          You are working in a different class at the moment, so this {thing} is
          not on screen. It belongs to{" "}
          <span className="font-medium text-content-primary">{className}</span>.
        </p>
        <Button onClick={switchAndOpen} disabled={switching}>
          {switching ? "Switching..." : `Switch to ${className} and open it`}
        </Button>
        {error && <p className="text-body text-content-danger">{error}</p>}
      </Card>
    </main>
  );
}
