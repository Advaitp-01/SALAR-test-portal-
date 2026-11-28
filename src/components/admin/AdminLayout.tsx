import React, { useState } from 'react';
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  ClipboardCheck,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { firebaseProjectId } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import type { AdminModule } from '../../types/portal';

interface AdminLayoutProps {
  activeModule: AdminModule;
  onSelectModule: (mod: AdminModule) => void;
  children: React.ReactNode;
}

const SIDEBAR_ITEMS: Array<{ id: AdminModule; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'faculty', label: 'Teachers / Faculty Directory', icon: GraduationCap },
  { id: 'batches', label: 'Batches', icon: Layers },
  { id: 'question-bank', label: 'Question Bank', icon: Database },
  { id: 'exams', label: 'Exams', icon: FileText },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'study-material', label: 'Study Material', icon: BookOpen },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'results', label: 'Results & Recording', icon: Award },
  { id: 'evaluation', label: 'Evaluation', icon: ClipboardCheck },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'courses', label: 'Courses', icon: Package },
  { id: 'test-series', label: 'Test Series', icon: FileSpreadsheet },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const AdminLayout: React.FC<AdminLayoutProps> = ({ activeModule, onSelectModule, children }) => {
  const {
    settings,
    tenantContext,
    firebaseUser,
    isIsolatedTenant,
    cloudAuthNeeded,
    cloudLinkError,
    clearCloudLinkError,
    signInWithGoogle,
    signInWithGoogleRedirectFallback,
    logout,
  } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [linkingCloud, setLinkingCloud] = useState(false);
  const [localCloudError, setLocalCloudError] = useState('');
  const [copiedDomain, setCopiedDomain] = useState(false);
  const instituteInitial = (settings.instituteName.trim().charAt(0) || 'S').toUpperCase();
  const activeCloudError = localCloudError || cloudLinkError;
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const isUnauthorizedDomain =
    activeCloudError.includes('unauthorized-domain') || activeCloudError.includes('Authorized domains');
  const isPopupBlocked =
    activeCloudError.includes('popup-blocked') ||
    activeCloudError.includes('Brave Shields') ||
    activeCloudError.includes('Redirect Sign-In');

  const handleLinkCloudAccount = async () => {
    setLocalCloudError('');
    clearCloudLinkError();
    setLinkingCloud(true);
    try {
      const res = await signInWithGoogle('SUPER_ADMIN');
      if (res.error) {
        setLocalCloudError(res.error);
      }
    } finally {
      setLinkingCloud(false);
    }
  };

  const handleCopyHost = () => {
    if (!currentHost) return;
    navigator.clipboard.writeText(currentHost).catch(() => {});
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2000);
  };

  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-[#E2E8F0]">
      {/* Brand header */}
      <div className="px-4 h-16 border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
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
          <div className="min-w-0">
            <p className="font-display font-bold text-sm text-[#0F172A] truncate">{settings.instituteName}</p>
            <p className="text-[11px] font-mono text-slate-500 truncate">ADMIN CONSOLE · SALAR TECH</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 15 Nav Items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectModule(item.id);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                isActive
                  ? 'bg-[#0032A0] text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-[#0F172A]'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Account Footer */}
      <div className="p-3 border-t border-[#E2E8F0] bg-slate-50 shrink-0 space-y-2">
        <div className="px-2 py-1">
          <p className="text-xs font-semibold text-[#0F172A] truncate">
            {firebaseUser?.email || tenantContext?.email || settings.email || 'Super Admin Session'}
          </p>
          <p className="text-[11px] font-mono text-slate-500">SUPER_ADMIN</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 bg-white border border-[#E2E8F0] hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 fixed inset-y-0 left-0 z-30">{navContent}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{navContent}</div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Mobile Top Bar */}
        <header className="lg:hidden bg-white border-b border-[#E2E8F0] px-4 h-14 flex items-center justify-between sticky top-0 z-20">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-lg"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display font-bold text-sm text-[#0F172A] truncate">
            {SIDEBAR_ITEMS.find((i) => i.id === activeModule)?.label || 'Admin Console'}
          </span>
          <button
            type="button"
            onClick={logout}
            className="text-xs font-semibold text-red-600 px-2 py-1"
          >
            Exit
          </button>
        </header>

        {/* Trial Plan Status Banner */}
        {tenantContext?.isTrial && (() => {
          const daysLeft =
            typeof tenantContext.trialDaysRemaining === 'number'
              ? tenantContext.trialDaysRemaining
              : tenantContext.licenseExpirationDate
              ? Math.ceil((new Date(tenantContext.licenseExpirationDate).getTime() - Date.now()) / 86400000)
              : 0;
          return (
            <div className="bg-blue-50/90 border-b border-blue-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#0F172A]">
                <span className="font-mono font-bold text-[#0032A0]">TRIAL PLAN</span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span className="font-semibold">{tenantContext.planCode || 'PRO'} Tier</span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {(tenantContext.licenseStartDate || '').slice(0, 10) || 'Active'} →{' '}
                  {(tenantContext.licenseExpirationDate || '').slice(0, 10) || '—'}
                </span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span className={`font-mono font-semibold tabular-nums ${daysLeft <= 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {daysLeft > 0 ? `${daysLeft}d remaining` : 'Expired'}
                </span>
                {tenantContext.trialNotes && (
                  <>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span className="text-slate-600">{tenantContext.trialNotes}</span>
                  </>
                )}
              </div>
              <a
                href={`/pay?org=${encodeURIComponent(tenantContext.organizationId || '')}`}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] rounded-lg whitespace-nowrap shrink-0"
              >
                Upgrade / Billing
              </a>
            </div>
          );
        })()}

        {/* Optional / Required one-time cloud link if authenticated only via server passcode on primary root portal */}
        {!firebaseUser && !isIsolatedTenant && (
          <div className="bg-amber-50/80 border-b border-amber-200 px-4 sm:px-6 py-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-xs text-slate-700">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  {cloudAuthNeeded
                    ? 'Cloud Firestore requires Google authorization to sync Students, Exams, Attempts, and Payments. '
                    : 'Passcode session active. '}
                  Link your authorized admin account (<span className="font-mono font-semibold">gurukulclassestech@gmail.com</span>) once for live cloud sync.
                </p>
              </div>
              <button
                type="button"
                disabled={linkingCloud}
                onClick={handleLinkCloudAccount}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] disabled:opacity-60 rounded-lg whitespace-nowrap"
              >
                {linkingCloud ? 'Linking Cloud Account...' : 'Link Cloud Account (One-Time)'}
              </button>
            </div>

            {activeCloudError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-xs space-y-2">
                <p className="font-medium leading-relaxed">{activeCloudError}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {isUnauthorizedDomain && currentHost && (
                    <>
                      <button
                        type="button"
                        onClick={handleCopyHost}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-red-300 rounded font-mono text-[11px] font-semibold text-red-900 hover:bg-red-100"
                      >
                        {copiedDomain ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedDomain ? `Copied ${currentHost}` : `Copy Domain: ${currentHost}`}
                      </button>
                      {firebaseProjectId && (
                        <a
                          href={`https://console.firebase.google.com/project/${firebaseProjectId}/authentication/settings`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-800 text-white rounded text-[11px] font-semibold hover:bg-red-900"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open Firebase Authorized Domains
                        </a>
                      )}
                    </>
                  )}
                  {isPopupBlocked && (
                    <button
                      type="button"
                      onClick={() => signInWithGoogleRedirectFallback('SUPER_ADMIN')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0032A0] text-white rounded text-[11px] font-semibold hover:bg-[#00257a]"
                    >
                      Use Redirect Sign-In (No Popup Needed)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
