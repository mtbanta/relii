// POST /api/instructor/assignment/rubric-preview
// Body: multipart form data with one field, "rubric", holding an .xlsx file.
//
// PHASE 2a. Parses an uploaded rubric and returns ONLY its name and the names
// of its criteria, so Tom can see what he has attached before he creates the
// assignment. IT WRITES NOTHING.
//
// ==> IT IS GUARDED EXACTLY LIKE THE ROUTE THAT DOES WRITE, AND THE REASONING
//     THAT WOULD LEAVE IT OPEN IS THE PLAUSIBLE KIND.
//
//     "It writes nothing, so it needs no class check" sounds right and ships a
//     hole. Ungated, this is a FREE XLSX-PARSING ENDPOINT FOR ANY SIGNED-IN
//     ACCOUNT, students included: hand it a file and it spends CPU and memory
//     unzipping and walking a workbook. Rule zero bounds each individual call,
//     and nothing else bounds who may make them or how often.
//
//     A read-only endpoint is not an unguarded endpoint. What it returns is not
//     the only thing it costs. <==
//
// WHAT IT DELIBERATELY DOES NOT RETURN: the points values. The preview exists
// to confirm Tom picked the right file, and the browser is never the source of
// the numbers that get stored. The create route re-parses the same file and
// stores what IT parsed, so nothing sent between the two calls is trusted. See
// the note in that route.
import { NextResponse } from "next/server";
import { requireInstructorRequest } from "@/lib/class-scope";
import { parseRubricFromForm, refuseOversizedBody } from "@/lib/rubric-upload";

export async function POST(request: Request) {
  // 1. Same guard as the create route. See the note above.
  const gate = await requireInstructorRequest("preview a rubric");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // 2. Rule zero, as early as it can be applied: before the body is read.
  const oversized = refuseOversizedBody(request);
  if (oversized) {
    return NextResponse.json({ error: oversized }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "That upload could not be read. Please try again." },
      { status: 400 },
    );
  }

  // 3. Parse. Every refusal message comes from the parser, so a bad file reads
  //    the same here as it will on the create call.
  const parsed = await parseRubricFromForm(form);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // 4. The name and the criterion names. Nothing else.
  return NextResponse.json({
    ok: true,
    name: parsed.rubric.name,
    criteria: parsed.rubric.criteria.map((c) => c.name),
  });
}
