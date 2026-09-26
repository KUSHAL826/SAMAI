"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, ApiError } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nameClean = form.name.trim();
    const emailClean = form.email.trim().toLowerCase();

    if (!nameClean) {
      setError("Full Name is required.");
      return;
    }
    if (!emailClean || !emailClean.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ message: string }>("/api/v1/auth/register", {
        name: nameClean,
        email: emailClean,
        password: form.password,
        confirm_password: form.confirmPassword,
      });

      // Redirect to Email Verification OTP page
      router.push(`/verify-email?email=${encodeURIComponent(emailClean)}&msg=${encodeURIComponent(res.message)}`);
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : err?.message || "Registration failed. Please check your inputs and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create Student Account"
      subtitle="Sign up for SamAI to access NEET, KCET and JEE practice tests."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorText message={error} />
        <Field
          label="Full Name"
          type="text"
          required
          placeholder="e.g. Rahul Sharma"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Field
          label="Email Address"
          type="email"
          required
          placeholder="e.g. student@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Field
          label="Password"
          type="password"
          required
          minLength={6}
          placeholder="Enter a password (min 6 characters)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Field
          label="Confirm Password"
          type="password"
          required
          minLength={6}
          placeholder="Re-enter your password"
          value={form.confirmPassword}
          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
        />

        <div className="pt-2">
          <SubmitButton loading={loading}>Sign Up & Send Email OTP</SubmitButton>
        </div>
      </form>

      <p className="mt-6 text-sm text-slate text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-indigo font-semibold underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
