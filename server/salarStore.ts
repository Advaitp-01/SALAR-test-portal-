import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AuditLogEntry,
  BackupJob,
  BillingCycle,
  LicenseEvent,
  LicensePlan,
  LicenseRecord,
  LicenseStatus,
  ManualPaymentGatewayConfig,
  Organization,
  PlanCode,
  SalarDatabaseSchema,
} from './salarTypes.ts';

import { BACKUPS_DIR, DATA_DIR, UPLOADS_DIR } from './runtimePaths.ts';
import { markCloudDirty, registerKeysReloadHook } from './cloudPersistence.ts';

const DB_FILE = path.join(DATA_DIR, 'salar-saas-db.json');
const KEYS_FILE = path.join(DATA_DIR, 'salar-keys.json');
export { BACKUPS_DIR };

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

interface ServerKeyStore {
  licenseHmacSecret: string;
  backupEncryptionKeyHex: string;
  sessionSecret: string;
}

function getVercelDeploymentSeed(): string {
  const stableVercelMarkers = [
    process.env.VERCEL_PROJECT_ID,
    process.env.VERCEL_ORG_ID,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_GIT_REPO_ID,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join('|');
  let firebaseSeed = '';
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { projectId?: string; appId?: string };
      firebaseSeed = `${cfg.projectId || ''}|${cfg.appId || ''}`;
    }
  } catch {
    // ignore
  }
  const combined = [stableVercelMarkers, firebaseSeed].filter(Boolean).join('|');
  return combined || process.env.VERCEL_URL || '';
}

function loadOrCreateServerKeys(): ServerKeyStore {
  const existing = (() => {
    const candidates = [KEYS_FILE, path.resolve(process.cwd(), '.runtime_auth', 'salar-keys.json')];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as Partial<ServerKeyStore>;
        }
      } catch {
        // ignore
      }
    }
    return {};
  })();

  const isServerless = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  const deploySeed = getVercelDeploymentSeed();
  const deriveFallback = (purpose: string) =>
    isServerless && deploySeed
      ? crypto.createHmac('sha256', `salar-serverless-${purpose}-v1`).update(deploySeed).digest('hex')
      : crypto.randomBytes(32).toString('hex');

  const keys: ServerKeyStore = {
    licenseHmacSecret:
      process.env.LICENSE_HMAC_SECRET?.trim() ||
      existing.licenseHmacSecret ||
      deriveFallback('license'),
    backupEncryptionKeyHex:
      process.env.BACKUP_ENCRYPTION_KEY?.trim() ||
      existing.backupEncryptionKeyHex ||
      deriveFallback('backup'),
    sessionSecret:
      process.env.SESSION_SECRET?.trim() ||
      existing.sessionSecret ||
      deriveFallback('session'),
  };

  if (!fs.existsSync(KEYS_FILE)) {
    try {
      fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
    } catch {
      // Best effort on ephemeral disk
    }
  }
  return keys;
}

export const SERVER_KEYS = loadOrCreateServerKeys();

export function reloadServerKeysFromDisk(): void {
  try {
    if (!fs.existsSync(KEYS_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8')) as Partial<ServerKeyStore>;
    if (!process.env.LICENSE_HMAC_SECRET?.trim() && parsed.licenseHmacSecret) {
      SERVER_KEYS.licenseHmacSecret = parsed.licenseHmacSecret;
    }
    if (!process.env.BACKUP_ENCRYPTION_KEY?.trim() && parsed.backupEncryptionKeyHex) {
      SERVER_KEYS.backupEncryptionKeyHex = parsed.backupEncryptionKeyHex;
    }
    if (!process.env.SESSION_SECRET?.trim() && parsed.sessionSecret) {
      SERVER_KEYS.sessionSecret = parsed.sessionSecret;
    }
  } catch {
    // ignore invalid disk read
  }
}

registerKeysReloadHook(reloadServerKeysFromDisk);

export function hashPasswordScrypt(password: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPasswordScrypt(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPasswordScrypt(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// RFC 6238 TOTP Implementation (no external deps)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += BASE32_ALPHABET[bytes[i] % 32];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < clean.length; i += 1) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function computeTotpCode(secret: string, windowOffset = 0): string {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30) + windowOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (const offset of [-1, 0, 1]) {
    const expected = computeTotpCode(secret, offset);
    if (crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

export function signLicensePayload(licenseKey: string, orgId: string, planCode: string, expDate: string): string {
  return crypto
    .createHmac('sha256', SERVER_KEYS.licenseHmacSecret)
    .update(`${licenseKey}|${orgId}|${planCode}|${expDate}`)
    .digest('hex');
}

export function verifyLicenseSignature(license: LicenseRecord): boolean {
  const expected = signLicensePayload(
    license.licenseKey,
    license.organizationId,
    license.planCode,
    license.expirationDate
  );
  const a = Buffer.from(license.signature || '', 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function generateLicenseKey(shortCode: string, planCode: PlanCode): string {
  const cleanShort = (shortCode || 'ORG').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'ORG';
  const planTag = planCode === 'STARTER' ? 'STR' : planCode === 'ENTERPRISE' ? 'ENT' : 'PRO';
  const year = new Date().getFullYear();
  const randomSeg = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
  return `SALAR-${cleanShort}-${year}-${planTag}-${randomSeg}`;
}

export function createUniquePortalSlug(
  instituteName: string,
  existingOrgs: Array<{ id?: string; portalSlug?: string }>,
  excludeOrgId?: string
): string {
  const base =
    instituteName
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'institute';
  const used = new Set(
    existingOrgs
      .filter((o) => !excludeOrgId || o.id !== excludeOrgId)
      .map((o) => (o.portalSlug || '').toLowerCase())
      .filter(Boolean)
  );
  if (!used.has(base)) return base;
  let counter = 2;
  while (used.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

// Strict License State Machine (REVOKED is strictly terminal!)
export const ALLOWED_LICENSE_TRANSITIONS: Record<LicenseStatus, LicenseStatus[]> = {
  CREATED: ['AVAILABLE', 'ASSIGNED', 'REVOKED'],
  AVAILABLE: ['ASSIGNED', 'REVOKED'],
  ASSIGNED: ['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'RELEASED', 'REVOKED'],
  PROVISIONING: ['ACTIVE', 'ASSIGNED', 'SUSPENDED', 'REVOKED'],
  ACTIVE: ['GRACE_PERIOD', 'SUSPENDED', 'EXPIRED', 'RELEASING', 'REVOKED'],
  GRACE_PERIOD: ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'RELEASING', 'REVOKED'],
  SUSPENDED: ['ACTIVE', 'RELEASING', 'EXPIRED', 'REVOKED'],
  EXPIRED: ['ACTIVE', 'GRACE_PERIOD', 'RELEASING', 'RELEASED', 'REVOKED'],
  RELEASING: ['RELEASED', 'REVOKED'],
  RELEASED: ['AVAILABLE', 'ASSIGNED', 'REVOKED'],
  REVOKED: [], // Irreversible terminal state
};

export function canTransitionLicense(from: LicenseStatus, to: LicenseStatus): boolean {
  if (from === to) return true;
  return ALLOWED_LICENSE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function addPeriodToIso(startIso: string, cycle: BillingCycle, customDays = 30): string {
  const dt = new Date(startIso);
  if (cycle === 'MONTHLY') dt.setMonth(dt.getMonth() + 1);
  else if (cycle === 'QUARTERLY') dt.setMonth(dt.getMonth() + 3);
  else if (cycle === 'YEARLY') dt.setFullYear(dt.getFullYear() + 1);
  else dt.setDate(dt.getDate() + customDays);
  return dt.toISOString();
}

export function computePlanPrice(plan: LicensePlan, cycle: BillingCycle, customPrice?: number | null): number {
  if (typeof customPrice === 'number' && customPrice >= 0) return customPrice;
  if (cycle === 'QUARTERLY') return plan.quarterlyPrice;
  if (cycle === 'YEARLY') return plan.yearlyPrice;
  return plan.monthlyPrice;
}

function createInitialDatabase(): SalarDatabaseSchema {
  const now = new Date().toISOString();
  const oneYearLater = addPeriodToIso(now, 'YEARLY');
  const monthPeriod = now.slice(0, 7);

  const starterPlan: LicensePlan = {
    id: 'plan-starter',
    code: 'STARTER',
    name: 'Starter Institute',
    description: 'For emerging coaching batches up to 150 students with core CBT examination workflows.',
    monthlyPrice: 1999,
    quarterlyPrice: 5499,
    yearlyPrice: 19999,
    studentLimit: 150,
    examLimit: 40,
    storageLimitMb: 2048,
    allowDedicated: false,
    features: ['Basic Exam Management', 'Standard Analytics', 'CBT Engine', '2 GB Storage'],
    addOnPrices: {
      extra100StudentsMonthly: 699,
      extra10GbStorageMonthly: 499,
      extra50ExamsMonthly: 399,
    },
    isActive: true,
    updatedAt: now,
  };

  const proPlan: LicensePlan = {
    id: 'plan-pro',
    code: 'PRO',
    name: 'Pro Academy',
    description: 'Full-featured coaching institute platform with Question Bank, AI OCR, PDF/Image uploads & custom branding.',
    monthlyPrice: 4999,
    quarterlyPrice: 13999,
    yearlyPrice: 49999,
    studentLimit: 1000,
    examLimit: 250,
    storageLimitMb: 15360,
    allowDedicated: false,
    features: [
      'Advanced Exam Management',
      'Question Bank & AI OCR',
      'PDF & Image Uploads',
      'Advanced Analytics',
      'Custom Branding',
      '15 GB Storage',
    ],
    addOnPrices: {
      extra100StudentsMonthly: 499,
      extra10GbStorageMonthly: 399,
      extra50ExamsMonthly: 299,
    },
    isActive: true,
    updatedAt: now,
  };

  const enterprisePlan: LicensePlan = {
    id: 'plan-enterprise',
    code: 'ENTERPRISE',
    name: 'Enterprise Campus',
    description: 'Dedicated infrastructure deployment, custom SLA, priority support & isolated storage for large institutions.',
    monthlyPrice: 14999,
    quarterlyPrice: 41999,
    yearlyPrice: 149999,
    studentLimit: 5000,
    examLimit: 2000,
    storageLimitMb: 102400,
    allowDedicated: true,
    features: [
      'Dedicated Deployment Option',
      'Infrastructure Monitoring',
      'Priority Support',
      'Custom Integrations & Domain SSL',
      '100 GB Isolated Storage',
    ],
    addOnPrices: {
      extra100StudentsMonthly: 399,
      extra10GbStorageMonthly: 299,
      extra50ExamsMonthly: 199,
    },
    isActive: true,
    updatedAt: now,
  };

  const org1Id = 'SALAR-ORG-00001';
  const tenant1Id = 'tenant-gurukul-001';
  const alloc1Id = 'alloc-001';
  const lic1Key = generateLicenseKey('GC', 'PRO');
  const lic1Sig = signLicensePayload(lic1Key, org1Id, 'PRO', oneYearLater);
  const lic1Id = 'lic-001';

  return {
    ownerUsers: [],
    ownerSessions: [],
    organizations: [
      {
        id: org1Id,
        instituteName: "Giri Sir's Gurukul Classes",
        shortCode: 'GC',
        contactPerson: 'Prof. Giri Sir',
        email: 'gurukulclassestech@gmail.com',
        mobile: '+91 98230 00000',
        address: 'New Usmanpura',
        country: 'India',
        state: 'Maharashtra',
        city: 'Chhatrapati Sambhajinagar',
        website: 'https://girisirgurukul.in',
        logoUrl: '',
        customDomain: '',
        subdomain: 'gurukul.salartech.com',
        portalSlug: 'gurukul',
        portalPath: '/',
        planId: proPlan.id,
        planCode: 'PRO',
        billingCycle: 'YEARLY',
        customPrice: null,
        studentCapacity: 1000,
        examCapacity: 250,
        storageLimitMb: 15360,
        deploymentType: 'SHARED_MULTI_TENANT',
        tenantId: tenant1Id,
        databaseId: 'salar_tenant_001',
        portalAllocationId: alloc1Id,
        licenseId: lic1Id,
        previousPortalSlugs: [],
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    ],
    organizationUsers: [
      {
        id: 'orguser-001',
        organizationId: org1Id,
        tenantId: tenant1Id,
        email: 'gurukulclassestech@gmail.com',
        name: 'Prof. Giri Sir',
        role: 'CLIENT_SUPER_ADMIN',
        status: 'ACTIVE',
        createdAt: now,
      },
    ],
    tenants: [
      {
        id: tenant1Id,
        organizationId: org1Id,
        databaseId: 'salar_tenant_001',
        namespace: 'gurukul_primary',
        isolationMode: 'SHARED_SCHEMA',
        storageBucketPrefix: 'tenants/gurukul_primary',
        status: 'ACTIVE',
        studentCount: 0,
        examCount: 0,
        questionCount: 0,
        storageUsedMb: 12,
        createdAt: now,
        updatedAt: now,
      },
    ],
    tenantDomains: [
      {
        id: 'dom-001',
        organizationId: org1Id,
        tenantId: tenant1Id,
        domain: 'gurukul.salartech.com',
        type: 'SUBDOMAIN',
        dnsTarget: 'cname.salartech.com',
        dnsVerified: true,
        sslStatus: 'ACTIVE',
        sslExpiresAt: oneYearLater,
        lastCheckedAt: now,
        verificationNotes: 'Platform wildcard TLS active.',
        isActive: true,
        createdAt: now,
      },
    ],
    licensePlans: [starterPlan, proPlan, enterprisePlan],
    licenses: [
      {
        id: lic1Id,
        licenseKey: lic1Key,
        signature: lic1Sig,
        organizationId: org1Id,
        tenantId: tenant1Id,
        planId: proPlan.id,
        planCode: 'PRO',
        portalAllocationId: alloc1Id,
        issueDate: now,
        activationDate: now,
        expirationDate: oneYearLater,
        renewalDate: oneYearLater,
        billingCycle: 'YEARLY',
        studentLimit: 1000,
        examLimit: 250,
        storageLimitMb: 15360,
        priceAmount: 49999,
        featurePermissions: proPlan.features,
        status: 'ACTIVE',
        notes: 'Primary active institute portal allocation',
        createdAt: now,
        updatedAt: now,
      },
    ],
    licenseBindings: [
      {
        id: 'bind-001',
        licenseId: lic1Id,
        organizationId: org1Id,
        tenantId: tenant1Id,
        portalAllocationId: alloc1Id,
        active: true,
        boundAt: now,
      },
    ],
    licenseEvents: [
      {
        id: 'le-001',
        licenseId: lic1Id,
        licenseKey: lic1Key,
        fromStatus: 'NONE',
        toStatus: 'ACTIVE',
        actor: 'SYSTEM_BOOTSTRAP',
        reason: 'Initialized existing Gurukul Classes portal under SALAR Tech license governance.',
        timestamp: now,
      },
    ],
    portalAllocations: [
      {
        id: alloc1Id,
        code: 'ALLOC-001',
        name: 'Portal Allocation 001 (Primary Node)',
        deploymentType: 'SHARED_MULTI_TENANT',
        region: 'asia-east1',
        environment: 'production',
        capacityStudents: 1500,
        capacityExams: 500,
        capacityStorageMb: 20480,
        currentOrganizationId: org1Id,
        currentTenantId: tenant1Id,
        status: 'ASSIGNED',
        healthStatus: 'HEALTHY',
        endpointUrl: '/?org=SALAR-ORG-00001',
        reassignmentCount: 0,
        lastHealthCheckAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'alloc-002',
        code: 'ALLOC-002',
        name: 'Portal Allocation 002 (Shared Pool)',
        deploymentType: 'SHARED_MULTI_TENANT',
        region: 'asia-east1',
        environment: 'production',
        capacityStudents: 1000,
        capacityExams: 300,
        capacityStorageMb: 15360,
        currentOrganizationId: null,
        currentTenantId: null,
        status: 'AVAILABLE',
        healthStatus: 'HEALTHY',
        endpointUrl: '',
        reassignmentCount: 0,
        lastHealthCheckAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'alloc-003',
        code: 'ALLOC-003',
        name: 'Portal Allocation 003 (Dedicated Enterprise)',
        deploymentType: 'DEDICATED',
        region: 'asia-south1',
        environment: 'production',
        capacityStudents: 5000,
        capacityExams: 2000,
        capacityStorageMb: 102400,
        currentOrganizationId: null,
        currentTenantId: null,
        status: 'AVAILABLE',
        healthStatus: 'HEALTHY',
        endpointUrl: '',
        reassignmentCount: 0,
        lastHealthCheckAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    portalDeployments: [
      {
        id: 'dep-001',
        allocationId: alloc1Id,
        organizationId: org1Id,
        tenantId: tenant1Id,
        deploymentType: 'SHARED_MULTI_TENANT',
        environment: 'production',
        version: '2.4.0',
        status: 'DEPLOYED',
        stepsCompleted: ['Tenant Namespace Initialized', 'License Bound', 'Subdomain Routed', 'Health Verified'],
        deployedBy: 'SYSTEM_BOOTSTRAP',
        deployedAt: now,
      },
    ],
    deploymentInstances: [
      {
        id: 'inst-primary',
        instanceName: 'salar-node-primary-01',
        region: process.env.K_REGION || 'asia-east1',
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
        hostname: os.hostname(),
        pid: process.pid,
        weight: 100,
        status: 'HEALTHY',
        lastHeartbeatAt: now,
        createdAt: now,
      },
    ],
    scalingPolicy: {
      minInstances: 1,
      maxInstances: 8,
      targetCpuPercent: 70,
      targetMemoryPercent: 75,
      targetRequestsPerMin: 1200,
      targetQueueDepth: 50,
      autoScalingEnabled: true,
      cdnEnabled: true,
      redisCacheEnabled: Boolean(process.env.REDIS_URL),
      updatedAt: now,
    },
    subscriptions: [
      {
        id: 'sub-001',
        organizationId: org1Id,
        organizationName: "Giri Sir's Gurukul Classes",
        planId: proPlan.id,
        planCode: 'PRO',
        billingCycle: 'YEARLY',
        baseAmount: 49999,
        gstPercent: 18,
        gstAmount: 9000,
        totalAmount: 58999,
        currency: 'INR',
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: oneYearLater,
        autoRenew: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    subscriptionInvoices: [
      {
        id: 'inv-001',
        invoiceNumber: 'SALAR-INV-2026-0001',
        subscriptionId: 'sub-001',
        organizationId: org1Id,
        organizationName: "Giri Sir's Gurukul Classes",
        subtotal: 49999,
        gstPercent: 18,
        gstAmount: 9000,
        totalAmount: 58999,
        dueDate: now.slice(0, 10),
        paidAt: now,
        status: 'PAID',
        description: 'Pro Academy Yearly Subscription — ALLOC-001',
        createdAt: now,
      },
    ],
    payments: [
      {
        id: 'pay-001',
        invoiceId: 'inv-001',
        subscriptionId: 'sub-001',
        organizationId: org1Id,
        organizationName: "Giri Sir's Gurukul Classes",
        gateway: 'BANK_TRANSFER',
        gatewayOrderId: 'ORD-GC-2026-0001',
        gatewayPaymentId: 'TXN-VERIFIED-0001',
        idempotencyKey: 'idem-init-001',
        amount: 58999,
        gstAmount: 9000,
        currency: 'INR',
        status: 'VERIFIED',
        signatureVerified: true,
        verifiedOnServerBy: 'SYSTEM_BOOTSTRAP',
        createdAt: now,
        verifiedAt: now,
      },
    ],
    usageRecords: [
      {
        id: 'use-001',
        organizationId: org1Id,
        tenantId: tenant1Id,
        period: monthPeriod,
        activeStudents: 0,
        examsCreated: 0,
        totalAttempts: 0,
        storageUsedMb: 12,
        apiRequests: 0,
        bandwidthMb: 0,
        recordedAt: now,
      },
    ],
    backupJobs: [],
    restoreJobs: [],
    notifications: [
      {
        id: 'notif-001',
        title: 'SALAR Tech Control Plane Active',
        message: "Giri Sir's Gurukul Classes (SALAR-ORG-00001) is bound to ALLOC-001. Two additional portal allocations (ALLOC-002, ALLOC-003) are available for provisioning.",
        severity: 'INFO',
        category: 'INFRASTRUCTURE',
        read: false,
        createdAt: now,
      },
    ],
    auditLogs: [
      {
        id: 'audit-001',
        actor: 'SYSTEM_BOOTSTRAP',
        actorType: 'SYSTEM',
        action: 'PLATFORM_INITIALIZED',
        resourceType: 'Platform',
        resourceId: 'SALAR-TECH',
        ip: '127.0.0.1',
        details: 'Initialized SALAR Tech SaaS control plane alongside existing Gurukul Classes portal.',
        status: 'SUCCESS',
        timestamp: now,
      },
    ],
    systemSettings: {
      platformName: 'SALAR Tech SaaS Platform',
      ownerDisplayName: 'Platform Owner',
      ownerEmail: 'advaitp38@gmail.com',
      supportEmail: 'support@salartech.com',
      gstNumber: '27SALAR0000A1Z5',
      defaultGstPercent: 18,
      rpoTargetMinutes: 60,
      rtoTargetMinutes: 30,
      retentionDays: 90,
      rateLimitMaxAttempts: 5,
      rateLimitWindowMinutes: 15,
      sessionTimeoutHours: 12,
      enforceMfaForSensitiveActions: false,
      backupEncryptionEnabled: true,
      activePaymentGateway: 'MANUAL',
      manualGateway: createDefaultManualGateway(),
      updatedAt: now,
    },
    archivedTenants: [],
    counters: {
      orgSeq: 1,
      allocSeq: 3,
      invoiceSeq: 1,
      dbSeq: 1,
    },
  };
}

export function createDefaultManualGateway(): ManualPaymentGatewayConfig {
  return {
    enabled: true,
    upiId: '',
    upiDisplayName: 'SALAR Tech SaaS Platform',
    qrCodeUrl: '',
    bankAccountName: 'SALAR Tech Solutions',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branchName: '',
    acceptedModes: ['UPI', 'NEFT_IMPS_RTGS', 'BANK_TRANSFER', 'CHEQUE', 'CASH'],
    paymentInstructions:
      'Pay the exact invoice amount via UPI/QR or NEFT/IMPS, then submit your 12-digit UTR / Transaction Reference and payment screenshot for owner approval.',
    requireReceiptUpload: false,
    autoExtendOnApproval: true,
  };
}

export function ensureSalarTestSandbox(db: SalarDatabaseSchema): boolean {
  if (db.organizations.some((o) => o.id === 'SALAR-ORG-TEST' || o.portalSlug === 'salar-test')) {
    return false;
  }

  const now = new Date().toISOString();
  const oneYearLater = addPeriodToIso(now, 'YEARLY');
  const proPlan = db.licensePlans.find((p) => p.code === 'PRO') || db.licensePlans[1] || db.licensePlans[0];
  const orgId = 'SALAR-ORG-TEST';
  const tenantId = 'tenant-salar-test';
  const databaseId = 'salar_tenant_test';
  const allocId = 'alloc-test';
  const licId = 'lic-test';
  const licKey = generateLicenseKey('SLR', 'PRO');
  const licSig = signLicensePayload(licKey, orgId, 'PRO', oneYearLater);

  db.organizations.push({
    id: orgId,
    instituteName: 'SALAR Exam Portal (Test Sandbox)',
    shortCode: 'SLR',
    contactPerson: 'SALAR Academic Coordinator',
    email: 'testportal@salartech.com',
    mobile: '+91 98000 00001',
    address: 'SALAR Cloud Sandbox Campus',
    country: 'India',
    state: 'Maharashtra',
    city: 'Pune',
    website: '',
    logoUrl: '',
    customDomain: '',
    subdomain: 'salar-test.salartech.com',
    portalSlug: 'salar-test',
    portalPath: '/p/salar-test',
    planId: proPlan?.id || 'plan-pro',
    planCode: 'PRO',
    billingCycle: 'YEARLY',
    customPrice: 0,
    studentCapacity: 1000,
    examCapacity: 250,
    storageLimitMb: 15360,
    deploymentType: 'SHARED_MULTI_TENANT',
    tenantId,
    databaseId,
    portalAllocationId: allocId,
    licenseId: licId,
    previousPortalSlugs: ['test'],
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  db.organizationUsers.push({
    id: 'orguser-test',
    organizationId: orgId,
    tenantId,
    email: 'testportal@salartech.com',
    name: 'SALAR Academic Coordinator',
    role: 'CLIENT_SUPER_ADMIN',
    status: 'ACTIVE',
    createdAt: now,
  });

  db.tenants.push({
    id: tenantId,
    organizationId: orgId,
    databaseId,
    namespace: 'salar_test_sandbox',
    isolationMode: 'SHARED_SCHEMA',
    storageBucketPrefix: 'tenants/salar_test_sandbox',
    status: 'ACTIVE',
    studentCount: 0,
    examCount: 2,
    questionCount: 4,
    storageUsedMb: 2,
    createdAt: now,
    updatedAt: now,
  });

  db.tenantDomains.push({
    id: 'dom-test',
    organizationId: orgId,
    tenantId,
    domain: 'salar-test.salartech.com',
    type: 'SUBDOMAIN',
    dnsTarget: 'cname.salartech.com',
    dnsVerified: true,
    sslStatus: 'ACTIVE',
    sslExpiresAt: oneYearLater,
    lastCheckedAt: now,
    verificationNotes: 'SALAR Portal Test sandbox route (/test & /p/salar-test) ready.',
    isActive: true,
    createdAt: now,
  });

  db.licenses.push({
    id: licId,
    licenseKey: licKey,
    signature: licSig,
    organizationId: orgId,
    tenantId,
    planId: proPlan?.id || 'plan-pro',
    planCode: 'PRO',
    portalAllocationId: allocId,
    issueDate: now,
    activationDate: now,
    expirationDate: oneYearLater,
    renewalDate: oneYearLater,
    billingCycle: 'YEARLY',
    studentLimit: 1000,
    examLimit: 250,
    storageLimitMb: 15360,
    priceAmount: 0,
    featurePermissions: proPlan?.features || ['CBT Engine', 'Question Bank', 'Manual Payments'],
    status: 'ACTIVE',
    notes: 'Dedicated SALAR Exam Portal Test Sandbox for live walkthroughs before client assignment.',
    createdAt: now,
    updatedAt: now,
  });

  db.licenseBindings.push({
    id: 'bind-test',
    licenseId: licId,
    organizationId: orgId,
    tenantId,
    portalAllocationId: allocId,
    active: true,
    boundAt: now,
  });

  db.portalAllocations.push({
    id: allocId,
    code: 'ALLOC-TEST',
    name: 'SALAR Portal Test Sandbox',
    deploymentType: 'SHARED_MULTI_TENANT',
    region: 'asia-east1',
    environment: 'staging',
    capacityStudents: 1000,
    capacityExams: 250,
    capacityStorageMb: 15360,
    currentOrganizationId: orgId,
    currentTenantId: tenantId,
    status: 'ASSIGNED',
    healthStatus: 'HEALTHY',
    endpointUrl: '/p/salar-test',
    reassignmentCount: 0,
    lastHealthCheckAt: now,
    createdAt: now,
    updatedAt: now,
  });

  db.subscriptions.push({
    id: 'sub-test',
    organizationId: orgId,
    organizationName: 'SALAR Exam Portal (Test Sandbox)',
    planId: proPlan?.id || 'plan-pro',
    planCode: 'PRO',
    billingCycle: 'YEARLY',
    baseAmount: 0,
    gstPercent: 18,
    gstAmount: 0,
    totalAmount: 0,
    currency: 'INR',
    status: 'ACTIVE',
    currentPeriodStart: now,
    currentPeriodEnd: oneYearLater,
    autoRenew: true,
    createdAt: now,
    updatedAt: now,
  });

  return true;
}

export function readSalarDb(): SalarDatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = createInitialDatabase();
      ensureSalarTestSandbox(initial);
      writeSalarDb(initial);
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as SalarDatabaseSchema;
    let changed = false;
    if (!parsed.systemSettings.manualGateway) {
      parsed.systemSettings.manualGateway = createDefaultManualGateway();
      changed = true;
    }
    if (
      parsed.systemSettings.activePaymentGateway !== 'MANUAL' &&
      parsed.systemSettings.activePaymentGateway !== 'BANK_TRANSFER'
    ) {
      parsed.systemSettings.activePaymentGateway = 'MANUAL';
      changed = true;
    }
    parsed.systemSettings.manualGateway.enabled = true;
    if (!parsed.counters) {
      parsed.counters = { orgSeq: 1, allocSeq: 3, invoiceSeq: 1, dbSeq: 1 };
      changed = true;
    }
    if (typeof parsed.counters.dbSeq !== 'number' || parsed.counters.dbSeq < 1) {
      parsed.counters.dbSeq = Math.max(1, parsed.organizations?.length || 1);
      changed = true;
    }
    if (Array.isArray(parsed.organizations)) {
      let nextSeq = parsed.counters.dbSeq;
      parsed.organizations.forEach((org) => {
        if (!org.portalSlug) {
          org.portalSlug =
            org.id === 'SALAR-ORG-00001'
              ? 'gurukul'
              : createUniquePortalSlug(org.instituteName, parsed.organizations, org.id);
          changed = true;
        }
        if (!org.portalPath) {
          org.portalPath = org.id === 'SALAR-ORG-00001' ? '/' : `/p/${org.portalSlug}`;
          changed = true;
        }
        if (!Array.isArray(org.previousPortalSlugs)) {
          org.previousPortalSlugs = [];
          changed = true;
        }
        if (!org.databaseId) {
          if (org.id === 'SALAR-ORG-00001') {
            org.databaseId = 'salar_tenant_001';
          } else {
            nextSeq += 1;
            org.databaseId = `salar_tenant_${String(nextSeq).padStart(3, '0')}`;
          }
          changed = true;
        }
        const t = parsed.tenants?.find((item) => item.id === org.tenantId);
        if (t && !t.databaseId) {
          t.databaseId = org.databaseId;
          changed = true;
        }
      });
      parsed.counters.dbSeq = nextSeq;
    }
    if (ensureSalarTestSandbox(parsed)) {
      changed = true;
    }
    if (changed) {
      writeSalarDb(parsed);
    }
    return parsed;
  } catch {
    const fallback = createInitialDatabase();
    ensureSalarTestSandbox(fallback);
    writeSalarDb(fallback);
    return fallback;
  }
}

export function writeSalarDb(data: SalarDatabaseSchema): void {
  const tempFile = `${DB_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
  markCloudDirty('saas_db');
}

export function appendAuditLog(
  db: SalarDatabaseSchema,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): void {
  db.auditLogs.unshift({
    id: `audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (db.auditLogs.length > 500) {
    db.auditLogs.length = 500;
  }
}

export function appendLicenseEvent(
  db: SalarDatabaseSchema,
  event: Omit<LicenseEvent, 'id' | 'timestamp'>
): void {
  db.licenseEvents.unshift({
    id: `le-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...event,
  });
  if (db.licenseEvents.length > 500) {
    db.licenseEvents.length = 500;
  }
}

export function createBackupArchive(
  db: SalarDatabaseSchema,
  params: {
    scope: 'FULL_PLATFORM' | 'TENANT' | 'STORAGE';
    organizationId?: string;
    actor: string;
    encrypt?: boolean;
  }
): BackupJob {
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, '-');
  const org = params.organizationId
    ? db.organizations.find((o) => o.id === params.organizationId)
    : undefined;

  let payloadObj: unknown;
  if (params.scope === 'TENANT' && org) {
    payloadObj = {
      exportedAt: now,
      scope: 'TENANT',
      organization: org,
      tenant: db.tenants.find((t) => t.id === org.tenantId) || null,
      domains: db.tenantDomains.filter((d) => d.organizationId === org.id),
      licenses: db.licenses.filter((l) => l.organizationId === org.id),
      subscriptions: db.subscriptions.filter((s) => s.organizationId === org.id),
      invoices: db.subscriptionInvoices.filter((i) => i.organizationId === org.id),
      usage: db.usageRecords.filter((u) => u.organizationId === org.id),
    };
  } else if (params.scope === 'STORAGE') {
    const files = fs.existsSync(UPLOADS_DIR)
      ? fs.readdirSync(UPLOADS_DIR).map((name) => {
          const st = fs.statSync(path.join(UPLOADS_DIR, name));
          return { name, sizeBytes: st.size, mtime: st.mtime.toISOString() };
        })
      : [];
    payloadObj = {
      exportedAt: now,
      scope: 'STORAGE',
      fileCount: files.length,
      files,
    };
  } else {
    payloadObj = {
      exportedAt: now,
      scope: 'FULL_PLATFORM',
      data: db,
    };
  }

  const plaintext = Buffer.from(JSON.stringify(payloadObj, null, 2), 'utf-8');
  const shouldEncrypt = params.encrypt ?? db.systemSettings.backupEncryptionEnabled;
  const archiveName = `${params.scope.toLowerCase()}_${params.organizationId || 'platform'}_${stamp}${
    shouldEncrypt ? '.enc.json' : '.json'
  }`;
  const outPath = path.resolve(BACKUPS_DIR, archiveName);

  let finalBuf: Buffer;
  if (shouldEncrypt) {
    const key = Buffer.from(SERVER_KEYS.backupEncryptionKeyHex.slice(0, 64), 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    finalBuf = Buffer.from(
      JSON.stringify({
        format: 'SALAR-AES-256-GCM-V1',
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        ciphertext: encrypted.toString('base64'),
      })
    );
  } else {
    finalBuf = plaintext;
  }

  fs.writeFileSync(outPath, finalBuf);
  const sha256Checksum = crypto.createHash('sha256').update(finalBuf).digest('hex');

  const job: BackupJob = {
    id: `bkp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    scope: params.scope,
    organizationId: params.organizationId,
    tenantId: org?.tenantId,
    archiveName,
    sizeBytes: finalBuf.length,
    sha256Checksum,
    encrypted: shouldEncrypt,
    rpoTargetMinutes: db.systemSettings.rpoTargetMinutes,
    rtoTargetMinutes: db.systemSettings.rtoTargetMinutes,
    status: 'COMPLETED',
    retainedForCompliance: true,
    createdBy: params.actor,
    createdAt: now,
  };
  db.backupJobs.unshift(job);
  return job;
}

export function verifyAndReadBackupFile(job: BackupJob): { valid: boolean; rawContent?: Buffer; decryptedJson?: unknown; error?: string } {
  const safeName = path.basename(job.archiveName);
  const target = path.resolve(BACKUPS_DIR, safeName);
  if (!target.startsWith(BACKUPS_DIR + path.sep) || !fs.existsSync(target)) {
    return { valid: false, error: 'Backup archive missing on disk.' };
  }
  const fileBuf = fs.readFileSync(target);
  const actualHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
  if (actualHash !== job.sha256Checksum) {
    return { valid: false, error: 'SHA-256 checksum mismatch! Archive may be corrupted.' };
  }

  if (job.encrypted) {
    try {
      const envelope = JSON.parse(fileBuf.toString('utf-8')) as {
        iv: string;
        authTag: string;
        ciphertext: string;
      };
      const key = Buffer.from(SERVER_KEYS.backupEncryptionKeyHex.slice(0, 64), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(envelope.authTag, 'hex'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ]);
      return { valid: true, rawContent: plain, decryptedJson: JSON.parse(plain.toString('utf-8')) };
    } catch {
      return { valid: false, error: 'Failed to decrypt AES-256-GCM archive.' };
    }
  }

  return { valid: true, rawContent: fileBuf, decryptedJson: JSON.parse(fileBuf.toString('utf-8')) };
}
