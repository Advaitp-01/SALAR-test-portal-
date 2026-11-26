import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, writeBatch } from '../../lib/tenantDb';
import { CheckCircle2, ClipboardCheck, History, Search } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { useAuth } from '../../context/AuthContext';
import { MathText } from '../MathText';
import type { EvaluationLog, ExamAttempt, QuestionResultItem } from '../../types/portal';

export const EvaluationView: React.FC = () => {
  const { firebaseUser, tenantContext, settings } = useAuth();
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [logs, setLogs] = useState<EvaluationLog[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [tab, setTab] = useState<'evaluate' | 'history'>('evaluate');

  // Editable per-question override marks & overall adjustment
  const [questionMarksDraft, setQuestionMarksDraft] = useState<Record<string, string>>({});
  const [questionNotesDraft, setQuestionNotesDraft] = useState<Record<string, string>>({});
  const [bonusDelta, setBonusDelta] = useState<string>('0');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'examAttempts'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, 'id'>) }))
          .filter((a) => a.status !== 'IN_PROGRESS')
          .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
        setAttempts(list);
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0].id);
        }
      },
      () => {}
    );

    const u2 = onSnapshot(
      query(collection(db, 'evaluationLogs'), orderBy('createdAt', 'desc')),
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EvaluationLog, 'id'>) })));
      },
      () => {}
    );

    return () => {
      u1();
      u2();
    };
  }, [selectedId]);

  const filteredAttempts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attempts;
    return attempts.filter(
      (a) =>
        a.studentName.toLowerCase().includes(q) ||
        a.examTitle.toLowerCase().includes(q) ||
        (a.rollNumber || '').toLowerCase().includes(q) ||
        (a.examCode || '').toLowerCase().includes(q)
    );
  }, [attempts, search]);

  const selectedAttempt = useMemo(
    () => attempts.find((a) => a.id === selectedId) || null,
    [attempts, selectedId]
  );

  useEffect(() => {
    if (!selectedAttempt) return;
    const qDraft: Record<string, string> = {};
    const nDraft: Record<string, string> = {};
    (selectedAttempt.questionResults || []).forEach((qr) => {
      qDraft[qr.questionId] = String(qr.marksAwarded);
      nDraft[qr.questionId] = qr.comment || '';
    });
    setQuestionMarksDraft(qDraft);
    setQuestionNotesDraft(nDraft);
    setBonusDelta(String(selectedAttempt.manualAdjustment ?? 0));
    setReason('');
    setFeedback(null);
  }, [selectedAttempt?.id]);

  const computedPreviewScore = useMemo(() => {
    if (!selectedAttempt) return 0;
    const results = selectedAttempt.questionResults || [];
    const baseSum =
      results.length > 0
        ? results.reduce((sum, qr) => sum + Number(questionMarksDraft[qr.questionId] ?? qr.marksAwarded ?? 0), 0)
        : Number(selectedAttempt.autoScore ?? 0);
    return Math.round((baseSum + Number(bonusDelta || 0)) * 100) / 100;
  }, [selectedAttempt, questionMarksDraft, bonusDelta]);

  const handleApplyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAttempt) return;
    if (!reason.trim()) {
      setFeedback({ type: 'error', text: 'Please enter a mandatory audit reason for this evaluation adjustment.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    const now = new Date().toISOString();
    const prevScore = Number(selectedAttempt.finalScore ?? selectedAttempt.autoScore ?? 0);
    const newScore = computedPreviewScore;
    const delta = Math.round((newScore - prevScore) * 100) / 100;

    const updatedResults: QuestionResultItem[] = (selectedAttempt.questionResults || []).map((qr) => {
      const updatedMarks = Number(questionMarksDraft[qr.questionId] ?? qr.marksAwarded);
      const comment = (questionNotesDraft[qr.questionId] || '').trim();
      const changed = updatedMarks !== qr.marksAwarded;
      return {
        ...qr,
        marksAwarded: updatedMarks,
        status: changed ? 'OVERRIDDEN' : qr.status,
        manualOverride: changed || qr.manualOverride,
        comment,
      };
    });

    const totalMarks = Number(selectedAttempt.totalMarks || 0);
    const percentage = totalMarks > 0 ? Math.round((newScore / totalMarks) * 1000) / 10 : 0;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'examAttempts', selectedAttempt.id), {
        questionResults: updatedResults,
        manualAdjustment: Number(bonusDelta || 0),
        finalScore: newScore,
        percentage,
        status: 'EVALUATED',
        updatedAt: now,
      });

      const logRef = doc(collection(db, 'evaluationLogs'));
      batch.set(logRef, {
        attemptId: selectedAttempt.id,
        examId: selectedAttempt.examId,
        examTitle: selectedAttempt.examTitle,
        studentName: selectedAttempt.studentName,
        previousScore: prevScore,
        newScore,
        adjustmentDelta: delta,
        reason: reason.trim(),
        evaluatorEmail: firebaseUser?.email || tenantContext?.email || settings.email || 'admin@institute.local',
        createdAt: now,
      });

      await batch.commit();
      setReason('');
      setFeedback({
        type: 'success',
        text: `Evaluation applied (${prevScore} -> ${newScore}) and immutable audit log saved.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `examAttempts/${selectedAttempt.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Evaluation &amp; Moderation</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review submitted Mathematics answers, override question marks, and record immutable audit logs
          </p>
        </div>
        <div className="inline-flex p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('evaluate')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'evaluate' ? 'bg-white text-[#0032A0] shadow-xs' : 'text-slate-600'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Paper Evaluation
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'history' ? 'bg-white text-[#0032A0] shadow-xs' : 'text-slate-600'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Audit History ({logs.length})
          </button>
        </div>
      </div>

      {tab === 'history' ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-mono text-slate-500 uppercase">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Candidate &amp; Exam</th>
                  <th className="px-4 py-3">Score Change</th>
                  <th className="px-4 py-3">Audit Reason</th>
                  <th className="px-4 py-3">Evaluator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      No manual evaluation overrides recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                        {log.createdAt.slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0F172A]">{log.studentName || log.attemptId}</p>
                        <p className="text-slate-500">{log.examTitle || log.examId}</p>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold tabular-nums">
                        <span className="text-slate-500">{log.previousScore}</span>
                        <span className="mx-1.5 text-slate-400">-&gt;</span>
                        <span className="text-[#0032A0]">{log.newScore}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{log.reason}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{log.evaluatorEmail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel: Submissions List */}
          <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl flex flex-col max-h-[75vh] overflow-hidden">
            <div className="p-3.5 border-b border-[#E2E8F0]">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search candidate or test..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredAttempts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No submitted examinations available for evaluation.
                </div>
              ) : (
                filteredAttempts.map((att) => {
                  const active = att.id === selectedId;
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => setSelectedId(att.id)}
                      className={`w-full text-left p-4 transition-colors ${
                        active ? 'bg-blue-50/80 border-r-2 border-r-[#0032A0]' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[#0F172A] truncate">{att.studentName}</span>
                        <span className="font-mono text-xs font-bold text-[#0032A0] tabular-nums">
                          {att.finalScore ?? att.autoScore ?? 0}/{att.totalMarks}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 truncate mt-0.5">{att.examTitle}</p>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-1">
                        <span>{att.rollNumber || 'CBT'}</span>
                        <span>{att.status}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Submitted Questions & Override Controls */}
          <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl p-5">
            {!selectedAttempt ? (
              <div className="py-16 text-center text-sm text-slate-500">
                Select a candidate submission from the left list to review answers and adjust marks.
              </div>
            ) : (
              <form onSubmit={handleApplyAdjustment} className="space-y-5">
                <div className="pb-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display font-bold text-lg text-[#0F172A]">
                      {selectedAttempt.studentName}
                    </h2>
                    <p className="text-xs font-mono text-slate-500">
                      {selectedAttempt.examTitle} · Auto Score: {selectedAttempt.autoScore ?? 0} · Current Final:{' '}
                      {selectedAttempt.finalScore ?? selectedAttempt.autoScore ?? 0}/{selectedAttempt.totalMarks}
                    </p>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-[11px] text-slate-500 block">NEW COMPUTED SCORE</span>
                    <span className="text-xl font-bold text-[#0032A0] tabular-nums">
                      {computedPreviewScore} / {selectedAttempt.totalMarks}
                    </span>
                  </div>
                </div>

                {feedback && (
                  <div
                    className={`p-3 rounded-lg text-xs border ${
                      feedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {feedback.text}
                  </div>
                )}

                <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                  {(selectedAttempt.questionResults || []).map((qr, idx) => (
                    <div key={qr.questionId} className="border border-[#E2E8F0] rounded-lg p-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                        <span className="font-bold text-[#0032A0]">
                          Question {idx + 1} ({qr.questionType})
                        </span>
                        <span className="text-slate-500">Max Marks: {qr.maxMarks}</span>
                      </div>
                      <div className="text-sm text-[#0F172A]">
                        <MathText text={qr.questionText} />
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs font-mono bg-slate-50 p-2.5 rounded-lg">
                        <span>
                          Candidate Response: <strong>{qr.candidateAnswer || 'Unattempted'}</strong>
                        </span>
                        <span>
                          Official Key: <strong className="text-emerald-700">{qr.officialAnswer}</strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div>
                          <label className="block text-[11px] font-mono text-slate-600 mb-1">
                            Override Question Marks
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={questionMarksDraft[qr.questionId] ?? String(qr.marksAwarded)}
                            onChange={(e) =>
                              setQuestionMarksDraft((prev) => ({ ...prev, [qr.questionId]: e.target.value }))
                            }
                            className="w-full px-3 py-1.5 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-mono text-slate-600 mb-1">
                            Question Remark (Optional)
                          </label>
                          <input
                            type="text"
                            value={questionNotesDraft[qr.questionId] || ''}
                            onChange={(e) =>
                              setQuestionNotesDraft((prev) => ({ ...prev, [qr.questionId]: e.target.value }))
                            }
                            placeholder="e.g. Bonus mark for ambiguous option"
                            className="w-full px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Overall Adjustment & Mandatory Reason */}
                <div className="bg-slate-50 border border-[#E2E8F0] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Overall Bonus / Grace Marks
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={bonusDelta}
                      onChange={(e) => setBonusDelta(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] bg-white rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mandatory Audit Reason *
                    </label>
                    <input
                      type="text"
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explain reason for score adjustment (logged permanently)"
                      className="w-full px-3 py-2 text-xs border border-[#E2E8F0] bg-white rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {saving ? 'Recording Evaluation...' : 'Apply Adjustment & Save Log'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
