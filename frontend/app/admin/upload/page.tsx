"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, getToken, clearToken, isAdminToken } from "@/lib/api";

type ExamType = { id: string; code: string; name: string };
type Subject = { id: string; exam_type_id: string; name: string };
type Chapter = { id: string; subject_id: string; name: string };
type Topic = { id: string; chapter_id: string; name: string };

type DocumentItem = {
  id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  exam_type_id: string;
  subject_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  document_type: string;
  version: number;
  status: string;
  created_at: string;
};

type ExamPatternItem = {
  id: string;
  name: string;
  exam_type_id: string;
  duration_minutes: number;
  total_questions: number;
  total_marks: number;
  positive_marks: number;
  negative_marks: number;
  questions_per_subject: Record<string, number>;
  is_active: boolean;
};

const DOCUMENT_TYPES = [
  { value: "textbook", label: "Textbook / Study Material", desc: "Core reference material & syllabus content" },
  { value: "explanation", label: "Detailed Explanation", desc: "Concept deep dives and worked solutions" },
  { value: "table_of_contents", label: "Table of Contents", desc: "Curriculum structure & topic hierarchy" },
  { value: "sample_question_paper", label: "Full Length Mock Paper (College/Exam)", desc: "Complete multi-subject question papers" },
  { value: "sample_questions", label: "Sample Questions Bank", desc: "Curated question banks for practice" },
  { value: "exam_pattern", label: "Exam Pattern Specification", desc: "Question distributions & marking schemes" },
];

export default function AdminKnowledgeBasePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"full_mock" | "upload" | "patterns" | "library">("full_mock");

  // Curriculum & System Data
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [patterns, setPatterns] = useState<ExamPatternItem[]>([]);

  // --- Form 1: Full-Length Mock Paper Upload (No Topic Required) ---
  const [mockScope, setMockScope] = useState<"complete" | "subject">("complete");
  const [mockSubjectId, setMockSubjectId] = useState<string>("");
  const [mockSelectedExamIds, setMockSelectedExamIds] = useState<string[]>([]);
  const [mockPaperTitle, setMockPaperTitle] = useState<string>("");
  const [mockFile, setMockFile] = useState<File | null>(null);

  // --- Form 2: Course Content / Textbook Upload (Topic Level) ---
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [newChapterName, setNewChapterName] = useState("");
  const [addingChapter, setAddingChapter] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [newTopicName, setNewTopicName] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [contentNameOverride, setContentNameOverride] = useState("");
  const [documentType, setDocumentType] = useState("textbook");
  const [file, setFile] = useState<File | null>(null);

  // --- Form 3: Exam Pattern Builder ---
  const [patExamTypeId, setPatExamTypeId] = useState<string>("");
  const [patName, setPatName] = useState<string>("");
  const [patDuration, setPatDuration] = useState<number>(180);
  const [patTotalQs, setPatTotalQs] = useState<number>(180);
  const [patTotalMarks, setPatTotalMarks] = useState<number>(720);
  const [patPosMarks, setPatPosMarks] = useState<number>(4.0);
  const [patNegMarks, setPatNegMarks] = useState<number>(-1.0);
  const [patSubjPhy, setPatSubjPhy] = useState<number>(45);
  const [patSubjChem, setPatSubjChem] = useState<number>(45);
  const [patSubjBio, setPatSubjBio] = useState<number>(90);
  const [patSubjMath, setPatSubjMath] = useState<number>(0);
  const [savingPattern, setSavingPattern] = useState(false);

  // State Feedback
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  // --- Initial Data Load ---
  async function loadInitialData() {
    if (!isAdminToken()) {
      clearToken();
      router.push("/admin/login");
      return;
    }
    try {
      const [examsData, subjectsData, docsData, patternsData] = await Promise.all([
        api.get<ExamType[]>("/api/v1/admin/exam-types", true),
        api.get<Subject[]>("/api/v1/admin/subjects", true),
        api.get<DocumentItem[]>("/api/v1/admin/documents", true),
        api.get<ExamPatternItem[]>("/api/v1/admin/patterns", true).catch(() => []),
      ]);
      setExamTypes(examsData);
      setSubjects(subjectsData);
      setDocuments(docsData);
      setPatterns(patternsData);

      if (examsData.length > 0) {
        if (selectedExamIds.length === 0) setSelectedExamIds([examsData[0].id]);
        if (mockSelectedExamIds.length === 0) setMockSelectedExamIds([examsData[0].id]);
        if (!patExamTypeId) setPatExamTypeId(examsData[0].id);
      }
    } catch (err: any) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearToken();
        router.push("/admin/login");
      } else {
        setError("Could not connect to SamAI backend service. Make sure backend is running.");
      }
    }
  }

  useEffect(() => {
    if (!isAdminToken()) {
      clearToken();
      router.push("/admin/login");
      return;
    }
    loadInitialData();
  }, []);

  // --- Cascade Content when Subject changes ---
  useEffect(() => {
    if (!selectedSubjectId) {
      setChapters([]);
      setSelectedChapterId("");
      setTopics([]);
      setSelectedTopicId("");
      return;
    }
    setSelectedChapterId("");
    setTopics([]);
    setSelectedTopicId("");
    api.get<Chapter[]>(`/api/v1/admin/chapters?subject_id=${selectedSubjectId}`, true)
      .then((data) => setChapters(data))
      .catch(() => setChapters([]));
  }, [selectedSubjectId]);

  // --- Cascade Topics when Chapter changes ---
  useEffect(() => {
    if (!selectedChapterId) {
      setTopics([]);
      setSelectedTopicId("");
      return;
    }
    setSelectedTopicId("");
    api.get<Topic[]>(`/api/v1/admin/topics?chapter_id=${selectedChapterId}`, true)
      .then((data) => setTopics(data))
      .catch(() => setTopics([]));
  }, [selectedChapterId]);

  // --- Quick Handlers ---
  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    setAddingSubject(true);
    setError(null);
    try {
      const defaultExamId = selectedExamIds[0] || (examTypes[0]?.id ?? null);
      const newSubj = await api.post<Subject>("/api/v1/admin/subjects", {
        name: newSubjectName.trim(),
        exam_type_id: defaultExamId,
      }, true);
      const updatedSubs = await api.get<Subject[]>("/api/v1/admin/subjects", true);
      setSubjects(updatedSubs);
      setSelectedSubjectId(newSubj.id);
      setNewSubjectName("");
      setSuccessMessage(`Subject "${newSubj.name}" created successfully.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create subject.");
    } finally {
      setAddingSubject(false);
    }
  }

  async function handleAddChapter(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSubjectId || !newChapterName.trim()) return;
    setAddingChapter(true);
    setError(null);
    try {
      const newChap = await api.post<Chapter>("/api/v1/admin/chapters", {
        subject_id: selectedSubjectId,
        name: newChapterName.trim(),
      }, true);
      const updatedChaps = await api.get<Chapter[]>(
        `/api/v1/admin/chapters?subject_id=${selectedSubjectId}`,
        true
      );
      setChapters(updatedChaps);
      setSelectedChapterId(newChap.id);
      setContentNameOverride(newChap.name);
      setNewChapterName("");
      setSuccessMessage(`Content item "${newChap.name}" added under subject.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add content item.");
    } finally {
      setAddingChapter(false);
    }
  }

  // --- Upload Handler 1: FULL MOCK PAPER (NO TOPIC INPUT) ---
  async function handleUploadFullMockPaper(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setStatus(null);

    if (mockSelectedExamIds.length === 0) {
      setError("Please select at least one target exam.");
      return;
    }
    if (!mockFile) {
      setError("Please choose a full mock paper file to upload.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", mockFile);
      formData.append("exam_type_ids", mockSelectedExamIds.join(","));
      formData.append("document_type", "sample_question_paper");
      if (mockScope === "subject" && mockSubjectId) {
        formData.append("subject_id", mockSubjectId);
      }

      const res = await api.post<{
        document: { id: string };
        message: string;
      }>("/api/v1/admin/documents/upload", formData, true);

      setStatus({
        message: res.message,
        document_id: res.document.id,
        exam_count: mockSelectedExamIds.length,
      });

      setSuccessMessage(
        `Full length mock paper "${mockPaperTitle || mockFile.name}" indexed for ${mockSelectedExamIds.length} target exam(s)! Used strictly for complete college paper generation.`
      );

      pollStatus(res.document.id);
      loadInitialData();
      setMockFile(null);
      setMockPaperTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Full mock paper upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // --- Upload Handler 2: COURSE CONTENT / TEXTBOOK ---
  async function handleUploadCourseContent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setStatus(null);

    if (!selectedSubjectId) {
      setError("Please select or add a subject first.");
      return;
    }
    if (selectedExamIds.length === 0) {
      setError("Please select at least one exam.");
      return;
    }
    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("exam_type_ids", selectedExamIds.join(","));
      formData.append("document_type", documentType);
      if (selectedSubjectId) formData.append("subject_id", selectedSubjectId);
      if (selectedChapterId) formData.append("chapter_id", selectedChapterId);
      if (selectedTopicId) formData.append("topic_id", selectedTopicId);

      const res = await api.post<{
        document: { id: string };
        message: string;
      }>("/api/v1/admin/documents/upload", formData, true);

      setStatus({
        message: res.message,
        document_id: res.document.id,
        exam_count: selectedExamIds.length,
      });

      setSuccessMessage(
        `Course content uploaded for ${selectedExamIds.length} exam(s)! Knowledge base training in progress.`
      );

      pollStatus(res.document.id);
      loadInitialData();
      setFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Document upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // --- Save Exam Pattern Handler ---
  async function handleSavePattern(e: React.FormEvent) {
    e.preventDefault();
    if (!patExamTypeId || !patName.trim()) {
      setError("Please select an exam type and enter a pattern name.");
      return;
    }
    setSavingPattern(true);
    setError(null);
    try {
      const qps: Record<string, number> = {};
      if (patSubjPhy > 0) qps["Physics"] = patSubjPhy;
      if (patSubjChem > 0) qps["Chemistry"] = patSubjChem;
      if (patSubjBio > 0) qps["Biology"] = patSubjBio;
      if (patSubjMath > 0) qps["Mathematics"] = patSubjMath;

      await api.post<ExamPatternItem>("/api/v1/admin/patterns", {
        exam_type_id: patExamTypeId,
        name: patName.trim(),
        duration_minutes: patDuration,
        total_questions: patTotalQs,
        total_marks: patTotalMarks,
        positive_marks: patPosMarks,
        negative_marks: patNegMarks,
        questions_per_subject: qps,
        difficulty_distribution: { easy: 0.3, moderate: 0.5, difficult: 0.2 },
        question_type_distribution: { mcq_single: 1.0 },
      }, true);

      setSuccessMessage(`Exam Pattern "${patName}" saved successfully! Questions will be generated following this structure.`);
      loadInitialData();
      setPatName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save exam pattern.");
    } finally {
      setSavingPattern(false);
    }
  }

  function pollStatus(documentId: string) {
    const interval = setInterval(async () => {
      try {
        const s = await api.get<Record<string, unknown>>(
          `/api/v1/admin/documents/${documentId}/status`,
          true
        );
        setStatus(s);
        if (s.document_status === "ready" || s.document_status === "failed") {
          clearInterval(interval);
          loadInitialData();
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
  }

  function toggleMockExamSelection(examId: string) {
    setMockSelectedExamIds((prev) =>
      prev.includes(examId) ? prev.filter((id) => id !== examId) : [...prev, examId]
    );
  }

  function toggleExamSelection(examId: string) {
    setSelectedExamIds((prev) =>
      prev.includes(examId) ? prev.filter((id) => id !== examId) : [...prev, examId]
    );
  }

  return (
    <main className="min-h-screen bg-paper text-ink font-sans pb-20">
      {/* ORGANIZED ADMIN MENU BAR */}
      <header className="border-b border-line bg-paper sticky top-0 z-20 shadow-sm">
        <div className="mx-auto max-w-6xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-ink hover:opacity-80">
              SamAI <span className="text-xs font-sans font-normal bg-indigo text-paper px-2 py-0.5 rounded">Admin Portal</span>
            </Link>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab("full_mock")}
              className={`px-3 py-2 text-xs font-bold rounded transition-all whitespace-nowrap ${
                activeTab === "full_mock" ? "bg-indigo text-paper shadow" : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              📑 Upload Full Mock Papers
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-3 py-2 text-xs font-bold rounded transition-all whitespace-nowrap ${
                activeTab === "upload" ? "bg-indigo text-paper shadow" : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              📥 Upload Course Content
            </button>
            <button
              onClick={() => setActiveTab("patterns")}
              className={`px-3 py-2 text-xs font-bold rounded transition-all whitespace-nowrap ${
                activeTab === "patterns" ? "bg-indigo text-paper shadow" : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              ⚙️ Exam Patterns & Structure
            </button>
            <button
              onClick={() => setActiveTab("library")}
              className={`px-3 py-2 text-xs font-bold rounded transition-all whitespace-nowrap ${
                activeTab === "library" ? "bg-indigo text-paper shadow" : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              📚 Indexed Library ({documents.length})
            </button>
          </nav>
        </div>
      </header>

      {/* Page Content Container */}
      <div className="mx-auto max-w-5xl px-6 pt-8">
        {/* Title Banner */}
        <div className="mb-8 border-b border-line pb-6">
          <h1 className="font-serif text-3xl font-bold text-ink">
            {activeTab === "full_mock"
              ? "Full Length Mock Paper Training Studio"
              : activeTab === "upload"
              ? "Course Content & Textbook Ingestion"
              : activeTab === "patterns"
              ? "Official Exam Patterns & Marking Schemes"
              : "Indexed Knowledge Base Library"}
          </h1>
          <p className="mt-2 text-slate text-sm max-w-3xl leading-relaxed">
            {activeTab === "full_mock"
              ? "Upload complete multi-subject question papers or subject mock papers without topic input. These papers are strictly indexed to generate full-length mock tests for colleges & institutes."
              : activeTab === "upload"
              ? "Upload detailed syllabus textbooks, topic study materials, and concept chapters."
              : activeTab === "patterns"
              ? "Define total questions, duration, negative marking rules, and subject question distributions for NEET, KCET, and JEE."
              : "Review all indexed textbooks and full mock papers stored in SamAI's pgvector RAG store."}
          </p>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-600 text-red-800 text-sm flex items-start justify-between">
            <div>
              <strong className="font-semibold block mb-0.5">Action Required</strong>
              {error}
            </div>
            <button onClick={() => setError(null)} className="text-red-600 font-bold hover:text-red-900 ml-4">
              &times;
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border-l-4 border-emerald-600 text-emerald-900 text-sm flex items-start justify-between">
            <div>
              <strong className="font-semibold block mb-0.5">Success</strong>
              {successMessage}
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 font-bold hover:text-emerald-950 ml-4">
              &times;
            </button>
          </div>
        )}

        {/* TAB 1: FULL MOCK PAPER UPLOAD (NO TOPIC INPUT REQUIRED) */}
        {activeTab === "full_mock" ? (
          <div className="space-y-8">
            <form onSubmit={handleUploadFullMockPaper} className="space-y-8">
              {/* Scope Selection */}
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-4 border-b border-line/60 pb-3">
                  <h2 className="text-lg font-bold font-serif text-ink">
                    1. Select Scope (No Topic Required)
                  </h2>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  <div
                    onClick={() => setMockScope("complete")}
                    className={`cursor-pointer p-4 border transition-all ${
                      mockScope === "complete"
                        ? "border-indigo bg-indigo/10 text-indigo font-bold ring-1 ring-indigo"
                        : "border-line bg-white text-slate hover:border-ink"
                    }`}
                  >
                    <span className="text-base block mb-1">🎓 Complete Exam (Multi-Subject Mock)</span>
                    <span className="text-xs font-normal text-slate block leading-relaxed">
                      Upload complete paper covering Physics, Chemistry, Biology & Math combined.
                    </span>
                  </div>

                  <div
                    onClick={() => setMockScope("subject")}
                    className={`cursor-pointer p-4 border transition-all ${
                      mockScope === "subject"
                        ? "border-indigo bg-indigo/10 text-indigo font-bold ring-1 ring-indigo"
                        : "border-line bg-white text-slate hover:border-ink"
                    }`}
                  >
                    <span className="text-base block mb-1">📘 Entire Single Subject Mock Paper</span>
                    <span className="text-xs font-normal text-slate block leading-relaxed">
                      Upload complete subject-wide question paper (e.g., Full Physics Mock Paper).
                    </span>
                  </div>
                </div>

                {mockScope === "subject" && (
                  <div>
                    <label className="block text-xs font-bold text-ink uppercase mb-2">Select Subject</label>
                    <select
                      value={mockSubjectId}
                      onChange={(e) => setMockSubjectId(e.target.value)}
                      className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                    >
                      <option value="">Choose Subject...</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </section>

              {/* Target Exams Selection */}
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm">
                <h2 className="text-lg font-bold font-serif text-ink mb-4 pb-2 border-b border-line/60">
                  2. Choose Target Exam(s)
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {examTypes.map((exam) => {
                    const isChecked = mockSelectedExamIds.includes(exam.id);
                    return (
                      <div
                        key={exam.id}
                        onClick={() => toggleMockExamSelection(exam.id)}
                        className={`cursor-pointer p-4 border transition-all flex flex-col justify-between ${
                          isChecked
                            ? "border-indigo bg-indigo text-paper shadow-sm"
                            : "border-line bg-white text-ink hover:border-ink"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-base font-serif">{exam.code}</span>
                          <input type="checkbox" checked={isChecked} onChange={() => {}} className="w-4 h-4 accent-amber" />
                        </div>
                        <span className={`text-xs ${isChecked ? "text-paper/80" : "text-slate"}`}>{exam.name}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* File Attachment & Title */}
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm">
                <h2 className="text-lg font-bold font-serif text-ink mb-4 pb-2 border-b border-line/60">
                  3. Upload Full Length Paper File
                </h2>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-ink mb-1">Paper Title / Description</label>
                  <input
                    type="text"
                    value={mockPaperTitle}
                    onChange={(e) => setMockPaperTitle(e.target.value)}
                    placeholder="e.g. NEET 2026 Full Length College Mock Test Paper - Set A"
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-ink mb-2">Attach Mock Paper File (.pdf, .docx, .txt)</label>
                  <div className="border-2 border-dashed border-line bg-white p-6 text-center hover:border-indigo transition-colors relative">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.csv"
                      onChange={(e) => setMockFile(e.target.files?.[0] ?? null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="space-y-2">
                      <span className="text-2xl block">📄</span>
                      <p className="text-sm font-medium text-ink">
                        {mockFile ? mockFile.name : "Click or drag & drop full length paper file"}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={uploading || !mockFile || mockSelectedExamIds.length === 0}
                  className="w-full bg-indigo text-paper py-3.5 px-6 font-bold text-base hover:bg-ink transition-colors disabled:opacity-50 shadow"
                >
                  {uploading
                    ? "Indexing Full Length Mock Paper..."
                    : `🚀 Upload & Train Full Length Paper (${mockSelectedExamIds.length} Exam${mockSelectedExamIds.length > 1 ? "s" : ""})`}
                </button>
              </section>
            </form>
          </div>
        ) : activeTab === "patterns" ? (
          /* TAB 3: EXAM PATTERNS & STRUCTURE BUILDER */
          <div className="space-y-8">
            <form onSubmit={handleSavePattern} className="border border-line bg-paper p-6 sm:p-8 shadow-sm space-y-6">
              <h2 className="text-xl font-bold font-serif text-ink border-b border-line pb-3">
                Configure Official Exam Pattern & Marking Scheme
              </h2>

              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-1">Target Exam</label>
                  <select
                    value={patExamTypeId}
                    onChange={(e) => setPatExamTypeId(e.target.value)}
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  >
                    {examTypes.map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.code} — {ex.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-1">Pattern Name</label>
                  <input
                    type="text"
                    value={patName}
                    onChange={(e) => setPatName(e.target.value)}
                    placeholder="e.g. Official NEET 2026 Full Exam Pattern"
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={patDuration}
                    onChange={(e) => setPatDuration(Number(e.target.value))}
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-1">Total Questions</label>
                  <input
                    type="number"
                    value={patTotalQs}
                    onChange={(e) => setPatTotalQs(Number(e.target.value))}
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={patTotalMarks}
                    onChange={(e) => setPatTotalMarks(Number(e.target.value))}
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  />
                </div>

                <div className="flex gap-4">
                  <div className="w-1/2">
                    <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">Positive Mark</label>
                    <input
                      type="number"
                      step="0.5"
                      value={patPosMarks}
                      onChange={(e) => setPatPosMarks(Number(e.target.value))}
                      className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs font-bold text-red-700 uppercase mb-1">Negative Penalty</label>
                    <input
                      type="number"
                      step="0.5"
                      value={patNegMarks}
                      onChange={(e) => setPatNegMarks(Number(e.target.value))}
                      className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Subject Question Distribution */}
              <div className="pt-4 border-t border-line">
                <h3 className="font-bold text-sm text-ink mb-3 uppercase font-mono">Questions Per Subject Breakdown</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate mb-1">Physics Qs</label>
                    <input
                      type="number"
                      value={patSubjPhy}
                      onChange={(e) => setPatSubjPhy(Number(e.target.value))}
                      className="w-full border border-line bg-white px-2 py-1.5 text-sm text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate mb-1">Chemistry Qs</label>
                    <input
                      type="number"
                      value={patSubjChem}
                      onChange={(e) => setPatSubjChem(Number(e.target.value))}
                      className="w-full border border-line bg-white px-2 py-1.5 text-sm text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate mb-1">Biology Qs</label>
                    <input
                      type="number"
                      value={patSubjBio}
                      onChange={(e) => setPatSubjBio(Number(e.target.value))}
                      className="w-full border border-line bg-white px-2 py-1.5 text-sm text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate mb-1">Mathematics Qs</label>
                    <input
                      type="number"
                      value={patSubjMath}
                      onChange={(e) => setPatSubjMath(Number(e.target.value))}
                      className="w-full border border-line bg-white px-2 py-1.5 text-sm text-ink"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingPattern}
                className="w-full bg-indigo text-paper py-3 text-sm font-bold hover:bg-ink transition-colors disabled:opacity-50"
              >
                {savingPattern ? "Saving Pattern..." : "💾 Save Official Exam Pattern"}
              </button>
            </form>

            {/* List of Configured Patterns */}
            <div className="border border-line bg-white p-6 shadow-sm">
              <h3 className="font-serif font-bold text-lg text-ink mb-4 pb-2 border-b border-line">
                Active Configured Exam Patterns ({patterns.length})
              </h3>
              <div className="space-y-4">
                {patterns.map((p) => (
                  <div key={p.id} className="p-4 border border-line bg-paper flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <strong className="font-serif text-base text-ink block">{p.name}</strong>
                      <span className="text-xs text-slate">
                        {p.duration_minutes} Mins | {p.total_questions} Questions | {p.total_marks} Marks | Marking: +{p.positive_marks} / {p.negative_marks}
                      </span>
                    </div>
                    <span className="text-xs font-mono bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded font-bold">
                      ACTIVE PATTERN
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === "upload" ? (
          /* TAB 2: COURSE CONTENT / TEXTBOOK UPLOAD */
          <div className="space-y-8">
            <form onSubmit={handleUploadCourseContent} className="space-y-8">
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm">
                <h2 className="text-lg font-bold font-serif text-ink mb-4 border-b border-line pb-2">1. Select Subject</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {subjects.map((sub) => {
                    const isSelected = sub.id === selectedSubjectId;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setSelectedSubjectId(sub.id)}
                        className={`p-3 text-left border text-sm font-medium transition-all ${
                          isSelected ? "border-indigo bg-indigo/10 text-indigo font-bold" : "border-line bg-paper text-slate"
                        }`}
                      >
                        {sub.name}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm">
                <h2 className="text-lg font-bold font-serif text-ink mb-4 border-b border-line pb-2">2. Upload File</h2>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-line bg-white p-3 text-sm text-ink mb-4"
                />
                <button
                  type="submit"
                  disabled={uploading || !file}
                  className="w-full bg-indigo text-paper py-3 font-bold text-sm hover:bg-ink transition-colors disabled:opacity-50"
                >
                  🚀 Upload Course Material
                </button>
              </section>
            </form>
          </div>
        ) : (
          /* TAB 4: INDEXED CONTENT LIBRARY */
          <div className="border border-line bg-white p-6 shadow-sm">
            <h2 className="font-serif text-xl font-bold text-ink mb-4 pb-2 border-b border-line">
              Uploaded Documents & Mock Papers Library ({documents.length})
            </h2>
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="p-4 border border-line bg-paper flex items-center justify-between text-xs">
                  <div>
                    <strong className="text-sm font-medium text-ink block">{doc.original_filename}</strong>
                    <span className="text-slate">Type: {doc.document_type} | Version: v{doc.version} | Status: {doc.status}</span>
                  </div>
                  <span className="font-mono bg-indigo/10 text-indigo px-2.5 py-1 rounded font-bold uppercase">{doc.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
