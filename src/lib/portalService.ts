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

export const DEFAULT_INSTITUTE_SETTINGS: InstituteSettings = {
  instituteName: "Giri Sir's Gurukul Classes",
  tagline: 'Precision Mathematics for JEE Main, JEE Advanced & MHT-CET',
  storageTag: 'gurukul-vault-prod',
  logoUrl: '',
  logoWidth: 40,
  logoHeight: 40,
  heroImage: '/src/assets/images/hero_clean_math_1795625096103.jpg',
  heroTitle: 'Master IIT-JEE & MHT-CET Mathematics With Precision Testing',
  heroSubtitle:
    'Computer-Based Test (CBT) engine, structured chapterwise DPP banks, and deep mathematical evaluation built for Class 11th & Class 12th aspirants.',
  primaryCta: 'Student Portal Login',
  secondaryCta: 'Quick Join Candidate',
  faviconUrl: '',
  primaryColor: '#0032A0',
  secondaryColor: '#2563EB',
  address: 'New Usmanpura, Chhatrapati Sambhajinagar (Aurangabad), Maharashtra 431001',
  phone: '+91 98230 00000',
  whatsapp: '+91 98230 00000',
  email: 'admissions@girisirgurukul.in',
  website: 'https://girisirgurukul.in',
  socialLinks: {
    youtube: 'https://youtube.com',
    instagram: 'https://instagram.com',
    telegram: 'https://t.me',
  },
  portalConfig: {
    allowGoogleAuth: true,
    allowEmailPasswordAuth: true,
    allowQuickJoin: true,
    allowPublicRegistration: true,
    autoSubmitOnExpiry: true,
    strictNegativeMarking: true,
    upiId: 'gurukulclasses@upi',
    upiPayeeName: "Giri Sir's Gurukul Classes",
    bankDetails: 'Bank Transfer / UPI verification via 12-digit UTR reference number.',
    storageProvider: 'Local Vault + Firestore Sync',
    enableEmailNotifications: true,
    enableWhatsAppNotifications: true,
    compactTables: false,
  },
};

export const GENERATED_ASSETS = {
  hero: '/src/assets/images/hero_clean_math_1795625096103.jpg',
  courseJeeMain: '/src/assets/images/course_jee_main_1795625075936.jpg',
  courseJeeAdv: '/src/assets/images/course_jee_adv_1795625075528.jpg',
  courseMhtCet: '/src/assets/images/course_mht_cet_1795625075934.jpg',
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

export async function uploadFileToServer(file: File): Promise<{ url: string; fileName: string; fileSize: string }> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const resp = await fetch('/api/files/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      base64Data,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'File upload failed');
  }
  return data;
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
      subject: sourceExam.subject || 'Mathematics',
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
        subject: qData.subject || sourceExam.subject || 'Mathematics',
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
      totalMarks: (exam.totalMarks || 0) + addedMarks,
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
 * Seeds clearly labeled Mathematics demo data (Class 11th & 12th, JEE Main, JEE Advanced, MHT-CET)
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

  // 2. Faculty
  const facultyList: Array<Omit<FacultyProfile, 'id'>> = [
    {
      name: 'Prof. Giri Sir',
      qualification: 'M.Sc. Mathematics, IIT-JEE Mentor (16+ Yrs)',
      subjectSpecialization: 'Calculus, Coordinate Geometry & JEE Advanced Algebra',
      experience: '16 Years',
      email: 'giri.sir@girisirgurukul.in',
      contactNumber: '+91 98230 11001',
      photoUrl: GENERATED_ASSETS.facultyDirector,
      assignedBatches: ['Sankalp JEE 2026 (12th)', 'Aarambh IIT 2027 (11th)'],
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'Prof. Rohan Deshmukh',
      qualification: 'B.Tech, M.Tech (COEP Pune)',
      subjectSpecialization: 'Vectors, 3D Geometry & MHT-CET Speed Maths',
      experience: '9 Years',
      email: 'rohan.d@girisirgurukul.in',
      contactNumber: '+91 98230 11002',
      photoUrl: '',
      assignedBatches: ['MHT-CET Target 2026'],
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
    name: 'Sankalp JEE 2026 (Class 12th)',
    classLevel: 'Class 12th',
    academicYear: '2025-26',
    schedule: 'Mon–Sat · 07:30 AM – 09:30 AM',
    capacity: 120,
    facultyName: 'Prof. Giri Sir',
    assignedExamIds: [],
    studentCount: 0,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  batch.set(b2Ref, {
    name: 'Aarambh Foundation (Class 11th)',
    classLevel: 'Class 11th',
    academicYear: '2025-26',
    schedule: 'Mon–Sat · 04:00 PM – 06:00 PM',
    capacity: 100,
    facultyName: 'Prof. Rohan Deshmukh',
    assignedExamIds: [],
    studentCount: 0,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  // 4. Question Folders & Master Question Bank
  const f1Ref = doc(collection(db, 'questionFolders'));
  batch.set(f1Ref, {
    name: 'Definite Integration & Differential Equations [DEMO]',
    classLevel: 'Class 12th',
    chapter: 'Integral Calculus',
    examCategory: 'JEE Main',
    createdAt: now,
  });

  const sampleQuestions: Array<Omit<Question, 'id'>> = [
    {
      folderId: f1Ref.id,
      folderName: 'Definite Integration & Differential Equations [DEMO]',
      title: 'King Property Definite Integral (JEE Main)',
      questionText: 'Evaluate the definite integral $I = \\int_{0}^{\\pi/2} \\frac{\\sqrt{\\sin x}}{\\sqrt{\\sin x} + \\sqrt{\\cos x}}\\,dx$.',
      questionType: 'SINGLE_MCQ',
      options: [
        { id: 'A', text: '$\\frac{\\pi}{4}$' },
        { id: 'B', text: '$\\frac{\\pi}{2}$' },
        { id: 'C', text: '$\\pi$' },
        { id: 'D', text: '$\\frac{\\pi}{8}$' },
      ],
      correctAnswer: 'A',
      explanation: 'Applying $\\int_0^a f(x)dx = \\int_0^a f(a-x)dx$, adding gives $2I = \\int_0^{\\pi/2} 1\\,dx = \\frac{\\pi}{2} \\implies I = \\frac{\\pi}{4}$.',
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
      folderName: 'Definite Integration & Differential Equations [DEMO]',
      title: 'Matrices & Determinant Trace Problem',
      questionText: 'If $A = \\begin{pmatrix} 2 & 1 \\\\ 3 & 4 \\end{pmatrix}$, find the value of $\\det(A^2 - 6A + 5I)$.',
      questionType: 'INTEGER',
      options: [],
      correctAnswer: '0',
      explanation: 'By Cayley-Hamilton theorem, characteristic equation is $\\lambda^2 - \\text{tr}(A)\\lambda + |A| = \\lambda^2 - 6\\lambda + 5 = 0$. Hence $A^2 - 6A + 5I = O$, so determinant is $0$.',
      positiveMarks: 4,
      negativeMarks: 0,
      difficulty: 'MEDIUM',
      classLevel: 'Class 12th',
      chapter: 'Matrices & Determinants',
      topic: 'Cayley-Hamilton Theorem',
      examCategory: 'JEE Advanced',
      createdAt: now,
      updatedAt: now,
    },
    {
      folderId: f1Ref.id,
      folderName: 'Definite Integration & Differential Equations [DEMO]',
      title: 'Sum of Infinite Geometric Series (Class 11th)',
      questionText: 'Find the sum $\\sum_{n=1}^{\\infty} \\frac{n}{2^n}$.',
      questionType: 'NUMERICAL',
      options: [],
      correctAnswer: '2',
      explanation: 'Using AGP formula $S = \\frac{a}{1-r} + \\frac{dr}{(1-r)^2}$ with $a=1/2, d=1, r=1/2$, we get $S = 2$.',
      positiveMarks: 4,
      negativeMarks: 1,
      difficulty: 'MEDIUM',
      classLevel: 'Class 11th',
      chapter: 'Sequences and Series',
      topic: 'Arithmetico-Geometric Progression',
      examCategory: 'JEE Main',
      createdAt: now,
      updatedAt: now,
    },
    {
      folderId: f1Ref.id,
      folderName: 'Definite Integration & Differential Equations [DEMO]',
      title: 'Trigonometric Identity (MHT-CET)',
      questionText: 'If $\\alpha + \\beta = \\frac{\\pi}{4}$, then $(1 + \\tan\\alpha)(1 + \\tan\\beta)$ equals:',
      questionType: 'SINGLE_MCQ',
      options: [
        { id: 'A', text: '$1$' },
        { id: 'B', text: '$2$' },
        { id: 'C', text: '$\\sqrt{2}$' },
        { id: 'D', text: '$4$' },
      ],
      correctAnswer: 'B',
      explanation: '$\\tan(\\alpha+\\beta)=1 \\implies \\tan\\alpha + \\tan\\beta + \\tan\\alpha\\tan\\beta = 1 \\implies (1+\\tan\\alpha)(1+\\tan\\beta) = 2$.',
      positiveMarks: 2,
      negativeMarks: 0,
      difficulty: 'EASY',
      classLevel: 'Class 11th',
      chapter: 'Trigonometric Functions',
      topic: 'Compound Angles',
      examCategory: 'MHT-CET',
      createdAt: now,
      updatedAt: now,
    },
  ];
  sampleQuestions.forEach((q) => {
    batch.set(doc(collection(db, 'questions')), q);
  });

  // 5. Sample Isolated Exam (LIVE)
  const examRef = doc(collection(db, 'exams'));
  batch.set(examRef, {
    title: 'JEE Main Calculus & Algebra Mock Test 01 [DEMO]',
    code: 'GURUKUL-JEE-M01',
    classLevel: 'Class 12th',
    target: 'JEE Main',
    folderName: 'JEE Main 2026',
    examType: 'Chapterwise CBT',
    durationMinutes: 60,
    totalMarks: 12,
    questionCount: 3,
    openingDate: now.slice(0, 10),
    status: 'LIVE',
    isPublic: true,
    assignedCount: 0,
    assignedBatchIds: [b1Ref.id],
    instructions: '1. Each MCQ carries +4 marks for correct answer and -1 for wrong answer.\n2. Integer/Numerical questions have no negative marking unless specified.\n3. Timer runs continuously once started.',
    createdAt: now,
    updatedAt: now,
  });

  sampleQuestions.slice(0, 3).forEach((q, idx) => {
    const eqRef = doc(collection(db, 'exams', examRef.id, 'questions'));
    batch.set(eqRef, {
      examId: examRef.id,
      examStatus: 'LIVE',
      orderIndex: idx,
      title: q.title,
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

  // 6. Courses
  const courses: Array<Omit<Course, 'id'>> = [
    {
      name: 'JEE Main Mathematics Complete Mastery [DEMO]',
      description: 'Full Class 11th & 12th Mathematics syllabus with Calculus, Algebra, Vectors & 3D, DPPs and weekly CBT tests.',
      category: 'JEE Main',
      classLevel: 'Class 12th',
      price: 4999,
      thumbnailUrl: GENERATED_ASSETS.courseJeeMain,
      status: 'PUBLISHED',
      enrolledCount: 0,
      modules: [
        {
          id: 'mod-1',
          title: 'Module 01: Differential & Integral Calculus',
          chapters: [
            { id: 'ch-1', title: 'Limits, Continuity & Differentiability', duration: '4h 30m' },
            { id: 'ch-2', title: 'Definite Integration & Area Under Curves', duration: '5h 15m' },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'JEE Advanced Rankers Problem Solving [DEMO]',
      description: 'High-order multi-concept problems in Matrices, Complex Numbers, Conics, and Functional Equations.',
      category: 'JEE Advanced',
      classLevel: 'Class 12th',
      price: 6999,
      thumbnailUrl: GENERATED_ASSETS.courseJeeAdv,
      status: 'PUBLISHED',
      enrolledCount: 0,
      modules: [
        {
          id: 'mod-adv-1',
          title: 'Module 01: Conic Sections & 3D Vectors',
          chapters: [
            { id: 'ch-adv-1', title: 'Parabola, Ellipse & Hyperbola Tangents', duration: '6h 00m' },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'MHT-CET Mathematics 99+ Percentile Booster [DEMO]',
      description: 'Speed-accuracy workshops, Maharashtra State Board + CET PYQ drills, and 25 full-length timed mock tests.',
      category: 'MHT-CET',
      classLevel: 'Class 12th',
      price: 2499,
      thumbnailUrl: GENERATED_ASSETS.courseMhtCet,
      status: 'PUBLISHED',
      enrolledCount: 0,
      modules: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  courses.forEach((c) => batch.set(doc(collection(db, 'courses')), c));

  // 7. Test Series
  const series = [
    {
      title: 'JEE Main Mathematics All-India CBT Series [DEMO]',
      description: '20 NTA-pattern Mathematics mock tests with instant scorecards, accuracy breakdown & solutions.',
      price: 999,
      mockTestCount: 20,
      classLevel: 'Class 12th',
      examCategory: 'JEE Main Mathematics',
      status: 'PUBLISHED',
      examIds: [examRef.id],
      createdAt: now,
      updatedAt: now,
    },
    {
      title: 'JEE Advanced Mathematics Paper 1 & 2 Series [DEMO]',
      description: '12 Paper-1 & Paper-2 multi-correct, integer & matrix-match Mathematics tests.',
      price: 1499,
      mockTestCount: 12,
      classLevel: 'Class 12th',
      examCategory: 'JEE Advanced Mathematics',
      status: 'PUBLISHED',
      examIds: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      title: 'MHT-CET Mathematics 50-Question Sprint Series [DEMO]',
      description: '25 MHT-CET 90-minute 100-mark Mathematics speed tests.',
      price: 599,
      mockTestCount: 25,
      classLevel: 'Class 12th',
      examCategory: 'MHT-CET Mathematics',
      status: 'PUBLISHED',
      examIds: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  series.forEach((ts) => batch.set(doc(collection(db, 'testSeries')), ts));

  // 8. Notification
  batch.set(doc(collection(db, 'notifications')), {
    title: 'JEE Main Calculus Mock Test 01 Live [DEMO]',
    message: 'Students in Sankalp JEE 2026 can now attempt the 60-minute Calculus & Algebra CBT test from the Exams section.',
    type: 'EXAM_REMINDER',
    targetType: 'ALL',
    readBy: [],
    createdAt: now,
  });

  await batch.commit();
}
