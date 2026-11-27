import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocs, orderBy, query, setDoc, updateDoc, where } from '../lib/tenantDb';
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  Grid,
  Send,
  X,
  ZoomIn,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { gradeExamAttempt } from '../lib/portalService';
import { useAuth } from '../context/AuthContext';
import { MathText } from './MathText';
import type { Exam, ExamAttempt, ExamQuestion, StudentAnswerEntry } from '../types/portal';

export interface DirectCandidateInfo {
  uid: string;
  name: string;
  mobile: string;
  classLevel: string;
  collegeName?: string;
  rollNumber: string;
}

interface CBTExamInterfaceProps {
  exam: Exam;
  isPreviewMode?: boolean;
  initialQuestions?: ExamQuestion[];
  directCandidate?: DirectCandidateInfo | null;
  orgId?: string;
  skipInstructions?: boolean;
  onExit: () => void;
}

export const CBTExamInterface: React.FC<CBTExamInterfaceProps> = ({
  exam,
  isPreviewMode = false,
  initialQuestions,
  directCandidate,
  orgId,
  skipInstructions = false,
  onExit,
}) => {
  const { firebaseUser, studentProfile, tenantContext } = useAuth();
  const [questions, setQuestions] = useState<ExamQuestion[]>(initialQuestions || []);
  const [loading, setLoading] = useState(!(initialQuestions && initialQuestions.length > 0));
  const [phase, setPhase] = useState<'instructions' | 'active' | 'submitted'>(
    skipInstructions ? 'active' : 'instructions'
  );
  const [agreed, setAgreed] = useState(skipInstructions);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptRecord, setAttemptRecord] = useState<ExamAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerEntry>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(exam.durationMinutes * 60);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({});

  const expiresAtRef = useRef<number>(Date.now() + exam.durationMinutes * 60 * 1000);
  const autoSubmittedRef = useRef(false);

  const activeCandidateUid = directCandidate?.uid || firebaseUser?.uid || '';
  const localProgressKey = activeCandidateUid ? `salar_cbt_local_${exam.id}_${activeCandidateUid}` : '';

  // Load isolated questions for THIS exam only
  useEffect(() => {
    let active = true;
    const load = async () => {
      let list: ExamQuestion[] = initialQuestions && initialQuestions.length > 0 ? [...initialQuestions] : [];
      if (list.length === 0) {
        setLoading(true);
        try {
          const qSnap = await getDocs(
            query(collection(db, 'exams', exam.id, 'questions'), orderBy('orderIndex', 'asc'))
          );
          if (!active) return;
          list = qSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamQuestion, 'id'>) }));
        } catch (err) {
          if (!isPreviewMode && !directCandidate) {
            handleFirestoreError(err, OperationType.GET, `exams/${exam.id}/questions`);
          }
        }
      }

      if (!active) return;
      if (exam.randomizeQuestions && !isPreviewMode) {
        list = [...list].sort(() => Math.random() - 0.5);
      }
      setQuestions(list);

      // Restore local progress if resuming
      if (localProgressKey) {
        try {
          const raw = window.localStorage.getItem(localProgressKey);
          if (raw) {
            const saved = JSON.parse(raw) as {
              attemptId?: string;
              answers?: Record<string, StudentAnswerEntry>;
              expiresAt?: number;
              submittedRecord?: ExamAttempt;
            };
            if (saved.submittedRecord) {
              setAttemptRecord(saved.submittedRecord);
              setAnswers(saved.answers || {});
              setPhase('submitted');
              setLoading(false);
              return;
            }
            if (saved.attemptId) setAttemptId(saved.attemptId);
            if (saved.answers) setAnswers(saved.answers);
            if (typeof saved.expiresAt === 'number' && saved.expiresAt > Date.now()) {
              expiresAtRef.current = saved.expiresAt;
              setSecondsLeft(Math.max(0, Math.floor((saved.expiresAt - Date.now()) / 1000)));
            }
          }
        } catch {
          // ignore local storage errors
        }
      }

      if (!isPreviewMode && firebaseUser) {
        try {
          const attSnap = await getDocs(
            query(
              collection(db, 'examAttempts'),
              where('studentUid', '==', firebaseUser.uid),
              where('examId', '==', exam.id)
            )
          );
          if (!active) return;
          if (!attSnap.empty) {
            const docSnap = attSnap.docs[0];
            const data = { id: docSnap.id, ...(docSnap.data() as Omit<ExamAttempt, 'id'>) };
            setAttemptId(docSnap.id);
            setAttemptRecord(data);
            setAnswers(data.answers || {});
            if (data.status === 'SUBMITTED' || data.status === 'EVALUATED') {
              setPhase('submitted');
            } else if (data.expiresAt) {
              const rem = Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
              expiresAtRef.current = new Date(data.expiresAt).getTime();
              setSecondsLeft(rem);
            }
          }
        } catch {
          // ignore if direct candidate mode without Firestore student session
        }
      }
      if (active) setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [exam.id, exam.randomizeQuestions, firebaseUser, isPreviewMode, initialQuestions, directCandidate, localProgressKey]);

  const persistAnswers = useCallback(
    async (nextAnswers: Record<string, StudentAnswerEntry>) => {
      if (localProgressKey) {
        try {
          window.localStorage.setItem(
            localProgressKey,
            JSON.stringify({
              attemptId: attemptId || undefined,
              answers: nextAnswers,
              expiresAt: expiresAtRef.current,
            })
          );
        } catch {
          // ignore
        }
      }
      if (isPreviewMode || !attemptId || !firebaseUser) return;
      try {
        await updateDoc(doc(db, 'examAttempts', attemptId), {
          answers: nextAnswers,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Silent retry on next answer or submit
      }
    },
    [attemptId, isPreviewMode, firebaseUser, localProgressKey]
  );

  const handleSubmitExam = useCallback(
    async (forcedByTimer = false) => {
      if (submitting) return;
      setSubmitting(true);
      const graded = gradeExamAttempt(questions, answers);
      const now = new Date().toISOString();

      if (isPreviewMode) {
        setAttemptRecord({
          id: 'preview-attempt',
          examId: exam.id,
          examTitle: exam.title,
          examCode: exam.code,
          studentUid: 'preview',
          studentName: 'Admin CBT Preview',
          startedAt: now,
          submittedAt: now,
          status: 'SUBMITTED',
          answers,
          ...graded,
          finalScore: graded.autoScore,
          manualAdjustment: 0,
        });
        setConfirmSubmit(false);
        setPhase('submitted');
        setSubmitting(false);
        return;
      }

      const resolvedUid = directCandidate?.uid || firebaseUser?.uid || `cand_${Date.now()}`;
      const resolvedName = directCandidate?.name || studentProfile?.name || firebaseUser?.displayName || 'Student';
      const resolvedAttemptId = attemptId || `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      const updatePayload = {
        answers,
        questionResults: graded.questionResults,
        autoScore: graded.autoScore,
        finalScore: graded.autoScore,
        totalMarks: graded.totalMarks,
        percentage: graded.percentage,
        accuracy: graded.accuracy,
        correctCount: graded.correctCount,
        incorrectCount: graded.incorrectCount,
        unattemptedCount: graded.unattemptedCount,
        submittedAt: now,
        status: 'SUBMITTED' as const,
        updatedAt: now,
      };

      const fullSubmittedRecord: ExamAttempt = {
        id: resolvedAttemptId,
        examId: exam.id,
        examTitle: exam.title,
        examCode: exam.code,
        studentUid: resolvedUid,
        studentId: studentProfile?.id || resolvedUid,
        studentName: resolvedName,
        rollNumber: directCandidate?.rollNumber || studentProfile?.rollNumber || '',
        classLevel: directCandidate?.classLevel || studentProfile?.classLevel || exam.classLevel,
        startedAt: attemptRecord?.startedAt || now,
        resultsPublished: true,
        ...updatePayload,
      };

      try {
        if (attemptId && firebaseUser) {
          await updateDoc(doc(db, 'examAttempts', attemptId), updatePayload).catch(() => {});
        }
        // Always persist direct public attempt on server store as well
        await fetch('/api/public/cbt/attempt', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            orgId: orgId || tenantContext?.organizationId || 'SALAR-ORG-00001',
            attemptId: resolvedAttemptId,
            attempt: fullSubmittedRecord,
          }),
        }).catch(() => {});

        if (localProgressKey) {
          try {
            window.localStorage.setItem(
              localProgressKey,
              JSON.stringify({
                attemptId: resolvedAttemptId,
                answers,
                submittedRecord: fullSubmittedRecord,
              })
            );
          } catch {
            // ignore
          }
        }

        setAttemptRecord(fullSubmittedRecord);
        setConfirmSubmit(false);
        setPhase('submitted');
      } catch (err) {
        if (!forcedByTimer) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to submit exam.');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      questions,
      answers,
      isPreviewMode,
      exam,
      attemptId,
      attemptRecord?.startedAt,
      firebaseUser,
      studentProfile,
      directCandidate,
      orgId,
      tenantContext?.organizationId,
      localProgressKey,
    ]
  );

  // Countdown timer when active
  useEffect(() => {
    if (phase !== 'active') return;
    const interval = setInterval(() => {
      const rem = Math.max(0, Math.floor((expiresAtRef.current - Date.now()) / 1000));
      setSecondsLeft(rem);
      if (rem === 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        handleSubmitExam(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, handleSubmitExam]);

  const handleStartExam = async () => {
    if (questions.length === 0) {
      setErrorMsg('This examination has no questions yet.');
      return;
    }

    const now = new Date();
    const expires = new Date(now.getTime() + exam.durationMinutes * 60 * 1000);

    if (isPreviewMode) {
      expiresAtRef.current = expires.getTime();
      setSecondsLeft(exam.durationMinutes * 60);
      setPhase('active');
      return;
    }

    if (!firebaseUser && !directCandidate) return;

    if (attemptId && attemptRecord?.status === 'IN_PROGRESS') {
      if (attemptRecord.expiresAt) {
        expiresAtRef.current = new Date(attemptRecord.expiresAt).getTime();
      }
      setPhase('active');
      return;
    }

    const totalMarks = questions.reduce((sum, q) => sum + Number(q.positiveMarks || 4), 0);

    if (!firebaseUser && directCandidate) {
      const localAttId = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      setAttemptId(localAttId);
      setAttemptRecord({
        id: localAttId,
        examId: exam.id,
        examTitle: exam.title,
        examCode: exam.code,
        studentUid: directCandidate.uid,
        studentId: directCandidate.uid,
        studentName: directCandidate.name,
        rollNumber: directCandidate.rollNumber,
        classLevel: directCandidate.classLevel,
        startedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        status: 'IN_PROGRESS',
        answers: {},
        totalMarks,
        resultsPublished: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      expiresAtRef.current = expires.getTime();
      setSecondsLeft(exam.durationMinutes * 60);
      setPhase('active');
      return;
    }

    const newAttRef = doc(collection(db, 'examAttempts'));
    const payload: Omit<ExamAttempt, 'id'> = {
      examId: exam.id,
      examTitle: exam.title,
      examCode: exam.code,
      studentUid: firebaseUser!.uid,
      studentId: studentProfile?.id || firebaseUser!.uid,
      studentName: studentProfile?.name || firebaseUser!.displayName || 'Student',
      rollNumber: studentProfile?.rollNumber || '',
      classLevel: studentProfile?.classLevel || exam.classLevel,
      startedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      status: 'IN_PROGRESS',
      answers: {},
      totalMarks,
      resultsPublished: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    try {
      await setDoc(newAttRef, payload);
      setAttemptId(newAttRef.id);
      setAttemptRecord({ id: newAttRef.id, ...payload });
      expiresAtRef.current = expires.getTime();
      setSecondsLeft(exam.durationMinutes * 60);
      setPhase('active');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `examAttempts/${newAttRef.id}`);
    }
  };

  const currentQuestion = questions[currentIdx];

  const updateCurrentResponse = (val: string, toggleReview?: boolean) => {
    if (!currentQuestion) return;
    const prevEntry = answers[currentQuestion.id] || { response: '' };
    const next: Record<string, StudentAnswerEntry> = {
      ...answers,
      [currentQuestion.id]: {
        response: val,
        markedForReview: toggleReview !== undefined ? toggleReview : prevEntry.markedForReview,
        visited: true,
      },
    };
    setAnswers(next);
    persistAnswers(next);
  };

  const toggleMultiOption = (optId: string) => {
    if (!currentQuestion) return;
    const existingStr = answers[currentQuestion.id]?.response || '';
    const set = new Set(
      existingStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (set.has(optId)) set.delete(optId);
    else set.add(optId);
    updateCurrentResponse(Array.from(set).sort().join(','));
  };

  const formatTimer = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  };

  const paletteCounts = useMemo(() => {
    let answered = 0;
    let review = 0;
    let unanswered = 0;
    questions.forEach((q) => {
      const a = answers[q.id];
      if (a?.markedForReview) review += 1;
      else if (a?.response && a.response.trim()) answered += 1;
      else unanswered += 1;
    });
    return { answered, review, unanswered };
  }, [questions, answers]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
          <p className="font-mono text-sm text-slate-600">Loading Examination Paper...</p>
        </div>
      </div>
    );
  }

  // Phase 1: Instructions
  if (phase === 'instructions') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
          <div className="bg-[#0032A0] text-white px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono text-blue-100 uppercase">
                {isPreviewMode ? 'Admin CBT Simulator' : 'Online Computer-Based Test'} · {exam.code}
              </p>
              <h1 className="font-display text-xl font-bold mt-0.5">{exam.title}</h1>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="px-3 py-1.5 text-xs font-semibold bg-white/15 hover:bg-white/25 rounded-lg"
            >
              Exit
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-5">
            <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
              <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg">
                <p className="text-[11px] font-mono text-slate-500">QUESTIONS</p>
                <p className="font-mono text-lg font-bold text-[#0F172A] tabular-nums">{questions.length}</p>
              </div>
              <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg">
                <p className="text-[11px] font-mono text-slate-500">DURATION</p>
                <p className="font-mono text-lg font-bold text-[#0F172A] tabular-nums">{exam.durationMinutes} min</p>
              </div>
              <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg">
                <p className="text-[11px] font-mono text-slate-500">TOTAL MARKS</p>
                <p className="font-mono text-lg font-bold text-[#0032A0] tabular-nums">{exam.totalMarks}</p>
              </div>
            </div>

            <div className="border border-[#E2E8F0] rounded-lg p-4 space-y-2 text-xs text-slate-700 leading-relaxed">
              <h2 className="font-display font-bold text-sm text-[#0F172A]">Examination Instructions</h2>
              <p className="whitespace-pre-wrap">
                {exam.instructions ||
                  '1. Answers are auto-saved continuously.\n2. The countdown timer is enforced on submission.\n3. Use the Question Palette to jump directly to any question or mark items for review.\n4. Do not refresh or close the browser tab until you click Submit Exam.'}
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{errorMsg}</div>
            )}

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5"
              />
              <span>I have read the marking scheme and examination instructions and am ready to begin.</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onExit}
                className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!agreed || questions.length === 0}
                onClick={handleStartExam}
                className="px-5 py-2.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-50"
              >
                {attemptRecord?.status === 'IN_PROGRESS' ? 'Resume Examination' : 'Start Examination'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Phase 3: Submitted Scorecard
  if (phase === 'submitted' && attemptRecord) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono text-emerald-700 font-semibold">EXAMINATION SUBMITTED</span>
              <h1 className="font-display text-2xl font-bold text-[#0F172A] mt-0.5">{exam.title}</h1>
              <p className="text-xs font-mono text-slate-500 mt-1">
                Candidate: {attemptRecord.studentName} · Submitted:{' '}
                {(attemptRecord.submittedAt || '').slice(0, 19).replace('T', ' ')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white text-[#0F172A] rounded-lg hover:bg-slate-50"
              >
                Download / Print Scorecard &amp; Solutions
              </button>
              <button
                type="button"
                onClick={onExit}
                className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
              >
                Return to Portal
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-xs text-slate-500">Score Obtained</p>
              <p className="font-mono text-2xl font-bold text-[#0032A0] tabular-nums mt-1">
                {attemptRecord.finalScore ?? attemptRecord.autoScore ?? 0} / {attemptRecord.totalMarks}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-xs text-slate-500">Percentage</p>
              <p className="font-mono text-2xl font-bold text-[#0F172A] tabular-nums mt-1">
                {attemptRecord.percentage ?? 0}%
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-xs text-slate-500">Accuracy</p>
              <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                {attemptRecord.accuracy ?? 0}%
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-xs text-slate-500">Breakdown (C / I / U)</p>
              <p className="font-mono text-lg font-bold text-[#0F172A] tabular-nums mt-1">
                {attemptRecord.correctCount ?? 0} / {attemptRecord.incorrectCount ?? 0} /{' '}
                {attemptRecord.unattemptedCount ?? 0}
              </p>
            </div>
          </div>

          {/* Question-by-Question Review */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
            <h2 className="font-display font-bold text-lg text-[#0F172A]">Answer Key &amp; Response Analysis</h2>
            <div className="space-y-3">
              {(attemptRecord.questionResults || []).map((res, idx) => {
                const matchedQ = questions.find((q) => q.id === res.questionId);
                return (
                <div key={res.questionId} className="border border-[#E2E8F0] rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <span className="font-bold text-[#0032A0]">Question {idx + 1}</span>
                    <span
                      className={`font-semibold ${
                        res.status === 'CORRECT'
                          ? 'text-emerald-700'
                          : res.status === 'INCORRECT'
                          ? 'text-red-600'
                          : 'text-slate-500'
                      }`}
                    >
                      {res.status} ({res.marksAwarded > 0 ? `+${res.marksAwarded}` : res.marksAwarded} / {res.maxMarks})
                    </span>
                  </div>
                  {res.questionText && (
                    <div className="text-sm text-slate-800">
                      <MathText text={res.questionText} />
                    </div>
                  )}
                  {matchedQ?.questionImageUrl && (
                    <img
                      src={matchedQ.questionImageUrl}
                      alt={`Question ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="max-h-52 rounded-lg border border-[#E2E8F0] object-contain bg-white"
                    />
                  )}
                  <div className="flex flex-wrap gap-4 text-xs font-mono pt-1">
                    <span>
                      Your Answer: <strong className="text-[#0F172A]">{res.candidateAnswer || 'Not Attempted'}</strong>
                    </span>
                    <span>
                      Official Answer: <strong className="text-emerald-700">{res.officialAnswer}</strong>
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Phase 2: Active CBT Interface
  const currentEntry = currentQuestion ? answers[currentQuestion.id] : undefined;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Top CBT Header */}
      <header className="bg-[#0032A0] text-white px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">
        <div className="min-w-0">
          <p className="font-display font-bold text-xs sm:text-sm truncate">{exam.title}</p>
          <p className="text-[11px] font-mono text-blue-100 truncate">
            {exam.code} · {isPreviewMode ? 'PREVIEW' : studentProfile?.rollNumber || 'CBT'}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div
            className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-mono text-xs font-bold tabular-nums ${
              secondsLeft <= 300 ? 'bg-red-600 text-white' : 'bg-white text-[#0032A0]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {formatTimer(secondsLeft)}
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen((v) => !v)}
            className="lg:hidden min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 bg-white/15 rounded-lg"
            aria-label="Toggle question palette"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmSubmit(true)}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-3.5 min-h-[38px] py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg"
          >
            <Send className="w-3.5 h-3.5" />
            Submit
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-4 gap-5">
        {/* Question Area */}
        <div className="flex-1 bg-white border border-[#E2E8F0] rounded-xl flex flex-col justify-between overflow-hidden">
          {currentQuestion ? (
            <>
              <div className="p-5 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="font-bold text-[#0032A0]">
                      Question {currentIdx + 1} of {questions.length}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-600">{currentQuestion.questionType}</span>
                  </div>
                  <div className="text-xs font-mono">
                    <span className="text-emerald-700 font-semibold">+{currentQuestion.positiveMarks}</span>
                    {' / '}
                    <span className="text-red-600 font-semibold">-{currentQuestion.negativeMarks}</span>
                  </div>
                </div>

                {currentQuestion.questionText && (
                  <div className="text-base text-[#0F172A] leading-relaxed">
                    <MathText text={currentQuestion.questionText} />
                  </div>
                )}

                {currentQuestion.questionImageUrl && (
                  brokenImageIds[currentQuestion.id] ? (
                    <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>
                        Question {currentIdx + 1} diagram could not be loaded. Please ask your faculty to re-upload this image from Exams Management.
                      </span>
                    </div>
                  ) : (
                    <div className="relative inline-block group max-w-full">
                      <button
                        type="button"
                        onClick={() => setZoomImageUrl(currentQuestion.questionImageUrl || null)}
                        className="block text-left rounded-lg border border-[#E2E8F0] overflow-hidden bg-white hover:border-[#2563EB] transition-colors"
                        title="Click to zoom diagram"
                      >
                        <img
                          src={currentQuestion.questionImageUrl}
                          alt={`Question ${currentIdx + 1}`}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImageIds((prev) => ({ ...prev, [currentQuestion.id]: true }))
                          }
                          className="max-h-72 max-w-full object-contain"
                        />
                      </button>
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                        <ZoomIn className="w-3 h-3" />
                        Tap diagram to zoom
                      </span>
                    </div>
                  )
                )}

                {/* Options / Input */}
                {(currentQuestion.questionType === 'SINGLE_MCQ' ||
                  currentQuestion.questionType === 'IMAGE_BASED') && (
                  <div className="space-y-2.5 pt-2">
                    {(currentQuestion.options && currentQuestion.options.length > 0
                      ? currentQuestion.options
                      : [
                          { id: 'A', text: '' },
                          { id: 'B', text: '' },
                          { id: 'C', text: '' },
                          { id: 'D', text: '' },
                        ]
                    ).map((opt) => {
                      const selected = currentEntry?.response === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => updateCurrentResponse(opt.id)}
                          className={`w-full text-left p-3.5 rounded-lg border flex items-start gap-3 transition-colors ${
                            selected
                              ? 'border-[#0032A0] bg-blue-50/70 text-[#0F172A]'
                              : 'border-[#E2E8F0] hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                              selected ? 'bg-[#0032A0] text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {opt.id}
                          </span>
                          <div className="text-sm pt-0.5">
                            {opt.text ? (
                              <MathText text={opt.text} />
                            ) : (
                              <span className="text-xs font-mono text-slate-500">Option {opt.id}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.questionType === 'MULTI_MCQ' && (
                  <div className="space-y-2.5 pt-2">
                    <p className="text-xs font-mono text-slate-500">Select all correct options:</p>
                    {(currentQuestion.options && currentQuestion.options.length > 0
                      ? currentQuestion.options
                      : [
                          { id: 'A', text: '' },
                          { id: 'B', text: '' },
                          { id: 'C', text: '' },
                          { id: 'D', text: '' },
                        ]
                    ).map((opt) => {
                      const chosen = (currentEntry?.response || '')
                        .split(',')
                        .map((s) => s.trim())
                        .includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleMultiOption(opt.id)}
                          className={`w-full text-left p-3.5 rounded-lg border flex items-start gap-3 transition-colors ${
                            chosen
                              ? 'border-[#0032A0] bg-blue-50/70 text-[#0F172A]'
                              : 'border-[#E2E8F0] hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                              chosen ? 'bg-[#0032A0] text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {opt.id}
                          </span>
                          <div className="text-sm pt-0.5">
                            {opt.text ? (
                              <MathText text={opt.text} />
                            ) : (
                              <span className="text-xs font-mono text-slate-500">Option {opt.id}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {(currentQuestion.questionType === 'NUMERICAL' ||
                  currentQuestion.questionType === 'INTEGER') && (
                  <div className="pt-2 max-w-xs">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Enter {currentQuestion.questionType === 'INTEGER' ? 'Integer' : 'Numerical'} Answer
                    </label>
                    <input
                      type="text"
                      value={currentEntry?.response || ''}
                      onChange={(e) => updateCurrentResponse(e.target.value)}
                      placeholder="Type numeric value..."
                      className="w-full px-3.5 py-2.5 text-base font-mono border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>
                )}
              </div>

              {/* Action Bar */}
              <div className="px-4 sm:px-5 py-3.5 border-t border-[#E2E8F0] bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateCurrentResponse('', false)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-100 text-slate-700 rounded-lg"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    Clear Response
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateCurrentResponse(currentEntry?.response || '', !currentEntry?.markedForReview);
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-semibold border rounded-lg ${
                      currentEntry?.markedForReview
                        ? 'bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-white border-[#E2E8F0] text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    {currentEntry?.markedForReview ? 'Marked for Review' : 'Mark for Review'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[40px] text-xs font-semibold border border-[#E2E8F0] bg-white rounded-lg disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentIdx < questions.length - 1) setCurrentIdx((i) => i + 1);
                      else setConfirmSubmit(true);
                    }}
                    className="inline-flex items-center justify-center gap-1 px-4 py-2 min-h-[40px] text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                  >
                    {currentIdx < questions.length - 1 ? (
                      <>
                        Save &amp; Next
                        <ChevronRight className="w-4 h-4" />
                      </>
                    ) : (
                      'Review & Submit'
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">No questions available in this paper.</div>
          )}
        </div>

        {/* Question Palette Sidebar */}
        <aside
          className={`${
            paletteOpen ? 'fixed inset-0 z-50 bg-white p-5 pb-8 overflow-y-auto' : 'hidden'
          } lg:block lg:w-72 shrink-0 bg-white border border-[#E2E8F0] rounded-xl p-4 h-fit space-y-4`}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sm text-[#0F172A]">Question Palette</h3>
            <button type="button" onClick={() => setPaletteOpen(false)} className="lg:hidden p-1.5 text-slate-500 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-center">
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-800">
              {paletteCounts.answered} Ans
            </div>
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
              {paletteCounts.review} Rev
            </div>
            <div className="p-2 bg-slate-100 border border-[#E2E8F0] rounded text-slate-600">
              {paletteCounts.unanswered} Left
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              const entry = answers[q.id];
              const isCurr = idx === currentIdx;
              let style = 'bg-slate-100 text-slate-700 border-[#E2E8F0]';
              if (entry?.markedForReview) style = 'bg-amber-500 text-white border-amber-600';
              else if (entry?.response && entry.response.trim()) style = 'bg-emerald-600 text-white border-emerald-700';

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setCurrentIdx(idx);
                    setPaletteOpen(false);
                  }}
                  className={`h-10 rounded-lg border font-mono text-xs font-bold transition-all ${style} ${
                    isCurr ? 'ring-2 ring-[#0032A0] ring-offset-1' : ''
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Confirm Submit Modal */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-[#0032A0]">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-display font-bold text-base text-[#0F172A]">Confirm Exam Submission</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="p-2.5 bg-emerald-50 rounded-lg">
                <p className="text-emerald-700 font-bold text-base">{paletteCounts.answered}</p>
                <p className="text-slate-600">Answered</p>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-lg">
                <p className="text-amber-700 font-bold text-base">{paletteCounts.review}</p>
                <p className="text-slate-600">Review</p>
              </div>
              <div className="p-2.5 bg-slate-100 rounded-lg">
                <p className="text-slate-700 font-bold text-base">{paletteCounts.unanswered}</p>
                <p className="text-slate-600">Unanswered</p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Once submitted, answers cannot be modified. Proceed to calculate your scorecard?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmSubmit(false)}
                className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
              >
                Continue Test
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmitExam(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Zoomed Diagram Lightbox */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
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
