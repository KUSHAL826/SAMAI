"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, saveToken, ApiError } from "@/lib/api";

function VerifyLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ access_token: string }>("/api/v1/auth/verify-login-otp", {
        email,
        otp,
      });
      saveToken(res.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await api.post("/api/v1/auth/resend-otp", { email, purpose: "login" });
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resend the code.");
    }
  }

  return (
    <AuthShell title="Enter your login code" subtitle={`We sent a code to ${email || "your email"}.`}>
      <form onSubmit={handleSubmit}>
        <ErrorText message={error} />
        <Field
          label="6-digit code"
          required
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
        />
        <SubmitButton loading={loading}>Log in</SubmitButton>
      </form>
      <button onClick={handleResend} className="mt-6 text-sm text-indigo underline" type="button">
        {resent ? "Code sent again" : "Resend code"}
      </button>
    </AuthShell>
  );
}

export default function VerifyLoginPage() {
  return (
    <Suspense fallback={null}>
      <VerifyLoginForm />
    </Suspense>
  );
}
