import Link from "next/link";

function MockQuestionCard() {
  return (
    <div className="border border-line bg-paper p-6 sm:p-8 shadow-[6px_6px_0_0_#12172B]">
      <div className="flex items-baseline justify-between border-b border-line pb-3 mb-5">
        <span className="font-serif text-lg text-ink">Question 14</span>
        <span className="text-sm text-slate/70">Physics &middot; Kinematics</span>
      </div>
      <p className="text-slate leading-relaxed mb-5">
        A body starts from rest and moves with a constant acceleration of
        5 m/s&sup2;. What is its velocity after 2 seconds?
      </p>
      <div className="space-y-2 text-sm">
        {[
          ["A", "5 m/s"],
          ["B", "10 m/s"],
          ["C", "15 m/s"],
          ["D", "20 m/s"],
        ].map(([letter, value]) => (
          <div
            key={letter}
            className={`flex items-center gap-3 border px-3 py-2 ${
              letter === "B" ? "border-amber bg-amber/10" : "border-line"
            }`}
          >
            <span className="font-medium text-ink">{letter}</span>
            <span className="text-slate">{value}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-slate/60">
        Generated from your approved textbook chapter on rectilinear motion.
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main>
      {/* Top bar */}
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <span className="font-serif text-2xl text-ink">SamAI</span>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/login"
              className="px-4 py-2 text-ink hover:text-indigo transition-colors"
            >
              Student Portal
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="font-serif text-4xl sm:text-5xl leading-tight text-ink">
            Practice built from the syllabus your teachers actually approved.
          </h1>
          <p className="mt-6 text-lg text-slate leading-relaxed max-w-prose">
            SamAI generates NEET, KCET and JEE questions strictly from the
            textbooks, exam patterns and sample papers your institution
            uploads — never from the open internet. Every question traces
            back to a real source.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="px-6 py-3 bg-indigo text-paper hover:bg-ink transition-colors"
            >
              Create a student account
            </Link>
            <Link
              href="/admin/upload"
              className="px-6 py-3 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors"
            >
              Upload course content
            </Link>
          </div>
        </div>
        <MockQuestionCard />
      </section>

      {/* How it works -- a genuine sequence, so numbering is earned here */}
      <section className="border-t border-line bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="font-serif text-3xl mb-10">How a question gets to a student</h2>
          <ol className="grid sm:grid-cols-3 gap-8">
            {[
              {
                n: "1",
                title: "Admin uploads approved material",
                body: "Textbooks, table of contents, exam patterns and sample papers, organized by exam, subject, chapter and topic.",
              },
              {
                n: "2",
                title: "SamAI retrieves and generates",
                body: "The system retrieves only the relevant approved content for the requested topic and drafts questions in the right style and difficulty.",
              },
              {
                n: "3",
                title: "Every question is validated",
                body: "Answer correctness, topic scope, and duplication are checked before a question ever reaches a student.",
              },
            ].map((step) => (
              <li key={step.n} className="border-t border-paper/30 pt-4">
                <span className="font-serif text-2xl text-amber">{step.n}</span>
                <h3 className="mt-2 font-medium text-paper">{step.title}</h3>
                <p className="mt-2 text-sm text-paper/70 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What students get */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-serif text-3xl text-ink mb-10">Everything a serious exam needs</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-8">
          {[
            ["Concept practice", "Drill a single topic until it sticks, at the difficulty you choose."],
            ["Full-length mocks", "Timed CBT-style exams that follow the exact pattern your institution configured."],
            ["Weak-topic tracking", "Every attempt updates a real picture of what to practice next — never generic advice."],
            ["Downloadable papers", "Question paper, answer key, and solutions, each as a separate file."],
            ["Detailed analysis", "Subject and topic breakdowns after every attempt, not just a final score."],
            ["Source-traceable questions", "Every generated question links back to the approved chunk it came from."],
          ].map(([title, body]) => (
            <div key={title} className="border-t-2 border-ink pt-4">
              <h3 className="font-medium text-ink">{title}</h3>
              <p className="mt-2 text-sm text-slate leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row justify-between gap-2 text-sm text-slate/70">
          <span>SamAI, by Scontinent Technologies</span>
          <span>Supports NEET, KCET and JEE</span>
        </div>
      </footer>
    </main>
  );
}