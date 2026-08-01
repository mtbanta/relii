// The screen a student sees if they return to a graded submission they left
// before submitting. A graded submission is one continuous, one-shot attempt: it
// cannot be resumed or restarted by the student. Only an instructor can grant a
// retake. This is a plain presentational component (no client hooks), so it can
// render on the server page or inside the client gate.
import Link from "next/link";

export function LockedSubmission({
  assignmentTitle,
}: {
  assignmentTitle?: string;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-section font-semibold">Submission interrupted</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        Your graded submission
        {assignmentTitle ? (
          <>
            {" "}for <span className="font-medium">{assignmentTitle}</span>
          </>
        ) : null}{" "}
        was left before it was submitted. A graded submission is a single,
        one-time attempt, so it cannot be resumed or restarted here.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        Please contact your instructor if you need this attempt reset.
      </p>
      <Link
        href="/student"
        className="mt-6 inline-block rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
      >
        Back to home
      </Link>
    </div>
  );
}
