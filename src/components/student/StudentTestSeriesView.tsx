import React, { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, query, where } from '../../lib/tenantDb';
import { CheckCircle2, Clock, CreditCard, FileSpreadsheet, Lock, PlayCircle, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { formatCurrencyINR } from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';
import type { Enrollment, Exam, PaymentRecord, TestSeries } from '../../types/portal';

interface StudentTestSeriesViewProps {
  onLaunchExam: (exam: Exam) => void;
}

export const StudentTestSeriesView: React.FC<StudentTestSeriesViewProps> = ({ onLaunchExam }) => {
  const { firebaseUser, studentProfile, settings, isIsolatedTenant } = useAuth();
  const [series, setSeries] = useState<TestSeries[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [buyTarget, setBuyTarget] = useState<TestSeries | null>(null);
  const [utr, setUtr] = useState('');
  const [utrError, setUtrError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [activeSeries, setActiveSeries] = useState<TestSeries | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, 'testSeries'), where('status', '==', 'PUBLISHED')),
      (snap) => {
        setSeries(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TestSeries, 'id'>) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    const u2 = onSnapshot(
      query(collection(db, 'exams'), where('status', '==', 'LIVE')),
      (snap) => setExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) }))),
      () => {}
    );
    if (!firebaseUser) return () => { u1(); u2(); };

    const u3 = onSnapshot(
      query(collection(db, 'enrollments'), where('studentUid', '==', firebaseUser.uid)),
      (snap) =>
        setEnrollments(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Enrollment, 'id'>) }))
            .filter((e) => e.status === 'ACTIVE')
        ),
      () => {}
    );
    const u4 = onSnapshot(
      query(collection(db, 'payments'), where('studentUid', '==', firebaseUser.uid)),
      (snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) }))),
      () => {}
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [firebaseUser]);

  const handleSubmitUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyTarget || !firebaseUser) return;
    const cleanedUtr = utr.trim();
    if (!/^[a-zA-Z0-9_-]{6,40}$/.test(cleanedUtr)) {
      setUtrError('UTR must be 6–40 alphanumeric characters.');
      return;
    }
    setSubmitting(true);
    setUtrError('');
    const now = new Date().toISOString();
    try {
      await addDoc(collection(db, 'payments'), {
        studentUid: firebaseUser.uid,
        studentId: studentProfile?.id || firebaseUser.uid,
        studentName: studentProfile?.name || firebaseUser.displayName || 'Student',
        studentEmail: firebaseUser.email || '',
        itemType: 'TEST_SERIES',
        itemId: buyTarget.id,
        itemTitle: buyTarget.title,
        amount: buyTarget.price,
        utr: cleanedUtr,
        status: 'PENDING',
        submissionDate: now,
        createdAt: now,
        updatedAt: now,
      });
      setBuyTarget(null);
      setUtr('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'payments');
    } finally {
      setSubmitting(false);
    }
  };

  const linkedExams = (ts: TestSeries) => {
    const ids = new Set(ts.examIds || []);
    return exams.filter((e) => ids.has(e.id));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">
          {isIsolatedTenant ? 'Online Test Series' : 'Mathematics Test Series'}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {isIsolatedTenant
            ? `Full-length Computer-Based Test packages published by ${settings.instituteName}`
            : 'Full-length JEE Main, JEE Advanced & MHT-CET Computer-Based Test packages'}
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center text-xs font-mono text-slate-500">
          Loading Test Series...
        </div>
      ) : series.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">No published test series packages yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {series.map((ts) => {
            const isEnrolled = enrollments.some((e) => e.itemType === 'TEST_SERIES' && e.itemId === ts.id);
            const pendingPayment = payments.find(
              (p) => p.itemType === 'TEST_SERIES' && p.itemId === ts.id && p.status === 'PENDING'
            );

            return (
              <div
                key={ts.id}
                className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[#0032A0] font-semibold">{ts.examCategory}</span>
                    {isEnrolled && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <h2 className="font-display font-bold text-base text-[#0F172A]">{ts.title}</h2>
                  <p className="text-xs text-slate-600">{ts.description}</p>
                  <p className="text-xs font-mono text-slate-500">
                    {ts.mockTestCount} Mock Tests · {ts.classLevel || 'Class 12th'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-base text-[#0F172A] tabular-nums">
                    {formatCurrencyINR(ts.price)}
                  </span>
                  {isEnrolled ? (
                    <button
                      type="button"
                      onClick={() => setActiveSeries(ts)}
                      className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                    >
                      Access Mock Tests
                    </button>
                  ) : pendingPayment ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
                      <Clock className="w-3.5 h-3.5" />
                      UTR Pending
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setBuyTarget(ts);
                        setUtr('');
                        setUtrError('');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Join Series
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* UTR Submission Modal */}
      {buyTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#0F172A]">Join Test Series via UPI/UTR</h3>
              <button type="button" onClick={() => setBuyTarget(null)} className="text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3.5 bg-slate-50 border border-[#E2E8F0] rounded-lg space-y-1 text-xs">
              <p className="font-bold text-[#0F172A]">{buyTarget.title}</p>
              <p className="font-mono text-[#0032A0] font-bold">Fee: {formatCurrencyINR(buyTarget.price)}</p>
              <p className="pt-1 text-slate-600">
                UPI ID: <strong className="font-mono text-[#0F172A]">{settings.portalConfig.upiId}</strong> (
                {settings.portalConfig.upiPayeeName})
              </p>
            </div>
            <form onSubmit={handleSubmitUtr} className="space-y-3">
              {utrError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {utrError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enter 12-Digit UTR Reference Number *
                </label>
                <input
                  type="text"
                  required
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                  placeholder="e.g. 429108543210"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Unlocked upon Admin UTR approval.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBuyTarget(null)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  {submitting ? 'Submitting...' : 'Submit UTR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enrolled Test Series Mock Tests Modal */}
      {activeSeries && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">{activeSeries.title}</h3>
                <p className="text-xs font-mono text-emerald-700">LINKED LIVE MOCK TESTS</p>
              </div>
              <button type="button" onClick={() => setActiveSeries(null)} className="text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {linkedExams(activeSeries).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">
                  No LIVE exams have been linked to this series yet.
                </p>
              ) : (
                linkedExams(activeSeries).map((ex) => (
                  <div
                    key={ex.id}
                    className="border border-[#E2E8F0] rounded-lg p-3.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-[11px] font-mono text-[#0032A0] font-semibold">{ex.code}</p>
                      <p className="text-sm font-bold text-[#0F172A]">{ex.title}</p>
                      <p className="text-[11px] font-mono text-slate-500">
                        {ex.durationMinutes} min · {ex.questionCount || 0} Qs · {ex.totalMarks} Marks
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSeries(null);
                        onLaunchExam(ex);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      Launch CBT
                    </button>
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
