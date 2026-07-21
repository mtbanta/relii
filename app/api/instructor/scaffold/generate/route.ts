// POST /api/instructor/scaffold/generate
// Body: the scaffolding form's inputs. Returns TWO candidate personas.
//
// This generates persona candidates with the AI and returns them for review.
// It writes NOTHING to the database: chunk 2b is generate-and-look-at-it, and
// saving candidates as disabled scenarios is chunk 2c.
//
// It is guarded the same way the other instructor routes are: the caller must be
// an instructor, with the role read from the DATABASE and never trusted from the
// browser. The page that hosts the form redirects non-instructors, but a route
// is reachable on its own, so the route does its own check.
//
// The OpenAI call happens HERE, on the server, using the existing
// OPENAI_API_KEY. The key never reaches the browser, and there is no web search
// or any other external tool involved: model knowledge only.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTwoCandidates } from "@/lib/persona-scaffold";
import type { ScaffoldInputs } from "@/lib/persona-scaffold";
import { assembleScenario } from "@/lib/persona-assembly";

// Two model calls run at the same time and each one can be slow, so we ask for
// more than the platform default rather than guessing what that default is.
// Sixty seconds is allowed on either Vercel plan. If a real generation still
// runs out of time, that is the known escalation point to a background job
// (Piece 2 design decision 7), which belongs to chunk 2c.
export const maxDuration = 60;

// Read one required text field from the submitted form data.
function readText(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  // 1. The caller must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2. The caller must be an instructor, verified on the server against the
  //    database. Any instructor may scaffold (design decision 6: no new role).
  const admin = createAdminClient();
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "instructor") {
    return NextResponse.json(
      { error: "Only instructors can generate personas." },
      { status: 403 },
    );
  }

  // 3. Read and check the form inputs.
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Missing form details." }, { status: 400 });
  }

  const meetingType = readText(body, "meetingType");
  const chainPosition = readText(body, "chainPosition");
  if (meetingType !== "discovery" && meetingType !== "presentation") {
    return NextResponse.json({ error: "Pick a meeting type." }, { status: 400 });
  }
  if (chainPosition !== "gatekeeper" && chainPosition !== "decision_maker") {
    return NextResponse.json({ error: "Pick a chain position." }, { status: 400 });
  }

  const inputs: ScaffoldInputs = {
    industry: readText(body, "industry"),
    personaRole: readText(body, "personaRole"),
    productOrService: readText(body, "productOrService"),
    companySize: readText(body, "companySize"),
    meetingType,
    chainPosition,
    gatesAccessTo: readText(body, "gatesAccessTo"),
    winCondition: readText(body, "winCondition"),
    sellerCompanyType: readText(body, "sellerCompanyType"),
  };

  // Every field except gatesAccessTo is required. gatesAccessTo is required
  // only for a gatekeeper, since a decision maker gates nobody.
  const missing: string[] = [];
  if (!inputs.industry) missing.push("industry");
  if (!inputs.personaRole) missing.push("persona role");
  if (!inputs.productOrService) missing.push("product or service");
  if (!inputs.companySize) missing.push("company size");
  if (!inputs.winCondition) missing.push("win condition");
  if (!inputs.sellerCompanyType) missing.push("seller company type");
  if (inputs.chainPosition === "gatekeeper" && !inputs.gatesAccessTo) {
    missing.push("who this persona gates access to");
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Please fill in: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  // 4. Generate the two candidates, then assemble each one's scenario text with
  //    the fixed template. If either candidate cannot be produced validly, the
  //    whole request fails rather than showing half a case.
  try {
    const [first, second] = await generateTwoCandidates(inputs);

    return NextResponse.json({
      candidates: [first, second].map((candidate) => ({
        candidate,
        assembled: assembleScenario(candidate, inputs),
      })),
    });
  } catch (error) {
    console.error("Persona generation failed:", error);
    return NextResponse.json(
      {
        error:
          "Generation did not finish. Please try again. If it keeps failing, the request may be running out of time.",
      },
      { status: 500 },
    );
  }
}
