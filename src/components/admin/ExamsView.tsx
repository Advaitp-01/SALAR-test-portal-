import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from '../../lib/tenantDb';
import {
  BarChart3,
  Check,
  CheckCircle2,
  Database,
  Edit2,
  FileText,
  Folder,
  FolderPlus,
  Globe,
  Layers,
  Play,
  Plus,
  ScanText,
  Search,
  Share2,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import {
  cloneExamIsolated,
  deleteExamCompletely,
  extractMathQuestionsWithOCR,
  importBankQuestionsIntoExam,
  toggleExamStatus,
  uploadFileToServer,
} from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';
import { CBTExamInterface } from '../CBTExamInterface';
import { MathText } from '../MathText';
import { ShareExamModal } from './ShareExamModal';
import type {
  Batch,
  Exam,
  ExamAttempt,
  ExamQuestion,
  Question,
  QuestionType,
  StudentProfile,
} from '../../types/portal';

interface ToastItem {
  id: string;
  message: string;
  variant?: 'success' | 'error';
}

const EXAM_TAG_PRESETS: Array<{
  label: string;
  target: Exam['target'];
  pos: number;
  neg: number;
  defaultInstructions: string;
}> = [
  {
    label: 'JEE Mains (+4/-1)',
    target: 'JEE Main',
    pos: 4,
    neg: 1,
    defaultInstructions: 'Read each question carefully. Marks: +4 correct, -1 wrong.',
  },
  {
    label: 'JEE Advanced (+4/-1)',
    target: 'JEE Advanced',
    pos: 4,
    neg: 1,
    defaultInstructions: 'Read each question carefully. Marks: +4 correct, -1 wrong.',
  },
  {
    label: 'MHT-CET (+2/-0)',
    target: 'MHT-CET',
    pos: 2,
    neg: 0,
    defaultInstructions: 'Read each question carefully. Marks: +2 correct, 0 negative marking.',
  },
  {
    label: 'NEET (+4/-1)',
    target: 'NEET',
    pos: 4,
    neg: 1,
    defaultInstructions: 'Read each question carefully. Marks: +4 correct, -1 wrong.',
  },
];

const SUBJECT_OPTIONS = [
  'Combined PCM',
  'Combined PCMB',
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
];

const QUESTION_SUBJECT_OPTIONS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Combined PCM',
  'Combined PCMB',
];

function generateExamCode(prefix = 'EX'): string {
  const clean = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'EX';
  return `${clean}-${1000 + Math.floor(Math.random() * 8999)}`;
}

function getPresetMarksFromExam(ex?: Exam | null): { pos: number; neg: number } {
  if (!ex) return { pos: 4, neg: 1 };
  const tag = ex.examTag || ex.target;
  if (tag.includes('MHT-CET')) return { pos: 2, neg: 0 };
  return { pos: 4, neg: 1 };
}

export const ExamsView: React.FC = () => {
  const { tenantContext, settings, syncStatus, firebaseUser, isIsolatedTenant, cloudAuthNeeded } = useAuth();
  const needsCloudAuth = !isIsolatedTenant && (!firebaseUser || cloudAuthNeeded);
  const examCodePrefix =
    tenantContext?.portalPath === '/'
      ? 'GC'
      : (tenantContext?.instituteName || settings.instituteName || 'EX')
          .split(/\s+/)
          .map((w) => w[0] || '')
          .join('')
          .slice(0, 3)
          .toUpperCase() || 'EX';
  const portalBase =
    tenantContext?.portalPath && tenantContext.portalPath !== '/' ? tenantContext.portalPath : '';
  const [exams, setExams] = useState<Exam[]>([]);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'DRAFT'>('ALL');
  const [subjectFilter, setSubjectFilter] = useState<string>('All Subjects');
  const [folderFilter, setFolderFilter] = useState<string>('ALL');

  // Toast queue
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = useCallback((message: string, variant: 'success' | 'error' = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // Create / Edit Exam Folder Modal
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderModalTitle, setFolderModalTitle] = useState<'Create Exam Folder*' | 'Create Online Exam' | 'Edit Exam Folder'>('Create Exam Folder*');
  const [folderModalTab, setFolderModalTab] = useState<'info' | 'questions' | 'students'>('info');
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [createMode, setCreateMode] = useState<'blank' | 'copy' | 'bank'>('blank');
  const [showAdvancedModePicker, setShowAdvancedModePicker] = useState(false);
  const [sourceExamId, setSourceExamId] = useState('');
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);

  // Exam Folder Form State
  const [folderName, setFolderName] = useState('');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState(() => generateExamCode(examCodePrefix));
  const [classLevel, setClassLevel] = useState<'Class 11th' | 'Class 12th' | 'All Classes'>('Class 11th');
  const [selectedPresetLabel, setSelectedPresetLabel] = useState('JEE Mains (+4/-1)');
  const [target, setTarget] = useState<Exam['target']>('JEE Main');
  const [subject, setSubject] = useState('Combined PCM');
  const [passingMarks, setPassingMarks] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [totalMarks, setTotalMarks] = useState(0);
  const [publishImmediate, setPublishImmediate] = useState(true);
  const [webcamEnabled, setWebcamEnabled] = useState(true);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [instructions, setInstructions] = useState('Read each question carefully. Marks: +4 correct, -1 wrong.');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderAssignedBatches, setFolderAssignedBatches] = useState<string[]>([]);

  // Questions inside Folder Modal (tab 2)
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [questionSubView, setQuestionSubView] = useState<'list' | 'import-bank' | 'ocr'>('list');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDrafts, setOcrDrafts] = useState<Array<Partial<Question>>>([]);

  // Create Question Modal ([Q1])
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [qTargetExamId, setQTargetExamId] = useState('');
  const [qTargetExamQuestionsCount, setQTargetExamQuestionsCount] = useState(0);
  const [qClassLevel, setQClassLevel] = useState<'Class 11th' | 'Class 12th' | 'All Classes'>('Class 11th');
  const [qSubject, setQSubject] = useState('Mathematics');
  const [qText, setQText] = useState('');
  const [qImageUrl, setQImageUrl] = useState('');
  const [qUploadingImage, setQUploadingImage] = useState(false);
  const [qDragOver, setQDragOver] = useState(false);
  const [qType, setQType] = useState<QuestionType>('SINGLE_MCQ');
  const [qCorrectAnswer, setQCorrectAnswer] = useState('A');
  const [showOptionTexts, setShowOptionTexts] = useState(false);
  const [qOptions, setQOptions] = useState([
    { id: 'A', text: '' },
    { id: 'B', text: '' },
    { id: 'C', text: '' },
    { id: 'D', text: '' },
  ]);
  const [qPosMarks, setQPosMarks] = useState(4);
  const [qNegMarks, setQNegMarks] = useState(1);
  const [qSaving, setQSaving] = useState(false);
  const [qError, setQError] = useState('');

  // Analytics, Share Modal & CBT Preview
  const [analyticsExam, setAnalyticsExam] = useState<Exam | null>(null);
  const [shareModalExam, setShareModalExam] = useState<Exam | null>(null);
  const [cbtTestExam, setCbtTestExam] = useState<Exam | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'exams'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) }));
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setExams(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'exams')
    );
    const u2 = onSnapshot(
      collection(db, 'questions'),
      (snap) => setBankQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Question, 'id'>) }))),
      () => {}
    );
    const u3 = onSnapshot(
      collection(db, 'batches'),
      (snap) => setBatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Batch, 'id'>) }))),
      () => {}
    );
    const u4 = onSnapshot(
      collection(db, 'students'),
      (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentProfile, 'id'>) }))),
      () => {}
    );
    const u5 = onSnapshot(
      collection(db, 'examAttempts'),
      (snap) => setAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, 'id'>) }))),
      () => {}
    );
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, []);

  // Load isolated questions for the active editing exam inside Folder Modal
  useEffect(() => {
    if (!editingExam) {
      setExamQuestions([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'exams', editingExam.id, 'questions'), orderBy('orderIndex', 'asc')),
      (snap) => setExamQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamQuestion, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, `exams/${editingExam.id}/questions`)
    );
    return () => unsub();
  }, [editingExam]);

  // Keep Q count accurate for selected exam in Create Question modal
  useEffect(() => {
    if (!questionModalOpen || !qTargetExamId) return;
    const unsub = onSnapshot(
      collection(db, 'exams', qTargetExamId, 'questions'),
      (snap) => setQTargetExamQuestionsCount(snap.size),
      () => {}
    );
    return () => unsub();
  }, [questionModalOpen, qTargetExamId]);

  const handleUploadQuestionImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setQError('Please select a PNG, JPG, JPEG, or WebP image file.');
        return;
      }
      setQError('');
      setQUploadingImage(true);
      try {
        const res = await uploadFileToServer(file);
        setQImageUrl(res.url);
      } catch (err) {
        setQError(err instanceof Error ? err.message : 'Failed to upload image.');
      } finally {
        setQUploadingImage(false);
      }
    },
    []
  );

  // Ctrl+V clipboard screenshot paste anywhere inside Create Question dialog
  useEffect(() => {
    if (!questionModalOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const ext = blob.type.split('/')[1] || 'png';
            const pastedFile = new File([blob], `pasted-question-${Date.now()}.${ext}`, { type: blob.type });
            void handleUploadQuestionImageFile(pastedFile);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [questionModalOpen, handleUploadQuestionImageFile]);

  const liveCount = useMemo(() => exams.filter((e) => e.status === 'LIVE').length, [exams]);

  const subjectPills = useMemo(() => {
    const base = ['All Subjects', 'Physics', 'Chemistry', 'Mathematics', 'Biology', 'Combined PCM', 'Combined PCMB'];
    const extras = new Set<string>();
    exams.forEach((ex) => {
      if (ex.subject && !base.includes(ex.subject)) extras.add(ex.subject);
    });
    return [...base, ...Array.from(extras)];
  }, [exams]);

  const folderSummaries = useMemo(() => {
    const map = new Map<string, Exam[]>();
    exams.forEach((ex) => {
      const f = ex.folderName?.trim() || 'General';
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(ex);
    });
    return Array.from(map.entries());
  }, [exams]);

  const filteredExams = useMemo(() => {
    const s = search.trim().toLowerCase();
    return exams.filter((ex) => {
      if (statusFilter !== 'ALL' && ex.status !== statusFilter) return false;
      const exSubj = ex.subject || 'Mathematics';
      if (subjectFilter !== 'All Subjects' && exSubj !== subjectFilter) return false;
      const exFolder = ex.folderName?.trim() || 'General';
      if (folderFilter !== 'ALL' && exFolder !== folderFilter) return false;
      if (s) {
        return (
          ex.title.toLowerCase().includes(s) ||
          ex.code.toLowerCase().includes(s) ||
          exFolder.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [exams, statusFilter, subjectFilter, folderFilter, search]);

  const groupedFilteredExams = useMemo(() => {
    const map = new Map<string, Exam[]>();
    filteredExams.forEach((ex) => {
      const f = ex.folderName?.trim() || 'General';
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(ex);
    });
    return Array.from(map.entries());
  }, [filteredExams]);

  const openCreateFolderModal = (presetFolder?: string, isOnlineExamClick = false) => {
    setEditingExam(null);
    setFolderModalTitle(isOnlineExamClick ? 'Create Online Exam' : 'Create Exam Folder*');
    setFolderModalTab('info');
    setCreateMode('blank');
    setShowAdvancedModePicker(isOnlineExamClick);
    setSourceExamId(exams[0]?.id || '');
    setSelectedBankIds([]);
    setFolderName(presetFolder || '');
    setTitle('');
    setCode(generateExamCode(examCodePrefix));
    setClassLevel('Class 11th');
    setSelectedPresetLabel('JEE Mains (+4/-1)');
    setTarget('JEE Main');
    setSubject('Combined PCM');
    setPassingMarks(0);
    setDurationMinutes(180);
    setTotalMarks(0);
    setPublishImmediate(true);
    setWebcamEnabled(true);
    setRandomizeQuestions(false);
    setIsPublic(true);
    setInstructions('Read each question carefully. Marks: +4 correct, -1 wrong.');
    setStartAt('');
    setEndAt('');
    setFolderAssignedBatches([]);
    setQuestionSubView('list');
    setFolderModalOpen(true);
  };

  const openEditExamModal = (ex: Exam, initialTab: 'info' | 'questions' | 'students' = 'info') => {
    setEditingExam(ex);
    setFolderModalTitle('Edit Exam Folder');
    setFolderModalTab(initialTab);
    setShowAdvancedModePicker(false);
    setFolderName(ex.folderName || '');
    setTitle(ex.title);
    setCode(ex.code);
    setClassLevel(ex.classLevel);
    const matchingPreset =
      EXAM_TAG_PRESETS.find((p) => p.label === ex.examTag || p.target === ex.target) || EXAM_TAG_PRESETS[0];
    setSelectedPresetLabel(ex.examTag || matchingPreset.label);
    setTarget(ex.target);
    setSubject(ex.subject || 'Combined PCM');
    setPassingMarks(ex.passingMarks ?? 0);
    setDurationMinutes(ex.durationMinutes || 180);
    setTotalMarks(ex.totalMarks || 0);
    setPublishImmediate(ex.status === 'LIVE');
    setWebcamEnabled(Boolean(ex.webcamEnabled));
    setRandomizeQuestions(Boolean(ex.randomizeQuestions));
    setIsPublic(ex.isPublic !== false);
    setInstructions(ex.instructions || 'Read each question carefully. Marks: +4 correct, -1 wrong.');
    setStartAt(ex.startAt || '');
    setEndAt(ex.endAt || '');
    setFolderAssignedBatches(ex.assignedBatchIds || []);
    setQuestionSubView('list');
    setFolderModalOpen(true);
  };

  const handleSelectTagPreset = (preset: (typeof EXAM_TAG_PRESETS)[number]) => {
    setSelectedPresetLabel(preset.label);
    setTarget(preset.target);
    if (preset.target === 'NEET' && (subject === 'Combined PCM' || subject === 'Mathematics')) {
      setSubject('Combined PCMB');
    }
    if (
      !instructions ||
      EXAM_TAG_PRESETS.some((p) => p.defaultInstructions === instructions.trim())
    ) {
      setInstructions(preset.defaultInstructions);
    }
  };

  const openQuestionBuilderForExam = (ex: Exam) => {
    const preset = getPresetMarksFromExam(ex);
    setQTargetExamId(ex.id);
    setQTargetExamQuestionsCount(ex.questionCount || 0);
    setQClassLevel(ex.classLevel);
    setQSubject(
      ex.subject === 'Combined PCM' || ex.subject === 'Combined PCMB'
        ? 'Mathematics'
        : ex.subject || 'Mathematics'
    );
    setQText('');
    setQImageUrl('');
    setQType('SINGLE_MCQ');
    setQCorrectAnswer('A');
    setShowOptionTexts(false);
    setQOptions([
      { id: 'A', text: '' },
      { id: 'B', text: '' },
      { id: 'C', text: '' },
      { id: 'D', text: '' },
    ]);
    setQPosMarks(preset.pos);
    setQNegMarks(preset.neg);
    setQError('');
    setQuestionModalOpen(true);
  };

  const handleSelectTargetExamInQuestionModal = (examId: string) => {
    setQTargetExamId(examId);
    const chosen = exams.find((x) => x.id === examId);
    if (chosen) {
      const preset = getPresetMarksFromExam(chosen);
      setQClassLevel(chosen.classLevel);
      setQPosMarks(preset.pos);
      setQNegMarks(preset.neg);
      if (
        chosen.subject &&
        QUESTION_SUBJECT_OPTIONS.includes(chosen.subject) &&
        chosen.subject !== 'Combined PCM' &&
        chosen.subject !== 'Combined PCMB'
      ) {
        setQSubject(chosen.subject);
      }
    }
  };

  const handleSaveFolderOrExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim() || !title.trim()) {
      pushToast('Please enter both Folder Name and Exam Name.', 'error');
      return;
    }

    setFolderSaving(true);
    const now = new Date().toISOString();
    const assignedCount = students.filter((s) => s.batchId && folderAssignedBatches.includes(s.batchId)).length;

    try {
      if (editingExam) {
        const nextStatus: 'LIVE' | 'DRAFT' = publishImmediate ? 'LIVE' : 'DRAFT';
        await updateDoc(doc(db, 'exams', editingExam.id), {
          title: title.trim(),
          code: code.trim() || editingExam.code,
          classLevel,
          target,
          subject,
          examTag: selectedPresetLabel,
          folderName: folderName.trim(),
          examType: selectedPresetLabel,
          durationMinutes: Number(durationMinutes) || 180,
          passingMarks: Number(passingMarks) || 0,
          openingDate: startAt ? startAt.slice(0, 10) : editingExam.openingDate || now.slice(0, 10),
          startAt: startAt || '',
          endAt: endAt || '',
          status: nextStatus,
          isPublic,
          webcamEnabled,
          randomizeQuestions,
          assignedBatchIds: folderAssignedBatches,
          assignedCount,
          instructions: instructions.trim(),
          updatedAt: now,
        });
        if (nextStatus !== editingExam.status) {
          await toggleExamStatus(editingExam.id, nextStatus);
        }
        pushToast(`Exam "${title.trim()}" updated successfully.`);
        setFolderModalOpen(false);
        setFolderSaving(false);
        return;
      }

      if (createMode === 'copy' && sourceExamId) {
        const src = exams.find((x) => x.id === sourceExamId);
        if (src) {
          const newId = await cloneExamIsolated(src, title.trim(), code.trim() || generateExamCode(examCodePrefix));
          if (publishImmediate) {
            await toggleExamStatus(newId, 'LIVE');
          }
          pushToast(`Exam "${title.trim()}" cloned successfully!`);
          setFolderModalOpen(false);
          setFolderSaving(false);
          return;
        }
      }

      const initialStatus: 'LIVE' | 'DRAFT' = publishImmediate ? 'LIVE' : 'DRAFT';
      const generatedCode = code.trim() || generateExamCode(examCodePrefix);

      const payload: Omit<Exam, 'id'> = {
        title: title.trim(),
        code: generatedCode,
        classLevel,
        target,
        subject,
        examTag: selectedPresetLabel,
        folderName: folderName.trim(),
        examType: selectedPresetLabel,
        durationMinutes: Number(durationMinutes) || 180,
        totalMarks: Number(totalMarks) || 0,
        passingMarks: Number(passingMarks) || 0,
        questionCount: 0,
        openingDate: startAt ? startAt.slice(0, 10) : now.slice(0, 10),
        startAt: startAt || '',
        endAt: endAt || '',
        status: initialStatus,
        isPublic,
        webcamEnabled,
        randomizeQuestions,
        assignedCount,
        assignedBatchIds: folderAssignedBatches,
        pdfUrl: '',
        answerKeyNotes: '',
        instructions: instructions.trim(),
        createdAt: now,
        updatedAt: now,
      };

      const newRef = await addDoc(collection(db, 'exams'), payload);
      const createdExam: Exam = { id: newRef.id, ...payload };

      if (createMode === 'bank' && selectedBankIds.length > 0) {
        const chosen = bankQuestions.filter((q) => selectedBankIds.includes(q.id));
        await importBankQuestionsIntoExam(createdExam, chosen);
        pushToast(`Exam "${title.trim()}" created with ${chosen.length} bank questions!`);
        setFolderModalOpen(false);
        setFolderSaving(false);
        return;
      }

      // Close Create Exam Folder modal, fire stacked toast notifications & launch Q1 Question Builder!
      setFolderModalOpen(false);
      pushToast(`Exam folder "${folderName.trim()}" created.`);
      pushToast(`Exam "${title.trim()}" created successfully!`);
      pushToast(`Exam folder "${folderName.trim()}" (${classLevel}) created! Now upload or type your questions.`);
      openQuestionBuilderForExam(createdExam);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'exams');
    } finally {
      setFolderSaving(false);
    }
  };

  const handleSaveBatchAssignmentsInModal = async () => {
    if (!editingExam) return;
    const assignedCount = students.filter((s) => s.batchId && folderAssignedBatches.includes(s.batchId)).length;
    try {
      await updateDoc(doc(db, 'exams', editingExam.id), {
        assignedBatchIds: folderAssignedBatches,
        assignedCount,
        isPublic,
        updatedAt: new Date().toISOString(),
      });
      setEditingExam({ ...editingExam, assignedBatchIds: folderAssignedBatches, assignedCount, isPublic });
      pushToast(`Updated student & batch access for "${editingExam.title}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `exams/${editingExam.id}`);
    }
  };

  const hasUnsavedQuestionContent = Boolean(qText.trim() || qImageUrl.trim());

  const persistCurrentQuestion = async (): Promise<Exam | null> => {
    const targetExam = exams.find((x) => x.id === qTargetExamId) || editingExam;
    if (!targetExam) {
      setQError('Please select an Exam Folder / Paper first.');
      return null;
    }
    if (!qText.trim() && !qImageUrl.trim()) {
      setQError('Please enter question text OR upload/paste a question image.');
      return null;
    }
    if (!qCorrectAnswer.trim()) {
      setQError('Please specify the Correct Answer Key.');
      return null;
    }

    setQError('');
    setQSaving(true);
    const now = new Date().toISOString();
    const pos = Number(qPosMarks) || 0;
    const neg = Math.abs(Number(qNegMarks) || 0);
    const isMcq = qType === 'SINGLE_MCQ' || qType === 'MULTI_MCQ' || qType === 'IMAGE_BASED';

    try {
      const existingSnap = await getDocs(collection(db, 'exams', targetExam.id, 'questions'));
      const nextIndex = existingSnap.size;
      const nextCount = nextIndex + 1;
      const nextTotalMarks = Number(targetExam.totalMarks || 0) + pos;

      await addDoc(collection(db, 'exams', targetExam.id, 'questions'), {
        examId: targetExam.id,
        examStatus: targetExam.status,
        orderIndex: nextIndex,
        title: `Question ${nextCount}`,
        subject: qSubject,
        questionText: qText.trim(),
        questionImageUrl: qImageUrl.trim(),
        questionType: qType,
        options: isMcq ? qOptions.map((o) => ({ id: o.id, text: o.text.trim() })) : [],
        correctAnswer: qCorrectAnswer.trim(),
        explanation: '',
        positiveMarks: pos,
        negativeMarks: neg,
        difficulty: 'MEDIUM',
        chapter: '',
        topic: '',
        createdAt: now,
      });

      await updateDoc(doc(db, 'exams', targetExam.id), {
        questionCount: nextCount,
        totalMarks: nextTotalMarks,
        updatedAt: now,
      });

      if (editingExam && editingExam.id === targetExam.id) {
        setEditingExam({ ...editingExam, questionCount: nextCount, totalMarks: nextTotalMarks });
      }
      setQTargetExamQuestionsCount(nextCount);
      pushToast(`Question Q${nextCount} saved to "${targetExam.title}".`);
      return { ...targetExam, questionCount: nextCount, totalMarks: nextTotalMarks };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `exams/${targetExam.id}/questions`);
      return null;
    } finally {
      setQSaving(false);
    }
  };

  const resetQuestionInputsForNext = () => {
    setQText('');
    setQImageUrl('');
    setQCorrectAnswer(qType === 'NUMERICAL' || qType === 'INTEGER' ? '' : 'A');
    setShowOptionTexts(false);
    setQOptions([
      { id: 'A', text: '' },
      { id: 'B', text: '' },
      { id: 'C', text: '' },
      { id: 'D', text: '' },
    ]);
    setQError('');
  };

  const handleQuestionSave = async () => {
    await persistCurrentQuestion();
  };

  const handleQuestionSaveAndNext = async () => {
    const saved = await persistCurrentQuestion();
    if (saved) {
      resetQuestionInputsForNext();
    }
  };

  const handleQuestionFinishAndShare = async () => {
    let targetExam = exams.find((x) => x.id === qTargetExamId) || editingExam;
    if (hasUnsavedQuestionContent) {
      const saved = await persistCurrentQuestion();
      if (!saved) return;
      targetExam = saved;
    }
    setQuestionModalOpen(false);
    if (targetExam) {
      await shareExamLink(targetExam);
    }
  };

  const handleQuestionFinish = async () => {
    if (hasUnsavedQuestionContent) {
      const saved = await persistCurrentQuestion();
      if (!saved) return;
    }
    setQuestionModalOpen(false);
  };

  const toggleAnswerKeyOption = (optId: string) => {
    if (qType === 'MULTI_MCQ') {
      const current = new Set(
        qCorrectAnswer
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean)
      );
      if (current.has(optId)) current.delete(optId);
      else current.add(optId);
      setQCorrectAnswer(Array.from(current).sort().join(','));
    } else {
      setQCorrectAnswer(optId);
    }
  };

  const handleDeleteExamQuestion = async (q: ExamQuestion) => {
    if (!editingExam) return;
    try {
      await deleteDoc(doc(db, 'exams', editingExam.id, 'questions', q.id));
      const nextCount = Math.max(0, examQuestions.length - 1);
      const nextMarks = Math.max(0, (editingExam.totalMarks || 0) - Number(q.positiveMarks || 0));
      await updateDoc(doc(db, 'exams', editingExam.id), {
        questionCount: nextCount,
        totalMarks: nextMarks,
        updatedAt: new Date().toISOString(),
      });
      setEditingExam({ ...editingExam, questionCount: nextCount, totalMarks: nextMarks });
      pushToast('Question removed from paper.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `exams/${editingExam.id}/questions/${q.id}`);
    }
  };

  const handleUploadExamPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingExam) return;
    setUploadingPdf(true);
    try {
      const res = await uploadFileToServer(file);
      await updateDoc(doc(db, 'exams', editingExam.id), {
        pdfUrl: res.url,
        updatedAt: new Date().toISOString(),
      });
      setEditingExam({ ...editingExam, pdfUrl: res.url });
      pushToast('Exam reference PDF attached.');
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleRunExamOCR = async () => {
    if (!ocrFile || !editingExam) return;
    setOcrLoading(true);
    try {
      const extracted = await extractMathQuestionsWithOCR({
        file: ocrFile,
        defaultClass: editingExam.classLevel === 'All Classes' ? 'Class 12th' : editingExam.classLevel,
        defaultExamCategory: editingExam.target,
      });
      setOcrDrafts(extracted);
    } finally {
      setOcrLoading(false);
    }
  };

  const handleCommitExamOCR = async () => {
    if (!editingExam || ocrDrafts.length === 0) return;
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    let addedMarks = 0;
    ocrDrafts.forEach((d, idx) => {
      const pos = Number(d.positiveMarks ?? 4);
      addedMarks += pos;
      batch.set(doc(collection(db, 'exams', editingExam.id, 'questions')), {
        examId: editingExam.id,
        examStatus: editingExam.status,
        orderIndex: examQuestions.length + idx,
        title: d.title || `Q${examQuestions.length + idx + 1}`,
        subject: editingExam.subject || 'Mathematics',
        questionText: d.questionText || '',
        questionImageUrl: '',
        questionType: (d.questionType as QuestionType) || 'SINGLE_MCQ',
        options: d.options || [],
        correctAnswer: d.correctAnswer || '',
        explanation: d.explanation || '',
        positiveMarks: pos,
        negativeMarks: Number(d.negativeMarks ?? 1),
        difficulty: d.difficulty || 'MEDIUM',
        chapter: d.chapter || '',
        topic: d.topic || '',
        createdAt: now,
      });
    });
    const nextCount = examQuestions.length + ocrDrafts.length;
    const nextMarks = (editingExam.totalMarks || 0) + addedMarks;
    batch.update(doc(db, 'exams', editingExam.id), {
      questionCount: nextCount,
      totalMarks: nextMarks,
      updatedAt: now,
    });
    await batch.commit();
    setEditingExam({ ...editingExam, questionCount: nextCount, totalMarks: nextMarks });
    setOcrDrafts([]);
    setQuestionSubView('list');
    pushToast(`Imported ${ocrDrafts.length} OCR questions into "${editingExam.title}".`);
  };

  const shareExamLink = (ex: Exam) => {
    setShareModalExam(ex);
  };

  const handleClone = async (ex: Exam) => {
    await cloneExamIsolated(ex, `${ex.title} (Copy)`, `${ex.code}-COPY`);
    pushToast(`Cloned "${ex.title}" cleanly.`);
  };

  if (cbtTestExam) {
    return <CBTExamInterface exam={cbtTestExam} isPreviewMode onExit={() => setCbtTestExam(null)} />;
  }

  const classLabelForModal =
    classLevel === 'Class 11th' ? 'Class 11th' : classLevel === 'Class 12th' ? 'Class 12th' : 'All Classes';

  const matchingClassStudents = students.filter(
    (s) => classLevel === 'All Classes' || s.classLevel === classLevel
  );

  return (
    <div className="space-y-5">
      {/* Page Header (Matches Screenshot 1) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Exam Management</h1>
          <p className="text-xs font-mono text-slate-500 mt-1 tabular-nums">
            Organized by Examination Folders · {exams.length} Papers ·{' '}
            <span className="text-emerald-700 font-semibold">{liveCount} Live</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold rounded-lg border ${
              needsCloudAuth
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : syncStatus === 'SYNCED'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-100 border-[#E2E8F0] text-slate-600'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {needsCloudAuth ? 'Cloud Auth Required' : syncStatus === 'SYNCED' ? 'Cloud Sync Active' : 'Offline Mode'}
          </span>
          <button
            type="button"
            onClick={() => openCreateFolderModal(undefined, false)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0F172A] text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            Create Exam Folder
          </button>
          <button
            type="button"
            onClick={() => openCreateFolderModal(undefined, true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Online Exam
          </button>
        </div>
      </div>

      {/* Filter Chrome: Subject Pills + Search + Status + Folder Pills */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Subject Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {subjectPills.map((subj) => (
              <button
                key={subj}
                type="button"
                onClick={() => setSubjectFilter(subj)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  subjectFilter === subj
                    ? 'bg-[#0F172A] text-white border-[#0F172A]'
                    : 'bg-white text-slate-600 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                {subj}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['ALL', 'LIVE', 'DRAFT'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    statusFilter === f ? 'bg-white text-[#0032A0] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f === 'ALL' ? 'All' : f === 'LIVE' ? 'Live' : 'Draft'}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-auto sm:min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, code, folder..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>
        </div>

        {/* Folder Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setFolderFilter('ALL')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              folderFilter === 'ALL'
                ? 'bg-[#0032A0] text-white border-[#0032A0]'
                : 'bg-slate-50 text-slate-700 border-[#E2E8F0] hover:bg-slate-100'
            }`}
          >
            All Folders ({exams.length})
          </button>
          {folderSummaries.map(([fName, fExams]) => (
            <button
              key={fName}
              type="button"
              onClick={() => setFolderFilter(fName)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                folderFilter === fName
                  ? 'bg-[#0032A0] text-white border-[#0032A0]'
                  : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
              }`}
            >
              <Folder className="w-3 h-3" />
              {fName} ({fExams.length})
            </button>
          ))}
        </div>
      </div>

      {/* Folder-Grouped Exam Cards (Matches Screenshot 1 Background List) */}
      {groupedFilteredExams.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center">
          <Folder className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-display font-bold text-base text-[#0F172A]">No Exam Folders Found</p>
          <p className="text-xs text-slate-500 mt-1">
            Click &ldquo;Create Exam Folder&rdquo; to create your first folder and add questions directly.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedFilteredExams.map(([fName, fExams]) => {
            const firstExam = fExams[0];
            return (
              <div key={fName} className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
                {/* Folder Header */}
                <div className="px-5 py-3.5 bg-slate-50/80 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-[#0032A0]" />
                      <h2 className="font-display font-bold text-base text-[#0F172A]">{fName}</h2>
                      <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-white border border-[#E2E8F0] rounded text-slate-600">
                        {fExams.length} {fExams.length === 1 ? 'Exam' : 'Exams'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {firstExam?.subject || 'Mathematics'} · {firstExam?.examTag || firstExam?.target}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreateFolderModal(fName, true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white text-[#0032A0] hover:bg-blue-50 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Paper to Folder
                  </button>
                </div>

                {/* Exams Inside Folder */}
                <div className="divide-y divide-slate-100">
                  {fExams.map((ex) => (
                    <div
                      key={ex.id}
                      className="px-5 py-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500">
                          <span className="font-bold text-[#0032A0]">{ex.code}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-slate-700">{ex.subject || 'Mathematics'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{ex.classLevel}</span>
                          <span aria-hidden="true">·</span>
                          <span>{ex.examTag || ex.target}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {ex.durationMinutes} min · {ex.totalMarks} Marks
                          </span>
                          {ex.webcamEnabled && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-[#0032A0] rounded text-[10px]">
                              Webcam
                            </span>
                          )}
                          {ex.randomizeQuestions && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                              Randomized
                            </span>
                          )}
                        </div>
                        <h3 className="font-display font-bold text-sm sm:text-base text-[#0F172A] truncate">
                          {ex.title}
                        </h3>
                      </div>

                      {/* Action Buttons Bar (Matches Screenshot 1) */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditExamModal(ex, 'questions')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-slate-700 rounded-lg"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#0032A0]" />
                          Questions ({ex.questionCount || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => openQuestionBuilderForExam(ex)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-blue-50 text-[#0032A0] rounded-lg"
                          title="Add Question directly"
                        >
                          <Plus className="w-3.5 h-3.5" />Q
                        </button>
                        <button
                          type="button"
                          onClick={() => shareExamLink(ex)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-slate-700 rounded-lg"
                        >
                          <Share2 className="w-3.5 h-3.5 text-slate-500" />
                          Share
                        </button>
                        <button
                          type="button"
                          onClick={() => setCbtTestExam(ex)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Start CBT
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const next = ex.status === 'LIVE' ? 'DRAFT' : 'LIVE';
                            await toggleExamStatus(ex.id, next);
                            pushToast(`"${ex.title}" is now ${next}.`);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border ${
                            ex.status === 'LIVE'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <Globe className="w-3 h-3" />
                          {ex.status === 'LIVE' ? 'Live' : 'Draft'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditExamModal(ex, 'info')}
                          className="p-1.5 text-slate-500 hover:text-[#0032A0] hover:bg-slate-100 rounded-lg border border-transparent hover:border-[#E2E8F0]"
                          title="Edit Folder & Exam Settings"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditExamModal(ex, 'students')}
                          className="p-1.5 text-slate-500 hover:text-[#0032A0] hover:bg-slate-100 rounded-lg border border-transparent hover:border-[#E2E8F0]"
                          title="Assign Students & Batches"
                        >
                          <Users className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClone(ex)}
                          className="p-1.5 text-slate-500 hover:text-[#0032A0] hover:bg-slate-100 rounded-lg border border-transparent hover:border-[#E2E8F0]"
                          title="Clone Exam"
                        >
                          <Layers className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalyticsExam(ex)}
                          className="p-1.5 text-slate-500 hover:text-[#0032A0] hover:bg-slate-100 rounded-lg border border-transparent hover:border-[#E2E8F0]"
                          title="Analytics"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteExamCompletely(ex.id);
                            pushToast(`Deleted exam "${ex.title}".`);
                          }}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200"
                          title="Delete Exam"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          MODAL 1: Create / Edit Exam Folder (Matches Screenshot 1)
         ===================================================================== */}
      {folderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#E2E8F0] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <FolderPlus className="w-5 h-5 text-[#0032A0] shrink-0" />
                <h2 className="font-display font-bold text-base text-[#0F172A] truncate">{folderModalTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg shrink-0"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3 Tabs: Folder Info | Questions (N) | Students (Class) */}
            <div className="flex items-center gap-4 sm:gap-6 px-4 sm:px-6 border-b border-[#E2E8F0] bg-slate-50/50 shrink-0 overflow-x-auto whitespace-nowrap">
              <button
                type="button"
                onClick={() => setFolderModalTab('info')}
                className={`inline-flex items-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  folderModalTab === 'info'
                    ? 'border-[#0032A0] text-[#0032A0]'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                Folder Info
              </button>
              <button
                type="button"
                onClick={() => setFolderModalTab('questions')}
                className={`inline-flex items-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  folderModalTab === 'questions'
                    ? 'border-[#0032A0] text-[#0032A0]'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Questions ({editingExam ? examQuestions.length : 0})
              </button>
              <button
                type="button"
                onClick={() => setFolderModalTab('students')}
                className={`inline-flex items-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  folderModalTab === 'students'
                    ? 'border-[#0032A0] text-[#0032A0]'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Students ({classLabelForModal})
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
              {/* TAB 1: FOLDER INFO */}
              {folderModalTab === 'info' && (
                <form id="exam-folder-form" onSubmit={handleSaveFolderOrExam} className="space-y-4">
                  {!editingExam && showAdvancedModePicker && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                      {[
                        { id: 'blank', label: '1. Blank Paper' },
                        { id: 'copy', label: '2. Copy Previous Exam' },
                        { id: 'bank', label: '3. Import From Bank' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setCreateMode(m.id as typeof createMode)}
                          className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                            createMode === m.id ? 'bg-white text-[#0032A0] shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {!editingExam && createMode === 'copy' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Source Exam to Copy
                      </label>
                      <select
                        required
                        value={sourceExamId}
                        onChange={(e) => setSourceExamId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                      >
                        <option value="">Select source exam...</option>
                        {exams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            [{ex.code}] {ex.title} — {ex.questionCount || 0} Qs
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Row 1: Folder Name * & Exam Name * */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Folder Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        placeholder="e.g. 11th JEE Maths Paper 1"
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Exam Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Class 11th Mock Test"
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>

                  {/* Row 2: Class / Section & Exam Tag */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Class / Section
                      </label>
                      <select
                        value={classLevel}
                        onChange={(e) => setClassLevel(e.target.value as typeof classLevel)}
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#2563EB]"
                      >
                        <option value="Class 11th">11th Standard</option>
                        <option value="Class 12th">12th Standard</option>
                        <option value="All Classes">All Classes</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Exam Tag
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {EXAM_TAG_PRESETS.map((preset) => {
                          const active = selectedPresetLabel === preset.label;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => handleSelectTagPreset(preset)}
                              className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors text-center ${
                                active
                                  ? 'bg-[#0032A0] text-white border-[#0032A0]'
                                  : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Subject, Passing marks, Duration */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Subject
                      </label>
                      <select
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#2563EB]"
                      >
                        {SUBJECT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Passing marks
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={passingMarks}
                        onChange={(e) => setPassingMarks(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg font-mono focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Duration (mins)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg font-mono focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>

                  {/* Row 4: Toggles (Publish, Webcam, Randomize) + Exam Code pill */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                    <div className="flex flex-wrap items-center gap-5">
                      <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={publishImmediate}
                          onClick={() => setPublishImmediate((v) => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                            publishImmediate ? 'bg-[#0032A0]' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                              publishImmediate ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <span className="text-xs font-semibold text-[#0F172A]">Publish</span>
                      </label>

                      <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={webcamEnabled}
                          onClick={() => setWebcamEnabled((v) => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                            webcamEnabled ? 'bg-[#0032A0]' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                              webcamEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <span className="text-xs font-semibold text-[#0F172A]">Webcam</span>
                      </label>

                      <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={randomizeQuestions}
                          onClick={() => setRandomizeQuestions((v) => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                            randomizeQuestions ? 'bg-[#0032A0]' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                              randomizeQuestions ? 'translate-x-4.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <span className="text-xs font-semibold text-[#0F172A]">Randomize</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500">
                      <span>Code:</span>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-24 px-2 py-1 text-xs font-mono border border-[#E2E8F0] rounded bg-slate-50 text-[#0032A0] font-semibold"
                      />
                    </div>
                  </div>

                  {/* Row 5: Bank selection if Import mode */}
                  {!editingExam && createMode === 'bank' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Select Questions from Question Bank ({selectedBankIds.length} selected)
                      </label>
                      <div className="max-h-40 overflow-y-auto border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
                        {bankQuestions.map((q) => (
                          <label key={q.id} className="flex items-start gap-2.5 p-2.5 text-xs cursor-pointer hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selectedBankIds.includes(q.id)}
                              onChange={() =>
                                setSelectedBankIds((prev) =>
                                  prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                                )
                              }
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0F172A]">{q.title}</p>
                              <p className="font-mono text-slate-500">
                                {q.classLevel} · {q.examCategory} · +{q.positiveMarks}/-{q.negativeMarks}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Row 6: Instructions */}
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                      Instructions
                    </label>
                    <textarea
                      rows={2}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  {/* Row 7: Start at & End at */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Start at (optional — opens)
                      </label>
                      <input
                        type="datetime-local"
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        End at (optional — window closes)
                      </label>
                      <input
                        type="datetime-local"
                        value={endAt}
                        onChange={(e) => setEndAt(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>
                </form>
              )}

              {/* TAB 2: QUESTIONS (N) */}
              {folderModalTab === 'questions' && (
                <div className="space-y-4">
                  {!editingExam ? (
                    <div className="border border-dashed border-[#E2E8F0] rounded-xl p-8 text-center space-y-2">
                      <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-sm font-semibold text-[#0F172A]">Save Folder First to Add Questions</p>
                      <p className="text-xs text-slate-500">
                        Click &ldquo;Create Folder &rarr; Add Questions&rdquo; below to create this exam folder and immediately open the Q1 Question Builder.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openQuestionBuilderForExam(editingExam)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Question [Q{examQuestions.length + 1}]
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuestionSubView(questionSubView === 'import-bank' ? 'list' : 'import-bank')}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border ${
                              questionSubView === 'import-bank'
                                ? 'bg-blue-50 border-[#0032A0] text-[#0032A0]'
                                : 'border-[#E2E8F0] text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Database className="w-3.5 h-3.5" />
                            Import from Bank
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuestionSubView(questionSubView === 'ocr' ? 'list' : 'ocr')}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border ${
                              questionSubView === 'ocr'
                                ? 'bg-blue-50 border-[#0032A0] text-[#0032A0]'
                                : 'border-[#E2E8F0] text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <ScanText className="w-3.5 h-3.5" />
                            PDF / Image OCR
                          </button>
                        </div>

                        <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50">
                          <Upload className="w-3.5 h-3.5 text-[#0032A0]" />
                          {uploadingPdf ? 'Uploading PDF...' : editingExam.pdfUrl ? 'Replace PDF' : 'Upload Exam PDF'}
                          <input type="file" accept="application/pdf" onChange={handleUploadExamPdf} className="hidden" />
                        </label>
                      </div>

                      {questionSubView === 'import-bank' && (
                        <div className="space-y-3 border border-[#E2E8F0] rounded-xl p-4">
                          <div className="max-h-60 overflow-y-auto divide-y divide-[#E2E8F0]">
                            {bankQuestions.map((q) => (
                              <label key={q.id} className="flex items-start gap-3 p-2.5 text-xs cursor-pointer hover:bg-slate-50">
                                <input
                                  type="checkbox"
                                  checked={selectedBankIds.includes(q.id)}
                                  onChange={() =>
                                    setSelectedBankIds((prev) =>
                                      prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                                    )
                                  }
                                />
                                <div>
                                  <p className="font-semibold text-[#0F172A]">{q.title}</p>
                                  <MathText text={q.questionText} className="text-slate-600" />
                                </div>
                              </label>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={selectedBankIds.length === 0}
                            onClick={async () => {
                              const chosen = bankQuestions.filter((q) => selectedBankIds.includes(q.id));
                              await importBankQuestionsIntoExam(editingExam, chosen);
                              pushToast(`Imported ${chosen.length} questions from Bank.`);
                              setSelectedBankIds([]);
                              setQuestionSubView('list');
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg disabled:opacity-50"
                          >
                            <Database className="w-3.5 h-3.5" />
                            Import {selectedBankIds.length} Selected
                          </button>
                        </div>
                      )}

                      {questionSubView === 'ocr' && (
                        <div className="space-y-3 border border-[#E2E8F0] rounded-xl p-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => setOcrFile(e.target.files?.[0] || null)}
                              className="text-xs"
                            />
                            <button
                              type="button"
                              disabled={!ocrFile || ocrLoading}
                              onClick={handleRunExamOCR}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg disabled:opacity-50"
                            >
                              <ScanText className="w-4 h-4" />
                              {ocrLoading ? 'Extracting...' : 'Extract Math Questions'}
                            </button>
                          </div>
                          {ocrDrafts.length > 0 && (
                            <div className="space-y-2 pt-2">
                              <p className="text-xs font-semibold text-emerald-700">
                                Extracted {ocrDrafts.length} questions. Review and click Save to Paper:
                              </p>
                              {ocrDrafts.map((d, i) => (
                                <div key={i} className="p-2.5 bg-slate-50 border border-[#E2E8F0] rounded text-xs">
                                  <MathText text={d.questionText || ''} />
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={handleCommitExamOCR}
                                className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg"
                              >
                                Save All to Exam Paper
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {questionSubView === 'list' && (
                        <div className="space-y-3">
                          {examQuestions.length === 0 ? (
                            <div className="border border-dashed border-[#E2E8F0] rounded-xl p-8 text-center text-xs text-slate-500">
                              No questions added yet. Click &ldquo;Add Question [Q1]&rdquo; above to type or paste a screenshot!
                            </div>
                          ) : (
                            examQuestions.map((q, idx) => (
                              <div key={q.id} className="border border-[#E2E8F0] rounded-lg p-4 space-y-2">
                                <div className="flex items-center justify-between gap-2 text-xs font-mono">
                                  <span className="font-bold text-[#0032A0]">
                                    Q{idx + 1} · {q.subject || editingExam.subject || 'Mathematics'} · {q.questionType} · +{q.positiveMarks}/-{q.negativeMarks}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteExamQuestion(q)}
                                    className="text-red-600 hover:bg-red-50 p-1 rounded"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                                {q.questionText && (
                                  <div className="text-sm text-slate-800">
                                    <MathText text={q.questionText} />
                                  </div>
                                )}
                                {q.questionImageUrl && (
                                  <img
                                    src={q.questionImageUrl}
                                    alt={`Question ${idx + 1}`}
                                    className="max-h-40 rounded-lg border border-[#E2E8F0]"
                                  />
                                )}
                                <p className="text-xs font-mono text-emerald-700 font-semibold">
                                  Answer Key: {q.correctAnswer}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: STUDENTS (Class) */}
              {folderModalTab === 'students' && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-slate-50 border border-[#E2E8F0] rounded-lg flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#0F172A]">Open to all {classLabelForModal} students</p>
                      <p className="text-[11px] text-slate-500">
                        {matchingClassStudents.length} registered students currently match {classLabelForModal}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="h-4 w-4 accent-[#0032A0]"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#0F172A] mb-2">Assign Specific Batches</p>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {batches.length === 0 ? (
                        <p className="text-xs text-slate-500">No batches created yet.</p>
                      ) : (
                        batches.map((b) => (
                          <label key={b.id} className="flex items-center justify-between gap-2 p-2.5 border border-[#E2E8F0] rounded-lg text-xs cursor-pointer hover:bg-slate-50">
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={folderAssignedBatches.includes(b.id)}
                                onChange={() =>
                                  setFolderAssignedBatches((prev) =>
                                    prev.includes(b.id) ? prev.filter((id) => id !== b.id) : [...prev, b.id]
                                  )
                                }
                              />
                              <span className="font-semibold text-[#0F172A]">{b.name}</span>
                            </div>
                            <span className="font-mono text-slate-500">{b.classLevel}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  {editingExam && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveBatchAssignmentsInModal}
                        className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                      >
                        Save Student Access
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-[#E2E8F0] bg-slate-50/70 shrink-0">
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              {folderModalTab === 'info' && (
                <button
                  type="submit"
                  form="exam-folder-form"
                  disabled={folderSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-60"
                >
                  <FolderPlus className="w-4 h-4" />
                  {folderSaving
                    ? 'Saving...'
                    : editingExam
                    ? 'Save Changes'
                    : createMode === 'blank'
                    ? 'Create Folder \u2192 Add Questions'
                    : 'Create Exam'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: Create Question [Q1] (Matches Screenshot 2)
         ===================================================================== */}
      {questionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#E2E8F0] shrink-0">
              <div className="flex items-center gap-2.5">
                <h2 className="font-display font-bold text-base text-[#0F172A]">Create Question</h2>
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-[#0032A0] text-white rounded">
                  Q{qTargetExamQuestionsCount + 1}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQuestionModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                aria-label="Close question builder"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
              {/* Top 3-column Assignment Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-semibold text-[#0032A0] mb-1">
                    Assign to Exam Folder / Paper <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={qTargetExamId}
                    onChange={(e) => handleSelectTargetExamInQuestionModal(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#2563EB]"
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        [{ex.code}] {ex.title} — {ex.classLevel} ({ex.folderName || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#0032A0] mb-1">
                    Target Class <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={qClassLevel}
                    onChange={(e) => setQClassLevel(e.target.value as typeof qClassLevel)}
                    className="w-full px-2.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="Class 11th">Class 11th</option>
                    <option value="Class 12th">Class 12th</option>
                    <option value="All Classes">All Classes</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#0032A0] mb-1">
                    Subject
                  </label>
                  <select
                    value={qSubject}
                    onChange={(e) => setQSubject(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#2563EB]"
                  >
                    {QUESTION_SUBJECT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Question text */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Question text (optional if problem is in image)
                </label>
                <textarea
                  rows={2}
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  placeholder="Type the question (or upload an image below)"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              {/* Question Image / Diagram Dropzone + Ctrl+V */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Question Image / Diagram
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setQDragOver(true);
                  }}
                  onDragLeave={() => setQDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setQDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleUploadQuestionImageFile(file);
                  }}
                  className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                    qDragOver
                      ? 'border-[#0032A0] bg-blue-50/50'
                      : 'border-[#CBD5E1] hover:border-[#2563EB] bg-white'
                  }`}
                >
                  {qUploadingImage ? (
                    <p className="text-xs font-mono text-[#0032A0]">Uploading image...</p>
                  ) : qImageUrl ? (
                    <div className="space-y-3">
                      <img
                        src={qImageUrl}
                        alt="Question Diagram Preview"
                        className="max-h-44 mx-auto rounded-lg border border-[#E2E8F0] object-contain"
                      />
                      <div className="flex items-center justify-center gap-3 text-xs">
                        <label className="font-semibold text-[#0032A0] underline cursor-pointer">
                          Replace image
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleUploadQuestionImageFile(file);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setQImageUrl('')}
                          className="font-semibold text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Upload className="w-5 h-5 text-[#2563EB] mx-auto" />
                      <p className="text-xs text-slate-600">
                        Drag &amp; drop or{' '}
                        <label className="text-[#0032A0] font-semibold underline cursor-pointer">
                          browse question image (PNG, JPG, JPEG, WebP)
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleUploadQuestionImageFile(file);
                            }}
                          />
                        </label>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Tip: You can also press Ctrl+V anywhere inside this dialog to paste a screenshot.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Question Type */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Question type
                </label>
                <select
                  value={qType}
                  onChange={(e) => {
                    const nextType = e.target.value as QuestionType;
                    setQType(nextType);
                    if (nextType === 'NUMERICAL' || nextType === 'INTEGER') {
                      setQCorrectAnswer('');
                    } else if (!['A', 'B', 'C', 'D'].includes(qCorrectAnswer)) {
                      setQCorrectAnswer('A');
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="SINGLE_MCQ">MCQ — Single</option>
                  <option value="MULTI_MCQ">MCQ — Multiple</option>
                  <option value="NUMERICAL">Numerical</option>
                  <option value="INTEGER">Integer</option>
                  <option value="IMAGE_BASED">Image Based</option>
                </select>
              </div>

              {/* Correct Answer Key */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#0F172A]">Correct Answer Key</label>
                  {(qType === 'SINGLE_MCQ' || qType === 'MULTI_MCQ' || qType === 'IMAGE_BASED') && (
                    <button
                      type="button"
                      onClick={() => setShowOptionTexts((v) => !v)}
                      className="text-xs font-semibold text-[#0032A0] hover:underline"
                    >
                      {showOptionTexts ? 'Hide Option Text' : '+ Edit Option Text (Optional)'}
                    </button>
                  )}
                </div>

                {qType === 'SINGLE_MCQ' || qType === 'MULTI_MCQ' || qType === 'IMAGE_BASED' ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                        const selected =
                          qType === 'MULTI_MCQ'
                            ? qCorrectAnswer
                                .split(',')
                                .map((s) => s.trim())
                                .includes(letter)
                            : qCorrectAnswer === letter;
                        return (
                          <button
                            key={letter}
                            type="button"
                            onClick={() => toggleAnswerKeyOption(letter)}
                            className={`py-2.5 rounded-lg border font-display font-bold text-sm transition-colors ${
                              selected
                                ? 'bg-[#0032A0] text-white border-[#0032A0]'
                                : 'bg-white text-[#0F172A] border-[#E2E8F0] hover:bg-slate-50'
                            }`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>

                    {showOptionTexts && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {qOptions.map((opt, idx) => (
                          <input
                            key={opt.id}
                            type="text"
                            value={opt.text}
                            onChange={(e) => {
                              const next = [...qOptions];
                              next[idx] = { ...opt, text: e.target.value };
                              setQOptions(next);
                            }}
                            placeholder={`Option ${opt.id} text (optional, KaTeX supported)`}
                            className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    value={qCorrectAnswer}
                    onChange={(e) => setQCorrectAnswer(e.target.value)}
                    placeholder={`Enter exact ${qType === 'INTEGER' ? 'integer' : 'numerical'} answer key`}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                  />
                )}
              </div>

              {/* Marks (+) & Negative (-) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">Marks (+)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={qPosMarks}
                    onChange={(e) => setQPosMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">Negative (-)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.25"
                    value={qNegMarks}
                    onChange={(e) => setQNegMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {qError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {qError}
                </div>
              )}
            </div>

            {/* Footer Action Buttons (Matches Screenshot 2) */}
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 sm:px-6 py-3.5 border-t border-[#E2E8F0] bg-slate-50/70 shrink-0">
              <button
                type="button"
                disabled={qSaving || qUploadingImage}
                onClick={handleQuestionSave}
                className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-slate-700 rounded-lg disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                disabled={qSaving || qUploadingImage}
                onClick={handleQuestionSaveAndNext}
                className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#0F172A] rounded-lg disabled:opacity-50"
              >
                + Save &amp; Add Next
              </button>
              <button
                type="button"
                disabled={qSaving || qUploadingImage}
                onClick={handleQuestionFinishAndShare}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#059669] hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
              >
                <Share2 className="w-3.5 h-3.5" />
                Finish &amp; Share Link
              </button>
              <button
                type="button"
                disabled={qSaving || qUploadingImage}
                onClick={handleQuestionFinish}
                className="px-5 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-50"
              >
                Finish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exam Analytics Modal */}
      {analyticsExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-display font-bold text-base">Analytics — {analyticsExam.title}</h3>
              <button type="button" onClick={() => setAnalyticsExam(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            {(() => {
              const exAttempts = attempts.filter((a) => a.examId === analyticsExam.id);
              const avgScore =
                exAttempts.length > 0
                  ? Math.round(
                      (exAttempts.reduce((acc, a) => acc + Number(a.finalScore ?? a.autoScore ?? 0), 0) /
                        exAttempts.length) *
                        10
                    ) / 10
                  : 0;
              const topScore =
                exAttempts.length > 0
                  ? Math.max(...exAttempts.map((a) => Number(a.finalScore ?? a.autoScore ?? 0)))
                  : 0;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg">
                    <p className="text-[11px] font-mono text-slate-500">ATTEMPTS</p>
                    <p className="font-mono text-xl font-bold text-[#0F172A]">{exAttempts.length}</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg">
                    <p className="text-[11px] font-mono text-slate-500">AVG SCORE</p>
                    <p className="font-mono text-xl font-bold text-[#0032A0]">{avgScore}</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg">
                    <p className="text-[11px] font-mono text-slate-500">TOP SCORE</p>
                    <p className="font-mono text-xl font-bold text-emerald-700">{topScore}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Share Online Examination to Students Modal */}
      {shareModalExam && (
        <ShareExamModal
          exam={shareModalExam}
          instituteName={tenantContext?.instituteName || settings.instituteName}
          tenantContext={tenantContext}
          onClose={() => setShareModalExam(null)}
          onTestCbt={(targetEx) => setCbtTestExam(targetEx)}
          onCopied={(msg) => pushToast(msg)}
        />
      )}

      {/* Bottom-Right Stacked Toast Notifications (Matches Screenshot 2) */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[70] flex flex-col gap-2 sm:w-full sm:max-w-sm pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto bg-[#0F172A] text-white border border-slate-700 rounded-lg px-4 py-3 shadow-lg flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 ${
                    t.variant === 'error' ? 'text-red-400' : 'text-emerald-400'
                  }`}
                />
                <span className="truncate font-medium">{t.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="text-slate-400 hover:text-white shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
