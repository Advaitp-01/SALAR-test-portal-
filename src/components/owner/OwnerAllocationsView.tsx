import React, { useEffect, useState } from 'react';
import {
  Activity,
  Archive,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Plus,
  ShieldAlert,
  X,
} from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import type {
  BillingCycle,
  DeploymentType,
  OwnerBootstrapData,
  PlanCode,
  PortalAllocation,
  ReassignmentStepReport,
} from '../../types/salar';

interface OwnerAllocationsViewProps {
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
  initialReassignAllocationId?: string | null;
  onClearInitialReassign?: () => void;
}

export const OwnerAllocationsView: React.FC<OwnerAllocationsViewProps> = ({
  data,
  onRefresh,
  initialReassignAllocationId,
  onClearInitialReassign,
}) => {
  const [addOpen, setAddOpen] = useState(false);
  const [reassignAlloc, setReassignAlloc] = useState<PortalAllocation | null>(null);
  const [stepsReport, setStepsReport] = useState<ReassignmentStepReport[] | null>(null);
  const [lastExportName, setLastExportName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!initialReassignAllocationId) return;
    const found = data.portalAllocations.find((a) => a.id === initialReassignAllocationId);
    if (found) {
      setErr('');
      setStepsReport(null);
      setReassignedPortalPath('');
      setAuthorizedRelease(false);
      setForceWaiveDues(false);
      setReassignAlloc(found);
      if (onClearInitialReassign) onClearInitialReassign();
    }
  }, [initialReassignAllocationId, data.portalAllocations, onClearInitialReassign]);

  // Add allocation state
  const [allocName, setAllocName] = useState('');
  const [depType, setDepType] = useState<DeploymentType>('SHARED_MULTI_TENANT');
  const [region, setRegion] = useState('asia-east1');
  const [envStage, setEnvStage] = useState<'development' | 'staging' | 'production'>('production');
  const [capStudents, setCapStudents] = useState('1500');
  const [capExams, setCapExams] = useState('500');

  // 18-Step Reassignment Engine modal state
  const [authorizedRelease, setAuthorizedRelease] = useState(false);
  const [forceWaiveDues, setForceWaiveDues] = useState(false);
  const [releaseReason, setReleaseReason] = useState('Contract closed cleanly; authorized transfer of portal capacity.');
  const [targetMode, setTargetMode] = useState<'NEW_CLIENT' | 'EXISTING_CLIENT' | 'RELEASE_ONLY'>('NEW_CLIENT');
  const [targetOrgId, setTargetOrgId] = useState('');
  const [newInstituteName, setNewInstituteName] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newPlanCode, setNewPlanCode] = useState<PlanCode>('PRO');
  const [newBillingCycle, setNewBillingCycle] = useState<BillingCycle>('YEARLY');
  const [newAdminPasscode, setNewAdminPasscode] = useState('');
  const [reassignedPortalPath, setReassignedPortalPath] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const copyUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleAddAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.createAllocation({
        name: allocName || undefined,
        deploymentType: depType,
        region,
        environment: envStage,
        capacityStudents: Number(capStudents) || 1500,
        capacityExams: Number(capExams) || 500,
        capacityStorageMb: 20480,
      });
      setMsg(`Added reusable infrastructure slot ${res.allocation.code}.`);
      setAddOpen(false);
      setAllocName('');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create portal allocation.');
    } finally {
      setBusy(false);
    }
  };

  const handleHealthCheck = async (alloc: PortalAllocation) => {
    setBusy(true);
    setErr('');
    try {
      const res = await salarApi.checkAllocationHealth(alloc.id);
      setMsg(
        `Health probe for ${res.allocation.code}: ${res.allocation.healthStatus} (RAM ${res.infrastructure.memoryPercent}%, CPU ${res.infrastructure.cpuLoadPercent}%).`
      );
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Health probe failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignAlloc) return;
    setBusy(true);
    setErr('');
    setMsg('');
    setStepsReport(null);
    try {
      const res = await salarApi.reassignAllocation(reassignAlloc.id, {
        authorizedRelease,
        forceWaiveDues,
        releaseReason,
        targetMode,
        targetOrganizationId: targetMode === 'EXISTING_CLIENT' ? targetOrgId : undefined,
        newInstituteName: targetMode === 'NEW_CLIENT' ? newInstituteName : undefined,
        newContactPerson: targetMode === 'NEW_CLIENT' ? newContactPerson : undefined,
        newEmail: targetMode === 'NEW_CLIENT' ? newEmail : undefined,
        newMobile: targetMode === 'NEW_CLIENT' ? newMobile : undefined,
        newCity: targetMode === 'NEW_CLIENT' ? newCity : undefined,
        newPlanCode,
        newBillingCycle,
        initialAdminPasscode: targetMode === 'NEW_CLIENT' && newAdminPasscode.trim() ? newAdminPasscode.trim() : undefined,
      });
      setStepsReport(res.stepsReport);
      setLastExportName(res.exportArchiveName || '');
      const portalPath = res.newOrganization?.portalPath || '';
      setReassignedPortalPath(portalPath);
      setNewAdminPasscode('');
      setMsg(
        targetMode === 'RELEASE_ONLY'
          ? `${res.allocation.code} safely released to AVAILABLE pool.`
          : `${res.allocation.code} reassigned cleanly to ${res.newOrganization?.instituteName} (${res.licenseKey}).${portalPath ? ` Portal URL: ${window.location.origin}${portalPath}` : ''}`
      );
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Portal reassignment failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>}

      {/* Top Action Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-base text-[#0F172A]">
            Reusable Portal Allocation Pool &amp; 18-Step Reassignment Engine
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Safely transfer infrastructure slots between coaching institutes with zero tenant data leakage.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Portal Capacity Slot
        </button>
      </div>

      {/* Allocation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {data.portalAllocations.map((alloc) => {
          const boundOrg = alloc.currentOrganizationId
            ? data.organizations.find((o) => o.id === alloc.currentOrganizationId)
            : null;
          return (
            <div
              key={alloc.id}
              className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-mono font-bold text-[#0032A0]">{alloc.code}</span>
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                      alloc.status === 'ASSIGNED'
                        ? 'bg-blue-50 text-[#0032A0]'
                        : alloc.status === 'AVAILABLE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {alloc.status}
                  </span>
                </div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">{alloc.name}</h3>
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  {alloc.deploymentType} · {alloc.region} · {alloc.environment}
                </p>

                <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-[#E2E8F0] space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Client</span>
                    <span className="font-semibold text-[#0F172A] truncate max-w-[160px]">
                      {boundOrg ? boundOrg.instituteName : 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Capacity</span>
                    <span className="font-mono text-[#0F172A] tabular-nums">
                      {alloc.capacityStudents} stu · {alloc.capacityExams} exams
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Health &amp; Transfers</span>
                    <span className="font-mono text-emerald-700 tabular-nums">
                      {alloc.healthStatus} · {alloc.reassignmentCount}x
                    </span>
                  </div>
                  {boundOrg && (
                    <div className="pt-1.5 mt-1.5 border-t border-slate-200 flex items-center justify-between gap-2">
                      <a
                        href={boundOrg.portalPath || (boundOrg.id === 'SALAR-ORG-00001' ? '/' : `/p/${boundOrg.portalSlug || boundOrg.id}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono font-semibold text-[#0032A0] hover:underline truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        {boundOrg.portalPath || `/p/${boundOrg.portalSlug || boundOrg.id}`}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          copyUrl(
                            alloc.id,
                            `${window.location.origin}${boundOrg.portalPath || (boundOrg.id === 'SALAR-ORG-00001' ? '/' : `/p/${boundOrg.portalSlug || boundOrg.id}`)}`
                          )
                        }
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-[#E2E8F0] rounded text-[11px] font-semibold text-slate-700 hover:bg-slate-100 shrink-0"
                      >
                        {copiedId === alloc.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedId === alloc.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleHealthCheck(alloc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50 text-slate-700"
                >
                  <Activity className="w-3.5 h-3.5 text-[#0032A0]" />
                  Probe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErr('');
                    setStepsReport(null);
                    setReassignedPortalPath('');
                    setAuthorizedRelease(false);
                    setForceWaiveDues(false);
                    setTargetMode(alloc.status === 'AVAILABLE' ? 'NEW_CLIENT' : 'NEW_CLIENT');
                    setReassignAlloc(alloc);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0F172A] hover:bg-slate-800 text-white rounded-lg"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  {alloc.status === 'ASSIGNED' ? 'Release / Reassign' : 'Assign Client'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Archived Tenants Retention Registry */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-[#0032A0]" />
            <h3 className="font-display font-bold text-sm text-[#0F172A]">
              Archived Tenants &amp; Reassignment Export Bundles ({data.archivedTenants.length})
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Retained per {data.systemSettings.retentionDays}-day policy
          </span>
        </div>

        {data.archivedTenants.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No tenants have been archived from portal reassignments yet.
          </p>
        ) : (
          <div className="space-y-2">
            {data.archivedTenants.map((arch) => {
              const matchingBkp = data.backupJobs.find((b) => b.archiveName === arch.exportArchiveName);
              return (
                <div
                  key={`${arch.tenantId}-${arch.archivedAt}`}
                  className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-[#0F172A]">
                      {arch.organizationName} ({arch.organizationId})
                    </p>
                    <p className="font-mono text-slate-500">
                      Tenant: {arch.tenantId} · Archived: {new Date(arch.archivedAt).toLocaleString()}
                    </p>
                  </div>
                  {matchingBkp && (
                    <a
                      href={`/api/owner/backups/${encodeURIComponent(matchingBkp.id)}/download`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-[#0032A0] bg-white border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Archive
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Capacity Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0032A0]" />
                <h3 className="font-display font-bold text-base text-[#0F172A]">Add Portal Allocation Slot</h3>
              </div>
              <button type="button" onClick={() => setAddOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddAllocation} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Allocation Label</label>
                <input
                  type="text"
                  value={allocName}
                  onChange={(e) => setAllocName(e.target.value)}
                  placeholder="e.g. Dedicated South Node"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Deployment Type</label>
                  <select
                    value={depType}
                    onChange={(e) => setDepType(e.target.value as DeploymentType)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="SHARED_MULTI_TENANT">SHARED_MULTI_TENANT</option>
                    <option value="DEDICATED">DEDICATED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Environment</label>
                  <select
                    value={envStage}
                    onChange={(e) => setEnvStage(e.target.value as typeof envStage)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="production">production</option>
                    <option value="staging">staging</option>
                    <option value="development">development</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Region</label>
                  <input
                    type="text"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Students Cap</label>
                  <input
                    type="number"
                    value={capStudents}
                    onChange={(e) => setCapStudents(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Exams Cap</label>
                  <input
                    type="number"
                    value={capExams}
                    onChange={(e) => setCapExams(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg">
                  {busy ? 'Creating...' : 'Create Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 18-Step Portal Reassignment Wizard Modal */}
      {reassignAlloc && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[92dvh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <p className="text-xs font-mono text-[#0032A0]">{reassignAlloc.code} · 18-STEP ENGINE</p>
                <h3 className="font-display font-bold text-base text-[#0F172A]">
                  Safe Infrastructure Reassignment &amp; Tenant Isolation
                </h3>
              </div>
              <button type="button" onClick={() => setReassignAlloc(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {stepsReport ? (
              <div className="p-6 space-y-4">
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium space-y-2">
                  <div>
                    All 18 isolation, archival, licensing, and health verification steps passed.
                    {lastExportName && <span className="block font-mono mt-1">Export bundle: {lastExportName}</span>}
                  </div>
                  {reassignedPortalPath && (
                    <div className="pt-2 border-t border-emerald-200 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[#0F172A]">
                        Separate Portal Link: {window.location.origin}{reassignedPortalPath}
                      </span>
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyUrl('report', `${window.location.origin}${reassignedPortalPath}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded font-semibold text-emerald-800"
                        >
                          {copiedId === 'report' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedId === 'report' ? 'Copied' : 'Copy Link'}
                        </button>
                        <a
                          href={reassignedPortalPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0032A0] text-white rounded font-semibold"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open Portal
                        </a>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
                  {stepsReport.map((st) => (
                    <div key={st.step} className="p-2.5 rounded-lg bg-slate-50 border border-[#E2E8F0] text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-[#0F172A]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          {st.step}. {st.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">{st.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-3 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => setReassignAlloc(null)}
                    className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleReassignSubmit} className="p-6 space-y-4">
                {err && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>
                )}

                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Zero Tenant Data Reuse Guarantee</p>
                    <p className="mt-0.5">
                      Reassigning {reassignAlloc.code} exports &amp; archives the old tenant, revokes prior sessions/licenses, verifies storage isolation, and provisions a completely clean tenant namespace.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Mode</label>
                  <select
                    value={targetMode}
                    onChange={(e) => setTargetMode(e.target.value as typeof targetMode)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="NEW_CLIENT">Provision &amp; Bind to New Coaching Institute</option>
                    <option value="EXISTING_CLIENT">Rebind to Existing Client Organization</option>
                    <option value="RELEASE_ONLY">Release Capacity Only (Return to AVAILABLE Pool)</option>
                  </select>
                </div>

                {targetMode === 'EXISTING_CLIENT' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Existing Organization</label>
                    <select
                      required
                      value={targetOrgId}
                      onChange={(e) => setTargetOrgId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                    >
                      <option value="">Select client organization...</option>
                      {data.organizations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.id} — {o.instituteName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {targetMode === 'NEW_CLIENT' && (
                  <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                    <p className="text-xs font-mono font-semibold text-[#0032A0]">NEW TENANT CLIENT DETAILS</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">New Institute Name *</label>
                        <input
                          type="text"
                          required
                          value={newInstituteName}
                          onChange={(e) => setNewInstituteName(e.target.value)}
                          placeholder="e.g. Sankalp JEE Classes"
                          className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Email *</label>
                        <input
                          type="email"
                          required
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="director@sankalp.in"
                          className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person</label>
                        <input
                          type="text"
                          value={newContactPerson}
                          onChange={(e) => setNewContactPerson(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">City / Mobile</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={newCity}
                            onChange={(e) => setNewCity(e.target.value)}
                            placeholder="City"
                            className="w-full px-2.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                          />
                          <input
                            type="text"
                            value={newMobile}
                            onChange={(e) => setNewMobile(e.target.value)}
                            placeholder="Mobile"
                            className="w-full px-2.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Tier</label>
                        <select
                          value={newPlanCode}
                          onChange={(e) => setNewPlanCode(e.target.value as PlanCode)}
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
                          value={newBillingCycle}
                          onChange={(e) => setNewBillingCycle(e.target.value as BillingCycle)}
                          className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                        >
                          <option value="MONTHLY">MONTHLY</option>
                          <option value="QUARTERLY">QUARTERLY</option>
                          <option value="YEARLY">YEARLY</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Initial Client Admin Gate Passcode (Optional)
                      </label>
                      <input
                        type="text"
                        value={newAdminPasscode}
                        onChange={(e) => setNewAdminPasscode(e.target.value)}
                        placeholder="Min 6 characters (optional)"
                        className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Governance Reason</label>
                  <input
                    type="text"
                    required
                    value={releaseReason}
                    onChange={(e) => setReleaseReason(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>

                <div className="space-y-2 text-xs">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={authorizedRelease}
                      onChange={(e) => setAuthorizedRelease(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300"
                    />
                    <span className="text-slate-700">
                      I authorize releasing {reassignAlloc.code}, archiving prior tenant records, revoking old credentials, and enforcing retention safeguards.
                    </span>
                  </label>
                  {reassignAlloc.status === 'ASSIGNED' && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forceWaiveDues}
                        onChange={(e) => setForceWaiveDues(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <span className="text-slate-600">
                        Void any open pending invoices on the outgoing client (required if outgoing client has unpaid invoices).
                      </span>
                    </label>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => setReassignAlloc(null)}
                    className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !authorizedRelease}
                    className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg disabled:opacity-60"
                  >
                    {busy ? 'Executing 18-Step Transaction...' : 'Run 18-Step Reassignment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
