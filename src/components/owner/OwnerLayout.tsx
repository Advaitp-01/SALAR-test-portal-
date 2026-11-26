import React, { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  Database,
  FileText,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Network,
  Receipt,
  RefreshCw,
  Server,
  Settings,
  Shield,
  X,
} from 'lucide-react';
import type { OwnerBootstrapData, OwnerModuleId } from '../../types/salar';

interface OwnerLayoutProps {
  activeModule: OwnerModuleId;
  onSelectModule: (mod: OwnerModuleId) => void;
  data: OwnerBootstrapData;
  refreshing: boolean;
  onRefresh: () => void;
  onBackToClientPortal: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export const OWNER_SIDEBAR_MODULES: Array<{
  id: OwnerModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Client Organizations', icon: Building2 },
  { id: 'licenses', label: 'License Management', icon: KeyRound },
  { id: 'allocations', label: 'Portal Allocation', icon: Layers },
  { id: 'plans', label: 'Plans & Pricing', icon: CreditCard },
  { id: 'billing', label: 'Subscriptions & Billing', icon: Receipt },
  { id: 'payments', label: 'Payment Gateway', icon: Activity },
  { id: 'infrastructure', label: 'Infrastructure Management', icon: Server },
  { id: 'load-balancing', label: 'Server & Load Balancing', icon: Network },
  { id: 'database', label: 'Database Management', icon: Database },
  { id: 'domains', label: 'Domains & SSL', icon: Globe },
  { id: 'analytics', label: 'Usage Analytics', icon: BarChart3 },
  { id: 'backups', label: 'Backup & Recovery', icon: HardDrive },
  { id: 'security', label: 'Security Center', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'audit-logs', label: 'Audit Logs', icon: FileText },
  { id: 'settings', label: 'Owner Profile & Settings', icon: Settings },
];

export const OwnerLayout: React.FC<OwnerLayoutProps> = ({
  activeModule,
  onSelectModule,
  data,
  refreshing,
  onRefresh,
  onBackToClientPortal,
  onLogout,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const unreadCount = data.notifications.filter((n) => !n.read).length;
  const activeMeta = OWNER_SIDEBAR_MODULES.find((m) => m.id === activeModule);

  const sidebarBody = (
    <div className="flex flex-col h-full bg-white border-r border-[#E2E8F0]">
      <div className="px-4 h-16 border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-[#0F172A] text-white flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display font-bold text-sm text-[#0F172A] truncate">SALAR TECH</p>
            <p className="text-[11px] font-mono text-slate-500 truncate">OWNER CONSOLE</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {OWNER_SIDEBAR_MODULES.map((item) => {
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
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors text-left ${
                isActive
                  ? 'bg-[#0032A0] text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-[#0F172A]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'notifications' && unreadCount > 0 && (
                <span
                  className={`text-[11px] font-mono px-1.5 py-0.5 rounded tabular-nums ${
                    isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#E2E8F0] bg-slate-50 shrink-0 space-y-2">
        <div className="px-2 py-1">
          <p className="text-xs font-semibold text-[#0F172A] truncate">{data.ownerProfile.displayName}</p>
          <p className="text-[11px] font-mono text-slate-500 truncate">
            @{data.ownerProfile.username} · PLATFORM_OWNER
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToClientPortal}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Client Portal
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-[#0F172A]">
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">{sidebarBody}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{sidebarBody}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-[#E2E8F0] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-[#E2E8F0] text-slate-600 shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-mono text-slate-500 uppercase tracking-wider truncate">
                SALAR TECH · PLATFORM GOVERNANCE
              </p>
              <h1 className="font-display font-bold text-sm sm:text-lg text-[#0F172A] truncate">
                {activeMeta?.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#E2E8F0] bg-slate-50 text-xs font-mono text-slate-700 tabular-nums">
              Host: {data.infrastructure.serverHealth} ({data.infrastructure.memoryPercent}% RAM)
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-60 min-h-[38px]"
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-3.5 sm:p-6 overflow-x-hidden">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};
