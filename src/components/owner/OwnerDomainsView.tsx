import React, { useState } from 'react';
import { ArrowRightLeft, BarChart3, CheckCircle2, Globe, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { salarApi } from '../../lib/salarApi';
import type { OwnerBootstrapData, TenantDomain } from '../../types/salar';

interface OwnerDomainsViewProps {
  mode: 'domains' | 'analytics';
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
}

export const OwnerDomainsView: React.FC<OwnerDomainsViewProps> = ({ mode, data, onRefresh }) => {
  const [orgId, setOrgId] = useState(data.organizations[0]?.id || '');
  const [domainInput, setDomainInput] = useState('');
  const [domainType, setDomainType] = useState<'CUSTOM_DOMAIN' | 'SUBDOMAIN'>('CUSTOM_DOMAIN');
  const [transferDom, setTransferDom] = useState<TenantDomain | null>(null);
  const [transferTargetOrgId, setTransferTargetOrgId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.addDomain({
        organizationId: orgId,
        domain: domainInput.trim(),
        type: domainType,
      });
      setMsg(`Added ${res.domain.domain}. Run DNS & SSL verification before activation.`);
      setDomainInput('');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to bind domain.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyDomain = async (id: string) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.verifyDomain(id);
      setMsg(
        res.domain.isActive
          ? `Verified & activated ${res.domain.domain} (${res.domain.verificationNotes}).`
          : `Verification incomplete for ${res.domain.domain}: ${res.domain.verificationNotes}`
      );
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Domain verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDomain = async (id: string) => {
    setBusy(true);
    try {
      await salarApi.deleteDomain(id);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleTransferDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferDom || !transferTargetOrgId) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.transferDomain(transferDom.id, transferTargetOrgId);
      const targetOrg = data.organizations.find((o) => o.id === transferTargetOrgId);
      setMsg(`Transferred domain ${res.domain.domain} to ${targetOrg?.instituteName || transferTargetOrgId}.`);
      setTransferDom(null);
      setTransferTargetOrgId('');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Domain transfer failed.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'analytics') {
    const chartData = data.usageRecords.map((u) => {
      const org = data.organizations.find((o) => o.id === u.organizationId);
      return {
        client: org?.shortCode || u.organizationId,
        institute: org?.instituteName || u.organizationId,
        students: u.activeStudents,
        exams: u.examsCreated,
        attempts: u.totalAttempts,
        storageMb: u.storageUsedMb,
        apiReq: u.apiRequests,
      };
    });

    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0032A0]" />
              <h2 className="font-display font-bold text-base text-[#0F172A]">
                Tenant Resource &amp; Assessment Utilization
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500">PER-CLIENT TELEMETRY</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="client" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Bar dataKey="students" name="Active Students" fill="#0032A0" radius={[4, 4, 0, 0]} />
                <Bar dataKey="attempts" name="CBT Attempts" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="exams" name="Exams Created" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Students</th>
                  <th className="py-3 px-4">Exams</th>
                  <th className="py-3 px-4">Attempts</th>
                  <th className="py-3 px-4">Storage / API</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.usageRecords.map((u) => {
                  const org = data.organizations.find((o) => o.id === u.organizationId);
                  return (
                    <tr key={u.id}>
                      <td className="py-3 px-4 text-xs font-semibold text-[#0F172A]">
                        {org?.instituteName || u.organizationId}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{u.period}</td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums">{u.activeStudents}</td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums">{u.examsCreated}</td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums">{u.totalAttempts}</td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums">
                        {u.storageUsedMb} MB · {u.apiRequests} req
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>}

      <form onSubmit={handleAddDomain} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[#0032A0]" />
          <h2 className="font-display font-bold text-sm text-[#0F172A]">
            Bind Tenant Subdomain or Custom Domain (Duplicate Guard Enforced)
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Client Organization</label>
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Domain / Subdomain</label>
            <input
              type="text"
              required
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="tests.institute.in"
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
            <select
              value={domainType}
              onChange={(e) => setDomainType(e.target.value as typeof domainType)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="CUSTOM_DOMAIN">CUSTOM_DOMAIN</option>
              <option value="SUBDOMAIN">SUBDOMAIN</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg h-[38px]"
          >
            <Plus className="w-4 h-4" />
            Bind Domain
          </button>
        </div>
      </form>

      {/* Mobile Domain Cards (< md) */}
      <div className="md:hidden space-y-3">
        {data.tenantDomains.map((dom) => {
          const org = data.organizations.find((o) => o.id === dom.organizationId);
          return (
            <div key={dom.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-[#0F172A] break-all">{dom.domain}</p>
                  <p className="text-xs font-semibold text-slate-600 truncate">
                    {org?.instituteName || dom.organizationId}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    dom.isActive && dom.sslStatus === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700'
                      : dom.sslStatus === 'FAILED'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {dom.isActive && dom.sslStatus === 'ACTIVE'
                    ? 'VERIFIED'
                    : dom.sslStatus === 'FAILED'
                    ? 'SSL_FAILED'
                    : 'PENDING'}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-500 break-all">
                {dom.type} → {dom.dnsTarget} · DNS: {dom.dnsVerified ? 'OK' : 'PENDING'} · SSL: {dom.sslStatus}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleVerifyDomain(dom.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  <RefreshCw className="w-3 h-3 text-[#0032A0]" />
                  Verify DNS/SSL
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setErr('');
                    setTransferTargetOrgId('');
                    setTransferDom(dom);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  <ArrowRightLeft className="w-3 h-3 text-[#0032A0]" />
                  Transfer
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDeleteDomain(dom.id)}
                  className="ml-auto p-2 rounded-lg border border-red-200 text-red-700"
                  title="Unbind Domain"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Domains Table (md+) */}
      <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                <th className="py-3 px-4">Domain</th>
                <th className="py-3 px-4">Client Organization</th>
                <th className="py-3 px-4">DNS &amp; SSL Status</th>
                <th className="py-3 px-4">Verification Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.tenantDomains.map((dom) => {
                const org = data.organizations.find((o) => o.id === dom.organizationId);
                return (
                  <tr key={dom.id}>
                    <td className="py-3.5 px-4">
                      <p className="font-mono text-xs font-semibold text-[#0F172A]">{dom.domain}</p>
                      <p className="text-[11px] font-mono text-slate-400">
                        {dom.type} → {dom.dnsTarget}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-[#0F172A]">
                      {org?.instituteName || dom.organizationId}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                          dom.isActive && dom.sslStatus === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : dom.sslStatus === 'FAILED'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {dom.isActive && dom.sslStatus === 'ACTIVE'
                          ? 'VERIFIED_ACTIVE'
                          : dom.sslStatus === 'FAILED'
                          ? 'SSL_FAILED'
                          : 'PENDING_DNS'}
                        {' · '}
                        DNS: {dom.dnsVerified ? 'OK' : 'PENDING'} · SSL: {dom.sslStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {dom.verificationNotes || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleVerifyDomain(dom.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
                        >
                          <RefreshCw className="w-3 h-3 text-[#0032A0]" />
                          Verify DNS/SSL
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setErr('');
                            setTransferTargetOrgId('');
                            setTransferDom(dom);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50 text-slate-700"
                          title="Transfer Domain to Another Client"
                        >
                          <ArrowRightLeft className="w-3 h-3 text-[#0032A0]" />
                          Transfer
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDeleteDomain(dom.id)}
                          className="p-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50"
                          title="Unbind Domain"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Domain Transfer Modal */}
      {transferDom && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <p className="text-xs font-mono text-[#0032A0]">{transferDom.type}</p>
                <h3 className="font-display font-bold text-base text-[#0F172A]">
                  Transfer Domain: {transferDom.domain}
                </h3>
              </div>
              <button type="button" onClick={() => setTransferDom(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleTransferDomain} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Active Client Organization
                </label>
                <select
                  required
                  value={transferTargetOrgId}
                  onChange={(e) => setTransferTargetOrgId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="">Select destination institute...</option>
                  {data.organizations
                    .filter((o) => o.id !== transferDom.organizationId && o.status !== 'ARCHIVED')
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id} — {o.instituteName}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setTransferDom(null)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !transferTargetOrgId}
                  className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg disabled:opacity-60"
                >
                  {busy ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
