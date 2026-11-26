import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashPasswordScrypt, verifyPasswordScrypt } from './salarStore.ts';
import { TENANTS_DIR } from './runtimePaths.ts';
import type { Organization } from './salarTypes.ts';

fs.mkdirSync(TENANTS_DIR, { recursive: true });

export interface TenantStudentCredential {
  uid: string;
  email: string;
  name: string;
  salt: string;
  hash: string;
  createdAt: string;
}

export interface TenantRuntimeDatabase {
  organizationId: string;
  tenantId: string;
  databaseId: string;
  adminCredential: { salt: string; hash: string; claimedAt: string } | null;
  studentCredentials: TenantStudentCredential[];
  collections: Record<string, Record<string, Record<string, unknown>>>;
  updatedAt: string;
}

const ALLOWED_ROOT_COLLECTIONS = new Set([
  'settings',
  'students',
  'faculty',
  'batches',
  'batchStudents',
  'questionFolders',
  'questions',
  'exams',
  'examAssignments',
  'examAttempts',
  'evaluationLogs',
  'attendance',
  'studyMaterials',
  'notifications',
  'courses',
  'testSeries',
  'payments',
  'enrollments',
]);

export function isAllowedTenantCollectionPath(colPath: string): boolean {
  const clean = colPath.replace(/^\/+|\/+$/g, '');
  if (!clean) return false;
  if (ALLOWED_ROOT_COLLECTIONS.has(clean)) return true;
  return /^exams\/[a-zA-Z0-9_-]{1,128}\/questions$/.test(clean);
}

export function isValidDocId(id: string): boolean {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function getTenantDbPath(tenantId: string): string {
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeTenantId || safeTenantId !== tenantId) {
    throw new Error('Invalid tenant namespace.');
  }
  const resolved = path.resolve(TENANTS_DIR, `${safeTenantId}.json`);
  if (!resolved.startsWith(TENANTS_DIR + path.sep)) {
    throw new Error('Invalid tenant file boundary.');
  }
  return resolved;
}

function createInitialTenantSettings(org: Organization): Record<string, unknown> {
  const now = new Date().toISOString();
  const addressParts = [org.address, org.city, org.state, org.country].filter(Boolean).join(', ');
  return {
    instituteName: org.instituteName,
    tagline: 'Online Computer-Based Testing & Academic Portal',
    storageTag: org.tenantId,
    logoUrl: org.logoUrl || '',
    logoWidth: 40,
    logoHeight: 40,
    heroImage: '/src/assets/images/hero_clean_math_1795625096103.jpg',
    heroTitle: `${org.instituteName} — Online Examination & Learning Portal`,
    heroSubtitle:
      'Computer-Based Test (CBT) engine, chapterwise question banks, structured courses, and instant rank analytics.',
    primaryCta: 'Student Portal Login',
    secondaryCta: 'Quick Join Candidate',
    faviconUrl: '',
    primaryColor: '#0032A0',
    secondaryColor: '#2563EB',
    address: addressParts || 'Institute Campus',
    phone: org.mobile || '',
    whatsapp: org.mobile || '',
    email: org.email || '',
    website: org.website || '',
    socialLinks: {
      youtube: '',
      instagram: '',
      telegram: '',
    },
    portalConfig: {
      allowGoogleAuth: false,
      allowEmailPasswordAuth: true,
      allowQuickJoin: true,
      allowPublicRegistration: true,
      autoSubmitOnExpiry: true,
      strictNegativeMarking: true,
      upiId: '',
      upiPayeeName: org.instituteName,
      bankDetails: 'Bank Transfer / UPI verification via 12-digit UTR reference number.',
      storageProvider: `SALAR Isolated Vault (${org.tenantId})`,
      enableEmailNotifications: true,
      enableWhatsAppNotifications: true,
      compactTables: false,
    },
    updatedAt: now,
  };
}

export function ensureTenantStore(org: Organization): TenantRuntimeDatabase {
  const filePath = getTenantDbPath(org.tenantId);
  const expectedDbId = org.databaseId || org.tenantId;
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TenantRuntimeDatabase;
      if (parsed && parsed.collections) {
        let dirty = false;
        if (!parsed.databaseId) {
          parsed.databaseId = expectedDbId;
          dirty = true;
        }
        if (!parsed.collections.settings) parsed.collections.settings = {};
        if (!parsed.collections.settings.institute) {
          parsed.collections.settings.institute = createInitialTenantSettings(org);
          dirty = true;
        }
        if (dirty) {
          writeTenantStore(org.tenantId, parsed);
        }
        return parsed;
      }
    } catch {
      // fall through and re-create clean isolated store
    }
  }

  const now = new Date().toISOString();
  const initial: TenantRuntimeDatabase = {
    organizationId: org.id,
    tenantId: org.tenantId,
    databaseId: expectedDbId,
    adminCredential: null,
    studentCredentials: [],
    collections: {
      settings: {
        institute: createInitialTenantSettings(org),
      },
    },
    updatedAt: now,
  };
  writeTenantStore(org.tenantId, initial);
  return initial;
}

export function isTenantAdminClaimed(org: Organization): boolean {
  try {
    const filePath = getTenantDbPath(org.tenantId);
    if (!fs.existsSync(filePath)) return false;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TenantRuntimeDatabase;
    return Boolean(parsed?.adminCredential?.hash);
  } catch {
    return false;
  }
}

export function writeTenantStore(tenantId: string, data: TenantRuntimeDatabase): void {
  const filePath = getTenantDbPath(tenantId);
  data.updatedAt = new Date().toISOString();
  const tempPath = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function exportTenantRuntimeSnapshot(tenantId: string): TenantRuntimeDatabase | null {
  try {
    const filePath = getTenantDbPath(tenantId);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TenantRuntimeDatabase;
  } catch {
    return null;
  }
}

export function setTenantAdminPasscode(org: Organization, passcode: string, overwrite = false): void {
  const store = ensureTenantStore(org);
  if (store.adminCredential && !overwrite) {
    throw new Error('Admin passcode has already been claimed for this client portal.');
  }
  const { salt, hash } = hashPasswordScrypt(passcode);
  store.adminCredential = {
    salt,
    hash,
    claimedAt: new Date().toISOString(),
  };
  writeTenantStore(org.tenantId, store);
}

export function verifyTenantAdminPasscode(org: Organization, passcode: string): boolean {
  const store = ensureTenantStore(org);
  if (!store.adminCredential) return false;
  return verifyPasswordScrypt(passcode, store.adminCredential.salt, store.adminCredential.hash);
}

export function registerTenantStudent(
  org: Organization,
  params: {
    name: string;
    email: string;
    password: string;
    mobile?: string;
    classLevel?: string;
    targetExam?: string;
    origin?: 'PORTAL_SIGNUP' | 'QUICK_JOIN';
  }
): { uid: string; student: Record<string, unknown> } {
  const store = ensureTenantStore(org);
  const normEmail = params.email.trim().toLowerCase();
  if (store.studentCredentials.some((s) => s.email.toLowerCase() === normEmail)) {
    throw new Error('An account with this email already exists in this portal.');
  }

  const uid = `stu_${crypto.randomBytes(8).toString('hex')}`;
  const { salt, hash } = hashPasswordScrypt(params.password);
  const now = new Date().toISOString();

  store.studentCredentials.push({
    uid,
    email: normEmail,
    name: params.name.trim(),
    salt,
    hash,
    createdAt: now,
  });

  const prefix = (org.shortCode || 'ST').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'ST';
  const rollNum = `${prefix}-${Math.floor(10000 + Math.random() * 89999)}`;
  const uname = normEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || 'student';

  const studentDoc: Record<string, unknown> = {
    uid,
    name: params.name.trim(),
    email: normEmail,
    mobile: (params.mobile || '').trim(),
    whatsapp: (params.mobile || '').trim(),
    classLevel: params.classLevel || 'Class 12th',
    targetExam: params.targetExam || 'JEE Main',
    rollNumber: rollNum,
    username: uname,
    enrollmentId: `ENR-${new Date().getFullYear()}-${rollNum.split('-')[1] || '10001'}`,
    batchId: '',
    batchName: 'Unassigned',
    origin: params.origin || 'PORTAL_SIGNUP',
    status: params.origin === 'QUICK_JOIN' ? 'QUICK_JOIN' : 'ACTIVE',
    photoUrl: '',
    attemptsCount: 0,
    avgPercentage: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (!store.collections.students) store.collections.students = {};
  store.collections.students[uid] = studentDoc;
  writeTenantStore(org.tenantId, store);

  return { uid, student: { id: uid, ...studentDoc } };
}

export function authenticateTenantStudent(
  org: Organization,
  email: string,
  password: string
): { uid: string; student: Record<string, unknown> } | null {
  const store = ensureTenantStore(org);
  const normEmail = email.trim().toLowerCase();
  const cred = store.studentCredentials.find((s) => s.email.toLowerCase() === normEmail);
  if (!cred) return null;
  if (!verifyPasswordScrypt(password, cred.salt, cred.hash)) return null;

  const existingDoc = store.collections.students?.[cred.uid];
  const student = existingDoc
    ? { id: cred.uid, ...existingDoc }
    : {
        id: cred.uid,
        uid: cred.uid,
        name: cred.name,
        email: cred.email,
        status: 'ACTIVE',
      };
  return { uid: cred.uid, student };
}

export function getTenantStudentByUid(
  org: Organization,
  uid: string
): { uid: string; student: Record<string, unknown> } | null {
  const store = ensureTenantStore(org);
  const cred = store.studentCredentials.find((s) => s.uid === uid);
  if (!cred) return null;
  const docData = store.collections.students?.[uid];
  if (!docData) return null;
  return { uid, student: { id: uid, ...docData } };
}

export interface TenantQueryFilter {
  field: string;
  op: string;
  value: unknown;
}

export interface TenantQueryOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export function applyTenantPayloadPatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...existing };
  for (const [key, val] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      (val as Record<string, unknown>).__tenantOp === 'increment'
    ) {
      const delta = Number((val as Record<string, unknown>).value || 0);
      const current = Number(next[key] || 0);
      next[key] = current + delta;
    } else {
      next[key] = val;
    }
  }
  return next;
}

export function queryTenantCollection(
  org: Organization,
  colPath: string,
  filters: TenantQueryFilter[] = [],
  orderBys: TenantQueryOrderBy[] = []
): Array<{ id: string; data: Record<string, unknown> }> {
  const store = ensureTenantStore(org);
  const col = store.collections[colPath] || {};
  let items = Object.entries(col).map(([id, data]) => ({ id, data }));

  for (const f of filters) {
    items = items.filter((item) => {
      const v = item.data[f.field];
      if (f.op === '==') return v === f.value;
      if (f.op === '!=') return v !== f.value;
      if (f.op === 'in' && Array.isArray(f.value)) return f.value.includes(v);
      if (f.op === 'array-contains' && Array.isArray(v)) return v.includes(f.value);
      return true;
    });
  }

  if (orderBys.length > 0) {
    items.sort((a, b) => {
      for (const ob of orderBys) {
        const av = a.data[ob.field];
        const bv = b.data[ob.field];
        if (av === bv) continue;
        const cmp =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av ?? '').localeCompare(String(bv ?? ''));
        if (cmp !== 0) return ob.direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  return items;
}
