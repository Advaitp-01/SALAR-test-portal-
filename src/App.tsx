/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from './lib/tenantDb';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { db } from './lib/firebase';
import { salarApi } from './lib/salarApi';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicPortal } from './components/PublicPortal';
import { AdminGateModal } from './components/AdminGateModal';
import { CBTExamInterface } from './components/CBTExamInterface';
import { AdminLayout } from './components/admin/AdminLayout';
import { DashboardView } from './components/admin/DashboardView';
import { StudentsView } from './components/admin/StudentsView';
import { FacultyView } from './components/admin/FacultyView';
import { BatchesView } from './components/admin/BatchesView';
import { QuestionBankView } from './components/admin/QuestionBankView';
import { ExamsView } from './components/admin/ExamsView';
import { AttendanceView } from './components/admin/AttendanceView';
import { StudyMaterialView } from './components/admin/StudyMaterialView';
import { NotificationsView } from './components/admin/NotificationsView';
import { ResultsView } from './components/admin/ResultsView';
import { EvaluationView } from './components/admin/EvaluationView';
import { PaymentsView } from './components/admin/PaymentsView';
import { CoursesView } from './components/admin/CoursesView';
import { TestSeriesView } from './components/admin/TestSeriesView';
import { SettingsView } from './components/admin/SettingsView';
import { StudentLayout } from './components/student/StudentLayout';
import { StudentDashboardView } from './components/student/StudentDashboardView';
import { StudentExamsView } from './components/student/StudentExamsView';
import { StudentCoursesView } from './components/student/StudentCoursesView';
import { StudentTestSeriesView } from './components/student/StudentTestSeriesView';
import { StudentPurchasesView } from './components/student/StudentPurchasesView';
import { StudentProfileView } from './components/student/StudentProfileView';
import { OwnerLoginView } from './components/owner/OwnerLoginView';
import { OwnerDashboardShell } from './components/owner/OwnerDashboardShell';
import { ClientManualPayView } from './components/owner/ClientManualPayView';
import type { AdminModule, Exam, StudentModule } from './types/portal';

function normalizePath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '');
  return clean || '/';
}

const PortalShell: React.FC = () => {
  const { authReady, role, isAdminUnlocked, firebaseUser, tenantContext, tenantNotFound } = useAuth();
  const [pathname, setPathname] = useState<string>(() => normalizePath(window.location.pathname));
  const [ownerAuthChecked, setOwnerAuthChecked] = useState(false);
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(false);

  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const [adminModule, setAdminModule] = useState<AdminModule>('dashboard');
  const [studentModule, setStudentModule] = useState<StudentModule>('dashboard');
  const [activeCbtExam, setActiveCbtExam] = useState<Exam | null>(null);

  const navigateTo = useCallback((targetPath: string, replace = false) => {
    const normalized = normalizePath(targetPath);
    if (replace) {
      window.history.replaceState({}, '', targetPath);
    } else {
      window.history.pushState({}, '', targetPath);
    }
    setPathname(normalized);
    window.dispatchEvent(new Event('salar-route-change'));
  }, []);

  // Listen to browser back/forward SPA history and programmatic route redirects
  useEffect(() => {
    const handlePop = () => {
      setPathname(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePop);
    window.addEventListener('salar-route-change', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
      window.removeEventListener('salar-route-change', handlePop);
    };
  }, []);

  // Verify Owner session whenever navigating to /owner or /owner/dashboard
  const isOwnerRoute = pathname === '/owner' || pathname === '/owner/dashboard';

  useEffect(() => {
    if (!isOwnerRoute) return;
    if (ownerAuthenticated && pathname === '/owner/dashboard') {
      setOwnerAuthChecked(true);
      return;
    }
    let active = true;
    setOwnerAuthChecked(false);
    salarApi
      .getSession()
      .then((res) => {
        if (!active) return;
        const authed = Boolean(res.authenticated);
        setOwnerAuthenticated(authed);
        setOwnerAuthChecked(true);
        if (authed && pathname === '/owner') {
          navigateTo('/owner/dashboard', true);
        } else if (!authed && pathname === '/owner/dashboard') {
          navigateTo('/owner', true);
        }
      })
      .catch(() => {
        if (!active) return;
        setOwnerAuthenticated(false);
        setOwnerAuthChecked(true);
        if (pathname === '/owner/dashboard') {
          navigateTo('/owner', true);
        }
      });
    return () => {
      active = false;
    };
  }, [isOwnerRoute, pathname, ownerAuthenticated, navigateTo]);

  // Support direct ?exam=<id> link after student login
  useEffect(() => {
    if (isOwnerRoute || !authReady || !firebaseUser || role !== 'STUDENT') return;
    const params = new URLSearchParams(window.location.search);
    const examId = params.get('exam');
    if (!examId || !/^[a-zA-Z0-9_-]{1,128}$/.test(examId)) return;

    let active = true;
    getDoc(doc(db, 'exams', examId))
      .then((snap) => {
        if (!active || !snap.exists()) return;
        const data = snap.data() as Omit<Exam, 'id'>;
        if (data.status === 'LIVE') {
          setActiveCbtExam({ id: snap.id, ...data });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isOwnerRoute, authReady, firebaseUser, role]);

  const paySlugMatch = pathname.match(/^\/p\/([^/]+)\/pay$/i);
  const isPayRoute = pathname === '/pay' || Boolean(paySlugMatch);

  // Client Manual Payment Submission Route (/pay?org=... or /p/:slug/pay)
  if (isPayRoute) {
    const backPath = paySlugMatch ? `/p/${paySlugMatch[1]}` : tenantContext?.portalPath || '/';
    return <ClientManualPayView onBackToPortal={() => navigateTo(backPath)} />;
  }

  // -------------------------------------------------------------------------
  // SALAR TECH PLATFORM OWNER ROUTES (/owner & /owner/dashboard)
  // -------------------------------------------------------------------------
  if (isOwnerRoute) {
    if (!ownerAuthChecked) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
          <div className="bg-white border border-[#E2E8F0] rounded-xl px-6 py-4 text-xs font-mono text-slate-600">
            Verifying SALAR Tech Owner Governance Session...
          </div>
        </div>
      );
    }

    if (ownerAuthenticated && pathname === '/owner/dashboard') {
      return (
        <OwnerDashboardShell
          onBackToClientPortal={() => navigateTo('/')}
          onSessionExpired={() => {
            setOwnerAuthenticated(false);
            navigateTo('/owner', true);
          }}
        />
      );
    }

    return (
      <OwnerLoginView
        onBackToClientPortal={() => navigateTo('/')}
        onAuthenticated={() => {
          setOwnerAuthenticated(true);
          navigateTo('/owner/dashboard');
        }}
      />
    );
  }

  // Unknown /p/:slug or ?org= client link
  if (tenantNotFound) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#E2E8F0] rounded-xl p-7 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-[#E2E8F0] text-slate-700 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="font-display font-bold text-lg text-[#0F172A]">Portal Not Found</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            This client portal link is unavailable or has been archived. Please verify the institute URL.
          </p>
          <div className="flex items-center justify-center pt-2">
            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
            >
              Return to Main Portal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Enforce license/organization suspension lockout on client portal routes (no Owner portal link shown)
  if (tenantContext?.found && tenantContext.accessBlocked) {
    const portalHome = tenantContext.portalPath || '/';
    const payPath = tenantContext.isDefaultRoot
      ? `/pay?org=${encodeURIComponent(tenantContext.organizationId || '')}`
      : `${portalHome}/pay`;
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#E2E8F0] rounded-xl p-7 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="font-display font-bold text-lg text-[#0F172A]">Portal License Suspended</h1>
          <p className="text-xs text-slate-600 leading-relaxed">{tenantContext.blockReason}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigateTo(portalHome)}
              className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
            >
              Return Home
            </button>
            <button
              type="button"
              onClick={() => navigateTo(payPath)}
              className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
            >
              Submit Subscription Payment
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl px-6 py-4 text-xs font-mono text-slate-600">
          Initializing {tenantContext?.instituteName || 'Examination'} Portal...
        </div>
      </div>
    );
  }

  // Admin Console (SUPER_ADMIN or unlocked via Secure Faculty Gate)
  if (role === 'SUPER_ADMIN' || isAdminUnlocked) {
    return (
      <AdminLayout activeModule={adminModule} onSelectModule={setAdminModule}>
        {adminModule === 'dashboard' && <DashboardView onNavigate={setAdminModule} />}
        {adminModule === 'students' && <StudentsView />}
        {adminModule === 'faculty' && <FacultyView />}
        {adminModule === 'batches' && <BatchesView />}
        {adminModule === 'question-bank' && <QuestionBankView />}
        {adminModule === 'exams' && <ExamsView />}
        {adminModule === 'attendance' && <AttendanceView />}
        {adminModule === 'study-material' && <StudyMaterialView />}
        {adminModule === 'notifications' && <NotificationsView />}
        {adminModule === 'results' && <ResultsView />}
        {adminModule === 'evaluation' && <EvaluationView />}
        {adminModule === 'payments' && <PaymentsView />}
        {adminModule === 'courses' && <CoursesView />}
        {adminModule === 'test-series' && <TestSeriesView />}
        {adminModule === 'settings' && <SettingsView />}
      </AdminLayout>
    );
  }

  // Student Portal + CBT Examination Engine
  if (role === 'STUDENT' && firebaseUser) {
    if (activeCbtExam) {
      return (
        <CBTExamInterface
          exam={activeCbtExam}
          onExit={() => {
            setActiveCbtExam(null);
            if (window.location.search.includes('exam=')) {
              window.history.replaceState({}, '', window.location.pathname);
            }
          }}
        />
      );
    }

    return (
      <StudentLayout activeModule={studentModule} onSelectModule={setStudentModule}>
        {studentModule === 'dashboard' && (
          <StudentDashboardView onNavigate={setStudentModule} onLaunchExam={setActiveCbtExam} />
        )}
        {studentModule === 'exams' && <StudentExamsView onLaunchExam={setActiveCbtExam} />}
        {studentModule === 'courses' && <StudentCoursesView />}
        {studentModule === 'test-series' && <StudentTestSeriesView onLaunchExam={setActiveCbtExam} />}
        {studentModule === 'purchases' && <StudentPurchasesView />}
        {studentModule === 'profile' && <StudentProfileView />}
      </StudentLayout>
    );
  }

  // Public Landing & Authentication Portal
  return (
    <>
      <PublicPortal
        onOpenAdminGate={() => setAdminGateOpen(true)}
        tenantInstituteName={tenantContext?.instituteName}
        tenantOrgId={tenantContext?.organizationId}
      />
      <AdminGateModal
        isOpen={adminGateOpen}
        onClose={() => setAdminGateOpen(false)}
        onSuccess={() => {
          setAdminGateOpen(false);
          setAdminModule('dashboard');
        }}
      />
    </>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PortalShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
