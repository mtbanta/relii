"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PRIVACY_VERSION, AGREEMENT_VERSION } from "@/lib/legal";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // PHASE 5: the consent click-through. Nothing here is the real enforcement,
  // see the block above supabase/phase-5-consent.sql section 2 and the comment
  // on the signUp call below.
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // The second of the three consent layers. The button below is disabled
    // until the box is ticked; this catches a submit that got past it (the
    // Enter key on a form is the ordinary way that happens). Neither of these
    // two is the real enforcement: the database is, and it refuses a signup
    // carrying no accepted version in the same transaction as the account.
    if (!accepted) {
      setError(
        "Please tick the box to accept the Pilot Agreement and the Privacy Policy.",
      );
      return;
    }

    setLoading(true);

    const supabase = createClient();

    // First, a friendly check: is this email on the invite list?
    const { data: allowed, error: checkError } = await supabase.rpc(
      "is_email_allowed",
      { check_email: email },
    );

    if (checkError) {
      setLoading(false);
      setError("Something went wrong. Please try again.");
      return;
    }

    if (!allowed) {
      setLoading(false);
      setError(
        "This email is not on the invite list. Please contact your instructor.",
      );
      return;
    }

    // On the list: create the account. (The database double-checks the invite.)
    //
    // ==> PHASE 5, AND THIS IS WHERE CONSENT ACTUALLY GETS RECORDED. The two
    //     accepted versions ride along as signup metadata, which means they are
    //     part of the SAME insert as the account itself. The signup trigger
    //     (supabase/phase-5-consent.sql) reads them, refuses the signup if
    //     either is missing, and writes the consent row inside that one
    //     transaction, so an account cannot exist without a consent record and
    //     the two cannot drift apart.
    //
    //     WHY IT IS DONE HERE RATHER THAN IN A ROUTE AFTER SIGNUP: this call
    //     goes STRAIGHT AT SUPABASE from the browser with the public anon key.
    //     Our server is not in the conversation at all. A route called after a
    //     successful signup would not merely be at risk of failing, it would be
    //     skippable, so a crafted request could create an account and never
    //     visit it. There is nothing to enforce a checkbox from except the
    //     database.
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          privacy_version: PRIVACY_VERSION,
          agreement_version: AGREEMENT_VERSION,
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-line-tertiary p-6 shadow-sm"
      >
        {/* PD-8g: the Beta designation, for the same reason it is on the login
            screen. This page has no header either, so it sits beside the name. */}
        <div className="text-center">
          <h1 className="inline-flex items-baseline gap-1.5 text-page-title font-medium">
            Relii
            <Badge tone="info">Beta</Badge>
          </h1>
          <p className="text-body text-content-secondary">Create your account</p>
        </div>

        <Label>
          Email
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)} className="mt-1"
          />
        </Label>

        {/* THE PASSWORD RULES BELOW MIRROR A SUPABASE DASHBOARD SETTING, and
            nothing in this codebase keeps the two in step. Authentication >
            Sign In / Up holds the real values: a minimum length of 8, and
            "Prevent use of leaked passwords" switched ON (every password is
            checked against HaveIBeenPwned). The minLength and the helper text
            here are a hand-kept copy of both. Change either setting in the
            dashboard and this page goes on stating the old rule: no build
            breaks, no test fails, and nobody is told. That is the same
            stale-copy pattern as the reset controls and the video item, where
            what is displayed is a copy of a fact that lives somewhere else.

            The error path is the backstop, and it is verified working (checked
            against the live project on 2026-08-04). Supabase answers a bad
            password with error_code weak_password and a message that names the
            reason, either "Password should be at least 8 characters." or
            "Password is known to be weak and easy to guess, please choose a
            different one." The handler above passes signUpError.message
            straight through instead of collapsing it into a generic failure.
            KEEP IT THAT WAY: someone whose password is rejected for being
            breached needs to be told why, not just told it failed. */}
        <Label>
          Password
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)} className="mt-1"
          />
          <span className="mt-1 block text-meta font-normal text-content-tertiary">
            <span className="block">At least 8 characters.</span>
            <span className="block">
              Common passwords are rejected, so choose something you do not use
              elsewhere.
            </span>
          </span>
        </Label>

        {/* PHASE 5: the consent click-through.
            THIS LABEL IS OURS AND IT IS DELIBERATELY SHORT. Tom's own
            acknowledgment sentence is the last line of the Pilot Agreement and
            it stays there, in full, on /agreement, where the page shows his text
            verbatim. It is not paraphrased into this label and this label is not
            a substitute for reading it: the two links below open the documents
            themselves, in a new tab so a half-filled form is not lost. Because
            this sentence is ours rather than reproduced, it follows the
            project's no-dash convention on its own. See lib/legal.ts. */}
        <div className="flex items-start gap-2">
          <input
            id="accept-terms"
            type="checkbox"
            required
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border border-line-secondary accent-accent-solid"
          />
          <label
            htmlFor="accept-terms"
            className="text-body text-content-secondary"
          >
            I have read and agree to the{" "}
            <Link
              href="/agreement"
              target="_blank"
              rel="noopener noreferrer"
              className="text-content-info underline"
            >
              Pilot Agreement
            </Link>{" "}
            and the{" "}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-content-info underline"
            >
              Privacy Policy
            </Link>
            .
          </label>
        </div>

        {error && <p className="text-body text-content-danger">{error}</p>}

        {/* The first of the three consent layers: the button is not clickable
            until the box is ticked. */}
        <Button
          fullWidth
          type="submit"
          disabled={loading || !accepted}
        >
          {loading ? "Creating account..." : "Create account"}
        </Button>

        <p className="text-center text-body text-content-secondary">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
