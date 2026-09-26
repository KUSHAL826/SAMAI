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

  const [mode, setMode] = useState<"password" | "otp">("password");
  const [form, setForm] = useState({ name: "", password: "", email: "", otp: "" });
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(searchParams.get("msg") || null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const cleanInput = form.name.trim();

    try {
      const res = await api.post<{ access_token: string }>("/api/v1/auth/login", {
        name: cleanInput,
        email: cleanInput,
        password: form.password,
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

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const cleanEmail = form.email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid student email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ message: string }>("/api/v1/auth/request-login-otp", {
        email: cleanEmail,
      });
      setOtpSent(true);
      setInfo(res.message);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to send OTP email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const cleanEmail = form.email.trim().toLowerCase();
    const cleanOtp = form.otp.trim();

    if (!cleanOtp) {
      setError("Please enter the 6-digit OTP code sent to your email.");
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
      setError(err instanceof ApiError ? err.message : "Invalid or expired OTP code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Student Login" subtitle="Access your NEET, KCET & JEE test portal using Password or Email OTP.">
      {/* Mode Switcher */}
      <div className="flex border-b border-line mb-6">
        <button
          type="button"
          onClick={() => { setMode("password"); setError(null); setInfo(null); }}
          className={`flex-1 py-2 text-sm font-semibold border-b-2 text-center transition-colors ${
            mode === "password"
              ? "border-indigo text-indigo"
              : "border-transparent text-slate hover:text-ink"
          }`}
        >
          Password Login
        </button>
        <button
          type="button"
          onClick={() => { setMode("otp"); setError(null); setInfo(null); }}
          className={`flex-1 py-2 text-sm font-semibold border-b-2 text-center transition-colors ${
            mode === "otp"
              ? "border-indigo text-indigo"
              : "border-transparent text-slate hover:text-ink"
          }`}
        >
          Email OTP Login ✉️
        </button>
      </div>

      {info && (
        <div className="mb-4 p-3 bg-emerald-50 border-l-4 border-emerald-600 text-emerald-900 text-xs font-medium">
          {info}
        </div>
      )}

      {mode === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <ErrorText message={error} />
          <Field
            label="Student Email or Name"
            type="text"
            required
            placeholder="Enter your registered email or name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-sm font-medium text-ink">Password</span>
              <Link href="/forgot-password" className="text-xs text-indigo font-semibold hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              placeholder="Enter your password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-line bg-paper px-3 py-2 text-slate focus:border-indigo transition-colors"
            />
          </div>

          <div className="pt-2">
            <SubmitButton loading={loading}>Log in with Password</SubmitButton>
          </div>
        </form>
      ) : (
        <form onSubmit={otpSent ? handleVerifyOtpSubmit : handleSendOtp} className="space-y-4">
          <ErrorText message={error} />
          <Field
            label="Student Email Address"
            type="email"
            required
            disabled={otpSent}
            placeholder="e.g. student@gmail.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          {otpSent && (
            <div>
              <Field
                label="6-Digit Email Verification OTP Code"
                type="text"
                required
                maxLength={6}
                placeholder="Enter 6-digit code from email"
                value={form.otp}
                onChange={(e) => setForm({ ...form, otp: e.target.value })}
              />
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="text-xs text-indigo hover:underline font-semibold"
                >
                  Resend OTP Code
                </button>
              </div>
            </div>
          )}

          <div className="pt-2">
            <SubmitButton loading={loading}>
              {otpSent ? "Verify Code & Log In" : "Send Login OTP to Email"}
            </SubmitButton>
          </div>
        </form>
      )}

      <p className="mt-6 text-sm text-slate text-center">
        New student?{" "}
        <Link href="/signup" className="text-indigo font-semibold underline">
          Create a student account
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate">Loading login form...</div>}>
      <LoginForm />
    </Suspense>
  );
}
