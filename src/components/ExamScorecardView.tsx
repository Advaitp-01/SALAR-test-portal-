import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  Sparkles,
  Target,
  TrendingUp,
  X,
  ZoomIn,
} from 'lucide-react';
import { MathText } from './MathText';
import type { Exam, ExamAttempt, ExamQuestion } from '../types/portal';

interface ExamScorecardViewProps {
  exam: Exam;
  questions: ExamQuestion[];
  attemptRecord: ExamAttempt;
  instituteName?: string;
  onExit: () => void;
}

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rot: number;
  vRot: number;
  opacity: number;
}

const CONFETTI_COLORS = [
  '#0032A0',
  '#2563EB',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
];

const ConfettiCelebration: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDone(true);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const pieces: ConfettiPiece[] = Array.from({ length: 110 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * (canvas.height * 0.65),
      vx: (Math.random() - 0.5) * 3.2,
      vy: 2.3 + Math.random() * 3.4,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.16,
      opacity: 0.9,
    }));

    const startTime = performance.now();
    const durationMs = 4600;
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const fadeStart = 3200;
      const globalAlpha =
        elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / (durationMs - fadeStart)) : 1;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx += Math.sin(elapsed * 0.004 + p.rot) * 0.03;
        p.rot += p.vRot;

        if (p.y > canvas.height + 24 && elapsed < fadeStart) {
          p.y = -15;
          p.x = Math.random() * canvas.width;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.opacity * globalAlpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (elapsed < durationMs) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (done) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-40 pointer-events-none print:hidden"
    />
  );
};

export const ExamScorecardView: React.FC<ExamScorecardViewProps> = ({
  exam,
  questions,
  attemptRecord,
  instituteName,
  onExit,
}) => {
  const [filterTab, setFilterTab] = useState<'ALL' | 'INCORRECT' | 'SKIPPED' | 'CORRECT'>('ALL');
  const [toastOpen, setToastOpen] = useState(true);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setToastOpen(false), 6500);
    return () => window.clearTimeout(timer);
  }, []);

  const results = attemptRecord.questionResults || [];
  const totalQ = results.length > 0 ? results.length : questions.length;
  const finalScore = attemptRecord.finalScore ?? attemptRecord.autoScore ?? 0;
  const totalMarks = attemptRecord.totalMarks || 0;
  const percentage = attemptRecord.percentage ?? (totalMarks > 0 ? Math.max(0, Math.round((finalScore / totalMarks) * 100)) : 0);
  const accuracy = attemptRecord.accuracy ?? 0;
  const correctCount = attemptRecord.correctCount ?? 0;
  const incorrectCount = attemptRecord.incorrectCount ?? 0;
  const unattemptedCount = attemptRecord.unattemptedCount ?? 0;
  const attemptedCount = correctCount + incorrectCount;

  const positiveEarned = useMemo(
    () => results.reduce((sum, r) => (r.marksAwarded > 0 ? sum + r.marksAwarded : sum), 0),
    [results]
  );
  const negativeDeducted = useMemo(
    () => results.reduce((sum, r) => (r.marksAwarded < 0 ? sum + Math.abs(r.marksAwarded) : sum), 0),
    [results]
  );

  // Elapsed time taken from startedAt -> submittedAt
  const { timeTakenMin, secPerQuestion } = useMemo(() => {
    const startMs = attemptRecord.startedAt ? new Date(attemptRecord.startedAt).getTime() : 0;
    const endMs = attemptRecord.submittedAt ? new Date(attemptRecord.submittedAt).getTime() : Date.now();
    const diffSec = startMs > 0 && endMs >= startMs ? Math.max(15, Math.round((endMs - startMs) / 1000)) : 60;
    const mins = Math.max(1, Math.round(diffSec / 60));
    const perQ = totalQ > 0 ? Math.max(1, Math.round(diffSec / totalQ)) : diffSec;
    return { timeTakenMin: mins, secPerQuestion: perQ };
  }, [attemptRecord.startedAt, attemptRecord.submittedAt, totalQ]);

  // Projected rank & percentile diagnostic calibrated cleanly to score percentage
  const { projectedRank, percentileValue, rankBandLabel, targetBenchmarkMet } = useMemo(() => {
    const pct = Math.max(0, Math.min(100, percentage));
    const rank = pct >= 90 ? 1 : pct >= 75 ? 2 : pct >= 55 ? 3 : pct >= 30 ? 4 : Math.max(4, Math.round(12 - pct * 0.25));
    const estPercentile = Math.min(99, Math.max(45, Math.round(52 + pct * 0.46)));
    const band =
      pct >= 85
        ? 'Top 5% Merit Tier'
        : pct >= 65
        ? 'Top 15% Merit Tier'
        : pct >= 40
        ? 'Qualifying Cohort Band'
        : 'Foundation Practice Band';
    return {
      projectedRank: `#${rank}`,
      percentileValue: estPercentile,
      rankBandLabel: band,
      targetBenchmarkMet: pct >= 40,
    };
  }, [percentage]);

  // Group topic / subject readiness dynamically from questions
  const topicBuckets = useMemo(() => {
    const map = new Map<string, { label: string; correct: number; total: number }>();
    results.forEach((res) => {
      const q = questions.find((item) => item.id === res.questionId);
      const label = (q?.topic || q?.subject || exam.subject || exam.title || 'General Assessment').trim();
      const entry = map.get(label) || { label, correct: 0, total: 0 };
      entry.total += 1;
      if (res.status === 'CORRECT') entry.correct += 1;
      map.set(label, entry);
    });
    if (map.size === 0) {
      map.set(exam.subject || exam.title, {
        label: exam.subject || exam.title,
        correct: correctCount,
        total: Math.max(1, totalQ),
      });
    }
    return Array.from(map.values()).map((bucket) => {
      const acc = bucket.total > 0 ? Math.round((bucket.correct / bucket.total) * 100) : 0;
      const statusLabel = acc >= 75 ? 'Mastered' : acc >= 45 ? 'On Track' : 'Needs Practice';
      const tone = acc >= 75 ? 'emerald' : acc >= 45 ? 'amber' : 'red';
      return { ...bucket, acc, statusLabel, tone };
    });
  }, [results, questions, exam.subject, exam.title, correctCount, totalQ]);

  const filteredResults = useMemo(() => {
    return results
      .map((res, idx) => ({ res, idx }))
      .filter(({ res }) => {
        if (filterTab === 'CORRECT') return res.status === 'CORRECT' || res.status === 'OVERRIDDEN';
        if (filterTab === 'INCORRECT') return res.status === 'INCORRECT';
        if (filterTab === 'SKIPPED') return res.status === 'UNATTEMPTED';
        return true;
      });
  }, [results, filterTab]);

  const defaultPos = useMemo(() => {
    const first = questions[0]?.positiveMarks;
    if (typeof first === 'number') return first;
    return (exam.examTag || exam.target || '').toUpperCase().includes('MHT-CET') ? 2 : 4;
  }, [questions, exam.examTag, exam.target]);

  const defaultNeg = useMemo(() => {
    const first = questions[0]?.negativeMarks;
    if (typeof first === 'number') return first;
    return (exam.examTag || exam.target || '').toUpperCase().includes('MHT-CET') ? 0 : 1;
  }, [questions, exam.examTag, exam.target]);

  const whatsappShareUrl = useMemo(() => {
    const text = [
      `Official CBT Scorecard — ${instituteName || 'Examination Portal'}`,
      `Exam: ${exam.title} (${exam.code})`,
      `Candidate: ${attemptRecord.studentName}${attemptRecord.rollNumber ? ` (${attemptRecord.rollNumber})` : ''}`,
      `Score: ${finalScore} / ${totalMarks} (${percentage}%)`,
      `Accuracy: ${accuracy}% | Correct: ${correctCount} | Incorrect: ${incorrectCount} | Skipped: ${unattemptedCount}`,
    ].join('\n');
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }, [
    instituteName,
    exam.title,
    exam.code,
    attemptRecord.studentName,
    attemptRecord.rollNumber,
    finalScore,
    totalMarks,
    percentage,
    accuracy,
    correctCount,
    incorrectCount,
    unattemptedCount,
  ]);

  const handleDownloadExamPdf = () => {
    if (exam.pdfUrl) {
      const a = document.createElement('a');
      a.href = exam.pdfUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    window.print();
  };

  const handlePrintOfflineSolutions = () => {
    setFilterTab('ALL');
    window.setTimeout(() => {
      window.print();
    }, 80);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] py-5 sm:py-8 px-3 sm:px-6 relative">
      <ConfettiCelebration />

      <div className="max-w-5xl mx-auto space-y-5 relative z-10">
        {/* Top Scorecard Header Card */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#0032A0] text-white flex items-center justify-center shrink-0 shadow-xs">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                  <span className="font-bold uppercase tracking-wider text-[#0032A0]">
                    Official CBT Scorecard
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    EVALUATED
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                    <Sparkles className="w-3.5 h-3.5" />
                    Congratulations, {attemptRecord.studentName}!
                  </span>
                </div>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] leading-snug truncate">
                  {exam.title}
                </h1>
                <p className="text-xs font-mono text-slate-600 truncate">
                  Code: <span className="font-semibold text-[#0F172A]">{exam.code}</span>
                  {' · '}
                  Candidate: <span className="font-semibold text-[#0F172A]">{attemptRecord.studentName}</span>
                  {attemptRecord.rollNumber ? ` (${attemptRecord.rollNumber})` : ''}
                  {instituteName ? ` · ${instituteName}` : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden shrink-0">
              <button
                type="button"
                onClick={handleDownloadExamPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download Exam Paper (PDF)
              </button>
              <button
                type="button"
                onClick={handlePrintOfflineSolutions}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-slate-50 text-[#0F172A] border border-[#E2E8F0] rounded-lg transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-slate-600" />
                Offline Paper &amp; Solutions
              </button>
              <a
                href={whatsappShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </a>
              <button
                type="button"
                onClick={onExit}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-[#E2E8F0] rounded-lg transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </button>
            </div>
          </div>
        </section>

        {/* 4 Summary Metric Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-5 text-center space-y-1">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
              Total Score
            </p>
            <p className="font-mono text-3xl font-bold text-[#0032A0] tabular-nums">
              {finalScore}{' '}
              <span className="text-base font-medium text-slate-500">/ {totalMarks}</span>
            </p>
            <p className="text-xs font-medium text-[#0032A0]">{percentage}% aggregate</p>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5 text-center space-y-1">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
              Accuracy
            </p>
            <p className="font-mono text-3xl font-bold text-emerald-700 tabular-nums">{accuracy}%</p>
            <p className="text-xs font-medium text-emerald-700">
              {correctCount} of {attemptedCount} correct
            </p>
          </div>

          <div className="bg-violet-50/60 border border-violet-200 rounded-xl p-5 text-center space-y-1">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
              Projected Rank
            </p>
            <p className="font-mono text-3xl font-bold text-violet-700 tabular-nums">{projectedRank}</p>
            <p className="text-xs font-medium text-violet-700">{rankBandLabel}</p>
          </div>

          <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-5 text-center space-y-1">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
              Time Taken
            </p>
            <p className="font-mono text-3xl font-bold text-amber-800 tabular-nums">
              {timeTakenMin} <span className="text-base font-medium">min</span>
            </p>
            <p className="text-xs font-medium text-amber-700">~{secPerQuestion}s / question</p>
          </div>
        </section>

        {/* 3-Column Marks Breakdown Strip */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl px-5 py-4 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] text-center gap-3 sm:gap-0">
          <div className="py-1 sm:py-0">
            <p className="font-mono text-sm font-bold text-emerald-700">+{positiveEarned} marks</p>
            <p className="text-[11px] font-mono text-slate-500 uppercase mt-0.5">
              {correctCount} CORRECT (+{defaultPos})
            </p>
          </div>
          <div className="py-1 sm:py-0">
            <p className="font-mono text-sm font-bold text-red-600">-{negativeDeducted} marks</p>
            <p className="text-[11px] font-mono text-slate-500 uppercase mt-0.5">
              {incorrectCount} INCORRECT (-{defaultNeg})
            </p>
          </div>
          <div className="py-1 sm:py-0">
            <p className="font-mono text-sm font-bold text-slate-700">0 marks</p>
            <p className="text-[11px] font-mono text-slate-500 uppercase mt-0.5">
              {unattemptedCount} SKIPPED (0)
            </p>
          </div>
        </section>

        {/* Topic Readiness & Mastery Diagnostic */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-bold text-xs sm:text-sm uppercase tracking-wider text-[#0F172A] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0032A0]" />
              Topic Readiness &amp; Mastery Diagnostic
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              <span className="font-bold text-[#0032A0]">{percentileValue}th Percentile</span>
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  targetBenchmarkMet ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                {targetBenchmarkMet ? 'Target Benchmark Qualified' : 'Review Recommended'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topicBuckets.map((bucket) => (
              <div
                key={bucket.label}
                className="p-4 bg-slate-50/70 border border-[#E2E8F0] rounded-lg space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#0F172A] truncate">{bucket.label}</p>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold shrink-0 ${
                      bucket.tone === 'emerald'
                        ? 'text-emerald-700'
                        : bucket.tone === 'amber'
                        ? 'text-amber-700'
                        : 'text-red-600'
                    }`}
                  >
                    {bucket.tone === 'red' && <AlertTriangle className="w-3 h-3" />}
                    {bucket.statusLabel}
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      bucket.tone === 'emerald'
                        ? 'bg-emerald-600'
                        : bucket.tone === 'amber'
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(4, bucket.acc)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-600">
                  <span>
                    {bucket.correct} of {bucket.total} solved correctly
                  </span>
                  <span className="font-bold text-[#0F172A]">{bucket.acc}% accuracy</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Question-by-Question Solution & Explanations */}
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
            <div>
              <h2 className="font-display font-bold text-sm sm:text-base uppercase tracking-wide text-[#0F172A]">
                Question-by-Question Solution &amp; Explanations
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Review complete official answer keys with step-by-step methods and shortcuts.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 print:hidden">
              <button
                type="button"
                onClick={() => setFilterTab('ALL')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  filterTab === 'ALL'
                    ? 'bg-[#0F172A] text-white border-[#0F172A]'
                    : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                All ({results.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('INCORRECT')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  filterTab === 'INCORRECT'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-red-50/70 text-red-700 border-red-200 hover:bg-red-100/70'
                }`}
              >
                Incorrect ({incorrectCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('SKIPPED')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  filterTab === 'SKIPPED'
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-slate-100 text-slate-700 border-[#E2E8F0] hover:bg-slate-200'
                }`}
              >
                Skipped ({unattemptedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('CORRECT')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  filterTab === 'CORRECT'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-emerald-50/70 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70'
                }`}
              >
                Correct ({correctCount})
              </button>
            </div>
          </div>

          {filteredResults.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-slate-500">
              No questions match this filter category.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredResults.map(({ res, idx }) => {
                const matchedQ = questions.find((q) => q.id === res.questionId);
                const statusBadgeLabel =
                  res.status === 'CORRECT' || res.status === 'OVERRIDDEN'
                    ? `CORRECT (+${res.marksAwarded} MARKS)`
                    : res.status === 'INCORRECT'
                    ? `INCORRECT (${res.marksAwarded} MARKS)`
                    : 'UNATTEMPTED (0 MARKS)';

                return (
                  <article
                    key={res.questionId}
                    className="border border-[#E2E8F0] rounded-xl p-4 sm:p-5 space-y-3 bg-white"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span className="font-bold text-[#0F172A] text-sm">Q{idx + 1}.</span>
                        <span className="text-slate-500">
                          {matchedQ?.subject || exam.subject || exam.title}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-slate-500">{res.questionType}</span>
                      </div>

                      <span
                        className={`text-[11px] font-mono font-bold uppercase ${
                          res.status === 'CORRECT' || res.status === 'OVERRIDDEN'
                            ? 'text-emerald-700'
                            : res.status === 'INCORRECT'
                            ? 'text-red-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {statusBadgeLabel}
                      </span>
                    </div>

                    {res.questionText && (
                      <div className="text-sm text-[#0F172A] leading-relaxed">
                        <MathText text={res.questionText} />
                      </div>
                    )}

                    {matchedQ?.questionImageUrl && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setZoomImageUrl(matchedQ.questionImageUrl || null)}
                          className="inline-block rounded-lg border border-[#E2E8F0] overflow-hidden bg-white hover:border-[#2563EB] transition-colors"
                          title="Click to zoom diagram"
                        >
                          <img
                            src={matchedQ.questionImageUrl}
                            alt={`Question ${idx + 1} diagram`}
                            referrerPolicy="no-referrer"
                            className="max-h-64 max-w-full object-contain"
                          />
                        </button>
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 print:hidden">
                          <ZoomIn className="w-3 h-3" />
                          Click to enlarge diagram
                        </p>
                      </div>
                    )}

                    {matchedQ?.options && matchedQ.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {matchedQ.options.map((opt) => {
                          const officialSet = new Set(
                            (res.officialAnswer || '')
                              .split(',')
                              .map((s) => s.trim().toUpperCase())
                              .filter(Boolean)
                          );
                          const candidateSet = new Set(
                            (res.candidateAnswer || '')
                              .split(',')
                              .map((s) => s.trim().toUpperCase())
                              .filter(Boolean)
                          );
                          const isOfficial = officialSet.has(opt.id.toUpperCase());
                          const isCandidateWrong = candidateSet.has(opt.id.toUpperCase()) && !isOfficial;

                          return (
                            <div
                              key={opt.id}
                              className={`px-3 py-2 rounded-lg border text-xs flex items-start gap-2 ${
                                isOfficial
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                  : isCandidateWrong
                                  ? 'bg-red-50 border-red-300 text-red-900'
                                  : 'bg-slate-50 border-[#E2E8F0] text-slate-700'
                              }`}
                            >
                              <span className="font-mono font-bold shrink-0">{opt.id}.</span>
                              <span className="min-w-0">
                                {opt.text ? <MathText text={opt.text} /> : `Option ${opt.id}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-5 text-xs font-mono pt-2 border-t border-slate-100">
                      <span className="text-slate-600">
                        Your Answer:{' '}
                        <strong className="text-[#0F172A]">
                          {res.candidateAnswer || 'Not Attempted'}
                        </strong>
                      </span>
                      <span className="text-slate-600">
                        Official Answer:{' '}
                        <strong className="text-emerald-700">{res.officialAnswer}</strong>
                      </span>
                    </div>

                    {matchedQ?.explanation && (
                      <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-slate-700 space-y-1">
                        <p className="font-mono font-bold text-[#0032A0] uppercase text-[11px]">
                          Solution &amp; Explanation
                        </p>
                        <div className="leading-relaxed">
                          <MathText text={matchedQ.explanation} />
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Bottom Footer Note */}
        <footer className="pb-6 text-center text-xs font-mono text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-[#0032A0]" />
            Verified CBT Result · {instituteName || 'Examination Portal'} · {exam.code}
          </span>
          <span className="mx-2 text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {(attemptRecord.submittedAt || '').slice(0, 19).replace('T', ' ')}
          </span>
        </footer>
      </div>

      {/* Bottom-Right Submitted Toast Notification */}
      {toastOpen && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 bg-[#0F172A] text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-3 text-xs font-medium print:hidden"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Exam submitted! Score:{' '}
            <strong className="font-mono">
              {finalScore}/{totalMarks}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => setToastOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded"
            aria-label="Close submission notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Zoomed Diagram Lightbox */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 print:hidden"
          onClick={() => setZoomImageUrl(null)}
        >
          <div
            className="relative bg-white rounded-xl p-3 max-w-4xl max-h-[90vh] overflow-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomImageUrl(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-900/75 text-white hover:bg-slate-900"
              aria-label="Close zoomed diagram"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={zoomImageUrl}
              alt="Zoomed question diagram"
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[82vh] object-contain mx-auto rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};
