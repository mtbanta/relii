"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
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

        {error && <p className="text-body text-content-danger">{error}</p>}

        <Button
          fullWidth
          type="submit"
          disabled={loading}
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
