import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  HardDrive,
  Plus,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import type { BackupJob, OwnerBootstrapData } from '../../types/salar';

interface OwnerBackupsViewProps {
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
}

export const OwnerBackupsView: React.FC<OwnerBackupsViewProps> = ({ data, onRefresh }) => {
  const [scope, setScope] = useState<'FULL_PLATFORM' | 'TENANT' | 'STORAGE'>('FULL_PLATFORM');
  const [orgId, setOrgId] = useState(data.organizations[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.createBackup({
        scope,
        organizationId: scope === 'TENANT' ? orgId : undefined,
      });
      setMsg(
        `Created ${res.backup.encrypted ? 'AES-256-GCM encrypted' : 'plain'} backup ${res.backup.archiveName} (SHA-256: ${res.backup.sha256Checksum.slice(0, 14)}…).`
      );
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Backup creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (b: BackupJob) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.verifyBackup(b.id);
      setMsg(
        res.valid
          ? `Checksum & decryption verified cleanly for ${res.backup.archiveName}.`
          : `Verification failed: ${res.error || 'Archive corrupted'}`
      );
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Verification error.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (b: BackupJob, dryRun: boolean) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.restoreBackup(b.id, dryRun);
      setMsg(res.restoreJob.notes);
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>}

      {/* RPO / RTO Banner + Create Backup */}
      <form onSubmit={handleCreate} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[#0032A0]" />
            <h2 className="font-display font-bold text-base text-[#0F172A]">
              Encrypted Backup &amp; Disaster Recovery Center
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-600 tabular-nums">
            RPO: {data.systemSettings.rpoTargetMinutes}m · RTO: {data.systemSettings.rtoTargetMinutes}m · Retention: {data.systemSettings.retentionDays}d
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Backup Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="FULL_PLATFORM">FULL_PLATFORM (All Tenants, Licenses, Billing)</option>
              <option value="TENANT">TENANT (Isolated Institute Bundle)</option>
              <option value="STORAGE">STORAGE (Uploads Manifest &amp; File Index)</option>
            </select>
          </div>

          {scope === 'TENANT' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Organization</label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
              >
                {data.organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} — {o.instituteName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-2">
              AES-256-GCM encryption {data.systemSettings.backupEncryptionEnabled ? 'ENABLED' : 'DISABLED'} with SHA-256 integrity hash.
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg h-[38px]"
          >
            <Plus className="w-4 h-4" />
            Create Snapshot Backup
          </button>
        </div>
      </form>

      {/* Backups Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
          <h3 className="font-display font-bold text-sm text-[#0F172A]">Backup Archives ({data.backupJobs.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                <th className="py-3 px-4">Archive &amp; SHA-256</th>
                <th className="py-3 px-4">Scope / Client</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.backupJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                    No backup archives created yet. Create a snapshot above.
                  </td>
                </tr>
              ) : (
                data.backupJobs.map((b) => (
                  <tr key={b.id}>
                    <td className="py-3 px-4 font-mono text-xs">
                      <p className="font-semibold text-[#0F172A]">{b.archiveName}</p>
                      <p className="text-[11px] text-slate-400">
                        SHA-256: {b.sha256Checksum.slice(0, 16)}… · {b.encrypted ? 'AES-256-GCM' : 'JSON'}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span className="font-mono font-semibold text-[#0032A0]">{b.scope}</span>
                      {b.organizationId && <p className="font-mono text-[11px] text-slate-500">{b.organizationId}</p>}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      {Math.max(1, Math.round(b.sizeBytes / 1024))} KB
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                          b.status === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : b.status === 'FAILED'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-blue-50 text-[#0032A0]'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleVerify(b)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
                        >
                          <ShieldCheck className="w-3 h-3 text-[#0032A0]" />
                          Verify
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRestore(b, true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Dry-Run Restore
                        </button>
                        <a
                          href={`/api/owner/backups/${encodeURIComponent(b.id)}/download`}
                          className="p-1.5 border border-[#E2E8F0] rounded-lg text-slate-600 hover:text-[#0032A0]"
                          title="Download Archive"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore History */}
      {data.restoreJobs.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <h3 className="font-display font-bold text-sm text-[#0F172A] mb-3">Restore Verification Log</h3>
          <div className="space-y-2 text-xs">
            {data.restoreJobs.map((r) => (
              <div key={r.id} className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0] flex justify-between gap-3">
                <div>
                  <span className="font-mono font-semibold text-[#0F172A]">
                    {r.dryRun ? 'DRY-RUN' : 'LIVE RESTORE'} · {r.status}
                  </span>
                  <p className="text-slate-600 mt-0.5">{r.notes}</p>
                </div>
                <span className="font-mono text-slate-400 shrink-0">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
