import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { formatCurrencyINR } from '../../lib/portalService';
import { salarApi } from '../../lib/salarApi';
import type {
  BillingCycle,
  DeploymentType,
  Organization,
  OwnerBootstrapData,
  PlanCode,
} from '../../types/salar';
import { ShareClientPortalModal } from './ShareClientPortalModal';

interface OwnerTrialPortalsViewProps {
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
}

const DURATION_PRESETS = [3, 7, 14, 30, 60, 90] as const;

export const OwnerTrialPortalsView: React.FC<OwnerTrialPortalsViewProps> = ({ data, onRefresh }) => {
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const addDaysStr = (baseStr: string, days: number) => {
    const dt = new Date(`${baseStr || todayStr()}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return todayStr();
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  };
  const countDaysBetween = (startStr: string, endStr: string) => {
    const s = new Date(`${startStr}T00:00:00Z`).getTime();
    const e = new Date(`${endStr}T00:00:00Z`).getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) return 0;
    return Math.max(0, Math.round((e - s) / (1000 * 60 * 60 * 24)));
  };
  const getDaysRemaining = (expIso?: string) => {
    if (!expIso) return null;
    return Math.ceil((new Date(expIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const [assignMode, setAssignMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [search, setSearch] = useState('');
  const [trialFilter, setTrialFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED'>('ALL');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [bannerOrg, setBannerOrg] = useState<Organization | null>(null);
  const [shareOrg, setShareOrg] = useState<Organization | null>(null);

  // Assign Trial to Existing Client state
  const assignableOrgs = useMemo(
    () => data.organizations.filter((o) => o.status !== 'ARCHIVED'),
    [data.organizations]
  );
  const [existingOrgId, setExistingOrgId] = useState<string>(() => {
    const firstNonRoot = assignableOrgs.find((o) => o.id !== 'SALAR-ORG-00001');
    return firstNonRoot?.id || assignableOrgs[0]?.id || '';
  });
  const [existingTier, setExistingTier] = useState<PlanCode>('PRO');
  const [existingStart, setExistingStart] = useState<string>(() => todayStr());
  const [existingEnd, setExistingEnd] = useState<string>(() => addDaysStr(todayStr(), 14));
  const [existingStudentCap, setExistingStudentCap] = useState<string>('');
  const [existingExamCap, setExistingExamCap] = useState<string>('');
  const [existingNotes, setExistingNotes] = useState<string>('14-day pilot trial portal approved by SALAR Owner');

  // Provision New Trial Portal state
  const [newInstituteName, setNewInstituteName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newStateName, setNewStateName] = useState('');
  const [newTier, setNewTier] = useState<PlanCode>('PRO');
  const [newDeploymentType, setNewDeploymentType] = useState<DeploymentType>('SHARED_MULTI_TENANT');
  const [newAllocId, setNewAllocId] = useState('');
  const [newStart, setNewStart] = useState<string>(() => todayStr());
  const [newEnd, setNewEnd] = useState<string>(() => addDaysStr(todayStr(), 14));
  const [newPasscode, setNewPasscode] = useState('');

  // Edit Trial Dates Modal
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [editTier, setEditTier] = useState<PlanCode>('PRO');
  const [editStart, setEditStart] = useState<string>(() => todayStr());
  const [editEnd, setEditEnd] = useState<string>(() => addDaysStr(todayStr(), 14));
  const [editNotes, setEditNotes] = useState('');

  // Convert Trial to Paid Modal
  const [convertOrg, setConvertOrg] = useState<Organization | null>(null);
  const [convertTier, setConvertTier] = useState<PlanCode>('PRO');
  const [convertCycle, setConvertCycle] = useState<BillingCycle>('MONTHLY');
  const [convertStart, setConvertStart] = useState<string>(() => todayStr());
  const [convertEnd, setConvertEnd] = useState<string>(() => addDaysStr(todayStr(), 30));
  const [convertCustomPrice, setConvertCustomPrice] = useState('');
  const [convertGenerateInvoice, setConvertGenerateInvoice] = useState(true);

  const availableAllocations = useMemo(
    () => data.portalAllocations.filter((a) => a.status === 'AVAILABLE'),
    [data.portalAllocations]
  );

  const trialRows = useMemo(() => {
    return data.organizations
      .map((org) => {
        const lic = data.licenses.find((l) => l.id === org.licenseId || l.organizationId === org.id);
        const alloc = data.portalAllocations.find((a) => a.id === org.portalAllocationId);
        const isTrial = org.billingCycle === 'TRIAL' || lic?.billingCycle === 'TRIAL';
        const daysLeft = getDaysRemaining(lic?.expirationDate);
        return { org, lic, alloc, isTrial, daysLeft };
      })
      .filter((row) => row.isTrial);
  }, [data.organizations, data.licenses, data.portalAllocations]);

  const metrics = useMemo(() => {
    let active = 0;
    let expiringSoon = 0;
    let expired = 0;
    trialRows.forEach(({ org, lic, daysLeft }) => {
      const rem = daysLeft ?? 0;
      if (rem <= 0 || lic?.status === 'EXPIRED') {
        expired += 1;
      } else {
        if (org.status === 'ACTIVE' && lic?.status === 'ACTIVE') {
          active += 1;
        }
        if (rem <= 3) {
          expiringSoon += 1;
        }
      }
    });
    return {
      active,
      expiringSoon,
      expired,
      availableSlots: availableAllocations.length,
    };
  }, [trialRows, availableAllocations.length]);

  const filteredTrials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trialRows.filter(({ org, lic, daysLeft }) => {
      const rem = daysLeft ?? 0;
      const isExpired = rem <= 0 || lic?.status === 'EXPIRED';
      if (trialFilter === 'ACTIVE' && (isExpired || org.status !== 'ACTIVE')) return false;
      if (trialFilter === 'EXPIRING' && (isExpired || rem > 3)) return false;
      if (trialFilter === 'EXPIRED' && !isExpired) return false;
      if (!q) return true;
      return (
        org.id.toLowerCase().includes(q) ||
        org.instituteName.toLowerCase().includes(q) ||
        org.email.toLowerCase().includes(q) ||
        (org.portalSlug || '').toLowerCase().includes(q) ||
        (lic?.licenseKey || '').toLowerCase().includes(q)
      );
    });
  }, [trialRows, trialFilter, search]);

  const getPortalPath = (org: Organization) =>
    org.portalPath || (org.id === 'SALAR-ORG-00001' ? '/' : `/p/${org.portalSlug || org.id}`);

  const getFullPortalUrl = (org: Organization) => `${window.location.origin}${getPortalPath(org)}`;

  const copyPortalUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleAssignExistingTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingOrgId) {
      setError('Select a client organization.');
      return;
    }
    const daysCount = countDaysBetween(existingStart, existingEnd);
    if (daysCount <= 0) {
      setError('Trial expiry date must be after start date.');
      return;
    }
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await salarApi.assignClientValidity(existingOrgId, {
        mode: 'TRIAL',
        billingCycle: 'TRIAL',
        planCode: existingTier,
        startDate: existingStart,
        expirationDate: existingEnd,
        days: daysCount,
        studentCapacity: existingStudentCap.trim() ? Number(existingStudentCap) : undefined,
        examCapacity: existingExamCap.trim() ? Number(existingExamCap) : undefined,
        notes: existingNotes.trim() || undefined,
      });
      setBannerOrg(res.organization);
      setMessage(
        `Assigned ${daysCount}-day ${existingTier} Trial Plan to ${res.organization.instituteName} (${existingStart} to ${res.license.expirationDate.slice(
          0,
          10
        )}).`
      );
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign trial plan.');
    } finally {
      setBusy(false);
    }
  };

  const handleProvisionNewTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    const daysCount = countDaysBetween(newStart, newEnd);
    if (daysCount <= 0) {
      setError('Trial expiry date must be after start date.');
      return;
    }
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await salarApi.createOrganization({
        instituteName: newInstituteName.trim(),
        contactPerson: newContactPerson.trim() || undefined,
        email: newEmail.trim(),
        mobile: newMobile.trim() || undefined,
        city: newCity.trim() || undefined,
        state: newStateName.trim() || undefined,
        planCode: newTier,
        billingCycle: 'TRIAL',
        customPrice: 0,
        deploymentType: newDeploymentType,
        portalAllocationId: newAllocId || undefined,
        initialAdminPasscode: newPasscode.trim() || undefined,
        startDate: newStart,
        expirationDate: newEnd,
        trialDays: daysCount,
      });
      setBannerOrg(res.organization);
      setMessage(
        `Provisioned new ${daysCount}-day Trial Portal for ${res.organization.instituteName} (${res.license.licenseKey}). Portal live at ${window.location.origin}${res.portalPath}.`
      );
      setNewInstituteName('');
      setNewEmail('');
      setNewContactPerson('');
      setNewMobile('');
      setNewCity('');
      setNewStateName('');
      setNewPasscode('');
      setNewAllocId('');
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to provision new trial client portal.');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickExtend = async (org: Organization, addDays: number) => {
    const lic = data.licenses.find((l) => l.id === org.licenseId || l.organizationId === org.id);
    const currentExp = lic ? new Date(lic.expirationDate) : new Date();
    const baseMs = Math.max(Date.now(), currentExp.getTime());
    const startStr = (lic?.activationDate || todayStr()).slice(0, 10);
    const nextExp = new Date(baseMs + addDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const totalDays = Math.max(addDays, countDaysBetween(startStr, nextExp));

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await salarApi.assignClientValidity(org.id, {
        mode: 'TRIAL',
        billingCycle: 'TRIAL',
        planCode: org.planCode,
        startDate: startStr,
        expirationDate: nextExp,
        days: totalDays,
        notes: `Extended trial by +${addDays} days`,
      });
      setBannerOrg(res.organization);
      setMessage(
        `Extended Trial Plan for ${res.organization.instituteName} by +${addDays} days (now expires ${res.license.expirationDate.slice(
          0,
          10
        )}).`
      );
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to extend trial.');
    } finally {
      setBusy(false);
    }
  };

  const openEditModal = (org: Organization) => {
    const lic = data.licenses.find((l) => l.id === org.licenseId || l.organizationId === org.id);
    setError('');
    setEditOrg(org);
    setEditTier(org.planCode);
    setEditStart((lic?.activationDate || todayStr()).slice(0, 10));
    setEditEnd((lic?.expirationDate || addDaysStr(todayStr(), 14)).slice(0, 10));
    setEditNotes(lic?.notes || '');
  };

  const handleSaveEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOrg) return;
    const daysCount = countDaysBetween(editStart, editEnd);
    if (daysCount <= 0) {
      setError('Expiry date must be after start date.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await salarApi.assignClientValidity(editOrg.id, {
        mode: 'TRIAL',
        billingCycle: 'TRIAL',
        planCode: editTier,
        startDate: editStart,
        expirationDate: editEnd,
        days: daysCount,
        notes: editNotes.trim() || undefined,
      });
      setBannerOrg(res.organization);
      setMessage(
        `Updated trial dates for ${res.organization.instituteName} (${editStart} to ${res.license.expirationDate.slice(
          0,
          10
        )}).`
      );
      setEditOrg(null);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update trial dates.');
    } finally {
      setBusy(false);
    }
  };

  const openConvertModal = (org: Organization) => {
    setError('');
    setConvertOrg(org);
    setConvertTier(org.planCode);
    setConvertCycle('MONTHLY');
    const today = todayStr();
    setConvertStart(today);
    setConvertEnd(addDaysStr(today, 30));
    setConvertCustomPrice('');
    setConvertGenerateInvoice(true);
  };

  const handleConvertCycleChange = (nextCycle: BillingCycle) => {
    setConvertCycle(nextCycle);
    const daysMap: Record<BillingCycle, number> = {
      TRIAL: 14,
      MONTHLY: 30,
      QUARTERLY: 90,
      YEARLY: 365,
      CUSTOM: 30,
    };
    setConvertEnd(addDaysStr(convertStart || todayStr(), daysMap[nextCycle]));
  };

  const handleConfirmConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertOrg) return;
    const daysCount = countDaysBetween(convertStart, convertEnd);
    if (daysCount <= 0) {
      setError('Paid period expiry date must be after start date.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await salarApi.assignClientValidity(convertOrg.id, {
        mode: 'CUSTOM_DATE',
        billingCycle: convertCycle,
        planCode: convertTier,
        startDate: convertStart,
        expirationDate: convertEnd,
        days: daysCount,
        customPrice: convertCustomPrice.trim() ? Number(convertCustomPrice) : null,
        generateInvoice: convertGenerateInvoice,
        notes: `Converted from Trial Plan to ${convertTier} (${convertCycle})`,
      });
      setBannerOrg(res.organization);
      const invMsg = res.invoice
        ? ` Issued GST Invoice ${res.invoice.invoiceNumber} (${formatCurrencyINR(res.invoice.totalAmount)}).`
        : '';
      setMessage(
        `Converted ${res.organization.instituteName} to Paid ${convertTier} (${convertCycle}) valid until ${res.license.expirationDate.slice(
          0,
          10
        )}.${invMsg}`
      );
      setConvertOrg(null);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to convert trial to paid plan.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (org: Organization, nextStatus: 'ACTIVE' | 'SUSPENDED') => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await salarApi.updateOrganization(org.id, { status: nextStatus });
      setMessage(`Updated ${org.instituteName} status to ${nextStatus}.`);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setBusy(false);
    }
  };

  const selectedConvertPlan = data.licensePlans.find((p) => p.code === convertTier);
  const estimatedPrice = (() => {
    if (convertCustomPrice.trim()) return Number(convertCustomPrice) || 0;
    if (!selectedConvertPlan) return 0;
    if (convertCycle === 'YEARLY') return selectedConvertPlan.yearlyPrice;
    if (convertCycle === 'QUARTERLY') return selectedConvertPlan.quarterlyPrice;
    return selectedConvertPlan.monthlyPrice;
  })();

  return (
    <div className="space-y-6">
      {message && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
          <span>{message}</span>
          {bannerOrg && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => copyPortalUrl('banner', getFullPortalUrl(bannerOrg))}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded-lg font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                {copiedId === 'banner' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedId === 'banner' ? 'Copied' : 'Copy Portal Link'}
              </button>
              <button
                type="button"
                onClick={() => setShareOrg(bannerOrg)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded-lg font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <Share2 className="w-3 h-3" />
                Share Access
              </button>
              <a
                href={getPortalPath(bannerOrg)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0032A0] text-white rounded-lg font-semibold hover:bg-[#00257a]"
              >
                <ExternalLink className="w-3 h-3" />
                Open Portal
              </a>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Active Trial Portals</p>
          <p className="font-display font-bold text-2xl text-[#0F172A] tabular-nums mt-1">{metrics.active}</p>
          <p className="text-xs text-slate-500 mt-1">{trialRows.length} total trial org(s)</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Expiring Within 3 Days</p>
          <p className="font-display font-bold text-2xl text-amber-700 tabular-nums mt-1">{metrics.expiringSoon}</p>
          <p className="text-xs text-slate-500 mt-1">Follow up for conversion</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Expired Trials</p>
          <p className="font-display font-bold text-2xl text-red-700 tabular-nums mt-1">{metrics.expired}</p>
          <p className="text-xs text-slate-500 mt-1">Extend or archive inactive</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Available Portal Slots</p>
          <p className="font-display font-bold text-2xl text-[#0032A0] tabular-nums mt-1">{metrics.availableSlots}</p>
          <p className="text-xs text-slate-500 mt-1">Ready for instant trial binding</p>
        </div>
      </div>

      {/* Assign / Provision Trial Portal Console */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
          <div>
            <p className="text-[11px] font-mono font-semibold text-[#0032A0] uppercase tracking-wider">
              SALAR Trial Provisioning Desk
            </p>
            <h2 className="font-display font-bold text-base text-[#0F172A] mt-0.5">
              Assign Trial Portal to Client
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Assign date-based trial access to any existing institute or launch a brand-new isolated trial portal in one click.
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-slate-50 p-1 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setAssignMode('EXISTING')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                assignMode === 'EXISTING'
                  ? 'bg-[#0032A0] text-white'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              Existing Client
            </button>
            <button
              type="button"
              onClick={() => setAssignMode('NEW')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                assignMode === 'NEW'
                  ? 'bg-[#0032A0] text-white'
                  : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              + New Trial Client
            </button>
          </div>
        </div>

        {assignMode === 'EXISTING' ? (
          <form onSubmit={handleAssignExistingTrial} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Client Organization *
                </label>
                <select
                  required
                  value={existingOrgId}
                  onChange={(e) => {
                    const orgId = e.target.value;
                    setExistingOrgId(orgId);
                    const found = assignableOrgs.find((o) => o.id === orgId);
                    if (found) setExistingTier(found.planCode);
                  }}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="">Select client organization...</option>
                  {assignableOrgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.instituteName} ({o.id} · {o.billingCycle})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trial Tier</label>
                <select
                  value={existingTier}
                  onChange={(e) => setExistingTier(e.target.value as PlanCode)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="STARTER">STARTER</option>
                  <option value="PRO">PRO</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  required
                  value={existingStart}
                  onChange={(e) => {
                    const next = e.target.value;
                    const prevDays = Math.max(1, countDaysBetween(existingStart, existingEnd));
                    setExistingStart(next);
                    if (next) setExistingEnd(addDaysStr(next, prevDays));
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-5">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Trial Duration Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setExistingEnd(addDaysStr(existingStart || todayStr(), days))}
                      className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                        countDaysBetween(existingStart, existingEnd) === days
                          ? 'bg-[#0032A0] text-white border-[#0032A0]'
                          : 'bg-white text-slate-700 border-[#E2E8F0] hover:border-[#0032A0]'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trial Expiry Date *</label>
                <input
                  type="date"
                  required
                  min={addDaysStr(existingStart, 1)}
                  value={existingEnd}
                  onChange={(e) => setExistingEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Student Cap (Opt.)</label>
                <input
                  type="number"
                  min={10}
                  value={existingStudentCap}
                  onChange={(e) => setExistingStudentCap(e.target.value)}
                  placeholder="Tier default"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Cap (Opt.)</label>
                <input
                  type="number"
                  min={5}
                  value={existingExamCap}
                  onChange={(e) => setExistingExamCap(e.target.value)}
                  placeholder="Tier default"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Trial Notes (shown in Admin Console)
                </label>
                <input
                  type="text"
                  value={existingNotes}
                  onChange={(e) => setExistingNotes(e.target.value)}
                  placeholder="e.g. 14-day pilot demo approved by SALAR Owner"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-60 shrink-0"
              >
                <CalendarPlus className="w-4 h-4" />
                {busy
                  ? 'Assigning Trial...'
                  : `Assign ${countDaysBetween(existingStart, existingEnd)}-Day Trial Plan`}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleProvisionNewTrial} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Institute Name *</label>
                <input
                  type="text"
                  required
                  value={newInstituteName}
                  onChange={(e) => setNewInstituteName(e.target.value)}
                  placeholder="e.g. Horizon PCMB Academy"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Client Admin Email *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@academy.in"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={newContactPerson}
                  onChange={(e) => setNewContactPerson(e.target.value)}
                  placeholder="Principal / Director"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={newMobile}
                  onChange={(e) => setNewMobile(e.target.value)}
                  placeholder="+91 98..."
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="Pune"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                <input
                  type="text"
                  value={newStateName}
                  onChange={(e) => setNewStateName(e.target.value)}
                  placeholder="Maharashtra"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trial Plan Tier</label>
                <select
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value as PlanCode)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="STARTER">STARTER</option>
                  <option value="PRO">PRO</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Portal Slot</label>
                <select
                  value={newAllocId}
                  onChange={(e) => setNewAllocId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="">Auto-assign / Auto-provision</option>
                  {availableAllocations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name} ({a.region})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Admin Passcode (Optional)
                </label>
                <input
                  type="text"
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  placeholder="Min 6 chars (optional)"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deployment</label>
                <select
                  value={newDeploymentType}
                  onChange={(e) => setNewDeploymentType(e.target.value as DeploymentType)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="SHARED_MULTI_TENANT">SHARED_MULTI_TENANT</option>
                  <option value="DEDICATED">DEDICATED</option>
                </select>
              </div>
              <div className="lg:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Trial Duration</label>
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setNewEnd(addDaysStr(newStart || todayStr(), days))}
                      className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                        countDaysBetween(newStart, newEnd) === days
                          ? 'bg-[#0032A0] text-white border-[#0032A0]'
                          : 'bg-white text-slate-700 border-[#E2E8F0] hover:border-[#0032A0]'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  required
                  value={newStart}
                  onChange={(e) => {
                    const next = e.target.value;
                    const prevDays = Math.max(1, countDaysBetween(newStart, newEnd));
                    setNewStart(next);
                    if (next) setNewEnd(addDaysStr(next, prevDays));
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trial End Date *</label>
                <input
                  type="date"
                  required
                  min={addDaysStr(newStart, 1)}
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0]">
              <p className="text-xs font-mono text-slate-500">
                Billing: TRIAL (₹0) · Period: {countDaysBetween(newStart, newEnd)} days
              </p>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                {busy ? 'Provisioning Trial Portal...' : 'Provision Trial Client Portal'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Trial Portals Registry */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All Trials (${trialRows.length})` },
                { id: 'ACTIVE', label: `Active (${metrics.active})` },
                { id: 'EXPIRING', label: `Expiring <=3d (${metrics.expiringSoon})` },
                { id: 'EXPIRED', label: `Expired (${metrics.expired})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTrialFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  trialFilter === tab.id ? 'bg-[#0032A0] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trial portal, email, slug..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredTrials.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">
              No trial portals match the selected filter. Assign a trial above to begin.
            </p>
          ) : (
            filteredTrials.map(({ org, lic, daysLeft }) => {
              const rem = daysLeft ?? 0;
              const fullUrl = getFullPortalUrl(org);
              return (
                <div key={org.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#0F172A] truncate">{org.instituteName}</p>
                      <p className="text-[11px] font-mono text-[#0032A0]">
                        {org.id} · {org.planCode} TRIAL
                      </p>
                      <p className="text-xs text-slate-500 truncate">{org.email}</p>
                    </div>
                    <span
                      className={`text-[11px] font-mono font-semibold shrink-0 ${
                        rem <= 0 ? 'text-red-600' : rem <= 3 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {rem <= 0 ? 'Expired' : `${rem}d left`}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-[#E2E8F0] text-xs font-mono space-y-1">
                    <p className="truncate text-[#0032A0]">{fullUrl}</p>
                    <p className="text-[11px] text-slate-600">
                      Window: {(lic?.activationDate || org.createdAt).slice(0, 10)} →{' '}
                      {lic ? lic.expirationDate.slice(0, 10) : '—'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleQuickExtend(org, 7)}
                      className="px-2.5 py-1.5 text-xs font-mono font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
                    >
                      +7d
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleQuickExtend(org, 14)}
                      className="px-2.5 py-1.5 text-xs font-mono font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
                    >
                      +14d
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(org)}
                      className="px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
                    >
                      Edit Dates
                    </button>
                    <button
                      type="button"
                      onClick={() => openConvertModal(org)}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                    >
                      Convert to Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => setShareOrg(org)}
                      className="p-1.5 border border-[#E2E8F0] rounded-lg text-slate-600"
                      title="Share Portal"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                <th className="py-3 px-4">Client &amp; Tier</th>
                <th className="py-3 px-4">Portal URL</th>
                <th className="py-3 px-4">Trial Window</th>
                <th className="py-3 px-4">Countdown &amp; Status</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4 text-right">Trial Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredTrials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs text-slate-500">
                    No trial portals match the selected filter. Assign a trial above to begin.
                  </td>
                </tr>
              ) : (
                filteredTrials.map(({ org, lic, alloc, daysLeft }) => {
                  const rem = daysLeft ?? 0;
                  const portalPath = getPortalPath(org);
                  const fullUrl = getFullPortalUrl(org);
                  return (
                    <tr key={org.id} className="hover:bg-slate-50/70 align-top">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-[#0F172A]">{org.instituteName}</p>
                        <p className="text-xs font-mono text-[#0032A0]">
                          {org.id} {alloc ? `· ${alloc.code}` : ''}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {org.planCode} · {org.studentCapacity} stu · {org.examCapacity} exams
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <a
                            href={portalPath}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono font-semibold text-[#0032A0] hover:underline truncate max-w-[190px]"
                          >
                            {fullUrl}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyPortalUrl(org.id, fullUrl)}
                            className="p-1 rounded border border-[#E2E8F0] text-slate-500 hover:text-[#0032A0]"
                            title="Copy Link"
                          >
                            {copiedId === org.id ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">{lic?.licenseKey || '—'}</p>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        <div>Start: {(lic?.activationDate || org.createdAt).slice(0, 10)}</div>
                        <div className="font-semibold text-[#0F172A]">
                          End: {lic ? lic.expirationDate.slice(0, 10) : '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                        <span
                          className={`inline-block font-semibold ${
                            rem <= 0
                              ? 'text-red-700'
                              : rem <= 3
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {rem <= 0 ? 'Expired' : `${rem} days left`}
                        </span>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {org.status} · {lic?.status || 'NONE'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 max-w-[200px]">
                        <span className="line-clamp-2">{lic?.notes || '—'}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleQuickExtend(org, 7)}
                            className="px-2 py-1 text-[11px] font-mono font-semibold border border-[#E2E8F0] rounded hover:bg-slate-50 text-slate-700"
                            title="Extend trial +7 days"
                          >
                            +7d
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleQuickExtend(org, 14)}
                            className="px-2 py-1 text-[11px] font-mono font-semibold border border-[#E2E8F0] rounded hover:bg-slate-50 text-slate-700"
                            title="Extend trial +14 days"
                          >
                            +14d
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(org)}
                            className="px-2.5 py-1 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50 text-slate-700"
                          >
                            Edit Dates
                          </button>
                          <button
                            type="button"
                            onClick={() => openConvertModal(org)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            Convert to Paid
                          </button>
                          <button
                            type="button"
                            onClick={() => setShareOrg(org)}
                            className="p-1.5 border border-[#E2E8F0] rounded-lg text-slate-600 hover:text-[#0032A0]"
                            title="Share Portal"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                          {org.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleToggleStatus(org, 'SUSPENDED')}
                              className="p-1.5 border border-amber-200 rounded-lg text-amber-700 hover:bg-amber-50"
                              title="Suspend Client"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleToggleStatus(org, 'ACTIVE')}
                              className="p-1.5 border border-emerald-200 rounded-lg text-emerald-700 hover:bg-emerald-50"
                              title="Activate Client"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Trial Dates Modal */}
      {editOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <p className="text-xs font-mono text-[#0032A0]">{editOrg.id}</p>
                <h3 className="font-display font-bold text-base text-[#0F172A]">
                  Edit Trial Window — {editOrg.instituteName}
                </h3>
              </div>
              <button type="button" onClick={() => setEditOrg(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditModal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trial Plan Tier</label>
                <select
                  value={editTier}
                  onChange={(e) => setEditTier(e.target.value as PlanCode)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="STARTER">STARTER</option>
                  <option value="PRO">PRO</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setEditEnd(addDaysStr(editStart || todayStr(), days))}
                    className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border ${
                      countDaysBetween(editStart, editEnd) === days
                        ? 'bg-[#0032A0] text-white border-[#0032A0]'
                        : 'bg-white text-slate-700 border-[#E2E8F0]'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trial Expiry Date *</label>
                  <input
                    type="date"
                    required
                    min={addDaysStr(editStart, 1)}
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setEditOrg(null)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  <Clock className="w-3.5 h-3.5" />
                  {busy ? 'Saving...' : 'Update Trial Window'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert Trial to Paid Plan Modal */}
      {convertOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <p className="text-xs font-mono text-[#0032A0]">{convertOrg.id} · UPGRADE TO PAID</p>
                <h3 className="font-display font-bold text-base text-[#0F172A]">
                  Convert Trial to Paid Plan — {convertOrg.instituteName}
                </h3>
              </div>
              <button type="button" onClick={() => setConvertOrg(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmConvert} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Paid Tier</label>
                  <select
                    value={convertTier}
                    onChange={(e) => setConvertTier(e.target.value as PlanCode)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="STARTER">STARTER</option>
                    <option value="PRO">PRO</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Cycle</label>
                  <select
                    value={convertCycle}
                    onChange={(e) => handleConvertCycleChange(e.target.value as BillingCycle)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="QUARTERLY">QUARTERLY</option>
                    <option value="YEARLY">YEARLY</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={convertStart}
                    onChange={(e) => {
                      const next = e.target.value;
                      const prevDays = Math.max(1, countDaysBetween(convertStart, convertEnd));
                      setConvertStart(next);
                      if (next) setConvertEnd(addDaysStr(next, prevDays));
                    }}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    min={addDaysStr(convertStart, 1)}
                    value={convertEnd}
                    onChange={(e) => setConvertEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contract Subtotal Override (INR, optional)
                </label>
                <input
                  type="number"
                  min={0}
                  value={convertCustomPrice}
                  onChange={(e) => setConvertCustomPrice(e.target.value)}
                  placeholder={`Default tier rate: ${formatCurrencyINR(estimatedPrice)}`}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                <input
                  type="checkbox"
                  checked={convertGenerateInvoice}
                  onChange={(e) => setConvertGenerateInvoice(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  Automatically issue a PENDING GST Subscription Invoice ({formatCurrencyINR(estimatedPrice)} +{' '}
                  {data.systemSettings.defaultGstPercent}% GST) for manual UPI / bank collection.
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setConvertOrg(null)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  {busy ? 'Converting...' : 'Confirm Conversion to Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {shareOrg && (
        <ShareClientPortalModal
          org={shareOrg}
          data={data}
          onClose={() => setShareOrg(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};
