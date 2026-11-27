import React, { useEffect, useState } from 'react';
import { Activity, Cloud, Cpu, Database, Download, HardDrive, Network, RefreshCw, Save, Server, Upload } from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import type { InfrastructureSnapshot, OwnerBootstrapData, ScalingPolicy } from '../../types/salar';

interface OwnerInfrastructureViewProps {
  mode: 'infrastructure' | 'load-balancing' | 'database';
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
}

export const OwnerInfrastructureView: React.FC<OwnerInfrastructureViewProps> = ({
  mode,
  data,
  onRefresh,
}) => {
  const [liveInfra, setLiveInfra] = useState<InfrastructureSnapshot>(data.infrastructure);
  const [policy, setPolicy] = useState<ScalingPolicy>(data.scalingPolicy);
  const [probeResult, setProbeResult] = useState<{
    checkedAt: string;
    saasStoreWriteMs: number;
    firestoreReachable: boolean;
    firestoreLatencyMs: number;
    firestoreNote: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setLiveInfra(data.infrastructure);
    setPolicy(data.scalingPolicy);
  }, [data]);

  const handlePollLive = async () => {
    setBusy(true);
    try {
      const res = await salarApi.getLiveInfrastructure();
      setLiveInfra(res.infrastructure);
    } finally {
      setBusy(false);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await salarApi.updateScalingPolicy(policy);
      setMsg('Scaling & load-balancing policy thresholds saved.');
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleProbeDb = async () => {
    setBusy(true);
    try {
      const res = await salarApi.probeDatabase();
      setProbeResult(res);
    } finally {
      setBusy(false);
    }
  };

  const handleExportBundle = async () => {
    setBusy(true);
    setMsg('');
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
      setMsg('Exported portable platform JSON snapshot.');
    } finally {
      setBusy(false);
    }
  };

  const handleImportBundle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const res = await salarApi.importPersistenceSnapshot(parsed);
      setMsg(`Restored ${res.organizationsCount} client organization(s) and ${res.tenantsCount} tenant store(s).`);
      await onRefresh();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Failed to restore snapshot.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'infrastructure') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-base text-[#0F172A]">
              Live Runtime Host &amp; Storage Telemetry
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Direct OS, Node process, filesystem, and HTTP middleware metrics sampled from {liveInfra.hostname}.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handlePollLive}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            Sample Live Metrics
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-mono uppercase">CPU Load ({liveInfra.cpuCores} cores)</span>
              <Cpu className="w-4 h-4 text-[#0032A0]" />
            </div>
            <p className="font-display font-bold text-2xl text-[#0F172A] tabular-nums">
              {liveInfra.cpuLoadPercent}%
            </p>
            <p className="text-xs font-mono text-slate-500 mt-1">1m avg: {liveInfra.loadAvg1m}</p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-mono uppercase">RAM Usage</span>
              <Server className="w-4 h-4 text-[#0032A0]" />
            </div>
            <p className="font-display font-bold text-2xl text-[#0F172A] tabular-nums">
              {liveInfra.memoryPercent}%
            </p>
            <p className="text-xs font-mono text-slate-500 mt-1">
              {liveInfra.memoryUsedMb} / {liveInfra.memoryTotalMb} MB (RSS {liveInfra.processRssMb}MB)
            </p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-mono uppercase">Disk Volume</span>
              <HardDrive className="w-4 h-4 text-[#0032A0]" />
            </div>
            <p className="font-display font-bold text-2xl text-[#0F172A] tabular-nums">
              {liveInfra.diskPercent}%
            </p>
            <p className="text-xs font-mono text-slate-500 mt-1">
              {liveInfra.diskUsedGb} / {liveInfra.diskTotalGb} GB · {liveInfra.uploadsCount} uploads
            </p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-mono uppercase">HTTP Latency &amp; RPM</span>
              <Activity className="w-4 h-4 text-[#0032A0]" />
            </div>
            <p className="font-display font-bold text-2xl text-[#0F172A] tabular-nums">
              {liveInfra.avgResponseMs}ms
            </p>
            <p className="text-xs font-mono text-slate-500 mt-1">
              {liveInfra.requestsPerMin} req/min · p95 {liveInfra.p95ResponseMs}ms · {liveInfra.errorRatePercent}% 5xx
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
          <h3 className="font-display font-bold text-sm text-[#0F172A] mb-3">
            Connected Platform Services &amp; Environment Status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <p className="font-mono text-slate-500">FIRESTORE DATABASE</p>
              <p className="font-semibold text-[#0F172A] mt-0.5">{liveInfra.integrations.firestoreProjectId}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <p className="font-mono text-slate-500">CLOUDFLARE DNS / SSL</p>
              <p className="font-semibold text-[#0F172A] mt-0.5">
                {liveInfra.integrations.cloudflareConfigured ? 'API Token Active' : 'Manual DNS + Real Node TLS Probe'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <p className="font-mono text-slate-500">REDIS / CACHE LAYER</p>
              <p className="font-semibold text-[#0F172A] mt-0.5">
                {liveInfra.integrations.redisConfigured ? 'External Redis Connected' : 'Local In-Process Cache'}
              </p>
            </div>
          </div>

          {liveInfra.persistenceStatus && (
            <div
              className={`mt-4 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                liveInfra.persistenceStatus.persistent
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-start gap-2.5 text-xs">
                <Cloud className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">
                    Platform Registry Persistence: {liveInfra.persistenceStatus.mode}
                  </p>
                  <p className="mt-0.5">{liveInfra.persistenceStatus.providerLabel}</p>
                  {liveInfra.persistenceStatus.lastError && (
                    <p className="mt-0.5 text-red-700 font-mono">Error: {liveInfra.persistenceStatus.lastError}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleExportBundle}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Snapshot
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0032A0] text-white rounded-lg text-xs font-semibold hover:bg-[#00257a] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Restore Snapshot
                  <input type="file" accept="application/json,.json" onChange={handleImportBundle} className="hidden" />
                </label>
              </div>
            </div>
          )}
          {msg && (
            <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-[#0032A0]">{msg}</div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'load-balancing') {
    return (
      <div className="space-y-6">
        {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}

        {/* Active Instances */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-[#0032A0]" />
              <h2 className="font-display font-bold text-sm text-[#0F172A]">Active Application Instances</h2>
            </div>
            <span className="text-xs font-mono text-slate-500">Uptime: {liveInfra.uptimeSeconds}s</span>
          </div>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                <th className="py-3 px-4">Instance</th>
                <th className="py-3 px-4">Hostname / Region</th>
                <th className="py-3 px-4">Traffic Weight</th>
                <th className="py-3 px-4">Health</th>
                <th className="py-3 px-4">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.deploymentInstances.map((inst) => (
                <tr key={inst.id}>
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0F172A]">{inst.instanceName}</td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-600">
                    {inst.hostname} · {inst.region} ({inst.environment})
                  </td>
                  <td className="py-3 px-4 font-mono text-xs tabular-nums">{inst.weight}%</td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                      {inst.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-500">
                    {new Date(inst.lastHeartbeatAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Auto-Scaling Policy */}
        <form onSubmit={handleSavePolicy} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
          <h3 className="font-display font-bold text-sm text-[#0F172A]">
            Load Balancing &amp; Auto-Scaling Threshold Policy
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Min Instances</label>
              <input
                type="number"
                value={policy.minInstances}
                onChange={(e) => setPolicy({ ...policy, minInstances: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Instances</label>
              <input
                type="number"
                value={policy.maxInstances}
                onChange={(e) => setPolicy({ ...policy, maxInstances: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target CPU %</label>
              <input
                type="number"
                value={policy.targetCpuPercent}
                onChange={(e) => setPolicy({ ...policy, targetCpuPercent: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target RAM %</label>
              <input
                type="number"
                value={policy.targetMemoryPercent}
                onChange={(e) => setPolicy({ ...policy, targetMemoryPercent: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Req/min Target</label>
              <input
                type="number"
                value={policy.targetRequestsPerMin}
                onChange={(e) => setPolicy({ ...policy, targetRequestsPerMin: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Queue Depth</label>
              <input
                type="number"
                value={policy.targetQueueDepth}
                onChange={(e) => setPolicy({ ...policy, targetQueueDepth: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={policy.autoScalingEnabled}
                onChange={(e) => setPolicy({ ...policy, autoScalingEnabled: e.target.checked })}
              />
              Auto-Scaling Policy Active
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={policy.cdnEnabled}
                onChange={(e) => setPolicy({ ...policy, cdnEnabled: e.target.checked })}
              />
              Edge CDN Asset Caching
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={policy.redisCacheEnabled}
                onChange={(e) => setPolicy({ ...policy, redisCacheEnabled: e.target.checked })}
              />
              Session / Query Caching
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
            >
              <Save className="w-3.5 h-3.5" />
              Save Scaling Policy
            </button>
          </div>
        </form>
      </div>
    );
  }

  // mode === 'database'
  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#0032A0]" />
            <h2 className="font-display font-bold text-base text-[#0F172A]">
              Multi-Tenant Database &amp; Isolation Governance
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Active Firestore Project: <span className="font-mono">{liveInfra.integrations.firestoreProjectId}</span>
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={handleProbeDb}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          Run Live DB Latency Probe
        </button>
      </div>

      {probeResult && (
        <div className="p-4 rounded-xl bg-white border border-[#0032A0] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <p className="font-mono text-slate-500">FIRESTORE REACHABILITY</p>
            <p className="font-bold text-[#0F172A] mt-0.5">
              {probeResult.firestoreReachable ? 'REACHABLE' : 'UNREACHABLE'} ({probeResult.firestoreLatencyMs} ms)
            </p>
            <p className="text-slate-500 mt-0.5">{probeResult.firestoreNote}</p>
          </div>
          <div>
            <p className="font-mono text-slate-500">SAAS GOVERNANCE STORE</p>
            <p className="font-bold text-[#0F172A] mt-0.5">Read Latency: {probeResult.saasStoreWriteMs} ms</p>
          </div>
          <div>
            <p className="font-mono text-slate-500">SAMPLED AT</p>
            <p className="font-mono text-[#0F172A] mt-0.5">{new Date(probeResult.checkedAt).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Tenant Isolation Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
          <h3 className="font-display font-bold text-sm text-[#0F172A]">Tenant Schema &amp; Storage Isolation Map</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                <th className="py-3 px-4">Tenant ID</th>
                <th className="py-3 px-4">Organization</th>
                <th className="py-3 px-4">Namespace / Storage Prefix</th>
                <th className="py-3 px-4">Isolation Mode</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.tenants.map((t) => (
                <tr key={t.id}>
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0F172A]">{t.id}</td>
                  <td className="py-3 px-4 font-mono text-xs text-[#0032A0]">{t.organizationId}</td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">
                    <p>{t.namespace}</p>
                    <p className="text-[11px] text-slate-400">{t.storageBucketPrefix}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">{t.isolationMode}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                        t.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {t.status}
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
};
