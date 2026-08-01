"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
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
          <p className="text-sm text-content-secondary">Sign in to your account</p>
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

        {error && <p className="text-sm text-content-danger">{error}</p>}

        <Button
          fullWidth
          type="submit"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </Button>

        <p className="text-center text-sm text-content-secondary">
          First time here?{" "}
          <Link href="/register" className="underline">
            Create your account
          </Link>
        </p>
      </form>
    </main>
  );
}
