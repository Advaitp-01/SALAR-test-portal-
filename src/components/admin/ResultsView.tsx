import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc } from '../../lib/tenantDb';
import {
  Award,
  BarChart3,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Search,
  Trophy,
  X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { exportToCsv } from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';
import { MathText } from '../MathText';
import type { Exam, ExamAttempt } from '../../types/portal';

export const ResultsView: React.FC = () => {
  const { tenantContext } = useAuth();
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedExamId, setSelectedExamId] = useState('ALL');
  const [classFilter, setClassFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'EVALUATED' | 'IN_PROGRESS'>('ALL');
  const [search, setSearch] = useState('');

  const [detailAttempt, setDetailAttempt] = useState<ExamAttempt | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'examAttempts'),
      (snap) => {
        setAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, 'id'>) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    const u2 = onSnapshot(
      collection(db, 'exams'),
      (snap) => {
        setExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) })));
      },
      () => {}
    );
    return () => {
      u1();
      u2();
    };
  }, []);

  // Compute rank per exam among submitted/evaluated attempts
  const rankMap = useMemo(() => {
    const map = new Map<string, number>();
    const byExam = new Map<string, ExamAttempt[]>();
    attempts.forEach((a) => {
      if (a.status === 'IN_PROGRESS') return;
      const list = byExam.get(a.examId) || [];
      list.push(a);
      byExam.set(a.examId, list);
    });
    byExam.forEach((list) => {
      const sorted = [...list].sort(
        (a, b) => (b.finalScore ?? b.autoScore ?? 0) - (a.finalScore ?? a.autoScore ?? 0)
      );
      sorted.forEach((att, idx) => {
        map.set(att.id, idx + 1);
      });
    });
    return map;
  }, [attempts]);

  const filteredAttempts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...attempts]
      .filter((a) => {
        if (selectedExamId !== 'ALL' && a.examId !== selectedExamId) return false;
        if (classFilter !== 'ALL' && a.classLevel !== classFilter) return false;
        if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
        if (!q) return true;
        return (
          a.studentName.toLowerCase().includes(q) ||
          (a.rollNumber || '').toLowerCase().includes(q) ||
          a.examTitle.toLowerCase().includes(q) ||
          (a.examCode || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.submittedAt || b.startedAt || '').localeCompare(a.submittedAt || a.startedAt || ''));
  }, [attempts, selectedExamId, classFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const completed = filteredAttempts.filter((a) => a.status !== 'IN_PROGRESS');
    if (completed.length === 0) {
      return { total: filteredAttempts.length, completed: 0, avgPct: 0, topScore: 0 };
    }
    const avgPct =
      Math.round((completed.reduce((s, a) => s + Number(a.percentage || 0), 0) / completed.length) * 10) / 10;
    const topScore = Math.max(...completed.map((a) => Number(a.finalScore ?? a.autoScore ?? 0)));
    return { total: filteredAttempts.length, completed: completed.length, avgPct, topScore };
  }, [filteredAttempts]);

  // Score distribution histogram buckets
  const distributionData = useMemo(() => {
    const buckets = [
      { range: '0-20%', count: 0 },
      { range: '21-40%', count: 0 },
      { range: '41-60%', count: 0 },
      { range: '61-80%', count: 0 },
      { range: '81-100%', count: 0 },
    ];
    filteredAttempts
      .filter((a) => a.status !== 'IN_PROGRESS')
      .forEach((a) => {
        const pct = Math.max(0, Number(a.percentage || 0));
        if (pct <= 20) buckets[0].count += 1;
        else if (pct <= 40) buckets[1].count += 1;
        else if (pct <= 60) buckets[2].count += 1;
        else if (pct <= 80) buckets[3].count += 1;
        else buckets[4].count += 1;
      });
    return buckets;
  }, [filteredAttempts]);

  const togglePublishResult = async (att: ExamAttempt) => {
    setTogglingId(att.id);
    try {
      const nextVal = !(att.resultsPublished ?? true);
      await updateDoc(doc(db, 'examAttempts', att.id), {
        resultsPublished: nextVal,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `examAttempts/${att.id}`);
    } finally {
      setTogglingId(null);
    }
  };

  const handleBulkPublishExam = async (publish: boolean) => {
    const targets = filteredAttempts.filter((a) => a.status !== 'IN_PROGRESS');
    for (const att of targets) {
      try {
        await updateDoc(doc(db, 'examAttempts', att.id), {
          resultsPublished: publish,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `examAttempts/${att.id}`);
        break;
      }
    }
  };

  const handleExportCsv = () => {
    const fileSlug = (tenantContext?.portalSlug || 'institute').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    exportToCsv(
      `${fileSlug}-results-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Rank',
        'Student Name',
        'Roll Number',
        'Class',
        'Exam Title',
        'Exam Code',
        'Status',
        'Final Score',
        'Total Marks',
        'Percentage',
        'Accuracy',
        'Correct',
        'Incorrect',
        'Unattempted',
        'Published',
        'Submitted At',
      ],
      filteredAttempts.map((a) => [
        rankMap.get(a.id) ?? '-',
        a.studentName,
        a.rollNumber || '-',
        a.classLevel || '-',
        a.examTitle,
        a.examCode || '-',
        a.status,
        a.finalScore ?? a.autoScore ?? 0,
        a.totalMarks,
        `${a.percentage ?? 0}%`,
        `${a.accuracy ?? 0}%`,
        a.correctCount ?? 0,
        a.incorrectCount ?? 0,
        a.unattemptedCount ?? 0,
        (a.resultsPublished ?? true) ? 'YES' : 'NO',
        a.submittedAt || a.startedAt,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Results &amp; Recording</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            CBT exam submissions, rank lists, scorecards, and result publication controls
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleBulkPublishExam(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-slate-700 rounded-lg"
          >
            <Eye className="w-3.5 h-3.5 text-emerald-600" />
            Publish Filtered
          </button>
          <button
            type="button"
            onClick={() => handleBulkPublishExam(false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-slate-700 rounded-lg"
          >
            <EyeOff className="w-3.5 h-3.5 text-amber-600" />
            Hide Filtered
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            Export Results CSV
          </button>
        </div>
      </div>

      {/* Summary KPIs + Distribution Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">Total Attempts</span>
              <Award className="w-4 h-4 text-[#0032A0]" />
            </div>
            <p className="font-mono text-2xl font-bold text-[#0F172A] tabular-nums">{stats.total}</p>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="font-mono text-2xl font-bold text-[#0F172A] tabular-nums">{stats.completed}</p>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">Average Score %</span>
              <BarChart3 className="w-4 h-4 text-[#2563EB]" />
            </div>
            <p className="font-mono text-2xl font-bold text-[#0032A0] tabular-nums">{stats.avgPct}%</p>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">Highest Score</span>
              <Trophy className="w-4 h-4 text-amber-600" />
            </div>
            <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">{stats.topScore}</p>
          </div>
        </div>

        <div className="xl:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-5">
          <h2 className="font-display font-bold text-sm text-[#0F172A] mb-3">
            Percentage Distribution (Completed Submissions)
          </h2>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', borderColor: '#E2E8F0', fontSize: '12px' }} />
                <Bar dataKey="count" name="Students" fill="#0032A0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student, roll no, exam..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
        <select
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
          className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
        >
          <option value="ALL">All Examinations</option>
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.code} · {ex.title}
            </option>
          ))}
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
        >
          <option value="ALL">All Classes</option>
          <option value="Class 11th">Class 11th</option>
          <option value="Class 12th">Class 12th</option>
          <option value="Dropper / Repeater">Dropper / Repeater</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
        >
          <option value="ALL">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="EVALUATED">Evaluated</option>
          <option value="IN_PROGRESS">In Progress</option>
        </select>
      </div>

      {/* Results Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-mono text-slate-500 uppercase">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Examination</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Accuracy / C-I-U</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500 font-mono">
                    Loading examination attempts...
                  </td>
                </tr>
              ) : filteredAttempts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No matching examination records found.
                  </td>
                </tr>
              ) : (
                filteredAttempts.map((att) => {
                  const rank = rankMap.get(att.id);
                  const published = att.resultsPublished ?? true;
                  const finalScore = att.finalScore ?? att.autoScore ?? 0;
                  return (
                    <tr key={att.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono font-bold text-[#0032A0] tabular-nums">
                        {rank ? `#${rank}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0F172A]">{att.studentName}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {att.rollNumber || att.studentUid.slice(0, 8)} · {att.classLevel || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#0F172A]">{att.examTitle}</p>
                        <p className="font-mono text-[11px] text-slate-500">{att.examCode || att.examId}</p>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        <span className="font-bold text-[#0F172A]">
                          {finalScore} / {att.totalMarks}
                        </span>
                        <span className="block text-[11px] text-[#0032A0]">{att.percentage ?? 0}%</span>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-600">
                        <span>{att.accuracy ?? 0}%</span>
                        <span className="block text-[11px] text-slate-400">
                          {att.correctCount ?? 0}C / {att.incorrectCount ?? 0}I / {att.unattemptedCount ?? 0}U
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                            att.status === 'EVALUATED'
                              ? 'bg-blue-50 text-[#0032A0] border border-blue-200'
                              : att.status === 'SUBMITTED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {att.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={togglingId === att.id || att.status === 'IN_PROGRESS'}
                          onClick={() => togglePublishResult(att)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-semibold border disabled:opacity-40 ${
                            published
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-[#E2E8F0]'
                          }`}
                        >
                          {published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {published ? 'VISIBLE' : 'HIDDEN'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailAttempt(att)}
                          className="px-3 py-1.5 text-xs font-semibold text-[#0032A0] border border-[#E2E8F0] hover:bg-blue-50 rounded-lg"
                        >
                          View Paper
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Attempt Modal */}
      {detailAttempt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">
                  {detailAttempt.studentName} — {detailAttempt.examTitle}
                </h3>
                <p className="text-xs font-mono text-slate-500">
                  Score: {detailAttempt.finalScore ?? detailAttempt.autoScore ?? 0}/{detailAttempt.totalMarks} (
                  {detailAttempt.percentage ?? 0}%) · Accuracy: {detailAttempt.accuracy ?? 0}%
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailAttempt(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {(detailAttempt.questionResults || []).length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  No question-level breakdown recorded for this attempt yet.
                </p>
              ) : (
                (detailAttempt.questionResults || []).map((qRes, idx) => (
                  <div key={qRes.questionId} className="border border-[#E2E8F0] rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-[#0032A0]">
                        Q{idx + 1} · {qRes.questionType}
                      </span>
                      <span
                        className={`font-semibold ${
                          qRes.status === 'CORRECT'
                            ? 'text-emerald-700'
                            : qRes.status === 'INCORRECT'
                            ? 'text-red-600'
                            : qRes.status === 'OVERRIDDEN'
                            ? 'text-[#0032A0]'
                            : 'text-slate-500'
                        }`}
                      >
                        {qRes.status} ({qRes.marksAwarded > 0 ? `+${qRes.marksAwarded}` : qRes.marksAwarded}/
                        {qRes.maxMarks})
                      </span>
                    </div>
                    <div className="text-sm text-[#0F172A]">
                      <MathText text={qRes.questionText} />
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs font-mono pt-1">
                      <span>
                        Candidate: <strong>{qRes.candidateAnswer || 'Unattempted'}</strong>
                      </span>
                      <span>
                        Official Key: <strong className="text-emerald-700">{qRes.officialAnswer}</strong>
                      </span>
                    </div>
                    {qRes.comment && (
                      <p className="text-xs text-[#0032A0] bg-blue-50 rounded px-2.5 py-1.5">
                        Evaluator note: {qRes.comment}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
