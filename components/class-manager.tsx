"use client";

// GATE 6. YOUR CLASSES: rename the one you are working in, and create another.
//
// ==> WHY THIS LIVES ON THE ROSTER rather than on its own destination or inside
//     the picker. The Roster is already the page about "this class and the
//     people in it", it is already read per class, and it is a set-up screen
//     visited rarely rather than a daily one, which is what class naming is. Its
//     own nav destination would be a seventh item duplicating a list the picker
//     already shows on every page. A create form attached to the picker would
//     put a write into the shared chrome of every instructor page. The "Manage
//     classes" link beside the picker is what keeps this discoverable from where
//     an instructor is already thinking about classes. <==
//
// Both actions are POSTs to routes with the service-role key, because Gate 1
// switched Row Level Security ON for `classes` with NO policies: the browser
// cannot read or write that table at all.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { MAX_CLASS_NAME_LENGTH } from "@/lib/class-name";

export type ManagedClass = { id: string; name: string };

export function ClassManager({
  classes,
  currentClassId,
}: {
  classes: ManagedClass[];
  currentClassId: string | null;
}) {
  const router = useRouter();
  const current = classes.find((c) => c.id === currentClassId) ?? null;

  const [renameValue, setRenameValue] = useState(current?.name ?? "");
  const [renameMessage, setRenameMessage] = useState("");
  const [renameError, setRenameError] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const [createValue, setCreateValue] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    setRenaming(true);
    setRenameMessage("");
    setRenameError(false);

    const res = await fetch("/api/instructor/class/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId: current.id, name: renameValue }),
    });
    const body = await res.json().catch(() => ({}));
    setRenaming(false);

    if (!res.ok) {
      setRenameError(true);
      setRenameMessage(body?.error ?? "Could not rename the class.");
      return;
    }
    setRenameMessage(`Renamed to "${body.name}".`);
    router.refresh();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateMessage("");
    setCreateError(false);

    const res = await fetch("/api/instructor/class/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: createValue }),
    });
    const body = await res.json().catch(() => ({}));
    setCreating(false);

    if (!res.ok) {
      setCreateError(true);
      setCreateMessage(body?.error ?? "Could not create the class.");
      return;
    }
    // The new class is now the working class (the route sets that on the same
    // response), so refreshing lands the instructor inside it ready to set it
    // up, rather than leaving them in the old one.
    setCreateValue("");
    setCreateMessage(`Created "${body.name}". You are now working in it.`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {classes.length > 1 && (
        <p className="text-body text-content-secondary">
          You have {classes.length} classes. Everything on the instructor pages
          shows the one you are working in, which you switch at the top of any
          page.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {current && (
          <form onSubmit={handleRename} className={cardClasses({ className: "space-y-3" })}>
            <h3 className="text-card-title font-medium">Rename this class</h3>
            <div>
              <Label className="mb-1">Class name</Label>
              <Input
                required
                maxLength={MAX_CLASS_NAME_LENGTH}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={renaming}>
              {renaming ? "Saving..." : "Save name"}
            </Button>
            {renameMessage && (
              <p
                className={`text-body ${renameError ? "text-content-danger" : "text-content-success"}`}
              >
                {renameMessage}
              </p>
            )}
          </form>
        )}

        <form onSubmit={handleCreate} className={cardClasses({ className: "space-y-3" })}>
          <h3 className="text-card-title font-medium">Create another class</h3>
          <p className="text-meta text-content-secondary">
            A new class starts empty, with no students, assignments or personas.
          </p>
          <div>
            <Label className="mb-1">Class name</Label>
            <Input
              required
              maxLength={MAX_CLASS_NAME_LENGTH}
              placeholder="Professional Selling, Section 2"
              value={createValue}
              onChange={(e) => setCreateValue(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create class"}
          </Button>
          {createMessage && (
            <p
              className={`text-body ${createError ? "text-content-danger" : "text-content-success"}`}
            >
              {createMessage}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
