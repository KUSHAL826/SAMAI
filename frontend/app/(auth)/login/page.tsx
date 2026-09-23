"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, saveToken, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ access_token: string }>("/api/v1/auth/login", {
        name: form.name.trim(),
        password: form.password,
      });
      saveToken(res.access_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : (err?.message || "Could not log in. Please check your student name and password.")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Student Login" subtitle="Enter your student name and password to enter.">
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
          label="Password"
          type="password"
          required
          placeholder="Enter your password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <SubmitButton loading={loading}>Log in</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-slate">
        New student?{" "}
        <Link href="/register" className="text-indigo underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
