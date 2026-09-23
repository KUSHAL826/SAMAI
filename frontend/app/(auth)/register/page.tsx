"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, saveToken, ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ access_token: string }>("/api/v1/auth/register", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      saveToken(res.access_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : (err?.message || "Failed to create account. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create Student Account" subtitle="Enter your name, email, and password to get started.">
      <form onSubmit={handleSubmit}>
        <ErrorText message={error} />
        <Field
          label="Student Name"
          type="text"
          required
          placeholder="Enter your student name"
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
          minLength={4}
          placeholder="Enter a password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <SubmitButton loading={loading}>Create Account</SubmitButton>
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
