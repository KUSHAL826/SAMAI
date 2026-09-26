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

const DOCUMENT_TYPES = [
  { value: "textbook", label: "Textbook / Study Material", desc: "Core reference material & syllabus content" },
  { value: "table_of_contents", label: "Table of Contents", desc: "Curriculum structure & topic hierarchy" },
  { value: "explanation", label: "Detailed Explanation", desc: "Concept deep dives and worked solutions" },
  { value: "exam_pattern", label: "Exam Pattern", desc: "Question distributions & marking schemes" },
  { value: "sample_questions", label: "Sample Questions", desc: "Curated question banks for practice" },
  { value: "sample_question_paper", label: "Sample Question Paper", desc: "Full mock test papers" },
];

export default function AdminKnowledgeBasePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"upload" | "library">("upload");

  // Curriculum Data
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  // Step 1: Subject
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);

  // Step 2: Content under Subject
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [newChapterName, setNewChapterName] = useState("");
  const [addingChapter, setAddingChapter] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [newTopicName, setNewTopicName] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);

  // Step 3: Choose Exams (Single or Multiple)
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [newExamCode, setNewExamCode] = useState("");
  const [newExamName, setNewExamName] = useState("");
  const [showAddExamModal, setShowAddExamModal] = useState(false);
  const [addingExam, setAddingExam] = useState(false);

  // Step 4: Upload Content Details
  const [contentNameOverride, setContentNameOverride] = useState("");
  const [documentType, setDocumentType] = useState("textbook");
  const [file, setFile] = useState<File | null>(null);

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
      const [examsData, subjectsData, docsData] = await Promise.all([
        api.get<ExamType[]>("/api/v1/admin/exam-types", true),
        api.get<Subject[]>("/api/v1/admin/subjects", true),
        api.get<DocumentItem[]>("/api/v1/admin/documents", true),
      ]);
      setExamTypes(examsData);
      setSubjects(subjectsData);
      setDocuments(docsData);

      // Default select first exam if none selected
      if (examsData.length > 0 && selectedExamIds.length === 0) {
        setSelectedExamIds([examsData[0].id]);
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

  // Sync content name preview when chapter changes
  useEffect(() => {
    const chapterObj = chapters.find((c) => c.id === selectedChapterId);
    if (chapterObj) {
      setContentNameOverride(chapterObj.name);
    }
  }, [selectedChapterId, chapters]);

  // --- Quick Handlers ---
  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    setAddingSubject(true);
    setError(null);
    try {
      // Use first selected exam if available, or default
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

  async function handleAddTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChapterId || !newTopicName.trim()) return;
    setAddingTopic(true);
    setError(null);
    try {
      const newTop = await api.post<Topic>("/api/v1/admin/topics", {
        chapter_id: selectedChapterId,
        name: newTopicName.trim(),
      }, true);
      const updatedTopics = await api.get<Topic[]>(
        `/api/v1/admin/topics?chapter_id=${selectedChapterId}`,
        true
      );
      setTopics(updatedTopics);
      setSelectedTopicId(newTop.id);
      setContentNameOverride(newTop.name);
      setNewTopicName("");
      setSuccessMessage(`Subtopic "${newTop.name}" created successfully.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create subtopic.");
    } finally {
      setAddingTopic(false);
    }
  }

  async function handleAddExam(e: React.FormEvent) {
    e.preventDefault();
    if (!newExamCode.trim() || !newExamName.trim()) return;
    setAddingExam(true);
    setError(null);
    try {
      const newExam = await api.post<ExamType>("/api/v1/admin/exam-types", {
        code: newExamCode.trim().toUpperCase(),
        name: newExamName.trim(),
      }, true);
      const updatedExams = await api.get<ExamType[]>("/api/v1/admin/exam-types", true);
      setExamTypes(updatedExams);
      setSelectedExamIds((prev) => [...prev, newExam.id]);
      setNewExamCode("");
      setNewExamName("");
      setShowAddExamModal(false);
      setSuccessMessage(`Exam "${newExam.name}" added successfully.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add exam.");
    } finally {
      setAddingExam(false);
    }
  }

  function toggleExamSelection(examId: string) {
    setSelectedExamIds((prev) =>
      prev.includes(examId) ? prev.filter((id) => id !== examId) : [...prev, examId]
    );
  }

  // --- Upload Handler ---
  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setStatus(null);

    if (!selectedSubjectId) {
      setError("Please select or add a subject first (Step 1).");
      return;
    }
    if (selectedExamIds.length === 0) {
      setError("Please select at least one exam (Step 3).");
      return;
    }
    if (!file) {
      setError("Please choose a file to upload (Step 4).");
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
        `Upload received for ${selectedExamIds.length} selected exam(s)! Knowledge base training is in progress.`
      );

      pollStatus(res.document.id);
      loadInitialData(); // Refresh document library
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Document upload failed.");
    } finally {
      setUploading(false);
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

  const selectedSubjectObj = subjects.find((s) => s.id === selectedSubjectId);
  const selectedChapterObj = chapters.find((c) => c.id === selectedChapterId);

  return (
    <main className="min-h-screen bg-paper text-ink font-sans pb-20">
      {/* Admin Header */}
      <header className="border-b border-line bg-paper sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-ink hover:opacity-80">
              SamAI <span className="text-sm font-sans font-normal text-indigo border border-indigo/30 px-2 py-0.5 rounded">Admin Hub</span>
            </Link>
          </div>
          <nav className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "upload"
                  ? "bg-ink text-paper shadow"
                  : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              📥 Knowledge Base Training
            </button>
            <button
              onClick={() => setActiveTab("library")}
              className={`px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "library"
                  ? "bg-ink text-paper shadow"
                  : "text-slate hover:text-ink hover:bg-line/40"
              }`}
            >
              📚 Content Library ({documents.length})
            </button>
          </nav>
        </div>
      </header>

      {/* Page Content Container */}
      <div className="mx-auto max-w-5xl px-6 pt-8">
        {/* Title Banner */}
        <div className="mb-8 border-b border-line pb-6">
          <h1 className="font-serif text-3xl font-bold text-ink">
            {activeTab === "upload" ? "Knowledge Base Training Studio" : "Knowledge Base Library"}
          </h1>
          <p className="mt-2 text-slate text-sm max-w-2xl leading-relaxed">
            {activeTab === "upload"
              ? "Train SamAI's AI model by organizing subjects, adding content topics, picking target exams, and uploading approved course documents."
              : "Review all uploaded textbooks, study materials, and topic chunks indexed in SamAI's Retrieval-Augmented Generation (RAG) vector store."}
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

        {/* TAB 1: UPLOAD & TRAIN WORKFLOW */}
        {activeTab === "upload" && (
          <div className="space-y-8">
            <form onSubmit={handleUpload} className="space-y-8">

              {/* STEP 1: ADD / SELECT SUBJECT */}
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm relative">
                <div className="flex items-center justify-between mb-4 border-b border-line/60 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo text-paper text-sm font-bold">
                      1
                    </span>
                    <h2 className="text-lg font-bold font-serif text-ink">
                      First: Add or Select Subject
                    </h2>
                  </div>
                  {selectedSubjectObj && (
                    <span className="text-xs bg-indigo/10 text-indigo font-medium px-2.5 py-1 border border-indigo/20">
                      Active: {selectedSubjectObj.name}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate mb-4">
                  Select an existing subject from the curriculum or add a new subject (e.g., Physics, Chemistry, Mathematics, Biology).
                </p>

                {/* Existing Subjects Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {subjects.map((sub) => {
                    const isSelected = sub.id === selectedSubjectId;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setSelectedSubjectId(sub.id)}
                        className={`p-3 text-left border text-sm font-medium transition-all ${
                          isSelected
                            ? "border-indigo bg-indigo/10 text-indigo shadow-sm ring-1 ring-indigo"
                            : "border-line bg-paper text-slate hover:border-ink hover:text-ink"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{sub.name}</span>
                          {isSelected && <span className="text-indigo font-bold text-xs">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Add Subject */}
                <div className="mt-4 pt-4 border-t border-line/60">
                  <label className="block text-xs font-semibold text-slate mb-1.5">
                    + Add New Subject to Knowledge Base
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSubjectName}
                      placeholder="e.g. Physics, Organic Chemistry, Botany"
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      className="flex-1 border border-line bg-white px-3 py-2 text-sm focus:border-indigo focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddSubject}
                      disabled={addingSubject || !newSubjectName.trim()}
                      className="px-4 py-2 bg-ink text-paper text-sm font-medium hover:bg-indigo transition-colors disabled:opacity-50"
                    >
                      {addingSubject ? "Adding..." : "+ Add Subject"}
                    </button>
                  </div>
                </div>
              </section>

              {/* STEP 2: ADD CONTENT UNDER SUBJECT */}
              <section
                className={`border border-line bg-paper p-6 sm:p-8 shadow-sm transition-opacity ${
                  !selectedSubjectId ? "opacity-50 pointer-events-none" : "opacity-100"
                }`}
              >
                <div className="flex items-center justify-between mb-4 border-b border-line/60 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo text-paper text-sm font-bold">
                      2
                    </span>
                    <h2 className="text-lg font-bold font-serif text-ink">
                      Under {selectedSubjectObj ? `"${selectedSubjectObj.name}"` : "Subject"}: Add & Select Content
                    </h2>
                  </div>
                  {selectedChapterObj && (
                    <span className="text-xs bg-indigo/10 text-indigo font-medium px-2.5 py-1 border border-indigo/20">
                      Content: {selectedChapterObj.name}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate mb-4">
                  Add or select content items, chapters, or units belonging to this subject before attaching training documents.
                </p>

                {/* List of Content Items under Subject */}
                {chapters.length > 0 ? (
                  <div className="grid sm:grid-cols-2 gap-3 mb-5">
                    {chapters.map((chap) => {
                      const isSelected = chap.id === selectedChapterId;
                      return (
                        <button
                          key={chap.id}
                          type="button"
                          onClick={() => setSelectedChapterId(chap.id)}
                          className={`p-3 text-left border text-sm font-medium transition-all ${
                            isSelected
                              ? "border-indigo bg-indigo/10 text-indigo ring-1 ring-indigo"
                              : "border-line bg-white text-slate hover:border-ink hover:text-ink"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-ink">{chap.name}</span>
                            {isSelected && <span className="text-indigo text-xs font-bold">Selected</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 border border-dashed border-line text-slate text-xs text-center mb-4">
                    No content items created under {selectedSubjectObj ? selectedSubjectObj.name : "this subject"} yet. Add one below.
                  </div>
                )}

                {/* Quick Add Content under Subject */}
                <div className="mt-4 pt-4 border-t border-line/60">
                  <label className="block text-xs font-semibold text-slate mb-1.5">
                    + Add New Content / Chapter under {selectedSubjectObj ? selectedSubjectObj.name : "Subject"}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newChapterName}
                      placeholder="e.g. Unit 1: Kinematics & Rectilinear Motion"
                      onChange={(e) => setNewChapterName(e.target.value)}
                      className="flex-1 border border-line bg-white px-3 py-2 text-sm focus:border-indigo focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddChapter}
                      disabled={addingChapter || !newChapterName.trim()}
                      className="px-4 py-2 bg-ink text-paper text-sm font-medium hover:bg-indigo transition-colors disabled:opacity-50"
                    >
                      {addingChapter ? "Adding..." : "+ Add Content"}
                    </button>
                  </div>
                </div>

                {/* Optional Subtopic fine-tuning */}
                {selectedChapterId && (
                  <div className="mt-6 pt-4 border-t border-line/60">
                    <label className="block text-xs font-semibold text-slate mb-2">
                      Specific Subtopic (Optional)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={selectedTopicId}
                        onChange={(e) => {
                          setSelectedTopicId(e.target.value);
                          const top = topics.find((t) => t.id === e.target.value);
                          if (top) setContentNameOverride(top.name);
                        }}
                        className="flex-1 border border-line bg-white px-3 py-2 text-sm focus:border-indigo focus:outline-none"
                      >
                        <option value="">Whole Content Unit / Chapter</option>
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={newTopicName}
                        placeholder="Add subtopic (e.g. Motion in 1D)"
                        onChange={(e) => setNewTopicName(e.target.value)}
                        className="flex-1 border border-line bg-white px-3 py-2 text-sm focus:border-indigo focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddTopic}
                        disabled={addingTopic || !newTopicName.trim()}
                        className="px-3 py-2 border border-line text-xs font-medium text-slate hover:border-ink hover:text-ink transition-colors disabled:opacity-50"
                      >
                        + Add Subtopic
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* STEP 3: CHOOSE EXAMS (SINGLE OR MULTIPLE) */}
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-4 border-b border-line/60 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo text-paper text-sm font-bold">
                      3
                    </span>
                    <h2 className="text-lg font-bold font-serif text-ink">
                      Choose Target Exam(s)
                    </h2>
                  </div>
                  <span className="text-xs bg-amber/20 text-ink font-semibold px-2 py-1 border border-amber/40">
                    Single or Multiple Select
                  </span>
                </div>

                <p className="text-xs text-slate mb-4">
                  Select which competitive exam(s) this knowledge base content should be trained for. You can check multiple exams.
                </p>

                {/* Exam Cards Multiselect */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  {examTypes.map((exam) => {
                    const isChecked = selectedExamIds.includes(exam.id);
                    return (
                      <div
                        key={exam.id}
                        onClick={() => toggleExamSelection(exam.id)}
                        className={`cursor-pointer p-4 border transition-all flex flex-col justify-between ${
                          isChecked
                            ? "border-indigo bg-indigo text-paper shadow-sm"
                            : "border-line bg-white text-ink hover:border-ink"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-base font-serif">{exam.code}</span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 accent-amber cursor-pointer"
                          />
                        </div>
                        <span className={`text-xs ${isChecked ? "text-paper/80" : "text-slate"}`}>
                          {exam.name}
                        </span>
                      </div>
                    );
                  })}

                  {/* Add New Exam Button */}
                  <button
                    type="button"
                    onClick={() => setShowAddExamModal(true)}
                    className="p-4 border border-dashed border-line hover:border-ink flex flex-col items-center justify-center text-slate hover:text-ink transition-colors bg-white/50"
                  >
                    <span className="text-lg font-bold mb-1">+</span>
                    <span className="text-xs font-medium">Add New Exam</span>
                  </button>
                </div>

                {/* Selection Summary Pill */}
                <div className="text-xs text-slate bg-line/30 p-3 border border-line flex items-center justify-between">
                  <span>
                    Selected Exams ({selectedExamIds.length}):{" "}
                    <strong className="text-ink">
                      {selectedExamIds.length > 0
                        ? examTypes
                            .filter((e) => selectedExamIds.includes(e.id))
                            .map((e) => e.code)
                            .join(", ")
                        : "None selected"}
                    </strong>
                  </span>
                </div>
              </section>

              {/* STEP 4: UPLOAD CONTENT BY CHOOSING CONTENT NAME */}
              <section className="border border-line bg-paper p-6 sm:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-4 border-b border-line/60 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo text-paper text-sm font-bold">
                      4
                    </span>
                    <h2 className="text-lg font-bold font-serif text-ink">
                      Upload Content & File
                    </h2>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6 mb-6">
                  {/* Content Name Field */}
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">
                      Content / Topic Name
                    </label>
                    <input
                      type="text"
                      value={contentNameOverride}
                      onChange={(e) => setContentNameOverride(e.target.value)}
                      placeholder="e.g. Chapter 1 - Rectilinear Motion"
                      className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:border-indigo focus:outline-none"
                    />
                    <p className="text-xs text-slate/70 mt-1">
                      This content name will index chunks into SamAI knowledge retrieval.
                    </p>
                  </div>

                  {/* Document Type Selector */}
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">
                      Document Type
                    </label>
                    <select
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:border-indigo focus:outline-none"
                    >
                      {DOCUMENT_TYPES.map((dt) => (
                        <option key={dt.value} value={dt.value}>
                          {dt.label} — {dt.desc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* File Attachment Upload Box */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-ink mb-2">
                    Attach Approved Course File (PDF, DOCX, TXT, CSV, XLS, XLSX)
                  </label>
                  <div className="border-2 border-dashed border-line bg-white p-6 text-center hover:border-indigo transition-colors relative">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="space-y-2">
                      <span className="text-2xl block">📄</span>
                      <p className="text-sm font-medium text-ink">
                        {file ? file.name : "Click or drag & drop textbook file here"}
                      </p>
                      <p className="text-xs text-slate">
                        {file
                          ? `${(file.size / (1024 * 1024)).toFixed(2)} MB attached`
                          : "Supports PDF, Word, Excel, CSV, or Text up to 200MB"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Submit */}
                <button
                  type="submit"
                  disabled={uploading || !file || selectedExamIds.length === 0}
                  className="w-full bg-indigo text-paper py-3.5 px-6 font-medium text-base hover:bg-ink transition-colors disabled:opacity-50 shadow-sm"
                >
                  {uploading
                    ? "Processing and Training Knowledge Base..."
                    : `🚀 Upload & Train Knowledge Base (${selectedExamIds.length} Exam${selectedExamIds.length > 1 ? "s" : ""})`}
                </button>
              </section>
            </form>

            {/* LIVE PROCESSING STATUS TRACKER */}
            {status && (
              <section className="border border-indigo bg-indigo/5 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif font-bold text-lg text-ink flex items-center gap-2">
                    <span className="animate-pulse text-amber">⚡</span> Live Training Status
                  </h3>
                  <span className="text-xs font-mono bg-paper px-2 py-1 border border-line">
                    Status: {String(status.document_status || status.job_status || "processing")}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs mb-4">
                  {[
                    ["extracting_text", "1. Extract Text"],
                    ["cleaning", "2. Clean Text"],
                    ["chunking", "3. Create Chunks"],
                    ["embedding", "4. AI Embedding"],
                    ["ready", "5. Ready"],
                  ].map(([stepKey, label]) => {
                    const currentStep = String(status.current_step || "");
                    const isDone =
                      status.document_status === "ready" ||
                      (currentStep === "ready" && stepKey === "ready");
                    const isCurrent = currentStep === stepKey;

                    return (
                      <div
                        key={stepKey}
                        className={`p-2 border text-xs font-medium ${
                          isDone
                            ? "bg-emerald-100 border-emerald-500 text-emerald-900"
                            : isCurrent
                            ? "bg-amber/20 border-amber text-ink font-bold animate-pulse"
                            : "bg-paper border-line text-slate/60"
                        }`}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>

                <pre className="text-xs bg-paper p-3 border border-line font-mono text-slate overflow-x-auto">
                  {JSON.stringify(status, null, 2)}
                </pre>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: KNOWLEDGE BASE LIBRARY OVERVIEW */}
        {activeTab === "library" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold text-ink">
                Indexed Documents ({documents.length})
              </h2>
              <button
                onClick={loadInitialData}
                className="px-3 py-1.5 border border-line text-xs font-medium hover:bg-line/40 transition-colors"
              >
                🔄 Refresh Library
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="border border-dashed border-line bg-paper p-12 text-center text-slate text-sm">
                No documents uploaded yet. Switch to the <strong>Upload Content</strong> tab to train your first knowledge base document.
              </div>
            ) : (
              <div className="border border-line overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-ink text-paper text-xs uppercase font-mono tracking-wider">
                      <th className="p-3.5">Filename</th>
                      <th className="p-3.5">Exam</th>
                      <th className="p-3.5">Doc Type</th>
                      <th className="p-3.5">Version</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {documents.map((doc) => {
                      const examObj = examTypes.find((e) => e.id === doc.exam_type_id);
                      return (
                        <tr key={doc.id} className="hover:bg-paper/80 transition-colors">
                          <td className="p-3.5 font-medium text-ink flex items-center gap-2">
                            <span>📄</span>
                            <span className="truncate max-w-xs">{doc.original_filename}</span>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 bg-indigo/10 text-indigo border border-indigo/20 text-xs font-bold font-serif">
                              {examObj ? examObj.code : "Exam"}
                            </span>
                          </td>
                          <td className="p-3.5 text-xs text-slate capitalize">
                            {doc.document_type.replace(/_/g, " ")}
                          </td>
                          <td className="p-3.5 font-mono text-xs text-slate">v{doc.version}</td>
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 text-xs font-semibold ${
                                doc.status === "ready"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  : doc.status === "failed"
                                  ? "bg-red-100 text-red-800 border border-red-300"
                                  : "bg-amber/20 text-amber-900 border border-amber/40"
                              }`}
                            >
                              {doc.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-xs text-slate/70 font-mono">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Quick Modal for Adding Exam */}
        {showAddExamModal && (
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-paper border border-line p-6 max-w-md w-full shadow-xl">
              <h3 className="font-serif font-bold text-lg text-ink mb-3">Add New Exam Type</h3>
              <p className="text-xs text-slate mb-4">
                Enter the short code and full display name for the new competitive exam.
              </p>
              <form onSubmit={handleAddExam} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">Exam Code (e.g. NEET, KCET, JEE)</label>
                  <input
                    type="text"
                    value={newExamCode}
                    onChange={(e) => setNewExamCode(e.target.value)}
                    placeholder="e.g. KCET"
                    className="w-full border border-line bg-white px-3 py-2 text-sm focus:border-indigo focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">Exam Full Name</label>
                  <input
                    type="text"
                    value={newExamName}
                    onChange={(e) => setNewExamName(e.target.value)}
                    placeholder="e.g. Karnataka Common Entrance Test"
                    className="w-full border border-line bg-white px-3 py-2 text-sm focus:border-indigo focus:outline-none"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddExamModal(false)}
                    className="px-4 py-2 border border-line text-xs font-medium text-slate hover:bg-line/30"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingExam || !newExamCode.trim() || !newExamName.trim()}
                    className="px-4 py-2 bg-indigo text-paper text-xs font-medium hover:bg-ink disabled:opacity-50"
                  >
                    {addingExam ? "Adding..." : "Add Exam"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
