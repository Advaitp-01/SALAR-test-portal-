import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, increment, onSnapshot, query, updateDoc, where } from '../../lib/tenantDb';
import {
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Check,
  Clock,
  Download,
  FileText,
  PlayCircle,
  TrendingUp,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import type {
  Enrollment,
  Exam,
  ExamAttempt,
  PortalNotification,
  StudentModule,
  StudyMaterial,
} from '../../types/portal';

interface StudentDashboardViewProps {
  onNavigate: (mod: StudentModule) => void;
  onLaunchExam: (exam: Exam) => void;
}

export const StudentDashboardView: React.FC<StudentDashboardViewProps> = ({ onNavigate, onLaunchExam }) => {
  const { firebaseUser, studentProfile } = useAuth();
  const [liveExams, setLiveExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);

  useEffect(() => {
    if (!firebaseUser) return;

    const u1 = onSnapshot(
      query(collection(db, 'exams'), where('status', '==', 'LIVE')),
      (snap) => setLiveExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) }))),
      () => {}
    );
    const u2 = onSnapshot(
      query(collection(db, 'examAttempts'), where('studentUid', '==', firebaseUser.uid)),
      (snap) => setAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, 'id'>) }))),
      () => {}
    );
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
      collection(db, 'notifications'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PortalNotification, 'id'>) }))
          .filter(
            (n) =>
              n.targetType === 'ALL' ||
              (n.targetType === 'BATCH' && studentProfile?.batchId && n.targetBatchId === studentProfile.batchId) ||
              (n.targetType === 'STUDENT' && n.targetStudentUid === firebaseUser.uid)
          )
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setNotifications(list);
      },
      () => {}
    );
    const u5 = onSnapshot(
      query(collection(db, 'studyMaterials'), where('subject', '==', 'Mathematics')),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StudyMaterial, 'id'>) }))
          .filter(
            (m) =>
              m.classLevel === 'Both' ||
              !studentProfile?.classLevel ||
              m.classLevel === studentProfile.classLevel
          );
        setMaterials(list);
      },
      () => {}
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, [firebaseUser, studentProfile?.batchId, studentProfile?.classLevel]);

  const completedAttempts = useMemo(
    () =>
      attempts
        .filter((a) => a.status !== 'IN_PROGRESS' && (a.resultsPublished ?? true))
        .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')),
    [attempts]
  );

  const avgPct = useMemo(() => {
    if (completedAttempts.length === 0) return 0;
    return (
      Math.round(
        (completedAttempts.reduce((s, a) => s + Number(a.percentage || 0), 0) / completedAttempts.length) * 10
      ) / 10
    );
  }, [completedAttempts]);

  const chartData = useMemo(() => {
    return [...completedAttempts]
      .reverse()
      .slice(-8)
      .map((a) => ({
        name: a.examCode || a.examTitle.slice(0, 12),
        pct: a.percentage ?? 0,
      }));
  }, [completedAttempts]);

  const handleMarkNotificationRead = async (n: PortalNotification) => {
    if (!firebaseUser) return;
    const readBy = new Set(n.readBy || []);
    if (readBy.has(firebaseUser.uid)) return;
    readBy.add(firebaseUser.uid);
    try {
      await updateDoc(doc(db, 'notifications', n.id), {
        readBy: Array.from(readBy),
      });
    } catch {
      // Ignore silent failure
    }
  };

  const handleDownloadMaterial = async (m: StudyMaterial) => {
    try {
      await updateDoc(doc(db, 'studyMaterials', m.id), {
        downloadCount: increment(1),
      });
    } catch {
      // Proceed to download even if counter update skips
    }
    const a = document.createElement('a');
    a.href = m.fileUrl;
    a.download = m.fileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* Student Welcome Banner */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-[#0032A0] font-semibold">
            {studentProfile?.rollNumber || 'STUDENT'} · {studentProfile?.classLevel || 'Class 12th'} ·{' '}
            {studentProfile?.targetExam || 'JEE Main'}
          </p>
          <h1 className="font-display text-2xl font-bold text-[#0F172A] mt-0.5">
            Welcome back, {studentProfile?.name || firebaseUser?.displayName || 'Aspirant'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Batch: <strong className="text-[#0F172A]">{studentProfile?.batchName || 'Unassigned'}</strong> · Enrollment
            ID: <span className="font-mono">{studentProfile?.enrollmentId || '—'}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('exams')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg shrink-0"
        >
          <PlayCircle className="w-4 h-4" />
          Go to Examinations
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">Live CBT Exams</span>
            <FileText className="w-4 h-4 text-[#0032A0]" />
          </div>
          <p className="font-mono text-2xl font-bold text-[#0F172A] tabular-nums">{liveExams.length}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">Tests Completed</span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="font-mono text-2xl font-bold text-[#0F172A] tabular-nums">{completedAttempts.length}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">Average Score</span>
            <TrendingUp className="w-4 h-4 text-[#2563EB]" />
          </div>
          <p className="font-mono text-2xl font-bold text-[#0032A0] tabular-nums">{avgPct}%</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">Active Enrollments</span>
            <BookOpen className="w-4 h-4 text-amber-600" />
          </div>
          <p className="font-mono text-2xl font-bold text-[#0F172A] tabular-nums">{enrollments.length}</p>
        </div>
      </div>

      {/* Live Exams & Performance Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-base text-[#0F172A]">Upcoming &amp; Live CBT Tests</h2>
            <button
              type="button"
              onClick={() => onNavigate('exams')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0032A0] hover:underline"
            >
              All Exams <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {liveExams.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-[#E2E8F0] rounded-lg p-6 text-xs text-slate-500">
              No live examinations published at this moment.
            </div>
          ) : (
            <div className="space-y-3">
              {liveExams.slice(0, 4).map((ex) => {
                const att = attempts.find((a) => a.examId === ex.id);
                return (
                  <div
                    key={ex.id}
                    className="border border-[#E2E8F0] rounded-lg p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono text-[#0032A0] font-semibold">
                        {ex.code} · {ex.classLevel}
                      </p>
                      <p className="text-sm font-bold text-[#0F172A] truncate">{ex.title}</p>
                      <p className="text-[11px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                        <Clock className="w-3 h-3" /> {ex.durationMinutes} min · {ex.questionCount || 0} Qs ·{' '}
                        {ex.totalMarks} Marks
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onLaunchExam(ex)}
                      className="px-3.5 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg shrink-0"
                    >
                      {att?.status === 'SUBMITTED' || att?.status === 'EVALUATED'
                        ? 'Scorecard'
                        : att?.status === 'IN_PROGRESS'
                        ? 'Resume'
                        : 'Start Test'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="xl:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-5">
          <h2 className="font-display font-bold text-base text-[#0F172A] mb-1">Performance Trend (%)</h2>
          <p className="text-xs text-slate-500 mb-4">Your Mathematics test percentages across recent CBT exams</p>
          {chartData.length === 0 ? (
            <div className="h-48 border border-dashed border-[#E2E8F0] rounded-lg flex items-center justify-center text-xs text-slate-500">
              Attempt a live examination to visualize your performance trend.
            </div>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', borderColor: '#E2E8F0', fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="pct"
                    name="Score %"
                    stroke="#0032A0"
                    strokeWidth={2}
                    fill="#2563EB"
                    fillOpacity={0.14}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Notifications & Study Materials */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-base text-[#0F172A] flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#0032A0]" />
              Institute Notifications
            </h2>
            <span className="font-mono text-xs text-slate-500">{notifications.length} Total</span>
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-[#E2E8F0] rounded-lg">
              No announcements right now.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {notifications.slice(0, 6).map((n) => {
                const isRead = firebaseUser ? (n.readBy || []).includes(firebaseUser.uid) : true;
                return (
                  <div
                    key={n.id}
                    className={`p-3 rounded-lg border text-xs ${
                      isRead ? 'border-[#E2E8F0] bg-white' : 'border-blue-200 bg-blue-50/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-[#0F172A]">{n.title}</p>
                      {!isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkNotificationRead(n)}
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-[#0032A0] hover:underline shrink-0"
                        >
                          <Check className="w-3 h-3" />
                          Mark read
                        </button>
                      )}
                    </div>
                    <p className="text-slate-600 mt-1">{n.message}</p>
                    <p className="font-mono text-[10px] text-slate-400 mt-1">{n.createdAt.slice(0, 10)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="xl:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-base text-[#0F172A]">Mathematics Study Material &amp; DPPs</h2>
            <span className="font-mono text-xs text-slate-500">{materials.length} Files</span>
          </div>
          {materials.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-[#E2E8F0] rounded-lg">
              Formula sheets, DPPs, and chapter PDFs published by faculty will appear here.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {materials.map((m) => (
                <div
                  key={m.id}
                  className="p-3 border border-[#E2E8F0] rounded-lg flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-[#0032A0] font-semibold">
                      {m.category} · {m.classLevel}
                    </p>
                    <p className="text-xs font-bold text-[#0F172A] truncate">{m.title}</p>
                    <p className="text-[11px] font-mono text-slate-400">
                      {m.chapter || 'Mathematics'} · {m.fileSize || 'PDF'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadMaterial(m)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] hover:bg-slate-50 text-[#0032A0] rounded-lg shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
