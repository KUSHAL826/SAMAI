"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, clearToken, getToken, ApiError } from "@/lib/api";

type Student = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  is_verified: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api
      .get<Student>("/api/v1/auth/me", true)
      .then(setStudent)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.push("/login");
        } else {
          setError("Could not load your profile.");
        }
      });
  }, [router]);

  function handleLogout() {
    clearToken();
    router.push("/");
  }

  if (error) {
    return <p className="p-8 text-slate">{error}</p>;
  }

  if (!student) {
    return <p className="p-8 text-slate">Loading your dashboard…</p>;
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <Link href="/" className="font-serif text-2xl text-ink">
            SamAI
          </Link>
          <button onClick={handleLogout} className="text-sm text-slate hover:text-ink underline">
            Log out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-serif text-3xl text-ink">Welcome, {student.name}</h1>
        <p className="mt-2 text-slate">{student.email}</p>

        <div className="mt-10 grid sm:grid-cols-2 md:grid-cols-4 gap-6">
          {[
            ["Total exams", "0"],
            ["Average score", "—"],
            ["Best score", "—"],
            ["Accuracy", "—"],
          ].map(([label, value]) => (
            <div key={label} className="border-t-2 border-ink pt-3">
              <p className="text-sm text-slate">{label}</p>
              <p className="font-serif text-3xl text-ink mt-1">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid md:grid-cols-2 gap-8">
          <section className="border border-line p-6">
            <h2 className="font-serif text-xl text-ink mb-3">Continue preparation</h2>
            <p className="text-sm text-slate mb-4">
              Exam configuration and the CBT test-taking screen are the next
              piece to build — this dashboard is wired to your real account,
              but exam-taking isn&rsquo;t implemented yet.
            </p>
            <span className="inline-block text-sm text-slate/60 border border-line px-3 py-1">
              Coming soon
            </span>
          </section>

          <section className="border border-line p-6">
            <h2 className="font-serif text-xl text-ink mb-3">Weak topics</h2>
            <p className="text-sm text-slate">
              Once you&rsquo;ve completed an exam, topics that need more practice
              will appear here with a direct link to a focused practice set.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
