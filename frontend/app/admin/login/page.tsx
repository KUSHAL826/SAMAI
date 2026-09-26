"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, saveToken, ApiError } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post<{ access_token: string }>("/api/v1/auth/admin/login", {
        identifier: identifier.trim(),
        password: password,
      });

      saveToken(res.access_token);
      router.push("/admin/upload");
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : err?.message || "Invalid Admin ID or password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="SamAI Admin Portal"
      subtitle="Enter administrator credentials to manage curriculum, patterns, and knowledge base documents."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorText message={error} />
        <Field
          label="Admin ID"
          type="text"
          required
          placeholder="Enter Admin ID"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <Field
          label="Admin Password"
          type="password"
          required
          placeholder="Enter Admin Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="pt-2">
          <SubmitButton loading={loading}>Admin Login</SubmitButton>
        </div>
      </form>
    </AuthShell>
  );
}
