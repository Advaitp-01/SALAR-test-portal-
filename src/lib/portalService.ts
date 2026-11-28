import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from './tenantDb';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreError';
import type {
  Course,
  Exam,
  ExamAttempt,
  ExamQuestion,
  FacultyProfile,
  InstituteSettings,
  PaymentRecord,
  Question,
  StudentAnswerEntry,
  QuestionResultItem,
} from '../types/portal';

import {
  GURUKUL_COURSES_CATALOG,
  GURUKUL_DEFAULT_SETTINGS,
  GURUKUL_TEST_SERIES_CATALOG,
} from './gurukulData';

export const DEFAULT_INSTITUTE_SETTINGS: InstituteSettings = GURUKUL_DEFAULT_SETTINGS;

export const GENERATED_ASSETS = {
  hero: '/assets/gurukul/hero_banner_0.webp',
  logo: '/assets/gurukul/logo.webp',
  mentoring: '/assets/gurukul/study_group.webp',
  campusResidential: '/assets/gurukul/campus_0.webp',
  campusDaycare: '/assets/gurukul/campus_1.webp',
  resultPoster: '/assets/gurukul/result_0.webp',
  courseJeeMain: '/assets/gurukul/course_two-year-iit-jee-integrated-course.webp',
  courseJeeAdv: '/assets/gurukul/course_two-year-iit-jee-integrated-course.webp',
  courseNeet: '/assets/gurukul/course_two-year-neet-integrated-course.webp',
  courseMhtCet: '/assets/gurukul/course_three-year-foundation-programme.webp',
  facultyDirector: '/src/assets/images/faculty_director_1795625076728.jpg',
};

export function formatCurrencyINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function exportToCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function compressImageBlobToDataUrl(
  blob: Blob,
  fallbackDataUrl?: string,
  maxTargetChars = 420_000
): Promise<string> {
  if (
    blob.size <= 160 * 1024 &&
    fallbackDataUrl &&
    fallbackDataUrl.startsWith('data:image/') &&
    fallbackDataUrl.length <= maxTargetChars
  ) {
    return fallbackDataUrl;
  }

  return new Promise<string>((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || img.width || 800;
        const naturalH = img.naturalHeight || img.height || 600;
        const dimSteps = [1400, 1100, 860, 680];
        const qualitySteps = [0.86, 0.74, 0.62, 0.5];
        let bestUrl = '';

        for (const maxDim of dimSteps) {
          let w = naturalW;
          let h = naturalH;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.max(1, Math.round(w * ratio));
            h = Math.max(1, Math.round(h * ratio));
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) break;

          // White background handles transparent PNG screenshots cleanly when exported as WebP/JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          for (const q of qualitySteps) {
            let candidate = canvas.toDataURL('image/webp', q);
            if (!candidate.startsWith('data:image/webp')) {
              candidate = canvas.toDataURL('image/jpeg', q);
            }
            bestUrl = candidate;
            if (candidate.length <= maxTargetChars) {
              URL.revokeObjectURL(objectUrl);
              resolve(candidate);
              return;
            }
          }
        }

        URL.revokeObjectURL(objectUrl);
        resolve(bestUrl || fallbackDataUrl || '');
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(fallbackDataUrl || '');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(fallbackDataUrl || '');
    };
    img.src = objectUrl;
  });
}

export async function uploadFileToServer(
  file: File
): Promise<{ url: string; fileName: string; fileSize: string; persistent?: boolean }> {
  const isImage = file.type.startsWith('image/');
  let base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  let uploadMime = file.type;
  // Pre-compress oversized images (> 1.2 MB) so Vercel Serverless Functions never reject with HTTP 413
  if (isImage && file.size > 1_200_000) {
    const preCompressed = await compressImageBlobToDataUrl(file, base64Data, 950_000);
    if (preCompressed && preCompressed.startsWith('data:image/')) {
      base64Data = preCompressed;
      const mimeMatch = preCompressed.match(/^data:(image\/[a-zA-Z0-9+.-]+);/);
      if (mimeMatch) uploadMime = mimeMatch[1];
    }
  }

  try {
    const resp = await fetch('/api/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: uploadMime,
        base64Data,
      }),
    });
    const rawText = await resp.text();
    let data: {
      url?: string;
      fileName?: string;
      fileSize?: string;
      persistent?: boolean;
      error?: string;
    } = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { error: resp.status === 413 ? 'File is too large for server upload.' : rawText || `Upload failed (${resp.status})` };
    }
    if (!resp.ok || !data.url) {
      throw new Error(data.error || `File upload failed (${resp.status})`);
    }
    // On ephemeral serverless environments without Vercel Blob / Upstash KV configured,
    // embed a compact self-contained Data URL for images so every student sees the diagram
    // regardless of which serverless instance handles their request.
    if (isImage && data.persistent === false) {
      const compactUrl = await compressImageBlobToDataUrl(file, base64Data, 420_000);
      if (compactUrl) {
        return {
          url: compactUrl,
          fileName: data.fileName || file.name,
          fileSize: data.fileSize || `${Math.max(1, Math.round(file.size / 1024))} KB`,
          persistent: true,
        };
      }
    }
    return {
      url: data.url,
      fileName: data.fileName || file.name,
      fileSize: data.fileSize || `${Math.max(1, Math.round(file.size / 1024))} KB`,
      persistent: data.persistent,
    };
  } catch (err) {
    if (isImage) {
      const compactUrl = await compressImageBlobToDataUrl(file, base64Data, 420_000);
      if (compactUrl && compactUrl.length <= 650_000) {
        return {
          url: compactUrl,
          fileName: file.name,
          fileSize: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          persistent: true,
        };
      }
    }
    throw err;
  }
}

export async function publishPublicCbtSnapshot(params: {
  orgId: string;
  instituteName: string;
  exam: Exam;
  questions?: Array<Record<string, unknown> & { id: string; questionImageUrl?: string }>;
}): Promise<void> {
  const orgId = params.orgId || 'SALAR-ORG-00001';
  const bearer = (() => {
    try {
      if (orgId === 'SALAR-ORG-00001') {
        return window.sessionStorage.getItem('salar_root_admin_bearer') || '';
      }
      return window.sessionStorage.getItem(`salar_tenant_bearer_${orgId}_admin`) || '';
    } catch {
      return '';
    }
  })();

  let questionsList = params.questions;
  if (!questionsList) {
    const snap = await getDocs(
      query(collection(db, 'exams', params.exam.id, 'questions'), orderBy('orderIndex', 'asc'))
    );
    questionsList = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    })) as Array<Record<string, unknown> & { id: string; questionImageUrl?: string }>;
  }

  await fetch('/api/public/cbt/publish-snapshot', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({
      orgId,
      instituteName: params.instituteName,
      exam: params.exam,
      questions: questionsList,
    }),
  });
}

export async function extractMathQuestionsWithOCR(params: {
  file?: File;
  rawText?: string;
  defaultClass: string;
  defaultExamCategory: string;
}) {
  let fileBase64 = '';
  let mimeType = 'image/png';
  if (params.file) {
    mimeType = params.file.type || 'image/png';
    fileBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file for OCR'));
      reader.readAsDataURL(params.file!);
    });
  }

  const resp = await fetch('/api/ocr/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64,
      mimeType,
      rawText: params.rawText || '',
      defaultClass: params.defaultClass,
      defaultExamCategory: params.defaultExamCategory,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'OCR extraction failed');
  }
  return data.questions as Array<Partial<Question>>;
}

/**
 * Computes deterministic grading for a student CBT attempt from the exam's isolated questions.
 */
export function gradeExamAttempt(
  questions: ExamQuestion[],
  answers: Record<string, StudentAnswerEntry>
): {
  questionResults: QuestionResultItem[];
  autoScore: number;
  totalMarks: number;
  percentage: number;
  accuracy: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
} {
  let autoScore = 0;
  let totalMarks = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;

  const questionResults: QuestionResultItem[] = questions.map((q) => {
    const pos = Number(q.positiveMarks || 4);
    const neg = Math.abs(Number(q.negativeMarks || 0));
    totalMarks += pos;

    const entry = answers[q.id];
    const candidate = (entry?.response ?? '').trim();
    const official = (q.correctAnswer ?? '').trim();

    if (!candidate) {
      unattemptedCount += 1;
      return {
        questionId: q.id,
        title: q.title || `Q${q.orderIndex + 1}`,
        questionText: q.questionText,
        questionType: q.questionType,
        candidateAnswer: '',
        officialAnswer: official,
        marksAwarded: 0,
        maxMarks: pos,
        status: 'UNATTEMPTED',
      };
    }

    let isCorrect = false;
    if (q.questionType === 'MULTI_MCQ') {
      const candSet = candidate
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .sort()
        .join(',');
      const offSet = official
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .sort()
        .join(',');
      isCorrect = candSet.length > 0 && candSet === offSet;
    } else if (q.questionType === 'NUMERICAL' || q.questionType === 'INTEGER') {
      const cNum = Number(candidate);
      const oNum = Number(official);
      if (!Number.isNaN(cNum) && !Number.isNaN(oNum)) {
        isCorrect = Math.abs(cNum - oNum) <= 0.01;
      } else {
        isCorrect = candidate.toLowerCase() === official.toLowerCase();
      }
    } else {
      isCorrect = candidate.toUpperCase() === official.toUpperCase();
    }

    if (isCorrect) {
      correctCount += 1;
      autoScore += pos;
      return {
        questionId: q.id,
        title: q.title || `Q${q.orderIndex + 1}`,
        questionText: q.questionText,
        questionType: q.questionType,
        candidateAnswer: candidate,
        officialAnswer: official,
        marksAwarded: pos,
        maxMarks: pos,
        status: 'CORRECT',
      };
    } else {
      incorrectCount += 1;
      const deducted = neg > 0 ? -neg : 0;
      autoScore += deducted;
      return {
        questionId: q.id,
        title: q.title || `Q${q.orderIndex + 1}`,
        questionText: q.questionText,
        questionType: q.questionType,
        candidateAnswer: candidate,
        officialAnswer: official,
        marksAwarded: deducted,
        maxMarks: pos,
        status: 'INCORRECT',
      };
    }
  });

  const attempted = correctCount + incorrectCount;
  const accuracy = attempted > 0 ? Math.round((correctCount / attempted) * 1000) / 10 : 0;
  const percentage = totalMarks > 0 ? Math.round((autoScore / totalMarks) * 1000) / 10 : 0;

  return {
    questionResults,
    autoScore,
    totalMarks,
    percentage,
    accuracy,
    correctCount,
    incorrectCount,
    unattemptedCount,
  };
}

/**
 * Creates an isolated examination copy (deep copying questions into /exams/{newId}/questions).
 */
export async function cloneExamIsolated(sourceExam: Exam, newTitle: string, newCode: string): Promise<string> {
  const now = new Date().toISOString();
  try {
    const srcQSnap = await getDocs(
      query(collection(db, 'exams', sourceExam.id, 'questions'), orderBy('orderIndex', 'asc'))
    );
    const newExamRef = doc(collection(db, 'exams'));
    const batch = writeBatch(db);

    batch.set(newExamRef, {
      title: newTitle,
      code: newCode,
      classLevel: sourceExam.classLevel,
      target: sourceExam.target,
      subject: sourceExam.subject || 'Combined PCMB',
      examTag: sourceExam.examTag || '',
      folderName: sourceExam.folderName || 'General',
      examType: sourceExam.examType || 'Mock Test',
      durationMinutes: sourceExam.durationMinutes,
      totalMarks: sourceExam.totalMarks,
      passingMarks: sourceExam.passingMarks ?? 0,
      questionCount: srcQSnap.size,
      openingDate: now.slice(0, 10),
      startAt: sourceExam.startAt || '',
      endAt: sourceExam.endAt || '',
      status: 'DRAFT',
      isPublic: Boolean(sourceExam.isPublic),
      webcamEnabled: Boolean(sourceExam.webcamEnabled),
      randomizeQuestions: Boolean(sourceExam.randomizeQuestions),
      assignedCount: 0,
      assignedBatchIds: [],
      pdfUrl: sourceExam.pdfUrl || '',
      answerKeyNotes: sourceExam.answerKeyNotes || '',
      instructions: sourceExam.instructions || '',
      createdAt: now,
      updatedAt: now,
    });

    srcQSnap.docs.forEach((qDoc, idx) => {
      const qData = qDoc.data();
      const targetQRef = doc(collection(db, 'exams', newExamRef.id, 'questions'));
      batch.set(targetQRef, {
        examId: newExamRef.id,
        examStatus: 'DRAFT',
        orderIndex: typeof qData.orderIndex === 'number' ? qData.orderIndex : idx,
        title: qData.title || `Q${idx + 1}`,
        subject: qData.subject || sourceExam.subject || 'Combined PCMB',
        questionText: qData.questionText || '',
        questionImageUrl: qData.questionImageUrl || '',
        questionType: qData.questionType,
        options: qData.options || [],
        correctAnswer: qData.correctAnswer,
        explanation: qData.explanation || '',
        positiveMarks: qData.positiveMarks ?? 4,
        negativeMarks: qData.negativeMarks ?? 1,
        difficulty: qData.difficulty || 'MEDIUM',
        chapter: qData.chapter || '',
        topic: qData.topic || '',
        createdAt: now,
      });
    });

    await batch.commit();
    return newExamRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `exams/${sourceExam.id}`);
  }
}

/**
 * Updates an exam's LIVE/DRAFT status and synchronizes examStatus on its isolated questions.
 */
export async function toggleExamStatus(examId: string, nextStatus: 'LIVE' | 'DRAFT') {
  try {
    const qSnap = await getDocs(collection(db, 'exams', examId, 'questions'));
    const batch = writeBatch(db);
    batch.update(doc(db, 'exams', examId), {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    });
    qSnap.docs.forEach((qDoc) => {
      batch.update(qDoc.ref, { examStatus: nextStatus });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `exams/${examId}`);
  }
}

/**
 * Deletes an exam and its isolated question subcollection.
 */
export async function deleteExamCompletely(examId: string) {
  try {
    const qSnap = await getDocs(collection(db, 'exams', examId, 'questions'));
    const batch = writeBatch(db);
    qSnap.docs.forEach((qDoc) => batch.delete(qDoc.ref));
    batch.delete(doc(db, 'exams', examId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `exams/${examId}`);
  }
}

/**
 * Imports selected Question Bank questions into a specific isolated exam.
 */
export async function importBankQuestionsIntoExam(exam: Exam, selectedQuestions: Question[]) {
  try {
    const existingSnap = await getDocs(collection(db, 'exams', exam.id, 'questions'));
    const existingMarks = existingSnap.docs.reduce((sum, d) => sum + Number(d.data()?.positiveMarks || 0), 0);
    const startIdx = existingSnap.size;
    let addedMarks = 0;
    const now = new Date().toISOString();
    const batch = writeBatch(db);

    selectedQuestions.forEach((q, idx) => {
      const pos = Number(q.positiveMarks || 4);
      addedMarks += pos;
      const newQRef = doc(collection(db, 'exams', exam.id, 'questions'));
      batch.set(newQRef, {
        examId: exam.id,
        examStatus: exam.status,
        orderIndex: startIdx + idx,
        title: q.title,
        questionText: q.questionText,
        questionImageUrl: q.questionImageUrl || '',
        questionType: q.questionType,
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || '',
        positiveMarks: pos,
        negativeMarks: Number(q.negativeMarks || 0),
        difficulty: q.difficulty,
        chapter: q.chapter || '',
        topic: q.topic || '',
        createdAt: now,
      });
    });

    batch.update(doc(db, 'exams', exam.id), {
      questionCount: startIdx + selectedQuestions.length,
      totalMarks: existingMarks + addedMarks,
      updatedAt: now,
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `exams/${exam.id}/questions`);
  }
}

/**
 * Approves a UTR payment atomically and creates an active enrollment.
 */
export async function approvePaymentTransaction(payment: PaymentRecord, verifierEmail: string) {
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'payments', payment.id), {
      status: 'APPROVED',
      verifiedBy: verifierEmail,
      verifiedAt: now,
      updatedAt: now,
    });

    const enrollmentRef = doc(collection(db, 'enrollments'));
    batch.set(enrollmentRef, {
      studentUid: payment.studentUid,
      studentId: payment.studentId || payment.studentUid,
      studentName: payment.studentName,
      itemType: payment.itemType,
      itemId: payment.itemId,
      itemTitle: payment.itemTitle,
      paymentId: payment.id,
      status: 'ACTIVE',
      enrolledAt: now,
    });

    if (payment.itemType === 'COURSE') {
      batch.update(doc(db, 'courses', payment.itemId), {
        enrolledCount: increment(1),
        updatedAt: now,
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `payments/${payment.id}`);
  }
}

/**
 * Seeds balanced PCMB (Physics, Chemistry, Mathematics, Biology) demo workspace data
 * only on explicit Admin action when setting up a fresh workspace.
 */
export async function seedMathematicsDemoData(preserveSettings?: InstituteSettings) {
  const now = new Date().toISOString();
  const batch = writeBatch(db);

  // 1. Settings (preserve isolated client branding if provided)
  batch.set(doc(db, 'settings', 'institute'), {
    ...(preserveSettings || DEFAULT_INSTITUTE_SETTINGS),
    updatedAt: now,
  });

  // 2. PCMB Faculty
  const facultyList: Array<Omit<FacultyProfile, 'id'>> = [
    {
      name: 'Prof. Pradip Giri',
      qualification: 'IITian · Academic Director (16+ Yrs)',
      subjectSpecialization: 'Physics — Mechanics, Electrodynamics & JEE Advanced',
      experience: '16 Years',
      email: 'gurukulclassestech@gmail.com',
      contactNumber: '+91 9860968994',
      photoUrl: GENERATED_ASSETS.facultyDirector,
      assignedBatches: ['Sankalp JEE 2026 (12th)', 'Aarambh Foundation (11th)'],
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'Prof. Sneha Kulkarni',
      qualification: 'M.Sc. Organic & Physical Chemistry',
      subjectSpecialization: 'Chemistry — Physical, Organic & NCERT Mastery',
      experience: '11 Years',
      email: 'chemistry@girisirgurukul.in',
      contactNumber: '+91 98230 11002',
      photoUrl: '',
      assignedBatches: ['Sankalp JEE 2026 (12th)', 'NEET Target 2026'],
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'Prof. Rohan Deshmukh',
      qualification: 'B.Tech, M.Tech (COEP Pune)',
      subjectSpecialization: 'Mathematics — Calculus, Vectors & JEE / MHT-CET',
      experience: '9 Years',
      email: 'maths@girisirgurukul.in',
      contactNumber: '+91 98230 11003',
      photoUrl: '',
      assignedBatches: ['Sankalp JEE 2026 (12th)'],
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'Dr. Ananya Joshi',
      qualification: 'M.Sc., Ph.D. Biotechnology',
      subjectSpecialization: 'Biology — Botany, Zoology & NEET-UG NCERT',
      experience: '10 Years',
      email: 'biology@girisirgurukul.in',
      contactNumber: '+91 98230 11004',
      photoUrl: '',
      assignedBatches: ['NEET Target 2026'],
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  ];
  facultyList.forEach((f) => {
    batch.set(doc(collection(db, 'faculty')), f);
  });

  // 3. Batches
  const b1Ref = doc(collection(db, 'batches'));
  const b2Ref = doc(collection(db, 'batches'));
  batch.set(b1Ref, {
    name: 'Sankalp JEE & MHT-CET 2026 (Class 12th)',
    classLevel: 'Class 12th',
    academicYear: '2025-26',
    schedule: 'Mon–Sat · 07:30 AM – 01:30 PM (PCMB)',
    capacity: 120,
    facultyName: 'Prof. Pradip Giri',
    assignedExamIds: [],
    studentCount: 0,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  batch.set(b2Ref, {
    name: 'NEET-UG & PCB Integrated (Class 11th)',
    classLevel: 'Class 11th',
    academicYear: '2025-26',
    schedule: 'Mon–Sat · 02:00 PM – 08:00 PM (PCB)',
    capacity: 100,
    facultyName: 'Dr. Ananya Joshi',
    assignedExamIds: [],
    studentCount: 0,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  // 4. Question Folder & Balanced PCMB Question Bank
  const f1Ref = doc(collection(db, 'questionFolders'));
  batch.set(f1Ref, {
    name: 'PCMB Mixed Diagnostic Bank [DEMO]',
    classLevel: 'Class 12th',
    chapter: 'Physics, Chemistry, Mathematics & Biology',
    examCategory: 'JEE Main',
    createdAt: now,
  });

  const sampleQuestions: Array<Omit<Question, 'id'>> = [
    {
      folderId: f1Ref.id,
      folderName: 'PCMB Mixed Diagnostic Bank [DEMO]',
      title: 'Electrostatics — Gauss Law Flux (Physics)',
      subject: 'Physics',
      questionText:
        'A point charge $+q$ is placed at the centre of a cube of side $a$. What is the electric flux passing through one face of the cube?',
      questionType: 'SINGLE_MCQ',
      options: [
        { id: 'A', text: '$\\frac{q}{6\\varepsilon_0}$' },
        { id: 'B', text: '$\\frac{q}{\\varepsilon_0}$' },
        { id: 'C', text: '$\\frac{q}{4\\varepsilon_0}$' },
        { id: 'D', text: '$\\frac{q}{12\\varepsilon_0}$' },
      ],
      correctAnswer: 'A',
      explanation: 'By symmetry, total flux $q/\\varepsilon_0$ divides equally among all 6 faces.',
      positiveMarks: 4,
      negativeMarks: 1,
      difficulty: 'EASY',
      classLevel: 'Class 12th',
      chapter: 'Electrostatics',
      topic: 'Gauss Law',
      examCategory: 'JEE Main',
      createdAt: now,
      updatedAt: now,
    },
    {
      folderId: f1Ref.id,
      folderName: 'PCMB Mixed Diagnostic Bank [DEMO]',
      title: 'Chemical Equilibrium — Kp and Kc Relation (Chemistry)',
      subject: 'Chemistry',
      questionText:
        'For the reaction $\\text{N}_2(g) + 3\\text{H}_2(g) \\rightleftharpoons 2\\text{NH}_3(g)$, what is the value of $\\Delta n_g$ in $K_p = K_c(RT)^{\\Delta n_g}$?',
      questionType: 'SINGLE_MCQ',
      options: [
        { id: 'A', text: '$-2$' },
        { id: 'B', text: '$+2$' },
        { id: 'C', text: '$0$' },
        { id: 'D', text: '$-1$' },
      ],
      correctAnswer: 'A',
      explanation: '$\\Delta n_g = n_{\\text{products}} - n_{\\text{reactants}} = 2 - (1 + 3) = -2$.',
      positiveMarks: 4,
      negativeMarks: 1,
      difficulty: 'EASY',
      classLevel: 'Class 11th',
      chapter: 'Chemical Equilibrium',
      topic: 'Equilibrium Constants',
      examCategory: 'NEET',
      createdAt: now,
      updatedAt: now,
    },
    {
      folderId: f1Ref.id,
      folderName: 'PCMB Mixed Diagnostic Bank [DEMO]',
      title: 'King Property Definite Integral (Mathematics)',
      subject: 'Mathematics',
      questionText:
        'Evaluate the definite integral $I = \\int_{0}^{\\pi/2} \\frac{\\sqrt{\\sin x}}{\\sqrt{\\sin x} + \\sqrt{\\cos x}}\\,dx$.',
      questionType: 'SINGLE_MCQ',
      options: [
        { id: 'A', text: '$\\frac{\\pi}{4}$' },
        { id: 'B', text: '$\\frac{\\pi}{2}$' },
        { id: 'C', text: '$\\pi$' },
        { id: 'D', text: '$\\frac{\\pi}{8}$' },
      ],
      correctAnswer: 'A',
      explanation:
        'Applying $\\int_0^a f(x)dx = \\int_0^a f(a-x)dx$, adding gives $2I = \\int_0^{\\pi/2} 1\\,dx = \\frac{\\pi}{2} \\implies I = \\frac{\\pi}{4}$.',
      positiveMarks: 4,
      negativeMarks: 1,
      difficulty: 'EASY',
      classLevel: 'Class 12th',
      chapter: 'Definite Integration',
      topic: 'Properties of Definite Integrals',
      examCategory: 'JEE Main',
      createdAt: now,
      updatedAt: now,
    },
    {
      folderId: f1Ref.id,
      folderName: 'PCMB Mixed Diagnostic Bank [DEMO]',
      title: 'Cell Cycle & Division — Crossing Over Stage (Biology)',
      subject: 'Biology',
      questionText: 'During Meiosis-I, crossing over occurs during which substage of Prophase-I?',
      questionType: 'SINGLE_MCQ',
      options: [
        { id: 'A', text: 'Leptotene' },
        { id: 'B', text: 'Zygotene' },
        { id: 'C', text: 'Pachytene' },
        { id: 'D', text: 'Diakinesis' },
      ],
      correctAnswer: 'C',
      explanation: 'Crossing over mediated by recombinase enzyme takes place in the Pachytene substage.',
      positiveMarks: 4,
      negativeMarks: 1,
      difficulty: 'EASY',
      classLevel: 'Class 11th',
      chapter: 'Cell Cycle and Cell Division',
      topic: 'Meiosis I',
      examCategory: 'NEET',
      createdAt: now,
      updatedAt: now,
    },
  ];
  sampleQuestions.forEach((q) => {
    batch.set(doc(collection(db, 'questions')), q);
  });

  // 5. Sample Isolated PCMB Exam (LIVE)
  const examRef = doc(collection(db, 'exams'));
  batch.set(examRef, {
    title: 'PCMB Combined Diagnostic CBT 01 [DEMO]',
    code: 'GURUKUL-PCMB-01',
    classLevel: 'Class 12th',
    target: 'JEE Main',
    subject: 'Combined PCMB',
    folderName: 'PCMB Integrated 2026',
    examType: 'Combined PCMB CBT',
    durationMinutes: 60,
    totalMarks: 16,
    questionCount: 4,
    openingDate: now.slice(0, 10),
    status: 'LIVE',
    isPublic: true,
    assignedCount: 0,
    assignedBatchIds: [b1Ref.id, b2Ref.id],
    instructions:
      '1. Covers Physics, Chemistry, Mathematics & Biology.\n2. +4 marks for each correct response and -1 for incorrect MCQ.\n3. Timer runs continuously once started.',
    createdAt: now,
    updatedAt: now,
  });

  sampleQuestions.forEach((q, idx) => {
    const eqRef = doc(collection(db, 'exams', examRef.id, 'questions'));
    batch.set(eqRef, {
      examId: examRef.id,
      examStatus: 'LIVE',
      orderIndex: idx,
      title: q.title,
      subject: q.subject || 'Combined PCMB',
      questionText: q.questionText,
      questionImageUrl: '',
      questionType: q.questionType,
      options: q.options || [],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || '',
      positiveMarks: q.positiveMarks,
      negativeMarks: q.negativeMarks,
      difficulty: q.difficulty,
      chapter: q.chapter || '',
      topic: q.topic || '',
      createdAt: now,
    });
  });

  // 6. Official Gurukul Courses
  GURUKUL_COURSES_CATALOG.forEach((c) =>
    batch.set(doc(collection(db, 'courses')), {
      ...c,
      createdAt: now,
      updatedAt: now,
    })
  );

  // 7. Official Gurukul Test Series
  GURUKUL_TEST_SERIES_CATALOG.forEach((ts, idx) =>
    batch.set(doc(collection(db, 'testSeries')), {
      ...ts,
      examIds: idx === 0 ? [examRef.id] : [],
      createdAt: now,
      updatedAt: now,
    })
  );

  // 8. Notification
  batch.set(doc(collection(db, 'notifications')), {
    title: 'Admissions & PCMB CBT Series Open',
    message:
      'Physics, Chemistry, Mathematics & Biology batches for IIT-JEE, NEET, MHT-CET & Foundation are active. Contact +91 9860968994 for details.',
    type: 'EXAM_REMINDER',
    targetType: 'ALL',
    readBy: [],
    createdAt: now,
  });

  await batch.commit();
}

export const seedPortalDemoData = seedMathematicsDemoData;

export async function syncGurukulCoursesToFirestore(existingNames: string[]): Promise<number> {
  const existingSet = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const toAdd = GURUKUL_COURSES_CATALOG.filter((c) => !existingSet.has(c.name.trim().toLowerCase()));
  if (toAdd.length === 0) return 0;

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  toAdd.forEach((c) => {
    batch.set(doc(collection(db, 'courses')), {
      ...c,
      createdAt: now,
      updatedAt: now,
    });
  });
  await batch.commit();
  return toAdd.length;
}

export async function syncGurukulTestSeriesToFirestore(existingTitles: string[]): Promise<number> {
  const existingSet = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  const toAdd = GURUKUL_TEST_SERIES_CATALOG.filter((ts) => !existingSet.has(ts.title.trim().toLowerCase()));
  if (toAdd.length === 0) return 0;

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  toAdd.forEach((ts) => {
    batch.set(doc(collection(db, 'testSeries')), {
      ...ts,
      createdAt: now,
      updatedAt: now,
    });
  });
  await batch.commit();
  return toAdd.length;
}

