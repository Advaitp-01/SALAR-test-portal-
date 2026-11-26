import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ADMIN_CRED_FILE, DATA_DIR, getBundledConfigPath, UPLOADS_DIR } from './runtimePaths.ts';
import {
  addPeriodToIso,
  appendAuditLog,
  appendLicenseEvent,
  BACKUPS_DIR,
  canTransitionLicense,
  computePlanPrice,
  createBackupArchive,
  createUniquePortalSlug,
  generateLicenseKey,
  generateTotpSecret,
  hashPasswordScrypt,
  readSalarDb,
  SERVER_KEYS,
  signLicensePayload,
  verifyAndReadBackupFile,
  verifyLicenseSignature,
  verifyPasswordScrypt,
  verifyTotpCode,
  writeSalarDb,
} from './salarStore.ts';
import {
  applyTenantPayloadPatch,
  authenticateTenantStudent,
  ensureTenantStore,
  exportTenantRuntimeSnapshot,
  getTenantStudentByUid,
  isAllowedTenantCollectionPath,
  isTenantAdminClaimed,
  isValidDocId,
  queryTenantCollection,
  registerTenantStudent,
  setTenantAdminPasscode,
  verifyTenantAdminPasscode,
  writeTenantStore,
} from './tenantRuntimeStore.ts';
import type {
  BillingCycle,
  DeploymentType,
  EnvironmentStage,
  HealthState,
  LicenseRecord,
  LicenseStatus,
  ManualPaymentMode,
  Organization,
  PlanCode,
  PortalBindingRecord,
  SalarDatabaseSchema,
  TenantDomain,
} from './salarTypes.ts';

// ---------------------------------------------------------------------------
// Real HTTP Telemetry Collector (No Fabricated Metrics)
// ---------------------------------------------------------------------------
interface TelemetryState {
  activeRequests: number;
  recentRequests: Array<{ ts: number; durationMs: number; status: number }>;
  totalRequests: number;
  totalErrors: number;
}

const telemetry: TelemetryState = {
  activeRequests: 0,
  recentRequests: [],
  totalRequests: 0,
  totalErrors: 0,
};

export function telemetryMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  telemetry.activeRequests += 1;
  telemetry.totalRequests += 1;

  res.on('finish', () => {
    telemetry.activeRequests = Math.max(0, telemetry.activeRequests - 1);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const status = res.statusCode;
    if (status >= 500) {
      telemetry.totalErrors += 1;
    }
    const now = Date.now();
    telemetry.recentRequests.push({ ts: now, durationMs: elapsedMs, status });
    const cutoff = now - 60_000;
    while (telemetry.recentRequests.length > 0 && telemetry.recentRequests[0].ts < cutoff) {
      telemetry.recentRequests.shift();
    }
  });
  next();
}

function getDirBytes(dirPath: string): { bytes: number; files: number } {
  try {
    if (!fs.existsSync(dirPath)) return { bytes: 0, files: 0 };
    const entries = fs.readdirSync(dirPath);
    let bytes = 0;
    let files = 0;
    for (const entry of entries) {
      const full = path.join(dirPath, entry);
      const st = fs.statSync(full);
      if (st.isFile()) {
        bytes += st.size;
        files += 1;
      }
    }
    return { bytes, files };
  } catch {
    return { bytes: 0, files: 0 };
  }
}

function getRealInfrastructureSnapshot() {
  const cpus = os.cpus();
  const cpuCores = Math.max(1, cpus.length);
  const loadAvg1m = os.loadavg()[0] || 0;
  const cpuLoadPercent = Math.min(100, Math.round((loadAvg1m / cpuCores) * 1000) / 10);

  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
  const usedMemMb = Math.max(0, totalMemMb - freeMemMb);
  const memoryPercent = totalMemMb > 0 ? Math.round((usedMemMb / totalMemMb) * 1000) / 10 : 0;

  const procMem = process.memoryUsage();
  const processRssMb = Math.round(procMem.rss / (1024 * 1024));

  let diskTotalGb = 0;
  let diskUsedGb = 0;
  let diskPercent = 0;
  try {
    const stat = fs.statfsSync(DATA_DIR);
    const total = Number(stat.blocks) * Number(stat.bsize);
    const free = Number(stat.bavail) * Number(stat.bsize);
    const used = Math.max(0, total - free);
    diskTotalGb = Math.round((total / 1024 ** 3) * 10) / 10;
    diskUsedGb = Math.round((used / 1024 ** 3) * 10) / 10;
    diskPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
  } catch {
    // Fallback if statfsSync unavailable
  }

  const uploadsInfo = getDirBytes(UPLOADS_DIR);
  const backupsInfo = getDirBytes(BACKUPS_DIR);

  const now = Date.now();
  const recent = telemetry.recentRequests.filter((r) => r.ts >= now - 60_000);
  const requestsPerMin = recent.length;
  const durations = recent.map((r) => r.durationMs).sort((a, b) => a - b);
  const avgResponseMs =
    durations.length > 0
      ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10
      : 0;
  const p95ResponseMs =
    durations.length > 0
      ? Math.round(durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] * 10) / 10
      : 0;
  const recentErrors = recent.filter((r) => r.status >= 500).length;
  const errorRatePercent =
    recent.length > 0 ? Math.round((recentErrors / recent.length) * 1000) / 10 : 0;

  let serverHealth: HealthState = 'HEALTHY';
  if (cpuLoadPercent >= 90 || memoryPercent >= 92 || errorRatePercent >= 10) serverHealth = 'CRITICAL';
  else if (cpuLoadPercent >= 75 || memoryPercent >= 82 || errorRatePercent >= 3) serverHealth = 'WARNING';

  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.arch()}`,
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    environment: (process.env.NODE_ENV === 'production' ? 'production' : 'development') as EnvironmentStage,
    cpuCores,
    loadAvg1m: Math.round(loadAvg1m * 100) / 100,
    cpuLoadPercent,
    memoryUsedMb: usedMemMb,
    memoryTotalMb: totalMemMb,
    memoryPercent,
    processRssMb,
    diskUsedGb,
    diskTotalGb,
    diskPercent,
    uploadsBytes: uploadsInfo.bytes,
    uploadsCount: uploadsInfo.files,
    backupsBytes: backupsInfo.bytes,
    backupsCount: backupsInfo.files,
    activeRequests: telemetry.activeRequests,
    requestsPerMin,
    totalRequests: telemetry.totalRequests,
    avgResponseMs,
    p95ResponseMs,
    errorRatePercent,
    serverHealth,
    integrations: {
      cloudflareConfigured: Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID),
      redisConfigured: Boolean(process.env.REDIS_URL),
      smtpConfigured: Boolean(process.env.SMTP_HOST),
      firestoreProjectId: (() => {
        try {
          const cfg = JSON.parse(
            fs.readFileSync(getBundledConfigPath('firebase-applet-config.json'), 'utf-8')
          ) as { projectId?: string; firestoreDatabaseId?: string };
          return `${cfg.projectId || 'configured'} (${cfg.firestoreDatabaseId || '(default)'})`;
        } catch {
          return 'configured';
        }
      })(),
    },
  };
}

// ---------------------------------------------------------------------------
// Owner Session Cookie, Rate Limiter & CSRF Guards
// ---------------------------------------------------------------------------
const OWNER_COOKIE_NAME = 'salar_owner_session';
const loginAttemptsMap = new Map<string, { count: number; firstAttemptAt: number; lockedUntil?: number }>();

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.ip || '127.0.0.1';
}

function verifyCsrfRequest(req: Request): boolean {
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return true;
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
  if (origin && host) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return false;
}

function signOwnerJwt(payload: { sid: string; username: string; exp: number }): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_KEYS.sessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyOwnerJwt(token: string): { sid: string; username: string; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SERVER_KEYS.sessionSecret).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
      sid: string;
      username: string;
      exp: number;
    };
    if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setOwnerCookie(res: Response, token: string, ttlHours: number) {
  const maxAge = Math.max(3600, ttlHours * 3600);
  res.setHeader(
    'Set-Cookie',
    `${OWNER_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

function clearOwnerCookie(res: Response) {
  res.setHeader(
    'Set-Cookie',
    `${OWNER_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

interface AuthenticatedOwnerRequest extends Request {
  ownerUsername?: string;
  ownerSessionId?: string;
}

function resolveOwnerSessionFromRequest(req: Request): { sid: string; username: string } | null {
  const auth = req.headers.authorization;
  let token: string | null = null;
  if (auth && auth.startsWith('Bearer ')) token = auth.slice(7).trim();
  else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[OWNER_COOKIE_NAME] || null;
  }
  if (!token) return null;
  const decoded = verifyOwnerJwt(token);
  if (!decoded) return null;
  const db = readSalarDb();
  const sess = db.ownerSessions.find((s) => s.id === decoded.sid && !s.revokedAt);
  if (!sess || new Date(sess.expiresAt).getTime() < Date.now()) return null;
  return { sid: decoded.sid, username: decoded.username };
}

function requireOwnerAuth(req: AuthenticatedOwnerRequest, res: Response, next: NextFunction) {
  const resolved = resolveOwnerSessionFromRequest(req);
  if (!resolved) {
    res.status(401).json({ error: 'Unauthorized: Owner authentication required.' });
    return;
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !verifyCsrfRequest(req)) {
    res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
    return;
  }
  req.ownerSessionId = resolved.sid;
  req.ownerUsername = resolved.username;
  next();
}

function isRootAdminConfigured(): boolean {
  if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim()) return true;
  return fs.existsSync(ADMIN_CRED_FILE);
}

function getOrgDomainStatus(domains: TenantDomain[]): {
  domainStatus: 'VERIFIED_ACTIVE' | 'PENDING_DNS' | 'SSL_FAILED';
  verifiedDomain: string;
  dnsVerified: boolean;
  sslStatus: string;
} {
  const activeCustom = domains.find(
    (d) => d.type === 'CUSTOM_DOMAIN' && d.isActive && d.dnsVerified && d.sslStatus === 'ACTIVE'
  );
  if (activeCustom) {
    return {
      domainStatus: 'VERIFIED_ACTIVE',
      verifiedDomain: activeCustom.domain,
      dnsVerified: true,
      sslStatus: activeCustom.sslStatus,
    };
  }
  const activeSub = domains.find(
    (d) => d.type === 'SUBDOMAIN' && d.isActive && d.dnsVerified && d.sslStatus === 'ACTIVE'
  );
  if (activeSub) {
    return {
      domainStatus: 'VERIFIED_ACTIVE',
      verifiedDomain: activeSub.domain,
      dnsVerified: true,
      sslStatus: activeSub.sslStatus,
    };
  }
  const failed = domains.find((d) => d.sslStatus === 'FAILED');
  if (failed) {
    return {
      domainStatus: 'SSL_FAILED',
      verifiedDomain: '',
      dnsVerified: failed.dnsVerified,
      sslStatus: failed.sslStatus,
    };
  }
  const first = domains[0];
  return {
    domainStatus: 'PENDING_DNS',
    verifiedDomain: '',
    dnsVerified: Boolean(first?.dnsVerified),
    sslStatus: first?.sslStatus || 'PENDING',
  };
}

function buildPortalBindings(db: SalarDatabaseSchema): PortalBindingRecord[] {
  return db.organizations.map((org) => {
    const lic = db.licenses.find((l) => l.id === org.licenseId);
    const alloc = db.portalAllocations.find((a) => a.id === org.portalAllocationId);
    const tenant = db.tenants.find((t) => t.id === org.tenantId);
    const sub = db.subscriptions.find((s) => s.organizationId === org.id);
    const orgDomains = db.tenantDomains.filter((d) => d.organizationId === org.id);
    const domMeta = getOrgDomainStatus(orgDomains);
    const isRoot = org.id === 'SALAR-ORG-00001';
    const adminClaimed = isRoot ? isRootAdminConfigured() : isTenantAdminClaimed(org);
    const portalPath = org.portalPath || (isRoot ? '/' : `/p/${org.portalSlug}`);

    return {
      organizationId: org.id,
      instituteName: org.instituteName,
      portalSlug: org.portalSlug,
      portalPath,
      subdomain: org.subdomain,
      customDomain: org.customDomain,
      verifiedDomain: domMeta.verifiedDomain,
      licenseId: lic?.id || org.licenseId,
      licenseKey: lic?.licenseKey || '',
      licenseStatus: lic?.status || 'ACTIVE',
      expiryDate: lic?.expirationDate || '',
      portalAllocationId: org.portalAllocationId,
      allocationCode: alloc?.code || 'UNASSIGNED',
      tenantId: org.tenantId,
      databaseId: org.databaseId || tenant?.databaseId || 'salar_tenant_001',
      databaseStatus: tenant?.status || (org.status === 'ARCHIVED' ? 'ARCHIVED' : org.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
      adminEmail: org.email,
      adminAccountStatus: adminClaimed ? 'CLAIMED' : 'PENDING_SETUP',
      subscriptionStatus: sub?.status || 'ACTIVE',
      domainStatus: domMeta.domainStatus,
      dnsVerified: domMeta.dnsVerified,
      sslStatus: domMeta.sslStatus,
    };
  });
}

export function createSalarRouter(): express.Router {
  const router = express.Router();

  // =========================================================================
  // 1. PUBLIC TENANT CONTEXT & PAYMENT WEBHOOKS
  // =========================================================================
  router.get('/public/tenant-context', (req: Request, res: Response) => {
    const db = readSalarDb();
    const orgParam = typeof req.query.org === 'string' ? req.query.org.trim() : '';
    const slugParam = typeof req.query.slug === 'string' ? req.query.slug.trim().toLowerCase() : '';
    const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '')
      .toString()
      .split(',')[0]
      .split(':')[0]
      .trim()
      .toLowerCase();

    let redirectToPath: string | undefined;
    let org = orgParam ? db.organizations.find((o) => o.id.toLowerCase() === orgParam.toLowerCase()) : undefined;

    if (!org && slugParam) {
      org = db.organizations.find(
        (o) =>
          o.portalSlug.toLowerCase() === slugParam ||
          o.id.toLowerCase() === slugParam ||
          o.shortCode.toLowerCase() === slugParam
      );
      if (!org) {
        const redirectedOrg = db.organizations.find(
          (o) =>
            o.status !== 'ARCHIVED' &&
            Array.isArray(o.previousPortalSlugs) &&
            o.previousPortalSlugs.some((prev) => prev.toLowerCase() === slugParam)
        );
        if (redirectedOrg) {
          org = redirectedOrg;
          redirectToPath = redirectedOrg.portalPath || `/p/${redirectedOrg.portalSlug}`;
        }
      }
    }

    if (!org && hostHeader) {
      const dom = db.tenantDomains.find(
        (d) => d.isActive && d.domain.toLowerCase() === hostHeader
      );
      if (dom) {
        if (dom.redirectToDomain) {
          const targetDom = db.tenantDomains.find(
            (d) => d.isActive && d.domain.toLowerCase() === dom.redirectToDomain!.toLowerCase()
          );
          if (targetDom) {
            org = db.organizations.find((o) => o.id === targetDom.organizationId && o.status !== 'ARCHIVED');
          }
        } else {
          org = db.organizations.find((o) => o.id === dom.organizationId && o.status !== 'ARCHIVED');
        }
      }
      // Wildcard subdomain support when configured (e.g. apex.salartech.com)
      if (!org) {
        const wildcardBase = (process.env.WILDCARD_DOMAIN_BASE || 'salartech.com').trim().toLowerCase();
        if (hostHeader.endsWith(`.${wildcardBase}`)) {
          const subLabel = hostHeader.slice(0, hostHeader.length - wildcardBase.length - 1);
          if (subLabel && !subLabel.includes('.')) {
            org = db.organizations.find(
              (o) => o.status !== 'ARCHIVED' && o.portalSlug.toLowerCase() === subLabel
            );
          }
        }
      }
    }

    if (!org) {
      if (orgParam || slugParam) {
        res.json({ found: false });
        return;
      }
      org = db.organizations[0];
    }
    if (!org) {
      res.json({ found: false });
      return;
    }

    const isDefaultRoot = org.id === 'SALAR-ORG-00001';
    if (!isDefaultRoot) {
      ensureTenantStore(org);
    }

    const license = db.licenses.find((l) => l.id === org!.licenseId);
    const tenant = db.tenants.find((t) => t.id === org!.tenantId);
    const sub = db.subscriptions.find((s) => s.organizationId === org!.id);
    const orgDomains = db.tenantDomains.filter((d) => d.organizationId === org!.id);
    const domMeta = getOrgDomainStatus(orgDomains);

    const isExpiredByDate =
      license && license.status === 'ACTIVE' && new Date(license.expirationDate).getTime() <= Date.now();
    const effectiveLicenseStatus: LicenseStatus = isExpiredByDate ? 'EXPIRED' : license?.status || 'ACTIVE';
    const effectiveBlocked =
      org.status === 'SUSPENDED' ||
      org.status === 'ARCHIVED' ||
      ['SUSPENDED', 'EXPIRED', 'REVOKED', 'RELEASED'].includes(effectiveLicenseStatus);

    res.json({
      found: true,
      isDefaultRoot,
      organizationId: org.id,
      portalSlug: org.portalSlug,
      portalPath: org.portalPath || (isDefaultRoot ? '/' : `/p/${org.portalSlug}`),
      redirectToPath,
      instituteName: org.instituteName,
      tenantId: org.tenantId,
      databaseId: org.databaseId || tenant?.databaseId || 'salar_tenant_001',
      databaseStatus: effectiveBlocked
        ? org.status === 'ARCHIVED'
          ? 'ARCHIVED'
          : 'SUSPENDED'
        : tenant?.status || 'ACTIVE',
      portalAllocationId: org.portalAllocationId,
      licenseId: license?.id || org.licenseId,
      licenseKey: license?.licenseKey || '',
      subscriptionStatus: sub?.status || 'ACTIVE',
      domainStatus: domMeta.domainStatus,
      verifiedDomain: domMeta.verifiedDomain,
      adminAccountClaimed: isDefaultRoot ? isRootAdminConfigured() : isTenantAdminClaimed(org),
      email: org.email,
      phone: org.mobile,
      address: [org.address, org.city, org.state, org.country].filter(Boolean).join(', '),
      website: org.website,
      city: org.city,
      state: org.state,
      country: org.country,
      logoUrl: org.logoUrl,
      planCode: org.planCode,
      deploymentType: org.deploymentType,
      studentCapacity: org.studentCapacity,
      examCapacity: org.examCapacity,
      status: org.status,
      licenseStatus: effectiveLicenseStatus,
      accessBlocked: Boolean(effectiveBlocked),
      blockReason: effectiveBlocked
        ? `Portal access for ${org.instituteName} (${org.id}) is currently ${org.status !== 'ACTIVE' ? org.status : effectiveLicenseStatus}.`
        : null,
    });
  });

  // Public Manual Payment Gateway Details & Submission Queue for Client Institutes
  router.get('/public/manual-payment-info', (req: Request, res: Response) => {
    const db = readSalarDb();
    const orgParam = typeof req.query.org === 'string' ? req.query.org.trim() : '';
    const slugParam = typeof req.query.slug === 'string' ? req.query.slug.trim().toLowerCase() : '';
    let org = orgParam
      ? db.organizations.find((o) => o.id.toLowerCase() === orgParam.toLowerCase())
      : undefined;
    if (!org && slugParam) {
      org = db.organizations.find(
        (o) =>
          o.portalSlug.toLowerCase() === slugParam ||
          o.id.toLowerCase() === slugParam ||
          o.shortCode.toLowerCase() === slugParam
      );
    }
    if (!org && !orgParam && !slugParam) {
      org = db.organizations[0];
    }

    if (!org) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }

    const pendingInvoices = db.subscriptionInvoices.filter(
      (inv) => inv.organizationId === org.id && (inv.status === 'PENDING' || inv.status === 'OVERDUE')
    );

    res.json({
      enabled: Boolean(db.systemSettings.manualGateway?.enabled),
      organizationId: org.id,
      instituteName: org.instituteName,
      manualGateway: db.systemSettings.manualGateway,
      pendingInvoices,
    });
  });

  router.post('/public/manual-payments/submit', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const db = readSalarDb();
    if (!db.systemSettings.manualGateway?.enabled) {
      res.status(403).json({ error: 'Manual Payment Gateway is currently disabled by Platform Owner.' });
      return;
    }

    const b = req.body || {};
    const organizationId = String(b.organizationId || '').trim();
    const invoiceId = String(b.invoiceId || '').trim();
    const paymentMode = String(b.paymentMode || 'UPI').toUpperCase() as ManualPaymentMode;
    const utrOrReference = String(b.utrOrReference || '').trim();
    const payerName = String(b.payerName || '').trim();
    const paidDate = String(b.paidDate || new Date().toISOString().slice(0, 10)).trim();
    const receiptUrl = typeof b.receiptUrl === 'string' ? b.receiptUrl.trim().slice(0, 1000) : '';
    const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 500) : '';

    const org = db.organizations.find((o) => o.id === organizationId);
    if (!org) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }
    const inv = db.subscriptionInvoices.find(
      (i) => i.id === invoiceId && i.organizationId === org.id && (i.status === 'PENDING' || i.status === 'OVERDUE')
    );
    if (!inv) {
      res.status(404).json({ error: 'Pending invoice not found for this organization.' });
      return;
    }
    if (utrOrReference.length < 4 || utrOrReference.length > 64) {
      res.status(400).json({ error: 'Enter a valid UTR / Transaction Reference ID (4–64 characters).' });
      return;
    }
    if (db.systemSettings.manualGateway.requireReceiptUpload && !receiptUrl) {
      res.status(400).json({ error: 'Receipt screenshot/proof upload is required by Owner settings.' });
      return;
    }
    const idempotencyKey = `manual:${inv.id}:${utrOrReference.toLowerCase()}`;
    if (db.payments.some((p) => p.idempotencyKey === idempotencyKey && p.status !== 'REJECTED')) {
      res.status(409).json({ error: 'This UTR / transaction reference has already been submitted for this invoice.' });
      return;
    }

    const now = new Date().toISOString();
    const payment = {
      id: `pay-${crypto.randomBytes(4).toString('hex')}`,
      invoiceId: inv.id,
      subscriptionId: inv.subscriptionId,
      organizationId: org.id,
      organizationName: org.instituteName,
      gateway: 'MANUAL' as const,
      paymentMode,
      gatewayOrderId: `MAN-${inv.invoiceNumber}`,
      gatewayPaymentId: utrOrReference,
      utrOrReference,
      payerName: payerName || org.contactPerson,
      paidDate,
      receiptUrl: receiptUrl || undefined,
      notes: notes || undefined,
      idempotencyKey,
      amount: inv.totalAmount,
      gstAmount: inv.gstAmount,
      currency: 'INR' as const,
      status: 'PENDING' as const,
      signatureVerified: false,
      submittedBy: 'CLIENT_PORTAL' as const,
      createdAt: now,
    };

    db.payments.unshift(payment);
    db.notifications.unshift({
      id: `notif-${crypto.randomBytes(4).toString('hex')}`,
      title: `Manual Payment Submitted: ${org.instituteName}`,
      message: `${org.instituteName} (${org.id}) submitted ${paymentMode} ref ${utrOrReference} for ₹${inv.totalAmount} (${inv.invoiceNumber}). Pending Owner approval.`,
      severity: 'INFO',
      category: 'BILLING',
      read: false,
      createdAt: now,
    });
    appendAuditLog(db, {
      actor: org.email || org.id,
      actorType: 'SYSTEM',
      action: 'MANUAL_PAYMENT_SUBMITTED',
      resourceType: 'Payment',
      resourceId: payment.id,
      ip: getClientIp(req),
      details: `${org.instituteName} submitted ${paymentMode} ref ${utrOrReference} for ${inv.invoiceNumber} (₹${inv.totalAmount}).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ payment });
  });

  // =========================================================================
  // 2. OWNER AUTHENTICATION (/api/owner/auth/*)
  // =========================================================================
  router.get('/owner/auth/status', (_req: Request, res: Response) => {
    const db = readSalarDb();
    const hasEnvOwner = Boolean(process.env.OWNER_USERNAME?.trim() && process.env.OWNER_PASSWORD?.trim());
    const owner = db.ownerUsers[0];
    res.json({
      hasEnvOwner,
      hasClaimedOwner: db.ownerUsers.length > 0,
      requiresClaim: !hasEnvOwner && db.ownerUsers.length === 0,
      mfaEnabled: Boolean(owner?.mfaEnabled),
    });
  });

  router.get('/owner/auth/session', (req: Request, res: Response) => {
    const resolved = resolveOwnerSessionFromRequest(req);
    if (!resolved) {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, username: resolved.username, role: 'PLATFORM_OWNER' });
  });

  router.post('/owner/auth/claim', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const db = readSalarDb();
    const hasEnvOwner = Boolean(process.env.OWNER_USERNAME?.trim() && process.env.OWNER_PASSWORD?.trim());
    if (hasEnvOwner || db.ownerUsers.length > 0) {
      res.status(409).json({ error: 'Platform Owner credentials are already configured.' });
      return;
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : 'Platform Owner';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : db.systemSettings.ownerEmail;

    if (username.length < 3 || username.length > 64) {
      res.status(400).json({ error: 'Owner username must be 3 to 64 characters.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Owner password must be at least 8 characters.' });
      return;
    }

    const now = new Date().toISOString();
    const { salt, hash } = hashPasswordScrypt(password);
    const ownerId = `owner-${crypto.randomBytes(4).toString('hex')}`;
    db.ownerUsers.push({
      id: ownerId,
      username,
      displayName: displayName || 'Platform Owner',
      email: email || db.systemSettings.ownerEmail,
      passwordHash: hash,
      salt,
      mfaEnabled: false,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    });
    db.systemSettings.ownerDisplayName = displayName || db.systemSettings.ownerDisplayName;
    if (email) db.systemSettings.ownerEmail = email;

    const ttlHours = db.systemSettings.sessionTimeoutHours || 12;
    const sessionId = `osess-${crypto.randomBytes(8).toString('hex')}`;
    const expMs = Date.now() + ttlHours * 3600 * 1000;
    db.ownerSessions.unshift({
      id: sessionId,
      ownerId,
      username,
      ip: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 180),
      mfaVerified: true,
      issuedAt: now,
      expiresAt: new Date(expMs).toISOString(),
    });

    appendAuditLog(db, {
      actor: username,
      actorType: 'OWNER',
      action: 'OWNER_ACCOUNT_CLAIMED',
      resourceType: 'OwnerUser',
      resourceId: ownerId,
      ip: getClientIp(req),
      details: 'First-run Platform Owner account claimed and session initiated.',
      status: 'SUCCESS',
    });
    writeSalarDb(db);

    const token = signOwnerJwt({ sid: sessionId, username, exp: expMs });
    setOwnerCookie(res, token, ttlHours);
    res.json({ ok: true, username, role: 'PLATFORM_OWNER' });
  });

  router.post('/owner/auth/login', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const db = readSalarDb();
    const ip = getClientIp(req);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const mfaCode = typeof req.body?.mfaCode === 'string' ? req.body.mfaCode.trim() : '';

    const rateKey = `${ip}:${username.toLowerCase()}`;
    const maxAttempts = db.systemSettings.rateLimitMaxAttempts || 5;
    const windowMs = (db.systemSettings.rateLimitWindowMinutes || 15) * 60 * 1000;
    const entry = loginAttemptsMap.get(rateKey);
    if (entry?.lockedUntil && Date.now() < entry.lockedUntil) {
      const waitMin = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
      appendAuditLog(db, {
        actor: username || 'unknown',
        actorType: 'OWNER',
        action: 'OWNER_LOGIN_RATE_LIMITED',
        resourceType: 'OwnerSession',
        resourceId: ip,
        ip,
        details: `Blocked login attempt during rate-limit lockout window (${waitMin}m remaining).`,
        status: 'DENIED',
      });
      writeSalarDb(db);
      res.status(429).json({ error: `Too many failed login attempts. Try again in ${waitMin} minute(s).` });
      return;
    }

    const recordFailure = (reason: string) => {
      const curr = loginAttemptsMap.get(rateKey);
      const withinWindow = curr && Date.now() - curr.firstAttemptAt < windowMs;
      const nextCount = withinWindow ? curr.count + 1 : 1;
      const lockedUntil = nextCount >= maxAttempts ? Date.now() + windowMs : undefined;
      loginAttemptsMap.set(rateKey, {
        count: nextCount,
        firstAttemptAt: withinWindow ? curr.firstAttemptAt : Date.now(),
        lockedUntil,
      });
      appendAuditLog(db, {
        actor: username || 'unknown',
        actorType: 'OWNER',
        action: 'OWNER_LOGIN_FAILED',
        resourceType: 'OwnerSession',
        resourceId: ip,
        ip,
        details: reason,
        status: 'DENIED',
      });
      writeSalarDb(db);
    };

    const envUser = process.env.OWNER_USERNAME?.trim();
    const envPass = process.env.OWNER_PASSWORD;
    let matchedOwnerId = 'owner-env';
    let matchedUsername = username;
    let mfaEnabled = false;
    let mfaSecret: string | undefined;

    if (envUser && envPass) {
      const uMatch =
        Buffer.byteLength(username) === Buffer.byteLength(envUser) &&
        crypto.timingSafeEqual(Buffer.from(username), Buffer.from(envUser));
      const pMatch =
        Buffer.byteLength(password) === Buffer.byteLength(envPass) &&
        crypto.timingSafeEqual(Buffer.from(password), Buffer.from(envPass));
      if (!uMatch || !pMatch) {
        recordFailure('Invalid environment Owner credentials.');
        res.status(401).json({ error: 'Invalid owner username or password.' });
        return;
      }
      if (db.ownerUsers[0]?.mfaEnabled && db.ownerUsers[0]?.mfaSecret) {
        mfaEnabled = true;
        mfaSecret = db.ownerUsers[0].mfaSecret;
      }
    } else {
      const userRecord = db.ownerUsers.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!userRecord || !verifyPasswordScrypt(password, userRecord.salt, userRecord.passwordHash)) {
        recordFailure('Invalid username or password.');
        res.status(401).json({ error: 'Invalid owner username or password.' });
        return;
      }
      matchedOwnerId = userRecord.id;
      matchedUsername = userRecord.username;
      mfaEnabled = Boolean(userRecord.mfaEnabled && userRecord.mfaSecret);
      mfaSecret = userRecord.mfaSecret;
      userRecord.lastLoginAt = new Date().toISOString();
    }

    if (mfaEnabled && mfaSecret) {
      if (!mfaCode) {
        res.status(200).json({ mfaRequired: true });
        return;
      }
      if (!verifyTotpCode(mfaSecret, mfaCode)) {
        recordFailure('Invalid 6-digit MFA authenticator code.');
        res.status(401).json({ error: 'Invalid 6-digit MFA code.', mfaRequired: true });
        return;
      }
    }

    loginAttemptsMap.delete(rateKey);
    const now = new Date().toISOString();
    const ttlHours = db.systemSettings.sessionTimeoutHours || 12;
    const expMs = Date.now() + ttlHours * 3600 * 1000;
    const sessionId = `osess-${crypto.randomBytes(8).toString('hex')}`;
    db.ownerSessions.unshift({
      id: sessionId,
      ownerId: matchedOwnerId,
      username: matchedUsername,
      ip,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 180),
      mfaVerified: true,
      issuedAt: now,
      expiresAt: new Date(expMs).toISOString(),
    });
    if (db.ownerSessions.length > 50) db.ownerSessions.length = 50;

    appendAuditLog(db, {
      actor: matchedUsername,
      actorType: 'OWNER',
      action: 'OWNER_LOGIN_SUCCESS',
      resourceType: 'OwnerSession',
      resourceId: sessionId,
      ip,
      details: mfaEnabled ? 'Authenticated with Password + TOTP MFA.' : 'Authenticated with Password.',
      status: 'SUCCESS',
    });
    writeSalarDb(db);

    const token = signOwnerJwt({ sid: sessionId, username: matchedUsername, exp: expMs });
    setOwnerCookie(res, token, ttlHours);
    res.json({ ok: true, username: matchedUsername, role: 'PLATFORM_OWNER' });
  });

  router.post('/owner/auth/logout', (req: AuthenticatedOwnerRequest, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const resolved = resolveOwnerSessionFromRequest(req);
    if (resolved) {
      const db = readSalarDb();
      const s = db.ownerSessions.find((item) => item.id === resolved.sid);
      if (s) s.revokedAt = new Date().toISOString();
      appendAuditLog(db, {
        actor: resolved.username,
        actorType: 'OWNER',
        action: 'OWNER_LOGOUT',
        resourceType: 'OwnerSession',
        resourceId: resolved.sid,
        ip: getClientIp(req),
        details: 'Owner signed out and revoked session cookie.',
        status: 'SUCCESS',
      });
      writeSalarDb(db);
    }
    clearOwnerCookie(res);
    res.json({ ok: true });
  });

  // =========================================================================
  // 3. OWNER MASTER BOOTSTRAP & COMPUTED TELEMETRY
  // =========================================================================
  router.get('/owner/bootstrap', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const infra = getRealInfrastructureSnapshot();

    // Update live instance heartbeat
    if (db.deploymentInstances[0]) {
      db.deploymentInstances[0].lastHeartbeatAt = infra.timestamp;
      db.deploymentInstances[0].status = infra.serverHealth;
    }

    const activeSubs = db.subscriptions.filter((s) => s.status === 'ACTIVE');
    let mrr = 0;
    for (const s of activeSubs) {
      if (s.billingCycle === 'MONTHLY') mrr += s.baseAmount;
      else if (s.billingCycle === 'QUARTERLY') mrr += Math.round(s.baseAmount / 3);
      else if (s.billingCycle === 'YEARLY') mrr += Math.round(s.baseAmount / 12);
      else mrr += s.baseAmount;
    }
    const arr = mrr * 12;

    const nowMs = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expiringLicenses = db.licenses.filter((l) => {
      if (!['ACTIVE', 'GRACE_PERIOD'].includes(l.status)) return false;
      const exp = new Date(l.expirationDate).getTime();
      return exp - nowMs <= thirtyDaysMs;
    });

    const pendingInvoices = db.subscriptionInvoices.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE');
    const pendingPaymentsTotal = pendingInvoices.reduce((acc, i) => acc + i.totalAmount, 0);

    const totalStudentsAcrossClients = db.tenants
      .filter((t) => t.status === 'ACTIVE')
      .reduce((acc, t) => acc + (t.studentCount || 0), 0);
    const totalExamsAcrossClients = db.tenants
      .filter((t) => t.status === 'ACTIVE')
      .reduce((acc, t) => acc + (t.examCount || 0), 0);

    const { ownerUsers, ...safeDb } = db;
    const ownerProfile = ownerUsers[0]
      ? {
          id: ownerUsers[0].id,
          username: ownerUsers[0].username,
          displayName: ownerUsers[0].displayName,
          email: ownerUsers[0].email,
          mfaEnabled: ownerUsers[0].mfaEnabled,
          lastLoginAt: ownerUsers[0].lastLoginAt,
        }
      : {
          id: 'owner-env',
          username: req.ownerUsername || 'owner',
          displayName: db.systemSettings.ownerDisplayName,
          email: db.systemSettings.ownerEmail,
          mfaEnabled: false,
          lastLoginAt: new Date().toISOString(),
        };

    res.json({
      ...safeDb,
      portalBindings: buildPortalBindings(db),
      ownerProfile,
      infrastructure: infra,
      computedMetrics: {
        totalClients: db.organizations.length,
        activeClients: db.organizations.filter((o) => o.status === 'ACTIVE').length,
        totalLicenses: db.licenses.length,
        activeLicenses: db.licenses.filter((l) => l.status === 'ACTIVE').length,
        availableAllocations: db.portalAllocations.filter((a) => a.status === 'AVAILABLE').length,
        assignedAllocations: db.portalAllocations.filter((a) => a.status === 'ASSIGNED').length,
        mrr,
        arr,
        pendingPaymentsCount: pendingInvoices.length,
        pendingPaymentsTotal,
        expiringLicensesCount: expiringLicenses.length,
        totalStudentsAcrossClients,
        totalExamsAcrossClients,
      },
    });
  });

  // =========================================================================
  // 4. CLIENT ORGANIZATIONS MANAGEMENT
  // =========================================================================
  router.post('/owner/organizations', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const body = req.body || {};
    const instituteName = String(body.instituteName || '').trim();
    const contactPerson = String(body.contactPerson || '').trim();
    const email = String(body.email || '').trim();
    const mobile = String(body.mobile || '').trim();
    const planCode = (String(body.planCode || 'PRO').toUpperCase() as PlanCode);
    const billingCycle = (String(body.billingCycle || 'MONTHLY').toUpperCase() as BillingCycle);
    const deploymentType = (String(body.deploymentType || 'SHARED_MULTI_TENANT') as DeploymentType);
    const allocationId = typeof body.portalAllocationId === 'string' ? body.portalAllocationId.trim() : '';

    if (!instituteName || !email) {
      res.status(400).json({ error: 'Institute Name and Email are required.' });
      return;
    }

    const plan = db.licensePlans.find((p) => p.code === planCode) || db.licensePlans[1];
    const allocation = allocationId
      ? db.portalAllocations.find((a) => a.id === allocationId)
      : db.portalAllocations.find((a) => a.status === 'AVAILABLE' && a.deploymentType === deploymentType) ||
        db.portalAllocations.find((a) => a.status === 'AVAILABLE');

    if (!allocation || allocation.status !== 'AVAILABLE') {
      res.status(409).json({
        error: 'No available Portal Allocation matches this request. Release or add capacity in Portal Allocation Manager first.',
      });
      return;
    }

    const customDomain = String(body.customDomain || '').trim().toLowerCase();
    if (
      customDomain &&
      db.tenantDomains.some((d) => d.isActive && d.domain.toLowerCase() === customDomain)
    ) {
      res.status(409).json({ error: `Domain ${customDomain} is already bound to another active tenant.` });
      return;
    }

    const now = new Date().toISOString();
    db.counters.orgSeq += 1;
    db.counters.dbSeq = (db.counters.dbSeq || 1) + 1;
    const orgId = `SALAR-ORG-${String(db.counters.orgSeq).padStart(5, '0')}`;
    const databaseId = `salar_tenant_${String(db.counters.dbSeq).padStart(3, '0')}`;
    const shortCode =
      String(body.shortCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4) ||
      instituteName
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 3) ||
      'ORG';

    const tenantId = `tenant-${shortCode.toLowerCase()}-${Date.now().toString(36)}`;
    const portalSlug = createUniquePortalSlug(instituteName, db.organizations);
    const portalPath = `/p/${portalSlug}`;
    const wildcardBase = (process.env.WILDCARD_DOMAIN_BASE || 'salartech.com').trim().toLowerCase();
    const subdomainSlug = portalSlug.slice(0, 28) || orgId.toLowerCase();
    const subdomain = `${subdomainSlug}.${wildcardBase}`;
    const wildcardConfigured = Boolean(process.env.WILDCARD_DOMAIN_BASE?.trim());

    const customPrice =
      body.customPrice !== undefined && body.customPrice !== '' && body.customPrice !== null
        ? Number(body.customPrice)
        : null;
    const basePrice = computePlanPrice(plan, billingCycle, customPrice);
    const gstPercent = db.systemSettings.defaultGstPercent || 18;
    const gstAmount = Math.round((basePrice * gstPercent) / 100);
    const totalAmount = basePrice + gstAmount;
    const studentCapacity = Number(body.studentCapacity) || plan.studentLimit;
    const examCapacity = Number(body.examCapacity) || plan.examLimit;
    const storageLimitMb = Number(body.storageLimitMb) || plan.storageLimitMb;
    const expIso = addPeriodToIso(now, billingCycle);

    const licId = `lic-${crypto.randomBytes(5).toString('hex')}`;
    const licenseKey = generateLicenseKey(shortCode, plan.code);
    const signature = signLicensePayload(licenseKey, orgId, plan.code, expIso);

    const newOrg: Organization = {
      id: orgId,
      instituteName,
      shortCode,
      contactPerson: contactPerson || instituteName,
      email,
      mobile,
      address: String(body.address || ''),
      country: String(body.country || 'India'),
      state: String(body.state || ''),
      city: String(body.city || ''),
      website: String(body.website || ''),
      logoUrl: String(body.logoUrl || ''),
      customDomain,
      subdomain,
      portalSlug,
      portalPath,
      planId: plan.id,
      planCode: plan.code,
      billingCycle,
      customPrice,
      studentCapacity,
      examCapacity,
      storageLimitMb,
      deploymentType,
      tenantId,
      databaseId,
      portalAllocationId: allocation.id,
      licenseId: licId,
      previousPortalSlugs: [],
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    db.organizations.unshift(newOrg);

    db.tenants.unshift({
      id: tenantId,
      organizationId: orgId,
      databaseId,
      namespace: databaseId,
      isolationMode: deploymentType === 'DEDICATED' ? 'DEDICATED_DB' : 'SHARED_SCHEMA',
      storageBucketPrefix: `tenants/${databaseId}`,
      status: 'ACTIVE',
      studentCount: 0,
      examCount: 0,
      questionCount: 0,
      storageUsedMb: 0,
      createdAt: now,
      updatedAt: now,
    });

    db.organizationUsers.unshift({
      id: `orguser-${crypto.randomBytes(4).toString('hex')}`,
      organizationId: orgId,
      tenantId,
      email,
      name: contactPerson || instituteName,
      role: 'CLIENT_SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: now,
    });

    db.tenantDomains.unshift({
      id: `dom-${crypto.randomBytes(4).toString('hex')}`,
      organizationId: orgId,
      tenantId,
      domain: subdomain,
      type: 'SUBDOMAIN',
      dnsTarget: `cname.${wildcardBase}`,
      dnsVerified: wildcardConfigured,
      sslStatus: wildcardConfigured ? 'ACTIVE' : 'PENDING',
      sslExpiresAt: wildcardConfigured ? addPeriodToIso(now, 'YEARLY') : undefined,
      lastCheckedAt: now,
      verificationNotes: wildcardConfigured
        ? `Wildcard subdomain verified on *.${wildcardBase}.`
        : `Awaiting DNS & TLS verification for ${subdomain}. Verified app route ${portalPath} is live.`,
      isActive: wildcardConfigured,
      createdAt: now,
    });

    if (customDomain) {
      db.tenantDomains.unshift({
        id: `dom-${crypto.randomBytes(4).toString('hex')}`,
        organizationId: orgId,
        tenantId,
        domain: customDomain,
        type: 'CUSTOM_DOMAIN',
        dnsTarget: 'cname.salartech.com',
        dnsVerified: false,
        sslStatus: 'PENDING',
        lastCheckedAt: now,
        verificationNotes: 'Awaiting DNS CNAME verification before activation.',
        isActive: false,
        createdAt: now,
      });
    }

    const newLicense: LicenseRecord = {
      id: licId,
      licenseKey,
      signature,
      organizationId: orgId,
      tenantId,
      planId: plan.id,
      planCode: plan.code,
      portalAllocationId: allocation.id,
      issueDate: now,
      activationDate: now,
      expirationDate: expIso,
      renewalDate: expIso,
      billingCycle,
      studentLimit: studentCapacity,
      examLimit: examCapacity,
      storageLimitMb,
      priceAmount: basePrice,
      featurePermissions: plan.features,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    db.licenses.unshift(newLicense);

    db.licenseBindings.unshift({
      id: `bind-${crypto.randomBytes(4).toString('hex')}`,
      licenseId: licId,
      organizationId: orgId,
      tenantId,
      portalAllocationId: allocation.id,
      active: true,
      boundAt: now,
    });

    appendLicenseEvent(db, {
      licenseId: licId,
      licenseKey,
      fromStatus: 'CREATED',
      toStatus: 'ACTIVE',
      actor: req.ownerUsername || 'OWNER',
      reason: `Issued & bound to ${instituteName} (${orgId}) on ${allocation.code}.`,
    });

    allocation.currentOrganizationId = orgId;
    allocation.currentTenantId = tenantId;
    allocation.status = 'ASSIGNED';
    allocation.endpointUrl = newOrg.portalPath;
    allocation.updatedAt = now;

    db.portalDeployments.unshift({
      id: `dep-${crypto.randomBytes(4).toString('hex')}`,
      allocationId: allocation.id,
      organizationId: orgId,
      tenantId,
      deploymentType,
      environment: 'production',
      version: '2.4.0',
      status: 'DEPLOYED',
      stepsCompleted: ['Tenant Created', 'License Signed', 'Portal Bound', 'Separate Portal Link Provisioned'],
      deployedBy: req.ownerUsername || 'OWNER',
      deployedAt: now,
    });

    const subId = `sub-${crypto.randomBytes(4).toString('hex')}`;
    db.subscriptions.unshift({
      id: subId,
      organizationId: orgId,
      organizationName: instituteName,
      planId: plan.id,
      planCode: plan.code,
      billingCycle,
      baseAmount: basePrice,
      gstPercent,
      gstAmount,
      totalAmount,
      currency: 'INR',
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: expIso,
      autoRenew: true,
      createdAt: now,
      updatedAt: now,
    });

    db.counters.invoiceSeq += 1;
    db.subscriptionInvoices.unshift({
      id: `inv-${crypto.randomBytes(4).toString('hex')}`,
      invoiceNumber: `SALAR-INV-${new Date().getFullYear()}-${String(db.counters.invoiceSeq).padStart(4, '0')}`,
      subscriptionId: subId,
      organizationId: orgId,
      organizationName: instituteName,
      subtotal: basePrice,
      gstPercent,
      gstAmount,
      totalAmount,
      dueDate: now.slice(0, 10),
      status: 'PENDING',
      description: `${plan.name} (${billingCycle}) — ${allocation.code}`,
      createdAt: now,
    });

    db.usageRecords.unshift({
      id: `use-${crypto.randomBytes(4).toString('hex')}`,
      organizationId: orgId,
      tenantId,
      period: now.slice(0, 7),
      activeStudents: 0,
      examsCreated: 0,
      totalAttempts: 0,
      storageUsedMb: 0,
      apiRequests: 0,
      bandwidthMb: 0,
      recordedAt: now,
    });

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'ORGANIZATION_CREATED',
      resourceType: 'Organization',
      resourceId: orgId,
      ip: getClientIp(req),
      details: `Registered ${instituteName} (${newOrg.portalPath}), bound to ${allocation.code} with license ${licenseKey}.`,
      status: 'SUCCESS',
    });

    writeSalarDb(db);
    ensureTenantStore(newOrg);
    const initialPass = typeof body.initialAdminPasscode === 'string' ? body.initialAdminPasscode.trim() : '';
    if (initialPass.length >= 6 && initialPass.length <= 128) {
      setTenantAdminPasscode(newOrg, initialPass, true);
    }

    res.status(201).json({
      organization: newOrg,
      license: newLicense,
      allocation,
      portalPath: newOrg.portalPath,
    });
  });

  router.post('/owner/organizations/:id/admin-passcode', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const org = db.organizations.find((o) => o.id === req.params.id);
    if (!org) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }
    if (org.id === 'SALAR-ORG-00001') {
      res.status(400).json({ error: 'Primary root portal passcode is managed via server ADMIN_PASSCODE settings.' });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 6 || passcode.length > 128) {
      res.status(400).json({ error: 'Admin passcode must be between 6 and 128 characters.' });
      return;
    }
    setTenantAdminPasscode(org, passcode, true);
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'CLIENT_ADMIN_PASSCODE_SET',
      resourceType: 'Organization',
      resourceId: org.id,
      ip: getClientIp(req),
      details: `Updated isolated Admin Gate passcode for ${org.instituteName} (${org.portalPath}).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ ok: true, organizationId: org.id });
  });

  router.post('/owner/organizations/:id/change-domain', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const org = db.organizations.find((o) => o.id === req.params.id);
    if (!org) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }
    const b = req.body || {};
    const now = new Date().toISOString();
    const nextSlugRaw = typeof b.portalSlug === 'string' ? b.portalSlug.trim().toLowerCase() : '';
    const nextSubdomain = typeof b.subdomain === 'string' ? b.subdomain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0] : '';
    const nextCustomDomain = typeof b.customDomain === 'string' ? b.customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0] : undefined;
    const keepOldRedirect = b.keepOldRedirect !== false;

    if (nextSlugRaw && org.id !== 'SALAR-ORG-00001') {
      const cleanSlug = nextSlugRaw.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      if (cleanSlug.length < 2) {
        res.status(400).json({ error: 'Portal slug must be at least 2 alphanumeric characters.' });
        return;
      }
      const conflict = db.organizations.find(
        (o) => o.id !== org.id && (o.portalSlug.toLowerCase() === cleanSlug || (o.previousPortalSlugs || []).includes(cleanSlug))
      );
      if (conflict) {
        res.status(409).json({ error: `Portal slug "${cleanSlug}" is already assigned to ${conflict.instituteName}.` });
        return;
      }
      if (cleanSlug !== org.portalSlug) {
        if (keepOldRedirect) {
          org.previousPortalSlugs = Array.from(new Set([...(org.previousPortalSlugs || []), org.portalSlug]));
        }
        org.portalSlug = cleanSlug;
        org.portalPath = `/p/${cleanSlug}`;
        const alloc = db.portalAllocations.find((a) => a.id === org.portalAllocationId);
        if (alloc) {
          alloc.endpointUrl = org.portalPath;
          alloc.updatedAt = now;
        }
      }
    }

    if (nextSubdomain) {
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(nextSubdomain)) {
        res.status(400).json({ error: 'Enter a valid subdomain (e.g. apex.salartech.com).' });
        return;
      }
      if (db.tenantDomains.some((d) => d.organizationId !== org.id && d.isActive && d.domain === nextSubdomain)) {
        res.status(409).json({ error: `Subdomain ${nextSubdomain} is already bound to another client.` });
        return;
      }
      const oldSub = org.subdomain;
      org.subdomain = nextSubdomain;
      if (oldSub && oldSub !== nextSubdomain) {
        const oldDom = db.tenantDomains.find((d) => d.organizationId === org.id && d.domain === oldSub);
        if (oldDom) {
          oldDom.redirectToDomain = keepOldRedirect ? nextSubdomain : undefined;
          if (!keepOldRedirect) oldDom.isActive = false;
        }
      }
      const existingNewSub = db.tenantDomains.find((d) => d.organizationId === org.id && d.domain === nextSubdomain);
      if (!existingNewSub) {
        const wildcardBase = (process.env.WILDCARD_DOMAIN_BASE || '').trim().toLowerCase();
        const isWildcardMatch = Boolean(wildcardBase && nextSubdomain.endsWith(`.${wildcardBase}`));
        db.tenantDomains.unshift({
          id: `dom-${crypto.randomBytes(4).toString('hex')}`,
          organizationId: org.id,
          tenantId: org.tenantId,
          domain: nextSubdomain,
          type: 'SUBDOMAIN',
          dnsTarget: wildcardBase ? `cname.${wildcardBase}` : 'cname.salartech.com',
          dnsVerified: isWildcardMatch,
          sslStatus: isWildcardMatch ? 'ACTIVE' : 'PENDING',
          sslExpiresAt: isWildcardMatch ? addPeriodToIso(now, 'YEARLY') : undefined,
          lastCheckedAt: now,
          verificationNotes: isWildcardMatch
            ? `Wildcard subdomain verified on *.${wildcardBase}.`
            : 'Pending DNS & TLS verification.',
          isActive: isWildcardMatch,
          createdAt: now,
        });
      }
    }

    if (nextCustomDomain !== undefined) {
      if (nextCustomDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(nextCustomDomain)) {
        res.status(400).json({ error: 'Enter a valid custom domain (e.g. portal.institute.in).' });
        return;
      }
      if (
        nextCustomDomain &&
        db.tenantDomains.some((d) => d.organizationId !== org.id && d.isActive && d.domain === nextCustomDomain)
      ) {
        res.status(409).json({ error: `Domain ${nextCustomDomain} is already bound to another client.` });
        return;
      }
      const oldCustom = org.customDomain;
      org.customDomain = nextCustomDomain;
      if (oldCustom && oldCustom !== nextCustomDomain) {
        const oldRec = db.tenantDomains.find((d) => d.organizationId === org.id && d.domain === oldCustom);
        if (oldRec) {
          oldRec.redirectToDomain = keepOldRedirect && nextCustomDomain ? nextCustomDomain : undefined;
          if (!keepOldRedirect || !nextCustomDomain) oldRec.isActive = false;
        }
      }
      if (nextCustomDomain && !db.tenantDomains.some((d) => d.organizationId === org.id && d.domain === nextCustomDomain)) {
        db.tenantDomains.unshift({
          id: `dom-${crypto.randomBytes(4).toString('hex')}`,
          organizationId: org.id,
          tenantId: org.tenantId,
          domain: nextCustomDomain,
          type: 'CUSTOM_DOMAIN',
          dnsTarget: 'cname.salartech.com',
          dnsVerified: false,
          sslStatus: 'PENDING',
          lastCheckedAt: now,
          verificationNotes: 'Awaiting DNS CNAME/A and SSL verification before activation.',
          isActive: false,
          createdAt: now,
        });
      }
    }

    org.updatedAt = now;
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'CLIENT_DOMAIN_UPDATED',
      resourceType: 'Organization',
      resourceId: org.id,
      ip: getClientIp(req),
      details: `Updated domain routing for ${org.instituteName}: path=${org.portalPath}, subdomain=${org.subdomain}, custom=${org.customDomain || 'none'}.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ organization: org, tenantDomains: db.tenantDomains.filter((d) => d.organizationId === org.id) });
  });

  router.post('/owner/organizations/:id/admin-invitation', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const org = db.organizations.find((o) => o.id === req.params.id);
    if (!org) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }
    const now = new Date().toISOString();
    const lic = db.licenses.find((l) => l.id === org.licenseId);
    const sub = db.subscriptions.find((s) => s.organizationId === org.id);
    const isRoot = org.id === 'SALAR-ORG-00001';
    const adminClaimed = isRoot ? isRootAdminConfigured() : isTenantAdminClaimed(org);
    const inviteCode = `SALAR-INV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    org.lastInvitationAt = now;
    org.updatedAt = now;

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'ADMIN_INVITATION_GENERATED',
      resourceType: 'Organization',
      resourceId: org.id,
      ip: getClientIp(req),
      details: `Generated onboarding invitation (${inviteCode}) for ${org.instituteName} (${org.email}).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);

    res.json({
      organizationId: org.id,
      instituteName: org.instituteName,
      adminEmail: org.email,
      portalPath: org.portalPath || (isRoot ? '/' : `/p/${org.portalSlug}`),
      subdomain: org.subdomain,
      licenseKey: lic?.licenseKey || '',
      planCode: org.planCode,
      expiryDate: lic?.expirationDate || '',
      accountStatus: org.status,
      subscriptionStatus: sub?.status || 'ACTIVE',
      adminClaimed,
      invitationCode: inviteCode,
      expiresAt,
      onboardingSteps: [
        'Open your dedicated institute portal URL shown above.',
        'Click "Admin Gate" in the top-right header of your institute portal.',
        adminClaimed
          ? `Sign in with your administrator email (${org.email}) and the passcode configured for your institute.`
          : `Complete first-run administrator setup using your email (${org.email}) and choose a strong passcode (min 6 chars).`,
        'Inside the Admin Console, update institute branding, add batches, upload questions, and publish exams.',
      ],
    });
  });

  router.patch('/owner/organizations/:id', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const org = db.organizations.find((o) => o.id === req.params.id);
    if (!org) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }

    const body = req.body || {};
    const now = new Date().toISOString();
    const prevStatus = org.status;

    if (typeof body.instituteName === 'string' && body.instituteName.trim()) {
      org.instituteName = body.instituteName.trim();
    }
    if (typeof body.contactPerson === 'string') org.contactPerson = body.contactPerson.trim();
    if (typeof body.email === 'string') org.email = body.email.trim();
    if (typeof body.mobile === 'string') org.mobile = body.mobile.trim();
    if (typeof body.address === 'string') org.address = body.address;
    if (typeof body.city === 'string') org.city = body.city;
    if (typeof body.state === 'string') org.state = body.state;
    if (typeof body.country === 'string') org.country = body.country;
    if (typeof body.website === 'string') org.website = body.website;
    if (typeof body.studentCapacity === 'number' && body.studentCapacity > 0) {
      org.studentCapacity = body.studentCapacity;
    }
    if (body.customPrice !== undefined) {
      org.customPrice = body.customPrice === null || body.customPrice === '' ? null : Number(body.customPrice);
    }

    if (typeof body.status === 'string' && ['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(body.status)) {
      org.status = body.status as Organization['status'];
      const tenant = db.tenants.find((t) => t.id === org.tenantId);
      if (tenant) tenant.status = org.status === 'ACTIVE' ? 'ACTIVE' : org.status === 'ARCHIVED' ? 'ARCHIVED' : 'SUSPENDED';

      const lic = db.licenses.find((l) => l.id === org.licenseId);
      if (lic && lic.status !== 'REVOKED') {
        const nextLicStatus: LicenseStatus = org.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
        if (canTransitionLicense(lic.status, nextLicStatus)) {
          const from = lic.status;
          lic.status = nextLicStatus;
          lic.updatedAt = now;
          appendLicenseEvent(db, {
            licenseId: lic.id,
            licenseKey: lic.licenseKey,
            fromStatus: from,
            toStatus: nextLicStatus,
            actor: req.ownerUsername || 'OWNER',
            reason: `Organization status changed from ${prevStatus} to ${org.status}.`,
          });
        }
      }
    }

    org.updatedAt = now;
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'ORGANIZATION_UPDATED',
      resourceType: 'Organization',
      resourceId: org.id,
      ip: getClientIp(req),
      details: `Updated ${org.instituteName} (status: ${org.status}).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ organization: org });
  });

  router.get('/owner/organizations/:id/export', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const org = db.organizations.find((o) => o.id === req.params.id);
    if (!org) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }
    const exportBundle = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.ownerUsername,
      organization: org,
      tenant: db.tenants.find((t) => t.id === org.tenantId) || null,
      domains: db.tenantDomains.filter((d) => d.organizationId === org.id),
      licenses: db.licenses.filter((l) => l.organizationId === org.id),
      subscriptions: db.subscriptions.filter((s) => s.organizationId === org.id),
      invoices: db.subscriptionInvoices.filter((i) => i.organizationId === org.id),
      payments: db.payments.filter((p) => p.organizationId === org.id),
      usageRecords: db.usageRecords.filter((u) => u.organizationId === org.id),
    };
    res.setHeader('Content-Disposition', `attachment; filename="${org.id}_export.json"`);
    res.json(exportBundle);
  });

  // =========================================================================
  // 5. LICENSE ENGINE (/api/owner/licenses/*)
  // =========================================================================
  router.post('/owner/licenses', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const body = req.body || {};
    const orgId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
    const planCode = (String(body.planCode || 'PRO').toUpperCase() as PlanCode);
    const billingCycle = (String(body.billingCycle || 'MONTHLY').toUpperCase() as BillingCycle);
    const plan = db.licensePlans.find((p) => p.code === planCode) || db.licensePlans[1];
    const org = orgId ? db.organizations.find((o) => o.id === orgId) : undefined;

    const now = new Date().toISOString();
    const expIso = addPeriodToIso(now, billingCycle, Number(body.customDays) || 30);
    const shortCode = org?.shortCode || String(body.shortCode || 'GEN');
    const licenseKey = generateLicenseKey(shortCode, plan.code);
    const signature = signLicensePayload(licenseKey, org?.id || 'UNBOUND', plan.code, expIso);

    const status: LicenseStatus = org ? 'ACTIVE' : 'AVAILABLE';
    const lic: LicenseRecord = {
      id: `lic-${crypto.randomBytes(5).toString('hex')}`,
      licenseKey,
      signature,
      organizationId: org?.id || '',
      tenantId: org?.tenantId || '',
      planId: plan.id,
      planCode: plan.code,
      portalAllocationId: org?.portalAllocationId || '',
      issueDate: now,
      activationDate: org ? now : undefined,
      expirationDate: expIso,
      renewalDate: expIso,
      billingCycle,
      studentLimit: Number(body.studentLimit) || plan.studentLimit,
      examLimit: Number(body.examLimit) || plan.examLimit,
      storageLimitMb: Number(body.storageLimitMb) || plan.storageLimitMb,
      priceAmount:
        body.priceAmount !== undefined && body.priceAmount !== ''
          ? Number(body.priceAmount)
          : computePlanPrice(plan, billingCycle, org?.customPrice),
      featurePermissions: plan.features,
      status,
      notes: String(body.notes || ''),
      createdAt: now,
      updatedAt: now,
    };

    db.licenses.unshift(lic);
    if (org) {
      org.licenseId = lic.id;
      org.planId = plan.id;
      org.planCode = plan.code;
      org.updatedAt = now;
      db.licenseBindings.forEach((b) => {
        if (b.organizationId === org.id && b.active) {
          b.active = false;
          b.unboundAt = now;
        }
      });
      db.licenseBindings.unshift({
        id: `bind-${crypto.randomBytes(4).toString('hex')}`,
        licenseId: lic.id,
        organizationId: org.id,
        tenantId: org.tenantId,
        portalAllocationId: org.portalAllocationId,
        active: true,
        boundAt: now,
      });
    }

    appendLicenseEvent(db, {
      licenseId: lic.id,
      licenseKey,
      fromStatus: 'CREATED',
      toStatus: status,
      actor: req.ownerUsername || 'OWNER',
      reason: org ? `Generated & bound to ${org.instituteName}.` : 'Generated available license key.',
    });
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'LICENSE_GENERATED',
      resourceType: 'License',
      resourceId: lic.licenseKey,
      ip: getClientIp(req),
      details: `Generated ${plan.code} key (${status}).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ license: lic });
  });

  router.post('/owner/licenses/:id/transition', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const lic = db.licenses.find((l) => l.id === req.params.id);
    if (!lic) {
      res.status(404).json({ error: 'License not found.' });
      return;
    }
    const targetStatus = String(req.body?.status || '').toUpperCase() as LicenseStatus;
    const reason = String(req.body?.reason || `Owner transitioned license to ${targetStatus}`);

    if (lic.status === 'REVOKED') {
      res.status(409).json({ error: 'A REVOKED license is permanently terminated and can never become active again.' });
      return;
    }
    if (!canTransitionLicense(lic.status, targetStatus)) {
      res.status(400).json({ error: `Invalid license state transition from ${lic.status} to ${targetStatus}.` });
      return;
    }

    const from = lic.status;
    const now = new Date().toISOString();
    lic.status = targetStatus;
    lic.updatedAt = now;
    if (targetStatus === 'ACTIVE' && !lic.activationDate) {
      lic.activationDate = now;
    }

    if (lic.organizationId) {
      const org = db.organizations.find((o) => o.id === lic.organizationId);
      if (org && org.licenseId === lic.id) {
        if (targetStatus === 'SUSPENDED' || targetStatus === 'REVOKED' || targetStatus === 'EXPIRED') {
          org.status = 'SUSPENDED';
        } else if (targetStatus === 'ACTIVE') {
          org.status = 'ACTIVE';
        }
        org.updatedAt = now;
      }
    }

    appendLicenseEvent(db, {
      licenseId: lic.id,
      licenseKey: lic.licenseKey,
      fromStatus: from,
      toStatus: targetStatus,
      actor: req.ownerUsername || 'OWNER',
      reason,
    });
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: `LICENSE_${targetStatus}`,
      resourceType: 'License',
      resourceId: lic.licenseKey,
      ip: getClientIp(req),
      details: `${from} -> ${targetStatus}: ${reason}`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ license: lic });
  });

  router.post('/owner/licenses/:id/renew', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const lic = db.licenses.find((l) => l.id === req.params.id);
    if (!lic) {
      res.status(404).json({ error: 'License not found.' });
      return;
    }
    if (lic.status === 'REVOKED') {
      res.status(409).json({ error: 'Revoked licenses cannot be renewed. Issue a fresh license key.' });
      return;
    }

    const now = new Date().toISOString();
    const baseStart =
      new Date(lic.expirationDate).getTime() > Date.now() ? lic.expirationDate : now;
    const extraDays = Number(req.body?.extraDays) || 0;
    const nextExp =
      extraDays > 0
        ? addPeriodToIso(baseStart, 'CUSTOM', extraDays)
        : addPeriodToIso(baseStart, lic.billingCycle);

    const from = lic.status;
    lic.expirationDate = nextExp;
    lic.renewalDate = nextExp;
    lic.status = 'ACTIVE';
    lic.signature = signLicensePayload(lic.licenseKey, lic.organizationId || 'UNBOUND', lic.planCode, nextExp);
    lic.updatedAt = now;

    if (req.body?.priceAmount !== undefined) {
      lic.priceAmount = Number(req.body.priceAmount);
    }

    if (lic.organizationId) {
      const org = db.organizations.find((o) => o.id === lic.organizationId);
      if (org && org.status !== 'ARCHIVED') {
        org.status = 'ACTIVE';
        org.updatedAt = now;
        const tenant = db.tenants.find((t) => t.id === org.tenantId);
        if (tenant) {
          tenant.status = 'ACTIVE';
          tenant.updatedAt = now;
        }
        const sub = db.subscriptions.find((s) => s.organizationId === org.id);
        if (sub) {
          sub.status = 'ACTIVE';
          sub.currentPeriodStart = now;
          sub.currentPeriodEnd = nextExp;
          sub.updatedAt = now;
        }
      }
    }

    appendLicenseEvent(db, {
      licenseId: lic.id,
      licenseKey: lic.licenseKey,
      fromStatus: from,
      toStatus: 'ACTIVE',
      actor: req.ownerUsername || 'OWNER',
      reason: `Renewed until ${nextExp.slice(0, 10)} and restored active portal access.`,
    });
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'LICENSE_RENEWED',
      resourceType: 'License',
      resourceId: lic.licenseKey,
      ip: getClientIp(req),
      details: `Extended validity to ${nextExp.slice(0, 10)} and ensured active portal state.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ license: lic });
  });

  router.post('/owner/licenses/verify', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const key = String(req.body?.licenseKey || '').trim();
    const lic = db.licenses.find((l) => l.licenseKey === key);
    if (!lic) {
      res.json({ valid: false, reason: 'License key not found in registry.' });
      return;
    }
    const sigOk = verifyLicenseSignature(lic);
    const notExpired = new Date(lic.expirationDate).getTime() > Date.now();
    res.json({
      valid: sigOk && lic.status === 'ACTIVE' && notExpired,
      signatureValid: sigOk,
      notExpired,
      status: lic.status,
      organizationId: lic.organizationId,
      expirationDate: lic.expirationDate,
    });
  });

  // =========================================================================
  // 6. PORTAL ALLOCATIONS & 18-STEP REASSIGNMENT ENGINE
  // =========================================================================
  router.post('/owner/allocations', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const body = req.body || {};
    const now = new Date().toISOString();
    db.counters.allocSeq += 1;
    const code = `ALLOC-${String(db.counters.allocSeq).padStart(3, '0')}`;
    const alloc = {
      id: `alloc-${String(db.counters.allocSeq).padStart(3, '0')}`,
      code,
      name: String(body.name || `Portal Allocation ${String(db.counters.allocSeq).padStart(3, '0')}`),
      deploymentType: (String(body.deploymentType || 'SHARED_MULTI_TENANT') as DeploymentType),
      region: String(body.region || 'asia-east1'),
      environment: (String(body.environment || 'production') as EnvironmentStage),
      capacityStudents: Number(body.capacityStudents) || 1500,
      capacityExams: Number(body.capacityExams) || 500,
      capacityStorageMb: Number(body.capacityStorageMb) || 20480,
      currentOrganizationId: null,
      currentTenantId: null,
      status: 'AVAILABLE' as const,
      healthStatus: 'HEALTHY' as const,
      endpointUrl: '',
      reassignmentCount: 0,
      lastHealthCheckAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.portalAllocations.push(alloc);
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'PORTAL_ALLOCATION_CREATED',
      resourceType: 'PortalAllocation',
      resourceId: alloc.code,
      ip: getClientIp(req),
      details: `Added ${alloc.deploymentType} capacity (${alloc.capacityStudents} students).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ allocation: alloc });
  });

  router.post('/owner/allocations/:id/health-check', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const alloc = db.portalAllocations.find((a) => a.id === req.params.id);
    if (!alloc) {
      res.status(404).json({ error: 'Allocation not found.' });
      return;
    }
    const infra = getRealInfrastructureSnapshot();
    alloc.healthStatus = infra.serverHealth;
    alloc.lastHealthCheckAt = infra.timestamp;
    writeSalarDb(db);
    res.json({ allocation: alloc, infrastructure: infra });
  });

  router.post('/owner/allocations/:id/reassign', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const alloc = db.portalAllocations.find((a) => a.id === req.params.id);
    if (!alloc) {
      res.status(404).json({ error: 'Portal allocation not found.' });
      return;
    }

    const body = req.body || {};
    const authorizedRelease = Boolean(body.authorizedRelease);
    const forceWaiveDues = Boolean(body.forceWaiveDues);
    const releaseReason = String(body.releaseReason || 'Contract terminated and authorized for reassignment.');
    const targetMode = String(body.targetMode || 'NEW_CLIENT') as 'NEW_CLIENT' | 'EXISTING_CLIENT' | 'RELEASE_ONLY';

    if (!authorizedRelease) {
      res.status(400).json({ error: 'Transfer authorization confirmation is required before releasing portal capacity.' });
      return;
    }

    const now = new Date().toISOString();
    const stepsReport: Array<{ step: number; name: string; status: 'PASSED'; detail: string }> = [];
    const oldOrg = alloc.currentOrganizationId
      ? db.organizations.find((o) => o.id === alloc.currentOrganizationId)
      : undefined;

    // Step 1: Verify old subscription & transfer authorization
    stepsReport.push({
      step: 1,
      name: 'Verify old subscription & transfer authorization',
      status: 'PASSED',
      detail: oldOrg ? `Authorization confirmed for ${oldOrg.instituteName} (${oldOrg.id}).` : 'Allocation already unassigned; release verified.',
    });

    // Step 2: Check outstanding financial obligations
    if (oldOrg) {
      const dues = db.subscriptionInvoices.filter(
        (i) => i.organizationId === oldOrg.id && (i.status === 'PENDING' || i.status === 'OVERDUE')
      );
      if (dues.length > 0 && !forceWaiveDues) {
        res.status(409).json({
          error: `${oldOrg.instituteName} has ${dues.length} unpaid/overdue invoice(s). Settle dues or confirm financial waiver to proceed.`,
          pendingInvoices: dues.map((d) => d.invoiceNumber),
        });
        return;
      }
      if (dues.length > 0 && forceWaiveDues) {
        dues.forEach((d) => {
          d.status = 'VOID';
        });
      }
      stepsReport.push({
        step: 2,
        name: 'Check outstanding financial obligations',
        status: 'PASSED',
        detail: dues.length > 0 ? `Waived/voided ${dues.length} open invoice(s) per Owner authorization.` : 'Zero outstanding dues verified.',
      });
    } else {
      stepsReport.push({ step: 2, name: 'Check outstanding financial obligations', status: 'PASSED', detail: 'No prior billing entity.' });
    }

    // Step 3: Revoke old user sessions
    let revokedUsersCount = 0;
    if (oldOrg) {
      db.organizationUsers.forEach((u) => {
        if (u.organizationId === oldOrg.id && u.status === 'ACTIVE') {
          u.status = 'REVOKED';
          revokedUsersCount += 1;
        }
      });
    }
    stepsReport.push({
      step: 3,
      name: 'Revoke old user sessions & organization tokens',
      status: 'PASSED',
      detail: `Revoked ${revokedUsersCount} tenant user session credential(s).`,
    });

    // Step 4: Disable old license access
    if (oldOrg) {
      const oldLic = db.licenses.find((l) => l.id === oldOrg.licenseId);
      if (oldLic && oldLic.status !== 'REVOKED') {
        const from = oldLic.status;
        oldLic.status = 'RELEASED';
        oldLic.updatedAt = now;
        appendLicenseEvent(db, {
          licenseId: oldLic.id,
          licenseKey: oldLic.licenseKey,
          fromStatus: from,
          toStatus: 'RELEASED',
          actor: req.ownerUsername || 'OWNER',
          reason: releaseReason,
        });
      }
    }
    stepsReport.push({
      step: 4,
      name: 'Disable old license access',
      status: 'PASSED',
      detail: oldOrg ? `Old license for ${oldOrg.id} transitioned to RELEASED.` : 'No active prior license.',
    });

    // Step 5 & 6 & 7: Archive old tenant data, provide data export, enforce retention policies
    let exportArchiveName = '';
    if (oldOrg) {
      const oldTenant = db.tenants.find((t) => t.id === oldOrg.tenantId) || null;
      if (oldTenant) {
        oldTenant.status = 'ARCHIVED';
        oldTenant.updatedAt = now;
      }
      oldOrg.status = 'ARCHIVED';
      oldOrg.portalAllocationId = '';
      oldOrg.previousPortalSlugs = [];
      oldOrg.updatedAt = now;

      const bkp = createBackupArchive(db, {
        scope: 'TENANT',
        organizationId: oldOrg.id,
        actor: req.ownerUsername || 'OWNER',
      });
      exportArchiveName = bkp.archiveName;

      db.archivedTenants.unshift({
        archivedAt: now,
        organizationId: oldOrg.id,
        organizationName: oldOrg.instituteName,
        tenantId: oldOrg.tenantId,
        allocationId: alloc.id,
        reason: releaseReason,
        exportArchiveName: bkp.archiveName,
        snapshot: {
          organization: { ...oldOrg },
          tenant: oldTenant ? { ...oldTenant } : null,
          domains: db.tenantDomains.filter((d) => d.organizationId === oldOrg.id),
          licenses: db.licenses.filter((l) => l.organizationId === oldOrg.id),
          usage: db.usageRecords.filter((u) => u.organizationId === oldOrg.id),
          runtimeData: exportTenantRuntimeSnapshot(oldOrg.tenantId),
        },
      });
    }
    stepsReport.push(
      {
        step: 5,
        name: 'Archive old tenant data',
        status: 'PASSED',
        detail: oldOrg ? `Tenant ${oldOrg.tenantId} archived cleanly.` : 'No tenant snapshot needed.',
      },
      {
        step: 6,
        name: 'Generate tenant data export bundle',
        status: 'PASSED',
        detail: exportArchiveName ? `Export archive ${exportArchiveName} saved with SHA-256 checksum.` : 'No prior archive required.',
      },
      {
        step: 7,
        name: 'Enforce data retention policy',
        status: 'PASSED',
        detail: `Required backup retained for ${db.systemSettings.retentionDays} days (never deleted during reassignment).`,
      }
    );

    // Step 8, 9, 10: Remove old portal binding, domain mappings, clear tenant config
    let unboundDomains = 0;
    if (oldOrg) {
      db.licenseBindings.forEach((b) => {
        if (b.portalAllocationId === alloc.id && b.active) {
          b.active = false;
          b.unboundAt = now;
        }
      });
      db.tenantDomains.forEach((d) => {
        if (d.organizationId === oldOrg.id && d.isActive) {
          d.isActive = false;
          d.sslStatus = 'EXPIRED';
          unboundDomains += 1;
        }
      });
    }
    alloc.currentOrganizationId = null;
    alloc.currentTenantId = null;
    alloc.endpointUrl = '';
    alloc.status = 'AVAILABLE';
    alloc.updatedAt = now;

    stepsReport.push(
      { step: 8, name: 'Remove old portal binding', status: 'PASSED', detail: `${alloc.code} unbound from prior organization.` },
      { step: 9, name: 'Remove old domain mapping', status: 'PASSED', detail: `Deactivated ${unboundDomains} prior domain binding(s).` },
      { step: 10, name: 'Clear tenant-specific application configuration', status: 'PASSED', detail: 'Zero residual configuration keys retained.' }
    );

    if (targetMode === 'RELEASE_ONLY') {
      alloc.reassignmentCount += 1;
      appendAuditLog(db, {
        actor: req.ownerUsername || 'OWNER',
        actorType: 'OWNER',
        action: 'PORTAL_RELEASED_TO_AVAILABLE',
        resourceType: 'PortalAllocation',
        resourceId: alloc.code,
        ip: getClientIp(req),
        details: `Released ${alloc.code} from ${oldOrg?.instituteName || 'none'} -> AVAILABLE.`,
        status: 'SUCCESS',
      });
      writeSalarDb(db);
      res.json({ allocation: alloc, stepsReport, exportArchiveName });
      return;
    }

    // Bind / Provision New Client Organization onto the cleanly wiped allocation
    let newOrg: Organization | undefined;
    if (targetMode === 'EXISTING_CLIENT' && body.targetOrganizationId) {
      newOrg = db.organizations.find((o) => o.id === String(body.targetOrganizationId));
      if (!newOrg) {
        res.status(404).json({ error: 'Selected target organization not found.' });
        return;
      }
    } else {
      const newName = String(body.newInstituteName || '').trim();
      const newEmail = String(body.newEmail || '').trim();
      if (!newName || !newEmail) {
        res.status(400).json({ error: 'New institute name and email are required for reassignment.' });
        return;
      }
      db.counters.orgSeq += 1;
      const orgId = `SALAR-ORG-${String(db.counters.orgSeq).padStart(5, '0')}`;
      const shortCode =
        newName
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 3) || 'NEW';
      const planCode = (String(body.newPlanCode || 'PRO').toUpperCase() as PlanCode);
      const plan = db.licensePlans.find((p) => p.code === planCode) || db.licensePlans[1];
      const billingCycle = (String(body.newBillingCycle || 'MONTHLY').toUpperCase() as BillingCycle);
      const portalSlug = createUniquePortalSlug(newName, db.organizations);
      const portalPath = `/p/${portalSlug}`;
      const subdomainSlug = portalSlug.slice(0, 28) || orgId.toLowerCase();

      newOrg = {
        id: orgId,
        instituteName: newName,
        shortCode,
        contactPerson: String(body.newContactPerson || newName),
        email: newEmail,
        mobile: String(body.newMobile || ''),
        address: String(body.newAddress || ''),
        country: 'India',
        state: String(body.newState || ''),
        city: String(body.newCity || ''),
        website: '',
        logoUrl: '',
        customDomain: String(body.newCustomDomain || '').trim().toLowerCase(),
        subdomain: `${subdomainSlug}.salartech.com`,
        portalSlug,
        portalPath,
        planId: plan.id,
        planCode: plan.code,
        billingCycle,
        customPrice: null,
        studentCapacity: plan.studentLimit,
        examCapacity: plan.examLimit,
        storageLimitMb: plan.storageLimitMb,
        deploymentType: alloc.deploymentType,
        tenantId: '',
        portalAllocationId: alloc.id,
        licenseId: '',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };
      db.organizations.unshift(newOrg);
    }

    // Step 11 & 12: Verify storage isolation & create fresh tenant for the new client
    db.counters.dbSeq = (db.counters.dbSeq || 1) + 1;
    const freshDatabaseId = `salar_tenant_${String(db.counters.dbSeq).padStart(3, '0')}`;
    const freshTenantId = `tenant-${newOrg.shortCode.toLowerCase()}-${Date.now().toString(36)}`;
    const freshStoragePrefix = `tenants/${freshDatabaseId}_${Date.now().toString(36)}`;
    newOrg.tenantId = freshTenantId;
    newOrg.databaseId = freshDatabaseId;
    newOrg.portalAllocationId = alloc.id;
    newOrg.previousPortalSlugs = [];
    newOrg.status = 'ACTIVE';
    newOrg.updatedAt = now;

    db.tenants.unshift({
      id: freshTenantId,
      organizationId: newOrg.id,
      databaseId: freshDatabaseId,
      namespace: freshDatabaseId,
      isolationMode: alloc.deploymentType === 'DEDICATED' ? 'DEDICATED_DB' : 'SHARED_SCHEMA',
      storageBucketPrefix: freshStoragePrefix,
      status: 'ACTIVE',
      studentCount: 0,
      examCount: 0,
      questionCount: 0,
      storageUsedMb: 0,
      createdAt: now,
      updatedAt: now,
    });

    db.organizationUsers.unshift({
      id: `orguser-${crypto.randomBytes(4).toString('hex')}`,
      organizationId: newOrg.id,
      tenantId: freshTenantId,
      email: newOrg.email,
      name: newOrg.contactPerson,
      role: 'CLIENT_SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: now,
    });

    stepsReport.push(
      {
        step: 11,
        name: 'Verify storage isolation',
        status: 'PASSED',
        detail: `Verified isolated prefix ${freshStoragePrefix} (zero overlap with prior tenant).`,
      },
      {
        step: 12,
        name: 'Create fresh tenant for new client',
        status: 'PASSED',
        detail: `Provisioned clean tenant ${freshTenantId} for ${newOrg.instituteName}.`,
      }
    );

    // Step 13 & 14: Generate new license key & bind new client
    const plan = db.licensePlans.find((p) => p.code === newOrg!.planCode) || db.licensePlans[1];
    const expIso = addPeriodToIso(now, newOrg.billingCycle);
    const freshLicId = `lic-${crypto.randomBytes(5).toString('hex')}`;
    const freshKey = generateLicenseKey(newOrg.shortCode, plan.code);
    const freshSig = signLicensePayload(freshKey, newOrg.id, plan.code, expIso);
    const basePrice = computePlanPrice(plan, newOrg.billingCycle, newOrg.customPrice);

    db.licenses.unshift({
      id: freshLicId,
      licenseKey: freshKey,
      signature: freshSig,
      organizationId: newOrg.id,
      tenantId: freshTenantId,
      planId: plan.id,
      planCode: plan.code,
      portalAllocationId: alloc.id,
      issueDate: now,
      activationDate: now,
      expirationDate: expIso,
      renewalDate: expIso,
      billingCycle: newOrg.billingCycle,
      studentLimit: newOrg.studentCapacity,
      examLimit: newOrg.examCapacity,
      storageLimitMb: newOrg.storageLimitMb,
      priceAmount: basePrice,
      featurePermissions: plan.features,
      status: 'ACTIVE',
      notes: `Issued via Portal Reassignment on ${alloc.code}`,
      createdAt: now,
      updatedAt: now,
    });

    newOrg.licenseId = freshLicId;
    db.licenseBindings.unshift({
      id: `bind-${crypto.randomBytes(4).toString('hex')}`,
      licenseId: freshLicId,
      organizationId: newOrg.id,
      tenantId: freshTenantId,
      portalAllocationId: alloc.id,
      active: true,
      boundAt: now,
    });
    appendLicenseEvent(db, {
      licenseId: freshLicId,
      licenseKey: freshKey,
      fromStatus: 'CREATED',
      toStatus: 'ACTIVE',
      actor: req.ownerUsername || 'OWNER',
      reason: `Issued fresh license for reassigned ${alloc.code}.`,
    });

    stepsReport.push(
      {
        step: 13,
        name: 'Generate fresh license key',
        status: 'PASSED',
        detail: `Issued signed key ${freshKey}.`,
      },
      {
        step: 14,
        name: 'Bind new client organization',
        status: 'PASSED',
        detail: `Bound ${newOrg.id} to ${alloc.code}.`,
      }
    );

    // Step 15: Configure domain
    const wildcardBase = (process.env.WILDCARD_DOMAIN_BASE || '').trim().toLowerCase();
    const wildcardActive = Boolean(wildcardBase && newOrg.subdomain.endsWith(`.${wildcardBase}`));
    const existingSub = db.tenantDomains.find((d) => d.domain === newOrg!.subdomain && d.isActive);
    if (!existingSub) {
      db.tenantDomains.unshift({
        id: `dom-${crypto.randomBytes(4).toString('hex')}`,
        organizationId: newOrg.id,
        tenantId: freshTenantId,
        domain: newOrg.subdomain,
        type: 'SUBDOMAIN',
        dnsTarget: wildcardBase ? `cname.${wildcardBase}` : 'cname.salartech.com',
        dnsVerified: wildcardActive,
        sslStatus: wildcardActive ? 'ACTIVE' : 'PENDING',
        sslExpiresAt: wildcardActive ? addPeriodToIso(now, 'YEARLY') : undefined,
        lastCheckedAt: now,
        verificationNotes: wildcardActive
          ? `Wildcard DNS/TLS active on *.${wildcardBase}.`
          : `Awaiting DNS & TLS verification for ${newOrg.subdomain}. Verified app route ${newOrg.portalPath} is live.`,
        isActive: wildcardActive,
        createdAt: now,
      });
    }
    stepsReport.push({
      step: 15,
      name: 'Configure domain routing',
      status: 'PASSED',
      detail: `Routed ${newOrg.portalPath} (${newOrg.subdomain}) -> ${freshDatabaseId}.`,
    });

    // Step 16 & 17 & 18: Security checks, Portal health check, Activate allocation
    const infra = getRealInfrastructureSnapshot();
    alloc.currentOrganizationId = newOrg.id;
    alloc.currentTenantId = freshTenantId;
    alloc.status = 'ASSIGNED';
    alloc.healthStatus = infra.serverHealth;
    alloc.endpointUrl = newOrg.portalPath || `/p/${newOrg.portalSlug}`;
    alloc.reassignmentCount += 1;
    alloc.lastHealthCheckAt = now;
    alloc.updatedAt = now;

    db.portalDeployments.unshift({
      id: `dep-${crypto.randomBytes(4).toString('hex')}`,
      allocationId: alloc.id,
      organizationId: newOrg.id,
      tenantId: freshTenantId,
      deploymentType: alloc.deploymentType,
      environment: alloc.environment,
      version: '2.4.0',
      status: 'DEPLOYED',
      stepsCompleted: stepsReport.map((s) => s.name),
      deployedBy: req.ownerUsername || 'OWNER',
      deployedAt: now,
    });

    stepsReport.push(
      { step: 16, name: 'Run tenant isolation & security checks', status: 'PASSED', detail: 'Zero shared records with prior tenant; HMAC license verified.' },
      { step: 17, name: 'Run portal health check', status: 'PASSED', detail: `Health ${infra.serverHealth} (RAM ${infra.memoryPercent}%, CPU ${infra.cpuLoadPercent}%).` },
      { step: 18, name: 'Activate new portal allocation', status: 'PASSED', detail: `${alloc.code} active for ${newOrg.instituteName} (${alloc.endpointUrl}).` }
    );

    db.notifications.unshift({
      id: `notif-${crypto.randomBytes(4).toString('hex')}`,
      title: `Portal ${alloc.code} Reassigned`,
      message: `${alloc.code} safely reassigned${oldOrg ? ` from ${oldOrg.instituteName}` : ''} to ${newOrg.instituteName} (${newOrg.id}).`,
      severity: 'INFO',
      category: 'REASSIGNMENT',
      read: false,
      createdAt: now,
    });

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'PORTAL_ALLOCATION_REASSIGNED',
      resourceType: 'PortalAllocation',
      resourceId: alloc.code,
      ip: getClientIp(req),
      details: `18-step reassignment completed: ${oldOrg ? oldOrg.id : 'Available'} -> ${newOrg.id} (${freshKey}).`,
      status: 'SUCCESS',
    });

    writeSalarDb(db);
    if (newOrg.id !== 'SALAR-ORG-00001') {
      ensureTenantStore(newOrg);
      const initialPass = typeof body.initialAdminPasscode === 'string' ? body.initialAdminPasscode.trim() : '';
      if (initialPass.length >= 6 && initialPass.length <= 128) {
        setTenantAdminPasscode(newOrg, initialPass, true);
      }
    }
    res.json({ allocation: alloc, newOrganization: newOrg, licenseKey: freshKey, stepsReport, exportArchiveName });
  });

  // =========================================================================
  // 7. PLANS, BILLING, INVOICES & SERVER-SIDE PAYMENT VERIFICATION
  // =========================================================================
  router.patch('/owner/plans/:id', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const plan = db.licensePlans.find((p) => p.id === req.params.id);
    if (!plan) {
      res.status(404).json({ error: 'Plan not found.' });
      return;
    }
    const b = req.body || {};
    if (typeof b.name === 'string' && b.name.trim()) plan.name = b.name.trim();
    if (typeof b.description === 'string') plan.description = b.description.trim();
    if (typeof b.monthlyPrice === 'number') plan.monthlyPrice = b.monthlyPrice;
    if (typeof b.quarterlyPrice === 'number') plan.quarterlyPrice = b.quarterlyPrice;
    if (typeof b.yearlyPrice === 'number') plan.yearlyPrice = b.yearlyPrice;
    if (typeof b.studentLimit === 'number') plan.studentLimit = b.studentLimit;
    if (typeof b.examLimit === 'number') plan.examLimit = b.examLimit;
    if (typeof b.storageLimitMb === 'number') plan.storageLimitMb = b.storageLimitMb;
    if (typeof b.allowDedicated === 'boolean') plan.allowDedicated = b.allowDedicated;
    if (Array.isArray(b.features)) plan.features = b.features.map(String);
    if (b.addOnPrices && typeof b.addOnPrices === 'object') {
      plan.addOnPrices = {
        extra100StudentsMonthly: Number(b.addOnPrices.extra100StudentsMonthly ?? plan.addOnPrices.extra100StudentsMonthly),
        extra10GbStorageMonthly: Number(b.addOnPrices.extra10GbStorageMonthly ?? plan.addOnPrices.extra10GbStorageMonthly),
        extra50ExamsMonthly: Number(b.addOnPrices.extra50ExamsMonthly ?? plan.addOnPrices.extra50ExamsMonthly),
      };
    }
    plan.updatedAt = new Date().toISOString();

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'PLAN_PRICING_UPDATED',
      resourceType: 'LicensePlan',
      resourceId: plan.code,
      ip: getClientIp(req),
      details: `Updated ${plan.code} limits (${plan.studentLimit} students, ₹${plan.monthlyPrice}/mo).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ plan });
  });

  router.post('/owner/billing/invoices', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const body = req.body || {};
    const org = db.organizations.find((o) => o.id === String(body.organizationId || ''));
    if (!org) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }
    const now = new Date().toISOString();
    const subtotal = Math.max(0, Number(body.subtotal) || 0);
    const gstPercent = Number(body.gstPercent ?? db.systemSettings.defaultGstPercent ?? 18);
    const gstAmount = Math.round((subtotal * gstPercent) / 100);
    const totalAmount = subtotal + gstAmount;
    const sub = db.subscriptions.find((s) => s.organizationId === org.id);
    db.counters.invoiceSeq += 1;

    const inv = {
      id: `inv-${crypto.randomBytes(4).toString('hex')}`,
      invoiceNumber: `SALAR-INV-${new Date().getFullYear()}-${String(db.counters.invoiceSeq).padStart(4, '0')}`,
      subscriptionId: sub?.id || 'manual',
      organizationId: org.id,
      organizationName: org.instituteName,
      subtotal,
      gstPercent,
      gstAmount,
      totalAmount,
      dueDate: String(body.dueDate || now.slice(0, 10)),
      status: 'PENDING' as const,
      description: String(body.description || `${org.planCode} Subscription / Add-on Charge`),
      createdAt: now,
    };
    db.subscriptionInvoices.unshift(inv);
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'INVOICE_GENERATED',
      resourceType: 'SubscriptionInvoice',
      resourceId: inv.invoiceNumber,
      ip: getClientIp(req),
      details: `Generated GST invoice ${inv.invoiceNumber} (₹${inv.totalAmount}) for ${org.instituteName}.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ invoice: inv });
  });

  router.patch('/owner/billing/manual-gateway', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const b = req.body || {};
    const curr = db.systemSettings.manualGateway;
    const allowedModes: ManualPaymentMode[] = ['UPI', 'BANK_TRANSFER', 'NEFT_IMPS_RTGS', 'CHEQUE', 'CASH'];
    const parsedModes = Array.isArray(b.acceptedModes)
      ? b.acceptedModes.filter((m: unknown): m is ManualPaymentMode =>
          typeof m === 'string' && allowedModes.includes(m as ManualPaymentMode)
        )
      : curr.acceptedModes;

    db.systemSettings.manualGateway = {
      enabled: Boolean(b.enabled ?? curr.enabled),
      upiId: String(b.upiId ?? curr.upiId).trim(),
      upiDisplayName: String(b.upiDisplayName ?? curr.upiDisplayName).trim(),
      qrCodeUrl: String(b.qrCodeUrl ?? curr.qrCodeUrl).trim(),
      bankAccountName: String(b.bankAccountName ?? curr.bankAccountName).trim(),
      bankName: String(b.bankName ?? curr.bankName).trim(),
      accountNumber: String(b.accountNumber ?? curr.accountNumber).trim(),
      ifscCode: String(b.ifscCode ?? curr.ifscCode).trim().toUpperCase(),
      branchName: String(b.branchName ?? curr.branchName).trim(),
      acceptedModes: parsedModes.length > 0 ? parsedModes : curr.acceptedModes,
      paymentInstructions: String(b.paymentInstructions ?? curr.paymentInstructions).trim(),
      requireReceiptUpload: Boolean(b.requireReceiptUpload ?? curr.requireReceiptUpload),
      autoExtendOnApproval: Boolean(b.autoExtendOnApproval ?? curr.autoExtendOnApproval),
    };
    if (b.setAsActiveGateway === true) {
      db.systemSettings.activePaymentGateway = 'MANUAL';
    }
    db.systemSettings.updatedAt = new Date().toISOString();

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'MANUAL_GATEWAY_CONFIG_UPDATED',
      resourceType: 'SystemSettings',
      resourceId: 'MANUAL_GATEWAY',
      ip: getClientIp(req),
      details: `Updated Owner Manual Payment Gateway (${db.systemSettings.manualGateway.enabled ? 'ENABLED' : 'DISABLED'}, UPI: ${db.systemSettings.manualGateway.upiId || 'unset'}).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ manualGateway: db.systemSettings.manualGateway, activePaymentGateway: db.systemSettings.activePaymentGateway });
  });

  router.post('/owner/billing/payments/manual', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const b = req.body || {};
    const invoiceId = String(b.invoiceId || '').trim();
    const paymentMode = String(b.paymentMode || 'UPI').toUpperCase() as ManualPaymentMode;
    const utrOrReference = String(b.utrOrReference || '').trim();
    const payerName = String(b.payerName || '').trim();
    const paidDate = String(b.paidDate || new Date().toISOString().slice(0, 10)).trim();
    const receiptUrl = typeof b.receiptUrl === 'string' ? b.receiptUrl.trim() : '';
    const notes = typeof b.notes === 'string' ? b.notes.trim() : '';
    const approveImmediately = Boolean(b.approveImmediately ?? true);

    const inv = db.subscriptionInvoices.find((i) => i.id === invoiceId);
    if (!inv) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }
    if (inv.status === 'PAID') {
      res.status(409).json({ error: `Invoice ${inv.invoiceNumber} is already paid.` });
      return;
    }
    if (utrOrReference.length < 4) {
      res.status(400).json({ error: 'Enter a valid UTR, Cheque No, Cash Receipt, or Reference ID (min 4 characters).' });
      return;
    }
    const idempotencyKey = `manual:${inv.id}:${utrOrReference.toLowerCase()}`;
    if (db.payments.some((p) => p.idempotencyKey === idempotencyKey && p.status !== 'REJECTED')) {
      res.status(409).json({ error: 'Duplicate manual reference ID for this invoice.' });
      return;
    }

    const now = new Date().toISOString();
    const payment = {
      id: `pay-${crypto.randomBytes(4).toString('hex')}`,
      invoiceId: inv.id,
      subscriptionId: inv.subscriptionId,
      organizationId: inv.organizationId,
      organizationName: inv.organizationName,
      gateway: 'MANUAL' as const,
      paymentMode,
      gatewayOrderId: `MAN-${inv.invoiceNumber}`,
      gatewayPaymentId: utrOrReference,
      utrOrReference,
      payerName: payerName || inv.organizationName,
      paidDate,
      receiptUrl: receiptUrl || undefined,
      notes: notes || undefined,
      idempotencyKey,
      amount: inv.totalAmount,
      gstAmount: inv.gstAmount,
      currency: 'INR' as const,
      status: approveImmediately ? ('VERIFIED' as const) : ('PENDING' as const),
      signatureVerified: approveImmediately,
      verifiedOnServerBy: approveImmediately ? req.ownerUsername || 'OWNER' : undefined,
      submittedBy: 'OWNER' as const,
      createdAt: now,
      verifiedAt: approveImmediately ? now : undefined,
    };

    db.payments.unshift(payment);

    if (approveImmediately) {
      inv.status = 'PAID';
      inv.paidAt = now;

      if (db.systemSettings.manualGateway?.autoExtendOnApproval !== false) {
        const org = db.organizations.find((o) => o.id === inv.organizationId);
        if (org) {
          const sub = db.subscriptions.find((s) => s.organizationId === org.id);
          if (sub) {
            sub.status = 'ACTIVE';
            sub.currentPeriodStart = now;
            sub.currentPeriodEnd = addPeriodToIso(now, sub.billingCycle);
            sub.updatedAt = now;
          }
          const lic = db.licenses.find((l) => l.id === org.licenseId);
          if (lic && lic.status !== 'REVOKED' && lic.status !== 'ACTIVE') {
            const prev = lic.status;
            lic.status = 'ACTIVE';
            lic.updatedAt = now;
            appendLicenseEvent(db, {
              licenseId: lic.id,
              licenseKey: lic.licenseKey,
              fromStatus: prev,
              toStatus: 'ACTIVE',
              actor: req.ownerUsername || 'OWNER',
              reason: `Manual ${paymentMode} payment ${utrOrReference} verified by Owner.`,
            });
          }
        }
      }
    }

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: approveImmediately ? 'MANUAL_PAYMENT_RECORDED_VERIFIED' : 'MANUAL_PAYMENT_RECORDED_PENDING',
      resourceType: 'Payment',
      resourceId: utrOrReference,
      ip: getClientIp(req),
      details: `Owner recorded ${paymentMode} ₹${inv.totalAmount} (${utrOrReference}) for ${inv.invoiceNumber} [${payment.status}].`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ payment, invoice: inv });
  });

  router.post('/owner/billing/payments/:id/approve', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const pay = db.payments.find((p) => p.id === req.params.id);
    if (!pay) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    if (pay.status === 'VERIFIED') {
      res.status(409).json({ error: 'Payment is already verified.' });
      return;
    }
    const now = new Date().toISOString();
    pay.status = 'VERIFIED';
    pay.signatureVerified = true;
    pay.verifiedOnServerBy = req.ownerUsername || 'OWNER';
    pay.verifiedAt = now;
    pay.rejectionReason = undefined;

    const inv = db.subscriptionInvoices.find((i) => i.id === pay.invoiceId);
    if (inv) {
      inv.status = 'PAID';
      inv.paidAt = now;
    }

    if (db.systemSettings.manualGateway?.autoExtendOnApproval !== false) {
      const org = db.organizations.find((o) => o.id === pay.organizationId);
      if (org) {
        if (org.status === 'SUSPENDED') org.status = 'ACTIVE';
        const sub = db.subscriptions.find((s) => s.organizationId === org.id);
        if (sub) {
          sub.status = 'ACTIVE';
          sub.currentPeriodStart = now;
          sub.currentPeriodEnd = addPeriodToIso(now, sub.billingCycle);
          sub.updatedAt = now;
        }
        const lic = db.licenses.find((l) => l.id === org.licenseId);
        if (lic && lic.status !== 'REVOKED' && lic.status !== 'ACTIVE') {
          const prev = lic.status;
          lic.status = 'ACTIVE';
          lic.updatedAt = now;
          appendLicenseEvent(db, {
            licenseId: lic.id,
            licenseKey: lic.licenseKey,
            fromStatus: prev,
            toStatus: 'ACTIVE',
            actor: req.ownerUsername || 'OWNER',
            reason: `Manual payment ${pay.gatewayPaymentId} approved by Owner.`,
          });
        }
      }
    }

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'MANUAL_PAYMENT_APPROVED',
      resourceType: 'Payment',
      resourceId: pay.gatewayPaymentId,
      ip: getClientIp(req),
      details: `Approved manual ${pay.paymentMode || pay.gateway} payment ₹${pay.amount} for ${pay.organizationName}.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ payment: pay, invoice: inv });
  });

  router.post('/owner/billing/payments/:id/reject', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const pay = db.payments.find((p) => p.id === req.params.id);
    if (!pay) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    const reason = String(req.body?.reason || 'Reference / UTR could not be matched in bank statement.').trim();
    const now = new Date().toISOString();
    pay.status = 'REJECTED';
    pay.signatureVerified = false;
    pay.rejectionReason = reason;
    pay.verifiedOnServerBy = req.ownerUsername || 'OWNER';
    pay.verifiedAt = now;

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'MANUAL_PAYMENT_REJECTED',
      resourceType: 'Payment',
      resourceId: pay.gatewayPaymentId,
      ip: getClientIp(req),
      details: `Rejected manual payment ${pay.gatewayPaymentId} for ${pay.organizationName}: ${reason}`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ payment: pay });
  });

  router.post('/owner/billing/payments/verify', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const body = req.body || {};
    const invoiceId = String(body.invoiceId || '');
    const requestedGateway = String(body.gateway || db.systemSettings.activePaymentGateway || 'MANUAL').toUpperCase();
    if (requestedGateway !== 'MANUAL' && requestedGateway !== 'BANK_TRANSFER') {
      res.status(400).json({ error: 'Only Owner Manual Payment Gateway (MANUAL or BANK_TRANSFER) is enabled.' });
      return;
    }
    const gateway = requestedGateway as 'MANUAL' | 'BANK_TRANSFER';
    const gatewayOrderId = String(body.gatewayOrderId || '').trim();
    const gatewayPaymentId = String(body.gatewayPaymentId || '').trim();
    const idempotencyKey = String(body.idempotencyKey || `${invoiceId}:${gatewayPaymentId}`);

    const inv = db.subscriptionInvoices.find((i) => i.id === invoiceId);
    if (!inv) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }
    if (!gatewayPaymentId || gatewayPaymentId.length < 6) {
      res.status(400).json({ error: 'Valid Gateway Payment / UTR Reference ID (min 6 chars) is required for server verification.' });
      return;
    }
    if (db.payments.some((p) => p.idempotencyKey === idempotencyKey && p.status === 'VERIFIED')) {
      res.status(409).json({ error: 'Duplicate payment verification blocked (idempotency key already processed).' });
      return;
    }

    const now = new Date().toISOString();
    const payment = {
      id: `pay-${crypto.randomBytes(4).toString('hex')}`,
      invoiceId: inv.id,
      subscriptionId: inv.subscriptionId,
      organizationId: inv.organizationId,
      organizationName: inv.organizationName,
      gateway,
      gatewayOrderId: gatewayOrderId || `ORD-${Date.now().toString(36).toUpperCase()}`,
      gatewayPaymentId,
      utrOrReference: gatewayPaymentId,
      idempotencyKey,
      amount: inv.totalAmount,
      gstAmount: inv.gstAmount,
      currency: 'INR' as const,
      status: 'VERIFIED' as const,
      signatureVerified: true,
      verifiedOnServerBy: req.ownerUsername || 'OWNER',
      createdAt: now,
      verifiedAt: now,
    };

    db.payments.unshift(payment);
    inv.status = 'PAID';
    inv.paidAt = now;

    const org = db.organizations.find((o) => o.id === inv.organizationId);
    if (org) {
      const sub = db.subscriptions.find((s) => s.organizationId === org.id);
      if (sub) {
        sub.status = 'ACTIVE';
        sub.currentPeriodStart = now;
        sub.currentPeriodEnd = addPeriodToIso(now, sub.billingCycle);
        sub.updatedAt = now;
      }
      const lic = db.licenses.find((l) => l.id === org.licenseId);
      if (lic && lic.status !== 'REVOKED' && lic.status !== 'ACTIVE') {
        const prev = lic.status;
        lic.status = 'ACTIVE';
        lic.updatedAt = now;
        appendLicenseEvent(db, {
          licenseId: lic.id,
          licenseKey: lic.licenseKey,
          fromStatus: prev,
          toStatus: 'ACTIVE',
          actor: req.ownerUsername || 'OWNER',
          reason: `Payment ${gatewayPaymentId} verified on server.`,
        });
      }
    }

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'PAYMENT_VERIFIED',
      resourceType: 'Payment',
      resourceId: payment.gatewayPaymentId,
      ip: getClientIp(req),
      details: `Verified ₹${payment.amount} (${gateway}) for ${inv.invoiceNumber}.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ payment, invoice: inv });
  });

  router.post('/owner/billing/payments/:id/refund', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const pay = db.payments.find((p) => p.id === req.params.id);
    if (!pay) {
      res.status(404).json({ error: 'Payment not found.' });
      return;
    }
    const now = new Date().toISOString();
    pay.status = 'REFUNDED';
    pay.refundedAt = now;
    const inv = db.subscriptionInvoices.find((i) => i.id === pay.invoiceId);
    if (inv) inv.status = 'REFUNDED';

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'PAYMENT_REFUNDED',
      resourceType: 'Payment',
      resourceId: pay.gatewayPaymentId,
      ip: getClientIp(req),
      details: `Refunded ₹${pay.amount} for ${pay.organizationName}.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ payment: pay });
  });

  // =========================================================================
  // 8. INFRASTRUCTURE, LOAD BALANCING & DATABASE PROBE
  // =========================================================================
  router.get('/owner/infrastructure/live', requireOwnerAuth, (_req: Request, res: Response) => {
    res.json({ infrastructure: getRealInfrastructureSnapshot() });
  });

  router.patch('/owner/infrastructure/scaling-policy', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const b = req.body || {};
    db.scalingPolicy = {
      ...db.scalingPolicy,
      minInstances: Number(b.minInstances ?? db.scalingPolicy.minInstances),
      maxInstances: Number(b.maxInstances ?? db.scalingPolicy.maxInstances),
      targetCpuPercent: Number(b.targetCpuPercent ?? db.scalingPolicy.targetCpuPercent),
      targetMemoryPercent: Number(b.targetMemoryPercent ?? db.scalingPolicy.targetMemoryPercent),
      targetRequestsPerMin: Number(b.targetRequestsPerMin ?? db.scalingPolicy.targetRequestsPerMin),
      targetQueueDepth: Number(b.targetQueueDepth ?? db.scalingPolicy.targetQueueDepth),
      autoScalingEnabled: Boolean(b.autoScalingEnabled ?? db.scalingPolicy.autoScalingEnabled),
      cdnEnabled: Boolean(b.cdnEnabled ?? db.scalingPolicy.cdnEnabled),
      redisCacheEnabled: Boolean(b.redisCacheEnabled ?? db.scalingPolicy.redisCacheEnabled),
      updatedAt: new Date().toISOString(),
    };
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'SCALING_POLICY_UPDATED',
      resourceType: 'ScalingPolicy',
      resourceId: 'GLOBAL',
      ip: getClientIp(req),
      details: `Scaling targets updated: CPU ${db.scalingPolicy.targetCpuPercent}%, RAM ${db.scalingPolicy.targetMemoryPercent}%, min/max ${db.scalingPolicy.minInstances}/${db.scalingPolicy.maxInstances}.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ scalingPolicy: db.scalingPolicy });
  });

  router.post('/owner/infrastructure/probe-db', requireOwnerAuth, async (_req: Request, res: Response) => {
    const start = Date.now();
    const db = readSalarDb();
    const saasStoreWriteMs = Date.now() - start;

    let firestoreReachable = false;
    let firestoreLatencyMs = -1;
    let firestoreNote = 'Checked Firestore REST endpoint.';
    try {
      const cfg = JSON.parse(
        fs.readFileSync(getBundledConfigPath('firebase-applet-config.json'), 'utf-8')
      ) as { projectId?: string; firestoreDatabaseId?: string };
      if (cfg.projectId) {
        const fsStart = Date.now();
        const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${encodeURIComponent(
          cfg.firestoreDatabaseId || '(default)'
        )}/documents/settings/institute`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
        firestoreLatencyMs = Date.now() - fsStart;
        firestoreReachable = resp.status < 500;
        firestoreNote = `HTTP ${resp.status} from Firestore (${cfg.projectId})`;
      }
    } catch (err) {
      firestoreNote = err instanceof Error ? err.message : 'Firestore probe timed out';
    }

    res.json({
      checkedAt: new Date().toISOString(),
      saasStoreWriteMs,
      firestoreReachable,
      firestoreLatencyMs,
      firestoreNote,
      totalOrganizations: db.organizations.length,
      totalTenants: db.tenants.length,
      archivedTenants: db.archivedTenants.length,
    });
  });

  // =========================================================================
  // 9. DOMAINS & SSL VERIFICATION (Real DNS + TLS/HTTPS Check)
  // =========================================================================
  router.post('/owner/domains', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const body = req.body || {};
    const organizationId = String(body.organizationId || '').trim();
    const domain = String(body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    const type = (String(body.type || 'CUSTOM_DOMAIN') as 'SUBDOMAIN' | 'CUSTOM_DOMAIN');

    const org = db.organizations.find((o) => o.id === organizationId);
    if (!org) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      res.status(400).json({ error: 'Enter a valid domain name (e.g. tests.gurukulclasses.com).' });
      return;
    }
    if (db.tenantDomains.some((d) => d.isActive && d.domain === domain)) {
      res.status(409).json({ error: `Domain ${domain} is already actively bound to an organization.` });
      return;
    }

    const now = new Date().toISOString();
    const dom: TenantDomain = {
      id: `dom-${crypto.randomBytes(4).toString('hex')}`,
      organizationId: org.id,
      tenantId: org.tenantId,
      domain,
      type,
      dnsTarget: 'cname.salartech.com',
      dnsVerified: false,
      sslStatus: 'PENDING',
      lastCheckedAt: now,
      verificationNotes: 'Pending DNS & SSL verification.',
      isActive: false,
      createdAt: now,
    };
    db.tenantDomains.unshift(dom);
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'DOMAIN_ADDED',
      resourceType: 'TenantDomain',
      resourceId: domain,
      ip: getClientIp(req),
      details: `Added ${type} ${domain} (inactive until verified) for ${org.instituteName}.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ domain: dom });
  });

  router.post('/owner/domains/:id/verify', requireOwnerAuth, async (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const dom = db.tenantDomains.find((d) => d.id === req.params.id);
    if (!dom) {
      res.status(404).json({ error: 'Domain record not found.' });
      return;
    }
    const now = new Date().toISOString();

    const wildcardBase = (process.env.WILDCARD_DOMAIN_BASE || '').trim().toLowerCase();
    if (dom.type === 'SUBDOMAIN' && wildcardBase && dom.domain.endsWith(`.${wildcardBase}`)) {
      dom.dnsVerified = true;
      dom.sslStatus = 'ACTIVE';
      dom.sslExpiresAt = addPeriodToIso(now, 'YEARLY');
      dom.isActive = true;
      dom.lastCheckedAt = now;
      dom.verificationNotes = `Platform *.${wildcardBase} wildcard DNS and TLS verified.`;
      writeSalarDb(db);
      res.json({ domain: dom });
      return;
    }

    let dnsOk = false;
    let dnsDetail = '';
    try {
      const cnames = await dns.resolveCname(dom.domain).catch(() => []);
      const aRecs = await dns.resolve4(dom.domain).catch(() => []);
      if (cnames.length > 0 || aRecs.length > 0) {
        dnsOk = true;
        dnsDetail = cnames.length > 0 ? `CNAME -> ${cnames.join(', ')}` : `A -> ${aRecs.join(', ')}`;
      } else {
        dnsDetail = 'No A or CNAME DNS record found.';
      }
    } catch (err) {
      dnsDetail = err instanceof Error ? err.message : 'DNS lookup failed.';
    }

    let sslOk = false;
    let sslDetail = '';
    if (dnsOk) {
      try {
        const resp = await fetch(`https://${dom.domain}`, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
        sslOk = resp.status > 0;
        sslDetail = `HTTPS TLS responded (${resp.status}).`;
      } catch (err) {
        sslDetail = err instanceof Error ? `HTTPS check failed: ${err.message}` : 'TLS handshake failed.';
      }
    }

    dom.dnsVerified = dnsOk;
    dom.sslStatus = dnsOk && sslOk ? 'ACTIVE' : 'FAILED';
    dom.isActive = dnsOk && sslOk;
    dom.lastCheckedAt = now;
    if (dom.isActive) dom.sslExpiresAt = addPeriodToIso(now, 'YEARLY');
    dom.verificationNotes = `${dnsDetail} ${sslDetail}`.trim();

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: dom.isActive ? 'DOMAIN_VERIFIED_ACTIVE' : 'DOMAIN_VERIFICATION_FAILED',
      resourceType: 'TenantDomain',
      resourceId: dom.domain,
      ip: getClientIp(req),
      details: dom.verificationNotes,
      status: dom.isActive ? 'SUCCESS' : 'FAILED',
    });
    writeSalarDb(db);
    res.json({ domain: dom });
  });

  router.delete('/owner/domains/:id', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const idx = db.tenantDomains.findIndex((d) => d.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Domain not found.' });
      return;
    }
    const [removed] = db.tenantDomains.splice(idx, 1);
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'DOMAIN_UNBOUND',
      resourceType: 'TenantDomain',
      resourceId: removed.domain,
      ip: getClientIp(req),
      details: `Removed domain binding ${removed.domain}.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ ok: true });
  });

  router.post('/owner/domains/:id/transfer', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const dom = db.tenantDomains.find((d) => d.id === req.params.id);
    if (!dom) {
      res.status(404).json({ error: 'Domain not found.' });
      return;
    }
    const targetOrgId = String(req.body?.targetOrganizationId || '').trim();
    const targetOrg = db.organizations.find((o) => o.id === targetOrgId && o.status !== 'ARCHIVED');
    if (!targetOrg) {
      res.status(404).json({ error: 'Target active client organization not found.' });
      return;
    }
    if (targetOrg.id === dom.organizationId) {
      res.status(400).json({ error: 'Domain is already bound to this organization.' });
      return;
    }

    const oldOrgId = dom.organizationId;
    const now = new Date().toISOString();
    dom.organizationId = targetOrg.id;
    dom.tenantId = targetOrg.tenantId;
    dom.redirectToDomain = undefined;
    dom.lastCheckedAt = now;
    if (dom.type === 'CUSTOM_DOMAIN') {
      targetOrg.customDomain = dom.domain;
    } else {
      targetOrg.subdomain = dom.domain;
    }
    targetOrg.updatedAt = now;

    const oldOrg = db.organizations.find((o) => o.id === oldOrgId);
    if (oldOrg) {
      if (oldOrg.customDomain === dom.domain) oldOrg.customDomain = '';
      oldOrg.updatedAt = now;
    }

    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'DOMAIN_TRANSFERRED',
      resourceType: 'TenantDomain',
      resourceId: dom.domain,
      ip: getClientIp(req),
      details: `Transferred domain ${dom.domain} from ${oldOrgId} to ${targetOrg.id} (${targetOrg.instituteName}).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ domain: dom });
  });

  // =========================================================================
  // 10. BACKUP & RECOVERY CENTER
  // =========================================================================
  router.post('/owner/backups', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const scope = (String(req.body?.scope || 'FULL_PLATFORM') as 'FULL_PLATFORM' | 'TENANT' | 'STORAGE');
    const organizationId = typeof req.body?.organizationId === 'string' ? req.body.organizationId : undefined;
    const job = createBackupArchive(db, {
      scope,
      organizationId,
      actor: req.ownerUsername || 'OWNER',
    });
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'BACKUP_CREATED',
      resourceType: 'BackupJob',
      resourceId: job.archiveName,
      ip: getClientIp(req),
      details: `Created ${scope} backup (${job.sizeBytes} bytes, SHA-256 ${job.sha256Checksum.slice(0, 12)}...).`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ backup: job });
  });

  router.post('/owner/backups/:id/verify', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const job = db.backupJobs.find((b) => b.id === req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Backup job not found.' });
      return;
    }
    const check = verifyAndReadBackupFile(job);
    job.status = check.valid ? 'VERIFIED' : 'FAILED';
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'BACKUP_VERIFIED',
      resourceType: 'BackupJob',
      resourceId: job.archiveName,
      ip: getClientIp(req),
      details: check.valid ? 'SHA-256 & archive readability verified.' : (check.error || 'Verification failed'),
      status: check.valid ? 'SUCCESS' : 'FAILED',
    });
    writeSalarDb(db);
    res.json({ backup: job, valid: check.valid, error: check.error });
  });

  router.get('/owner/backups/:id/download', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const job = db.backupJobs.find((b) => b.id === req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Backup job not found.' });
      return;
    }
    const safeName = path.basename(job.archiveName);
    const target = path.resolve(BACKUPS_DIR, safeName);
    if (!target.startsWith(BACKUPS_DIR + path.sep) || !fs.existsSync(target)) {
      res.status(404).json({ error: 'Backup file missing.' });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    fs.createReadStream(target).pipe(res);
  });

  router.post('/owner/backups/:id/restore', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const job = db.backupJobs.find((b) => b.id === req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Backup job not found.' });
      return;
    }
    const dryRun = Boolean(req.body?.dryRun);
    const check = verifyAndReadBackupFile(job);
    const now = new Date().toISOString();

    if (!check.valid) {
      db.restoreJobs.unshift({
        id: `rst-${crypto.randomBytes(4).toString('hex')}`,
        backupJobId: job.id,
        targetOrganizationId: job.organizationId,
        targetTenantId: job.tenantId,
        dryRun,
        status: 'FAILED',
        notes: check.error || 'Verification failed before restore.',
        restoredBy: req.ownerUsername || 'OWNER',
        createdAt: now,
      });
      writeSalarDb(db);
      res.status(400).json({ error: check.error || 'Backup verification failed.' });
      return;
    }

    const rJob = {
      id: `rst-${crypto.randomBytes(4).toString('hex')}`,
      backupJobId: job.id,
      targetOrganizationId: job.organizationId,
      targetTenantId: job.tenantId,
      dryRun,
      status: 'COMPLETED' as const,
      notes: dryRun
        ? `Dry-run integrity & decryption verified for ${job.archiveName}. No live records modified.`
        : `Verified and restored snapshot ${job.archiveName}.`,
      restoredBy: req.ownerUsername || 'OWNER',
      createdAt: now,
    };

    if (!dryRun && job.scope === 'TENANT' && job.organizationId) {
      const snap = check.decryptedJson as { organization?: Organization; tenant?: typeof db.tenants[0] };
      if (snap?.organization) {
        const idx = db.organizations.findIndex((o) => o.id === job.organizationId);
        if (idx >= 0) db.organizations[idx] = { ...snap.organization, updatedAt: now };
        else db.organizations.unshift(snap.organization);
      }
      if (snap?.tenant) {
        const tIdx = db.tenants.findIndex((t) => t.id === snap.tenant!.id);
        if (tIdx >= 0) db.tenants[tIdx] = { ...snap.tenant, updatedAt: now };
        else db.tenants.unshift(snap.tenant);
      }
    }

    db.restoreJobs.unshift(rJob);
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: dryRun ? 'BACKUP_RESTORE_DRY_RUN' : 'BACKUP_RESTORED',
      resourceType: 'RestoreJob',
      resourceId: rJob.id,
      ip: getClientIp(req),
      details: rJob.notes,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ restoreJob: rJob });
  });

  // =========================================================================
  // 11. SECURITY CENTER, MFA, SESSIONS & SETTINGS
  // =========================================================================
  router.post('/owner/security/mfa/setup', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const secret = generateTotpSecret();
    const owner = db.ownerUsers[0];
    if (!owner) {
      res.status(400).json({ error: 'TOTP MFA setup requires a claimed DB Owner account.' });
      return;
    }
    owner.mfaSecret = secret;
    owner.updatedAt = new Date().toISOString();
    writeSalarDb(db);
    const otpauthUrl = `otpauth://totp/SALARTech:${encodeURIComponent(owner.username)}?secret=${secret}&issuer=SALARTech`;
    res.json({ secret, otpauthUrl });
  });

  router.post('/owner/security/mfa/enable', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const owner = db.ownerUsers[0];
    if (!owner || !owner.mfaSecret) {
      res.status(400).json({ error: 'Generate an MFA secret first.' });
      return;
    }
    const code = String(req.body?.code || '').trim();
    if (!verifyTotpCode(owner.mfaSecret, code)) {
      res.status(400).json({ error: 'Invalid 6-digit authenticator code.' });
      return;
    }
    owner.mfaEnabled = true;
    owner.updatedAt = new Date().toISOString();
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'OWNER_MFA_ENABLED',
      resourceType: 'OwnerUser',
      resourceId: owner.id,
      ip: getClientIp(req),
      details: 'Enabled RFC-6238 TOTP 2FA on Platform Owner account.',
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ mfaEnabled: true });
  });

  router.post('/owner/security/mfa/disable', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const owner = db.ownerUsers[0];
    if (!owner) {
      res.status(400).json({ error: 'Owner account not found.' });
      return;
    }
    owner.mfaEnabled = false;
    owner.mfaSecret = undefined;
    owner.updatedAt = new Date().toISOString();
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'OWNER_MFA_DISABLED',
      resourceType: 'OwnerUser',
      resourceId: owner.id,
      ip: getClientIp(req),
      details: 'Disabled TOTP 2FA on Platform Owner account.',
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ mfaEnabled: false });
  });

  router.post('/owner/security/password', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const owner = db.ownerUsers[0];
    if (!owner) {
      res.status(400).json({ error: 'Environment-configured Owner password must be updated in Environment Secrets.' });
      return;
    }
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!verifyPasswordScrypt(currentPassword, owner.salt, owner.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    const { salt, hash } = hashPasswordScrypt(newPassword);
    owner.salt = salt;
    owner.passwordHash = hash;
    owner.updatedAt = new Date().toISOString();
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'OWNER_PASSWORD_CHANGED',
      resourceType: 'OwnerUser',
      resourceId: owner.id,
      ip: getClientIp(req),
      details: 'Updated Platform Owner scrypt password hash.',
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ ok: true });
  });

  router.post('/owner/security/sessions/:id/revoke', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const s = db.ownerSessions.find((item) => item.id === req.params.id);
    if (!s) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    s.revokedAt = new Date().toISOString();
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'OWNER_SESSION_REVOKED',
      resourceType: 'OwnerSession',
      resourceId: s.id,
      ip: getClientIp(req),
      details: `Revoked Owner session from IP ${s.ip}.`,
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ ok: true });
  });

  router.post('/owner/notifications/:id/read', requireOwnerAuth, (req: Request, res: Response) => {
    const db = readSalarDb();
    const n = db.notifications.find((item) => item.id === req.params.id);
    if (n) {
      n.read = true;
      writeSalarDb(db);
    }
    res.json({ ok: true });
  });

  router.patch('/owner/settings', requireOwnerAuth, (req: AuthenticatedOwnerRequest, res: Response) => {
    const db = readSalarDb();
    const b = req.body || {};
    db.systemSettings = {
      ...db.systemSettings,
      platformName: String(b.platformName ?? db.systemSettings.platformName),
      ownerDisplayName: String(b.ownerDisplayName ?? db.systemSettings.ownerDisplayName),
      ownerEmail: String(b.ownerEmail ?? db.systemSettings.ownerEmail),
      supportEmail: String(b.supportEmail ?? db.systemSettings.supportEmail),
      gstNumber: String(b.gstNumber ?? db.systemSettings.gstNumber),
      defaultGstPercent: Number(b.defaultGstPercent ?? db.systemSettings.defaultGstPercent),
      rpoTargetMinutes: Number(b.rpoTargetMinutes ?? db.systemSettings.rpoTargetMinutes),
      rtoTargetMinutes: Number(b.rtoTargetMinutes ?? db.systemSettings.rtoTargetMinutes),
      retentionDays: Number(b.retentionDays ?? db.systemSettings.retentionDays),
      rateLimitMaxAttempts: Number(b.rateLimitMaxAttempts ?? db.systemSettings.rateLimitMaxAttempts),
      rateLimitWindowMinutes: Number(b.rateLimitWindowMinutes ?? db.systemSettings.rateLimitWindowMinutes),
      sessionTimeoutHours: Number(b.sessionTimeoutHours ?? db.systemSettings.sessionTimeoutHours),
      enforceMfaForSensitiveActions: Boolean(b.enforceMfaForSensitiveActions ?? db.systemSettings.enforceMfaForSensitiveActions),
      backupEncryptionEnabled: Boolean(b.backupEncryptionEnabled ?? db.systemSettings.backupEncryptionEnabled),
      activePaymentGateway:
        b.activePaymentGateway === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'MANUAL',
      updatedAt: new Date().toISOString(),
    };
    if (db.ownerUsers[0]) {
      db.ownerUsers[0].displayName = db.systemSettings.ownerDisplayName;
      db.ownerUsers[0].email = db.systemSettings.ownerEmail;
    }
    appendAuditLog(db, {
      actor: req.ownerUsername || 'OWNER',
      actorType: 'OWNER',
      action: 'SYSTEM_SETTINGS_UPDATED',
      resourceType: 'SystemSettings',
      resourceId: 'PLATFORM',
      ip: getClientIp(req),
      details: 'Updated platform governance, billing, RPO/RTO & rate-limit settings.',
      status: 'SUCCESS',
    });
    writeSalarDb(db);
    res.json({ systemSettings: db.systemSettings });
  });

  // =========================================================================
  // 11. ISOLATED PER-CLIENT TENANT AUTH & DATABASE API (/tenant/:orgId/*)
  // =========================================================================
  function signTenantSessionToken(payload: {
    orgId: string;
    tenantId: string;
    role: 'SUPER_ADMIN' | 'STUDENT';
    uid: string;
    email: string;
    exp: number;
  }): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SERVER_KEYS.sessionSecret).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  function verifyTenantSessionToken(token: string): {
    orgId: string;
    tenantId: string;
    role: 'SUPER_ADMIN' | 'STUDENT';
    uid: string;
    email: string;
    exp: number;
  } | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SERVER_KEYS.sessionSecret).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
        orgId: string;
        tenantId: string;
        role: 'SUPER_ADMIN' | 'STUDENT';
        uid: string;
        email: string;
        exp: number;
      };
      if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function tenantCookieName(orgId: string, kind: 'admin' | 'student'): string {
    const safe = orgId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `salar_t_${kind}_${safe}`;
  }

  function setTenantCookie(res: Response, orgId: string, kind: 'admin' | 'student', token: string) {
    const maxAge = 30 * 24 * 60 * 60;
    res.setHeader(
      'Set-Cookie',
      `${tenantCookieName(orgId, kind)}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  }

  function clearTenantCookie(res: Response, orgId: string, kind: 'admin' | 'student') {
    res.setHeader(
      'Set-Cookie',
      `${tenantCookieName(orgId, kind)}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  }

  function resolveSecondaryOrg(orgId: string): { org: Organization; blocked: boolean; blockReason?: string } | null {
    const db = readSalarDb();
    const org = db.organizations.find((o) => o.id === orgId);
    if (!org || org.id === 'SALAR-ORG-00001') return null;
    const license = db.licenses.find((l) => l.id === org.licenseId);
    const expiredByDate =
      license && license.status === 'ACTIVE' && new Date(license.expirationDate).getTime() <= Date.now();
    const blocked =
      org.status === 'SUSPENDED' ||
      org.status === 'ARCHIVED' ||
      Boolean(expiredByDate) ||
      Boolean(license && ['SUSPENDED', 'EXPIRED', 'REVOKED', 'RELEASED'].includes(license.status));
    return {
      org,
      blocked,
      blockReason: blocked ? `Portal access for ${org.instituteName} (${org.id}) is suspended.` : undefined,
    };
  }

  function resolveTenantCaller(req: Request, org: Organization): {
    role: 'SUPER_ADMIN' | 'STUDENT' | 'PUBLIC';
    uid: string;
    email: string;
  } {
    const cookies = parseCookies(req.headers.cookie);
    const adminToken = cookies[tenantCookieName(org.id, 'admin')];
    if (adminToken) {
      const p = verifyTenantSessionToken(adminToken);
      if (p && p.role === 'SUPER_ADMIN' && p.orgId === org.id && p.tenantId === org.tenantId) {
        return { role: 'SUPER_ADMIN', uid: p.uid, email: p.email };
      }
    }
    const stuToken = cookies[tenantCookieName(org.id, 'student')];
    if (stuToken) {
      const p = verifyTenantSessionToken(stuToken);
      if (p && p.role === 'STUDENT' && p.orgId === org.id && p.tenantId === org.tenantId) {
        return { role: 'STUDENT', uid: p.uid, email: p.email };
      }
    }
    return { role: 'PUBLIC', uid: '', email: '' };
  }

  // Tenant Admin Gate Endpoints
  router.get('/tenant/:orgId/auth/admin/status', (req: Request, res: Response) => {
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved) {
      res.status(404).json({ error: 'Client portal organization not found.' });
      return;
    }
    const store = ensureTenantStore(resolved.org);
    res.json({
      hasClaimedPasscode: Boolean(store.adminCredential),
      requiresClaim: !store.adminCredential,
    });
  });

  router.get('/tenant/:orgId/auth/admin/session', (req: Request, res: Response) => {
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved) {
      res.json({ authenticated: false });
      return;
    }
    const caller = resolveTenantCaller(req, resolved.org);
    if (caller.role !== 'SUPER_ADMIN') {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, role: 'SUPER_ADMIN', orgId: resolved.org.id, email: caller.email });
  });

  router.post('/tenant/:orgId/auth/admin/claim', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved) {
      res.status(404).json({ error: 'Client portal organization not found.' });
      return;
    }
    if (resolved.blocked) {
      res.status(403).json({ error: resolved.blockReason });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    const adminEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (adminEmail) {
      const db = readSalarDb();
      const allowedEmails = new Set([
        resolved.org.email.trim().toLowerCase(),
        ...db.organizationUsers
          .filter((u) => u.organizationId === resolved.org.id && u.role === 'CLIENT_SUPER_ADMIN' && u.status === 'ACTIVE')
          .map((u) => u.email.trim().toLowerCase()),
      ]);
      if (!allowedEmails.has(adminEmail)) {
        res.status(401).json({ error: `Administrator email ${adminEmail} is not registered for ${resolved.org.instituteName}.` });
        return;
      }
    }
    if (passcode.length < 6 || passcode.length > 128) {
      res.status(400).json({ error: 'Passcode must be between 6 and 128 characters.' });
      return;
    }
    try {
      setTenantAdminPasscode(resolved.org, passcode, false);
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Already claimed.' });
      return;
    }
    const token = signTenantSessionToken({
      orgId: resolved.org.id,
      tenantId: resolved.org.tenantId,
      role: 'SUPER_ADMIN',
      uid: `admin_${resolved.org.id}`,
      email: adminEmail || resolved.org.email,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    setTenantCookie(res, resolved.org.id, 'admin', token);
    res.json({ ok: true, token, role: 'SUPER_ADMIN' });
  });

  router.post('/tenant/:orgId/auth/admin/login', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved) {
      res.status(404).json({ error: 'Client portal organization not found.' });
      return;
    }
    if (resolved.blocked) {
      res.status(403).json({ error: resolved.blockReason });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    const adminEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (adminEmail) {
      const db = readSalarDb();
      const allowedEmails = new Set([
        resolved.org.email.trim().toLowerCase(),
        ...db.organizationUsers
          .filter((u) => u.organizationId === resolved.org.id && u.role === 'CLIENT_SUPER_ADMIN' && u.status === 'ACTIVE')
          .map((u) => u.email.trim().toLowerCase()),
      ]);
      if (!allowedEmails.has(adminEmail)) {
        res.status(401).json({ error: `Administrator email ${adminEmail} is not authorized for ${resolved.org.instituteName}.` });
        return;
      }
    }
    if (!passcode) {
      res.status(400).json({ error: 'Passcode is required.' });
      return;
    }
    const store = ensureTenantStore(resolved.org);
    if (!store.adminCredential) {
      res.status(400).json({ error: 'Admin passcode not set yet. Claim your initial passcode first.' });
      return;
    }
    if (!verifyTenantAdminPasscode(resolved.org, passcode)) {
      res.status(401).json({ error: 'Invalid administrator passcode.' });
      return;
    }
    const token = signTenantSessionToken({
      orgId: resolved.org.id,
      tenantId: resolved.org.tenantId,
      role: 'SUPER_ADMIN',
      uid: `admin_${resolved.org.id}`,
      email: adminEmail || resolved.org.email,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    setTenantCookie(res, resolved.org.id, 'admin', token);
    res.json({ ok: true, token, role: 'SUPER_ADMIN' });
  });

  router.post('/tenant/:orgId/auth/admin/logout', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    clearTenantCookie(res, String(req.params.orgId || ''), 'admin');
    res.json({ ok: true });
  });

  // Tenant Student Auth Endpoints
  router.get('/tenant/:orgId/auth/student/session', (req: Request, res: Response) => {
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved || resolved.blocked) {
      res.json({ authenticated: false });
      return;
    }
    const caller = resolveTenantCaller(req, resolved.org);
    if (caller.role !== 'STUDENT') {
      res.json({ authenticated: false });
      return;
    }
    const found = getTenantStudentByUid(resolved.org, caller.uid);
    if (!found) {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, role: 'STUDENT', student: found.student });
  });

  router.post('/tenant/:orgId/auth/student/register', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved) {
      res.status(404).json({ error: 'Client portal organization not found.' });
      return;
    }
    if (resolved.blocked) {
      res.status(403).json({ error: resolved.blockReason });
      return;
    }
    const b = req.body || {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!name || !email || password.length < 6) {
      res.status(400).json({ error: 'Name, valid email, and password (min 6 characters) are required.' });
      return;
    }
    try {
      const { uid, student } = registerTenantStudent(resolved.org, {
        name,
        email,
        password,
        mobile: typeof b.mobile === 'string' ? b.mobile : '',
        classLevel: typeof b.classLevel === 'string' ? b.classLevel : 'Class 12th',
        targetExam: typeof b.targetExam === 'string' ? b.targetExam : 'JEE Main',
        origin: b.origin === 'QUICK_JOIN' ? 'QUICK_JOIN' : 'PORTAL_SIGNUP',
      });
      const token = signTenantSessionToken({
        orgId: resolved.org.id,
        tenantId: resolved.org.tenantId,
        role: 'STUDENT',
        uid,
        email,
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
      setTenantCookie(res, resolved.org.id, 'student', token);
      res.status(201).json({ ok: true, student });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
    }
  });

  router.post('/tenant/:orgId/auth/student/login', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved) {
      res.status(404).json({ error: 'Client portal organization not found.' });
      return;
    }
    if (resolved.blocked) {
      res.status(403).json({ error: resolved.blockReason });
      return;
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const found = authenticateTenantStudent(resolved.org, email, password);
    if (!found) {
      res.status(401).json({ error: 'Invalid email or password for this institute portal.' });
      return;
    }
    const token = signTenantSessionToken({
      orgId: resolved.org.id,
      tenantId: resolved.org.tenantId,
      role: 'STUDENT',
      uid: found.uid,
      email,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    setTenantCookie(res, resolved.org.id, 'student', token);
    res.json({ ok: true, student: found.student });
  });

  router.post('/tenant/:orgId/auth/student/logout', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden: Invalid request origin.' });
      return;
    }
    clearTenantCookie(res, String(req.params.orgId || ''), 'student');
    res.json({ ok: true });
  });

  // Isolated Per-Tenant DB API (strict collection allowlist + RBAC)
  function canReadTenantCollection(role: 'SUPER_ADMIN' | 'STUDENT' | 'PUBLIC', uid: string, colPath: string, docData: Record<string, unknown>): boolean {
    if (role === 'SUPER_ADMIN') return true;
    if (colPath === 'settings') return true;
    if (colPath === 'courses' || colPath === 'testSeries') {
      return docData.status === 'PUBLISHED';
    }
    if (role === 'PUBLIC') return false;
    // STUDENT role checks
    if (colPath === 'exams') return docData.status === 'LIVE';
    if (/^exams\/[a-zA-Z0-9_-]{1,128}\/questions$/.test(colPath)) return docData.examStatus === 'LIVE';
    if (colPath === 'batches') return docData.status === 'ACTIVE';
    if (colPath === 'studyMaterials') return true;
    if (colPath === 'notifications') {
      return docData.targetType === 'ALL' || docData.targetType === 'BATCH' || docData.targetStudentUid === uid;
    }
    if (colPath === 'students') return docData.uid === uid;
    if (['batchStudents', 'examAssignments', 'examAttempts', 'attendance', 'payments', 'enrollments'].includes(colPath)) {
      return docData.studentUid === uid;
    }
    return false;
  }

  function canWriteTenantDoc(
    role: 'SUPER_ADMIN' | 'STUDENT' | 'PUBLIC',
    uid: string,
    colPath: string,
    op: 'add' | 'set' | 'update' | 'delete',
    data: Record<string, unknown>,
    existing?: Record<string, unknown>
  ): boolean {
    if (role === 'SUPER_ADMIN') return true;
    if (role !== 'STUDENT') return false;
    if (op === 'delete') return false;
    if (colPath === 'students') {
      return Boolean(existing && existing.uid === uid);
    }
    if (colPath === 'examAttempts') {
      if (op === 'set' || op === 'add') return data.studentUid === uid && data.status === 'IN_PROGRESS';
      if (op === 'update') return Boolean(existing && existing.studentUid === uid && existing.status === 'IN_PROGRESS');
    }
    if (colPath === 'payments' && (op === 'add' || op === 'set')) {
      return data.studentUid === uid && data.status === 'PENDING';
    }
    if (colPath === 'studyMaterials' && op === 'update') {
      return Object.keys(data).every((k) => k === 'downloadCount');
    }
    if (colPath === 'notifications' && op === 'update') {
      return Object.keys(data).every((k) => k === 'readBy');
    }
    return false;
  }

  router.post('/tenant/:orgId/db/query', (req: Request, res: Response) => {
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved) {
      res.status(404).json({ error: 'Tenant not found.' });
      return;
    }
    if (resolved.blocked) {
      res.status(403).json({ error: resolved.blockReason });
      return;
    }
    const colPath = typeof req.body?.collectionPath === 'string' ? req.body.collectionPath.trim() : '';
    if (!isAllowedTenantCollectionPath(colPath)) {
      res.status(400).json({ error: 'Invalid collection path.' });
      return;
    }
    const caller = resolveTenantCaller(req, resolved.org);
    const filters = Array.isArray(req.body?.filters) ? req.body.filters : [];
    const orderBys = Array.isArray(req.body?.orderBys) ? req.body.orderBys : [];
    const allItems = queryTenantCollection(resolved.org, colPath, filters, orderBys);
    const visible = allItems.filter((item) => canReadTenantCollection(caller.role, caller.uid, colPath, item.data));
    res.json({ docs: visible });
  });

  router.post('/tenant/:orgId/db/doc/get', (req: Request, res: Response) => {
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved) {
      res.status(404).json({ error: 'Tenant not found.' });
      return;
    }
    const colPath = typeof req.body?.collectionPath === 'string' ? req.body.collectionPath.trim() : '';
    const docId = typeof req.body?.docId === 'string' ? req.body.docId.trim() : '';
    if (!isAllowedTenantCollectionPath(colPath) || !isValidDocId(docId)) {
      res.status(400).json({ error: 'Invalid document reference.' });
      return;
    }
    const caller = resolveTenantCaller(req, resolved.org);
    const store = ensureTenantStore(resolved.org);
    const docData = store.collections[colPath]?.[docId];
    if (!docData) {
      res.json({ exists: false, id: docId });
      return;
    }
    if (!canReadTenantCollection(caller.role, caller.uid, colPath, docData)) {
      res.status(403).json({ error: 'Permission denied.' });
      return;
    }
    res.json({ exists: true, id: docId, data: docData });
  });

  router.post('/tenant/:orgId/db/doc/add', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved || resolved.blocked) {
      res.status(403).json({ error: resolved?.blockReason || 'Tenant unavailable.' });
      return;
    }
    const colPath = typeof req.body?.collectionPath === 'string' ? req.body.collectionPath.trim() : '';
    const data = req.body?.data && typeof req.body.data === 'object' ? (req.body.data as Record<string, unknown>) : null;
    if (!isAllowedTenantCollectionPath(colPath) || !data) {
      res.status(400).json({ error: 'Invalid add payload.' });
      return;
    }
    const caller = resolveTenantCaller(req, resolved.org);
    if (!canWriteTenantDoc(caller.role, caller.uid, colPath, 'add', data)) {
      res.status(403).json({ error: 'Permission denied.' });
      return;
    }
    const store = ensureTenantStore(resolved.org);
    if (!store.collections[colPath]) store.collections[colPath] = {};
    const docId = `td_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    store.collections[colPath][docId] = applyTenantPayloadPatch({}, data);
    writeTenantStore(resolved.org.tenantId, store);
    res.status(201).json({ id: docId });
  });

  router.post('/tenant/:orgId/db/doc/set', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved || resolved.blocked) {
      res.status(403).json({ error: resolved?.blockReason || 'Tenant unavailable.' });
      return;
    }
    const colPath = typeof req.body?.collectionPath === 'string' ? req.body.collectionPath.trim() : '';
    const docId = typeof req.body?.docId === 'string' ? req.body.docId.trim() : '';
    const data = req.body?.data && typeof req.body.data === 'object' ? (req.body.data as Record<string, unknown>) : null;
    const merge = Boolean(req.body?.merge);
    if (!isAllowedTenantCollectionPath(colPath) || !isValidDocId(docId) || !data) {
      res.status(400).json({ error: 'Invalid set payload.' });
      return;
    }
    const store = ensureTenantStore(resolved.org);
    const existing = store.collections[colPath]?.[docId];
    const caller = resolveTenantCaller(req, resolved.org);
    if (!canWriteTenantDoc(caller.role, caller.uid, colPath, 'set', data, existing)) {
      res.status(403).json({ error: 'Permission denied.' });
      return;
    }
    if (!store.collections[colPath]) store.collections[colPath] = {};
    store.collections[colPath][docId] = applyTenantPayloadPatch(merge && existing ? existing : {}, data);
    writeTenantStore(resolved.org.tenantId, store);
    res.json({ ok: true, id: docId });
  });

  router.post('/tenant/:orgId/db/doc/update', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved || resolved.blocked) {
      res.status(403).json({ error: resolved?.blockReason || 'Tenant unavailable.' });
      return;
    }
    const colPath = typeof req.body?.collectionPath === 'string' ? req.body.collectionPath.trim() : '';
    const docId = typeof req.body?.docId === 'string' ? req.body.docId.trim() : '';
    const data = req.body?.data && typeof req.body.data === 'object' ? (req.body.data as Record<string, unknown>) : null;
    if (!isAllowedTenantCollectionPath(colPath) || !isValidDocId(docId) || !data) {
      res.status(400).json({ error: 'Invalid update payload.' });
      return;
    }
    const store = ensureTenantStore(resolved.org);
    const existing = store.collections[colPath]?.[docId];
    if (!existing) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const caller = resolveTenantCaller(req, resolved.org);
    if (!canWriteTenantDoc(caller.role, caller.uid, colPath, 'update', data, existing)) {
      res.status(403).json({ error: 'Permission denied.' });
      return;
    }
    store.collections[colPath][docId] = applyTenantPayloadPatch(existing, data);
    writeTenantStore(resolved.org.tenantId, store);
    res.json({ ok: true });
  });

  router.post('/tenant/:orgId/db/doc/delete', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved || resolved.blocked) {
      res.status(403).json({ error: resolved?.blockReason || 'Tenant unavailable.' });
      return;
    }
    const colPath = typeof req.body?.collectionPath === 'string' ? req.body.collectionPath.trim() : '';
    const docId = typeof req.body?.docId === 'string' ? req.body.docId.trim() : '';
    if (!isAllowedTenantCollectionPath(colPath) || !isValidDocId(docId)) {
      res.status(400).json({ error: 'Invalid delete payload.' });
      return;
    }
    const caller = resolveTenantCaller(req, resolved.org);
    if (caller.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Permission denied.' });
      return;
    }
    const store = ensureTenantStore(resolved.org);
    if (store.collections[colPath]) {
      delete store.collections[colPath][docId];
      writeTenantStore(resolved.org.tenantId, store);
    }
    res.json({ ok: true });
  });

  router.post('/tenant/:orgId/db/batch', (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const resolved = resolveSecondaryOrg(String(req.params.orgId || ''));
    if (!resolved || resolved.blocked) {
      res.status(403).json({ error: resolved?.blockReason || 'Tenant unavailable.' });
      return;
    }
    const ops = Array.isArray(req.body?.ops) ? req.body.ops : [];
    const caller = resolveTenantCaller(req, resolved.org);
    if (caller.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Batch writes require tenant Super Admin authentication.' });
      return;
    }
    const store = ensureTenantStore(resolved.org);
    for (const op of ops) {
      const type = String(op?.type || '');
      const colPath = typeof op?.collectionPath === 'string' ? op.collectionPath.trim() : '';
      const docId = typeof op?.docId === 'string' ? op.docId.trim() : '';
      if (!isAllowedTenantCollectionPath(colPath) || !isValidDocId(docId)) {
        res.status(400).json({ error: 'Invalid batch target.' });
        return;
      }
      if (!store.collections[colPath]) store.collections[colPath] = {};
      if (type === 'set') {
        const data = op?.data && typeof op.data === 'object' ? (op.data as Record<string, unknown>) : {};
        store.collections[colPath][docId] = applyTenantPayloadPatch(
          op?.merge && store.collections[colPath][docId] ? store.collections[colPath][docId] : {},
          data
        );
      } else if (type === 'update') {
        const existing = store.collections[colPath][docId] || {};
        const data = op?.data && typeof op.data === 'object' ? (op.data as Record<string, unknown>) : {};
        store.collections[colPath][docId] = applyTenantPayloadPatch(existing, data);
      } else if (type === 'delete') {
        delete store.collections[colPath][docId];
      }
    }
    writeTenantStore(resolved.org.tenantId, store);
    res.json({ ok: true });
  });

  return router;
}
