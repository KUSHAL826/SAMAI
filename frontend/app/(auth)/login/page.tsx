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

  const [loginMethod, setLoginMethod] = useState<"PASSWORD" | "OTP">("PASSWORD");

  // Password Login state
  const [passwordForm, setPasswordForm] = useState({ name: "", password: "" });

  // OTP Login state
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<"REQUEST_OTP" | "VERIFY_OTP">("REQUEST_OTP");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(searchParams.get("msg") || null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Handle Password Submit
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const cleanInput = passwordForm.name.trim();

    try {
      const res = await api.post<{ access_token: string }>("/api/v1/auth/login", {
        name: cleanInput,
        email: cleanInput,
        password: passwordForm.password,
      });

      saveToken(res.access_token);
      router.push("/dashboard");
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403 && err.message.includes("verified")) {
        router.push(`/verify-email?email=${encodeURIComponent(cleanInput)}&msg=${encodeURIComponent(err.message)}`);
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : err?.message || "Could not log in. Please check your email/name and password."
      );
    } finally {
      setLoading(false);
    }
  }

  // Handle OTP Request
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
      setOtpStep("VERIFY_OTP");
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

  // Handle OTP Verification
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

  // Handle Resend OTP
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
      subtitle="Access your NEET, KCET & JEE examination portal."
    >
      {info && (
        <div className="mb-4 p-3 bg-emerald-50 border-l-4 border-emerald-600 text-emerald-900 text-xs font-medium rounded">
          {info}
        </div>
      )}

      {/* LOGIN METHOD TAB SWITCHER */}
      <div className="flex border-b border-line mb-5">
        <button
          type="button"
          onClick={() => {
            setLoginMethod("PASSWORD");
            setError(null);
          }}
          className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 ${
            loginMethod === "PASSWORD"
              ? "border-indigo text-indigo bg-indigo/5"
              : "border-transparent text-slate hover:text-ink"
          }`}
        >
          🔑 Login with Password
        </button>
        <button
          type="button"
          onClick={() => {
            setLoginMethod("OTP");
            setError(null);
          }}
          className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 ${
            loginMethod === "OTP"
              ? "border-indigo text-indigo bg-indigo/5"
              : "border-transparent text-slate hover:text-ink"
          }`}
        >
          📩 Login with Email OTP
        </button>
      </div>

      <ErrorText message={error} />

      {loginMethod === "PASSWORD" ? (
        /* PASSWORD LOGIN FORM */
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <Field
            label="Registered Student Email or Name"
            type="text"
            required
            placeholder="e.g. student@gmail.com or Student Name"
            value={passwordForm.name}
            onChange={(e) => setPasswordForm({ ...passwordForm, name: e.target.value })}
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-sm font-medium text-ink">Password</span>
              <Link href="/forgot-password" className="text-xs text-indigo font-bold hover:underline flex items-center gap-1">
                <span>🔑</span> Forgot Password?
              </Link>
            </div>
            <input
              type="password"
              required
              placeholder="Enter your password"
              value={passwordForm.password}
              onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
              className="w-full border border-line bg-paper px-3 py-2 text-slate focus:border-indigo transition-colors rounded"
            />
          </div>

          <div className="pt-2">
            <SubmitButton loading={loading}>Log in with Password</SubmitButton>
          </div>
        </form>
      ) : (
        /* EMAIL OTP LOGIN FORM */
        otpStep === "REQUEST_OTP" ? (
          <form onSubmit={handleRequestOTP} className="space-y-4">
            <Field
              label="Registered Email Address"
              type="email"
              required
              placeholder="e.g. student@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="pt-2">
              <SubmitButton loading={loading}>Send 6-Digit Email OTP</SubmitButton>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 flex justify-between items-center">
              <span>
                OTP sent to <strong>{email}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setOtpStep("REQUEST_OTP");
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
        )
      )}

      {/* ACTION FOOTER FOR NEW SIGNUP & FORGOT PASSWORD */}
      <div className="mt-6 pt-4 border-t border-line flex flex-col items-center gap-3 text-sm text-slate">
        <p>
          New student?{" "}
          <Link href="/signup" className="text-indigo font-semibold underline">
            Create a new student account (Email Verification)
          </Link>
        </p>
        <Link href="/forgot-password" className="text-xs text-indigo hover:underline font-semibold">
          Reset forgotten password via Email OTP →
        </Link>
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
