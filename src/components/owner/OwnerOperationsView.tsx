import React, { useState } from 'react';
import { Bell, Check, Download, FileText, Save, Search, Settings } from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import type { OwnerBootstrapData, SystemSettings } from '../../types/salar';

interface OwnerOperationsViewProps {
  mode: 'notifications' | 'audit-logs' | 'settings';
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
}

export const OwnerOperationsView: React.FC<OwnerOperationsViewProps> = ({ mode, data, onRefresh }) => {
  const [auditSearch, setAuditSearch] = useState('');
  const [settingsForm, setSettingsForm] = useState<SystemSettings>(data.systemSettings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handleMarkRead = async (id: string) => {
    await salarApi.markNotificationRead(id);
    await onRefresh();
  };

  const handleExportAuditCsv = () => {
    const header = ['Timestamp', 'Actor', 'Action', 'ResourceType', 'ResourceID', 'IP', 'Status', 'Details'];
    const rows = data.auditLogs.map((l) => [
      l.timestamp,
      l.actor,
      l.action,
      l.resourceType,
      l.resourceId,
      l.ip,
      l.status,
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salar-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await salarApi.updateSettings(settingsForm);
      setMsg('Platform governance settings & owner profile saved.');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to update settings.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'notifications') {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#0032A0]" />
            <h2 className="font-display font-bold text-base text-[#0F172A]">Platform Owner Notifications</h2>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {data.notifications.filter((n) => !n.read).length} Unread
          </span>
        </div>

        <div className="space-y-3">
          {data.notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                n.read ? 'bg-slate-50 border-[#E2E8F0]' : 'bg-white border-[#0032A0]'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                      n.severity === 'CRITICAL'
                        ? 'bg-red-50 text-red-700'
                        : n.severity === 'WARNING'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-blue-50 text-[#0032A0]'
                    }`}
                  >
                    {n.category} · {n.severity}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="font-semibold text-sm text-[#0F172A] mt-1">{n.title}</p>
                <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
              </div>
              {!n.read && (
                <button
                  type="button"
                  onClick={() => handleMarkRead(n.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50 shrink-0"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Mark Read
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'audit-logs') {
    const filtered = data.auditLogs.filter((l) => {
      const q = auditSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        l.actor.toLowerCase().includes(q) ||
        l.resourceId.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q)
      );
    });

    return (
      <div className="space-y-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Filter audit logs by action, actor, resource, IP..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5 text-[#0032A0]" />
            Export CSV
          </button>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#0032A0]" />
            <h3 className="font-display font-bold text-sm text-[#0F172A]">
              Immutable Governance Audit Trail ({filtered.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor &amp; IP</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      <p className="font-semibold text-[#0F172A]">{l.actor}</p>
                      <p className="text-[11px] text-slate-400">{l.ip}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-[#0032A0]">
                      <p className="font-semibold">{l.action}</p>
                      <p className="text-[11px] text-slate-500">
                        {l.resourceType}: {l.resourceId}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{l.details}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                          l.status === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // mode === 'settings'
  return (
    <form onSubmit={handleSaveSettings} className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>}

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
          <Settings className="w-4 h-4 text-[#0032A0]" />
          <h2 className="font-display font-bold text-base text-[#0F172A]">
            Owner Profile, Taxation &amp; Governance Policies
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Platform Brand Name</label>
            <input
              type="text"
              value={settingsForm.platformName}
              onChange={(e) => setSettingsForm({ ...settingsForm, platformName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Owner Display Name</label>
            <input
              type="text"
              value={settingsForm.ownerDisplayName}
              onChange={(e) => setSettingsForm({ ...settingsForm, ownerDisplayName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Owner Email</label>
            <input
              type="email"
              value={settingsForm.ownerEmail}
              onChange={(e) => setSettingsForm({ ...settingsForm, ownerEmail: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Support Email</label>
            <input
              type="email"
              value={settingsForm.supportEmail}
              onChange={(e) => setSettingsForm({ ...settingsForm, supportEmail: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">GST Number</label>
            <input
              type="text"
              value={settingsForm.gstNumber}
              onChange={(e) => setSettingsForm({ ...settingsForm, gstNumber: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Default GST %</label>
            <input
              type="number"
              value={settingsForm.defaultGstPercent}
              onChange={(e) => setSettingsForm({ ...settingsForm, defaultGstPercent: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">RPO Target (Minutes)</label>
            <input
              type="number"
              value={settingsForm.rpoTargetMinutes}
              onChange={(e) => setSettingsForm({ ...settingsForm, rpoTargetMinutes: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">RTO Target (Minutes)</label>
            <input
              type="number"
              value={settingsForm.rtoTargetMinutes}
              onChange={(e) => setSettingsForm({ ...settingsForm, rtoTargetMinutes: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Retention Days</label>
            <input
              type="number"
              value={settingsForm.retentionDays}
              onChange={(e) => setSettingsForm({ ...settingsForm, retentionDays: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Max Login Attempts</label>
            <input
              type="number"
              value={settingsForm.rateLimitMaxAttempts}
              onChange={(e) => setSettingsForm({ ...settingsForm, rateLimitMaxAttempts: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Session Timeout (Hours)</label>
            <input
              type="number"
              value={settingsForm.sessionTimeoutHours}
              onChange={(e) => setSettingsForm({ ...settingsForm, sessionTimeoutHours: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Active Payment Gateway</label>
            <select
              value={settingsForm.activePaymentGateway}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  activePaymentGateway: e.target.value as SystemSettings['activePaymentGateway'],
                })
              }
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="MANUAL">MANUAL (Owner UPI / QR / Bank)</option>
              <option value="BANK_TRANSFER">BANK_TRANSFER (Manual Bank Receipt)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-slate-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settingsForm.backupEncryptionEnabled}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, backupEncryptionEnabled: e.target.checked })
              }
            />
            Encrypt Backup Archives (AES-256-GCM)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settingsForm.enforceMfaForSensitiveActions}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, enforceMfaForSensitiveActions: e.target.checked })
              }
            />
            Enforce MFA Policy for Owner Sign-In
          </label>
        </div>

        <div className="flex justify-end pt-3 border-t border-[#E2E8F0]">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
          >
            <Save className="w-3.5 h-3.5" />
            Save Governance Settings
          </button>
        </div>
      </div>
    </form>
  );
};
