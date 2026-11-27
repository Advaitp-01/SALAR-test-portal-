import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  KeyRound,
  Play,
  Printer,
  Shield,
  UserPlus,
  X,
} from 'lucide-react';
import { CBTExamInterface, type DirectCandidateInfo } from './CBTExamInterface';
import type { Exam, ExamQuestion } from '../types/portal';

interface DirectCbtEntryProps {
  codeOrId: string;
  isIdLookup?: boolean;
  orgId?: string;
  portalSlug?: string;
  fallbackInstituteName?: string;
  logoUrl?: string;
  onExitToPortal: () => void;
}

function getMarkingFromExam(ex?: Exam | null): { pos: number; neg: number } {
  const tag = (ex?.examTag || ex?.target || '').toUpperCase();
  if (tag.includes('MHT-CET')) return { pos: 2, neg: 0 };
  return { pos: 4, neg: 1 };
}

export const DirectCbtEntry: React.FC<DirectCbtEntryProps> = ({
  codeOrId,
  isIdLookup = false,
  orgId,
  portalSlug,
  fallbackInstituteName = 'Examination Portal',
  logoUrl,
  onExitToPortal,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvedOrgId, setResolvedOrgId] = useState(orgId || 'SALAR-ORG-00001');
  const [instituteName, setInstituteName] = useState(fallbackInstituteName);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);

  // Quick Join Registration form state
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [classLevel, setClassLevel] = useState<'Class 11th' | 'Class 12th' | 'Dropper / Repeater'>('Class 11th');
  const [collegeName, setCollegeName] = useState('');
  const [rollNumber, setRollNumber] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [hallTicketOpen, setHallTicketOpen] = useState(false);
  const [generatedRoll, setGeneratedRoll] = useState('');
  const [activeCandidate, setActiveCandidate] = useState<DirectCandidateInfo | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (orgId) params.set('orgId', orgId);
    if (portalSlug) params.set('slug', portalSlug);
    if (isIdLookup) params.set('examId', codeOrId);
    else params.set('code', codeOrId);

    fetch(`/api/public/cbt/resolve?${params.toString()}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.found || !data.exam) {
          throw new Error(data.error || 'This examination link is unavailable or not yet published.');
        }
        return data as {
          found: boolean;
          orgId: string;
          instituteName?: string;
          exam: Exam;
          questions: ExamQuestion[];
        };
      })
      .then((data) => {
        if (!active) return;
        setResolvedOrgId(data.orgId || orgId || 'SALAR-ORG-00001');
        if (data.instituteName) setInstituteName(data.instituteName);
        setExam(data.exam);
        setQuestions(Array.isArray(data.questions) ? data.questions : []);
        if (data.exam.classLevel === 'Class 12th') setClassLevel('Class 12th');
        else setClassLevel('Class 11th');
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load examination paper.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [codeOrId, isIdLookup, orgId, portalSlug]);

  const { pos, neg } = useMemo(() => getMarkingFromExam(exam), [exam]);
  const questionCount = questions.length > 0 ? questions.length : exam?.questionCount || 0;
  const maxMarks = exam?.totalMarks && exam.totalMarks > 0 ? exam.totalMarks : questionCount * pos;
  const instituteInitial = (instituteName.trim().charAt(0) || 'S').toUpperCase();

  const handleQuickJoinStart = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!exam) return;
    setFormError('');

    const cleanName = fullName.trim();
    const digits = mobile.replace(/\D/g, '');
    const cleanCollege = collegeName.trim();

    if (cleanName.length < 2) {
      setFormError('Please enter Candidate Full Name.');
      return;
    }
    if (digits.length < 10) {
      setFormError('Please enter a valid 10-digit Mobile Number.');
      return;
    }
    if (cleanCollege.length < 2) {
      setFormError('Please enter your College / School Name.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/cbt/quick-join', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          orgId: resolvedOrgId,
          slug: portalSlug,
          examId: exam.id,
          name: cleanName,
          mobile: digits.slice(-10),
          classLevel,
          collegeName: cleanCollege,
          rollNumber: rollNumber.trim(),
          targetExam: exam.target || 'JEE Main',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.student) {
        throw new Error(data.error || 'Registration failed.');
      }

      if (data.token && resolvedOrgId && resolvedOrgId !== 'SALAR-ORG-00001') {
        try {
          window.sessionStorage.setItem(`salar_tenant_bearer_${resolvedOrgId}_student`, data.token);
        } catch {
          // ignore
        }
      }

      setActiveCandidate({
        uid: data.student.uid || data.student.id,
        name: data.student.name,
        mobile: data.student.mobile,
        classLevel: data.student.classLevel,
        collegeName: cleanCollege,
        rollNumber: data.student.rollNumber,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to start examination.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenHallTicket = () => {
    setFormError('');
    const digits = mobile.replace(/\D/g, '');
    if (fullName.trim().length < 2 || digits.length < 10) {
      setFormError('Enter your Name and 10-digit Mobile Number first to generate your CBT Hall Ticket Pass.');
      return;
    }
    const prefix = (exam?.code || 'CBT').split('-')[0] || 'CBT';
    const computedRoll =
      rollNumber.trim() || `${prefix}-${new Date().getFullYear()}-${digits.slice(-4)}`;
    setGeneratedRoll(computedRoll);
    setHallTicketOpen(true);
  };

  if (activeCandidate && exam) {
    return (
      <CBTExamInterface
        exam={exam}
        initialQuestions={questions}
        directCandidate={activeCandidate}
        orgId={resolvedOrgId}
        instituteName={instituteName}
        onExit={() => {
          setActiveCandidate(null);
          onExitToPortal();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Top Direct Access Header */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={instituteName}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span className="w-9 h-9 rounded-lg bg-[#0032A0] text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5" />
                <span className="sr-only">{instituteInitial}</span>
              </span>
            )}
            <div className="min-w-0">
              <p className="font-display font-bold text-sm sm:text-base text-[#0032A0] uppercase tracking-tight truncate">
                {instituteName}
              </p>
              <p className="text-[11px] font-mono text-slate-500 truncate">
                Direct Public Examination Access · Computer-Based Test (CBT)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {exam && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] font-mono font-bold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                EXAM READY
              </span>
            )}
            <button
              type="button"
              onClick={onExitToPortal}
              className="hidden sm:inline-flex px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-[#0F172A] border border-[#E2E8F0] rounded-lg bg-white hover:bg-slate-50"
            >
              Portal Home
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center">
            <p className="font-mono text-sm text-slate-600">Loading Official CBT Assessment...</p>
          </div>
        ) : error || !exam ? (
          <div className="max-w-lg mx-auto bg-white border border-[#E2E8F0] rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h1 className="font-display font-bold text-lg text-[#0F172A]">Examination Unavailable</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              {error || 'This examination paper could not be found or is currently set to Draft mode.'}
            </p>
            <button
              type="button"
              onClick={onExitToPortal}
              className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
            >
              Return to Institute Portal
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Official Assessment Details + Stats + Guidelines */}
            <div className="lg:col-span-7 space-y-5">
              {/* Official Assessment Card */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wide text-[#0032A0] bg-blue-50 border border-blue-200 rounded">
                    Official Assessment
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    Exam Code: <span className="font-bold text-[#0F172A]">{exam.code}</span>
                  </span>
                </div>

                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A] leading-tight">
                    {exam.title}
                  </h1>
                  <p className="text-xs font-mono text-slate-500 mt-2">
                    Subject Series: <span className="font-semibold text-[#0F172A]">{exam.subject || exam.title}</span>{' '}
                    <span aria-hidden="true">·</span> Status:{' '}
                    <span className="font-semibold text-emerald-700">Active for Public Entry</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
                  <span className="px-2.5 py-1 bg-slate-100 border border-[#E2E8F0] rounded font-semibold text-slate-700">
                    {exam.classLevel}
                  </span>
                  <span className="px-2.5 py-1 bg-[#0032A0] text-white rounded font-semibold">
                    {exam.examTag || exam.target}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Marking: +{pos} / -{neg}
                  </span>
                </div>
              </div>

              {/* 3 Stat Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5">
                  <p className="text-[11px] font-mono font-semibold text-slate-500 uppercase">Duration</p>
                  <p className="mt-2 inline-flex items-center gap-2 font-mono text-2xl font-bold text-[#0F172A] tabular-nums">
                    <Clock className="w-5 h-5 text-[#0032A0]" />
                    {exam.durationMinutes}m
                  </p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5">
                  <p className="text-[11px] font-mono font-semibold text-slate-500 uppercase">Questions</p>
                  <p className="mt-2 inline-flex items-center gap-2 font-mono text-2xl font-bold text-[#0F172A] tabular-nums">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    {questionCount} Qs
                  </p>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5">
                  <p className="text-[11px] font-mono font-semibold text-slate-500 uppercase">Max Marks</p>
                  <p className="mt-2 inline-flex items-center gap-2 font-mono text-2xl font-bold text-[#0F172A] tabular-nums">
                    <Award className="w-5 h-5 text-amber-600" />
                    {maxMarks}
                  </p>
                </div>
              </div>

              {/* Candidate Guidelines Card */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-6 space-y-3">
                <h2 className="font-display font-bold text-xs uppercase tracking-wider text-[#0F172A] flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#0032A0]" />
                  Candidate Guidelines
                </h2>
                <ul className="space-y-2 text-xs text-slate-600 leading-relaxed list-disc pl-5">
                  <li>
                    {exam.instructions?.trim()
                      ? exam.instructions
                      : 'Questions are strictly from the assigned syllabus of this examination.'}
                  </li>
                  <li>Responses and timers are saved locally. Refreshing will resume your attempt.</li>
                  <li>
                    Upon submission, you can immediately view your score and download your official question &amp;
                    solution PDF.
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Column: Quick Join Registration Card */}
            <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
              <div className="bg-[#0032A0] text-white px-5 py-4">
                <h2 className="font-display font-bold text-base flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Quick Join Registration
                </h2>
                <p className="text-xs text-blue-100 mt-0.5">
                  Enter details to start your allocated examination immediately.
                </p>
              </div>

              <form onSubmit={handleQuickJoinStart} className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs">
                  <span className="text-slate-600">Assigned Paper:</span>
                  <span className="font-mono font-semibold text-[#0032A0]">
                    {exam.classLevel} · {questionCount} Questions
                  </span>
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 leading-relaxed">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                    1. Candidate Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter candidate name (e.g. Rahul Sharma)"
                    className="w-full px-3 py-2.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                    2. Mobile Number <span className="text-red-500">*</span>
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 text-xs font-mono font-semibold bg-slate-100 border border-r-0 border-[#E2E8F0] rounded-l-lg text-slate-600">
                      +91
                    </span>
                    <input
                      type="tel"
                      required
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="10-digit mobile number"
                      className="flex-1 px-3 py-2.5 text-sm font-mono border border-[#E2E8F0] rounded-r-lg focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[#0F172A]">
                      3. Target Class / Standard <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-mono font-semibold text-emerald-700">
                      Allocated: {exam.classLevel}
                    </span>
                  </div>
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value as typeof classLevel)}
                    className="w-full px-3 py-2.5 text-sm border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="Class 11th">Class 11th (XI Aspirant)</option>
                    <option value="Class 12th">Class 12th (XII Aspirant)</option>
                    <option value="Dropper / Repeater">Dropper / Repeater</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                    4. College / School Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={collegeName}
                      onChange={(e) => setCollegeName(e.target.value)}
                      placeholder="e.g. Deogiri College / MIT"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[#0F172A]">5. Roll Number (Optional)</label>
                    <span className="text-[11px] text-slate-400">Auto-assigned if left blank</span>
                  </div>
                  <input
                    type="text"
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    placeholder={`e.g. ${(exam.code || 'CBT').split('-')[0]}-${new Date().getFullYear()}-0101 or leave blank`}
                    className="w-full px-3 py-2.5 text-sm font-mono bg-slate-50 border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg transition-colors disabled:opacity-60"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {submitting ? 'Registering & Launching...' : `Start Allocated CBT Exam (${questionCount} Qs)`}
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenHallTicket}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white hover:bg-slate-50 text-[#0F172A] border border-[#E2E8F0] rounded-lg transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-600" />
                    Generate &amp; View CBT Hall Ticket Pass
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 text-center leading-relaxed pt-1">
                  Clicking <span className="font-semibold text-[#0F172A]">Start Allocated CBT Exam</span> automatically
                  registers your profile in the institute directory and launches your test with all {questionCount}{' '}
                  questions assigned by your faculty.
                </p>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Printable CBT Hall Ticket Pass Modal */}
      {hallTicketOpen && exam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg overflow-hidden shadow-xl">
            <div className="bg-[#0032A0] text-white px-5 py-4 flex items-center justify-between print:bg-[#0032A0]">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider text-blue-100">{instituteName}</p>
                <h3 className="font-display font-bold text-base">Official CBT Examination Hall Ticket</h3>
              </div>
              <button
                type="button"
                onClick={() => setHallTicketOpen(false)}
                className="p-1 text-blue-100 hover:text-white print:hidden"
                aria-label="Close hall ticket"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-[#E2E8F0] rounded-lg">
                <div>
                  <p className="text-slate-500 font-mono text-[10px] uppercase">Candidate Name</p>
                  <p className="font-bold text-[#0F172A] text-sm mt-0.5">{fullName.trim()}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-mono text-[10px] uppercase">Assigned Roll No.</p>
                  <p className="font-mono font-bold text-[#0032A0] text-sm mt-0.5">{generatedRoll}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-mono text-[10px] uppercase">Mobile</p>
                  <p className="font-mono text-[#0F172A] mt-0.5">+91 {mobile.replace(/\D/g, '').slice(-10)}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-mono text-[10px] uppercase">Target Class</p>
                  <p className="font-semibold text-[#0F172A] mt-0.5">{classLevel}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500 font-mono text-[10px] uppercase">College / School</p>
                  <p className="font-semibold text-[#0F172A] mt-0.5">{collegeName.trim() || 'Direct Candidate'}</p>
                </div>
              </div>

              <div className="p-3.5 border border-[#E2E8F0] rounded-lg space-y-1.5">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold text-[#0032A0]">{exam.code}</span>
                  <span className="text-slate-500">{exam.examTag || exam.target}</span>
                </div>
                <p className="font-display font-bold text-sm text-[#0F172A]">{exam.title}</p>
                <p className="font-mono text-slate-600">
                  Duration: {exam.durationMinutes} mins · Questions: {questionCount} · Max Marks: {maxMarks}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHallTicketOpen(false);
                    void handleQuickJoinStart();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start CBT Exam Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
