"use client";

// GATE 6. THE WORKING CLASS, shown on every instructor page and switchable from
// any of them. It sits in the shared instructor layout beside the nav, so an
// instructor can always see which class they are acting in without navigating
// anywhere to find out.
//
// ==> WITH ONE CLASS IT IS A LABEL, NOT A CONTROL, and that is deliberate. A
//     dropdown holding a single option is a control that does nothing, which is
//     worse than no control at all: it invites a click and then answers nothing.
//     Most instructors will have one class for most of a semester, so this is
//     the common case rather than the edge case. <==
//
// It is a client component because switching is an action. The switch itself is
// a POST to /api/instructor/class/select followed by router.refresh(), which is
// the same form-and-route pattern the name gate and the create-assignment form
// use. It cannot be a client-side cookie write: the cookie is httpOnly, and the
// ownership check that makes the whole feature safe lives on the server.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { controlClasses } from "@/components/ui/field";

export type PickerClass = { id: string; name: string };

export function ClassPicker({
  classes,
  currentClassId,
}: {
  classes: PickerClass[];
  currentClassId: string | null;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  async function switchTo(classId: string) {
    if (!classId || classId === currentClassId) return;
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

    // Every instructor page reads the working class on the server, so a refresh
    // is what makes the whole surface follow the picker in one step.
    router.refresh();
    setSwitching(false);
  }

  // No class at all. A real state (an instructor can hand their last class away
  // or have it deleted), and the app already refuses their writes with a plain
  // message, so this stays quiet rather than raising an alarm the person cannot
  // act on.
  if (classes.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-meta text-content-tertiary">
        <span>No class</span>
      </div>
    );
  }

  const current = classes.find((c) => c.id === currentClassId) ?? classes[0];

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
      <span className="text-meta text-content-tertiary">Class</span>

      {classes.length === 1 ? (
        <span className="text-card-title font-medium text-content-primary">
          {current.name}
        </span>
      ) : (
        <>
          <label className="sr-only" htmlFor="working-class">
            Class
          </label>
          <select
            id="working-class"
            value={current.id}
            disabled={switching}
            onChange={(e) => switchTo(e.target.value)}
            className={controlClasses({ size: "sm", fullWidth: false })}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </>
      )}

      {/* The link is what keeps creating and renaming discoverable from the
          place an instructor is already thinking about classes, without putting
          a form into the chrome of every page. */}
      <Link
        href="/instructor/roster#classes"
        className="text-meta text-content-info underline"
      >
        Manage classes
      </Link>

      {error && <span className="text-meta text-content-danger">{error}</span>}
    </div>
  );
}
