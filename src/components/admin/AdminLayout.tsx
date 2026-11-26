import React, { useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  CreditCard,
  Database,
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
  const { settings, firebaseUser, isIsolatedTenant, signInWithGoogle, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const instituteInitial = (settings.instituteName.trim().charAt(0) || 'S').toUpperCase();

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
            {firebaseUser?.email || 'Password Gate Session'}
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

        {/* Optional one-time cloud link if authenticated only via server passcode on primary root portal */}
        {!firebaseUser && !isIsolatedTenant && (
          <div className="bg-slate-50 border-b border-[#E2E8F0] px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Admin session auto-saved. Link your verified admin account (<span className="font-mono">gurukulclassestech@gmail.com</span>) once if Firestore sync prompts for cloud authorization.
            </p>
            <button
              type="button"
              onClick={() => signInWithGoogle('SUPER_ADMIN')}
              className="px-3 py-1.5 text-xs font-semibold text-[#0032A0] bg-white border border-[#E2E8F0] hover:bg-blue-50 rounded-lg whitespace-nowrap"
            >
              Link Cloud Account (One-Time)
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
