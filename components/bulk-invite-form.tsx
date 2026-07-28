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

type SkippedRow = { value: string; reason: string };
type Result = {
  addedCount: number;
  skippedCount: number;
  added: string[];
  skipped: SkippedRow[];
};

export function BulkInviteForm() {
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
      className="mt-4 space-y-3 rounded-lg border border-gray-200 p-4"
    >
      <h2 className="font-medium">Bulk invite (CSV)</h2>
      <p className="text-sm text-gray-500">
        Upload a .csv with two columns, email and role. A header row (email,role)
        is fine. Role must be student or instructor. Rows with a problem are
        skipped and listed below with a reason; the rest are added.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
      />

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {loading ? "Importing..." : "Import CSV"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-2 border-t border-gray-100 pt-3 text-sm">
          <p className="text-green-700">
            Added {result.addedCount}. Skipped {result.skippedCount}.
          </p>

          {result.skipped.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-gray-700">Skipped rows</p>
              <ul className="space-y-1">
                {result.skipped.map((s, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2 text-gray-600">
                    <span className="font-mono text-xs text-gray-500">
                      {s.value}
                    </span>
                    <span className="text-gray-300">|</span>
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
