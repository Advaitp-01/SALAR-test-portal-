import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  CalendarPlus,
  Check,
  Cloud,
  Copy,
  Database,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  Mail,
  MessageSquareShare,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Send,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import type {
  BillingCycle,
  DeploymentType,
  Organization,
  OwnerBootstrapData,
  PlanCode,
} from '../../types/salar';
import { ShareClientPortalModal } from './ShareClientPortalModal';

interface OwnerClientsViewProps {
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
  onReassignPortal?: (allocationId: string) => void;
}

export const OwnerClientsView: React.FC<OwnerClientsViewProps> = ({
  data,
  onRefresh,
  onReassignPortal,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [shareOrg, setShareOrg] = useState<Organization | null>(null);
  const [shareAutoInvite, setShareAutoInvite] = useState(false);
  const [domainOrg, setDomainOrg] = useState<Organization | null>(null);
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
  const [deleteCreateBackup, setDeleteCreateBackup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isProtectedOrg = (org: Organization) => org.id === 'SALAR-ORG-00001' || org.id === 'SALAR-ORG-TEST';

  // Create form state
  const [instituteName, setInstituteName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [country, setCountry] = useState('India');
  const [website, setWebsite] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [planCode, setPlanCode] = useState<PlanCode>('PRO');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [deploymentType, setDeploymentType] = useState<DeploymentType>('SHARED_MULTI_TENANT');
  const [portalAllocationId, setPortalAllocationId] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [initialAdminPasscode, setInitialAdminPasscode] = useState('');

  // Change Domain modal state
  const [editSlug, setEditSlug] = useState('');
  const [editSubdomain, setEditSubdomain] = useState('');
  const [editCustomDomain, setEditCustomDomain] = useState('');
  const [keepOldRedirect, setKeepOldRedirect] = useState(true);

  // Shareable portal link & passcode helpers
  const [lastCreatedOrg, setLastCreatedOrg] = useState<Organization | null>(null);
  const [lastCreatedPortalPath, setLastCreatedPortalPath] = useState('');
  const [lastCreatedPasscodeSet, setLastCreatedPasscodeSet] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [newClientPasscode, setNewClientPasscode] = useState('');
  const [passcodeSaving, setPasscodeSaving] = useState(false);

  const availableAllocations = data.portalAllocations.filter((a) => a.status === 'AVAILABLE');

  const getPortalPath = (org: Organization) =>
    org.portalPath || (org.id === 'SALAR-ORG-00001' ? '/' : `/p/${org.portalSlug || org.id}`);

  const getFullPortalUrl = (org: Organization) => `${window.location.origin}${getPortalPath(org)}`;

  const copyPortalUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2000);
    } catch {
      // ignore clipboard permissions
    }
  };

  const buildQuickInviteHref = (org: Organization, kind: 'whatsapp' | 'email') => {
    const url = getFullPortalUrl(org);
    const lic = data.licenses.find((l) => l.id === org.licenseId);
    const body = [
      `SALAR Tech — Client Portal Access`,
      `Institute: ${org.instituteName}`,
      `Portal URL: ${url}`,
      `License Key: ${lic?.licenseKey || 'Pending'}`,
      `Administrator Email: ${org.email}`,
      `Plan: ${org.planCode} (${org.billingCycle})`,
      `Open your Portal URL above and click Admin Gate to sign in.`,
    ].join('\n');
    if (kind === 'whatsapp') {
      return `https://wa.me/?text=${encodeURIComponent(body)}`;
    }
    return `mailto:${encodeURIComponent(org.email || '')}?subject=${encodeURIComponent(
      `${org.instituteName} — Client Portal Link & Access`
    )}&body=${encodeURIComponent(body)}`;
  };

  const filteredOrgs = data.organizations.filter((o) => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const lic = data.licenses.find((l) => l.id === o.licenseId);
    return (
      o.id.toLowerCase().includes(q) ||
      o.instituteName.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      o.city.toLowerCase().includes(q) ||
      (o.portalSlug || '').toLowerCase().includes(q) ||
      (o.subdomain || '').toLowerCase().includes(q) ||
      (lic?.licenseKey || '').toLowerCase().includes(q)
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const res = await salarApi.createOrganization({
        instituteName,
        shortCode: shortCode || undefined,
        contactPerson: contactPerson || undefined,
        email,
        mobile,
        country,
        state: stateName,
        city,
        website,
        customDomain: customDomain || undefined,
        planCode,
        billingCycle,
        deploymentType,
        portalAllocationId: portalAllocationId || undefined,
        customPrice: customPrice ? Number(customPrice) : null,
        initialAdminPasscode: initialAdminPasscode.trim() || undefined,
      });
      const portalPath = res.portalPath || res.organization.portalPath || `/p/${res.organization.portalSlug}`;
      const hadPasscode = Boolean(initialAdminPasscode.trim());
      setLastCreatedOrg(res.organization);
      setLastCreatedPortalPath(portalPath);
      setLastCreatedPasscodeSet(hadPasscode);
      setMessage(
        `Provisioned ${res.organization.instituteName} (${res.organization.id}) on database ${res.organization.databaseId || 'isolated'} with license ${res.license.licenseKey}. Exam Portal ready at ${window.location.origin}${portalPath} (Admin: ${res.organization.email}${hadPasscode ? ' · Passcode pre-configured' : ' · Claim Admin Gate on first visit'}).`
      );
      setCreateOpen(false);
      setInstituteName('');
      setShortCode('');
      setContactPerson('');
      setEmail('');
      setMobile('');
      setCity('');
      setStateName('');
      setWebsite('');
      setCustomDomain('');
      setCustomPrice('');
      setInitialAdminPasscode('');
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register client organization.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChangeDomain = (org: Organization) => {
    setError('');
    setEditSlug(org.portalSlug || '');
    setEditSubdomain(org.subdomain || '');
    setEditCustomDomain(org.customDomain || '');
    setKeepOldRedirect(true);
    setDomainOrg(org);
  };

  const handleSaveDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainOrg) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await salarApi.changeClientDomain(domainOrg.id, {
        portalSlug: domainOrg.id === 'SALAR-ORG-00001' ? undefined : editSlug.trim(),
        subdomain: editSubdomain.trim() || undefined,
        customDomain: editCustomDomain.trim(),
        keepOldRedirect,
      });
      setMessage(
        `Updated portal routing for ${res.organization.instituteName}: ${window.location.origin}${getPortalPath(
          res.organization
        )} (${res.organization.subdomain})`
      );
      setDomainOrg(null);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update client domain.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetClientPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setError('');
    setMessage('');
    if (newClientPasscode.trim().length < 6) {
      setError('Client Admin Gate passcode must be at least 6 characters.');
      return;
    }
    setPasscodeSaving(true);
    try {
      await salarApi.setClientAdminPasscode(selectedOrg.id, newClientPasscode.trim());
      setMessage(`Updated Admin Gate passcode for ${selectedOrg.instituteName} (${selectedOrg.id}).`);
      setNewClientPasscode('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set client admin passcode.');
    } finally {
      setPasscodeSaving(false);
    }
  };

  const handleToggleStatus = async (org: Organization, nextStatus: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED') => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await salarApi.updateOrganization(org.id, { status: nextStatus });
      setMessage(`Updated ${org.instituteName} status to ${nextStatus}.`);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update organization.');
    } finally {
      setSaving(false);
    }
  };

  const handleRenewLicense = async (org: Organization) => {
    if (!org.licenseId) {
      setError(`No active license record found for ${org.instituteName}.`);
      return;
    }
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const res = await salarApi.renewLicense(org.licenseId);
      setMessage(
        `Renewed license ${res.license.licenseKey} for ${org.instituteName} until ${res.license.expirationDate.slice(
          0,
          10
        )} (portal restored).`
      );
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to renew client license.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDelete = (org: Organization) => {
    setError('');
    setDeleteCreateBackup(false);
    setDeleteOrg(org);
  };

  const handleConfirmDelete = async () => {
    if (!deleteOrg) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const res = await salarApi.deleteOrganization(deleteOrg.id, { createBackup: deleteCreateBackup });
      if (lastCreatedOrg?.id === deleteOrg.id) {
        setLastCreatedOrg(null);
        setLastCreatedPortalPath('');
      }
      if (selectedOrg?.id === deleteOrg.id) {
        setSelectedOrg(null);
      }
      const freedText =
        res.freedAllocCodes && res.freedAllocCodes.length > 0
          ? ` Released allocation ${res.freedAllocCodes.join(', ')} back to AVAILABLE.`
          : '';
      const bkpText = res.backupArchiveName ? ` Backup saved: ${res.backupArchiveName}.` : '';
      setMessage(`Deleted client ${deleteOrg.instituteName} (${deleteOrg.id}) and its isolated database.${freedText}${bkpText}`);
      setDeleteOrg(null);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete client organization.');
    } finally {
      setSaving(false);
    }
  };

  const persistence = data.persistenceStatus || data.infrastructure.persistenceStatus;

  const handleExportSnapshot = async () => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const bundle = await salarApi.exportPersistenceSnapshot();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salar-platform-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage('Downloaded portable SALAR platform snapshot (.json) containing all registered clients, licenses, and tenant portals.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export platform snapshot.');
    } finally {
      setSaving(false);
    }
  };

  const handleImportSnapshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const res = await salarApi.importPersistenceSnapshot(parsed);
      setMessage(
        `Restored ${res.organizationsCount} client organization(s) and ${res.tenantsCount} tenant store(s) from snapshot.`
      );
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid or corrupted platform snapshot file.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {persistence && !persistence.persistent && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-bold text-amber-950">
                  Ephemeral Vercel Storage Active (/tmp) — Connect Cloud KV or Blob for Permanent Client Persistence
                </p>
                <p className="mt-0.5 text-amber-900">
                  Registered clients live in temporary serverless memory until you attach a persistent store. Add{' '}
                  <span className="font-mono font-semibold">UPSTASH_REDIS_REST_URL</span> +{' '}
                  <span className="font-mono font-semibold">UPSTASH_REDIS_REST_TOKEN</span> (or{' '}
                  <span className="font-mono font-semibold">KV_REST_API_URL</span> +{' '}
                  <span className="font-mono font-semibold">KV_REST_API_TOKEN</span>, or{' '}
                  <span className="font-mono font-semibold">BLOB_READ_WRITE_TOKEN</span>) in Vercel Project Settings &gt; Environment Variables and redeploy so registered clients never vanish on refresh.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={saving}
                onClick={handleExportSnapshot}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                <Download className="w-3.5 h-3.5" />
                Download Snapshot
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-900 text-white rounded-lg text-xs font-semibold hover:bg-amber-950 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Restore Snapshot
                <input type="file" accept="application/json,.json" onChange={handleImportSnapshot} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      )}

      {persistence && persistence.persistent && persistence.isVercel && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              <span className="font-semibold">Cloud Persistence Active:</span> {persistence.providerLabel}
              {persistence.lastSyncedAt ? ` · Synced ${new Date(persistence.lastSyncedAt).toLocaleTimeString()}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleExportSnapshot}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <Download className="w-3 h-3" />
              Export Snapshot
            </button>
            <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer">
              <Upload className="w-3 h-3" />
              Restore Snapshot
              <input type="file" accept="application/json,.json" onChange={handleImportSnapshot} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex flex-wrap items-center justify-between gap-2">
          <span>{message}</span>
          {lastCreatedPortalPath && (
            <div className="inline-flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => copyPortalUrl('banner', `${window.location.origin}${lastCreatedPortalPath}`)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                {copiedId === 'banner' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedId === 'banner' ? 'Copied Link' : 'Copy Portal Link'}
              </button>
              {lastCreatedOrg && (
                <button
                  type="button"
                  onClick={() => {
                    setShareAutoInvite(false);
                    setShareOrg(lastCreatedOrg);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <Share2 className="w-3 h-3" />
                  Share Portal
                </button>
              )}
              <a
                href={lastCreatedPortalPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0032A0] text-white rounded font-semibold hover:bg-[#00257a]"
                title={lastCreatedPasscodeSet ? 'Open Client Exam Portal' : 'Open Portal & Claim Admin Gate'}
              >
                <ExternalLink className="w-3 h-3" />
                Open Client Exam Portal
              </a>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
      )}

      {/* Toolbar */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 min-w-0">
          <div className="relative flex-1 min-w-0 sm:min-w-[220px] max-w-md w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search institute, org ID, license key, portal slug..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0032A0]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full sm:w-auto px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <a
            href="/p/salar-test"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2.5 sm:py-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#0032A0] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4" />
            Open SALAR Portal Test
          </a>
          <button
            type="button"
            onClick={() => {
              setError('');
              setCreateOpen(true);
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-[#0032A0] hover:bg-[#00257a] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Register Client Organization
          </button>
        </div>
      </div>

      {/* Mobile Card List (< md) */}
      <div className="md:hidden space-y-3">
        {filteredOrgs.map((org) => {
          const lic = data.licenses.find((l) => l.id === org.licenseId);
          const tenant = data.tenants.find((t) => t.id === org.tenantId);
          const alloc = data.portalAllocations.find((a) => a.id === org.portalAllocationId);
          const binding = data.portalBindings?.find((b) => b.organizationId === org.id);
          const portalPath = getPortalPath(org);
          const fullPortalUrl = getFullPortalUrl(org);
          const dbId = org.databaseId || tenant?.databaseId || binding?.databaseId || 'salar_tenant_001';
          const dbStatus = binding?.databaseStatus || (org.status === 'ACTIVE' ? tenant?.status || 'ACTIVE' : org.status);
          const effectiveLicenseStatus = binding?.licenseStatus || lic?.status || 'NONE';

          return (
            <div key={org.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-[#0F172A] truncate">{org.instituteName}</p>
                  <p className="text-[11px] font-mono text-[#0032A0]">
                    {org.id} {alloc ? `· ${alloc.code}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {org.email} · {org.planCode}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                    effectiveLicenseStatus === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700'
                      : effectiveLicenseStatus === 'REVOKED'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {effectiveLicenseStatus}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-[#E2E8F0] space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={portalPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-semibold text-[#0032A0] hover:underline truncate"
                  >
                    {fullPortalUrl}
                  </a>
                  <button
                    type="button"
                    onClick={() => copyPortalUrl(`m-${org.id}`, fullPortalUrl)}
                    className="p-1.5 rounded border border-[#E2E8F0] bg-white text-slate-600 shrink-0"
                    title="Copy Portal Link"
                  >
                    {copiedId === `m-${org.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600 pt-1 border-t border-slate-200/80">
                  <span className="truncate">Key: {lic?.licenseKey || '—'}</span>
                  <span className="text-right">Exp: {lic ? lic.expirationDate.slice(0, 10) : '—'}</span>
                  <span className="truncate">DB: {dbId} ({dbStatus})</span>
                  <span className="text-right">Client: {org.status}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <a
                  href={portalPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setShareAutoInvite(false);
                    setShareOrg(org);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg text-[#0032A0]"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
                <a
                  href={buildQuickInviteHref(org, 'whatsapp')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg border border-emerald-200 text-emerald-700"
                  title="Share on WhatsApp"
                >
                  <MessageSquareShare className="w-3.5 h-3.5" />
                </a>
                <a
                  href={buildQuickInviteHref(org, 'email')}
                  className="p-2 rounded-lg border border-[#E2E8F0] text-slate-600"
                  title="Share by Email"
                >
                  <Mail className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => handleOpenChangeDomain(org)}
                  className="p-2 rounded-lg border border-[#E2E8F0] text-slate-600"
                  title="Change Domain"
                >
                  <Globe className="w-3.5 h-3.5" />
                </button>
                {onReassignPortal && org.portalAllocationId && (
                  <button
                    type="button"
                    onClick={() => onReassignPortal(org.portalAllocationId!)}
                    className="p-2 rounded-lg border border-[#E2E8F0] text-slate-600"
                    title="Reassign Portal"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                {org.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleStatus(org, 'SUSPENDED')}
                    className="p-2 rounded-lg border border-amber-200 text-amber-700"
                    title="Suspend Client"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                  </button>
                ) : org.status === 'SUSPENDED' ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleStatus(org, 'ACTIVE')}
                    className="p-2 rounded-lg border border-emerald-200 text-emerald-700"
                    title="Activate Client"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                  </button>
                ) : null}
                {lic && lic.status !== 'REVOKED' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleRenewLicense(org)}
                    className="p-2 rounded-lg border border-[#E2E8F0] text-[#0032A0]"
                    title="Renew License"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                  </button>
                )}
                {!isProtectedOrg(org) && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleOpenDelete(org)}
                    className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                    title="Delete Client"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedOrg(org)}
                  className="ml-auto px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Inspect
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Client License & Portal Binding Table (md+) */}
      <div className="hidden md:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                <th className="py-3 px-4">Client Name</th>
                <th className="py-3 px-4">License Key</th>
                <th className="py-3 px-4">Client Portal URL</th>
                <th className="py-3 px-4">Database Status</th>
                <th className="py-3 px-4">License Status</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredOrgs.map((org) => {
                const lic = data.licenses.find((l) => l.id === org.licenseId);
                const tenant = data.tenants.find((t) => t.id === org.tenantId);
                const alloc = data.portalAllocations.find((a) => a.id === org.portalAllocationId);
                const binding = data.portalBindings?.find((b) => b.organizationId === org.id);
                const portalPath = getPortalPath(org);
                const fullPortalUrl = getFullPortalUrl(org);
                const dbId = org.databaseId || tenant?.databaseId || binding?.databaseId || 'salar_tenant_001';
                const dbStatus = binding?.databaseStatus || (org.status === 'ACTIVE' ? tenant?.status || 'ACTIVE' : org.status);
                const effectiveLicenseStatus = binding?.licenseStatus || lic?.status || 'NONE';

                return (
                  <tr key={org.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-[#0F172A]">{org.instituteName}</p>
                      <p className="text-xs font-mono text-[#0032A0]">
                        {org.id} {alloc ? `· ${alloc.code}` : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {org.email} · {org.planCode}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="text-xs font-mono font-semibold text-[#0F172A]">
                        {lic?.licenseKey || '—'}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500">
                        {org.billingCycle} · {org.studentCapacity} stu
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={portalPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono font-semibold text-[#0032A0] hover:underline truncate max-w-[200px]"
                          title={fullPortalUrl}
                        >
                          {fullPortalUrl}
                        </a>
                        <button
                          type="button"
                          onClick={() => copyPortalUrl(org.id, fullPortalUrl)}
                          className="p-1 rounded border border-[#E2E8F0] text-slate-500 hover:text-[#0032A0] hover:bg-slate-50 shrink-0"
                          title="Copy Portal Link"
                        >
                          {copiedId === org.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {org.subdomain}
                        {binding?.domainStatus ? ` · ${binding.domainStatus}` : ''}
                      </p>
                      {org.customDomain && (
                        <p className="text-[11px] font-mono text-[#0032A0]">{org.customDomain}</p>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-[#0F172A]">
                        <Database className="w-3.5 h-3.5 text-[#0032A0]" />
                        <span>{dbId}</span>
                      </div>
                      <p className="mt-1">
                        <span
                          className={`inline-block text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                            dbStatus === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : dbStatus === 'SUSPENDED'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {dbStatus}
                        </span>
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                          effectiveLicenseStatus === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : effectiveLicenseStatus === 'SUSPENDED' || effectiveLicenseStatus === 'EXPIRED'
                            ? 'bg-amber-50 text-amber-800'
                            : effectiveLicenseStatus === 'REVOKED'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {effectiveLicenseStatus}
                      </span>
                      <p className="text-[11px] font-mono text-slate-500 mt-1">Client: {org.status}</p>
                    </td>

                    <td className="py-3.5 px-4 text-xs font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {lic ? lic.expirationDate.slice(0, 10) : '—'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex flex-wrap justify-end items-center gap-1 max-w-[260px]">
                        <button
                          type="button"
                          onClick={() => copyPortalUrl(`act-${org.id}`, fullPortalUrl)}
                          className="p-1.5 rounded border border-[#E2E8F0] text-slate-600 hover:text-[#0032A0] hover:bg-slate-50"
                          title="Copy Portal Link"
                        >
                          {copiedId === `act-${org.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <a
                          href={portalPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded border border-[#E2E8F0] text-slate-600 hover:text-[#0032A0] hover:bg-slate-50"
                          title="Open Client Portal"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        <a
                          href={buildQuickInviteHref(org, 'whatsapp')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          title="Share on WhatsApp"
                        >
                          <MessageSquareShare className="w-3.5 h-3.5" />
                        </a>

                        <a
                          href={buildQuickInviteHref(org, 'email')}
                          className="p-1.5 rounded border border-[#E2E8F0] text-slate-600 hover:text-[#0032A0] hover:bg-slate-50"
                          title="Share by Email"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            setShareAutoInvite(true);
                            setShareOrg(org);
                          }}
                          className="p-1.5 rounded border border-[#E2E8F0] text-[#0032A0] hover:bg-blue-50"
                          title="Generate Admin Invitation & Share Portal"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenChangeDomain(org)}
                          className="p-1.5 rounded border border-[#E2E8F0] text-slate-600 hover:text-[#0032A0] hover:bg-slate-50"
                          title="Change Domain / Portal URL"
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </button>

                        {onReassignPortal && org.portalAllocationId && (
                          <button
                            type="button"
                            onClick={() => onReassignPortal(org.portalAllocationId!)}
                            className="p-1.5 rounded border border-[#E2E8F0] text-slate-600 hover:text-[#0032A0] hover:bg-slate-50"
                            title="Reassign Portal Allocation"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {org.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleToggleStatus(org, 'SUSPENDED')}
                            className="p-1.5 rounded border border-amber-200 text-amber-700 hover:bg-amber-50"
                            title="Suspend Client"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                          </button>
                        ) : org.status === 'SUSPENDED' ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleToggleStatus(org, 'ACTIVE')}
                            className="p-1.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            title="Activate Client"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                          </button>
                        ) : null}

                        {lic && lic.status !== 'REVOKED' && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleRenewLicense(org)}
                            className="p-1.5 rounded border border-[#E2E8F0] text-[#0032A0] hover:bg-blue-50"
                            title="Renew License"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {!isProtectedOrg(org) && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleOpenDelete(org)}
                            className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                            title="Delete Client"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setShareAutoInvite(false);
                            setShareOrg(org);
                          }}
                          className="px-2 py-1 text-[11px] font-semibold border border-[#E2E8F0] rounded hover:bg-slate-50 text-[#0032A0]"
                        >
                          Share
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedOrg(org)}
                          className="px-2 py-1 text-[11px] font-semibold border border-[#E2E8F0] rounded hover:bg-slate-50"
                        >
                          Inspect
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

      {/* Share Client Portal Modal */}
      <ShareClientPortalModal
        org={shareOrg}
        data={data}
        autoGenerateInvite={shareAutoInvite}
        onClose={() => {
          setShareOrg(null);
          setShareAutoInvite(false);
        }}
        onRefresh={onRefresh}
      />

      {/* Change Domain / Portal URL Modal */}
      {domainOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <p className="text-xs font-mono text-[#0032A0]">{domainOrg.id}</p>
                <h3 className="font-display font-bold text-base text-[#0F172A]">
                  Change Portal URL &amp; Domain — {domainOrg.instituteName}
                </h3>
              </div>
              <button type="button" onClick={() => setDomainOrg(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveDomain} className="space-y-3.5">
              {domainOrg.id !== 'SALAR-ORG-00001' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Verified App Portal Slug (`/p/&lt;slug&gt;`)
                  </label>
                  <input
                    type="text"
                    required
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
                    placeholder="apex-iit-academy"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Platform Subdomain
                </label>
                <input
                  type="text"
                  value={editSubdomain}
                  onChange={(e) => setEditSubdomain(e.target.value.toLowerCase())}
                  placeholder="apex.salartech.com"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client Custom Domain (Optional)
                </label>
                <input
                  type="text"
                  value={editCustomDomain}
                  onChange={(e) => setEditCustomDomain(e.target.value.toLowerCase())}
                  placeholder="portal.apexacademy.in"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepOldRedirect}
                  onChange={(e) => setKeepOldRedirect(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  Keep redirect active from the previous portal URL to the new URL cleanly.
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setDomainOrg(null)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  {saving ? 'Updating...' : 'Save Domain Routing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Organization Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[92dvh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#0032A0]" />
                <h2 className="font-display font-bold text-base text-[#0F172A]">
                  Register Client Organization
                </h2>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Institute Name *</label>
                  <input
                    type="text"
                    required
                    value={instituteName}
                    onChange={(e) => setInstituteName(e.target.value)}
                    placeholder="e.g. Apex IIT Academy"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Short Code</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={shortCode}
                    onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                    placeholder="APX"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Director name"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Email *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@institute.com"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile</label>
                  <input
                    type="text"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+91 98XXXXXXXX"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Domain (Optional)</label>
                  <input
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="portal.apexacademy.in"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Website</label>
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Plan</label>
                  <select
                    value={planCode}
                    onChange={(e) => setPlanCode(e.target.value as PlanCode)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    {data.licensePlans.map((p) => (
                      <option key={p.id} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Cycle</label>
                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Deployment</label>
                  <select
                    value={deploymentType}
                    onChange={(e) => setDeploymentType(e.target.value as DeploymentType)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="SHARED_MULTI_TENANT">Shared Multi-Tenant</option>
                    <option value="DEDICATED">Dedicated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Price (INR)</label>
                  <input
                    type="number"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="Plan default"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Portal Allocation Slot ({availableAllocations.length} available)
                  </label>
                  <select
                    value={portalAllocationId}
                    onChange={(e) => setPortalAllocationId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="">Auto-assign matching available allocation</option>
                    {availableAllocations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name} ({a.deploymentType}, {a.capacityStudents} students)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Client Admin Passcode (Optional)
                  </label>
                  <input
                    type="text"
                    value={initialAdminPasscode}
                    onChange={(e) => setInitialAdminPasscode(e.target.value)}
                    placeholder="Min 6 chars (or client claims on first visit)"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || availableAllocations.length === 0}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] rounded-lg disabled:opacity-60"
                >
                  {saving ? 'Provisioning Client...' : 'Create Client, Tenant & Signed License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Organization Drawer/Modal */}
      {selectedOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <p className="text-xs font-mono text-[#0032A0]">{selectedOrg.id}</p>
                <h3 className="font-display font-bold text-lg text-[#0F172A]">{selectedOrg.instituteName}</h3>
              </div>
              <button type="button" onClick={() => setSelectedOrg(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 space-y-1.5 text-xs">
              <p className="text-[11px] font-mono font-semibold text-[#0032A0] uppercase">
                Dedicated Client Portal Link
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-[#0F172A] truncate">
                  {getFullPortalUrl(selectedOrg)}
                </span>
                <button
                  type="button"
                  onClick={() => copyPortalUrl('inspect', getFullPortalUrl(selectedOrg))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-blue-200 rounded font-semibold text-[#0032A0] shrink-0"
                >
                  {copiedId === 'inspect' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedId === 'inspect' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                <p className="text-slate-500">Independent Database ID</p>
                <p className="font-mono font-semibold text-[#0F172A] mt-0.5">
                  {selectedOrg.databaseId || 'salar_tenant_001'}
                </p>
                <p className="text-[11px] font-mono text-slate-400">{selectedOrg.tenantId}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                <p className="text-slate-500">Portal Subdomain &amp; Allocation</p>
                <p className="font-mono font-semibold text-[#0F172A] mt-0.5 break-all">{selectedOrg.subdomain}</p>
                <p className="text-[11px] font-mono text-slate-400">{selectedOrg.portalAllocationId || 'Unbound'}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                <p className="text-slate-500">Administrator Account</p>
                <p className="font-semibold text-[#0F172A] mt-0.5">{selectedOrg.contactPerson}</p>
                <p className="text-slate-600 break-all">{selectedOrg.email}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                <p className="text-slate-500">Capacity Limits</p>
                <p className="font-mono text-[#0F172A] mt-0.5">
                  {selectedOrg.studentCapacity} students · {selectedOrg.examCapacity} exams
                </p>
              </div>
            </div>
            {selectedOrg.id !== 'SALAR-ORG-00001' && (
              <form
                onSubmit={handleSetClientPasscode}
                className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0] space-y-2"
              >
                <label className="block text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#0032A0]" />
                  Set / Reset Client Admin Gate Passcode
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="text"
                    value={newClientPasscode}
                    onChange={(e) => setNewClientPasscode(e.target.value)}
                    placeholder="Enter new passcode (min 6 chars)"
                    className="flex-1 px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg bg-white"
                  />
                  <button
                    type="submit"
                    disabled={passcodeSaving}
                    className="px-3 py-2 text-xs font-semibold bg-[#0F172A] text-white rounded-lg hover:bg-slate-800 disabled:opacity-60 shrink-0"
                  >
                    {passcodeSaving ? 'Saving...' : 'Update Passcode'}
                  </button>
                </div>
              </form>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/owner/organizations/${encodeURIComponent(selectedOrg.id)}/export`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50 text-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Tenant JSON
                </a>
                {!isProtectedOrg(selectedOrg) && (
                  <button
                    type="button"
                    onClick={() => {
                      const o = selectedOrg;
                      setSelectedOrg(null);
                      handleOpenDelete(o);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Client
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const o = selectedOrg;
                    setSelectedOrg(null);
                    setShareAutoInvite(false);
                    setShareOrg(o);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50 text-[#0032A0]"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share Portal
                </button>
                <a
                  href={getPortalPath(selectedOrg)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Portal
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedOrg(null)}
                  className="px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Client Organization Confirmation Modal */}
      {deleteOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md p-5 sm:p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs font-mono font-semibold text-red-600 uppercase">Delete Client Organization</p>
                  <h3 className="font-display font-bold text-base text-[#0F172A] mt-0.5">
                    {deleteOrg.instituteName}
                  </h3>
                  <p className="text-xs font-mono text-slate-500">
                    {deleteOrg.id} · DB: {deleteOrg.databaseId || deleteOrg.tenantId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteOrg(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-red-50/70 border border-red-200 text-xs text-red-800 space-y-1">
              <p className="font-semibold">This permanently deletes:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Client portal routing ({getPortalPath(deleteOrg)}) and domain bindings</li>
                <li>Independent tenant database ({deleteOrg.databaseId || deleteOrg.tenantId}) and all tenant records</li>
                <li>Assigned license, subscriptions, and active client sessions</li>
              </ul>
              {deleteOrg.portalAllocationId && (
                <p className="pt-1 text-emerald-800 font-semibold">
                  Allocation slot ({deleteOrg.portalAllocationId}) will be released back to AVAILABLE for reuse.
                </p>
              )}
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteCreateBackup}
                onChange={(e) => setDeleteCreateBackup(e.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>Create an encrypted AES-256-GCM backup archive before deleting this client.</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeleteOrg(null)}
                className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {saving ? 'Deleting Client...' : 'Delete Client Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
