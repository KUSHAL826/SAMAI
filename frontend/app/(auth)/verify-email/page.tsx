"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, saveToken, ApiError } from "@/lib/api";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    searchParams.get("msg") || "Enter the 6-digit OTP sent to your email address."
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter your registered email address.");
      return;
    }
    if (cleanOtp.length < 4) {
      setError("Please enter the complete verification OTP.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ access_token: string }>("/api/v1/auth/verify-signup-otp", {
        email: cleanEmail,
        otp: cleanOtp,
      });

      saveToken(res.access_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : err?.message || "Invalid or expired OTP. Please try again or request a new code."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0 || resending) return;
    setError(null);
    setSuccess(null);
    setResending(true);

    try {
      const res = await api.post<{ message: string }>("/api/v1/auth/resend-otp", {
        email: email.trim().toLowerCase(),
        purpose: "signup",
      });
      setSuccess(res.message);
      setCountdown(60);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to resend OTP. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      title="Verify Email Address"
      subtitle="Enter the 6-digit verification OTP code sent to your email."
    >
      {success && (
        <div className="mb-4 p-3 bg-emerald-50 border-l-4 border-emerald-600 text-emerald-900 text-xs font-medium">
          {success}
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <ErrorText message={error} />

        <Field
          label="Email Address"
          type="email"
          required
          placeholder="student@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Field
          label="Verification OTP Code"
          type="text"
          required
          maxLength={6}
          placeholder="Enter 6-digit OTP code"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        />

        <div className="pt-2 space-y-3">
          <SubmitButton loading={loading}>Verify Account & Activate</SubmitButton>

          <div className="flex items-center justify-between text-xs text-slate pt-2">
            <span>Didn't receive the email?</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={countdown > 0 || resending}
              className="font-semibold text-indigo hover:underline disabled:opacity-50"
            >
              {resending ? "Sending..." : countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
            </button>
          </div>
        </div>
      </form>

      <p className="mt-6 text-xs text-slate text-center">
        Need to change your email?{" "}
        <Link href="/signup" className="text-indigo font-semibold underline">
          Back to Signup
        </Link>
      </p>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate">Loading verification...</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
