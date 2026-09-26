"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, ApiError } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    searchParams.get("msg") || "Enter the reset code sent to your email and choose a new password."
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter your registered email address.");
      return;
    }
    if (cleanOtp.length < 4) {
      setError("Please enter the reset OTP code.");
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

      router.push(`/login?msg=${encodeURIComponent(res.message)}`);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Password reset failed. Please check your OTP and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset Password"
      subtitle="Set a new password for your SamAI student account."
    >
      {info && (
        <div className="mb-4 p-3 bg-indigo/10 border-l-4 border-indigo text-indigo text-xs font-medium">
          {info}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          label="Password Reset OTP"
          type="text"
          required
          maxLength={6}
          placeholder="Enter 6-digit reset code"
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

        <div className="pt-2">
          <SubmitButton loading={loading}>Reset Password & Log In</SubmitButton>
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate">Loading password reset...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
