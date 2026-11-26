import React, { useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, query, where } from '../../lib/tenantDb';
import { BookOpen, CheckCircle2, Clock, CreditCard, ExternalLink, FileText, Lock, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { formatCurrencyINR, GENERATED_ASSETS } from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';
import type { Course, Enrollment, PaymentRecord } from '../../types/portal';

export const StudentCoursesView: React.FC = () => {
  const { firebaseUser, studentProfile, settings, isIsolatedTenant } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [buyCourse, setBuyCourse] = useState<Course | null>(null);
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [utrError, setUtrError] = useState('');
  const [viewCourse, setViewCourse] = useState<Course | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, 'courses'), where('status', '==', 'PUBLISHED')),
      (snap) => {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    if (!firebaseUser) return () => u1();

    const u2 = onSnapshot(
      query(collection(db, 'enrollments'), where('studentUid', '==', firebaseUser.uid)),
      (snap) =>
        setEnrollments(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Enrollment, 'id'>) }))
            .filter((e) => e.status === 'ACTIVE')
        ),
      () => {}
    );
    const u3 = onSnapshot(
      query(collection(db, 'payments'), where('studentUid', '==', firebaseUser.uid)),
      (snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) }))),
      () => {}
    );

    return () => {
      u1();
      u2();
      u3();
    };
  }, [firebaseUser]);

  const handleSubmitUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyCourse || !firebaseUser) return;
    const cleanedUtr = utr.trim();
    if (!/^[a-zA-Z0-9_-]{6,40}$/.test(cleanedUtr)) {
      setUtrError('UTR must be 6–40 alphanumeric characters (no spaces or special symbols).');
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
        itemType: 'COURSE',
        itemId: buyCourse.id,
        itemTitle: buyCourse.name,
        amount: buyCourse.price,
        utr: cleanedUtr,
        status: 'PENDING',
        submissionDate: now,
        createdAt: now,
        updatedAt: now,
      });
      setBuyCourse(null);
      setUtr('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'payments');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">
          {isIsolatedTenant ? 'Courses & Study Modules' : 'Mathematics Courses'}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {isIsolatedTenant
            ? `Structured learning modules and chapter PDFs published by ${settings.instituteName}`
            : 'Structured JEE Main, JEE Advanced & MHT-CET Mathematics modules with chapter PDFs'}
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center text-xs font-mono text-slate-500">
          Loading published courses...
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">No published courses available right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((c) => {
            const isEnrolled = enrollments.some((e) => e.itemType === 'COURSE' && e.itemId === c.id);
            const pendingPayment = payments.find(
              (p) => p.itemType === 'COURSE' && p.itemId === c.id && p.status === 'PENDING'
            );

            return (
              <div
                key={c.id}
                className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-4/3 bg-slate-100 border-b border-[#E2E8F0]">
                    <img
                      src={c.thumbnailUrl || GENERATED_ASSETS.courseJeeMain}
                      alt={c.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#0032A0] font-semibold">
                        {c.category} · {c.classLevel || 'Class 12th'}
                      </span>
                      {isEnrolled && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          ENROLLED
                        </span>
                      )}
                    </div>
                    <h2 className="font-display font-bold text-base text-[#0F172A]">{c.name}</h2>
                    <p className="text-xs text-slate-600 line-clamp-2">{c.description}</p>
                    <p className="text-xs font-mono text-slate-500 pt-1">
                      {c.modules?.length || 0} Modules
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3.5 border-t border-[#E2E8F0] bg-slate-50 flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-base text-[#0F172A] tabular-nums">
                    {formatCurrencyINR(c.price)}
                  </span>
                  {isEnrolled ? (
                    <button
                      type="button"
                      onClick={() => setViewCourse(c)}
                      className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                    >
                      Open Curriculum
                    </button>
                  ) : pendingPayment ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
                      <Clock className="w-3.5 h-3.5" />
                      UTR Pending Verification
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setBuyCourse(c);
                        setUtr('');
                        setUtrError('');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Buy Now
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* UTR Purchase Modal */}
      {buyCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#0F172A]">Submit UPI / UTR Payment</h3>
              <button type="button" onClick={() => setBuyCourse(null)} className="text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3.5 bg-slate-50 border border-[#E2E8F0] rounded-lg space-y-1.5 text-xs">
              <p className="font-bold text-[#0F172A]">{buyCourse.name}</p>
              <p className="font-mono text-[#0032A0] font-bold">Amount: {formatCurrencyINR(buyCourse.price)}</p>
              <div className="pt-2 border-t border-slate-200 text-slate-600 space-y-0.5">
                <p>
                  UPI ID: <strong className="font-mono text-[#0F172A]">{settings.portalConfig.upiId}</strong>
                </p>
                <p>
                  Payee: <strong>{settings.portalConfig.upiPayeeName}</strong>
                </p>
                <p className="text-[11px] text-slate-500 pt-1">{settings.portalConfig.bankDetails}</p>
              </div>
            </div>
            <form onSubmit={handleSubmitUtr} className="space-y-3">
              {utrError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {utrError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enter 12-Digit UPI / Bank UTR Reference Number *
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
                  Course unlocks automatically after Admin verifies your UTR.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBuyCourse(null)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  {submitting ? 'Submitting...' : 'Submit UTR for Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enrolled Course Curriculum Modal */}
      {viewCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">{viewCourse.name}</h3>
                <p className="text-xs font-mono text-emerald-700">ACTIVE ENROLLMENT · CURRICULUM</p>
              </div>
              <button type="button" onClick={() => setViewCourse(null)} className="text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {(viewCourse.modules || []).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">
                  Faculty is uploading modules for this course. Check back shortly.
                </p>
              ) : (
                (viewCourse.modules || []).map((mod) => (
                  <div key={mod.id} className="border border-[#E2E8F0] rounded-xl p-4 space-y-2.5">
                    <h4 className="font-display font-bold text-sm text-[#0F172A]">{mod.title}</h4>
                    <div className="space-y-2">
                      {mod.chapters.map((ch) => (
                        <div
                          key={ch.id}
                          className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-[#0F172A]">{ch.title}</p>
                            {ch.duration && <p className="text-[11px] font-mono text-slate-500">{ch.duration}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            {ch.pdfUrl && (
                              <a
                                href={ch.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-[#E2E8F0] rounded text-[#0032A0] font-semibold"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                PDF Notes
                              </a>
                            )}
                            {ch.videoUrl && (
                              <a
                                href={ch.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0032A0] text-white rounded font-semibold"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Watch
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
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
