"use client";

// The assignment dropdown at the top of the instructor dashboard. Changing the
// selection navigates to /instructor?assignment=<id>, which re-runs the server
// page so the tiles and table below reflect the chosen assignment. This is the
// only client-side piece of the dashboard; everything else is read on the server.
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";

export function AssignmentSelector({
  assignments,
  selectedId,
}: {
  assignments: { id: string; label: string }[];
  selectedId: string;
}) {
  const router = useRouter();

  // The id ties this dropdown to the visible "Active Assignments" label on the
  // Submissions page, which is where its name now comes from (it used to carry
  // an aria-label instead, when it had no visible label).
  return (
    <Select
      value={selectedId}
      onChange={(e) => router.push(`/instructor?assignment=${e.target.value}`)}
      size="sm"
      fullWidth={false}
      id="assignment-selector"
    >
      {assignments.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </Select>
  );
}
