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

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ message: string }>("/api/v1/auth/forgot-password", {
        email: cleanEmail,
      });

      router.push(`/reset-password?email=${encodeURIComponent(cleanEmail)}&msg=${encodeURIComponent(res.message)}`);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to process request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Forgot Password"
      subtitle="Enter your registered email address to receive a password reset code."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorText message={error} />
        <Field
          label="Registered Email Address"
          type="email"
          required
          placeholder="e.g. student@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="pt-2">
          <SubmitButton loading={loading}>Send Password Reset OTP</SubmitButton>
        </div>
      </form>

      <p className="mt-6 text-sm text-slate text-center">
        Remembered your password?{" "}
        <Link href="/login" className="text-indigo font-semibold underline">
          Back to Login
        </Link>
      </p>
    </AuthShell>
  );
}
