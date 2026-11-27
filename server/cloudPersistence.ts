import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { ADMIN_CRED_FILE, DATA_DIR, IS_VERCEL, TENANTS_DIR } from './runtimePaths.ts';

export type PersistenceMode = 'UPSTASH_KV' | 'VERCEL_BLOB' | 'LOCAL_DISK' | 'EPHEMERAL_TMP';

export interface CloudPersistenceStatus {
  mode: PersistenceMode;
  persistent: boolean;
  providerLabel: string;
  isVercel: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const SAAS_DB_PATH = path.join(DATA_DIR, 'salar-saas-db.json');
const KEYS_PATH = path.join(DATA_DIR, 'salar-keys.json');

const KV_PREFIX = 'salar:v1:';
const BLOB_PATHNAME = 'salar-state/platform-bundle.json';

let localSyncedRev = '';
let lastSyncedAt: string | null = null;
let lastError: string | null = null;

let saasDbDirty = false;
let keysDirty = false;
let adminGateDirty = false;
const dirtyTenants = new Set<string>();
const deletedTenants = new Set<string>();

let hydratePromise: Promise<void> | null = null;
let flushPromise: Promise<void> | null = null;
let onKeysReloaded: (() => void) | null = null;

export function registerKeysReloadHook(fn: () => void): void {
  onKeysReloaded = fn;
}

interface KvConfig {
  kind: 'UPSTASH_KV';
  url: string;
  token: string;
}

interface BlobConfig {
  kind: 'VERCEL_BLOB';
  token: string;
}

type RemoteConfig = KvConfig | BlobConfig | null;

function getRemoteConfig(): RemoteConfig {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (upstashUrl && upstashToken) {
    return { kind: 'UPSTASH_KV', url: upstashUrl.replace(/\/+$/, ''), token: upstashToken };
  }

  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const kvToken = process.env.KV_REST_API_TOKEN?.trim();
  if (kvUrl && kvToken) {
    return { kind: 'UPSTASH_KV', url: kvUrl.replace(/\/+$/, ''), token: kvToken };
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (blobToken) {
    return { kind: 'VERCEL_BLOB', token: blobToken };
  }

  return null;
}

export function getCloudPersistenceStatus(): CloudPersistenceStatus {
  const remote = getRemoteConfig();
  if (remote?.kind === 'UPSTASH_KV') {
    return {
      mode: 'UPSTASH_KV',
      persistent: true,
      providerLabel: 'Upstash Redis / Vercel KV (Cross-Lambda Cloud Persistence)',
      isVercel: IS_VERCEL,
      lastSyncedAt,
      lastError,
    };
  }
  if (remote?.kind === 'VERCEL_BLOB') {
    return {
      mode: 'VERCEL_BLOB',
      persistent: true,
      providerLabel: 'Vercel Blob Storage (Cross-Lambda Cloud Persistence)',
      isVercel: IS_VERCEL,
      lastSyncedAt,
      lastError,
    };
  }
  if (IS_VERCEL) {
    return {
      mode: 'EPHEMERAL_TMP',
      persistent: false,
      providerLabel: 'Vercel Ephemeral /tmp (Resets on cold start or container switch)',
      isVercel: true,
      lastSyncedAt,
      lastError,
    };
  }
  return {
    mode: 'LOCAL_DISK',
    persistent: true,
    providerLabel: 'Local Persistent Filesystem (.runtime_auth)',
    isVercel: false,
    lastSyncedAt,
    lastError,
  };
}

export function markCloudDirty(
  kind: 'saas_db' | 'keys' | 'admin_gate' | 'tenant',
  tenantId?: string
): void {
  if (kind === 'saas_db') saasDbDirty = true;
  else if (kind === 'keys') keysDirty = true;
  else if (kind === 'admin_gate') adminGateDirty = true;
  else if (kind === 'tenant' && tenantId) {
    deletedTenants.delete(tenantId);
    dirtyTenants.add(tenantId);
  }
}

export function markCloudDeleteTenant(tenantId: string): void {
  if (!tenantId) return;
  dirtyTenants.delete(tenantId);
  deletedTenants.add(tenantId);
}

export function hasPendingCloudWrites(): boolean {
  return saasDbDirty || keysDirty || adminGateDirty || dirtyTenants.size > 0 || deletedTenants.size > 0;
}

function clearDirtyFlags(): void {
  saasDbDirty = false;
  keysDirty = false;
  adminGateDirty = false;
  dirtyTenants.clear();
  deletedTenants.clear();
}

function listLocalTenantIds(): string[] {
  try {
    if (!fs.existsSync(TENANTS_DIR)) return [];
    return fs
      .readdirSync(TENANTS_DIR)
      .filter((name) => name.endsWith('.json') && !name.includes('.tmp.'))
      .map((name) => name.slice(0, -5))
      .filter((id) => /^[a-zA-Z0-9_-]+$/.test(id));
  } catch {
    return [];
  }
}

function atomicWriteUtf8(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readUtf8IfExists(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function kvPipeline(cfg: KvConfig, commands: Array<Array<string>>): Promise<Array<{ result: unknown; error?: string }>> {
  const resp = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => '');
    throw new Error(`KV HTTP ${resp.status}: ${bodyText.slice(0, 200)}`);
  }
  const parsed = (await resp.json()) as Array<{ result: unknown; error?: string }>;
  if (!Array.isArray(parsed)) {
    throw new Error('Unexpected KV pipeline response');
  }
  for (const item of parsed) {
    if (item?.error) {
      throw new Error(`KV command error: ${item.error}`);
    }
  }
  return parsed;
}

async function hydrateFromKv(cfg: KvConfig): Promise<void> {
  const revRes = await kvPipeline(cfg, [['GET', `${KV_PREFIX}rev`]]);
  const remoteRev = typeof revRes[0]?.result === 'string' ? revRes[0].result : '';

  if (!remoteRev) {
    // Cloud store is empty on first boot: seed whatever exists locally so all Lambdas align
    await seedAllLocalToKv(cfg);
    return;
  }

  if (remoteRev === localSyncedRev && fs.existsSync(SAAS_DB_PATH)) {
    return;
  }

  const baseRes = await kvPipeline(cfg, [
    ['GET', `${KV_PREFIX}saas_db`],
    ['GET', `${KV_PREFIX}keys`],
    ['GET', `${KV_PREFIX}admin_gate`],
    ['GET', `${KV_PREFIX}tenants_index`],
  ]);

  const saasDbRaw = typeof baseRes[0]?.result === 'string' ? baseRes[0].result : null;
  const keysRaw = typeof baseRes[1]?.result === 'string' ? baseRes[1].result : null;
  const adminGateRaw = typeof baseRes[2]?.result === 'string' ? baseRes[2].result : null;
  const tenantsIdxRaw = typeof baseRes[3]?.result === 'string' ? baseRes[3].result : null;

  if (keysRaw && !keysDirty) {
    atomicWriteUtf8(KEYS_PATH, keysRaw);
    onKeysReloaded?.();
  }
  if (saasDbRaw && !saasDbDirty) {
    atomicWriteUtf8(SAAS_DB_PATH, saasDbRaw);
  }
  if (adminGateRaw && !adminGateDirty) {
    atomicWriteUtf8(ADMIN_CRED_FILE, adminGateRaw);
  }

  let remoteTenantIds: string[] = [];
  if (tenantsIdxRaw) {
    try {
      const parsed = JSON.parse(tenantsIdxRaw);
      if (Array.isArray(parsed)) {
        remoteTenantIds = parsed.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id));
      }
    } catch {
      remoteTenantIds = [];
    }
  }

  if (remoteTenantIds.length > 0) {
    const tenantCmds = remoteTenantIds.map((id) => ['GET', `${KV_PREFIX}tenant:${id}`]);
    const tenantRes = await kvPipeline(cfg, tenantCmds);
    remoteTenantIds.forEach((id, idx) => {
      if (dirtyTenants.has(id) || deletedTenants.has(id)) return;
      const raw = typeof tenantRes[idx]?.result === 'string' ? tenantRes[idx].result : null;
      if (raw) {
        atomicWriteUtf8(path.join(TENANTS_DIR, `${id}.json`), raw);
      }
    });
  }

  // Remove any local tenant files that were deleted in remote cloud state
  if (tenantsIdxRaw) {
    const remoteSet = new Set(remoteTenantIds);
    for (const localId of listLocalTenantIds()) {
      if (!remoteSet.has(localId) && !dirtyTenants.has(localId)) {
        try {
          fs.unlinkSync(path.join(TENANTS_DIR, `${localId}.json`));
        } catch {
          // ignore
        }
      }
    }
  }

  localSyncedRev = remoteRev;
  lastSyncedAt = new Date().toISOString();
  lastError = null;
}

async function seedAllLocalToKv(cfg: KvConfig): Promise<void> {
  const cmds: Array<Array<string>> = [];
  const saasRaw = readUtf8IfExists(SAAS_DB_PATH);
  const keysRaw = readUtf8IfExists(KEYS_PATH);
  const gateRaw = readUtf8IfExists(ADMIN_CRED_FILE);
  const tenantIds = listLocalTenantIds();

  if (saasRaw) cmds.push(['SET', `${KV_PREFIX}saas_db`, saasRaw]);
  if (keysRaw) cmds.push(['SET', `${KV_PREFIX}keys`, keysRaw]);
  if (gateRaw) cmds.push(['SET', `${KV_PREFIX}admin_gate`, gateRaw]);
  for (const tid of tenantIds) {
    const raw = readUtf8IfExists(path.join(TENANTS_DIR, `${tid}.json`));
    if (raw) cmds.push(['SET', `${KV_PREFIX}tenant:${tid}`, raw]);
  }
  cmds.push(['SET', `${KV_PREFIX}tenants_index`, JSON.stringify(tenantIds)]);
  const newRev = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  cmds.push(['SET', `${KV_PREFIX}rev`, newRev]);

  if (cmds.length > 0) {
    await kvPipeline(cfg, cmds);
    localSyncedRev = newRev;
    lastSyncedAt = new Date().toISOString();
    lastError = null;
  }
  clearDirtyFlags();
}

async function flushToKv(cfg: KvConfig): Promise<void> {
  if (!hasPendingCloudWrites()) return;

  const cmds: Array<Array<string>> = [];
  if (saasDbDirty) {
    const raw = readUtf8IfExists(SAAS_DB_PATH);
    if (raw) cmds.push(['SET', `${KV_PREFIX}saas_db`, raw]);
  }
  if (keysDirty) {
    const raw = readUtf8IfExists(KEYS_PATH);
    if (raw) cmds.push(['SET', `${KV_PREFIX}keys`, raw]);
  }
  if (adminGateDirty) {
    const raw = readUtf8IfExists(ADMIN_CRED_FILE);
    if (raw) cmds.push(['SET', `${KV_PREFIX}admin_gate`, raw]);
  }
  for (const tid of dirtyTenants) {
    const raw = readUtf8IfExists(path.join(TENANTS_DIR, `${tid}.json`));
    if (raw) cmds.push(['SET', `${KV_PREFIX}tenant:${tid}`, raw]);
  }
  for (const tid of deletedTenants) {
    cmds.push(['DEL', `${KV_PREFIX}tenant:${tid}`]);
  }

  const tenantIds = listLocalTenantIds();
  cmds.push(['SET', `${KV_PREFIX}tenants_index`, JSON.stringify(tenantIds)]);
  const newRev = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  cmds.push(['SET', `${KV_PREFIX}rev`, newRev]);

  await kvPipeline(cfg, cmds);
  localSyncedRev = newRev;
  lastSyncedAt = new Date().toISOString();
  lastError = null;
  clearDirtyFlags();
}

export interface PlatformExportBundle {
  format: 'SALAR-PLATFORM-SNAPSHOT-V1';
  exportedAt: string;
  rev: string;
  saasDb: string | null;
  keys: string | null;
  adminGate: string | null;
  tenants: Record<string, string>;
}

export function exportFullPlatformBundle(): PlatformExportBundle {
  const tenants: Record<string, string> = {};
  for (const tid of listLocalTenantIds()) {
    const raw = readUtf8IfExists(path.join(TENANTS_DIR, `${tid}.json`));
    if (raw) tenants[tid] = raw;
  }
  return {
    format: 'SALAR-PLATFORM-SNAPSHOT-V1',
    exportedAt: new Date().toISOString(),
    rev: localSyncedRev || `${Date.now()}`,
    saasDb: readUtf8IfExists(SAAS_DB_PATH),
    keys: readUtf8IfExists(KEYS_PATH),
    adminGate: readUtf8IfExists(ADMIN_CRED_FILE),
    tenants,
  };
}

export function applyFullPlatformBundle(bundle: PlatformExportBundle, overwriteLocalKeys = true): void {
  if (bundle.keys && overwriteLocalKeys) {
    atomicWriteUtf8(KEYS_PATH, bundle.keys);
    keysDirty = true;
    onKeysReloaded?.();
  }
  if (bundle.saasDb) {
    atomicWriteUtf8(SAAS_DB_PATH, bundle.saasDb);
    saasDbDirty = true;
  }
  if (bundle.adminGate) {
    atomicWriteUtf8(ADMIN_CRED_FILE, bundle.adminGate);
    adminGateDirty = true;
  }
  const incomingIds = new Set<string>();
  if (bundle.tenants && typeof bundle.tenants === 'object') {
    for (const [tid, raw] of Object.entries(bundle.tenants)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(tid) || typeof raw !== 'string') continue;
      incomingIds.add(tid);
      atomicWriteUtf8(path.join(TENANTS_DIR, `${tid}.json`), raw);
      dirtyTenants.add(tid);
    }
  }
  for (const existingId of listLocalTenantIds()) {
    if (!incomingIds.has(existingId)) {
      try {
        fs.unlinkSync(path.join(TENANTS_DIR, `${existingId}.json`));
      } catch {
        // ignore
      }
      deletedTenants.add(existingId);
    }
  }
}

async function listBlobEntries(cfg: BlobConfig): Promise<Array<{ url: string; pathname: string; uploadedAt: string }>> {
  const resp = await fetch(
    `https://blob.vercel-storage.com?prefix=${encodeURIComponent('salar-state/')}`,
    {
      headers: {
        authorization: `Bearer ${cfg.token}`,
        'x-api-version': '7',
      },
      cache: 'no-store',
    }
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Blob list HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    blobs?: Array<{ url: string; pathname: string; uploadedAt: string }>;
  };
  return Array.isArray(data.blobs) ? data.blobs : [];
}

async function hydrateFromBlob(cfg: BlobConfig): Promise<void> {
  const blobs = await listBlobEntries(cfg);
  const sorted = blobs
    .filter((b) => b.pathname === BLOB_PATHNAME || b.pathname.startsWith('salar-state/platform-bundle'))
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));

  const latest = sorted[0];
  if (!latest) {
    await flushBundleToBlob(cfg);
    return;
  }

  const remoteMarker = `${latest.uploadedAt}|${latest.url}`;
  if (remoteMarker === localSyncedRev && fs.existsSync(SAAS_DB_PATH)) {
    return;
  }

  const fileResp = await fetch(latest.url, {
    headers: { authorization: `Bearer ${cfg.token}` },
    cache: 'no-store',
  });
  if (!fileResp.ok) {
    // Public blob stores may reject unexpected Bearer header; retry without header if needed
    const retryResp = await fetch(latest.url, { cache: 'no-store' });
    if (!retryResp.ok) {
      throw new Error(`Blob fetch HTTP ${retryResp.status}`);
    }
    const bundle = (await retryResp.json()) as PlatformExportBundle;
    applyHydratedBlobBundle(bundle, remoteMarker);
    return;
  }
  const bundle = (await fileResp.json()) as PlatformExportBundle;
  applyHydratedBlobBundle(bundle, remoteMarker);
}

function applyHydratedBlobBundle(bundle: PlatformExportBundle, remoteMarker: string): void {
  if (!bundle || bundle.format !== 'SALAR-PLATFORM-SNAPSHOT-V1') return;
  if (bundle.keys && !keysDirty) {
    atomicWriteUtf8(KEYS_PATH, bundle.keys);
    onKeysReloaded?.();
  }
  if (bundle.saasDb && !saasDbDirty) atomicWriteUtf8(SAAS_DB_PATH, bundle.saasDb);
  if (bundle.adminGate && !adminGateDirty) atomicWriteUtf8(ADMIN_CRED_FILE, bundle.adminGate);

  const remoteIds = new Set<string>();
  for (const [tid, raw] of Object.entries(bundle.tenants || {})) {
    if (!/^[a-zA-Z0-9_-]+$/.test(tid) || typeof raw !== 'string') continue;
    remoteIds.add(tid);
    if (!dirtyTenants.has(tid) && !deletedTenants.has(tid)) {
      atomicWriteUtf8(path.join(TENANTS_DIR, `${tid}.json`), raw);
    }
  }
  for (const localId of listLocalTenantIds()) {
    if (!remoteIds.has(localId) && !dirtyTenants.has(localId)) {
      try {
        fs.unlinkSync(path.join(TENANTS_DIR, `${localId}.json`));
      } catch {
        // ignore
      }
    }
  }
  localSyncedRev = remoteMarker;
  lastSyncedAt = new Date().toISOString();
  lastError = null;
}

async function flushBundleToBlob(cfg: BlobConfig): Promise<void> {
  const bundle = exportFullPlatformBundle();
  const body = JSON.stringify(bundle);
  const putUrl = `https://blob.vercel-storage.com/${BLOB_PATHNAME}`;
  const resp = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${cfg.token}`,
      'x-api-version': '7',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': '1',
      'x-content-type': 'application/json',
      'x-cache-control-max-age': '0',
      'content-type': 'application/json',
    },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Blob put HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const uploaded = (await resp.json()) as { url?: string };
  localSyncedRev = `${new Date().toISOString()}|${uploaded.url || ''}`;
  lastSyncedAt = new Date().toISOString();
  lastError = null;
  clearDirtyFlags();
}

export async function ensureCloudHydrated(): Promise<void> {
  const remote = getRemoteConfig();
  if (!remote) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      if (remote.kind === 'UPSTASH_KV') {
        await hydrateFromKv(remote);
      } else if (remote.kind === 'VERCEL_BLOB') {
        await hydrateFromBlob(remote);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Cloud hydration failed';
      console.error('[cloudPersistence] hydration error:', lastError);
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
}

export async function flushCloudWrites(): Promise<void> {
  const remote = getRemoteConfig();
  if (!remote || !hasPendingCloudWrites()) {
    if (!remote) clearDirtyFlags();
    return;
  }
  if (flushPromise) {
    await flushPromise;
    if (!hasPendingCloudWrites()) return;
  }

  flushPromise = (async () => {
    try {
      if (remote.kind === 'UPSTASH_KV') {
        await flushToKv(remote);
      } else if (remote.kind === 'VERCEL_BLOB') {
        await flushBundleToBlob(remote);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Cloud flush failed';
      console.error('[cloudPersistence] flush error:', lastError);
    } finally {
      flushPromise = null;
    }
  })();

  return flushPromise;
}

export function cloudPersistenceMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');

  let flushedBeforeSend = false;
  const origJson = res.json.bind(res);
  const origSend = res.send.bind(res);

  res.json = ((body?: unknown) => {
    if (!flushedBeforeSend && hasPendingCloudWrites()) {
      flushedBeforeSend = true;
      void flushCloudWrites().finally(() => {
        origJson(body);
      });
      return res;
    }
    flushedBeforeSend = true;
    return origJson(body);
  }) as typeof res.json;

  res.send = ((body?: unknown) => {
    if (!flushedBeforeSend && hasPendingCloudWrites()) {
      flushedBeforeSend = true;
      void flushCloudWrites().finally(() => {
        origSend(body);
      });
      return res;
    }
    flushedBeforeSend = true;
    return origSend(body);
  }) as typeof res.send;

  void ensureCloudHydrated().finally(() => next());
}
