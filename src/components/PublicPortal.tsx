import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from '../lib/tenantDb';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Lock,
  Mail,
  MapPin,
  Phone,
  Shield,
  UserPlus,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { formatCurrencyINR, GENERATED_ASSETS } from '../lib/portalService';
import type { Course, TestSeries } from '../types/portal';

interface PublicPortalProps {
  onOpenAdminGate: () => void;
  tenantInstituteName?: string;
  tenantOrgId?: string;
}

export const PublicPortal: React.FC<PublicPortalProps> = ({
  onOpenAdminGate,
  tenantInstituteName,
  tenantOrgId,
}) => {
  const { settings, isIsolatedTenant, signInWithGoogle, signInStudentEmail, registerStudentEmail, resetPassword } =
    useAuth();
  const displayInstituteName =
    tenantOrgId && tenantOrgId !== 'SALAR-ORG-00001' && tenantInstituteName
      ? tenantInstituteName
      : settings.instituteName;
  const instituteInitial = (displayInstituteName.trim().charAt(0) || 'S').toUpperCase();
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'quick-join' | 'forgot'>('login');

  // Student auth fields (never prefilled)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [classLevel, setClassLevel] = useState<'Class 11th' | 'Class 12th' | 'Dropper / Repeater'>('Class 12th');
  const [targetExam, setTargetExam] = useState<
    'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'Boards + CET' | 'JEE Main + Advanced'
  >('JEE Main');

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  // Public published catalog
  const [courses, setCourses] = useState<Course[]>([]);
  const [testSeries, setTestSeries] = useState<TestSeries[]>([]);

  useEffect(() => {
    const unsubCourses = onSnapshot(
      query(collection(db, 'courses'), where('status', '==', 'PUBLISHED')),
      (snap) => {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) })));
      },
      () => setCourses([])
    );

    const unsubSeries = onSnapshot(
      query(collection(db, 'testSeries'), where('status', '==', 'PUBLISHED')),
      (snap) => {
        setTestSeries(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TestSeries, 'id'>) })));
      },
      () => setTestSeries([])
    );

    return () => {
      unsubCourses();
      unsubSeries();
    };
  }, []);

  const handleGoogleStudent = async () => {
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);
    try {
      const res = await signInWithGoogle('STUDENT');
      if (res.error) setAuthError(res.error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);
    try {
      if (authTab === 'login') {
        const res = await signInStudentEmail(email, password);
        if (res.error) setAuthError(res.error);
      } else if (authTab === 'register' || authTab === 'quick-join') {
        if (!name.trim() || !email.trim() || !password.trim()) {
          setAuthError('Please fill in your name, email, and password.');
          return;
        }
        const res = await registerStudentEmail({
          name,
          email,
          password,
          mobile,
          classLevel,
          targetExam,
          origin: authTab === 'quick-join' ? 'QUICK_JOIN' : 'PORTAL_SIGNUP',
        });
        if (res.error) setAuthError(res.error);
      } else if (authTab === 'forgot') {
        if (!email.trim()) {
          setAuthError('Enter your registered email address.');
          return;
        }
        const res = await resetPassword(email);
        if (res.error) {
          setAuthError(res.error);
        } else {
          setAuthSuccess('Password reset link sent to your email address.');
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#0F172A] flex flex-col">
      {/* Top Bar Contract: Brand wordmark — 4 concise links — 1 primary action */}
      <header className="border-b border-[#E2E8F0] bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
          <a href="#top" className="flex items-center gap-2.5 min-w-0">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={settings.instituteName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded object-cover shrink-0"
              />
            ) : (
              <span className="w-8 h-8 rounded bg-[#0032A0] text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
                {instituteInitial}
              </span>
            )}
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-display font-bold text-sm sm:text-lg tracking-tight text-[#0F172A] truncate max-w-[170px] sm:max-w-[280px] md:max-w-none">
                {displayInstituteName}
              </span>
              <span className="text-[10px] font-mono font-semibold text-[#0032A0] uppercase tracking-wider truncate">
                Powered by SALAR Tech
              </span>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#portal-auth" className="hover:text-[#0032A0] transition-colors whitespace-nowrap shrink-0">
              Student Portal
            </a>
            <a href="#courses" className="hover:text-[#0032A0] transition-colors whitespace-nowrap shrink-0">
              Courses
            </a>
            <a href="#test-series" className="hover:text-[#0032A0] transition-colors whitespace-nowrap shrink-0">
              Test Series
            </a>
            <a href="#contact" className="hover:text-[#0032A0] transition-colors whitespace-nowrap shrink-0">
              Contact
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenAdminGate}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[38px] text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              Admin Gate
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero + Student Login Split */}
      <main id="top" className="flex-1">
        <section className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Editorial / Hero Column */}
            <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
              <div className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-2 text-xs font-mono text-[#0032A0] font-semibold">
                  <span>{settings.tagline}</span>
                </div>
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#0F172A] tracking-tight leading-tight text-balance">
                  {settings.heroTitle}
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-2xl">{settings.heroSubtitle}</p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <a
                    href="#portal-auth"
                    onClick={() => setAuthTab('login')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0032A0] hover:bg-[#00257a] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    {settings.primaryCta}
                    <ArrowRight className="w-4 h-4" />
                  </a>
                  {settings.portalConfig.allowQuickJoin && (
                    <button
                      type="button"
                      onClick={() => setAuthTab('quick-join')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-[#E2E8F0] hover:bg-slate-50 text-[#0F172A] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <UserPlus className="w-4 h-4 text-[#0032A0]" />
                      {settings.secondaryCta}
                    </button>
                  )}
                </div>
              </div>

              <div className="relative h-56 sm:h-64 w-full border-t border-[#E2E8F0] bg-slate-100">
                <img
                  src={settings.heroImage || GENERATED_ASSETS.hero}
                  alt={`${displayInstituteName} Lecture Studio`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Right Student Authentication Card */}
            <div
              id="portal-auth"
              className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-7 flex flex-col justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h2 className="font-display text-lg sm:text-xl font-bold text-[#0F172A]">
                    Student Examination Portal
                  </h2>
                  <span className="text-[11px] sm:text-xs font-mono text-slate-500">CBT ACCESS</span>
                </div>

                {/* Segmented Tabs */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('login');
                      setAuthError('');
                      setAuthSuccess('');
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      authTab === 'login' ? 'bg-white text-[#0032A0] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Student Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('register');
                      setAuthError('');
                      setAuthSuccess('');
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      authTab === 'register'
                        ? 'bg-white text-[#0032A0] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Register
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('quick-join');
                      setAuthError('');
                      setAuthSuccess('');
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      authTab === 'quick-join'
                        ? 'bg-white text-[#0032A0] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Quick Join
                  </button>
                </div>

                {authError && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed">
                    {authError}
                  </div>
                )}
                {authSuccess && (
                  <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                    {authSuccess}
                  </div>
                )}

                <form onSubmit={handleEmailSubmit} className="space-y-3" autoComplete="off">
                  {(authTab === 'register' || authTab === 'quick-join') && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Student full name"
                          className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile / WhatsApp</label>
                          <input
                            type="tel"
                            value={mobile}
                            onChange={(e) => setMobile(e.target.value)}
                            placeholder="10-digit number"
                            className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Class</label>
                          <select
                            value={classLevel}
                            onChange={(e) => setClassLevel(e.target.value as typeof classLevel)}
                            className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                          >
                            <option value="Class 11th">Class 11th</option>
                            <option value="Class 12th">Class 12th</option>
                            <option value="Dropper / Repeater">Dropper / Repeater</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Target Exam</label>
                        <select
                          value={targetExam}
                          onChange={(e) => setTargetExam(e.target.value as typeof targetExam)}
                          className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        >
                          <option value="JEE Main">{isIsolatedTenant ? 'JEE Main' : 'JEE Main Mathematics'}</option>
                          <option value="JEE Advanced">{isIsolatedTenant ? 'JEE Advanced' : 'JEE Advanced Mathematics'}</option>
                          <option value="MHT-CET">{isIsolatedTenant ? 'MHT-CET' : 'MHT-CET Mathematics'}</option>
                          <option value="JEE Main + Advanced">JEE Main + Advanced</option>
                          <option value="Boards + CET">{isIsolatedTenant ? 'Boards + Entrance' : 'Boards + MHT-CET'}</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@example.com"
                      autoComplete="off"
                      className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>

                  {authTab !== 'forgot' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">Password</label>
                        {authTab === 'login' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthTab('forgot');
                              setAuthError('');
                            }}
                            className="text-xs font-medium text-[#2563EB] hover:underline"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        autoComplete="new-password"
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 px-4 bg-[#0032A0] hover:bg-[#00257a] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
                  >
                    {authLoading
                      ? 'Please wait...'
                      : authTab === 'login'
                      ? 'Sign In to Student Portal'
                      : authTab === 'register'
                      ? 'Create Student Account'
                      : authTab === 'quick-join'
                      ? 'Submit Quick Join Registration'
                      : 'Send Password Reset Email'}
                  </button>

                  {authTab === 'forgot' && (
                    <button
                      type="button"
                      onClick={() => setAuthTab('login')}
                      className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Back to Student Login
                    </button>
                  )}
                </form>

                {settings.portalConfig.allowGoogleAuth && !isIsolatedTenant && authTab !== 'forgot' && (
                  <>
                    <div className="relative flex items-center my-4">
                      <div className="flex-grow border-t border-slate-200" />
                      <span className="px-3 text-xs font-mono text-slate-400">OPTIONAL GOOGLE ACCESS</span>
                      <div className="flex-grow border-t border-slate-200" />
                    </div>

                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={handleGoogleStudent}
                      className="w-full flex items-center justify-center gap-2.5 px-4 py-2 border border-[#E2E8F0] rounded-lg bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors disabled:opacity-60"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                        />
                      </svg>
                      Continue with Google (Optional)
                    </button>
                  </>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#0032A0] shrink-0" />
                  Login stays auto-stored until sign out
                </span>
                <button
                  type="button"
                  onClick={onOpenAdminGate}
                  className="font-semibold text-[#0032A0] hover:underline text-left sm:text-right"
                >
                  Admin Console
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Published Courses Section */}
        <section id="courses" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 border-b border-[#E2E8F0]">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-mono text-[#0032A0] font-semibold uppercase tracking-wider mb-1">
                {isIsolatedTenant ? `${displayInstituteName} Curriculum` : 'Mathematics Curriculum'}
              </p>
              <h2 className="font-display text-2xl font-bold text-[#0F172A]">Published Courses</h2>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">{courses.length} Courses Active</span>
          </div>

          {courses.length === 0 ? (
            <div className="border border-[#E2E8F0] rounded-xl p-8 text-center bg-slate-50">
              <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">No published courses yet.</p>
              <p className="text-xs text-slate-500 mt-1">
                {isIsolatedTenant
                  ? 'Administrators can publish structured courses from the Admin Console.'
                  : 'Administrators can publish Class 11th & 12th Mathematics courses from the Admin Console.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {courses.map((c) => (
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
                    <div className="p-5">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1.5">
                        <span>{c.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{c.classLevel || 'Class 11th & 12th'}</span>
                      </div>
                      <h3 className="font-display font-bold text-base text-[#0F172A] mb-2">{c.name}</h3>
                      <p className="text-sm text-slate-600 line-clamp-2">{c.description}</p>
                    </div>
                  </div>
                  <div className="px-5 py-3.5 border-t border-[#E2E8F0] bg-slate-50 flex items-center justify-between">
                    <span className="font-mono font-bold text-base text-[#0F172A] tabular-nums">
                      {formatCurrencyINR(c.price)}
                    </span>
                    <a
                      href="#portal-auth"
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] rounded-lg transition-colors"
                    >
                      Enroll via Portal
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Published Test Series Section */}
        <section id="test-series" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 border-b border-[#E2E8F0]">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-mono text-[#0032A0] font-semibold uppercase tracking-wider mb-1">
                CBT Assessment Packages
              </p>
              <h2 className="font-display text-2xl font-bold text-[#0F172A]">
                {isIsolatedTenant ? 'Online Test Series' : 'Mathematics Test Series'}
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {testSeries.length} Series Published
            </span>
          </div>

          {testSeries.length === 0 ? (
            <div className="border border-[#E2E8F0] rounded-xl p-8 text-center bg-slate-50">
              <ClipboardList className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">No published test series packages yet.</p>
              <p className="text-xs text-slate-500 mt-1">
                {isIsolatedTenant
                  ? 'Published Computer-Based Test series packages appear here once activated by your institute.'
                  : 'JEE Main, JEE Advanced, and MHT-CET Mathematics test series appear here once published.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testSeries.map((ts) => (
                <div
                  key={ts.id}
                  className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs font-mono text-[#0032A0] mb-2">
                      <span>{ts.examCategory}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ts.mockTestCount} Mock Tests</span>
                    </div>
                    <h3 className="font-display font-bold text-base text-[#0F172A] mb-2">{ts.title}</h3>
                    <p className="text-sm text-slate-600 mb-4">{ts.description}</p>
                    <ul className="space-y-1.5 text-xs text-slate-600 mb-5">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>NTA-grade Computer-Based Test interface</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>KaTeX mathematical notation &amp; instant rank list</span>
                      </li>
                    </ul>
                  </div>
                  <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
                    <span className="font-mono font-bold text-base text-[#0F172A] tabular-nums">
                      {formatCurrencyINR(ts.price)}
                    </span>
                    <a
                      href="#portal-auth"
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] rounded-lg transition-colors"
                    >
                      Join Series
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Contact Footer */}
      <footer id="contact" className="bg-slate-50 border-t border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-600">
          <div>
            <p className="font-display font-bold text-[#0F172A] mb-1">{displayInstituteName}</p>
            <p className="text-xs text-slate-500">{settings.tagline}</p>
            <p className="text-[11px] font-mono font-semibold text-[#0032A0] mt-2">
              Powered by SALAR Tech
            </p>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-[#0032A0] shrink-0 mt-0.5" />
              <span>{settings.address}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#0032A0] shrink-0" />
              <span className="font-mono">{settings.phone}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#0032A0] shrink-0" />
              <span>{settings.email}</span>
            </div>
          </div>
          <div className="flex flex-col md:items-end justify-between text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onOpenAdminGate}
                className="text-left md:text-right font-semibold text-[#0032A0] hover:underline"
              >
                Faculty &amp; Admin Console Gate
              </button>
            </div>
            <span className="mt-2 font-mono">
              © {new Date().getFullYear()} {displayInstituteName} · SALAR Tech
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
