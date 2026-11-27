import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashPasswordScrypt, verifyPasswordScrypt } from './salarStore.ts';
import { TENANTS_DIR } from './runtimePaths.ts';
import { markCloudDeleteTenant, markCloudDirty } from './cloudPersistence.ts';
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

export function deleteTenantStore(tenantId: string): boolean {
  try {
    const filePath = getTenantDbPath(tenantId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      markCloudDeleteTenant(tenantId);
      return true;
    }
    markCloudDeleteTenant(tenantId);
    return false;
  } catch {
    return false;
  }
}

function getOrgShortCode(org: Organization): string {
  return (org.shortCode || org.instituteName || 'ORG')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4) || 'ORG';
}

function createInitialTenantSettings(org: Organization): Record<string, unknown> {
  const now = new Date().toISOString();
  const addressParts = [org.address, org.city, org.state, org.country].filter(Boolean).join(', ');
  const slugHandle = (org.portalSlug || getOrgShortCode(org).toLowerCase()).replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'institute';
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
      upiId: `${slugHandle}@upi`,
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

function seedStarterExamWorkspace(org: Organization, store: TenantRuntimeDatabase): void {
  if (org.id === 'SALAR-ORG-00001') return;

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const short = getOrgShortCode(org);
  const leadName = org.contactPerson || 'Academic Director';

  const batch1Id = `batch_${short.toLowerCase()}_12`;
  const batch2Id = `batch_${short.toLowerCase()}_11`;
  const faculty1Id = `fac_${short.toLowerCase()}_01`;
  const folder1Id = `fld_${short.toLowerCase()}_01`;
  const examLiveId = `ex_${short.toLowerCase()}_mock01`;
  const examDraftId = `ex_${short.toLowerCase()}_prac02`;
  const course1Id = `crs_${short.toLowerCase()}_01`;
  const series1Id = `ts_${short.toLowerCase()}_01`;
  const material1Id = `mat_${short.toLowerCase()}_01`;
  const notif1Id = `ntf_${short.toLowerCase()}_01`;

  store.collections.batches = {
    [batch1Id]: {
      name: `${short} Target JEE 2026 (Class 12th)`,
      classLevel: 'Class 12th',
      academicYear: '2025-26',
      schedule: 'Mon–Sat · 07:30 AM – 09:30 AM',
      capacity: 150,
      facultyName: leadName,
      assignedExamIds: [examLiveId],
      studentCount: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    [batch2Id]: {
      name: `${short} Foundation Batch (Class 11th)`,
      classLevel: 'Class 11th',
      academicYear: '2025-26',
      schedule: 'Mon–Sat · 04:00 PM – 06:00 PM',
      capacity: 150,
      facultyName: leadName,
      assignedExamIds: [],
      studentCount: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  };

  store.collections.faculty = {
    [faculty1Id]: {
      name: leadName,
      qualification: 'Senior Faculty & Academic Lead',
      subjectSpecialization: 'Mathematics, Calculus & Competitive Exam Prep',
      experience: '10+ Years',
      email: org.email || `faculty@${org.portalSlug || 'institute'}.in`,
      contactNumber: org.mobile || '',
      photoUrl: '',
      assignedBatches: [`${short} Target JEE 2026 (Class 12th)`],
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  };

  store.collections.questionFolders = {
    [folder1Id]: {
      name: `${short} Starter Question Bank (Calculus & Algebra)`,
      classLevel: 'Class 12th',
      chapter: 'Differential & Integral Calculus',
      examCategory: 'JEE Main',
      createdAt: now,
    },
  };

  const starterQuestions: Array<{
    id: string;
    title: string;
    questionText: string;
    questionType: 'SINGLE_MCQ' | 'MULTI_MCQ' | 'NUMERICAL' | 'INTEGER';
    options: Array<{ id: string; text: string }>;
    correctAnswer: string;
    explanation: string;
    positiveMarks: number;
    negativeMarks: number;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    classLevel: 'Class 11th' | 'Class 12th';
    chapter: string;
    topic: string;
    examCategory: 'JEE Main' | 'JEE Advanced' | 'MHT-CET';
  }> = [
    {
      id: `q_${short.toLowerCase()}_01`,
      title: 'Definite Integral Symmetry Property',
      questionText: 'Evaluate the definite integral: $$\\int_{0}^{\\pi/2} \\frac{\\sin x}{\\sin x + \\cos x}\\,dx$$',
      questionType: 'SINGLE_MCQ',
      options: [
        { id: 'A', text: '$\\frac{\\pi}{4}$' },
        { id: 'B', text: '$\\frac{\\pi}{2}$' },
        { id: 'C', text: '$\\pi$' },
        { id: 'D', text: '$0$' },
      ],
      correctAnswer: 'A',
      explanation: 'Using King’s property $I = \\int_0^a f(a-x)\\,dx$, adding $I + I = \\int_0^{\\pi/2} 1\\,dx = \\frac{\\pi}{2}$, hence $I = \\frac{\\pi}{4}$.',
      positiveMarks: 4,
      negativeMarks: 1,
      difficulty: 'EASY',
      classLevel: 'Class 12th',
      chapter: 'Definite Integration',
      topic: 'Properties of Definite Integrals',
      examCategory: 'JEE Main',
    },
    {
      id: `q_${short.toLowerCase()}_02`,
      title: 'Matrices & Determinant Invertibility',
      questionText: 'Let $A$ be a $3 \\times 3$ non-singular square matrix such that $\\det(A) = 5$. Which of the following statements are correct?',
      questionType: 'MULTI_MCQ',
      options: [
        { id: 'A', text: '$\\det(\\operatorname{adj} A) = 25$' },
        { id: 'B', text: '$\\det(2A) = 40$' },
        { id: 'C', text: '$\\det(A^{-1}) = 5$' },
        { id: 'D', text: '$\\det(A^T) = 5$' },
      ],
      correctAnswer: 'A,B,D',
      explanation: '$\\det(\\operatorname{adj} A) = |A|^{n-1} = 5^2 = 25$, $\\det(2A) = 2^3 |A| = 40$, and $\\det(A^T) = |A| = 5$.',
      positiveMarks: 4,
      negativeMarks: 1,
      difficulty: 'MEDIUM',
      classLevel: 'Class 12th',
      chapter: 'Matrices & Determinants',
      topic: 'Properties of Determinants',
      examCategory: 'JEE Main',
    },
    {
      id: `q_${short.toLowerCase()}_03`,
      title: 'Standard Trigonometric Limit',
      questionText: 'Find the numerical value of $\\lim_{x \\to 0} \\frac{1 - \\cos 4x}{x^2}$.',
      questionType: 'NUMERICAL',
      options: [],
      correctAnswer: '8',
      explanation: '$1 - \\cos 4x = 2\\sin^2(2x)$, so $\\lim_{x\\to 0} \\frac{2\\sin^2(2x)}{x^2} = 2 \\cdot 2^2 = 8$.',
      positiveMarks: 4,
      negativeMarks: 0,
      difficulty: 'EASY',
      classLevel: 'Class 11th',
      chapter: 'Limits & Continuity',
      topic: 'Trigonometric Limits',
      examCategory: 'JEE Main',
    },
    {
      id: `q_${short.toLowerCase()}_04`,
      title: 'Quadratic Roots Sum of Squares',
      questionText: 'If $\\alpha$ and $\\beta$ are roots of $x^2 - 5x + 6 = 0$, find the integer value of $\\alpha^2 + \\beta^2$.',
      questionType: 'INTEGER',
      options: [],
      correctAnswer: '13',
      explanation: '$\\alpha^2 + \\beta^2 = (\\alpha + \\beta)^2 - 2\\alpha\\beta = 25 - 12 = 13$.',
      positiveMarks: 4,
      negativeMarks: 0,
      difficulty: 'EASY',
      classLevel: 'Class 11th',
      chapter: 'Quadratic Equations',
      topic: 'Symmetric Functions of Roots',
      examCategory: 'JEE Main',
    },
  ];

  store.collections.questions = {};
  const examQuestionsCol = `exams/${examLiveId}/questions`;
  store.collections[examQuestionsCol] = {};

  starterQuestions.forEach((q, idx) => {
    store.collections.questions[q.id] = {
      folderId: folder1Id,
      folderName: `${short} Starter Question Bank (Calculus & Algebra)`,
      title: q.title,
      questionText: q.questionText,
      questionImageUrl: '',
      questionType: q.questionType,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      positiveMarks: q.positiveMarks,
      negativeMarks: q.negativeMarks,
      difficulty: q.difficulty,
      classLevel: q.classLevel,
      chapter: q.chapter,
      topic: q.topic,
      examCategory: q.examCategory,
      createdAt: now,
      updatedAt: now,
    };

    store.collections[examQuestionsCol][`eq_${idx + 1}`] = {
      examId: examLiveId,
      examStatus: 'LIVE',
      orderIndex: idx + 1,
      title: q.title,
      subject: 'Mathematics',
      questionText: q.questionText,
      questionImageUrl: '',
      questionType: q.questionType,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      positiveMarks: q.positiveMarks,
      negativeMarks: q.negativeMarks,
      difficulty: q.difficulty,
      chapter: q.chapter,
      topic: q.topic,
      createdAt: now,
    };
  });

  store.collections.exams = {
    [examLiveId]: {
      title: `${org.instituteName} Live CBT Mock Test 01`,
      code: `${short}-MOCK-01`,
      classLevel: 'All Classes',
      target: 'JEE Main',
      subject: 'Mathematics',
      examTag: 'JEE Main (+4/-1)',
      folderName: `${short} Starter Question Bank`,
      examType: 'Full Mock Test',
      durationMinutes: 30,
      totalMarks: 16,
      passingMarks: 6,
      questionCount: starterQuestions.length,
      openingDate: today,
      status: 'LIVE',
      isPublic: true,
      webcamEnabled: false,
      randomizeQuestions: false,
      assignedCount: 0,
      assignedBatchIds: [batch1Id, batch2Id],
      instructions:
        'Read each question carefully. Single/Multi MCQ carry +4/-1 marks; Numerical & Integer carry +4/0 marks.',
      createdAt: now,
      updatedAt: now,
    },
    [examDraftId]: {
      title: `${org.instituteName} Practice Assessment 02`,
      code: `${short}-PRAC-02`,
      classLevel: 'Class 12th',
      target: 'MHT-CET',
      subject: 'Mathematics',
      examTag: 'MHT-CET (+2/0)',
      folderName: `${short} Starter Question Bank`,
      examType: 'Chapterwise Test',
      durationMinutes: 45,
      totalMarks: 0,
      passingMarks: 0,
      questionCount: 0,
      openingDate: today,
      status: 'DRAFT',
      isPublic: false,
      webcamEnabled: false,
      randomizeQuestions: false,
      assignedCount: 0,
      assignedBatchIds: [],
      instructions: 'Draft paper ready for faculty question import or AI OCR upload.',
      createdAt: now,
      updatedAt: now,
    },
  };

  store.collections.courses = {
    [course1Id]: {
      name: `${org.instituteName} JEE Main Complete Foundation`,
      description: 'Structured live & recorded modules, chapterwise DPPs, and full-length CBT test analysis.',
      category: 'JEE Main',
      classLevel: 'Class 12th',
      price: 2999,
      thumbnailUrl: '',
      status: 'PUBLISHED',
      enrolledCount: 0,
      modules: [
        {
          id: `mod_${short.toLowerCase()}_1`,
          title: 'Module 1: Differential & Integral Calculus',
          chapters: ['Limits & Continuity', 'Definite Integration', 'Differential Equations'],
        },
        {
          id: `mod_${short.toLowerCase()}_2`,
          title: 'Module 2: Algebra, Matrices & Determinants',
          chapters: ['Quadratic Equations', 'Matrices & Determinants'],
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  };

  store.collections.testSeries = {
    [series1Id]: {
      title: `${org.instituteName} All-India CBT Mock Series 2026`,
      description: 'NTA-pattern Computer-Based Tests with instant rank card, accuracy metrics, and solutions.',
      price: 499,
      mockTestCount: 1,
      classLevel: 'Class 12th',
      examCategory: 'JEE Main Mathematics',
      status: 'PUBLISHED',
      examIds: [examLiveId],
      createdAt: now,
      updatedAt: now,
    },
  };

  store.collections.studyMaterials = {
    [material1Id]: {
      title: `${org.instituteName} — Calculus & Algebra Formula Compendium`,
      description: 'Quick-revision formula sheet for JEE Main & MHT-CET candidates.',
      classLevel: 'Both',
      subject: 'Mathematics',
      chapter: 'Formula Revision',
      category: 'Formula Sheets',
      fileUrl: '/api/public/starter-formula-sheet',
      fileName: `${short}-Formula-Sheet.txt`,
      fileSize: '4 KB',
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  };

  store.collections.notifications = {
    [notif1Id]: {
      title: `Welcome to ${org.instituteName} Examination Portal`,
      message: `${short}-MOCK-01 is LIVE now in My Exams. Attempt the 30-minute CBT mock test and review your instant scorecard.`,
      type: 'EXAM_REMINDER',
      targetType: 'ALL',
      readBy: [],
      createdAt: now,
    },
  };
}

function isEmptyStarterWorkspace(store: TenantRuntimeDatabase): boolean {
  const hasExams = Object.keys(store.collections.exams || {}).length > 0;
  const hasCourses = Object.keys(store.collections.courses || {}).length > 0;
  const hasQuestions = Object.keys(store.collections.questions || {}).length > 0;
  const hasSeries = Object.keys(store.collections.testSeries || {}).length > 0;
  return !hasExams && !hasCourses && !hasQuestions && !hasSeries;
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
        if (org.id !== 'SALAR-ORG-00001' && isEmptyStarterWorkspace(parsed)) {
          seedStarterExamWorkspace(org, parsed);
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
  if (org.id !== 'SALAR-ORG-00001') {
    seedStarterExamWorkspace(org, initial);
  }
  writeTenantStore(org.tenantId, initial);
  return initial;
}

export function getTenantRuntimeMetrics(tenantId: string): {
  studentCount: number;
  examCount: number;
  questionCount: number;
  attemptCount: number;
  storageUsedMb: number;
} {
  try {
    const filePath = getTenantDbPath(tenantId);
    if (!fs.existsSync(filePath)) {
      return { studentCount: 0, examCount: 0, questionCount: 0, attemptCount: 0, storageUsedMb: 0 };
    }
    const stat = fs.statSync(filePath);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TenantRuntimeDatabase;
    const cols = parsed?.collections || {};
    return {
      studentCount: Object.keys(cols.students || {}).length,
      examCount: Object.keys(cols.exams || {}).length,
      questionCount: Object.keys(cols.questions || {}).length,
      attemptCount: Object.keys(cols.examAttempts || {}).length,
      storageUsedMb: Math.max(1, Math.round((stat.size / (1024 * 1024)) * 100) / 100),
    };
  } catch {
    return { studentCount: 0, examCount: 0, questionCount: 0, attemptCount: 0, storageUsedMb: 0 };
  }
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
  markCloudDirty('tenant', tenantId);
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
