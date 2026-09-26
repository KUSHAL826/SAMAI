"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, saveToken, ApiError } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({ name: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(searchParams.get("msg") || null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
        // Unverified email -> redirect to verify-email
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

  return (
    <AuthShell title="Student Login" subtitle="Enter your student email or name and password to enter.">
      {info && (
        <div className="mb-4 p-3 bg-emerald-50 border-l-4 border-emerald-600 text-emerald-900 text-xs font-medium">
          {info}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <SubmitButton loading={loading}>Log in to Portal</SubmitButton>
        </div>
      </form>

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
