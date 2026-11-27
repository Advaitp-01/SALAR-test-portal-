import React, { useState } from 'react';
import {
  Ban,
  CalendarPlus,
  CheckCircle2,
  History,
  KeyRound,
  PauseCircle,
  PlayCircle,
  Plus,
  Share2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import { formatCurrencyINR } from '../../lib/portalService';
import type {
  BillingCycle,
  LicenseRecord,
  LicenseStatus,
  Organization,
  OwnerBootstrapData,
  PlanCode,
} from '../../types/salar';
import { ShareClientPortalModal } from './ShareClientPortalModal';

interface OwnerLicensesViewProps {
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
}

export const OwnerLicensesView: React.FC<OwnerLicensesViewProps> = ({ data, onRefresh }) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [historyLicense, setHistoryLicense] = useState<LicenseRecord | null>(null);
  const [shareOrg, setShareOrg] = useState<Organization | null>(null);
  const [verifyKeyInput, setVerifyKeyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Form states
  const [orgId, setOrgId] = useState('');
  const [shortCode, setShortCode] = useState('NEW');
  const [planCode, setPlanCode] = useState<PlanCode>('PRO');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('YEARLY');
  const [customDays, setCustomDays] = useState('30');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const res = await salarApi.createLicense({
        organizationId: orgId || undefined,
        shortCode,
        planCode,
        billingCycle,
        customDays: billingCycle === 'CUSTOM' ? Number(customDays) : undefined,
      });
      setMsg(`Issued cryptographic license key: ${res.license.licenseKey}`);
      setCreateOpen(false);
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to generate license.');
    } finally {
      setBusy(false);
    }
  };

  const handleTransition = async (lic: LicenseRecord, next: LicenseStatus) => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await salarApi.transitionLicense(lic.id, next, `Owner transitioned license ${lic.licenseKey} -> ${next}`);
      setMsg(`License ${lic.licenseKey} transitioned to ${next}.`);
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'License state transition rejected.');
    } finally {
      setBusy(false);
    }
  };

  const handleRenew = async (lic: LicenseRecord) => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const res = await salarApi.renewLicense(lic.id);
      setMsg(`Renewed ${res.license.licenseKey} until ${res.license.expirationDate.slice(0, 10)}.`);
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to renew license.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyKeyInput.trim()) return;
    setVerifyResult('');
    try {
      const res = await salarApi.verifyLicenseKey(verifyKeyInput.trim());
      if (res.valid) {
        setVerifyResult(
          `VALID · HMAC Signature: OK · Status: ${res.status} · Org: ${res.organizationId || 'UNBOUND'} · Expires: ${res.expirationDate?.slice(0, 10)}`
        );
      } else {
        setVerifyResult(`INVALID / INACTIVE · ${res.reason || `Status=${res.status}, SigValid=${res.signatureValid}`}`);
      }
    } catch (e: unknown) {
      setVerifyResult(e instanceof Error ? e.message : 'Verification error');
    }
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>}

      {/* Header & Verifier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <form
          onSubmit={handleVerifyKey}
          className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="flex-1">
            <input
              type="text"
              value={verifyKeyInput}
              onChange={(e) => setVerifyKeyInput(e.target.value)}
              placeholder="Verify HMAC-SHA256 license key (e.g. SALAR-GC-2026-PRO-...)"
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0032A0]"
            />
            {verifyResult && <p className="text-xs font-mono text-[#0032A0] mt-1.5">{verifyResult}</p>}
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0F172A] text-white rounded-lg hover:bg-slate-800 shrink-0"
          >
            <ShieldCheck className="w-4 h-4" />
            Verify HMAC Signature
          </button>
        </form>

        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#0F172A]">Issue License Key</p>
            <p className="text-[11px] text-slate-500">HMAC-SHA256 signed &amp; state locked</p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Generate Key
          </button>
        </div>
      </div>

      {/* Mobile Cards (< md) */}
      <div className="md:hidden space-y-3">
        {data.licenses.map((lic) => {
          const org = data.organizations.find((o) => o.id === lic.organizationId);
          return (
            <div key={lic.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-mono font-bold text-[#0F172A] break-all">{lic.licenseKey}</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                    {org ? org.instituteName : 'Unassigned Pool Key'}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                    lic.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700'
                      : lic.status === 'REVOKED'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {lic.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-[#E2E8F0] text-[11px] font-mono text-slate-600">
                <span>{lic.planCode} · {formatCurrencyINR(lic.priceAmount)}</span>
                <span className="text-right">Exp: {lic.expirationDate.slice(0, 10)}</span>
                <span>{lic.studentLimit} stu · {lic.examLimit} ex</span>
                <span className="text-right">{lic.billingCycle}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {lic.status !== 'REVOKED' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRenew(lic)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg text-[#0032A0]"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    Renew
                  </button>
                )}
                {lic.status === 'ACTIVE' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleTransition(lic, 'SUSPENDED')}
                    className="p-2 rounded-lg border border-amber-200 text-amber-700"
                    title="Suspend License"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                  </button>
                )}
                {(lic.status === 'SUSPENDED' || lic.status === 'GRACE_PERIOD' || lic.status === 'AVAILABLE') && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleTransition(lic, 'ACTIVE')}
                    className="p-2 rounded-lg border border-emerald-200 text-emerald-700"
                    title="Activate License"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                  </button>
                )}
                {lic.status !== 'REVOKED' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleTransition(lic, 'REVOKED')}
                    className="p-2 rounded-lg border border-red-200 text-red-700"
                    title="Revoke License"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                )}
                {org && (
                  <button
                    type="button"
                    onClick={() => setShareOrg(org)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg text-[#0032A0]"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setHistoryLicense(lic)}
                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg text-slate-600"
                >
                  <History className="w-3.5 h-3.5" />
                  Trail
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Licenses Table (md+) */}
      <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                <th className="py-3 px-4">License Key &amp; Signature</th>
                <th className="py-3 px-4">Bound Client</th>
                <th className="py-3 px-4">Plan &amp; Limits</th>
                <th className="py-3 px-4">Validity</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {data.licenses.map((lic) => {
                const org = data.organizations.find((o) => o.id === lic.organizationId);
                return (
                  <tr key={lic.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4">
                      <p className="text-xs font-mono font-semibold text-[#0F172A]">{lic.licenseKey}</p>
                      <p className="text-[11px] font-mono text-slate-400">
                        HMAC: {lic.signature.slice(0, 18)}…
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="text-xs font-semibold text-[#0F172A]">
                        {org ? org.instituteName : 'Unassigned Pool Key'}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500">
                        {lic.organizationId || 'UNBOUND'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="text-xs font-semibold text-[#0F172A]">
                        {lic.planCode} · {formatCurrencyINR(lic.priceAmount)}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {lic.studentLimit} students · {lic.examLimit} exams
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-600 tabular-nums">
                      <p>Exp: {lic.expirationDate.slice(0, 10)}</p>
                      <p className="text-[11px] text-slate-400">{lic.billingCycle}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                          lic.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : lic.status === 'REVOKED'
                            ? 'bg-red-50 text-red-700'
                            : lic.status === 'SUSPENDED' || lic.status === 'EXPIRED'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {lic.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {lic.status !== 'REVOKED' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRenew(lic)}
                            className="p-1.5 rounded border border-[#E2E8F0] text-[#0032A0] hover:bg-blue-50"
                            title="Renew & Extend Validity"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {lic.status === 'ACTIVE' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleTransition(lic, 'SUSPENDED')}
                            className="p-1.5 rounded border border-amber-200 text-amber-700 hover:bg-amber-50"
                            title="Suspend License"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(lic.status === 'SUSPENDED' || lic.status === 'GRACE_PERIOD' || lic.status === 'AVAILABLE') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleTransition(lic, 'ACTIVE')}
                            className="p-1.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            title="Activate License"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {lic.status !== 'REVOKED' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleTransition(lic, 'REVOKED')}
                            className="p-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50"
                            title="Permanently Revoke License (Irreversible)"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {org && (
                          <button
                            type="button"
                            onClick={() => setShareOrg(org)}
                            className="p-1.5 rounded border border-[#E2E8F0] text-[#0032A0] hover:bg-blue-50"
                            title="Share Client Portal Link"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setHistoryLicense(lic)}
                          className="p-1.5 rounded border border-[#E2E8F0] text-slate-600 hover:bg-slate-50"
                          title="License Lifecycle Events"
                        >
                          <History className="w-3.5 h-3.5" />
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

      {/* Generate License Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#0032A0]" />
                <h3 className="font-display font-bold text-base text-[#0F172A]">Generate Signed License Key</h3>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleGenerate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bind to Client Organization</label>
                <select
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="">Leave Unassigned (AVAILABLE pool key)</option>
                  {data.organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id} — {o.instituteName}
                    </option>
                  ))}
                </select>
              </div>
              {!orgId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Institute Code Prefix</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={shortCode}
                    onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Tier</label>
                  <select
                    value={planCode}
                    onChange={(e) => setPlanCode(e.target.value as PlanCode)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="STARTER">STARTER</option>
                    <option value="PRO">PRO</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cycle</label>
                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="TRIAL">TRIAL (DAYS)</option>
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="QUARTERLY">QUARTERLY</option>
                    <option value="YEARLY">YEARLY</option>
                    <option value="CUSTOM">CUSTOM DAYS</option>
                  </select>
                </div>
              </div>
              {(billingCycle === 'CUSTOM' || billingCycle === 'TRIAL') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {billingCycle === 'TRIAL' ? 'Trial Validity Days' : 'Validity Days'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  {busy ? 'Generating...' : 'Generate License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* License Audit History Modal */}
      {historyLicense && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <p className="text-xs font-mono text-[#0032A0]">{historyLicense.licenseKey}</p>
                <h3 className="font-display font-bold text-base text-[#0F172A]">License Lifecycle Trail</h3>
              </div>
              <button type="button" onClick={() => setHistoryLicense(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {data.licenseEvents
                .filter((ev) => ev.licenseId === historyLicense.id)
                .map((ev) => (
                  <div key={ev.id} className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0] text-xs">
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-semibold text-[#0F172A] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0032A0]" />
                        {ev.fromStatus} → {ev.toStatus}
                      </span>
                      <span className="text-slate-400">{new Date(ev.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-600 mt-1">{ev.reason}</p>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">Actor: {ev.actor}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      <ShareClientPortalModal
        org={shareOrg}
        data={data}
        onClose={() => setShareOrg(null)}
        onRefresh={onRefresh}
      />
    </div>
  );
};
