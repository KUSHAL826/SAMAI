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

type ExamType = { id: string; code: string; name: string };
type Subject = { id: string; exam_type_id: string; name: string };
type Chapter = { id: string; subject_id: string; name: string };

type TestQuestion = {
  id: string;
  question_text: string;
  options: Record<string, string>;
  difficulty: string;
  subject_id: string;
  topic_id: string;
  correct_answer?: string;
  explanation?: string;
};

type TestResult = {
  total_questions: number;
  correct_count: number;
  incorrect_count: number;
  unattempted_count: number;
  score: number;
  max_score: number;
  percentage: number;
  accuracy: number;
  time_taken_seconds: number;
  solutions: Array<{
    id: string;
    question_text: string;
    options: Record<string, string>;
    user_answer?: string;
    correct_answer: string;
    is_correct: boolean;
    is_unattempted: boolean;
    explanation: string;
  }>;
};

type AnalyticsData = {
  total_tests: number;
  average_score: number;
  average_percentage: number;
  overall_accuracy: number;
  total_time_spent_seconds: number;
  readiness_index: number;
  readiness_label: string;
  score_history: Array<{
    id: string;
    test_title: string;
    date: string;
    score: number;
    percentage: number;
    accuracy: number;
    time_taken_seconds: number;
  }>;
  subject_breakdown: Array<{
    subject_name: string;
    tests_taken: number;
    accuracy: number;
    avg_score: number;
  }>;
  weak_topics: string[];
  strong_topics: string[];
};

type MockPaperPackage = {
  title: string;
  total_questions: number;
  exam_code: string;
  test_paper: {
    title: string;
    questions: TestQuestion[];
    html_rendered: string;
  };
  key_answer_paper: {
    title: string;
    answer_matrix: string[];
    solutions: TestQuestion[];
    html_rendered: string;
  };
};

export default function StudentDashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"cbt" | "analytics" | "download_papers">("cbt");

  // Curriculum State
  const [exams, setExams] = useState<ExamType[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectTopicsMap, setSubjectTopicsMap] = useState<Record<string, Chapter[]>>({});
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  // Test Generator Config
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<string>("mixed");

  // CBT Test Engine State
  const [testSession, setTestSession] = useState<{
    title: string;
    questions: TestQuestion[];
    activeIdx: number;
    userAnswers: Record<string, string>;
    markedReview: Record<string, boolean>;
    timeRemaining: number;
    startTime: number;
    subjectTabs: string[];
    activeSubjectTab: string;
  } | null>(null);

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [loadingTest, setLoadingTest] = useState(false);
  const [submittingTest, setSubmittingTest] = useState(false);

  // Analytics & Student Tracking State
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Teacher Mock Paper Generator State
  const [mockPaperTitle, setMockPaperTitle] = useState("NEET / KCET / JEE All India Practice Mock Paper");
  const [mockPaperCount, setMockPaperCount] = useState(30);
  const [mockPackage, setMockPackage] = useState<MockPaperPackage | null>(null);
  const [generatingMockPackage, setGeneratingMockPackage] = useState(false);

  // Load student profile & curriculum
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
          setError("Could not load student profile.");
        }
      });

    loadCurriculumData();
  }, [router]);

  // Load Analytics when Analytics tab is opened
  useEffect(() => {
    if (activeTab === "analytics") {
      fetchAnalyticsData();
    }
  }, [activeTab]);

  async function loadCurriculumData() {
    try {
      const [examsList, subjectsList] = await Promise.all([
        api.get<ExamType[]>("/api/v1/admin/exam-types"),
        api.get<Subject[]>("/api/v1/admin/subjects"),
      ]);
      setExams(examsList);
      setSubjects(subjectsList);
      if (examsList.length > 0) setSelectedExamId(examsList[0].id);

      const topicsMap: Record<string, Chapter[]> = {};
      await Promise.all(
        subjectsList.map(async (subj) => {
          try {
            const chaptersList = await api.get<Chapter[]>(`/api/v1/admin/chapters?subject_id=${subj.id}`);
            topicsMap[subj.id] = chaptersList;
          } catch {
            topicsMap[subj.id] = [];
          }
        })
      );
      setSubjectTopicsMap(topicsMap);
    } catch {
      // Backend fallback graceful data
    }
  }

  async function fetchAnalyticsData() {
    setLoadingAnalytics(true);
    try {
      const res = await api.get<AnalyticsData>("/api/v1/student/analytics", true);
      setAnalytics(res);
    } catch {
      // Fallback data if no analytics yet
    } finally {
      setLoadingAnalytics(false);
    }
  }

  // --- Countdown Timer for CBT Engine ---
  useEffect(() => {
    if (!testSession || testSession.timeRemaining <= 0 || testResult) return;

    const timer = setInterval(() => {
      setTestSession((prev) => {
        if (!prev) return null;
        if (prev.timeRemaining <= 1) {
          clearInterval(timer);
          handleAutoSubmitTest(prev);
          return { ...prev, timeRemaining: 0 };
        }
        return { ...prev, timeRemaining: prev.timeRemaining - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [testSession, testResult]);

  function handleLogout() {
    clearToken();
    router.push("/");
  }

  function toggleTopicSelection(topicId: string, subjectId: string) {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
    if (!selectedSubjectIds.includes(subjectId)) {
      setSelectedSubjectIds((prev) => [...prev, subjectId]);
    }
  }

  function toggleSubjectSelection(subjectId: string) {
    const isSelected = selectedSubjectIds.includes(subjectId);
    if (isSelected) {
      setSelectedSubjectIds((prev) => prev.filter((id) => id !== subjectId));
      const subjTopics = (subjectTopicsMap[subjectId] || []).map((t) => t.id);
      setSelectedTopicIds((prev) => prev.filter((id) => !subjTopics.includes(id)));
    } else {
      setSelectedSubjectIds((prev) => [...prev, subjectId]);
      const subjTopics = (subjectTopicsMap[subjectId] || []).map((t) => t.id);
      setSelectedTopicIds((prev) => Array.from(new Set([...prev, ...subjTopics])));
    }
  }

  // --- Generate & Launch CBT Test Session ---
  async function startTest(options: {
    title: string;
    mode: "topic" | "multi_topic" | "subject" | "full_length" | "custom";
    subjectIds?: string[];
    topicIds?: string[];
    count?: number;
    durationMins?: number;
  }) {
    setLoadingTest(true);
    setError(null);
    setTestResult(null);

    const targetSubjIds = options.subjectIds || selectedSubjectIds;
    const targetTopicIds = options.topicIds || selectedTopicIds;
    const qCount = options.count || questionCount;
    const duration = (options.durationMins || Math.max(10, Math.round(qCount * 1.2))) * 60;

    try {
      const res = await api.post<{
        mode: string;
        total_questions: number;
        questions: TestQuestion[];
      }>("/api/v1/questions/mock-test", {
        exam_type_id: selectedExamId || undefined,
        subject_ids: targetSubjIds,
        topic_ids: targetTopicIds,
        mode: options.mode,
        question_count: qCount,
        difficulty: difficulty,
      });

      if (!res.questions || res.questions.length === 0) {
        setError("No questions could be fetched for the selected configuration.");
        setLoadingTest(false);
        return;
      }

      const uniqueSubjNames = Array.from(
        new Set(
          res.questions.map((q) => {
            const s = subjects.find((sub) => sub.id === q.subject_id);
            return s ? s.name : "General";
          })
        )
      );

      setTestSession({
        title: options.title,
        questions: res.questions,
        activeIdx: 0,
        userAnswers: {},
        markedReview: {},
        timeRemaining: duration,
        startTime: Date.now(),
        subjectTabs: uniqueSubjNames,
        activeSubjectTab: uniqueSubjNames[0] || "General",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate test.");
    } finally {
      setLoadingTest(false);
    }
  }

  async function handleAutoSubmitTest(sessionToSubmit: typeof testSession) {
    if (!sessionToSubmit || submittingTest) return;
    await submitTestAnswers(sessionToSubmit);
  }

  async function submitTestAnswers(sessionData = testSession) {
    if (!sessionData) return;
    setSubmittingTest(true);
    try {
      const elapsed = Math.round((Date.now() - sessionData.startTime) / 1000);
      const res = await api.post<TestResult>(
        "/api/v1/questions/submit-test",
        {
          exam_type_id: selectedExamId || undefined,
          test_title: sessionData.title,
          time_taken_seconds: elapsed,
          user_answers: sessionData.userAnswers,
          questions: sessionData.questions,
        },
        true
      );

      setTestResult(res);
      fetchAnalyticsData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to calculate test scorecard.");
    } finally {
      setSubmittingTest(false);
    }
  }

  // --- Generate Printable Mock Papers Package for Teachers ---
  async function generateMockPaperPackage() {
    setGeneratingMockPackage(true);
    try {
      const selectedExamObj = exams.find((e) => e.id === selectedExamId);
      const res = await api.post<MockPaperPackage>("/api/v1/questions/download-mock-paper", {
        title: mockPaperTitle,
        question_count: mockPaperCount,
        exam_code: selectedExamObj ? selectedExamObj.code : "NEET/KCET/JEE",
        subject_ids: selectedSubjectIds,
        topic_ids: selectedTopicIds,
        difficulty: difficulty,
      });
      setMockPackage(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate mock paper package.");
    } finally {
      setGeneratingMockPackage(false);
    }
  }

  // Open Clean Print Window for Test Paper (Questions Only)
  function printTestPaperOnly() {
    if (!mockPackage) return;
    const printWin = window.open("", "_blank");
    if (!printWin) return;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${mockPackage.test_paper.title}</title>
          <style>
            body { font-family: 'Times New Roman', serif; padding: 30px; color: #111; line-height: 1.5; }
            .header-box { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
            .header-box h1 { font-size: 22px; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
            .header-box p { font-size: 13px; margin: 4px 0 0 0; color: #333; }
            .instructions { font-size: 12px; background: #f8f9fa; border: 1px solid #ddd; padding: 10px; margin-bottom: 25px; }
            .question-block { margin-bottom: 20px; page-break-inside: avoid; }
            .q-title { font-size: 14px; font-weight: bold; margin-bottom: 6px; }
            .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; margin-left: 20px; }
            .opt-box { padding: 4px; }
            .omr-grid { margin-top: 40px; border-top: 2px dashed #333; padding-top: 20px; page-break-before: always; }
            .omr-title { text-align: center; font-weight: bold; margin-bottom: 15px; text-transform: uppercase; }
            .omr-row { display: flex; gap: 15px; font-size: 12px; font-family: monospace; margin-bottom: 6px; justify-content: center; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header-box">
            <h1>SAMAI NATIONAL EXAMINATION PORTAL</h1>
            <p><strong>${mockPackage.title}</strong></p>
            <p>Target Exam: ${mockPackage.exam_code} | Total Questions: ${mockPackage.total_questions} | Maximum Score: ${mockPackage.total_questions * 4}</p>
          </div>
          <div class="instructions">
            <strong>EXAMINATION INSTRUCTIONS FOR STUDENTS:</strong><br/>
            1. Total Duration: ${Math.round(mockPackage.total_questions * 1.2)} Minutes.<br/>
            2. Marking Scheme: Each correct response carries +4 marks. Each incorrect response incurs -1 mark penalty.<br/>
            3. Use blue or black ballpoint pen to fill your answers in the OMR grid provided on the last page.
          </div>
          <div>
            ${mockPackage.test_paper.html_rendered}
          </div>

          <div class="omr-grid">
            <div class="omr-title">OFFICIAL STUDENT ANSWER OMR RESPONSE SHEET</div>
            ${Array.from({ length: Math.ceil(mockPackage.total_questions / 5) }).map((_, rIdx) => {
              const startQ = rIdx * 5 + 1;
              return `
                <div class="omr-row">
                  ${Array.from({ length: 5 }).map((_, cIdx) => {
                    const qNum = startQ + cIdx;
                    if (qNum > mockPackage.total_questions) return "";
                    return `<span>Q${qNum.toString().padStart(2, "0")}: (A) (B) (C) (D)</span>`;
                  }).join(" | ")}
                </div>
              `;
            }).join("")}
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
    printWin.document.close();
  }

  // Open Clean Print Window for Master Answer Key & Solutions Paper (For Teachers)
  function printKeyAnswerPaperOnly() {
    if (!mockPackage) return;
    const printWin = window.open("", "_blank");
    if (!printWin) return;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${mockPackage.key_answer_paper.title}</title>
          <style>
            body { font-family: 'Times New Roman', serif; padding: 30px; color: #111; line-height: 1.5; }
            .header-box { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
            .header-box h1 { font-size: 22px; margin: 0; text-transform: uppercase; color: #1e3a8a; }
            .header-box p { font-size: 13px; margin: 4px 0 0 0; color: #333; }
            .matrix-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; text-align: center; }
            .matrix-table th, .matrix-table td { border: 1px solid #333; padding: 6px; }
            .matrix-table th { background: #f1f5f9; }
            .sol-block { margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; page-break-inside: avoid; }
            .q-title { font-size: 14px; font-weight: bold; margin-bottom: 4px; }
            .ans-key { font-size: 13px; color: #047857; margin-bottom: 6px; }
            .explanation { font-size: 13px; background: #f8fafc; padding: 8px; border-left: 3px solid #3b82f6; color: #334155; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header-box">
            <h1>SAMAI TEACHER EVALUATION HUB</h1>
            <p><strong>${mockPackage.key_answer_paper.title}</strong></p>
            <p>Official Answer Keys & Grounded Step-by-Step Solutions</p>
          </div>

          <h3>MASTER ANSWER KEY MATRIX</h3>
          <table class="matrix-table">
            <thead>
              <tr>
                <th>Q#</th><th>KEY</th><th>Q#</th><th>KEY</th><th>Q#</th><th>KEY</th><th>Q#</th><th>KEY</th><th>Q#</th><th>KEY</th>
              </tr>
            </thead>
            <tbody>
              ${Array.from({ length: Math.ceil(mockPackage.total_questions / 5) }).map((_, rIdx) => {
                return `
                  <tr>
                    ${Array.from({ length: 5 }).map((_, cIdx) => {
                      const qIdx = rIdx * 5 + cIdx;
                      if (qIdx >= mockPackage.total_questions) return "<td>-</td><td>-</td>";
                      const q = mockPackage.key_answer_paper.solutions[qIdx];
                      return `<td>Q${qIdx+1}</td><td><strong>(${q?.correct_answer || "A"})</strong></td>`;
                    }).join("")}
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>

          <h3>DETAILED STEP-BY-STEP EXPLANATIONS</h3>
          <div>
            ${mockPackage.key_answer_paper.html_rendered}
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
    printWin.document.close();
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  if (error && !student) {
    return <p className="p-8 text-slate">{error}</p>;
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6 text-slate">
        <div className="text-center space-y-3">
          <div className="animate-spin text-2xl">⏳</div>
          <p className="font-serif text-lg">Loading SamAI Student Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-paper text-ink font-sans pb-20">
      {/* Top Navbar */}
      <header className="border-b border-line bg-paper sticky top-0 z-30 shadow-sm">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-ink hover:opacity-80">
              SamAI <span className="text-xs font-sans font-normal bg-indigo text-paper px-2 py-0.5 rounded">Student Portal</span>
            </Link>

            {/* Navigation Mode Tabs */}
            <div className="hidden md:flex items-center gap-2 border-l border-line pl-6">
              <button
                onClick={() => setActiveTab("cbt")}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  activeTab === "cbt" ? "bg-indigo text-paper font-bold" : "text-slate hover:text-ink"
                }`}
              >
                🎯 CBT Practice & Mock Tests
              </button>
              <button
                onClick={() => setActiveTab("analytics")}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  activeTab === "analytics" ? "bg-indigo text-paper font-bold" : "text-slate hover:text-ink"
                }`}
              >
                📊 Performance & Graph Analytics
              </button>
              <button
                onClick={() => setActiveTab("download_papers")}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  activeTab === "download_papers" ? "bg-indigo text-paper font-bold" : "text-slate hover:text-ink"
                }`}
              >
                📥 Teacher Mock Papers Download
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-slate hidden sm:inline-block">
              {student.name} ({student.email})
            </span>
            <button
              onClick={handleLogout}
              className="text-xs font-medium text-ink hover:text-indigo border border-line px-3 py-1.5 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex border-b border-line bg-white px-4 py-2 gap-2 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab("cbt")}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${activeTab === "cbt" ? "bg-indigo text-paper font-bold" : "text-slate"}`}
        >
          🎯 CBT Tests
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${activeTab === "analytics" ? "bg-indigo text-paper font-bold" : "text-slate"}`}
        >
          📊 Performance Graph
        </button>
        <button
          onClick={() => setActiveTab("download_papers")}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${activeTab === "download_papers" ? "bg-indigo text-paper font-bold" : "text-slate"}`}
        >
          📥 Mock Papers
        </button>
      </div>

      {/* CBT ACTIVE TEST ENGINE INTERFACE */}
      {testSession && !testResult ? (
        <div className="mx-auto max-w-7xl px-6 pt-6">
          <div className="border border-line bg-ink text-paper p-4 flex flex-wrap items-center justify-between gap-4 mb-6 shadow-md">
            <div>
              <h1 className="font-serif text-xl font-bold text-paper">{testSession.title}</h1>
              <p className="text-xs text-paper/70 mt-0.5">
                Question {testSession.activeIdx + 1} of {testSession.questions.length} | Marking: +4.0 / -1.0
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="bg-amber/20 border border-amber/50 px-4 py-2 rounded text-center">
                <span className="text-xs uppercase font-mono block text-amber font-semibold">Time Remaining</span>
                <span className="font-mono text-xl font-bold text-amber">
                  {formatTime(testSession.timeRemaining)}
                </span>
              </div>
              <button
                onClick={() => submitTestAnswers()}
                disabled={submittingTest}
                className="bg-emerald-600 hover:bg-emerald-700 text-paper font-medium text-sm px-5 py-2.5 transition-colors shadow"
              >
                {submittingTest ? "Submitting..." : "Submit Test Paper"}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-line mb-6 overflow-x-auto pb-2">
            {testSession.subjectTabs.map((subName) => (
              <button
                key={subName}
                onClick={() =>
                  setTestSession((prev) => (prev ? { ...prev, activeSubjectTab: subName } : null))
                }
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  testSession.activeSubjectTab === subName
                    ? "border-indigo text-indigo font-bold bg-indigo/5"
                    : "border-transparent text-slate hover:text-ink"
                }`}
              >
                Section: {subName}
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 border border-line bg-white p-6 sm:p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-3 mb-6">
                  <span className="font-mono text-xs font-semibold bg-line/40 px-2.5 py-1 text-ink uppercase">
                    Question #{testSession.activeIdx + 1}
                  </span>
                  <span className="text-xs font-medium text-indigo capitalize bg-indigo/10 px-2 py-0.5 border border-indigo/20">
                    Difficulty: {testSession.questions[testSession.activeIdx]?.difficulty || "Moderate"}
                  </span>
                </div>

                <h2 className="text-base sm:text-lg font-medium text-ink leading-relaxed mb-6">
                  {testSession.questions[testSession.activeIdx]?.question_text}
                </h2>

                <div className="space-y-3 mb-8">
                  {Object.entries(testSession.questions[testSession.activeIdx]?.options || {}).map(
                    ([optKey, optVal]) => {
                      const qId = testSession.questions[testSession.activeIdx].id;
                      const isSelected = testSession.userAnswers[qId] === optKey;
                      return (
                        <div
                          key={optKey}
                          onClick={() => {
                            setTestSession((prev) => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                userAnswers: { ...prev.userAnswers, [qId]: optKey },
                              };
                            });
                          }}
                          className={`cursor-pointer p-4 border transition-all flex items-start gap-3 ${
                            isSelected
                              ? "border-indigo bg-indigo/10 text-indigo font-medium shadow-sm ring-1 ring-indigo"
                              : "border-line bg-paper text-slate hover:border-ink hover:text-ink"
                          }`}
                        >
                          <span
                            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${
                              isSelected ? "bg-indigo text-paper border-indigo" : "border-slate text-slate"
                            }`}
                          >
                            {optKey}
                          </span>
                          <span className="text-sm pt-0.5 leading-relaxed">{optVal}</span>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t border-line">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const qId = testSession.questions[testSession.activeIdx].id;
                      setTestSession((prev) => {
                        if (!prev) return null;
                        const copy = { ...prev.userAnswers };
                        delete copy[qId];
                        return { ...prev, userAnswers: copy };
                      });
                    }}
                    className="px-3.5 py-2 border border-line text-xs font-medium text-slate hover:border-ink hover:text-ink"
                  >
                    Clear Response
                  </button>
                  <button
                    onClick={() => {
                      const qId = testSession.questions[testSession.activeIdx].id;
                      setTestSession((prev) => {
                        if (!prev) return null;
                        return {
                          ...prev,
                          markedReview: {
                            ...prev.markedReview,
                            [qId]: !prev.markedReview[qId],
                          },
                        };
                      });
                    }}
                    className={`px-3.5 py-2 border text-xs font-medium transition-colors ${
                      testSession.markedReview[testSession.questions[testSession.activeIdx].id]
                        ? "bg-amber text-paper border-amber"
                        : "border-line text-slate hover:border-amber hover:text-amber"
                    }`}
                  >
                    {testSession.markedReview[testSession.questions[testSession.activeIdx].id]
                      ? "★ Marked for Review"
                      : "☆ Mark for Review"}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    disabled={testSession.activeIdx === 0}
                    onClick={() =>
                      setTestSession((prev) => (prev ? { ...prev, activeIdx: prev.activeIdx - 1 } : null))
                    }
                    className="px-4 py-2 border border-line text-xs font-medium text-slate hover:border-ink disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <button
                    disabled={testSession.activeIdx === testSession.questions.length - 1}
                    onClick={() =>
                      setTestSession((prev) => (prev ? { ...prev, activeIdx: prev.activeIdx + 1 } : null))
                    }
                    className="px-4 py-2 bg-ink text-paper text-xs font-medium hover:bg-indigo disabled:opacity-40"
                  >
                    Next Question →
                  </button>
                </div>
              </div>
            </div>

            <div className="border border-line bg-paper p-6 shadow-sm">
              <h3 className="font-serif font-bold text-base text-ink mb-3 pb-2 border-b border-line">
                Question Palette
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate mb-5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-emerald-600 rounded-full inline-block"></span> Answered
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-paper border border-slate rounded-full inline-block"></span> Unanswered
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-amber rounded-full inline-block"></span> Marked Review
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-indigo rounded-full inline-block"></span> Current
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 max-h-80 overflow-y-auto pr-1">
                {testSession.questions.map((q, idx) => {
                  const isAnswered = testSession.userAnswers[q.id] !== undefined;
                  const isMarked = testSession.markedReview[q.id];
                  const isCurrent = idx === testSession.activeIdx;

                  let btnStyle = "bg-white text-slate border-line";
                  if (isCurrent) btnStyle = "bg-indigo text-paper border-indigo font-bold ring-2 ring-indigo/50";
                  else if (isMarked) btnStyle = "bg-amber text-paper border-amber font-bold";
                  else if (isAnswered) btnStyle = "bg-emerald-600 text-paper border-emerald-600 font-bold";

                  return (
                    <button
                      key={q.id}
                      onClick={() =>
                        setTestSession((prev) => (prev ? { ...prev, activeIdx: idx } : null))
                      }
                      className={`h-9 w-full border text-xs flex items-center justify-center transition-all ${btnStyle}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-line">
                <button
                  onClick={() => setTestSession(null)}
                  className="w-full py-2 border border-red-300 text-red-700 text-xs font-medium hover:bg-red-50"
                >
                  Exit Test Session
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : testResult ? (
        /* SCORECARD & SOLUTION ANALYSIS SCREEN */
        <div className="mx-auto max-w-5xl px-6 pt-8">
          <div className="border border-line bg-paper p-8 shadow-md mb-8">
            <div className="flex items-center justify-between border-b border-line pb-4 mb-6">
              <div>
                <h1 className="font-serif text-3xl font-bold text-ink">Test Performance Analytics</h1>
                <p className="text-xs text-slate mt-1">Official Scorecard & Detailed Grounded Solutions</p>
              </div>
              <button
                onClick={() => setTestResult(null)}
                className="px-4 py-2 bg-ink text-paper text-xs font-medium hover:bg-indigo"
              >
                Back to Dashboard
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="border border-line bg-white p-4 text-center">
                <span className="text-xs text-slate uppercase block font-mono">Score Achieved</span>
                <span className="font-serif text-3xl font-bold text-indigo mt-1 block">
                  {testResult.score} / {testResult.max_score}
                </span>
              </div>
              <div className="border border-line bg-white p-4 text-center">
                <span className="text-xs text-slate uppercase block font-mono">Accuracy %</span>
                <span className="font-serif text-3xl font-bold text-emerald-600 mt-1 block">
                  {testResult.accuracy || testResult.percentage}%
                </span>
              </div>
              <div className="border border-line bg-white p-4 text-center">
                <span className="text-xs text-slate uppercase block font-mono">Correct / Total</span>
                <span className="font-serif text-3xl font-bold text-ink mt-1 block">
                  {testResult.correct_count} / {testResult.total_questions}
                </span>
              </div>
              <div className="border border-line bg-white p-4 text-center">
                <span className="text-xs text-slate uppercase block font-mono">Time Taken</span>
                <span className="font-serif text-3xl font-bold text-slate mt-1 block font-mono">
                  {formatTime(testResult.time_taken_seconds)}
                </span>
              </div>
            </div>

            <h2 className="font-serif text-xl font-bold text-ink mb-4">
              Detailed Question Solutions & Answers
            </h2>
            <div className="space-y-4">
              {testResult.solutions.map((sol, idx) => (
                <div
                  key={sol.id || idx}
                  className={`p-5 border text-sm ${
                    sol.is_correct
                      ? "border-emerald-300 bg-emerald-50/50"
                      : sol.is_unattempted
                      ? "border-line bg-white"
                      : "border-red-300 bg-red-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-ink">Q{idx + 1}</span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        sol.is_correct
                          ? "bg-emerald-600 text-paper"
                          : sol.is_unattempted
                          ? "bg-slate/20 text-slate"
                          : "bg-red-600 text-paper"
                      }`}
                    >
                      {sol.is_correct ? "+4 Correct" : sol.is_unattempted ? "Unattempted" : "-1 Incorrect"}
                    </span>
                  </div>

                  <p className="font-medium text-ink mb-3">{sol.question_text}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    {Object.entries(sol.options || {}).map(([key, val]) => (
                      <div
                        key={key}
                        className={`p-2 border ${
                          key === sol.correct_answer
                            ? "border-emerald-600 bg-emerald-100 font-bold text-emerald-900"
                            : key === sol.user_answer
                            ? "border-red-600 bg-red-100 text-red-900"
                            : "border-line bg-white text-slate"
                        }`}
                      >
                        <strong>{key}:</strong> {val}
                      </div>
                    ))}
                  </div>

                  <div className="bg-paper p-3 border border-line text-xs text-slate leading-relaxed">
                    <strong className="text-indigo font-semibold block mb-1">Grounded Explanation:</strong>
                    {sol.explanation}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === "analytics" ? (
        /* TAB 2: STUDENT TRACKING & PERFORMANCE GRAPH ANALYTICS */
        <div className="mx-auto max-w-7xl px-6 pt-8">
          <div className="border-b border-line pb-6 mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl font-bold text-ink">Student Performance & Progress Graph</h1>
              <p className="text-slate text-sm mt-1">
                Real-time tracking of test attempts, score trajectory over time, subject mastery, and NEET/KCET/JEE exam readiness.
              </p>
            </div>
            <button
              onClick={fetchAnalyticsData}
              className="px-4 py-2 border border-line text-xs font-medium text-slate hover:text-ink"
            >
              🔄 Refresh Analytics
            </button>
          </div>

          {loadingAnalytics ? (
            <div className="p-12 text-center text-slate">Loading student performance analytics...</div>
          ) : analytics ? (
            <div className="space-y-10">
              {/* Summary Scorecard Row */}
              <div className="grid sm:grid-cols-4 gap-6">
                <div className="border border-line bg-white p-6 text-center shadow-sm">
                  <span className="text-xs text-slate uppercase block font-mono">Total Tests Taken</span>
                  <span className="font-serif text-3xl font-bold text-indigo mt-2 block">{analytics.total_tests}</span>
                </div>
                <div className="border border-line bg-white p-6 text-center shadow-sm">
                  <span className="text-xs text-slate uppercase block font-mono">Average Score %</span>
                  <span className="font-serif text-3xl font-bold text-emerald-600 mt-2 block">
                    {analytics.average_percentage}%
                  </span>
                </div>
                <div className="border border-line bg-white p-6 text-center shadow-sm">
                  <span className="text-xs text-slate uppercase block font-mono">Overall Accuracy</span>
                  <span className="font-serif text-3xl font-bold text-ink mt-2 block">
                    {analytics.overall_accuracy}%
                  </span>
                </div>
                <div className="border border-line bg-white p-6 text-center shadow-sm">
                  <span className="text-xs text-slate uppercase block font-mono">Exam Readiness Index</span>
                  <span className="font-serif text-3xl font-bold text-amber mt-2 block">
                    {analytics.readiness_index}/100
                  </span>
                  <span className="text-[10px] text-slate mt-1 block leading-tight">{analytics.readiness_label}</span>
                </div>
              </div>

              {/* VISUAL SCORE TRAJECTORY GRAPH (SVG Line & Bar Chart) */}
              <div className="border border-line bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-line pb-4 mb-6">
                  <div>
                    <h2 className="font-serif text-xl font-bold text-ink">Score Performance Trajectory Graph</h2>
                    <p className="text-xs text-slate">Historical score percentage across past test attempts</p>
                  </div>
                </div>

                {analytics.score_history.length > 0 ? (
                  <div className="h-64 w-full flex items-end gap-4 pt-8 pb-4 px-2 border-b border-line bg-paper/50 relative">
                    {analytics.score_history.map((item, idx) => {
                      const heightPct = Math.max(10, Math.min(100, item.percentage));
                      return (
                        <div key={item.id || idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                          {/* Tooltip on hover */}
                          <div className="absolute -top-12 hidden group-hover:block bg-ink text-paper text-[10px] p-2 rounded shadow-lg whitespace-nowrap z-20">
                            <strong>{item.test_title}</strong><br />
                            Score: {item.score} ({item.percentage}%) | Accuracy: {item.accuracy}%
                          </div>

                          <span className="text-[11px] font-bold text-indigo mb-1">{item.percentage}%</span>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full bg-gradient-to-t from-indigo to-indigo/70 rounded-t transition-all group-hover:from-emerald-600 group-hover:to-emerald-400"
                          ></div>
                          <span className="text-[10px] text-slate truncate w-full text-center mt-2">
                            {item.date}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-slate bg-paper">
                    Take your first CBT practice test to view your performance trajectory graph.
                  </div>
                )}
              </div>

              {/* SUBJECT MASTERY BREAKDOWN */}
              <div className="grid lg:grid-cols-2 gap-8">
                <div className="border border-line bg-white p-6 shadow-sm">
                  <h2 className="font-serif text-xl font-bold text-ink mb-4 pb-2 border-b border-line">
                    Subject Accuracy & Mastery Meters
                  </h2>
                  <div className="space-y-5">
                    {analytics.subject_breakdown.map((sb) => (
                      <div key={sb.subject_name}>
                        <div className="flex justify-between text-xs font-semibold text-ink mb-1.5">
                          <span>{sb.subject_name}</span>
                          <span className="text-indigo">{sb.accuracy}% Accuracy</span>
                        </div>
                        <div className="w-full bg-line h-3 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.min(100, sb.accuracy)}%` }}
                            className="bg-indigo h-full transition-all"
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-line bg-white p-6 shadow-sm">
                  <h2 className="font-serif text-xl font-bold text-ink mb-4 pb-2 border-b border-line">
                    AI Topic Insights & Recommendations
                  </h2>
                  <div className="space-y-4 text-xs">
                    <div className="p-4 bg-amber-50 border border-amber-200">
                      <strong className="text-amber-900 font-bold block mb-1">⚠️ Focus Areas (Weak Topics):</strong>
                      <ul className="list-disc pl-4 space-y-1 text-amber-800">
                        {analytics.weak_topics.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 bg-emerald-50 border border-emerald-200">
                      <strong className="text-emerald-900 font-bold block mb-1">✅ High Mastery Topics:</strong>
                      <ul className="list-disc pl-4 space-y-1 text-emerald-800">
                        {analytics.strong_topics.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        /* TAB 3: TEACHER & STUDENT MOCK PAPER DOWNLOADER */
        activeTab === "download_papers" ? (
          <div className="mx-auto max-w-5xl px-6 pt-8">
            <div className="border border-line bg-white p-8 shadow-md">
              <div className="border-b border-line pb-6 mb-8">
                <h1 className="font-serif text-3xl font-bold text-ink">Teacher & Student Mock Paper Downloader</h1>
                <p className="text-slate text-sm mt-1">
                  Generate 2 distinct printable documents: (1) Test Question Paper for students, and (2) Master Answer Key & Solutions Paper for teachers.
                </p>
              </div>

              {/* Config Form */}
              <div className="grid sm:grid-cols-2 gap-6 mb-8 bg-paper p-6 border border-line">
                <div>
                  <label className="text-xs font-bold text-ink uppercase block mb-2">Paper Title</label>
                  <input
                    type="text"
                    value={mockPaperTitle}
                    onChange={(e) => setMockPaperTitle(e.target.value)}
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-ink uppercase block mb-2">Number of Questions</label>
                  <select
                    value={mockPaperCount}
                    onChange={(e) => setMockPaperCount(Number(e.target.value))}
                    className="w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
                  >
                    <option value={15}>15 Questions (Quick Test)</option>
                    <option value={30}>30 Questions (Standard Subject Mock)</option>
                    <option value={45}>45 Questions (NEET Subject Mock)</option>
                    <option value={90}>90 Questions (JEE Main Mock)</option>
                    <option value={180}>180 Questions (Full NEET Mock Paper)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={generateMockPaperPackage}
                disabled={generatingMockPackage}
                className="w-full bg-indigo text-paper py-3 font-medium text-sm hover:bg-ink transition-colors shadow mb-8 disabled:opacity-50"
              >
                {generatingMockPackage ? "Generating Printable Papers Package..." : "⚡ Generate 2 Mock Papers Package"}
              </button>

              {/* Generated Papers Download Buttons */}
              {mockPackage && (
                <div className="p-6 border border-indigo/30 bg-indigo/5 space-y-6">
                  <div className="border-b border-line pb-3">
                    <h3 className="font-serif text-xl font-bold text-ink">Package Ready for Download & Printing</h3>
                    <p className="text-xs text-slate mt-1">
                      {mockPackage.title} ({mockPackage.total_questions} Questions)
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    {/* Paper 1: Test Paper */}
                    <div className="border border-line bg-white p-6 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-3xl mb-2 block">📄</span>
                        <h4 className="font-serif text-lg font-bold text-ink">1. Test Question Paper</h4>
                        <p className="text-xs text-slate leading-relaxed mb-6 mt-1">
                          Clean student test paper with instructions, question list, multiple-choice options, and printable OMR answer bubble grid.
                        </p>
                      </div>
                      <button
                        onClick={printTestPaperOnly}
                        className="w-full bg-emerald-600 text-paper py-2.5 text-xs font-bold hover:bg-emerald-700 transition-colors shadow"
                      >
                        📥 Download / Print Test Paper (Questions Only)
                      </button>
                    </div>

                    {/* Paper 2: Answer Key & Solutions Paper */}
                    <div className="border border-line bg-white p-6 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-3xl mb-2 block">🔑</span>
                        <h4 className="font-serif text-lg font-bold text-ink">2. Master Key & Solutions Paper</h4>
                        <p className="text-xs text-slate leading-relaxed mb-6 mt-1">
                          Teacher evaluation paper with complete master answer key matrix and grounded step-by-step solutions for every question.
                        </p>
                      </div>
                      <button
                        onClick={printKeyAnswerPaperOnly}
                        className="w-full bg-indigo text-paper py-2.5 text-xs font-bold hover:bg-ink transition-colors shadow"
                      >
                        🔑 Download / Print Answer Key & Solutions Paper
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* TAB 1: MAIN CBT PRACTICE TESTS VIEW */
          <div className="mx-auto max-w-7xl px-6 pt-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6 mb-8">
              <div>
                <h1 className="font-serif text-3xl font-bold text-ink">Welcome, {student.name}</h1>
                <p className="text-slate text-sm mt-1">
                  Select your target exam and choose from subject sections, topic tests, or full-length CBT mock papers.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-white border border-line p-2 shadow-sm">
                <span className="text-xs font-bold text-ink font-serif uppercase px-2">Exam Mode:</span>
                <select
                  value={selectedExamId}
                  onChange={(e) => setSelectedExamId(e.target.value)}
                  className="border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-indigo focus:outline-none"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.code} — {ex.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-6 mb-10">
              <div className="border border-line bg-paper p-6 shadow-sm flex flex-col justify-between hover:border-indigo transition-colors">
                <div>
                  <span className="text-2xl mb-2 block">🎯</span>
                  <h3 className="font-serif text-lg font-bold text-ink mb-1">Full-Length CBT Mock Test</h3>
                  <p className="text-xs text-slate leading-relaxed mb-4">
                    Timed complete exam (180 Questions) following the official pattern across all subjects.
                  </p>
                </div>
                <button
                  onClick={() =>
                    startTest({
                      title: `${exams.find((e) => e.id === selectedExamId)?.code || "NEET"} Full-Length CBT Mock Test`,
                      mode: "full_length",
                      count: 45,
                      durationMins: 60,
                    })
                  }
                  disabled={loadingTest}
                  className="w-full bg-indigo text-paper py-2.5 text-xs font-medium hover:bg-ink transition-colors disabled:opacity-50 shadow-sm"
                >
                  {loadingTest ? "Generating Test..." : "🚀 Launch Full Mock Test"}
                </button>
              </div>

              <div className="border border-line bg-paper p-6 shadow-sm flex flex-col justify-between hover:border-indigo transition-colors">
                <div>
                  <span className="text-2xl mb-2 block">📑</span>
                  <h3 className="font-serif text-lg font-bold text-ink mb-1">Multiple Topic Test</h3>
                  <p className="text-xs text-slate leading-relaxed mb-4">
                    Select multiple topics using checkboxes under subject sections below to create a combined test paper.
                  </p>
                </div>
                <button
                  disabled={selectedTopicIds.length === 0 || loadingTest}
                  onClick={() =>
                    startTest({
                      title: `Multiple Topic Practice Test (${selectedTopicIds.length} Topics)`,
                      mode: "multi_topic",
                      topicIds: selectedTopicIds,
                      count: Math.min(50, Math.max(10, selectedTopicIds.length * 5)),
                    })
                  }
                  className="w-full bg-ink text-paper py-2.5 text-xs font-medium hover:bg-indigo transition-colors disabled:opacity-50 shadow-sm"
                >
                  {selectedTopicIds.length > 0
                    ? `Launch Test (${selectedTopicIds.length} Topics Selected)`
                    : "Check Topics Below to Enable"}
                </button>
              </div>

              <div className="border border-line bg-paper p-6 shadow-sm flex flex-col justify-between hover:border-indigo transition-colors">
                <div>
                  <span className="text-2xl mb-2 block">⚙️</span>
                  <h3 className="font-serif text-lg font-bold text-ink mb-1">Custom Test Generator</h3>
                  <p className="text-xs text-slate leading-relaxed mb-4">
                    Configure custom question counts (10 to 180 Qs), difficulty levels, and timer settings.
                  </p>
                </div>
                <div className="flex gap-2">
                  <select
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="w-1/2 border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none"
                  >
                    <option value={10}>10 Qs</option>
                    <option value={25}>25 Qs</option>
                    <option value={45}>45 Qs</option>
                    <option value={90}>90 Qs</option>
                  </select>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-1/2 border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none"
                  >
                    <option value="mixed">Mixed</option>
                    <option value="easy">Easy</option>
                    <option value="moderate">Moderate</option>
                    <option value="difficult">Difficult</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-10">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <h2 className="font-serif text-2xl font-bold text-ink">
                  Subject Curriculum Sections ({subjects.length} Sections)
                </h2>
                <span className="text-xs text-slate">
                  Click any topic card to take a 1-topic test, or select multiple checkboxes for a combined test paper.
                </span>
              </div>

              {subjects.map((subj, sIdx) => {
                const topicsList = subjectTopicsMap[subj.id] || [];
                const isSubjectSelected = selectedSubjectIds.includes(subj.id);

                return (
                  <section key={subj.id} className="border border-line bg-paper p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4 mb-6">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo text-paper text-sm font-bold font-serif">
                          {sIdx + 1}
                        </span>
                        <div>
                          <h3 className="font-serif text-xl font-bold text-ink">
                            Section {sIdx + 1}: {subj.name}
                          </h3>
                          <p className="text-xs text-slate">
                            {topicsList.length} approved topic{topicsList.length === 1 ? "" : "s"} under this subject
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleSubjectSelection(subj.id)}
                          className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                            isSubjectSelected
                              ? "bg-indigo/10 border-indigo text-indigo font-bold"
                              : "bg-white border-line text-slate hover:border-ink"
                          }`}
                        >
                          {isSubjectSelected ? "✓ Subject Selected" : "Select Entire Subject"}
                        </button>

                        <button
                          onClick={() =>
                            startTest({
                              title: `Full ${subj.name} Subject Test`,
                              mode: "subject",
                              subjectIds: [subj.id],
                              count: 25,
                            })
                          }
                          disabled={loadingTest}
                          className="px-4 py-1.5 bg-ink text-paper text-xs font-medium hover:bg-indigo transition-colors disabled:opacity-50"
                        >
                          📘 Take Full Subject Test
                        </button>
                      </div>
                    </div>

                    {topicsList.length > 0 ? (
                      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {topicsList.map((top) => {
                          const isChecked = selectedTopicIds.includes(top.id);
                          return (
                            <div
                              key={top.id}
                              className={`p-4 border transition-all flex flex-col justify-between ${
                                isChecked
                                  ? "border-indigo bg-indigo/10 text-indigo shadow-sm ring-1 ring-indigo"
                                  : "border-line bg-white text-ink hover:border-ink"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <span className="font-semibold text-sm leading-snug text-ink">{top.name}</span>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleTopicSelection(top.id, subj.id)}
                                  className="w-4 h-4 accent-indigo cursor-pointer mt-0.5"
                                />
                              </div>

                              <button
                                onClick={() =>
                                  startTest({
                                    title: `Topic Test: ${top.name}`,
                                    mode: "topic",
                                    topicIds: [top.id],
                                    count: 10,
                                  })
                                }
                                disabled={loadingTest}
                                className="mt-2 w-full py-1.5 border border-indigo/30 bg-white text-indigo hover:bg-indigo hover:text-paper text-xs font-medium transition-colors"
                              >
                                🎯 Take Topic Test (10 Qs)
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6 border border-dashed border-line bg-white text-center text-xs text-slate">
                        No topics added to {subj.name} yet. Admins can add topics in the Knowledge Base Hub.
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )
      )}
    </main>
  );
}
