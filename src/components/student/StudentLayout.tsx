import React, { useState } from 'react';
import {
  BookOpen,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ShoppingBag,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { StudentModule } from '../../types/portal';

interface StudentLayoutProps {
  activeModule: StudentModule;
  onSelectModule: (mod: StudentModule) => void;
  children: React.ReactNode;
}

const STUDENT_SIDEBAR: Array<{
  id: StudentModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'exams', label: 'Exams', icon: FileText },
  { id: 'courses', label: 'Courses', icon: BookOpen },
  { id: 'test-series', label: 'Test Series', icon: FileSpreadsheet },
  { id: 'purchases', label: 'My Purchases', icon: ShoppingBag },
  { id: 'profile', label: 'Profile', icon: User },
];

export const StudentLayout: React.FC<StudentLayoutProps> = ({ activeModule, onSelectModule, children }) => {
  const { settings, studentProfile, tenantContext, firebaseUser, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const trialDaysLeft = tenantContext?.isTrial
    ? typeof tenantContext.trialDaysRemaining === 'number'
      ? tenantContext.trialDaysRemaining
      : tenantContext.licenseExpirationDate
      ? Math.ceil((new Date(tenantContext.licenseExpirationDate).getTime() - Date.now()) / 86400000)
      : 0
    : 0;

  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-[#E2E8F0]">
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
              {(settings.instituteName.trim().charAt(0) || 'S').toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-display font-bold text-sm text-[#0F172A] truncate">{settings.instituteName}</p>
            <p className="text-[11px] font-mono text-slate-500 truncate">STUDENT PORTAL · SALAR TECH</p>
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

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {STUDENT_SIDEBAR.map((item) => {
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
                isActive ? 'bg-[#0032A0] text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-[#0F172A]'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#E2E8F0] bg-slate-50 shrink-0 space-y-2">
        {tenantContext?.isTrial && (
          <div className="px-2 py-1 border-b border-slate-200/80 text-[11px] font-mono text-[#0032A0] font-semibold">
            TRIAL PLAN · {trialDaysLeft > 0 ? `${trialDaysLeft}d left` : 'Expired'}
          </div>
        )}
        <div className="px-2 py-1">
          <p className="text-xs font-semibold text-[#0F172A] truncate">
            {studentProfile?.name || firebaseUser?.displayName || 'Student'}
          </p>
          <p className="text-[11px] font-mono text-slate-500 truncate">
            {studentProfile?.rollNumber || 'STUDENT'} · {studentProfile?.classLevel || 'Class 12th'}
          </p>
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
      <aside className="hidden lg:block w-64 shrink-0 fixed inset-y-0 left-0 z-30">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{navContent}</div>
        </div>
      )}

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="lg:hidden bg-white border-b border-[#E2E8F0] px-4 h-14 flex items-center justify-between sticky top-0 z-20">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-lg"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display font-bold text-sm text-[#0F172A] truncate">
            {STUDENT_SIDEBAR.find((i) => i.id === activeModule)?.label || 'Student Portal'}
          </span>
          <button type="button" onClick={logout} className="text-xs font-semibold text-red-600 px-2 py-1">
            Exit
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
