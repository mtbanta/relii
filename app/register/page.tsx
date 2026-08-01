"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

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
        <div className="text-center">
          <h1 className="text-page-title font-semibold">Relii</h1>
          <p className="text-sm text-content-secondary">Create your account</p>
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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)} className="mt-1"
          />
          <span className="mt-1 block text-xs font-normal text-content-tertiary">
            At least 6 characters.
          </span>
        </Label>

        {error && <p className="text-sm text-content-danger">{error}</p>}

        <Button
          fullWidth
          type="submit"
          disabled={loading}
        >
          {loading ? "Creating account..." : "Create account"}
        </Button>

        <p className="text-center text-sm text-content-secondary">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
