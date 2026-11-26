import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from '../../lib/tenantDb';
import {
  Activity,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Clock,
  Copy,
  Database,
  FileText,
  IndianRupee,
  Pause,
  Play,
  RefreshCw,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrencyINR, seedMathematicsDemoData } from '../../lib/portalService';
import type { AdminModule, Course, Exam, ExamAttempt, PaymentRecord, StudentProfile } from '../../types/portal';

interface DashboardViewProps {
  onNavigate: (mod: AdminModule) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { syncStatus, settings, tenantContext, isIsolatedTenant } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  const [paused, setPaused] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [revRange, setRevRange] = useState<'7D' | '14D' | '30D'>('14D');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');

  useEffect(() => {
    if (paused) return;

    const u1 = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentProfile, 'id'>) })));
        setLastSync(new Date());
      },
      () => {}
    );
    const u2 = onSnapshot(
      collection(db, 'exams'),
      (snap) => {
        setExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) })));
        setLastSync(new Date());
      },
      () => {}
    );
    const u3 = onSnapshot(
      collection(db, 'courses'),
      (snap) => {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) })));
      },
      () => {}
    );
    const u4 = onSnapshot(
      collection(db, 'examAttempts'),
      (snap) => {
        setAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, 'id'>) })));
      },
      () => {}
    );
    const u5 = onSnapshot(
      collection(db, 'payments'),
      (snap) => {
        setPayments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) })));
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
  }, [paused]);

  const handleManualRefresh = () => {
    setLastSync(new Date());
    if (paused) {
      setPaused(false);
    }
  };

  const liveExams = useMemo(() => exams.filter((e) => e.status === 'LIVE'), [exams]);
  const approvedPayments = useMemo(() => payments.filter((p) => p.status === 'APPROVED'), [payments]);
  const totalRevenue = useMemo(
    () => approvedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [approvedPayments]
  );
  const liveAttemptsCount = useMemo(
    () => attempts.filter((a) => a.status === 'IN_PROGRESS').length,
    [attempts]
  );

  // Build Revenue Chart Data from real APPROVED payments
  const revenueChartData = useMemo(() => {
    const days = revRange === '7D' ? 7 : revRange === '14D' ? 14 : 30;
    const buckets: Array<{ date: string; label: string; amount: number }> = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      buckets.push({ date: key, label, amount: 0 });
    }
    approvedPayments.forEach((p) => {
      const pDate = (p.verifiedAt || p.submissionDate || p.createdAt || '').slice(0, 10);
      const found = buckets.find((b) => b.date === pDate);
      if (found) {
        found.amount += Number(p.amount || 0);
      }
    });
    return buckets;
  }, [approvedPayments, revRange]);

  const recentSubmissions = useMemo(() => {
    return [...attempts]
      .sort((a, b) => (b.submittedAt || b.startedAt || '').localeCompare(a.submittedAt || a.startedAt || ''))
      .slice(0, 6);
  }, [attempts]);

  const portalBase =
    tenantContext?.portalPath && tenantContext.portalPath !== '/' ? tenantContext.portalPath : '';

  const handleCopyExamLink = (exam: Exam) => {
    const url = `${window.location.origin}${portalBase}/?exam=${exam.id}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(exam.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShareExam = async (exam: Exam) => {
    const url = `${window.location.origin}${portalBase}/?exam=${exam.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: exam.title,
          text: `Attempt ${exam.title} (${exam.code}) on ${settings.instituteName}`,
          url,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    handleCopyExamLink(exam);
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    setSeedMessage('');
    try {
      await seedMathematicsDemoData(isIsolatedTenant ? settings : undefined);
      setSeedMessage('Sample Class 11th & 12th Mathematics demo records created.');
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : 'Unable to seed sample data. Ensure Admin auth is connected.');
    } finally {
      setSeeding(false);
    }
  };

  const statCards = [
    { label: 'Total Students', value: students.length, icon: Users, color: 'text-[#0032A0]' },
    { label: 'Total Exams', value: exams.length, icon: FileText, color: 'text-[#2563EB]' },
    { label: 'Courses', value: courses.length, icon: BookOpen, color: 'text-emerald-600' },
    { label: 'Attempts', value: attempts.length, icon: Award, color: 'text-amber-600' },
    { label: 'Revenue', value: formatCurrencyINR(totalRevenue), icon: IndianRupee, color: 'text-emerald-700' },
    { label: 'Live Now', value: liveAttemptsCount, icon: Activity, color: 'text-red-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Control Room Top Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-[#0F172A]">Control Room</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-semibold ${
                paused ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {paused ? 'PAUSED' : 'LIVE'}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-600">
              <Database className="w-3.5 h-3.5 text-[#0032A0]" />
              {syncStatus === 'SYNCED' ? 'Database synced' : 'Offline'}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs font-mono text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Last sync: {lastSync.toLocaleTimeString()}
            </span>
            <span aria-hidden="true">·</span>
            <span>Auto-refresh: {paused ? 'Paused' : 'Active (Realtime)'}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {exams.length === 0 && courses.length === 0 && (
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedDemo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0032A0] bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {seeding ? 'Loading Sample Data...' : 'Load Sample Math Data [DEMO]'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-lg transition-colors"
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {seedMessage && (
        <div className="bg-blue-50 border border-blue-200 text-[#0032A0] rounded-lg px-4 py-2.5 text-xs font-medium">
          {seedMessage}
        </div>
      )}

      {/* 6 Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">{card.label}</span>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <p className="font-mono text-2xl font-bold text-[#0F172A] tabular-nums">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Live Examination Quick Links */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0F172A]">Live Examination Quick Links</h2>
            <p className="text-xs text-slate-500">Published LIVE CBT examinations ready for student access</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('exams')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0032A0] hover:underline"
          >
            Manage All Exams
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {liveExams.length === 0 ? (
          <div className="border border-dashed border-[#E2E8F0] rounded-lg p-6 text-center text-sm text-slate-500">
            No live examinations published right now. Create or publish an examination from the Exams module.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {liveExams.map((exam) => (
              <div key={exam.id} className="border border-[#E2E8F0] rounded-lg p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-mono text-slate-500 mb-1">
                    <span className="text-[#0032A0] font-semibold">{exam.code}</span>
                    <span>{exam.classLevel}</span>
                  </div>
                  <h3 className="font-display font-bold text-sm text-[#0F172A] mb-2">{exam.title}</h3>
                  <div className="flex items-center gap-3 text-xs font-mono text-slate-600 tabular-nums">
                    <span>{exam.questionCount || 0} Questions</span>
                    <span aria-hidden="true">·</span>
                    <span>{exam.durationMinutes} mins</span>
                    <span aria-hidden="true">·</span>
                    <span>{exam.totalMarks} Marks</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleCopyExamLink(exam)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg transition-colors"
                  >
                    {copiedId === exam.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedId === exam.id ? 'Copied' : 'Copy Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShareExam(exam)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Revenue Chart + Recent Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Revenue Chart */}
        <section className="xl:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0F172A]">Revenue Analytics</h2>
              <p className="text-xs text-slate-500">Verified UTR payment approvals over time</p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['7D', '14D', '30D'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRevRange(r)}
                  className={`px-3 py-1 text-xs font-mono font-semibold rounded-md transition-colors ${
                    revRange === r ? 'bg-white text-[#0032A0] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  formatter={(value: unknown) => [formatCurrencyINR(Number(value || 0)), 'Revenue']}
                  contentStyle={{ borderRadius: '8px', borderColor: '#E2E8F0', fontSize: '12px' }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#0032A0"
                  strokeWidth={2}
                  fill="#2563EB"
                  fillOpacity={0.12}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Recent Activity & Submissions */}
        <section className="xl:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0F172A]">Recent Activity</h2>
              <p className="text-xs text-slate-500">Student submissions &amp; live attempts</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('results')}
              className="text-xs font-semibold text-[#0032A0] hover:underline"
            >
              View All
            </button>
          </div>

          {recentSubmissions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-[#E2E8F0] rounded-lg p-6 text-center text-xs text-slate-500">
              No student examination submissions recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentSubmissions.map((att) => (
                <div key={att.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A] truncate">{att.studentName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {att.examTitle} · <span className="font-mono">{att.status}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold text-[#0032A0] tabular-nums">
                      {att.finalScore ?? att.autoScore ?? 0}/{att.totalMarks}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {(att.submittedAt || att.startedAt || '').slice(0, 10)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
