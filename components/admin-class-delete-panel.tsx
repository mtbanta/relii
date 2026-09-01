"use client";

// THE EXPORT-FIRST CASCADE DELETE, from the operator's side.
//
// ==> WHAT THIS COMPONENT IS NOT. It is not what makes "export first" true. The
//     panel only enables the confirm field after an export has been taken, but
//     that is a courtesy, not a rule: a crafted request skips this page
//     entirely. The rule lives on the server, which issues a one-time token on
//     export and refuses any delete without one, refuses a token issued for
//     another class, refuses one already used or over an hour old, and refuses
//     any token whose fingerprint no longer matches what is in the class right
//     now. A page that enforced this on its own would be a convention enforced
//     by nothing, which is the class of bug Gate 4a deleted rather than
//     documented. <==
//
// The file is built and downloaded here in the browser rather than being served
// as a link, because the export is a POST: it has a side effect (it issues the
// token), and a GET that changes the database is a link something may follow on
// its own.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ExportResult = {
  token: string;
  filename: string;
  counts: Record<string, number>;
};

export function ClassDeletePanel({
  classId,
  classLabel,
  studentCount,
  accountsToDelete,
  recordingCount,
}: {
  classId: string;
  classLabel: string;
  studentCount: number;
  accountsToDelete: number;
  recordingCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [exported, setExported] = useState<ExportResult | null>(null);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string[]>([]);

  async function handleExport() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/class/${classId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not export this class.");
        setLoading(false);
        return;
      }

      // Save the file. The browser does this, so the CSV never has to be stored
      // anywhere on the server.
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExported({ token: data.token, filename: data.filename, counts: data.counts });
      setLoading(false);
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!exported) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/class/${classId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: exported.token, confirm: "REMOVE" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not delete this class.");
        // The token is spent whether or not the run finished, so the export step
        // has to be taken again.
        setExported(null);
        setTyped("");
        setLoading(false);
        return;
      }

      const removed = data?.removed ?? {};
      setDone([
        ...Object.entries(removed).map(([what, n]) => `${what.replace(/_/g, " ")}: ${n}`),
        ...((data?.notes ?? []) as string[]),
      ]);
      setLoading(false);
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  if (done.length > 0) {
    return (
      <Card tone="muted" padding="lg">
        <p className="text-card-title font-medium text-content-primary">
          &quot;{classLabel}&quot; has been deleted
        </p>
        <ul className="mt-2 space-y-0.5">
          {done.map((line) => (
            <li key={line} className="text-meta text-content-secondary">
              {line}
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  if (!open) {
    return (
      <Card tone="default" padding="lg">
        <p className="text-card-title font-medium text-content-primary">
          Export and delete this class
        </p>
        <p className="mt-1 max-w-reading text-meta text-content-secondary">
          The last resort. It permanently destroys everything in this class,
          including the recordings, which no export can bring back. Hand the
          class over instead if anyone still needs the work in it.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => setOpen(true)}
        >
          Export and delete...
        </Button>
        {error && <p className="mt-2 text-body text-content-danger">{error}</p>}
      </Card>
    );
  }

  return (
    <div className="rounded-lg border-2 border-red-300 bg-surface-danger p-4 text-body">
      <p className="mb-2 font-semibold text-content-danger">
        Permanently delete &quot;{classLabel}&quot;
      </p>

      <ul className="mb-3 list-disc space-y-1 pl-5 text-content-danger">
        <li>
          Every rubric, persona, assignment and session in this class, with every
          transcript and score.
        </li>
        <li>
          <span className="font-semibold">
            {recordingCount} webcam recording{recordingCount === 1 ? "" : "s"}
          </span>
          , permanently. The export lists them but cannot contain the video.
          There is no other copy.
        </li>
        <li>
          {accountsToDelete} of the {studentCount} student account
          {studentCount === 1 ? "" : "s"} in this class. A student who is in
          another class keeps their account and loses only this membership.
        </li>
        <li>The invite list for this class, and the class itself.</li>
      </ul>

      {/* Step 1. */}
      <div className="mb-3 rounded-md bg-white p-3 text-meta text-content-primary">
        <p className="font-medium">Step 1. Export it.</p>
        <p className="mt-1">
          The export is the only record of this class that will exist afterwards.
          The server will not run the deletion without it, and will refuse if
          anything in the class changes between the export and the deletion.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={handleExport}
          disabled={loading}
        >
          {loading && !exported ? "Building the export..." : "Export this class"}
        </Button>
        {exported && (
          <div className="mt-2">
            <p className="text-content-success">
              Saved {exported.filename}. Open it and check it before going on.
            </p>
            <p className="mt-1 text-content-tertiary">
              It contains:{" "}
              {Object.entries(exported.counts)
                .map(([what, n]) => `${n} ${what.replace(/_/g, " ")}`)
                .join(", ")}
              .
            </p>
          </div>
        )}
      </div>

      {/* Step 2. */}
      <div className="mb-3 rounded-md bg-white p-3 text-meta text-content-primary">
        <p className="font-medium">Step 2. Confirm.</p>
        {!exported ? (
          <p className="mt-1 text-content-tertiary">
            Available once the export has been taken.
          </p>
        ) : (
          <label className="mt-2 block">
            Type <span className="font-mono font-semibold">REMOVE</span> to
            confirm. This cannot be undone.
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
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            setOpen(false);
            setError("");
            setTyped("");
            setExported(null);
          }}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="xs"
          onClick={handleDelete}
          disabled={loading || !exported || typed !== "REMOVE"}
        >
          {loading && exported ? "Deleting..." : "Permanently delete this class"}
        </Button>
      </div>

      {error && <p className="mt-2 text-content-danger">{error}</p>}
    </div>
  );
}
