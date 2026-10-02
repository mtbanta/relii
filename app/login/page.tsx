"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      setError("Email or password is incorrect.");
      return;
    }

    // Success: the home page will route them to the right place.
    //
    // ==> THIS IS A FULL PAGE LOAD ON PURPOSE, NOT router.push(). <== Next.js
    // keeps a list in the page's memory of where each link leads, and
    // router.refresh() does not clear it. If one background fetch of a link was
    // ever answered with "go to /login", that link kept leading to /login for
    // five minutes, with no request to the server, and signing in again through
    // router.push() left the list intact: the Roster bounce of 2026-10-02. A
    // full page load throws that memory away, so whatever sent somebody to this
    // page cannot follow them past it. The button stays on "Signing in..."
    // until the new page arrives.
    window.location.assign("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-line-tertiary p-6 shadow-sm"
      >
        {/* PD-8g: the Beta designation. The brief put it "next to the Relii
            wordmark in the header, on every page, both audiences"; this screen
            has no header, so it goes beside the name where the product names
            itself. It matters here more than anywhere: the login page is the
            first screen anyone sees. Same Badge primitive as the header, so it
            is the same pill. */}
        <div className="text-center">
          <h1 className="inline-flex items-baseline gap-1.5 text-page-title font-medium">
            Relii
            <Badge tone="info">Beta</Badge>
          </h1>
          <p className="text-body text-content-secondary">Sign in to your account</p>
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

        <Label>
          Password
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)} className="mt-1"
          />
        </Label>

        {error && <p className="text-body text-content-danger">{error}</p>}

        <Button
          fullWidth
          type="submit"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </Button>

        <p className="text-center text-body text-content-secondary">
          First time here?{" "}
          <Link href="/register" className="underline">
            Create your account
          </Link>
        </p>
      </form>
    </main>
  );
}
