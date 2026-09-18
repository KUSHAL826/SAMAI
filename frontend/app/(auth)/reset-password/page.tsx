"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, ApiError } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const defaultEmail = params.get("email") || "";

  const [form, setForm] = useState({
    email: defaultEmail,
    otp: "",
    new_password: "",
    confirm_password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.new_password.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    if (form.new_password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/v1/auth/reset-password", {
        email: form.email,
        otp: form.otp,
        new_password: form.new_password,
      });
      setSuccess("Password reset successfully! Redirecting to login...");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password reset failed. Check your code and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await api.post("/api/v1/auth/resend-otp", { email: form.email, purpose: "reset_password" });
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resend reset code.");
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle={`Enter the 6-digit code sent to ${form.email || "your email"} and set a new password.`}
    >
      <form onSubmit={handleSubmit}>
        <ErrorText message={error} />
        {success && <div className="p-3 mb-4 text-sm text-green-700 bg-green-50 rounded-lg">{success}</div>}
        <Field
          label="Email address"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Field
          label="6-digit reset code"
          required
          inputMode="numeric"
          maxLength={6}
          value={form.otp}
          onChange={(e) => setForm({ ...form, otp: e.target.value })}
        />
        <Field
          label="New Password"
          type="password"
          required
          placeholder="At least 8 characters"
          value={form.new_password}
          onChange={(e) => setForm({ ...form, new_password: e.target.value })}
        />
        <Field
          label="Confirm New Password"
          type="password"
          required
          placeholder="Re-enter new password"
          value={form.confirm_password}
          onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
        />
        <SubmitButton loading={loading}>Reset Password & Log In</SubmitButton>
      </form>

      <div className="mt-6 flex justify-between items-center text-sm">
        <button onClick={handleResend} className="text-indigo underline" type="button">
          {resent ? "Reset code sent again" : "Resend code"}
        </button>
        <Link href="/login" className="text-slate underline">
          Back to login
        </Link>
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
