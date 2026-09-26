"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendOTP(e: React.FormEvent) {
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

      setInfo(res.message || `A 6-digit OTP has been sent to ${cleanEmail}. Check your inbox or console.`);
      setStep(2);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter your registered email address.");
      return;
    }
    if (cleanOtp.length < 4) {
      setError("Please enter the 6-digit OTP code sent to your email.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ message: string }>("/api/v1/auth/reset-password", {
        email: cleanEmail,
        otp: cleanOtp,
        new_password: newPassword,
      });

      router.push(`/login?msg=${encodeURIComponent(res.message || "Password updated successfully. Please log in.")}`);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Password reset failed. Please check your OTP and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Forgot Password"
      subtitle={
        step === 1
          ? "Enter your registered email address to receive a 6-digit password reset OTP."
          : "Enter the OTP code sent to your email along with your new password."
      }
    >
      {info && (
        <div className="mb-4 p-3 bg-indigo/10 border-l-4 border-indigo text-indigo text-xs font-medium rounded">
          {info}
        </div>
      )}

      <ErrorText message={error} />

      {step === 1 ? (
        <form onSubmit={handleSendOTP} className="space-y-4">
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
      ) : (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <Field
            label="Email Address"
            type="email"
            required
            placeholder="student@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="6-Digit Verification OTP"
            type="text"
            required
            maxLength={6}
            placeholder="Enter 6-digit code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          />
          <Field
            label="New Password"
            type="password"
            required
            minLength={6}
            placeholder="Enter new password (min 6 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Field
            label="Confirm New Password"
            type="password"
            required
            minLength={6}
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <div className="pt-2 flex flex-col gap-2">
            <SubmitButton loading={loading}>Reset Password & Log In</SubmitButton>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setError(null);
              }}
              className="text-xs text-slate hover:text-ink text-center underline py-1"
            >
              ← Back to enter email again
            </button>
          </div>
        </form>
      )}

      <p className="mt-6 text-sm text-slate text-center">
        Remembered your password?{" "}
        <Link href="/login" className="text-indigo font-semibold underline">
          Back to Login
        </Link>
      </p>
    </AuthShell>
  );
}

