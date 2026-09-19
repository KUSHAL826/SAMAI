"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, saveToken, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ access_token: string }>("/api/v1/auth/login", form);
      saveToken(res.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Log in" subtitle="Enter your email and password to access your dashboard.">
      <form onSubmit={handleSubmit}>
        <ErrorText message={error} />
        <Field
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <div className="flex justify-between items-center mb-1 mt-3">
          <span className="text-sm font-medium text-slate">Password</span>
          <Link href="/forgot-password" className="text-xs text-indigo underline">
            Forgot password?
          </Link>
        </div>
        <Field
          label=""
          type="password"
          required
          placeholder="Enter your password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <SubmitButton loading={loading}>Log in</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-slate">
        New to SamAI?{" "}
        <Link href="/register" className="text-indigo underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
