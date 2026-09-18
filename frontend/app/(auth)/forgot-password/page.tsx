"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/v1/auth/forgot-password", { email });
      router.push(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not process request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Forgot password" subtitle="Enter your email address to receive a 6-digit password reset code.">
      <form onSubmit={handleSubmit}>
        <ErrorText message={error} />
        <Field
          label="Email address"
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <SubmitButton loading={loading}>Send reset code</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-slate">
        Remember your password?{" "}
        <Link href="/login" className="text-indigo underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
