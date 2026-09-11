"use client";

// Bulk invite: upload a two-column (email, role) CSV and add every valid new row
// to the invite list at once. It sits just below the single-invite form. The
// browser only reads the file as text and POSTs it; ALL parsing, validation,
// case-insensitive dedup, and insertion happen server-side
// (/api/instructor/bulk-invite), so bad rows cannot be smuggled in. After a run
// it shows how many were added and lists every skipped row with its reason, then
// refreshes the roster so the new pending invites appear.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type SkippedRow = { value: string; reason: string };
type Result = {
  addedCount: number;
  skippedCount: number;
  added: string[];
  skipped: SkippedRow[];
};

export function BulkInviteForm({
  // GATE 6: a super admin may still import instructor rows. For everybody else
  // the server refuses them per row, so the instructions must not offer a role
  // that will be skipped. A UI that removes an option while the instructions
  // still describe it is exactly the drift this project has been bitten by.
  isSuperAdmin = false,
}: {
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a .csv file first.");
      return;
    }

    setLoading(true);
    try {
      const csv = await file.text();
      const res = await fetch("/api/instructor/bulk-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not import that file.");
        return;
      }
      setResult(data as Result);
      // Clear the chosen file and re-run the roster query so the new pending
      // invites appear below.
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("Something went wrong reading the file. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 rounded-lg border border-line-tertiary p-4"
    >
      <h2 className="text-card-title font-medium">Bulk invite (CSV)</h2>
      <p className="text-body text-content-secondary">
        Upload a .csv with two columns, email and role. A header row (email,role)
        is fine.{" "}
        {isSuperAdmin
          ? "Role must be student or instructor."
          : "Role must be student. Adding an instructor is an administrator action, so instructor rows are skipped."}{" "}
        Rows with a problem are skipped and listed below with a reason; the rest
        are added. Everyone imported joins the selected class.
      </p>

      <FileInput ref={fileRef} accept=".csv,text/csv" />

      <Button
        type="submit"
        disabled={loading}
      >
        {loading ? "Importing..." : "Import CSV"}
      </Button>

      {error && <p className="text-body text-content-danger">{error}</p>}

      {result && (
        <div className="space-y-2 border-t border-line-tertiary pt-3 text-body">
          <p className="text-content-success">
            Added {result.addedCount}. Skipped {result.skippedCount}.
          </p>

          {result.skipped.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-content-primary">Skipped rows</p>
              <ul className="space-y-1">
                {result.skipped.map((s, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2 text-content-secondary">
                    <span className="font-mono text-meta text-content-secondary">
                      {s.value}
                    </span>
                    <span className="text-content-tertiary">|</span>
                    <span>{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
