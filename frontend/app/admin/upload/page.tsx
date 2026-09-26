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
  const [activeTab, setActiveTab] = useState<
    "curriculum" | "course_upload" | "full_mock" | "patterns" | "library"
  >("curriculum");

  // System Data
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [patterns, setPatterns] = useState<ExamPatternItem[]>([]);

  // --- TAB 1: Add Subjects & Topics State ---
  const [newSubjectExamId, setNewSubjectExamId] = useState<string>("");
  const [newSubjectName, setNewSubjectName] = useState<string>("");
  const [addingSubject, setAddingSubject] = useState(false);

  const [newChapterSubjectId, setNewChapterSubjectId] = useState<string>("");
  const [newChapterName, setNewChapterName] = useState<string>("");
  const [addingChapter, setAddingChapter] = useState(false);

  const [newTopicChapterId, setNewTopicChapterId] = useState<string>("");
  const [newTopicName, setNewTopicName] = useState<string>("");
  const [addingTopic, setAddingTopic] = useState(false);

  // --- TAB 2: Add Course Material for Each Topic State ---
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [customSubjectName, setCustomSubjectName] = useState("");
  const [contentChapterName, setContentChapterName] = useState("");
  const [contentTopicName, setContentTopicName] = useState("");
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [materialScope, setMaterialScope] = useState<"whole_exam" | "whole_subject" | "single_content">("single_content");
  const [documentType, setDocumentType] = useState("textbook");
  const [courseFile, setCourseFile] = useState<File | null>(null);

  // --- TAB 3: Full-Length Mock Paper Upload State ---
  const [mockScope, setMockScope] = useState<"complete" | "subject">("complete");
  const [mockSubjectId, setMockSubjectId] = useState<string>("");
  const [mockSelectedExamIds, setMockSelectedExamIds] = useState<string[]>([]);
  const [mockPaperTitle, setMockPaperTitle] = useState<string>("");
  const [mockFile, setMockFile] = useState<File | null>(null);

  // --- TAB 4: Add Exams & Exam Patterns State ---
  const [newExamCode, setNewExamCode] = useState<string>("");
  const [newExamName, setNewExamName] = useState<string>("");
  const [addingExam, setAddingExam] = useState(false);

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

  // Initial Data Load
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
        if (!newSubjectExamId) setNewSubjectExamId(examsData[0].id);
        if (selectedExamIds.length === 0) setSelectedExamIds([examsData[0].id]);
        if (mockSelectedExamIds.length === 0) setMockSelectedExamIds([examsData[0].id]);
        if (!patExamTypeId) setPatExamTypeId(examsData[0].id);
      }
      if (subjectsData.length > 0) {
        if (!newChapterSubjectId) setNewChapterSubjectId(subjectsData[0].id);
        if (!selectedSubjectId) setSelectedSubjectId(subjectsData[0].id);
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

  // Cascade Chapters when Subject changes
  useEffect(() => {
    const targetSubjId = newChapterSubjectId || selectedSubjectId;
    if (!targetSubjId) {
      setChapters([]);
      return;
    }
    api.get<Chapter[]>(`/api/v1/admin/chapters?subject_id=${targetSubjId}`, true)
      .then((data) => {
        setChapters(data);
        if (data.length > 0 && !newTopicChapterId) {
          setNewTopicChapterId(data[0].id);
        }
      })
      .catch(() => setChapters([]));
  }, [newChapterSubjectId, selectedSubjectId]);

  // Cascade Topics when Chapter changes
  useEffect(() => {
    if (!newTopicChapterId) {
      setTopics([]);
      return;
    }
    api.get<Topic[]>(`/api/v1/admin/topics?chapter_id=${newTopicChapterId}`, true)
      .then(setTopics)
      .catch(() => setTopics([]));
  }, [newTopicChapterId]);

  // --- TAB 1 HANDLERS: Add Subjects, Chapters, Topics ---
  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim() || !newSubjectExamId) return;
    setAddingSubject(true);
    setError(null);
    try {
      const newSubj = await api.post<Subject>(
        "/api/v1/admin/subjects",
        { name: newSubjectName.trim(), exam_type_id: newSubjectExamId },
        true
      );
      setSuccessMessage(`Subject "${newSubj.name}" created successfully.`);
      setNewSubjectName("");
      loadInitialData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create subject.");
    } finally {
      setAddingSubject(false);
    }
  }

  async function handleAddChapter(e: React.FormEvent) {
    e.preventDefault();
    if (!newChapterName.trim() || !newChapterSubjectId) return;
    setAddingChapter(true);
    setError(null);
    try {
      const newChap = await api.post<Chapter>(
        "/api/v1/admin/chapters",
        { subject_id: newChapterSubjectId, name: newChapterName.trim() },
        true
      );
      setSuccessMessage(`Chapter "${newChap.name}" added under subject.`);
      setNewChapterName("");
      loadInitialData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add chapter.");
    } finally {
      setAddingChapter(false);
    }
  }

  async function handleAddTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!newTopicName.trim() || !newTopicChapterId) return;
    setAddingTopic(true);
    setError(null);
    try {
      const newTop = await api.post<Topic>(
        "/api/v1/admin/topics",
        { chapter_id: newTopicChapterId, name: newTopicName.trim() },
        true
      );
      setSuccessMessage(`Topic "${newTop.name}" created! Students can now take topic-wise exams on this.`);
      setNewTopicName("");
      loadInitialData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create topic.");
    } finally {
      setAddingTopic(false);
    }
  }

  // --- TAB 2 HANDLER: Upload Course Content for Topics ---
  async function handleUploadCourseContent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setStatus(null);

    if (selectedExamIds.length === 0) {
      setError("Please select at least one target exam.");
      return;
    }
    if (materialScope !== "whole_exam" && !selectedSubjectId && !customSubjectName.trim()) {
      setError("Please select a subject or enter a subject name.");
      return;
    }
    if (!courseFile) {
      setError("Please select a file to upload.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", courseFile);
      formData.append("exam_type_ids", selectedExamIds.join(","));
      formData.append("document_type", documentType);
      formData.append("material_scope", materialScope);

      if (selectedSubjectId) {
        formData.append("subject_id", selectedSubjectId);
      } else if (customSubjectName.trim()) {
        formData.append("subject_name", customSubjectName.trim());
      }

      if (contentChapterName.trim()) formData.append("chapter_name", contentChapterName.trim());
      if (contentTopicName.trim()) formData.append("topic_name", contentTopicName.trim());

      const res = await api.post<{ document: { id: string }; message: string }>(
        "/api/v1/admin/documents/upload",
        formData,
        true
      );

      setStatus({ message: res.message, document_id: res.document.id });
      setSuccessMessage(
        `Course material for topic "${contentTopicName || "General"}" uploaded & synced! Knowledge base training in progress.`
      );

      pollStatus(res.document.id);
      loadInitialData();
      setCourseFile(null);
      setContentTopicName("");
      setContentChapterName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Course material upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // --- TAB 3 HANDLER: Upload Full Mock Papers ---
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

      const res = await api.post<{ document: { id: string }; message: string }>(
        "/api/v1/admin/documents/upload",
        formData,
        true
      );

      setStatus({ message: res.message, document_id: res.document.id });
      setSuccessMessage(
        `Full mock paper "${mockPaperTitle || mockFile.name}" indexed for complete paper generation.`
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

  // --- TAB 4 HANDLERS: Add Exams & Save Patterns ---
  async function handleAddExamType(e: React.FormEvent) {
    e.preventDefault();
    if (!newExamCode.trim() || !newExamName.trim()) return;
    setAddingExam(true);
    setError(null);
    try {
      const newEx = await api.post<ExamType>(
        "/api/v1/admin/exam-types",
        { code: newExamCode.trim().toUpperCase(), name: newExamName.trim() },
        true
      );
      setSuccessMessage(`New Target Exam "${newEx.code}" (${newEx.name}) created successfully.`);
      setNewExamCode("");
      setNewExamName("");
      loadInitialData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create exam type.");
    } finally {
      setAddingExam(false);
    }
  }

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

      await api.post<ExamPatternItem>(
        "/api/v1/admin/patterns",
        {
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
        },
        true
      );

      setSuccessMessage(`Exam Pattern "${patName}" saved successfully!`);
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

          {/* Sequential Workflow Tabs */}
          <nav className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab("curriculum")}
              className={`px-3.5 py-2 text-xs font-bold rounded transition-all whitespace-nowrap ${
                activeTab === "curriculum"
                  ? "bg-indigo text-paper shadow"
                  : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              🌿 1. Add Subjects & Topics
            </button>
            <button
              onClick={() => setActiveTab("course_upload")}
              className={`px-3.5 py-2 text-xs font-bold rounded transition-all whitespace-nowrap ${
                activeTab === "course_upload"
                  ? "bg-indigo text-paper shadow"
                  : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              📥 2. Add Course Material for Topics
            </button>
            <button
              onClick={() => setActiveTab("full_mock")}
              className={`px-3.5 py-2 text-xs font-bold rounded transition-all whitespace-nowrap ${
                activeTab === "full_mock"
                  ? "bg-indigo text-paper shadow"
                  : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              📑 3. Full Length Mock Papers
            </button>
            <button
              onClick={() => setActiveTab("patterns")}
              className={`px-3.5 py-2 text-xs font-bold rounded transition-all whitespace-nowrap ${
                activeTab === "patterns"
                  ? "bg-indigo text-paper shadow"
                  : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              ⚙️ 4. Add Exams & Exam Patterns
            </button>
            <button
              onClick={() => setActiveTab("library")}
              className={`px-3.5 py-2 text-xs font-bold rounded transition-all whitespace-nowrap ${
                activeTab === "library"
                  ? "bg-indigo text-paper shadow"
                  : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              📚 5. Indexed Library ({documents.length})
            </button>
          </nav>
        </div>
      </header>

      {/* Page Content Container */}
      <div className="mx-auto max-w-5xl px-6 pt-8">
        {/* Title Banner */}
        <div className="mb-8 border-b border-line pb-6">
          <h1 className="font-serif text-3xl font-bold text-ink">
            {activeTab === "curriculum"
              ? "Curriculum Hierarchy Setup: Add Subjects & Topics"
              : activeTab === "course_upload"
              ? "Course Material Upload: Add Textbooks for Topics"
              : activeTab === "full_mock"
              ? "Full Length Mock Papers Training Studio"
              : activeTab === "patterns"
              ? "Target Exams & Official Exam Patterns Setup"
              : "Indexed Knowledge Base Library"}
          </h1>
          <p className="mt-2 text-slate text-sm max-w-3xl leading-relaxed">
            {activeTab === "curriculum"
              ? "Define target exam subjects, chapter modules, and topic nodes. These topics will be available for students to take topic-wise exams."
              : activeTab === "course_upload"
              ? "Upload textbooks, study modules, or question banks specifically linked to a subject, chapter, and topic."
              : activeTab === "full_mock"
              ? "Upload complete multi-subject or single-subject Mock Papers (for college paper generation without requiring individual topic tags)."
              : activeTab === "patterns"
              ? "Add new target entrance exams (e.g. NEET, KCET, JEE) and configure total questions, duration, negative marking rules, and subject question distributions."
              : "Review all indexed textbooks and full mock papers stored in SamAI's RAG store."}
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

        {/* TAB 1: ADD SUBJECTS & TOPICS */}
        {activeTab === "curriculum" ? (
          <div className="space-y-8">
            {/* Quick Target Exam Creator & 3-Step Curriculum Workflow */}
            <div className="grid md:grid-cols-4 gap-4">
              {/* Form 0: Add Target Exam */}
              <form onSubmit={handleAddExamType} className="border border-indigo/30 bg-indigo/5 p-4 shadow-sm space-y-3">
                <h2 className="font-serif font-bold text-sm text-indigo border-b border-indigo/20 pb-1.5 flex items-center gap-1.5">
                  <span>🎓</span> Step 0: Add Target Exam
                </h2>
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-0.5">Exam Code *</label>
                  <input
                    type="text"
                    value={newExamCode}
                    onChange={(e) => setNewExamCode(e.target.value)}
                    placeholder="e.g. GATE, UPSC, CET"
                    className="w-full border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none uppercase font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-0.5">Exam Name *</label>
                  <input
                    type="text"
                    value={newExamName}
                    onChange={(e) => setNewExamName(e.target.value)}
                    placeholder="e.g. Graduate Aptitude Test"
                    className="w-full border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingExam || !newExamCode.trim() || !newExamName.trim()}
                  className="w-full bg-indigo text-paper py-1.5 text-xs font-bold hover:bg-ink transition-colors disabled:opacity-50"
                >
                  {addingExam ? "Adding..." : "➕ Add Target Exam"}
                </button>
              </form>

              {/* Form 1: Add Subject */}
              <form onSubmit={handleAddSubject} className="border border-line bg-paper p-4 shadow-sm space-y-3">
                <h2 className="font-serif font-bold text-sm text-ink border-b border-line pb-1.5 flex items-center gap-1.5">
                  <span>📘</span> Step 1: Add Subject
                </h2>
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-0.5">Target Exam *</label>
                  <select
                    value={newSubjectExamId}
                    onChange={(e) => setNewSubjectExamId(e.target.value)}
                    className="w-full border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none font-medium"
                    required
                  >
                    {examTypes.map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.code} — {ex.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-0.5">Subject Name *</label>
                  <input
                    type="text"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder="e.g. Physics, Organic Chemistry"
                    className="w-full border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingSubject || !newSubjectName.trim()}
                  className="w-full bg-indigo text-paper py-1.5 text-xs font-bold hover:bg-ink transition-colors disabled:opacity-50"
                >
                  {addingSubject ? "Adding..." : "➕ Add Subject"}
                </button>
              </form>

              {/* Form 2: Add Chapter */}
              <form onSubmit={handleAddChapter} className="border border-line bg-paper p-4 shadow-sm space-y-3">
                <h2 className="font-serif font-bold text-sm text-ink border-b border-line pb-1.5 flex items-center gap-1.5">
                  <span>📖</span> Step 2: Add Chapter
                </h2>
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-0.5">Select Subject *</label>
                  <select
                    value={newChapterSubjectId}
                    onChange={(e) => setNewChapterSubjectId(e.target.value)}
                    className="w-full border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none font-medium"
                    required
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-0.5">Chapter Name *</label>
                  <input
                    type="text"
                    value={newChapterName}
                    onChange={(e) => setNewChapterName(e.target.value)}
                    placeholder="e.g. Kinematics & Mechanics"
                    className="w-full border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingChapter || !newChapterName.trim()}
                  className="w-full bg-indigo text-paper py-1.5 text-xs font-bold hover:bg-ink transition-colors disabled:opacity-50"
                >
                  {addingChapter ? "Adding..." : "➕ Add Chapter"}
                </button>
              </form>

              {/* Form 3: Add Topic */}
              <form onSubmit={handleAddTopic} className="border border-line bg-paper p-4 shadow-sm space-y-3">
                <h2 className="font-serif font-bold text-sm text-ink border-b border-line pb-1.5 flex items-center gap-1.5">
                  <span>🎯</span> Step 3: Add Topic Name
                </h2>
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-0.5">Select Chapter *</label>
                  <select
                    value={newTopicChapterId}
                    onChange={(e) => setNewTopicChapterId(e.target.value)}
                    className="w-full border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none font-medium"
                    required
                  >
                    {chapters.length === 0 ? (
                      <option value="">No chapters available. Create chapter first.</option>
                    ) : (
                      chapters.map((ch) => (
                        <option key={ch.id} value={ch.id}>{ch.name}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink uppercase mb-0.5">Topic Name *</label>
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="e.g. Motion in One Dimension"
                    className="w-full border border-emerald-600/40 bg-emerald-50 px-2.5 py-1.5 text-xs text-ink focus:outline-none font-medium"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={addingTopic || !newTopicName.trim() || !newTopicChapterId}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-paper py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {addingTopic ? "Adding..." : "⚡ Add Topic (Enables Exams)"}
                </button>
              </form>
            </div>

            {/* CURRICULUM TREE PREVIEW */}
            <div className="border border-line bg-white p-6 shadow-sm">
              <h2 className="font-serif font-bold text-xl text-ink mb-4 pb-2 border-b border-line flex items-center justify-between">
                <span>Knowledge Base Curriculum Tree Structure</span>
                <span className="text-xs font-sans font-normal text-slate">
                  {subjects.length} Subjects | {chapters.length} Chapters | {topics.length} Topics Total
                </span>
              </h2>
              <div className="space-y-6">
                {subjects.map((s) => {
                  const subExam = examTypes.find((ex) => ex.id === s.exam_type_id);
                  return (
                    <div key={s.id} className="p-4 border border-line bg-paper">
                      <div className="flex items-center justify-between mb-3">
                        <strong className="font-serif text-lg text-ink">
                          {s.name} <span className="text-xs font-mono text-indigo font-normal">[{subExam?.code || "ALL EXAMS"}]</span>
                        </strong>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        {chapters.filter((c) => c.subject_id === s.id).map((c) => (
                          <div key={c.id} className="p-3 bg-white border border-line text-xs">
                            <span className="font-bold text-indigo block mb-1">📖 {c.name}</span>
                            <div className="pl-3 border-l-2 border-indigo/30 space-y-1 mt-2">
                              {topics.filter((t) => t.chapter_id === c.id).map((t) => (
                                <div key={t.id} className="text-ink font-medium">
                                  🎯 {t.name}
                                </div>
                              ))}
                              {topics.filter((t) => t.chapter_id === c.id).length === 0 && (
                                <span className="text-slate italic text-[11px]">No topics added to this chapter yet.</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : activeTab === "course_upload" ? (
          /* TAB 2: ADD COURSE MATERIAL FOR EACH TOPIC */
          <div className="space-y-8">
            <form onSubmit={handleUploadCourseContent} className="space-y-8">
              {/* 1. Target Exam & Scope */}
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm space-y-6">
                <h2 className="text-lg font-bold font-serif text-ink border-b border-line pb-2 flex items-center justify-between">
                  <span>1. Select Material Scope & Assignment</span>
                  <span className="text-xs font-sans text-amber font-semibold">* All Fields Are Mandatory</span>
                </h2>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div
                    onClick={() => setMaterialScope("single_content")}
                    className={`cursor-pointer p-4 border transition-all ${
                      materialScope === "single_content"
                        ? "border-indigo bg-indigo/10 text-indigo font-bold ring-1 ring-indigo"
                        : "border-line bg-white text-slate hover:border-ink"
                    }`}
                  >
                    <span className="text-sm block mb-1">🎯 Single Topic Item (Recommended)</span>
                    <span className="text-[11px] font-normal text-slate block leading-relaxed">
                      Material for a specific topic (e.g. Motion in 1D, Hydrocarbons).
                    </span>
                  </div>

                  <div
                    onClick={() => setMaterialScope("whole_subject")}
                    className={`cursor-pointer p-4 border transition-all ${
                      materialScope === "whole_subject"
                        ? "border-indigo bg-indigo/10 text-indigo font-bold ring-1 ring-indigo"
                        : "border-line bg-white text-slate hover:border-ink"
                    }`}
                  >
                    <span className="text-sm block mb-1">📘 Whole Subject Material</span>
                    <span className="text-[11px] font-normal text-slate block leading-relaxed">
                      Entire subject textbook or question bank (e.g. Complete Physics).
                    </span>
                  </div>

                  <div
                    onClick={() => setMaterialScope("whole_exam")}
                    className={`cursor-pointer p-4 border transition-all ${
                      materialScope === "whole_exam"
                        ? "border-indigo bg-indigo/10 text-indigo font-bold ring-1 ring-indigo"
                        : "border-line bg-white text-slate hover:border-ink"
                    }`}
                  >
                    <span className="text-sm block mb-1">🎓 Whole Exam Package</span>
                    <span className="text-[11px] font-normal text-slate block leading-relaxed">
                      Multi-subject complete exam package (NEET / KCET / JEE full syllabus).
                    </span>
                  </div>
                </div>

                {/* Target Exams */}
                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-2">
                    Target Exam(s) <span className="text-red-600 font-bold">* Mandatory</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {examTypes.map((exam) => {
                      const isChecked = selectedExamIds.includes(exam.id);
                      return (
                        <div
                          key={exam.id}
                          onClick={() => toggleExamSelection(exam.id)}
                          className={`cursor-pointer p-3 border text-xs flex items-center justify-between transition-all ${
                            isChecked ? "border-indigo bg-indigo text-paper font-bold" : "border-line bg-white text-ink hover:border-ink"
                          }`}
                        >
                          <span>{exam.code} — {exam.name}</span>
                          <input type="checkbox" checked={isChecked} onChange={() => {}} className="w-3.5 h-3.5 accent-amber" />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Subject & Topic Selection */}
                {materialScope !== "whole_exam" && (
                  <div className="space-y-4 pt-4 border-t border-line">
                    <div>
                      <label className="block text-xs font-bold text-ink uppercase mb-2">
                        Select Subject <span className="text-red-600 font-bold">* Mandatory</span>
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        {subjects.map((sub) => {
                          const isSelected = sub.id === selectedSubjectId;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => {
                                setSelectedSubjectId(sub.id);
                                setCustomSubjectName("");
                              }}
                              className={`p-3 text-left border text-sm font-medium transition-all ${
                                isSelected ? "border-indigo bg-indigo/10 text-indigo font-bold" : "border-line bg-white text-slate hover:border-ink"
                              }`}
                            >
                              {sub.name}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="text"
                        value={customSubjectName}
                        onChange={(e) => {
                          setCustomSubjectName(e.target.value);
                          setSelectedSubjectId("");
                        }}
                        placeholder="Or enter new subject name (e.g. Physical Chemistry)..."
                        className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                      />
                    </div>

                    {/* Topic Name Select Dropdown (Mandatory) */}
                    <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-line">
                      <div>
                        <label className="block text-xs font-bold text-ink uppercase mb-1">
                          Select Topic Name <span className="text-red-600 font-bold">* Mandatory</span>
                        </label>
                        {(() => {
                          const chapsForSub = chapters.filter((c) => c.subject_id === selectedSubjectId);
                          const subTopics = topics.filter((t) => chapsForSub.some((c) => c.id === t.chapter_id));
                          const listToUse = subTopics.length > 0 ? subTopics : topics;

                          return (
                            <div className="space-y-2">
                              <select
                                value={contentTopicName}
                                onChange={(e) => setContentTopicName(e.target.value)}
                                className="w-full border border-indigo/50 bg-indigo/5 px-3 py-2.5 text-sm text-ink focus:outline-none font-bold"
                                required
                              >
                                <option value="">-- Select Added Topic from Dropdown --</option>
                                {listToUse.map((t) => (
                                  <option key={t.id} value={t.name}>
                                    🎯 {t.name}
                                  </option>
                                ))}
                              </select>

                              <div className="pt-1">
                                <label className="block text-[11px] text-slate font-medium mb-0.5">
                                  Or type custom topic name if not listed above:
                                </label>
                                <input
                                  type="text"
                                  value={contentTopicName}
                                  onChange={(e) => setContentTopicName(e.target.value)}
                                  placeholder="e.g. Organic Reactions, Kinematics..."
                                  className="w-full border border-line bg-white px-3 py-1.5 text-xs text-ink focus:outline-none"
                                />
                              </div>
                            </div>
                          );
                        })()}
                        <span className="text-[10px] text-slate mt-1 block">
                          ⚡ Selection binds uploaded textbooks & PYQs to this topic for student topic-wise exams.
                        </span>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-ink uppercase mb-1">
                          Chapter / Module Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={contentChapterName}
                          onChange={(e) => setContentChapterName(e.target.value)}
                          placeholder="e.g. Unit 1: Physics Fundamentals"
                          className="w-full border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* 2. Choose Document Type & Upload File */}
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm space-y-4">
                <h2 className="text-lg font-bold font-serif text-ink border-b border-line pb-2 flex items-center justify-between">
                  <span>2. Document Category & File Upload</span>
                  <span className="text-xs font-sans text-amber font-semibold">* All Fields Are Mandatory</span>
                </h2>
                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-2">
                    Category <span className="text-red-600 font-bold">* Mandatory</span>
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as any)}
                    className="w-full border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none font-semibold"
                    required
                  >
                    <option value="textbook">Textbook / Complete Study Module</option>
                    <option value="sample_questions">Sample Question Bank / Exercise Sheet</option>
                    <option value="sample_question_paper">Previous Years Question Paper (PYQ)</option>
                    <option value="explanation">Concept Explanations & Notes</option>
                    <option value="table_of_contents">Table of Contents / Syllabus Blueprint</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-2">
                    Attach File (.pdf, .docx, .txt) <span className="text-red-600 font-bold">* Mandatory</span>
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.csv"
                    onChange={(e) => setCourseFile(e.target.files?.[0] ?? null)}
                    className="w-full border border-line bg-white p-3 text-sm text-ink font-mono"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={
                    uploading ||
                    !courseFile ||
                    selectedExamIds.length === 0 ||
                    (materialScope !== "whole_exam" && !selectedSubjectId && !customSubjectName.trim()) ||
                    (materialScope === "single_content" && !contentTopicName.trim())
                  }
                  className="w-full bg-indigo text-paper py-3.5 font-bold text-sm hover:bg-ink transition-colors disabled:opacity-50 shadow"
                >
                  {uploading
                    ? "Syncing Curriculum & Indexing Course Material..."
                    : `🚀 Upload & Sync Topic Material (${selectedExamIds.length} Exam${selectedExamIds.length > 1 ? "s" : ""})`}
                </button>
              </section>
            </form>
          </div>
        ) : activeTab === "full_mock" ? (
          /* TAB 3: FULL LENGTH MOCK PAPERS STUDIO */
          <div className="space-y-8">
            <form onSubmit={handleUploadFullMockPaper} className="space-y-8">
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm space-y-6">
                <h2 className="text-lg font-bold font-serif text-ink border-b border-line pb-2">
                  1. Select Mock Paper Scope (No Topic Required)
                </h2>

                <div className="grid sm:grid-cols-2 gap-4">
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
                    <span className="text-base block mb-1">📘 Single Subject Mock Paper</span>
                    <span className="text-xs font-normal text-slate block leading-relaxed">
                      Upload complete subject-wide question paper (e.g. Full Physics Mock Paper).
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

              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm space-y-6">
                <h2 className="text-lg font-bold font-serif text-ink border-b border-line pb-2">
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
                          isChecked ? "border-indigo bg-indigo text-paper shadow-sm" : "border-line bg-white text-ink hover:border-ink"
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

              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm space-y-4">
                <h2 className="text-lg font-bold font-serif text-ink border-b border-line pb-2">
                  3. Upload Full Length Paper File
                </h2>

                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Paper Title / Description</label>
                  <input
                    type="text"
                    value={mockPaperTitle}
                    onChange={(e) => setMockPaperTitle(e.target.value)}
                    placeholder="e.g. NEET 2026 Full Length College Mock Test Paper - Set A"
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-2">Attach File (.pdf, .docx, .txt)</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.csv"
                    onChange={(e) => setMockFile(e.target.files?.[0] ?? null)}
                    className="w-full border border-line bg-white p-3 text-sm text-ink"
                  />
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
          /* TAB 4: ADD EXAMS & EXAM PATTERNS SETUP */
          <div className="space-y-8">
            {/* SUB-SECTION 1: ADD NEW TARGET EXAM */}
            <form onSubmit={handleAddExamType} className="border border-line bg-paper p-6 sm:p-8 shadow-sm space-y-4">
              <h2 className="text-xl font-bold font-serif text-ink border-b border-line pb-3 flex items-center gap-2">
                <span>🎓</span> Add New Target Entrance Exam
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-1">Exam Code (Short Name)</label>
                  <input
                    type="text"
                    value={newExamCode}
                    onChange={(e) => setNewExamCode(e.target.value)}
                    placeholder="e.g. NEET, KCET, JEE, GATE"
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none uppercase font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-1">Full Exam Title</label>
                  <input
                    type="text"
                    value={newExamName}
                    onChange={(e) => setNewExamName(e.target.value)}
                    placeholder="e.g. National Eligibility cum Entrance Test"
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={addingExam || !newExamCode.trim() || !newExamName.trim()}
                className="w-full bg-indigo text-paper py-2.5 text-xs font-bold hover:bg-ink transition-colors disabled:opacity-50"
              >
                {addingExam ? "Adding Exam..." : "➕ Create Target Exam Section"}
              </button>
            </form>

            {/* SUB-SECTION 2: CONFIGURE EXAM PATTERN & MARKING SCHEME */}
            <form onSubmit={handleSavePattern} className="border border-line bg-paper p-6 sm:p-8 shadow-sm space-y-6">
              <h2 className="text-xl font-bold font-serif text-ink border-b border-line pb-3 flex items-center gap-2">
                <span>⚙️</span> Configure Official Exam Pattern & Marking Scheme
              </h2>

              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-ink uppercase mb-1">Target Exam</label>
                  <select
                    value={patExamTypeId}
                    onChange={(e) => setPatExamTypeId(e.target.value)}
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none font-semibold"
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
                      className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none font-bold text-emerald-700"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs font-bold text-red-700 uppercase mb-1">Negative Penalty</label>
                    <input
                      type="number"
                      step="0.5"
                      value={patNegMarks}
                      onChange={(e) => setPatNegMarks(Number(e.target.value))}
                      className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none font-bold text-red-700"
                    />
                  </div>
                </div>
              </div>

              {/* Subject Breakdown */}
              <div className="pt-4 border-t border-line">
                <h3 className="font-bold text-xs text-ink mb-3 uppercase font-mono">Questions Per Subject Breakdown</h3>
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
        ) : (
          /* TAB 5: INDEXED KNOWLEDGE LIBRARY */
          <div className="border border-line bg-white p-6 shadow-sm">
            <h2 className="font-serif text-xl font-bold text-ink mb-4 pb-2 border-b border-line">
              Uploaded Documents & Knowledge Library ({documents.length})
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
