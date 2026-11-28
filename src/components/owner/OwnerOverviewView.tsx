import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CreditCard,
  HardDrive,
  KeyRound,
  Layers,
  Server,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrencyINR } from '../../lib/portalService';
import type { OwnerBootstrapData, OwnerModuleId } from '../../types/salar';

interface OwnerOverviewViewProps {
  data: OwnerBootstrapData;
  onNavigate: (mod: OwnerModuleId) => void;
}

export const OwnerOverviewView: React.FC<OwnerOverviewViewProps> = ({ data, onNavigate }) => {
  const m = data.computedMetrics;
  const infra = data.infrastructure;
  const unreadAlerts = data.notifications.filter((n) => !n.read || n.severity !== 'INFO');
  const nowMs = Date.now();
  const upcomingRenewals = data.licenses
    .filter((l) => ['ACTIVE', 'GRACE_PERIOD'].includes(l.status))
    .slice(0, 6);

  // Build authentic chart datasets from stored records
  const revenueByOrg = data.organizations.map((org) => {
    const sub = data.subscriptions.find((s) => s.organizationId === org.id);
    const usage = data.usageRecords.find((u) => u.organizationId === org.id);
    return {
      name: org.shortCode || org.id,
      institute: org.instituteName,
      mrr: sub ? sub.baseAmount : 0,
      students: usage ? usage.activeStudents : 0,
      exams: usage ? usage.examsCreated : 0,
    };
  });

  const licenseBreakdown = [
    { status: 'Active', count: data.licenses.filter((l) => l.status === 'ACTIVE').length },
    { status: 'Available', count: data.licenses.filter((l) => l.status === 'AVAILABLE').length },
    { status: 'Suspended', count: data.licenses.filter((l) => l.status === 'SUSPENDED').length },
    { status: 'Released', count: data.licenses.filter((l) => l.status === 'RELEASED').length },
    { status: 'Revoked', count: data.licenses.filter((l) => l.status === 'REVOKED').length },
  ];

  const kpis: Array<{
    label: string;
    value: string;
    sub: string;
    mod: OwnerModuleId;
  }> = [
    { label: 'Total Clients', value: String(m.totalClients), sub: `${m.activeClients} active`, mod: 'clients' },
    { label: 'Active Clients', value: String(m.activeClients), sub: 'Live tenant portals', mod: 'clients' },
    { label: 'Total Licenses', value: String(m.totalLicenses), sub: `${m.activeLicenses} active`, mod: 'licenses' },
    { label: 'Active Licenses', value: String(m.activeLicenses), sub: 'HMAC-SHA256 verified', mod: 'licenses' },
    { label: 'Available Allocations', value: String(m.availableAllocations), sub: 'Ready for assignment', mod: 'allocations' },
    { label: 'Assigned Portals', value: String(m.assignedAllocations), sub: `${data.portalAllocations.length} total slots`, mod: 'allocations' },
    { label: 'Monthly Recurring Rev', value: formatCurrencyINR(m.mrr), sub: 'Computed from active subs', mod: 'billing' },
    { label: 'Annual Recurring Rev', value: formatCurrencyINR(m.arr), sub: 'MRR × 12', mod: 'billing' },
    { label: 'Pending Payments', value: formatCurrencyINR(m.pendingPaymentsTotal), sub: `${m.pendingPaymentsCount} open invoice(s)`, mod: 'billing' },
    { label: 'Expiring Licenses (30d)', value: String(m.expiringLicensesCount), sub: 'Requires renewal follow-up', mod: 'licenses' },
    { label: 'Total Students', value: String(m.totalStudentsAcrossClients), sub: 'Across active clients', mod: 'analytics' },
    { label: 'Total Exams Hosted', value: String(m.totalExamsAcrossClients), sub: 'Across active tenants', mod: 'analytics' },
    { label: 'Server Health', value: infra.serverHealth, sub: `CPU ${infra.cpuLoadPercent}% · ${infra.cpuCores} cores`, mod: 'infrastructure' },
    { label: 'Memory / Disk Usage', value: `${infra.memoryPercent}% / ${infra.diskPercent}%`, sub: `${infra.memoryUsedMb}MB RAM`, mod: 'infrastructure' },
    { label: 'API Traffic & Latency', value: `${infra.requestsPerMin}/m`, sub: `${infra.avgResponseMs}ms avg · ${infra.errorRatePercent}% err`, mod: 'load-balancing' },
  ];

  return (
    <div className="space-y-6">
      {/* 15 Master KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => onNavigate(kpi.mod)}
            className="bg-white border border-[#E2E8F0] hover:border-[#0032A0] rounded-xl p-4 text-left transition-colors group"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider truncate">
                {kpi.label}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0032A0] shrink-0" />
            </div>
            <p className="font-display font-bold text-xl text-[#0F172A] tabular-nums truncate">
              {kpi.value}
            </p>
            <p className="text-xs text-slate-500 mt-1 truncate">{kpi.sub}</p>
          </button>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-bold text-base text-[#0F172A]">
                Client Revenue &amp; Enrollment Telemetry
              </h2>
              <p className="text-xs text-slate-500">Live base subscription revenue and active students per tenant</p>
            </div>
            <span className="text-xs font-mono text-[#0032A0]">MRR BREAKDOWN</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={
                  revenueByOrg.length > 0
                    ? revenueByOrg
                    : [{ name: 'NONE', institute: 'None', mrr: 0, students: 0, exams: 0 }]
                }
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Area type="monotone" dataKey="mrr" name="Subscription (INR)" stroke="#0032A0" fill="#DBEAFE" strokeWidth={2} />
                <Area type="monotone" dataKey="students" name="Active Students" stroke="#10B981" fill="#D1FAE5" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-bold text-base text-[#0F172A]">License Lifecycle Distribution</h2>
              <p className="text-xs text-slate-500">Real-time state counts across all issued license keys</p>
            </div>
            <KeyRound className="w-4 h-4 text-[#0032A0]" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={licenseBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Bar dataKey="count" name="Licenses" fill="#0032A0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom 3-Column Operational Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activities */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-sm text-[#0F172A]">Recent Governance Activities</h2>
            <button
              type="button"
              onClick={() => onNavigate('audit-logs')}
              className="text-xs font-semibold text-[#0032A0] hover:underline"
            >
              View Audit Logs
            </button>
          </div>
          <div className="space-y-3">
            {data.auditLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-semibold text-[#0F172A] truncate">{log.action}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      log.status === 'SUCCESS'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{log.details}</p>
                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  {log.actor} · {new Date(log.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Critical Alerts */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-sm text-[#0F172A] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              System &amp; Risk Alerts
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="text-xs font-semibold text-[#0032A0] hover:underline"
            >
              All Alerts
            </button>
          </div>
          <div className="space-y-3">
            {unreadAlerts.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No unread alerts or critical incidents.</p>
            ) : (
              unreadAlerts.slice(0, 5).map((al) => (
                <div key={al.id} className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0F172A]">{al.title}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        al.severity === 'CRITICAL'
                          ? 'bg-red-100 text-red-700'
                          : al.severity === 'WARNING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {al.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{al.message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Renewals */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-sm text-[#0F172A] flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#0032A0]" />
              License Renewal Schedule
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('licenses')}
              className="text-xs font-semibold text-[#0032A0] hover:underline"
            >
              Manage Licenses
            </button>
          </div>
          <div className="space-y-3">
            {upcomingRenewals.map((lic) => {
              const org = data.organizations.find((o) => o.id === lic.organizationId);
              const daysLeft = Math.ceil((new Date(lic.expirationDate).getTime() - nowMs) / (1000 * 60 * 60 * 24));
              return (
                <div key={lic.id} className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#0F172A] truncate">
                      {org?.instituteName || lic.organizationId}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 truncate">
                      {lic.licenseKey}
                      {lic.billingCycle === 'TRIAL' ? ' · TRIAL' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-mono font-semibold tabular-nums ${daysLeft <= 15 ? 'text-amber-600' : 'text-emerald-700'}`}>
                      {daysLeft}d left
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">{lic.expirationDate.slice(0, 10)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Action Bar */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Server className="w-4 h-4 text-[#0032A0]" />
          <span>
            Active Host: <strong className="font-mono text-[#0F172A]">{infra.hostname}</strong> ({infra.platform}, Node {infra.nodeVersion})
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('trial-portals')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Assign Trial Portal
          </button>
          <button
            type="button"
            onClick={() => onNavigate('clients')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-[#E2E8F0] text-[#0F172A] rounded-lg hover:bg-slate-50"
          >
            <Building2 className="w-3.5 h-3.5 text-[#0032A0]" />
            Register Client
          </button>
          <button
            type="button"
            onClick={() => onNavigate('allocations')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-[#E2E8F0] text-[#0F172A] rounded-lg hover:bg-slate-50"
          >
            <Layers className="w-3.5 h-3.5 text-[#0032A0]" />
            Portal Reassignment
          </button>
          <button
            type="button"
            onClick={() => onNavigate('billing')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-[#E2E8F0] text-[#0F172A] rounded-lg hover:bg-slate-50"
          >
            <CreditCard className="w-3.5 h-3.5 text-[#0032A0]" />
            Invoices &amp; Billing
          </button>
          <button
            type="button"
            onClick={() => onNavigate('backups')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-[#E2E8F0] text-[#0F172A] rounded-lg hover:bg-slate-50"
          >
            <HardDrive className="w-3.5 h-3.5 text-[#0032A0]" />
            Create Backup
          </button>
        </div>
      </div>
    </div>
  );
};
