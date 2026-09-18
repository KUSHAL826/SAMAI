"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", mobile: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/v1/auth/register", form);
      router.push(`/verify-signup?email=${encodeURIComponent(form.email)}`);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : (err?.message || "Failed to connect to backend server. Please check CORS or API URL."));
    } finally {

      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start practicing for NEET, KCET or JEE.">
      <form onSubmit={handleSubmit}>
        <ErrorText message={error} />
        <Field
          label="Full name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Field
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Field
          label="Mobile number"
          required
          value={form.mobile}
          onChange={(e) => setForm({ ...form, mobile: e.target.value })}
        />
        <Field
          label="Password"
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <SubmitButton loading={loading}>Send verification code</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-slate">
        Already have an account?{" "}
        <Link href="/login" className="text-indigo underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
