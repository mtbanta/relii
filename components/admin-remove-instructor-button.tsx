"use client";

// Remove an instructor account. Only rendered for an instructor who owns no
// class, because the database refuses it otherwise: classes.instructor_id is
// "on delete restrict", so an account that owns a class cannot be deleted at
// all. The class is dealt with first, by handing it to somebody else or by the
// export-first delete.
//
// The typed word is REMOVE, and the server checks it too. The page never
// decides anything on its own.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function RemoveInstructorButton({
  instructorId,
  email,
}: {
  instructorId: string;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRemove() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/instructor/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructorId, confirm: "REMOVE" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not remove that account.");
        setLoading(false);
        return;
      }
      setOpen(false);
      setLoading(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Remove account
        </Button>
        {error && <p className="mt-1 text-meta text-content-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-red-300 bg-surface-danger p-3 text-meta">
      <p className="mb-2 text-content-danger">
        Permanently delete the account for{" "}
        <span className="font-semibold">{email}</span>. They own no class, so no
        student work is affected. Anything they wrote in a class that still
        exists is kept and simply stops naming an author.
      </p>
      <label className="mb-2 block text-content-danger">
        Type <span className="font-mono font-semibold">REMOVE</span> to confirm:
        <Input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          size="xs"
          tone="danger"
          fullWidth={false}
          className="mt-1 block w-36 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            setOpen(false);
            setError("");
            setTyped("");
          }}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="xs"
          onClick={handleRemove}
          disabled={loading || typed !== "REMOVE"}
        >
          {loading ? "Removing..." : "Remove account"}
        </Button>
      </div>
      {error && <p className="mt-2 text-content-danger">{error}</p>}
    </div>
  );
}
