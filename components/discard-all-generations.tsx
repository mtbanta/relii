"use client";

// "Discard all unused test generations": the bulk tidy-up for the pile of
// throwaway candidate pairs that testing leaves behind.
//
// This is the most destructive control in the scaffolding admin, so it follows
// the strong-confirmation pattern the assignment delete already uses: a red
// panel, a plain statement of exactly what is about to happen, and a word the
// admin has to type before the final button works. The typed word is DISCARD
// rather than DELETE, so muscle memory from the assignment confirmation cannot
// carry anyone through this one by accident.
//
// THE COUNT IS FETCHED WHEN THE PANEL OPENS, not when the page loaded, and it
// comes from the same server function that decides what gets deleted. So the
// number shown is the number acted on, and it cannot be a stale figure from
// whenever the page happened to be rendered.
import { useState } from "react";
import { useRouter } from "next/navigation";

type Preview = {
  deletable: number;
  live: number;
  used: number;
  names: string[];
  liveNames: string[];
  usedNames: string[];
};

export function DiscardAllGenerations() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function openPanel() {
    setOpen(true);
    setError("");
    setDone("");
    setTyped("");
    setPreview(null);
    setLoading(true);
    try {
      const res = await fetch("/api/instructor/scaffold/discard-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not count the generated personas.");
        setLoading(false);
        return;
      }
      setPreview(data as Preview);
      setLoading(false);
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  async function handleDiscard() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/instructor/scaffold/discard-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DISCARD" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not discard the generated personas.");
        setLoading(false);
        return;
      }
      setDone(
        `Discarded ${data.deleted} candidate${data.deleted === 1 ? "" : "s"}.`,
      );
      setOpen(false);
      setLoading(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button
          onClick={openPanel}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          Discard all unused test generations
        </button>
        {done && <p className="mt-2 text-sm text-green-700">{done}</p>}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm">
      <p className="mb-2 font-semibold text-red-800">
        Permanently delete every unused generated persona
      </p>

      {loading && !preview && <p className="text-red-800">Counting...</p>}

      {preview && (
        <>
          <p className="mb-2 text-red-800">
            This will permanently delete{" "}
            <span className="font-semibold">
              {preview.deletable} candidate persona
              {preview.deletable === 1 ? "" : "s"}
            </span>
            . This cannot be undone.
          </p>
          {preview.names.length > 0 && (
            <p className="mb-2 text-xs text-red-700">
              To be deleted: {preview.names.join(", ")}.
            </p>
          )}

          {/* Said explicitly, because "delete everything unused" is exactly the
              kind of action where an admin needs to see what it will NOT do. */}
          <div className="mb-3 rounded-md bg-white p-2 text-xs text-gray-700">
            <p className="font-medium text-gray-900">What is NOT touched:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Alex, Jordan, and every hand-written scenario.</li>
              <li>
                Chosen personas that are switched on
                {preview.live > 0
                  ? ` (${preview.live}: ${preview.liveNames.join(", ")})`
                  : " (none right now)"}
                . Turn one off first if you want it gone.
              </li>
              <li>
                Anything role-played or assigned
                {preview.used > 0
                  ? ` (${preview.used}: ${preview.usedNames.join(", ")})`
                  : " (none right now)"}
                .
              </li>
            </ul>
          </div>

          <label className="mb-2 block text-red-800">
            Type <span className="font-mono font-semibold">DISCARD</span> to
            confirm:
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 block w-36 rounded-md border border-red-300 bg-white px-2 py-0.5 font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleDiscard}
          disabled={
            loading || !preview || preview.deletable === 0 || typed !== "DISCARD"
          }
          className="rounded-md bg-red-600 px-2 py-1 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading
            ? "Discarding..."
            : `Permanently delete ${preview?.deletable ?? 0}`}
        </button>
      </div>

      {preview?.deletable === 0 && (
        <p className="mt-2 text-red-800">
          There is nothing unused to discard right now.
        </p>
      )}
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
