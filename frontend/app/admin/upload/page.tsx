"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Field, SubmitButton, ErrorText } from "@/components/FormControls";
import { api, ApiError } from "@/lib/api";

type ExamType = { id: string; code: string; name: string };
type Subject = { id: string; exam_type_id: string; name: string };
type Chapter = { id: string; subject_id: string; name: string };
type Topic = { id: string; chapter_id: string; name: string };

const DOCUMENT_TYPES = [
  ["table_of_contents", "Table of Contents"],
  ["textbook", "Textbook / Study Material"],
  ["explanation", "Explanation"],
  ["exam_pattern", "Exam Pattern"],
  ["sample_questions", "Sample Questions"],
  ["sample_question_paper", "Sample Question Paper"],
];

function QuickCreate({
  label,
  placeholder,
  onCreate,
}: {
  label: string;
  placeholder: string;
  onCreate: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onCreate(value.trim());
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2 mt-2">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 border border-line bg-paper px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="px-3 py-2 text-sm border border-ink text-ink hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
      >
        + Add {label}
      </button>
    </div>
  );
}

export default function AdminUploadPage() {
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);

  const [examTypeId, setExamTypeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[1][0]);
  const [file, setFile] = useState<File | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  async function refreshExamTypes() {
    setExamTypes(await api.get<ExamType[]>("/api/v1/admin/exam-types"));
  }
  async function refreshSubjects(examId: string) {
    setSubjects(examId ? await api.get<Subject[]>(`/api/v1/admin/subjects?exam_type_id=${examId}`) : []);
  }
  async function refreshChapters(subjId: string) {
    setChapters(subjId ? await api.get<Chapter[]>(`/api/v1/admin/chapters?subject_id=${subjId}`) : []);
  }
  async function refreshTopics(chapId: string) {
    setTopics(chapId ? await api.get<Topic[]>(`/api/v1/admin/topics?chapter_id=${chapId}`) : []);
  }

  useEffect(() => {
    refreshExamTypes().catch(() => setError("Could not reach the SamAI API."));
  }, []);
  useEffect(() => {
    setSubjectId("");
    setChapters([]);
    setChapterId("");
    setTopics([]);
    setTopicId("");
    refreshSubjects(examTypeId);
  }, [examTypeId]);
  useEffect(() => {
    setChapterId("");
    setTopics([]);
    setTopicId("");
    refreshChapters(subjectId);
  }, [subjectId]);
  useEffect(() => {
    setTopicId("");
    refreshTopics(chapterId);
  }, [chapterId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (!file || !examTypeId) {
      setError("Choose an exam and a file before uploading.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("exam_type_id", examTypeId);
      formData.append("document_type", documentType);
      if (subjectId) formData.append("subject_id", subjectId);
      if (chapterId) formData.append("chapter_id", chapterId);
      if (topicId) formData.append("topic_id", topicId);

      const res = await api.post<{ document: { id: string }; message: string }>(
        "/api/v1/admin/documents/upload",
        formData
      );
      setStatus({ message: res.message, document_id: res.document.id });
      pollStatus(res.document.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function pollStatus(documentId: string) {
    const interval = setInterval(async () => {
      try {
        const s = await api.get<Record<string, unknown>>(
          `/api/v1/admin/documents/${documentId}/status`
        );
        setStatus(s);
        if (s.document_status === "ready" || s.document_status === "failed") {
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto max-w-4xl px-6 py-5 flex items-center justify-between">
          <Link href="/" className="font-serif text-2xl text-ink">
            SamAI <span className="text-base text-slate/60">Admin</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-serif text-3xl text-ink">Upload approved content</h1>
        <p className="mt-2 text-slate max-w-prose">
          Every question SamAI generates traces back to something uploaded
          here. Set up the curriculum path, then attach a file.
        </p>

        <form onSubmit={handleUpload} className="mt-10 border border-line p-6 sm:p-8">
          <ErrorText message={error} />

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Exam</label>
              <select
                value={examTypeId}
                onChange={(e) => setExamTypeId(e.target.value)}
                className="w-full border border-line bg-paper px-3 py-2"
              >
                <option value="">Select an exam</option>
                {examTypes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.code})
                  </option>
                ))}
              </select>
              <QuickCreate
                label="exam"
                placeholder="e.g. NEET"
                onCreate={async (name) => {
                  await api.post("/api/v1/admin/exam-types", { code: name, name });
                  await refreshExamTypes();
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Document type</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full border border-line bg-paper px-3 py-2"
              >
                {DOCUMENT_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Subject (optional)</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={!examTypeId}
                className="w-full border border-line bg-paper px-3 py-2 disabled:opacity-50"
              >
                <option value="">None</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {examTypeId && (
                <QuickCreate
                  label="subject"
                  placeholder="e.g. Physics"
                  onCreate={async (name) => {
                    await api.post("/api/v1/admin/subjects", { exam_type_id: examTypeId, name });
                    await refreshSubjects(examTypeId);
                  }}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Chapter (optional)</label>
              <select
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                disabled={!subjectId}
                className="w-full border border-line bg-paper px-3 py-2 disabled:opacity-50"
              >
                <option value="">None</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {subjectId && (
                <QuickCreate
                  label="chapter"
                  placeholder="e.g. Kinematics"
                  onCreate={async (name) => {
                    await api.post("/api/v1/admin/chapters", { subject_id: subjectId, name });
                    await refreshChapters(subjectId);
                  }}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Topic (optional)</label>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                disabled={!chapterId}
                className="w-full border border-line bg-paper px-3 py-2 disabled:opacity-50"
              >
                <option value="">None</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {chapterId && (
                <QuickCreate
                  label="topic"
                  placeholder="e.g. Motion in a Straight Line"
                  onCreate={async (name) => {
                    await api.post("/api/v1/admin/topics", { chapter_id: chapterId, name });
                    await refreshTopics(chapterId);
                  }}
                />
              )}
            </div>
          </div>

          <div className="mt-6">
            <Field
              label="File (PDF, DOCX, TXT, CSV, XLS, XLSX)"
              type="file"
              accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="mt-2">
            <SubmitButton loading={uploading}>Upload and process</SubmitButton>
          </div>
        </form>

        {status && (
          <div className="mt-8 border border-line p-6">
            <h2 className="font-medium text-ink mb-2">Processing status</h2>
            <pre className="text-xs text-slate whitespace-pre-wrap break-words">
              {JSON.stringify(status, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
