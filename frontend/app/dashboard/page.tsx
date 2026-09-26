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
  subject_name?: string;
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
  strong_areas?: Array<{ topic: string; accuracy: number; correct: number; total: number }>;
  weak_areas?: Array<{ topic: string; accuracy: number; correct: number; total: number }>;
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
    total_questions?: number;
    accuracy: number;
    avg_score: number;
  }>;
  topic_breakdown?: Array<{
    topic_name: string;
    subject_name: string;
    attempts_count: number;
    total_questions: number;
    correct_count: number;
    accuracy: number;
    status: string;
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



function getExamPattern(examCode?: string, examName?: string, customPatternsList: any[] = []) {
  const code = (examCode || "").toUpperCase();
  const name = (examName || "").toUpperCase();

  const matched = customPatternsList.find((p) => {
    const pName = (p.name || "").toUpperCase();
    return pName.includes(code) || (code && pName.includes(code));
  });

  if (matched) {
    const qPerSubj = matched.questions_per_subject || {};
    const subjHint = Object.keys(qPerSubj).length > 0
      ? Object.entries(qPerSubj).map(([s, c]) => `${s}: ${c} Qs`).join(", ")
      : "Core Syllabus Subjects";

    return {
      name: matched.name || examName || "Entrance Exam",
      code: examCode || "EXAM",
      totalQuestions: matched.total_questions || 45,
      durationMins: matched.duration_minutes || 60,
      markingScheme: `${matched.positive_marks >= 0 ? "+" : ""}${matched.positive_marks} Correct, -${matched.negative_marks} Negative Marking`,
      positiveMarks: matched.positive_marks ?? 4,
      negativeMarks: matched.negative_marks ?? 1,
      description: "Admin configured examination pattern from Knowledge Base.",
      subjectsHint: subjHint,
      questions_per_subject: qPerSubj,
    };
  }

  return {
    name: examName || "Competitive Exam",
    code: examCode || "EXAM",
    totalQuestions: 45,
    durationMins: 60,
    markingScheme: "+4 Correct, -1 Negative Marking",
    positiveMarks: 4,
    negativeMarks: 1,
    description: "Standard Competitive Entrance Examination pattern.",
    subjectsHint: "Core Exam Syllabus Subjects",
    questions_per_subject: {},
  };
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "topic_exams" | "full_length" | "download_papers" | "analytics"
  >("topic_exams");

  // Curriculum State
  const [exams, setExams] = useState<ExamType[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectTopicsMap, setSubjectTopicsMap] = useState<Record<string, Chapter[]>>({});
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  // Instant Custom Topic Name Input
  const [customTopicInput, setCustomTopicInput] = useState<string>("");

  // Topic Test Generator Config (Up to 1000 Questions Pool)
  const [topicQuestionPoolSize, setTopicQuestionPoolSize] = useState<number>(10);
  const [questionCount, setQuestionCount] = useState<number>(45);
  const [difficulty, setDifficulty] = useState<string>("mixed");

  // Dynamic Pattern & Per-Subject Question Count State
  const [subjectQuestionCounts, setSubjectQuestionCounts] = useState<Record<string, number>>({});
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");
  const [paperFormatMode, setPaperFormatMode] = useState<"standard" | "custom">("custom");

  // CBT Test Engine State
  const [testSession, setTestSession] = useState<{
    title: string;
    examCode?: string;
    examName?: string;
    questions: TestQuestion[];
    activeIdx: number;
    userAnswers: Record<string, string>;
    checkedResponses: Record<string, { is_correct: boolean; correct_answer: string; explanation: string }>;
    markedReview: Record<string, boolean>;
    timeRemaining: number;
    startTime: number;
    subjectTabs: string[];
    activeSubjectTab: string;
    isTopicMapMode?: boolean;
  } | null>(null);

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [loadingTest, setLoadingTest] = useState(false);
  const [submittingTest, setSubmittingTest] = useState(false);

  // Analytics State
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Teacher Mock Paper Generator State
  const [mockPaperTitle, setMockPaperTitle] = useState("NEET / KCET / JEE All India Practice Mock Paper");
  const [mockPaperCount, setMockPaperCount] = useState(30);
  const [mockPackage, setMockPackage] = useState<MockPaperPackage | null>(null);
  const [generatingMockPackage, setGeneratingMockPackage] = useState(false);
  const [knowledgeBaseExams, setKnowledgeBaseExams] = useState<any[]>([]);
  const [mockExamId, setMockExamId] = useState<string>("all");
  const [mockSubjectId, setMockSubjectId] = useState<string>("all");
  const [mockSelectedSubjectIds, setMockSelectedSubjectIds] = useState<string[]>([]);
  const [mockTopicScope, setMockTopicScope] = useState<"all" | "selected">("all");
  const [mockSelectedTopics, setMockSelectedTopics] = useState<string[]>([]);
  const [mockDifficulty, setMockDifficulty] = useState<string>("mixed");
  const [fullLengthTopicScope, setFullLengthTopicScope] = useState<"all" | "selected">("all");
  const [positiveMarks, setPositiveMarks] = useState<number>(4);
  const [negativeMarks, setNegativeMarks] = useState<number>(1);

  const [customPatterns, setCustomPatterns] = useState<any[]>([]);

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

  // Load Analytics when Analytics tab is opened or selected exam changes
  useEffect(() => {
    if (activeTab === "analytics") {
      fetchAnalyticsData(selectedExamId);
    }
  }, [activeTab, selectedExamId]);

  async function loadCurriculumData() {
    try {
      const [kbRes, patternsList] = await Promise.all([
        api.get<{ exams: any[]; patterns?: any[] }>("/api/v1/questions/knowledge-base-options"),
        api.get<any[]>("/api/v1/questions/patterns").catch(() => []),
      ]);

      const kbExams = kbRes.exams || [];
      const loadedPatterns = (kbRes.patterns && kbRes.patterns.length > 0)
        ? kbRes.patterns
        : (patternsList || []);

      setKnowledgeBaseExams(kbExams);
      setCustomPatterns(loadedPatterns);

      const parsedExams: ExamType[] = [];
      const parsedSubjects: Subject[] = [];
      const topicsMap: Record<string, any[]> = {};

      kbExams.forEach((ex: any) => {
        parsedExams.push({ id: ex.id, code: ex.code, name: ex.name });
        (ex.subjects || []).forEach((sb: any) => {
          parsedSubjects.push({ id: sb.id, exam_type_id: ex.id, name: sb.name });
          const subTopicsList: any[] = [];
          (sb.chapters || []).forEach((ch: any) => {
            (ch.topics || []).forEach((tp: any) => {
              subTopicsList.push({
                id: tp.id,
                chapter_id: ch.id,
                name: tp.name,
              });
            });
          });
          // Fallback to chapter names if no subtopics created under chapter
          if (subTopicsList.length === 0 && (sb.chapters || []).length > 0) {
            (sb.chapters || []).forEach((ch: any) => {
              subTopicsList.push({ id: ch.id, chapter_id: ch.id, name: ch.name });
            });
          }
          topicsMap[sb.id] = subTopicsList;
        });
      });

      if (parsedExams.length === 0) {
        parsedExams.push(
          { id: "neet-default-id", code: "NEET", name: "NEET Medical Entrance Exam" },
          { id: "kcet-default-id", code: "KCET", name: "KCET Engineering & Pharmacy Exam" },
          { id: "jee-default-id", code: "JEE", name: "JEE Main & Advanced Exam" }
        );
      }

      setExams(parsedExams);
      setSubjects(parsedSubjects);
      setSubjectTopicsMap(topicsMap);

      if (parsedExams.length > 0) {
        setSelectedExamId((prev) => prev || parsedExams[0].id);
        setMockExamId((prev) => (prev === "all" ? prev : parsedExams[0].id));
      }
    } catch (err) {
      console.error("[STUDENT CURRICULUM LOAD ERROR]", err);
      setExams([
        { id: "neet-default-id", code: "NEET", name: "NEET Medical Entrance Exam" },
        { id: "kcet-default-id", code: "KCET", name: "KCET Engineering & Pharmacy Exam" },
        { id: "jee-default-id", code: "JEE", name: "JEE Main & Advanced Exam" }
      ]);
    }
  }

  function applyAdminPattern(pattern: any) {
    if (!pattern) return;
    setSelectedPatternId(pattern.id);
    setPositiveMarks(pattern.positive_marks ?? 4);
    setNegativeMarks(pattern.negative_marks ?? 1);
    setMockPaperCount(pattern.total_questions || 45);
    setQuestionCount(pattern.total_questions || 45);

    const qPerSubj = pattern.questions_per_subject || {};
    if (Object.keys(qPerSubj).length > 0) {
      setSubjectQuestionCounts(qPerSubj);

      const matchedIds: string[] = [];
      subjects.forEach((s) => {
        const matchingKey = Object.keys(qPerSubj).find((k) => k.toLowerCase() === s.name.toLowerCase());
        if (matchingKey) {
          matchedIds.push(s.id);
        }
      });
      if (matchedIds.length > 0) {
        setSelectedSubjectIds(matchedIds);
        setMockSelectedSubjectIds(matchedIds);
      }
    }
  }

  const activeExamObj = exams.find((e) => e.id === selectedExamId) || exams[0];
  const activeCustomPattern = customPatterns.find((p) => p.id === selectedPatternId || p.exam_type_id === selectedExamId);

  const activePattern = (() => {
    if (activeCustomPattern) {
      const qPerSubj = activeCustomPattern.questions_per_subject || {};
      const subjHint = Object.keys(qPerSubj).length > 0
        ? Object.entries(qPerSubj).map(([s, c]) => `${s}: ${c} Qs`).join(", ")
        : "Core Syllabus Subjects";

      return {
        name: activeCustomPattern.name || activeExamObj?.name || "Entrance Exam",
        code: activeExamObj?.code || "EXAM",
        totalQuestions: activeCustomPattern.total_questions || 45,
        durationMins: activeCustomPattern.duration_minutes || 60,
        markingScheme: `${activeCustomPattern.positive_marks >= 0 ? "+" : ""}${activeCustomPattern.positive_marks} Correct, -${activeCustomPattern.negative_marks} Negative Marking`,
        positiveMarks: activeCustomPattern.positive_marks,
        negativeMarks: activeCustomPattern.negative_marks,
        description: "Admin configured examination pattern from Knowledge Base.",
        subjectsHint: subjHint,
        questions_per_subject: qPerSubj,
      };
    }
    return getExamPattern(activeExamObj?.code, activeExamObj?.name, customPatterns);
  })();

  // Filter subjects by selected exam section in sidebar
  const examSubjects = selectedExamId
    ? subjects.filter((s) => s.exam_type_id === selectedExamId)
    : subjects;
  const displaySubjects = examSubjects.length > 0 ? examSubjects : subjects;

  const selectedKnowledgeExam = knowledgeBaseExams.find((e) => e.id === mockExamId);
  const availableKnowledgeTopics: Array<{ id: string; name: string; topics: Array<{ id: string; name: string }> }> =
    selectedKnowledgeExam
      ? selectedKnowledgeExam.subjects.flatMap((s: any) => s.chapters || [])
      : knowledgeBaseExams.flatMap((e: any) => (e.subjects || []).flatMap((s: any) => s.chapters || []));

  async function fetchAnalyticsData(targetExamId?: string) {
    setLoadingAnalytics(true);
    try {
      const examIdToQuery = targetExamId || selectedExamId;
      const url = examIdToQuery && examIdToQuery !== "all"
        ? `/api/v1/student/analytics?exam_type_id=${examIdToQuery}`
        : `/api/v1/student/analytics`;
      const res = await api.get<AnalyticsData>(url, true);
      setAnalytics(res);
    } catch {
      // Fallback data if no analytics yet
    } finally {
      setLoadingAnalytics(false);
    }
  }

  // Countdown Timer for CBT Engine
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
    topicName?: string;
    count?: number;
    durationMins?: number;
    isTopicMapMode?: boolean;
  }) {
    setLoadingTest(true);
    setError(null);
    setTestResult(null);

    const targetSubjIds = options.subjectIds || selectedSubjectIds;
    const targetTopicIds = options.topicIds || selectedTopicIds;

    let totalCustomSum = 0;
    let effectiveSubjectCounts: Record<string, number> = {};

    if (targetSubjIds && targetSubjIds.length > 0) {
      subjects
        .filter((s) => targetSubjIds.includes(s.id))
        .forEach((s) => {
          const cnt = subjectQuestionCounts[s.name] ?? subjectQuestionCounts[s.id] ?? 25;
          effectiveSubjectCounts[s.name] = cnt;
          totalCustomSum += cnt;
        });
    }

    const qCount = (totalCustomSum > 0 && options.mode !== "topic")
      ? totalCustomSum
      : (options.count || questionCount);
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
        topic_name: options.topicName,
        mode: options.mode,
        question_count: qCount,
        difficulty: difficulty,
        subject_counts: Object.keys(effectiveSubjectCounts).length > 0 ? effectiveSubjectCounts : subjectQuestionCounts,
        positive_marks: positiveMarks,
        negative_marks: negativeMarks,
      });

      if (!res.questions || res.questions.length === 0) {
        setError("No questions could be fetched for the selected topic/configuration.");
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
        examCode: activePattern.code,
        examName: activePattern.name,
        questions: res.questions,
        activeIdx: 0,
        userAnswers: {},
        checkedResponses: {},
        markedReview: {},
        timeRemaining: duration,
        startTime: Date.now(),
        subjectTabs: uniqueSubjNames,
        activeSubjectTab: uniqueSubjNames[0] || "General",
        isTopicMapMode: options.isTopicMapMode ?? (options.mode === "topic" || options.mode === "multi_topic"),
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
          positive_marks: positiveMarks,
          negative_marks: negativeMarks,
        },
        true
      );

      setTestResult(res);
      setTestSession(null);
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
      const selectedExamObj = knowledgeBaseExams.find((e) => e.id === mockExamId);

      const targetSubjects = (mockExamId !== "all"
        ? subjects.filter((s) => s.exam_type_id === mockExamId)
        : subjects
      ).filter((s) => mockSelectedSubjectIds.length === 0 || mockSelectedSubjectIds.includes(s.id));

      let totalCustomSum = 0;
      let effectiveSubjectCounts: Record<string, number> = {};

      targetSubjects.forEach((s) => {
        const cnt = subjectQuestionCounts[s.name] ?? subjectQuestionCounts[s.id] ?? 25;
        effectiveSubjectCounts[s.name] = cnt;
        totalCustomSum += cnt;
      });

      const effectiveCount = (paperFormatMode === "custom" && totalCustomSum > 0) ? totalCustomSum : mockPaperCount;

      const res = await api.post<MockPaperPackage>("/api/v1/questions/download-mock-paper", {
        title: mockPaperTitle,
        question_count: effectiveCount,
        exam_type_id: mockExamId !== "all" ? mockExamId : undefined,
        subject_ids: mockSelectedSubjectIds.length > 0 ? mockSelectedSubjectIds : (mockSubjectId !== "all" ? [mockSubjectId] : []),
        exam_code: selectedExamObj ? selectedExamObj.code : activePattern.code,
        topic_ids: mockTopicScope === "selected" ? mockSelectedTopics : [],
        difficulty: mockDifficulty,
        source_material: "textbooks_and_pyqs_only",
        subject_counts: effectiveSubjectCounts,
        positive_marks: positiveMarks,
        negative_marks: negativeMarks,
      });
      setMockPackage(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate mock paper package.");
    } finally {
      setGeneratingMockPackage(false);
    }
  }

  // Active Subject Question Count Summary & Effective Total for Format Choice
  const selectedOrExamSubjects = (mockExamId !== "all"
    ? subjects.filter((s) => s.exam_type_id === mockExamId)
    : subjects
  ).filter((s) => mockSelectedSubjectIds.length === 0 || mockSelectedSubjectIds.includes(s.id));

  let customSubjectSum = 0;
  const summaryParts: string[] = [];
  selectedOrExamSubjects.forEach((s) => {
    const cnt = subjectQuestionCounts[s.name] ?? subjectQuestionCounts[s.id] ?? 25;
    customSubjectSum += cnt;
    summaryParts.push(`${s.name}: ${cnt}`);
  });

  const activeSubjectCountSummary = summaryParts.join(" + ");
  const effectiveMockPaperCount = (paperFormatMode === "custom" && customSubjectSum > 0) ? customSubjectSum : mockPaperCount;

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
            2. Marking Scheme: ${activePattern.markingScheme}.<br/>
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

            {/* Structured Navigation Tabs */}
            <div className="hidden md:flex items-center gap-1.5 border-l border-line pl-6">
              <button
                onClick={() => setActiveTab("topic_exams")}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  activeTab === "topic_exams" ? "bg-indigo text-paper shadow" : "text-slate hover:text-ink hover:bg-line/40"
                }`}
              >
                🎯 1. Topic-Wise Exams (1000 Qs Pool)
              </button>
              <button
                onClick={() => setActiveTab("full_length")}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  activeTab === "full_length" ? "bg-indigo text-paper shadow" : "text-slate hover:text-ink hover:bg-line/40"
                }`}
              >
                🚀 2. Full-Length & Multi-Topic Papers
              </button>
              <button
                onClick={() => setActiveTab("download_papers")}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  activeTab === "download_papers" ? "bg-indigo text-paper shadow" : "text-slate hover:text-ink hover:bg-line/40"
                }`}
              >
                📥 3. Download Printable Mock Papers
              </button>
              <button
                onClick={() => setActiveTab("analytics")}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  activeTab === "analytics" ? "bg-indigo text-paper shadow" : "text-slate hover:text-ink hover:bg-line/40"
                }`}
              >
                📊 4. Performance Graph & Analytics
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Prominent Target Exam Selector */}
            <div className="flex items-center gap-2 bg-indigo/10 border border-indigo/30 px-3 py-1.5 rounded">
              <span className="text-xs font-bold text-indigo uppercase flex items-center gap-1">
                <span>🎓</span> Target Exam:
              </span>
              <select
                value={selectedExamId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedExamId(id);
                  setMockExamId(id);
                  setSelectedTopicIds([]);
                  setSelectedSubjectIds([]);
                  if (activeTab === "analytics") {
                    fetchAnalyticsData(id);
                  }
                }}
                className="bg-white border border-indigo/30 text-ink text-xs font-bold px-2 py-1 focus:outline-none"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.code} — {ex.name}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-xs font-medium text-slate hidden lg:inline-block">
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
          onClick={() => setActiveTab("topic_exams")}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${activeTab === "topic_exams" ? "bg-indigo text-paper font-bold" : "text-slate"}`}
        >
          🎯 Topic Exams
        </button>
        <button
          onClick={() => setActiveTab("full_length")}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${activeTab === "full_length" ? "bg-indigo text-paper font-bold" : "text-slate"}`}
        >
          🚀 Full Papers
        </button>
        <button
          onClick={() => setActiveTab("download_papers")}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${activeTab === "download_papers" ? "bg-indigo text-paper font-bold" : "text-slate"}`}
        >
          📥 Print Papers
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-3 py-1.5 whitespace-nowrap rounded ${activeTab === "analytics" ? "bg-indigo text-paper font-bold" : "text-slate"}`}
        >
          📊 Analytics
        </button>
      </div>

      {/* CBT ACTIVE TEST ENGINE INTERFACE */}
      {testSession && !testResult ? (
        <div className="mx-auto max-w-7xl px-6 pt-6">
          <div className="border border-line bg-ink text-paper p-4 flex flex-wrap items-center justify-between gap-4 mb-6 shadow-md">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-amber text-ink text-[10px] font-extrabold uppercase px-2 py-0.5 rounded shadow-sm">
                  Generated For: {testSession.examName || activePattern.name} ({testSession.examCode || activePattern.code})
                </span>
              </div>
              <h1 className="font-serif text-xl font-bold text-paper">{testSession.title}</h1>
              <p className="text-xs text-paper/70 mt-0.5">
                Question {testSession.activeIdx + 1} of {testSession.questions.length} | Pattern: {activePattern.markingScheme}
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

          {/* TOPIC PROGRESSION ROADMAP MAP BAR IN TEST SESSION */}
          {testSession.isTopicMapMode && (
            <div className="mb-6 border border-indigo/30 bg-indigo/5 p-4 rounded space-y-2">
              <div className="flex items-center justify-between border-b border-indigo/20 pb-2">
                <span className="text-xs font-bold text-indigo uppercase flex items-center gap-1.5">
                  <span>🗺️</span> Topic Learning Roadmap Progression Map (Topic 1 ➔ Topic 2 ➔ Topic 3)
                </span>
                <span className="text-[10px] font-mono bg-indigo text-paper px-2 py-0.5 rounded font-bold">
                  {testSession.questions.length} Map Nodes
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {testSession.questions.map((qItem, qIdx) => {
                  const isCurrentNode = qIdx === testSession.activeIdx;
                  const checkedState = testSession.checkedResponses?.[qItem.id];

                  let nodeColor = "border-line bg-white text-slate hover:border-indigo";
                  let badgeText = `Topic ${qIdx + 1}`;

                  if (isCurrentNode) {
                    nodeColor = "border-indigo bg-indigo text-paper font-bold shadow-md ring-2 ring-indigo/40";
                    badgeText = `🎯 Topic ${qIdx + 1}`;
                  } else if (checkedState?.is_correct) {
                    nodeColor = "border-emerald-500 bg-emerald-50 text-emerald-900 font-bold";
                    badgeText = `✓ Topic ${qIdx + 1}`;
                  } else if (checkedState && !checkedState.is_correct) {
                    nodeColor = "border-amber-500 bg-amber-50 text-amber-900 font-bold";
                    badgeText = `⚠️ Topic ${qIdx + 1}`;
                  }

                  return (
                    <div key={qItem.id} className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setTestSession((prev) => (prev ? { ...prev, activeIdx: qIdx } : null))}
                        className={`p-2 border rounded text-xs transition-all min-w-[130px] text-left ${nodeColor}`}
                      >
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[10px] font-mono uppercase font-bold">{badgeText}</span>
                        </div>
                        <span className="text-[11px] block truncate font-medium" title={qItem.question_text}>
                          Q{qIdx + 1}: {qItem.subject_name || "Concept"}
                        </span>
                      </button>
                      {qIdx < testSession.questions.length - 1 && (
                        <span className="text-indigo font-bold text-sm px-0.5 select-none">➔</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

                <div className="space-y-3 mb-6">
                  {Object.entries(testSession.questions[testSession.activeIdx]?.options || {}).map(
                    ([optKey, optVal]) => {
                      const qId = testSession.questions[testSession.activeIdx].id;
                      const isSelected = testSession.userAnswers[qId] === optKey;
                      const checkedInfo = testSession.checkedResponses?.[qId];

                      let optStyle = "border-line bg-paper text-slate hover:border-ink hover:text-ink";
                      if (checkedInfo) {
                        if (optKey === checkedInfo.correct_answer) {
                          optStyle = "border-emerald-500 bg-emerald-50 text-emerald-900 font-bold ring-2 ring-emerald-500";
                        } else if (isSelected && !checkedInfo.is_correct) {
                          optStyle = "border-red-500 bg-red-50 text-red-900 font-bold ring-2 ring-red-400";
                        }
                      } else if (isSelected) {
                        optStyle = "border-indigo bg-indigo/10 text-indigo font-medium shadow-sm ring-1 ring-indigo";
                      }

                      return (
                        <div
                          key={optKey}
                          onClick={() => {
                            if (checkedInfo) return; // Prevent changing after response checked
                            setTestSession((prev) => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                userAnswers: { ...prev.userAnswers, [qId]: optKey },
                              };
                            });
                          }}
                          className={`p-4 border transition-all flex items-start gap-3 rounded ${
                            checkedInfo ? "cursor-default" : "cursor-pointer"
                          } ${optStyle}`}
                        >
                          <span
                            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${
                              checkedInfo?.correct_answer === optKey
                                ? "bg-emerald-600 text-paper border-emerald-600"
                                : isSelected && !checkedInfo?.is_correct && checkedInfo
                                ? "bg-red-600 text-paper border-red-600"
                                : isSelected
                                ? "bg-indigo text-paper border-indigo"
                                : "border-slate text-slate"
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

                {/* INSTANT CHECK ANSWER & GROUNDED TOPIC CONCEPT EXPLANATION BANNER */}
                {(() => {
                  const currentQ = testSession.questions[testSession.activeIdx];
                  if (!currentQ) return null;
                  const qId = currentQ.id;
                  const currentAns = testSession.userAnswers[qId];
                  const checkedInfo = testSession.checkedResponses?.[qId];

                  if (!checkedInfo && currentAns) {
                    return (
                      <div className="mb-6">
                        <button
                          type="button"
                          onClick={() => {
                            const correctAns = currentQ.correct_answer || "A";
                            const isAnsMatch = currentAns.trim().toUpperCase() === correctAns.trim().toUpperCase();

                            setTestSession((prev) => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                checkedResponses: {
                                  ...prev.checkedResponses,
                                  [qId]: {
                                    is_correct: isAnsMatch,
                                    correct_answer: correctAns,
                                    explanation: currentQ.explanation || "Grounded concept explanation for this topic.",
                                  },
                                },
                              };
                            });
                          }}
                          className="w-full bg-indigo text-paper py-3 font-bold text-xs hover:bg-ink transition-colors shadow rounded flex items-center justify-center gap-2"
                        >
                          <span>🎯 Check Answer & Validate Topic Concept</span>
                        </button>
                      </div>
                    );
                  }

                  if (checkedInfo) {
                    return checkedInfo.is_correct ? (
                      <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 rounded text-emerald-900 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-bold text-sm">
                            <span className="text-xl">🎉</span>
                            <span>Correct Answer! (+4 Marks)</span>
                          </div>
                          <span className="text-[10px] font-mono bg-emerald-700 text-white px-2 py-0.5 rounded font-bold">
                            Topic Mastered ✓
                          </span>
                        </div>
                        <p className="text-xs text-emerald-800 leading-relaxed bg-white/70 p-3 border border-emerald-200 rounded">
                          <strong>Grounded Concept Takeaway:</strong> {checkedInfo.explanation}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setTestSession((prev) =>
                              prev ? { ...prev, activeIdx: Math.min(prev.questions.length - 1, prev.activeIdx + 1) } : null
                            )
                          }
                          disabled={testSession.activeIdx === testSession.questions.length - 1}
                          className="px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded hover:bg-emerald-800 transition-colors shadow disabled:opacity-50"
                        >
                          Next Topic Question ➔
                        </button>
                      </div>
                    ) : (
                      <div className="mb-6 p-5 bg-amber-50 border border-amber-300 rounded text-amber-950 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
                            <span className="text-xl">⚠️</span>
                            <span>Incorrect Choice — Grounded Topic Concept Explanation</span>
                          </div>
                          <span className="text-[10px] font-mono bg-amber-700 text-white px-2 py-0.5 rounded font-bold">
                            Needs Review
                          </span>
                        </div>

                        <div className="text-xs bg-white p-4 border border-amber-200 rounded text-ink leading-relaxed space-y-2 shadow-sm">
                          <div className="flex items-center gap-2 border-b border-amber-100 pb-2">
                            <span className="text-xs font-bold text-slate">Correct Answer:</span>
                            <span className="font-mono text-sm font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Option ({checkedInfo.correct_answer})
                            </span>
                          </div>
                          <div>
                            <strong className="text-indigo uppercase block mb-1 font-mono text-[11px]">
                              📖 Topic Concept & Solution Breakdown:
                            </strong>
                            <p className="text-slate text-xs leading-relaxed">{checkedInfo.explanation}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setTestSession((prev) =>
                              prev ? { ...prev, activeIdx: Math.min(prev.questions.length - 1, prev.activeIdx + 1) } : null
                            )
                          }
                          disabled={testSession.activeIdx === testSession.questions.length - 1}
                          className="px-4 py-2.5 bg-indigo text-paper text-xs font-bold rounded hover:bg-ink transition-colors shadow disabled:opacity-50"
                        >
                          Review Concept & Continue to Next Topic Question ➔
                        </button>
                      </div>
                    );
                  }

                  return null;
                })()}
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
                    onClick={() =>
                      setTestSession((prev) =>
                        prev ? { ...prev, activeIdx: Math.min(prev.questions.length - 1, prev.activeIdx + 1) } : null
                      )
                    }
                    disabled={testSession.activeIdx === testSession.questions.length - 1}
                    className="px-4 py-2 bg-ink text-paper text-xs font-medium hover:bg-indigo disabled:opacity-40"
                  >
                    Next Question →
                  </button>
                  <button
                    onClick={() => submitTestAnswers(testSession)}
                    disabled={submittingTest}
                    className="px-4 py-2 bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors shadow-sm flex items-center gap-1"
                  >
                    <span>✅</span> {submittingTest ? "Evaluating..." : "Submit Test"}
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

              <div className="mt-6 pt-4 border-t border-line space-y-2">
                <button
                  onClick={() => submitTestAnswers(testSession)}
                  disabled={submittingTest}
                  className="w-full py-2.5 bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-all shadow-sm flex items-center justify-center gap-1.5 rounded-sm"
                >
                  <span>✅</span> {submittingTest ? "Evaluating Answers & Scorecard..." : "Submit Test & View Results"}
                </button>
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

            {/* Performance Breakdown: Strong Areas & Areas to Improve */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Strong Areas */}
              <div className="border border-emerald-300 bg-emerald-50/60 p-5 rounded-sm shadow-sm">
                <h3 className="font-serif font-bold text-base text-emerald-900 mb-3 flex items-center gap-2">
                  <span>🌟</span> Strong Areas & High Accuracy Topics
                </h3>
                {testResult.strong_areas && testResult.strong_areas.length > 0 ? (
                  <div className="space-y-2">
                    {testResult.strong_areas.map((sa, i) => (
                      <div key={i} className="bg-white p-3 border border-emerald-200 flex items-center justify-between text-xs">
                        <div>
                          <strong className="text-emerald-950 font-bold block">{sa.topic}</strong>
                          <span className="text-emerald-700">{sa.correct} / {sa.total} questions answered correctly</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-1 rounded">
                          {sa.accuracy}% Accuracy
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-800 italic">
                    Answer 60% or more questions correctly in a topic to unlock strong area mastery badges!
                  </p>
                )}
              </div>

              {/* Areas to Improve */}
              <div className="border border-amber-300 bg-amber-50/60 p-5 rounded-sm shadow-sm">
                <h3 className="font-serif font-bold text-base text-amber-900 mb-3 flex items-center gap-2">
                  <span>🎯</span> Areas to Improve (Weak Topics Focus)
                </h3>
                {testResult.weak_areas && testResult.weak_areas.length > 0 ? (
                  <div className="space-y-2">
                    {testResult.weak_areas.map((wa, i) => (
                      <div key={i} className="bg-white p-3 border border-amber-200 flex items-center justify-between text-xs">
                        <div>
                          <strong className="text-amber-950 font-bold block">{wa.topic}</strong>
                          <span className="text-amber-800">Recommendation: Review textbook modules & retry practice questions</span>
                        </div>
                        <span className="font-mono font-bold text-amber-900 bg-amber-100 px-2 py-1 rounded">
                          {wa.accuracy}% Accuracy
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-800 italic">
                    Great job! No major weak topics detected in this test session.
                  </p>
                )}
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
      ) : (
        /* MAIN DASHBOARD CONTAINER WITH SIDEBAR */
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 flex flex-col md:flex-row gap-6">
          {/* ORGANIZED SIDEBAR CONTAINER */}
          <aside className="w-full md:w-72 lg:w-80 shrink-0 space-y-6">
            {/* SIDEBAR SECTION 1: EXAM SECTIONS NAVIGATION */}
            <div className="border border-line bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h2 className="font-serif text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
                  <span className="text-indigo text-lg">📚</span> Target Exam Selector
                </h2>
                <span className="text-[10px] font-mono bg-indigo/10 text-indigo px-2 py-0.5 rounded font-bold">
                  {exams.length} Exams
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate uppercase block mb-1">
                  Select Target Exam Dropdown Menu *
                </label>
                <select
                  value={selectedExamId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedExamId(id);
                    setMockExamId(id);
                    setSelectedTopicIds([]);
                    setSelectedSubjectIds([]);
                    if (activeTab === "analytics") {
                      fetchAnalyticsData(id);
                    }
                  }}
                  className="w-full border border-indigo/50 bg-indigo/5 px-3 py-2 text-xs font-bold text-ink focus:outline-none"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.code} — {ex.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 pt-1">
                {exams.map((ex) => {
                  const isSelected = selectedExamId === ex.id;
                  const pattern = getExamPattern(ex.code, ex.name);
                  const kbData = knowledgeBaseExams.find((k) => k.id === ex.id);
                  const docCount = kbData?.document_count || 0;

                  return (
                    <button
                      key={ex.id}
                      onClick={() => {
                        setSelectedExamId(ex.id);
                        setMockExamId(ex.id);
                        setSelectedTopicIds([]);
                        setSelectedSubjectIds([]);
                      }}
                      className={`w-full text-left p-3 border transition-all flex flex-col gap-1.5 ${
                        isSelected
                          ? "border-indigo bg-indigo/5 text-ink shadow-sm ring-1 ring-indigo"
                          : "border-line bg-paper hover:border-slate text-slate hover:text-ink"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-serif font-bold text-xs text-ink flex items-center gap-1.5">
                          <span>
                            {ex.code.includes("NEET") ? "🩺" : ex.code.includes("KCET") ? "⚡" : "🎓"}
                          </span>
                          {ex.name}
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 ${
                            isSelected ? "bg-indigo text-paper" : "bg-line text-slate"
                          }`}
                        >
                          {ex.code}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate border-t border-line/60 pt-2">
                        <span>{pattern.markingScheme}</span>
                        <span className="font-semibold text-indigo">{docCount} Grounded Docs</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SIDEBAR SECTION 2: TOPIC-WISE QUESTION POOL SELECTOR (10 TO 1000 QUESTIONS) */}
            <div className="border border-line bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h3 className="font-serif text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
                  <span className="text-indigo">🎯</span> Topic Question Pool
                </h3>
                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                  UP TO 1000 Qs
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate uppercase block mb-1">
                  Topic Question Count Pool
                </label>
                <select
                  value={topicQuestionPoolSize}
                  onChange={(e) => setTopicQuestionPoolSize(Number(e.target.value))}
                  className="w-full border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none font-semibold"
                >
                  <option value={10}>10 Questions (Quick Quiz)</option>
                  <option value={25}>25 Questions (Standard Topic Test)</option>
                  <option value={50}>50 Questions (Sub-Chapter Bank)</option>
                  <option value={100}>100 Questions (Topic Mastery Bank)</option>
                  <option value={250}>250 Questions (Sub-Subject Question Pool)</option>
                  <option value={500}>500 Questions (Mega Topic Bank)</option>
                  <option value={1000}>1000 Questions (Complete 1000 Qs Topic Pool)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate uppercase block mb-1">
                  Select Topic from Knowledge Base Dropdown *
                </label>
                <select
                  value={customTopicInput}
                  onChange={(e) => setCustomTopicInput(e.target.value)}
                  className="w-full border border-indigo/40 bg-indigo/5 px-2.5 py-2 text-xs text-ink focus:outline-none font-bold"
                >
                  <option value="">-- Select Topic from Dropdown --</option>
                  {availableKnowledgeTopics.flatMap((c: any) => c.topics || []).map((t: any) => (
                    <option key={t.id} value={t.name}>
                      🎯 {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                disabled={!customTopicInput.trim() || loadingTest}
                onClick={() => {
                  const matchedTopic = availableKnowledgeTopics
                    .flatMap((c: any) => c.topics || [])
                    .find((t: any) => t.name.toLowerCase() === customTopicInput.trim().toLowerCase());

                  startTest({
                    title: `Topic Exam: ${customTopicInput.trim()} (${topicQuestionPoolSize} Qs)`,
                    mode: "topic",
                    topicIds: matchedTopic ? [matchedTopic.id] : [],
                    topicName: customTopicInput.trim(),
                    count: topicQuestionPoolSize,
                  });
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-paper text-xs font-bold py-2.5 transition-colors disabled:opacity-40 shadow-sm"
              >
                {loadingTest ? "⚡ Launching Grounded Exam..." : `⚡ Launch Topic Exam (${topicQuestionPoolSize} Qs)`}
              </button>
            </div>

            {/* SIDEBAR SECTION 3: EXAM PATTERN & DIFFICULTY CONFIG */}
            {activeExamObj && (
              <div className="border border-line bg-white p-5 shadow-sm space-y-4">
                <h3 className="font-serif text-sm font-bold text-ink border-b border-line pb-2 flex items-center gap-2">
                  <span>⚙️</span> {activeExamObj.code} Difficulty Config
                </h3>

                <div>
                  <label className="text-[11px] font-bold text-slate uppercase block mb-1.5">
                    Target Difficulty Level
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {["mixed", "easy", "moderate", "difficult"].map((d) => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`py-1.5 px-2 border text-center capitalize text-[11px] font-semibold transition-all ${
                          difficulty === d
                            ? "bg-indigo text-paper border-indigo"
                            : "bg-paper border-line text-slate hover:text-ink"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-paper p-3 border border-line space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate">Target Exam:</span>
                    <strong className="text-ink">{activePattern.code}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate">Standard Qs:</span>
                    <strong className="text-indigo">{activePattern.totalQuestions} Questions</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate">Duration:</span>
                    <strong className="text-ink">{activePattern.durationMins} Mins</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate">Marking Scheme:</span>
                    <strong className="text-emerald-700">{activePattern.markingScheme}</strong>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* MAIN CONTENT WORKSPACE */}
          <div className="flex-1 min-w-0">
            {error && (
              <div
                className={`mb-6 p-4 border rounded shadow-sm flex items-start justify-between gap-3 ${
                  error.includes("available soon")
                    ? "border-amber-400 bg-amber-50 text-amber-950"
                    : "border-red-300 bg-red-50 text-red-800"
                }`}
              >
                <div className="flex items-start gap-2.5 text-xs font-medium leading-relaxed">
                  <span className="text-lg leading-none">{error.includes("available soon") ? "📢" : "⚠️"}</span>
                  <div>
                    <strong className="block text-sm font-bold mb-0.5">
                      {error.includes("available soon") ? "Exam Will Be Available Soon!" : "Notice"}
                    </strong>
                    <span>{error}</span>
                  </div>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-slate hover:text-ink font-bold px-2 py-0.5 text-sm"
                >
                  ✕
                </button>
              </div>
            )}
            {activeTab === "topic_exams" ? (
              /* TAB 1: TOPIC-WISE EXAM GENERATOR (1000 QUESTIONS POOL) */
              <div className="space-y-6">
                {/* HERO BANNER */}
                <div className="border border-line bg-gradient-to-r from-ink via-ink/95 to-indigo p-6 text-paper shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-amber text-ink text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded">
                          TAB 1: TOPIC-WISE EXAM ENGINE
                        </span>
                        <span className="bg-paper/20 text-paper text-[11px] font-medium px-2 py-0.5 rounded">
                          {activePattern.code} Exam Specific
                        </span>
                      </div>
                      <h1 className="font-serif text-3xl font-bold text-paper">Topic-Wise Exam Generator (1000 Qs Pool)</h1>
                      <p className="text-paper/80 text-xs mt-1 max-w-2xl leading-relaxed">
                        Select an approved topic below or set a question pool size (10 to 1000 Questions). Questions are strictly grounded in uploaded textbooks & PYQs for {activePattern.name}.
                      </p>
                    </div>

                    <div className="bg-paper/10 border border-paper/20 p-3 rounded text-right">
                      <span className="text-[10px] uppercase block text-paper/70 font-mono">Selected Pool Size</span>
                      <span className="font-serif text-lg font-bold text-amber">{topicQuestionPoolSize} Questions</span>
                    </div>
                  </div>
                </div>

                {/* SUBJECT CURRICULUM TOPICS GRID */}
                <div className="space-y-8 pt-2">
                  <div className="flex items-center justify-between border-b border-line pb-4">
                    <div>
                      <h2 className="font-serif text-2xl font-bold text-ink">
                        {activePattern.code} Topic Curriculum ({displaySubjects.length} Subjects)
                      </h2>
                      <p className="text-xs text-slate mt-0.5">
                        Click any topic card to launch a {topicQuestionPoolSize}-question topic exam grounded in reference textbooks.
                      </p>
                    </div>
                  </div>

                  {displaySubjects.map((subj, sIdx) => {
                    const topicsList = subjectTopicsMap[subj.id] || [];

                    return (
                      <section key={subj.id} className="border border-line bg-paper p-6 shadow-sm">
                        <div className="flex items-center justify-between border-b border-line pb-4 mb-6">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo text-paper text-sm font-bold font-serif">
                              {sIdx + 1}
                            </span>
                            <div>
                              <h3 className="font-serif text-xl font-bold text-ink">
                                Subject: {subj.name}
                              </h3>
                              <p className="text-xs text-slate">
                                {topicsList.length} approved topic{topicsList.length === 1 ? "" : "s"} under this subject
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() =>
                              startTest({
                                title: `Full ${subj.name} Subject Practice Test`,
                                mode: "subject",
                                subjectIds: [subj.id],
                                count: Math.min(100, topicQuestionPoolSize),
                              })
                            }
                            disabled={loadingTest}
                            className="px-4 py-1.5 bg-ink text-paper text-xs font-medium hover:bg-indigo transition-colors disabled:opacity-50"
                          >
                            📘 Take Full {subj.name} Test
                          </button>
                        </div>

                        {/* TOPIC SEQUENTIAL PROGRESSION MAP */}
                        {topicsList.length > 0 && (
                          <div className="mb-6 p-4 border border-indigo/20 bg-indigo/5 rounded space-y-3">
                            <div className="flex items-center justify-between border-b border-indigo/20 pb-2">
                              <span className="text-xs font-bold text-indigo uppercase tracking-wider flex items-center gap-1.5">
                                <span>🗺️</span> {subj.name} Topic Sequential Learning Roadmap (Topic 1 ➔ Topic 2 ➔ Topic 3 Map)
                              </span>
                              <span className="text-[10px] font-mono bg-indigo text-paper px-2 py-0.5 rounded font-bold">
                                {topicsList.length} Connected Nodes
                              </span>
                            </div>

                            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                              {topicsList.map((top, tIdx) => (
                                <div key={top.id} className="flex items-center gap-2 shrink-0">
                                  <div className="border border-indigo/30 bg-white p-3 rounded shadow-sm hover:border-indigo transition-all min-w-[180px] max-w-[220px]">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] font-mono font-bold bg-indigo/10 text-indigo px-1.5 py-0.5 rounded">
                                        Topic {tIdx + 1}
                                      </span>
                                      <span className="text-[10px] text-slate font-semibold">{topicQuestionPoolSize} Qs</span>
                                    </div>
                                    <strong className="text-xs font-bold text-ink leading-tight block truncate mb-2" title={top.name}>
                                      {top.name}
                                    </strong>
                                    <button
                                      onClick={() =>
                                        startTest({
                                          title: `${activePattern.code} Topic Test: ${top.name}`,
                                          mode: "topic",
                                          topicIds: [top.id],
                                          topicName: top.name,
                                          count: topicQuestionPoolSize,
                                        })
                                      }
                                      disabled={loadingTest}
                                      className="w-full py-1 text-[11px] font-bold bg-indigo text-paper hover:bg-ink transition-colors rounded"
                                    >
                                      Start Topic {tIdx + 1} ➔
                                    </button>
                                  </div>

                                  {tIdx < topicsList.length - 1 && (
                                    <span className="text-indigo font-bold text-lg px-1 select-none">➔</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {topicsList.length > 0 ? (
                          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {topicsList.map((top) => (
                              <div
                                key={top.id}
                                className="p-4 border border-line bg-white hover:border-ink transition-all flex flex-col justify-between"
                              >
                                <div className="mb-3">
                                  <span className="font-semibold text-sm leading-snug text-ink block">{top.name}</span>
                                  <span className="text-[11px] text-slate font-mono mt-1 block">
                                    Exam: {activePattern.code} | Pool: {topicQuestionPoolSize} Qs
                                  </span>
                                </div>

                                <button
                                  onClick={() =>
                                    startTest({
                                      title: `${activePattern.code} Topic Test: ${top.name}`,
                                      mode: "topic",
                                      topicIds: [top.id],
                                      topicName: top.name,
                                      count: topicQuestionPoolSize,
                                    })
                                  }
                                  disabled={loadingTest}
                                  className="mt-2 w-full py-2 border border-indigo/30 bg-white text-indigo hover:bg-indigo hover:text-paper text-xs font-bold transition-colors shadow-sm"
                                >
                                  🎯 Take Topic Exam ({topicQuestionPoolSize} Qs)
                                </button>
                              </div>
                            ))}
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
            ) : activeTab === "full_length" ? (
              /* TAB 2: FULL-LENGTH & MULTI-TOPIC MOCK PAPERS */
              <div className="space-y-8">
                {/* HERO BANNER */}
                <div className="border border-line bg-gradient-to-r from-ink via-ink/95 to-indigo p-6 text-paper shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-amber text-ink text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded">
                          TAB 2: FULL-LENGTH & MULTI-TOPIC STUDIO
                        </span>
                        <span className="bg-paper/20 text-paper text-[11px] font-medium px-2 py-0.5 rounded">
                          {activePattern.code} Exam Blueprint
                        </span>
                      </div>
                      <h1 className="font-serif text-3xl font-bold text-paper">{activePattern.name} Full Mock Tests</h1>
                      <p className="text-paper/80 text-xs mt-1 max-w-2xl leading-relaxed">
                        Take a complete timed mock paper following the official {activePattern.code} blueprint ({activePattern.totalQuestions} Qs / {activePattern.durationMins} Mins). Select All Topics or specific chapters.
                      </p>
                    </div>

                    <div className="bg-paper/10 border border-paper/20 p-3 rounded text-right">
                      <span className="text-[10px] uppercase block text-paper/70 font-mono">Exam Marking Rule</span>
                      <span className="font-serif text-lg font-bold text-amber">{activePattern.markingScheme}</span>
                    </div>
                  </div>
                </div>

                {/* ADMIN PATTERN SELECTOR CARDS */}
                {customPatterns.length > 0 && (
                  <div className="border border-indigo/30 bg-indigo/5 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-indigo/20 pb-2">
                      <h3 className="font-serif text-sm font-bold text-indigo uppercase tracking-wider flex items-center gap-2">
                        <span>⚙️</span> Available Patterns Applied by Admin
                      </h3>
                      <span className="text-[10px] font-mono bg-indigo text-paper px-2 py-0.5 rounded font-bold">
                        {customPatterns.length} Active Patterns
                      </span>
                    </div>

                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {customPatterns.map((pat) => {
                        const isSelected = selectedPatternId === pat.id;
                        const qSubj = pat.questions_per_subject || {};
                        return (
                          <button
                            key={pat.id}
                            type="button"
                            onClick={() => applyAdminPattern(pat)}
                            className={`p-3 border text-left transition-all flex flex-col justify-between ${
                              isSelected
                                ? "border-indigo bg-indigo text-paper shadow ring-2 ring-indigo"
                                : "border-indigo/20 bg-white hover:border-indigo text-ink"
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <strong className={`font-serif text-xs font-bold ${isSelected ? "text-paper" : "text-ink"}`}>
                                  {pat.name}
                                </strong>
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? "bg-amber text-ink" : "bg-indigo/10 text-indigo"}`}>
                                  {pat.total_questions} Qs
                                </span>
                              </div>
                              <p className={`text-[11px] mt-1 ${isSelected ? "text-paper/80" : "text-slate"}`}>
                                Duration: {pat.duration_minutes} Mins | Score: +{pat.positive_marks} / -{pat.negative_marks}
                              </p>
                            </div>
                            {Object.keys(qSubj).length > 0 && (
                              <div className={`text-[10px] border-t pt-1.5 mt-2 font-mono ${isSelected ? "border-paper/20 text-amber" : "border-line text-indigo font-semibold"}`}>
                                {Object.entries(qSubj).map(([s, c]) => `${s}: ${c} Qs`).join(" • ")}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* FULL-LENGTH LAUNCH ACTION CARDS */}
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="border border-line bg-paper p-6 shadow-sm flex flex-col justify-between hover:border-indigo transition-colors">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-3xl">🎓</span>
                        <span className="bg-indigo/10 border border-indigo/30 text-indigo text-[11px] font-extrabold px-2.5 py-1 rounded">
                          Target Exam: {activePattern.code} ({activePattern.name})
                        </span>
                      </div>
                      <h3 className="font-serif text-xl font-bold text-ink mb-2">
                        Official {activePattern.name} ({activePattern.code}) Exam Pattern ({activePattern.totalQuestions} Qs)
                      </h3>
                      <p className="text-xs text-slate leading-relaxed mb-4">
                        Official timed pattern exam generated for <strong>{activePattern.name} ({activePattern.code})</strong> following official blueprint ({activePattern.totalQuestions} Questions / {activePattern.durationMins} Mins).
                      </p>

                      {/* TOPIC SCOPE SELECTOR */}
                      <div className="bg-white p-3.5 border border-line rounded mb-5 space-y-2">
                        <span className="text-xs font-bold text-indigo uppercase block">Select Topic Scope for Pattern Exam *</span>
                        <label className="flex items-center gap-2 text-xs text-slate hover:text-ink cursor-pointer">
                          <input
                            type="radio"
                            name="fullLengthScope"
                            checked={fullLengthTopicScope === "all"}
                            onChange={() => setFullLengthTopicScope("all")}
                            className="accent-indigo"
                          />
                          <span><strong>All Syllabus Topics (Official Full Blueprint)</strong></span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate hover:text-ink cursor-pointer">
                          <input
                            type="radio"
                            name="fullLengthScope"
                            checked={fullLengthTopicScope === "selected"}
                            onChange={() => setFullLengthTopicScope("selected")}
                            className="accent-indigo"
                          />
                          <span>
                            <strong>Specific Selected Topics ({selectedTopicIds.length} Selected)</strong>
                            {selectedTopicIds.length === 0 && (
                              <span className="text-amber-700 block text-[11px] font-normal">
                                (Check topics in grid below to customize topic pool)
                              </span>
                            )}
                          </span>
                        </label>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        startTest({
                          title: `${activePattern.code} ${fullLengthTopicScope === "selected" ? `Custom Topics (${selectedTopicIds.length} Topics)` : "Full Syllabus"} Official Pattern Test (${activePattern.totalQuestions} Qs)`,
                          mode: fullLengthTopicScope === "selected" ? "multi_topic" : "full_length",
                          topicIds: fullLengthTopicScope === "selected" ? selectedTopicIds : undefined,
                          count: activePattern.totalQuestions,
                          durationMins: activePattern.durationMins,
                        })
                      }
                      disabled={loadingTest || (fullLengthTopicScope === "selected" && selectedTopicIds.length === 0)}
                      className="w-full bg-indigo text-paper py-3 text-xs font-bold hover:bg-ink transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {loadingTest
                        ? "Generating Pattern Test..."
                        : fullLengthTopicScope === "selected" && selectedTopicIds.length === 0
                        ? "Please Select Topics Below First"
                        : `🚀 Launch Official ${activePattern.code} Pattern Exam (${activePattern.totalQuestions} Qs)`}
                    </button>
                  </div>

                  <div className="border border-line bg-paper p-6 shadow-sm flex flex-col justify-between hover:border-indigo transition-colors">
                    <div>
                      <span className="text-3xl mb-2 block">📑</span>
                      <h3 className="font-serif text-xl font-bold text-ink mb-2">
                        Multi-Topic Custom Mock Paper
                      </h3>
                      <p className="text-xs text-slate leading-relaxed mb-6">
                        Select specific topics using checkboxes below across subjects to create a custom multi-topic test paper.
                      </p>
                    </div>
                    <button
                      disabled={selectedTopicIds.length === 0 || loadingTest}
                      onClick={() =>
                        startTest({
                          title: `${activePattern.code} Multi-Topic Mock Test (${selectedTopicIds.length} Topics)`,
                          mode: "multi_topic",
                          topicIds: selectedTopicIds,
                          count: Math.min(60, Math.max(10, selectedTopicIds.length * 5)),
                        })
                      }
                      className="w-full bg-ink text-paper py-3 text-xs font-bold hover:bg-indigo transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {selectedTopicIds.length > 0
                        ? `Launch Custom Test (${selectedTopicIds.length} Topics Selected)`
                        : "Check Topics Below to Enable"}
                    </button>
                  </div>
                </div>

                {/* MULTI-TOPIC SELECTION CHECKBOX GRID WITH PER-SUBJECT QUESTION COUNTS */}
                <div className="space-y-6 pt-4 border-t border-line">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div>
                      <h3 className="font-serif text-xl font-bold text-ink">
                        Select Topics / Chapters & Questions Count Per Subject
                      </h3>
                      <p className="text-xs text-slate mt-0.5">
                        Set distinct question counts for each selected subject (e.g. Physics: 30 Qs, Chemistry: 25 Qs).
                      </p>
                    </div>
                    <span className="text-xs font-bold text-indigo bg-indigo/10 px-2.5 py-1 rounded">
                      {selectedTopicIds.length} Topic{selectedTopicIds.length === 1 ? "" : "s"} Selected
                    </span>
                  </div>

                  {displaySubjects.map((subj) => {
                    const topicsList = subjectTopicsMap[subj.id] || [];
                    const isSubjectSelected = selectedSubjectIds.includes(subj.id);

                    return (
                      <div key={subj.id} className="border border-line bg-white p-5 shadow-sm space-y-4">
                        <div className="flex flex-wrap items-center justify-between border-b border-line pb-3 gap-3">
                          <div className="flex items-center gap-3">
                            <strong className="font-serif text-lg text-ink">Subject: {subj.name}</strong>
                            {isSubjectSelected && (
                              <div className="flex items-center gap-1.5 bg-indigo/10 border border-indigo/30 px-2.5 py-1 rounded text-xs">
                                <span className="font-semibold text-indigo">Number of Questions for {subj.name}:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={subjectQuestionCounts[subj.name] ?? subjectQuestionCounts[subj.id] ?? 25}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 0);
                                    setSubjectQuestionCounts((prev) => ({
                                      ...prev,
                                      [subj.name]: val,
                                      [subj.id]: val,
                                    }));
                                  }}
                                  className="w-16 border border-indigo/40 bg-white px-1.5 py-0.5 text-xs text-ink font-bold text-center focus:outline-none focus:ring-1 focus:ring-indigo rounded"
                                />
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => toggleSubjectSelection(subj.id)}
                            className={`px-3 py-1 text-xs font-medium border transition-all ${
                              isSubjectSelected
                                ? "bg-indigo/10 border-indigo text-indigo font-bold"
                                : "bg-paper border-line text-slate hover:border-ink"
                            }`}
                          >
                            {isSubjectSelected ? "✓ Subject Selected" : "Select Subject"}
                          </button>
                        </div>

                        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {topicsList.map((top) => {
                            const isChecked = selectedTopicIds.includes(top.id);
                            return (
                              <label
                                key={top.id}
                                className={`p-3 border text-xs flex items-center justify-between cursor-pointer transition-all ${
                                  isChecked
                                    ? "border-indigo bg-indigo/10 text-indigo font-bold"
                                    : "border-line bg-paper text-slate hover:border-ink"
                                }`}
                              >
                                <span className="truncate pr-2">{top.name}</span>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleTopicSelection(top.id, subj.id)}
                                  className="w-4 h-4 accent-indigo cursor-pointer shrink-0"
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : activeTab === "download_papers" ? (
              /* TAB 3: TEACHER & STUDENT MOCK PAPER DOWNLOADER */
              <div className="border border-line bg-white p-8 shadow-md">
                <div className="border-b border-line pb-6 mb-8 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="font-serif text-3xl font-bold text-ink">Teacher & Student Mock Paper Downloader</h1>
                    <p className="text-slate text-sm mt-1">
                      Select exam material, topic scope, and difficulty level. Generate 2 distinct printable documents: (1) Test Question Paper for students, and (2) Master Answer Key & Solutions Paper for teachers.
                    </p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5">
                    <span>🔒 Grounded RAG Generation</span>
                    <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.5 rounded">Textbooks & PYQs Only</span>
                  </div>
                </div>

                {/* Config Form: 4-Step Dynamic Workflow */}
                <div className="space-y-6 mb-8 bg-paper p-6 border border-line">
                  {/* STEP 1: TARGET EXAM */}
                  <div>
                    <label className="text-xs font-bold text-indigo uppercase block mb-1">
                      Step 1: Select Target Exam Dropdown *
                    </label>
                    <select
                      value={mockExamId}
                      onChange={(e) => {
                        const newExamId = e.target.value;
                        setMockExamId(newExamId);
                        setMockSelectedTopics([]);
                      }}
                      className="w-full border border-indigo/50 bg-indigo/5 px-3 py-2.5 text-sm text-ink focus:outline-none font-bold"
                    >
                      <option value="all">-- All Entrance Exams --</option>
                      {knowledgeBaseExams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.code} — {ex.name} [{ex.document_count || 0} Textbooks/PYQs]
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* FORMAT CHOICE: STANDARD ADMIN PATTERN VS DESIGN YOUR FORMAT */}
                  <div className="border border-indigo/30 bg-white p-4 rounded space-y-3">
                    <label className="text-xs font-bold text-indigo uppercase block">
                      Choose Question Paper Format *
                    </label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPaperFormatMode("standard");
                          if (customPatterns.length > 0) {
                            const pat = customPatterns.find((p) => p.id === selectedPatternId) || customPatterns[0];
                            applyAdminPattern(pat);
                          }
                        }}
                        className={`p-3 border text-left rounded text-xs transition-all ${
                          paperFormatMode === "standard"
                            ? "border-indigo bg-indigo text-paper font-bold shadow"
                            : "border-line bg-paper hover:border-indigo text-slate hover:text-ink"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-sm">Option 1: Standard Exam Blueprint</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${paperFormatMode === "standard" ? "bg-amber text-ink font-bold" : "bg-indigo/10 text-indigo"}`}>
                            Admin Pattern
                          </span>
                        </div>
                        <p className="text-[11px] opacity-90">
                          Use exact pattern uploaded by Admin ({customPatterns.length > 0 ? `${customPatterns.length} Admin Patterns Available` : `${activePattern.name} ${activePattern.totalQuestions} Qs`}).
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaperFormatMode("custom")}
                        className={`p-3 border text-left rounded text-xs transition-all ${
                          paperFormatMode === "custom"
                            ? "border-indigo bg-indigo text-paper font-bold shadow"
                            : "border-line bg-paper hover:border-indigo text-slate hover:text-ink"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-sm">Option 2: Design Your Format</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${paperFormatMode === "custom" ? "bg-amber text-ink font-bold" : "bg-indigo/10 text-indigo"}`}>
                            Dynamic Per-Subject Sum
                          </span>
                        </div>
                        <p className="text-[11px] opacity-90">
                          Set custom questions count per subject in Step 2 (e.g. Physics 25 + Chem 25 + Math 25 = 75 Qs total).
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* ADMIN PATTERNS SELECTION (ONLY ADMIN CREATED PATTERNS) */}
                  {paperFormatMode === "standard" && (
                    <div className="border border-indigo/30 bg-indigo/5 p-4 space-y-2 rounded">
                      <label className="text-xs font-bold text-indigo uppercase block">
                        Select Admin Pattern Blueprint *
                      </label>
                      {customPatterns.length > 0 ? (
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {customPatterns.map((pat) => {
                            const isSelected = selectedPatternId === pat.id;
                            const qSubj = pat.questions_per_subject || {};
                            const subjSummary = Object.keys(qSubj).length > 0
                              ? Object.entries(qSubj).map(([s, c]) => `${s}: ${c} Qs`).join(" • ")
                              : "Core Syllabus";

                            return (
                              <button
                                key={pat.id}
                                type="button"
                                onClick={() => applyAdminPattern(pat)}
                                className={`p-3 border text-left rounded text-xs transition-all ${
                                  isSelected
                                    ? "border-indigo bg-indigo text-paper font-bold shadow"
                                    : "border-line bg-white hover:border-indigo text-slate hover:text-ink"
                                }`}
                              >
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold">{pat.name}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isSelected ? "bg-amber text-ink font-bold" : "bg-indigo/10 text-indigo"}`}>
                                    {pat.total_questions} Qs
                                  </span>
                                </div>
                                <p className={`text-[11px] ${isSelected ? "text-paper/80" : "text-slate"}`}>
                                  +{pat.positive_marks} / -{pat.negative_marks} Marks
                                </p>
                                <p className={`text-[10px] mt-1 font-mono ${isSelected ? "text-amber" : "text-indigo"}`}>
                                  {subjSummary}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-3 bg-white border border-indigo/20 rounded text-xs text-ink font-medium">
                          <span className="font-bold text-indigo">Official Admin Exam Blueprint:</span> {activePattern.name} ({activePattern.totalQuestions} Questions Total — {activePattern.subjectsHint})
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 2: SELECT SUBJECT(S) (SINGLE OR MULTIPLE) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-ink uppercase block">
                        Step 2: Select Subject(s) & Set Questions Count per Subject *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMockSelectedSubjectIds([]);
                          setMockSubjectId("all");
                        }}
                        className="text-xs text-indigo hover:underline font-bold"
                      >
                        Select All Subjects ({mockSelectedSubjectIds.length === 0 ? "Default" : "Reset"})
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {(mockExamId !== "all"
                        ? subjects.filter((s) => s.exam_type_id === mockExamId)
                        : subjects
                      ).map((s) => {
                        const isChecked = mockSelectedSubjectIds.includes(s.id);
                        const subExam = exams.find((ex) => ex.id === s.exam_type_id);
                        return (
                          <div key={s.id} className="flex flex-col gap-1.5 border border-line p-3 bg-white rounded">
                            <label className="text-xs flex items-center justify-between cursor-pointer font-semibold">
                              <span className="truncate pr-1 text-ink">[{subExam?.code || "EXAM"}] {s.name}</span>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setMockSelectedSubjectIds((prev) =>
                                    prev.includes(s.id)
                                      ? prev.filter((id) => id !== s.id)
                                      : [...prev, s.id]
                                  );
                                }}
                                className="w-4 h-4 accent-indigo cursor-pointer shrink-0"
                              />
                            </label>
                            {isChecked && (
                              <div className="flex items-center justify-between bg-indigo/5 border border-indigo/20 px-2 py-1 text-xs">
                                <span className="text-[11px] font-semibold text-indigo">Questions Count:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={subjectQuestionCounts[s.name] ?? subjectQuestionCounts[s.id] ?? 25}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 0);
                                    setSubjectQuestionCounts((prev) => ({
                                      ...prev,
                                      [s.name]: val,
                                      [s.id]: val,
                                    }));
                                  }}
                                  className="w-16 border border-indigo/40 bg-white px-1.5 py-0.5 text-xs text-ink font-bold text-center focus:outline-none focus:ring-1 focus:ring-indigo rounded"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* STEP 3: SELECT TOPICS / CHAPTERS */}
                  <div className="border-t border-line pt-4">
                    <label className="text-xs font-bold text-ink uppercase block mb-2">
                      Step 3: Select Syllabus / Topic Scope *
                    </label>
                    <div className="flex items-center gap-6 mb-4">
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                          type="radio"
                          name="topicScope"
                          checked={mockTopicScope === "all"}
                          onChange={() => {
                            setMockTopicScope("all");
                            setMockSelectedTopics([]);
                          }}
                          className="accent-indigo"
                        />
                        All Topics under Subject / Exam
                      </label>
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                          type="radio"
                          name="topicScope"
                          checked={mockTopicScope === "selected"}
                          onChange={() => setMockTopicScope("selected")}
                          className="accent-indigo"
                        />
                        Specific Selected Topics
                      </label>
                    </div>

                    {mockTopicScope === "selected" && (
                      <div className="p-4 bg-white border border-line max-h-60 overflow-y-auto space-y-4">
                        {availableKnowledgeTopics.length === 0 ? (
                          <p className="text-xs text-slate">No specific topics configured for this exam yet. All topics will be used.</p>
                        ) : (
                          availableKnowledgeTopics.map((chap) => (
                            <div key={chap.id} className="space-y-1.5">
                              <span className="text-xs font-bold text-indigo uppercase block">{chap.name}</span>
                              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {chap.topics.map((tp: any) => (
                                  <label key={tp.id} className="flex items-center gap-2 text-xs text-slate hover:text-ink cursor-pointer bg-paper p-2 border border-line">
                                    <input
                                      type="checkbox"
                                      checked={mockSelectedTopics.includes(tp.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setMockSelectedTopics([...mockSelectedTopics, tp.id]);
                                        } else {
                                          setMockSelectedTopics(mockSelectedTopics.filter((tId) => tId !== tp.id));
                                        }
                                      }}
                                      className="accent-indigo"
                                    />
                                    <span className="truncate">{tp.name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* STEP 4 CONFIGURATIONS: TITLE, COUNT, DIFFICULTY & MARKING SCHEME */}
                  <div className="border-t border-line pt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate uppercase block mb-1">Paper Title</label>
                      <input
                        type="text"
                        value={mockPaperTitle}
                        onChange={(e) => setMockPaperTitle(e.target.value)}
                        className="w-full border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none font-medium"
                        placeholder="e.g. NEET All India Mock Test"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate uppercase block mb-1">Question Count</label>
                      {paperFormatMode === "custom" ? (
                        <div className="w-full border border-indigo/40 bg-indigo/10 px-2.5 py-1.5 text-xs text-indigo font-bold rounded flex flex-col justify-center">
                          <span className="text-[11px] text-ink font-bold">
                            Design Format Total: {effectiveMockPaperCount} Qs
                          </span>
                          <span className="text-[10px] text-indigo font-normal truncate">
                            ({activeSubjectCountSummary || "25 Qs per subject"})
                          </span>
                        </div>
                      ) : (
                        <div className="w-full border border-indigo/40 bg-indigo/10 px-2.5 py-1.5 text-xs text-indigo font-bold rounded flex flex-col justify-center">
                          <span className="text-[11px] text-ink font-bold">
                            Admin Pattern Total: {selectedPatternId && customPatterns.find((p) => p.id === selectedPatternId) ? customPatterns.find((p) => p.id === selectedPatternId).total_questions : activePattern.totalQuestions} Qs
                          </span>
                          <span className="text-[10px] text-indigo font-normal truncate">
                            ({selectedPatternId && customPatterns.find((p) => p.id === selectedPatternId) && customPatterns.find((p) => p.id === selectedPatternId).questions_per_subject
                              ? Object.entries(customPatterns.find((p) => p.id === selectedPatternId).questions_per_subject).map(([s, c]) => `${s}: ${c} Qs`).join(" + ")
                              : activePattern.subjectsHint})
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate uppercase block mb-1">Positive Marks per Question</label>
                      <select
                        value={positiveMarks}
                        onChange={(e) => setPositiveMarks(Number(e.target.value))}
                        className="w-full border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none font-medium"
                      >
                        <option value={4}>+4 Marks (NEET / JEE Standard)</option>
                        <option value={1}>+1 Mark (KCET Standard)</option>
                        <option value={2}>+2 Marks</option>
                        <option value={3}>+3 Marks</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate uppercase block mb-1">Negative Marking Penalty</label>
                      <select
                        value={negativeMarks}
                        onChange={(e) => setNegativeMarks(Number(e.target.value))}
                        className="w-full border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none font-medium"
                      >
                        <option value={1}>-1 Penalty (Standard Negative Marking)</option>
                        <option value={0}>0 Penalty (No Negative Marking - KCET)</option>
                        <option value={0.25}>-0.25 Penalty</option>
                        <option value={0.5}>-0.5 Penalty</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* STEP 4: ACTION DOWNLOAD BUTTON */}
                <button
                  onClick={generateMockPaperPackage}
                  disabled={generatingMockPackage}
                  className="w-full bg-indigo text-paper py-3.5 font-bold text-sm hover:bg-ink transition-colors shadow mb-8 disabled:opacity-50"
                >
                  {generatingMockPackage
                    ? "⚡ Extracting Grounded Questions & Rendering Papers Package..."
                    : `📥 Step 4: Generate & Download 2 Mock Papers Package (${effectiveMockPaperCount} Questions Printable)`}
                </button>

                {mockPackage && (
                  <div className="p-6 border border-indigo/30 bg-indigo/5 space-y-6">
                    <div className="border-b border-line pb-3">
                      <h3 className="font-serif text-xl font-bold text-ink">Package Ready for Download & Printing</h3>
                      <p className="text-xs text-slate mt-1">
                        {mockPackage.title} ({mockPackage.total_questions} Questions)
                      </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-6">
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
            ) : (
              /* TAB 4: STUDENT TRACKING & PERFORMANCE GRAPH ANALYTICS */
              <div className="border border-line bg-white p-6 shadow-sm">
                <div className="border-b border-line pb-6 mb-8 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="font-serif text-3xl font-bold text-ink">
                      {activeExamObj && selectedExamId !== "all" ? `${activeExamObj.name} (${activeExamObj.code}) Analytics` : "All Exams Student Performance & Progress Graph"}
                    </h1>
                    <p className="text-slate text-sm mt-1">
                      Real-time tracking of test attempts, score trajectory over time, subject mastery, and exam readiness grounded in Knowledge Base.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-indigo/10 border border-indigo/30 px-3 py-2 rounded">
                      <span className="text-xs font-bold text-indigo uppercase">Filter Exam:</span>
                      <select
                        value={selectedExamId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedExamId(id);
                          fetchAnalyticsData(id);
                        }}
                        className="bg-white border border-indigo/30 text-ink text-xs font-bold px-2 py-1 focus:outline-none"
                      >
                        <option value="all">All Target Exams Combined</option>
                        {exams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.code} — {ex.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={() => fetchAnalyticsData(selectedExamId)}
                      className="px-4 py-2 border border-line text-xs font-bold text-slate hover:text-ink bg-white shadow-sm"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>

                {loadingAnalytics ? (
                  <div className="p-12 text-center text-slate">Loading student performance analytics...</div>
                ) : analytics ? (
                  <div className="space-y-10">
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

                    <div className="grid lg:grid-cols-2 gap-8">
                      {/* SUBJECT PERFORMANCE & ATTEMPTS COUNT */}
                      <div className="border border-line bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-line">
                          <h2 className="font-serif text-xl font-bold text-ink">
                            Subject Progress & Attempt Counts
                          </h2>
                          <span className="text-[11px] font-mono text-indigo bg-indigo/10 px-2 py-0.5 rounded font-bold">
                            Per-Subject Tracking
                          </span>
                        </div>

                        <div className="space-y-6">
                          {analytics.subject_breakdown.map((sb) => (
                            <div key={sb.subject_name} className="p-3.5 border border-line bg-paper/40 rounded space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-serif font-bold text-ink text-sm">{sb.subject_name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="bg-indigo/10 border border-indigo/20 text-indigo font-mono font-bold px-2 py-0.5 rounded text-[10px]">
                                    {sb.tests_taken} Attempt{sb.tests_taken === 1 ? "" : "s"} Made
                                  </span>
                                  <span className="font-bold text-emerald-700 font-mono">
                                    {sb.accuracy}% Accuracy
                                  </span>
                                </div>
                              </div>

                              <div className="w-full bg-line h-2.5 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${Math.min(100, sb.accuracy)}%` }}
                                  className="bg-indigo h-full transition-all"
                                ></div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate pt-0.5">
                                <span>Total Questions Attempted: <strong>{sb.total_questions || (sb.tests_taken * 25)} Qs</strong></span>
                                <span>Avg Score: <strong>{sb.avg_score} pts</strong></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AI TOPIC RECOMMENDATIONS */}
                      <div className="border border-line bg-white p-6 shadow-sm">
                        <h2 className="font-serif text-xl font-bold text-ink mb-4 pb-2 border-b border-line">
                          AI Topic Strength & Weakness Summary
                        </h2>
                        <div className="space-y-4 text-xs">
                          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded">
                            <strong className="text-emerald-950 font-bold block mb-1.5 flex items-center gap-1.5 text-sm">
                              <span>🌟</span> High Strength Topics (Accuracy ≥ 70%):
                            </strong>
                            {analytics.strong_topics && analytics.strong_topics.length > 0 ? (
                              <ul className="list-disc pl-5 space-y-1 text-emerald-900 font-medium">
                                {analytics.strong_topics.map((t) => (
                                  <li key={t}>{t}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-emerald-800 italic">Score 70% or higher in topic practice tests to add strength badges!</p>
                            )}
                          </div>

                          <div className="p-4 bg-amber-50 border border-amber-200 rounded">
                            <strong className="text-amber-950 font-bold block mb-1.5 flex items-center gap-1.5 text-sm">
                              <span>⚠️</span> Weak Topics Requiring Focus (Accuracy &lt; 70%):
                            </strong>
                            {analytics.weak_topics && analytics.weak_topics.length > 0 ? (
                              <ul className="list-disc pl-5 space-y-1 text-amber-900 font-medium">
                                {analytics.weak_topics.map((t) => (
                                  <li key={t}>{t}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-amber-800 italic">Great job! All practiced topics show high accuracy.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* UPLOADED TOPICS DETAILED BREAKDOWN TABLE */}
                    {analytics.topic_breakdown && analytics.topic_breakdown.length > 0 && (
                      <div className="border border-line bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
                          <div>
                            <h2 className="font-serif text-xl font-bold text-ink">
                              Uploaded Topics Performance & Attempt Breakdown
                            </h2>
                            <p className="text-xs text-slate mt-0.5">
                              Detailed score, accuracy, and attempt logs for every uploaded topic
                            </p>
                          </div>
                          <span className="text-xs font-mono font-bold text-indigo bg-indigo/10 px-2.5 py-1 rounded">
                            {analytics.topic_breakdown.length} Topics Attempted
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-paper border-b border-line text-slate uppercase font-mono text-[10px]">
                                <th className="p-3">Topic Name</th>
                                <th className="p-3">Subject</th>
                                <th className="p-3 text-center">Number of Attempts</th>
                                <th className="p-3 text-center">Questions Solved</th>
                                <th className="p-3 text-center">Score Accuracy %</th>
                                <th className="p-3 text-center">Area Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {analytics.topic_breakdown.map((tb, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-3 font-semibold text-ink">{tb.topic_name}</td>
                                  <td className="p-3 text-slate font-medium">{tb.subject_name}</td>
                                  <td className="p-3 text-center font-mono font-bold text-indigo">{tb.attempts_count}</td>
                                  <td className="p-3 text-center font-mono">{tb.correct_count} / {tb.total_questions}</td>
                                  <td className="p-3 text-center font-mono font-bold text-emerald-700">{tb.accuracy}%</td>
                                  <td className="p-3 text-center">
                                    <span
                                      className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase font-mono ${
                                        tb.status === "Strength Area"
                                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                          : "bg-amber-100 text-amber-800 border border-amber-300"
                                      }`}
                                    >
                                      {tb.status === "Strength Area" ? "🟢 Strength Area" : "🟠 Weak Area"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
