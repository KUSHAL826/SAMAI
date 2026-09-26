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

  const [form, setForm] = useState({ name: "", password: "" });
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

  return (
    <AuthShell title="Student Portal Login" subtitle="Access your NEET, KCET & JEE test portal with your email and password.">
      {info && (
        <div className="mb-4 p-3 bg-emerald-50 border-l-4 border-emerald-600 text-emerald-900 text-xs font-medium rounded">
          {info}
        </div>
      )}

      <form onSubmit={handlePasswordSubmit} className="space-y-4">
        <ErrorText message={error} />
        <Field
          label="Registered Student Email or Name"
          type="text"
          required
          placeholder="e.g. student@gmail.com or Student Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
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
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border border-line bg-paper px-3 py-2 text-slate focus:border-indigo transition-colors"
          />
        </div>

        <div className="pt-2">
          <SubmitButton loading={loading}>Log in to Student Portal</SubmitButton>
        </div>
      </form>

      <div className="mt-6 pt-4 border-t border-line flex flex-col items-center gap-3 text-sm text-slate">
        <p>
          New student?{" "}
          <Link href="/signup" className="text-indigo font-semibold underline">
            Create a new student account
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
    <Suspense fallback={<div className="p-8 text-center text-slate">Loading login form...</div>}>
      <LoginForm />
    </Suspense>
  );
}
