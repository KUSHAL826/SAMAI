"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, saveToken, ApiError } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"REQUEST_OTP" | "VERIFY_OTP">("REQUEST_OTP");
  
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(searchParams.get("msg") || null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ message: string }>("/api/v1/auth/request-login-otp", {
        email: cleanEmail,
      });
      setInfo(res.message || `A 6-digit OTP code has been dispatched to ${cleanEmail}.`);
      setStep("VERIFY_OTP");
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : err?.message || "Failed to send OTP email. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    if (!cleanOtp || cleanOtp.length < 4) {
      setError("Please enter the complete 6-digit OTP sent to your email.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ access_token: string }>("/api/v1/auth/verify-login-otp", {
        email: cleanEmail,
        otp: cleanOtp,
      });

      saveToken(res.access_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : err?.message || "Invalid or expired OTP. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOTP() {
    setError(null);
    setResending(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      const res = await api.post<{ message: string }>("/api/v1/auth/resend-otp", {
        email: cleanEmail,
        purpose: "login",
      });
      setInfo(res.message || "A new 6-digit login OTP code has been sent to your email.");
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to resend OTP.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      title="Student Portal Login"
      subtitle="Login securely using your email address and a one-time verification code (OTP)."
    >
      {info && (
        <div className="mb-4 p-3 bg-emerald-50 border-l-4 border-emerald-600 text-emerald-900 text-xs font-medium rounded">
          {info}
        </div>
      )}

      {step === "REQUEST_OTP" ? (
        <form onSubmit={handleRequestOTP} className="space-y-4">
          <ErrorText message={error} />
          <Field
            label="Registered Email Address"
            type="email"
            required
            placeholder="e.g. student@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="pt-2">
            <SubmitButton loading={loading}>Get 6-Digit Login OTP</SubmitButton>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifyOTP} className="space-y-4">
          <ErrorText message={error} />

          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 flex justify-between items-center">
            <span>
              OTP sent to <strong>{email}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setStep("REQUEST_OTP");
                setOtp("");
                setError(null);
              }}
              className="text-indigo-600 font-semibold underline hover:text-indigo-800"
            >
              Change Email
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              6-Digit One-Time Password (OTP)
            </label>
            <input
              type="text"
              required
              maxLength={6}
              placeholder="Enter 6-digit OTP code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="w-full text-center tracking-[0.5em] text-xl font-mono border border-line bg-paper px-3 py-2 text-slate focus:border-indigo transition-colors rounded"
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-500">Didn't receive code?</span>
            <button
              type="button"
              disabled={resending}
              onClick={handleResendOTP}
              className="text-indigo-600 font-bold hover:underline disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend OTP"}
            </button>
          </div>

          <div className="pt-2">
            <SubmitButton loading={loading}>Verify & Login</SubmitButton>
          </div>
        </form>
      )}

      <div className="mt-6 pt-4 border-t border-line flex flex-col items-center gap-3 text-sm text-slate">
        <p>
          New student?{" "}
          <Link href="/signup" className="text-indigo font-semibold underline">
            Create a new student account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate">Loading login portal...</div>}>
      <LoginForm />
    </Suspense>
  );
}
