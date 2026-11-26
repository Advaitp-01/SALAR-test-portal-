import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc, writeBatch } from '../../lib/tenantDb';
import {
  Check,
  Database,
  Edit2,
  Eye,
  FileUp,
  FolderPlus,
  Image as ImageIcon,
  Plus,
  ScanText,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { extractMathQuestionsWithOCR, uploadFileToServer } from '../../lib/portalService';
import { MathText } from '../MathText';
import type { Question, QuestionFolder, QuestionOption, QuestionType } from '../../types/portal';

const MATH_SNIPPETS = [
  { label: '√', insert: '\\sqrt{}' },
  { label: 'π', insert: '\\pi' },
  { label: '∫', insert: '\\int_{0}^{1} ' },
  { label: 'Σ', insert: '\\sum_{n=1}^{\\infty} ' },
  { label: '∞', insert: '\\infty' },
  { label: 'θ', insert: '\\theta' },
  { label: 'α', insert: '\\alpha' },
  { label: 'β', insert: '\\beta' },
  { label: 'a/b', insert: '\\frac{a}{b}' },
  { label: 'xⁿ', insert: 'x^{n}' },
  { label: 'Matrix', insert: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
];

export const QuestionBankView: React.FC = () => {
  const [folders, setFolders] = useState<QuestionFolder[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [selectedFolderId, setSelectedFolderId] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [catFilter, setCatFilter] = useState('ALL');
  const [diffFilter, setDiffFilter] = useState('ALL');

  // Modals
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderClass, setFolderClass] = useState('Class 12th');
  const [folderChapter, setFolderChapter] = useState('');

  const [qModal, setQModal] = useState(false);
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [previewQ, setPreviewQ] = useState<Question | null>(null);

  // OCR & Bulk Import
  const [ocrModal, setOcrModal] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrRawText, setOcrRawText] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrDrafts, setOcrDrafts] = useState<Array<Partial<Question>>>([]);

  const [bulkModal, setBulkModal] = useState(false);
  const [bulkJson, setBulkJson] = useState('');
  const [answerKeyText, setAnswerKeyText] = useState('');
  const [bulkError, setBulkError] = useState('');

  // Question form state
  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [questionImageUrl, setQuestionImageUrl] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('SINGLE_MCQ');
  const [options, setOptions] = useState<QuestionOption[]>([
    { id: 'A', text: '' },
    { id: 'B', text: '' },
    { id: 'C', text: '' },
    { id: 'D', text: '' },
  ]);
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [explanation, setExplanation] = useState('');
  const [positiveMarks, setPositiveMarks] = useState(4);
  const [negativeMarks, setNegativeMarks] = useState(1);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [classLevel, setClassLevel] = useState<'Class 11th' | 'Class 12th'>('Class 12th');
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [examCategory, setExamCategory] = useState<'JEE Main' | 'JEE Advanced' | 'MHT-CET'>('JEE Main');
  const [qFolderId, setQFolderId] = useState('');
  const [uploadingImg, setUploadingImg] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'questionFolders'),
      (snap) => setFolders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuestionFolder, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'questionFolders')
    );
    const u2 = onSnapshot(
      collection(db, 'questions'),
      (snap) => setQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Question, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'questions')
    );
    return () => {
      u1();
      u2();
    };
  }, []);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (selectedFolderId !== 'ALL' && q.folderId !== selectedFolderId) return false;
      if (classFilter !== 'ALL' && q.classLevel !== classFilter) return false;
      if (catFilter !== 'ALL' && q.examCategory !== catFilter) return false;
      if (diffFilter !== 'ALL' && q.difficulty !== diffFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          q.title.toLowerCase().includes(s) ||
          q.questionText.toLowerCase().includes(s) ||
          (q.chapter || '').toLowerCase().includes(s) ||
          (q.topic || '').toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [questions, selectedFolderId, classFilter, catFilter, diffFilter, search]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    try {
      await addDoc(collection(db, 'questionFolders'), {
        name: folderName.trim(),
        classLevel: folderClass,
        chapter: folderChapter.trim(),
        examCategory: 'JEE Main',
        createdAt: new Date().toISOString(),
      });
      setFolderName('');
      setFolderChapter('');
      setFolderModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'questionFolders');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'questionFolders', id));
      if (selectedFolderId === id) setSelectedFolderId('ALL');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `questionFolders/${id}`);
    }
  };

  const openAddQuestion = () => {
    setEditingQ(null);
    setTitle('');
    setQuestionText('');
    setQuestionImageUrl('');
    setQuestionType('SINGLE_MCQ');
    setOptions([
      { id: 'A', text: '' },
      { id: 'B', text: '' },
      { id: 'C', text: '' },
      { id: 'D', text: '' },
    ]);
    setCorrectAnswer('A');
    setExplanation('');
    setPositiveMarks(4);
    setNegativeMarks(1);
    setDifficulty('MEDIUM');
    setClassLevel('Class 12th');
    setChapter('');
    setTopic('');
    setExamCategory('JEE Main');
    setQFolderId(selectedFolderId === 'ALL' ? '' : selectedFolderId);
    setQModal(true);
  };

  const openEditQuestion = (q: Question) => {
    setEditingQ(q);
    setTitle(q.title);
    setQuestionText(q.questionText);
    setQuestionImageUrl(q.questionImageUrl || '');
    setQuestionType(q.questionType);
    setOptions(
      q.options && q.options.length > 0
        ? q.options
        : [
            { id: 'A', text: '' },
            { id: 'B', text: '' },
            { id: 'C', text: '' },
            { id: 'D', text: '' },
          ]
    );
    setCorrectAnswer(q.correctAnswer);
    setExplanation(q.explanation || '');
    setPositiveMarks(q.positiveMarks);
    setNegativeMarks(q.negativeMarks);
    setDifficulty(q.difficulty);
    setClassLevel(q.classLevel);
    setChapter(q.chapter || '');
    setTopic(q.topic || '');
    setExamCategory(q.examCategory);
    setQFolderId(q.folderId || '');
    setQModal(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const res = await uploadFileToServer(file);
      setQuestionImageUrl(res.url);
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const folder = folders.find((f) => f.id === qFolderId);
    const isMcq = questionType === 'SINGLE_MCQ' || questionType === 'MULTI_MCQ' || questionType === 'IMAGE_BASED';
    const payload = {
      folderId: qFolderId || '',
      folderName: folder?.name || 'General',
      title: title.trim() || questionText.slice(0, 80),
      questionText: questionText.trim(),
      questionImageUrl: questionImageUrl.trim(),
      questionType,
      options: isMcq ? options : [],
      correctAnswer: correctAnswer.trim(),
      explanation: explanation.trim(),
      positiveMarks: Number(positiveMarks),
      negativeMarks: Number(negativeMarks),
      difficulty,
      classLevel,
      chapter: chapter.trim(),
      topic: topic.trim(),
      examCategory,
      updatedAt: now,
    };
    try {
      if (editingQ) {
        await updateDoc(doc(db, 'questions', editingQ.id), payload);
      } else {
        await addDoc(collection(db, 'questions'), { ...payload, createdAt: now });
      }
      setQModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'questions');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'questions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `questions/${id}`);
    }
  };

  const insertMathSymbol = (snippet: string) => {
    setQuestionText((prev) => `${prev}${prev.endsWith(' ') || prev === '' ? '' : ' '}$${snippet}$`);
  };

  // OCR Extraction
  const handleRunOCR = async () => {
    setOcrError('');
    setOcrLoading(true);
    try {
      const extracted = await extractMathQuestionsWithOCR({
        file: ocrFile || undefined,
        rawText: ocrRawText,
        defaultClass: classLevel,
        defaultExamCategory: examCategory,
      });
      setOcrDrafts(
        extracted.map((q, idx) => ({
          title: q.title || `Extracted Question ${idx + 1}`,
          questionText: q.questionText || '',
          questionType: (q.questionType as QuestionType) || 'SINGLE_MCQ',
          options: q.options || [],
          correctAnswer: q.correctAnswer || '',
          explanation: q.explanation || '',
          difficulty: (q.difficulty as 'EASY' | 'MEDIUM' | 'HARD') || 'MEDIUM',
          chapter: q.chapter || '',
          topic: q.topic || '',
          positiveMarks: q.positiveMarks ?? 4,
          negativeMarks: q.negativeMarks ?? 1,
          classLevel,
          examCategory,
        }))
      );
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'OCR extraction failed.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleCommitOcrDrafts = async () => {
    if (ocrDrafts.length === 0) return;
    const now = new Date().toISOString();
    const folder = folders.find((f) => f.id === selectedFolderId);
    const batch = writeBatch(db);
    ocrDrafts.forEach((d) => {
      batch.set(doc(collection(db, 'questions')), {
        folderId: selectedFolderId === 'ALL' ? '' : selectedFolderId,
        folderName: folder?.name || 'OCR Imported',
        title: d.title || 'Mathematics Question',
        questionText: d.questionText || '',
        questionImageUrl: '',
        questionType: d.questionType || 'SINGLE_MCQ',
        options: d.options || [],
        correctAnswer: d.correctAnswer || '',
        explanation: d.explanation || '',
        positiveMarks: Number(d.positiveMarks ?? 4),
        negativeMarks: Number(d.negativeMarks ?? 1),
        difficulty: d.difficulty || 'MEDIUM',
        classLevel: (d.classLevel as 'Class 11th' | 'Class 12th') || 'Class 12th',
        chapter: d.chapter || '',
        topic: d.topic || '',
        examCategory: (d.examCategory as 'JEE Main' | 'JEE Advanced' | 'MHT-CET') || 'JEE Main',
        createdAt: now,
        updatedAt: now,
      });
    });
    await batch.commit();
    setOcrDrafts([]);
    setOcrModal(false);
  };

  // Bulk JSON + Answer Key Import
  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError('');
    try {
      const parsed = JSON.parse(bulkJson);
      if (!Array.isArray(parsed)) {
        setBulkError('Bulk JSON must be an array of question objects.');
        return;
      }
      // Optional answer key map e.g. "1:A, 2:B, 3:42"
      const keyMap = new Map<number, string>();
      if (answerKeyText.trim()) {
        answerKeyText.split(/[\n,]+/).forEach((pair) => {
          const [idxStr, ans] = pair.split(/[:=\-]/).map((s) => s.trim());
          const idx = Number(idxStr);
          if (!Number.isNaN(idx) && ans) keyMap.set(idx, ans);
        });
      }

      const now = new Date().toISOString();
      const batch = writeBatch(db);
      parsed.forEach((item: Partial<Question>, idx: number) => {
        const ref = doc(collection(db, 'questions'));
        batch.set(ref, {
          folderId: selectedFolderId === 'ALL' ? '' : selectedFolderId,
          folderName: 'Bulk Imported',
          title: item.title || `Question ${idx + 1}`,
          questionText: item.questionText || '',
          questionImageUrl: item.questionImageUrl || '',
          questionType: item.questionType || 'SINGLE_MCQ',
          options: item.options || [],
          correctAnswer: keyMap.get(idx + 1) || item.correctAnswer || 'A',
          explanation: item.explanation || '',
          positiveMarks: Number(item.positiveMarks ?? 4),
          negativeMarks: Number(item.negativeMarks ?? 1),
          difficulty: item.difficulty || 'MEDIUM',
          classLevel: item.classLevel || 'Class 12th',
          chapter: item.chapter || '',
          topic: item.topic || '',
          examCategory: item.examCategory || 'JEE Main',
          createdAt: now,
          updatedAt: now,
        });
      });
      await batch.commit();
      setBulkJson('');
      setAnswerKeyText('');
      setBulkModal(false);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Invalid JSON format.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Mathematics Question Bank</h1>
          <p className="text-sm text-slate-500">
            KaTeX-ready JEE Main, JEE Advanced &amp; MHT-CET problem repository with AI Mathematical OCR
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFolderModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-slate-700 rounded-lg"
          >
            <FolderPlus className="w-4 h-4" />
            New Folder
          </button>
          <button
            type="button"
            onClick={() => setBulkModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-slate-700 rounded-lg"
          >
            <FileUp className="w-4 h-4" />
            Bulk / Key Import
          </button>
          <button
            type="button"
            onClick={() => setOcrModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#0032A0] rounded-lg"
          >
            <ScanText className="w-4 h-4" />
            PDF / Image Math OCR
          </button>
          <button
            type="button"
            onClick={openAddQuestion}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Add Question
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Folder Sidebar */}
        <aside className="lg:col-span-3 bg-white border border-[#E2E8F0] rounded-xl p-4 h-fit space-y-2">
          <p className="text-xs font-mono font-semibold text-slate-500 uppercase px-2 mb-2">Folders</p>
          <button
            type="button"
            onClick={() => setSelectedFolderId('ALL')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              selectedFolderId === 'ALL' ? 'bg-[#0032A0] text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>All Questions</span>
            <span className="font-mono tabular-nums">{questions.length}</span>
          </button>
          {folders.map((f) => {
            const count = questions.filter((q) => q.folderId === f.id).length;
            return (
              <div
                key={f.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                  selectedFolderId === f.id ? 'bg-[#0032A0] text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(f.id)}
                  className="flex-1 text-left font-medium truncate pr-2"
                >
                  {f.name}
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono tabular-nums">{count}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteFolder(f.id)}
                    aria-label={`Delete folder ${f.name}`}
                    className={`p-0.5 rounded ${selectedFolderId === f.id ? 'hover:bg-blue-800' : 'text-slate-400 hover:text-red-600'}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </aside>

        {/* Right Question List & Filters */}
        <div className="lg:col-span-9 space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, equation, chapter, topic..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="ALL">All Classes</option>
              <option value="Class 11th">Class 11th</option>
              <option value="Class 12th">Class 12th</option>
            </select>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="ALL">All Categories</option>
              <option value="JEE Main">JEE Main</option>
              <option value="JEE Advanced">JEE Advanced</option>
              <option value="MHT-CET">MHT-CET</option>
            </select>
            <select
              value={diffFilter}
              onChange={(e) => setDiffFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="ALL">All Difficulty</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
              <Database className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="font-display font-bold text-base text-[#0F172A]">No Questions Found</p>
              <p className="text-xs text-slate-500 mt-1">Create a question manually or run Mathematical OCR extraction.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((q, idx) => (
                <div key={q.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 mb-1">
                        <span className="font-semibold text-[#0032A0]">Q{idx + 1}</span>
                        <span aria-hidden="true">·</span>
                        <span>{q.questionType}</span>
                        <span aria-hidden="true">·</span>
                        <span>{q.classLevel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{q.examCategory}</span>
                        <span aria-hidden="true">·</span>
                        <span>{q.difficulty}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700">+{q.positiveMarks}</span> /{' '}
                        <span className="text-red-600">-{q.negativeMarks}</span>
                      </div>
                      <h3 className="font-display font-bold text-sm text-[#0F172A]">{q.title}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewQ(q)}
                        className="p-1.5 text-slate-600 hover:text-[#0032A0] hover:bg-blue-50 rounded"
                        title="Preview Question"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditQuestion(q)}
                        className="p-1.5 text-slate-600 hover:text-[#0032A0] hover:bg-blue-50 rounded"
                        title="Edit Question"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        title="Delete Question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="text-sm text-slate-800 leading-relaxed">
                    <MathText text={q.questionText} />
                  </div>

                  {q.questionImageUrl && (
                    <img
                      src={q.questionImageUrl}
                      alt={q.title}
                      referrerPolicy="no-referrer"
                      className="max-h-44 rounded-lg border border-[#E2E8F0]"
                    />
                  )}

                  {q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt) => {
                        const isAns = q.correctAnswer
                          .split(',')
                          .map((s) => s.trim().toUpperCase())
                          .includes(opt.id.toUpperCase());
                        return (
                          <div
                            key={opt.id}
                            className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
                              isAns ? 'border-emerald-300 bg-emerald-50/70 text-emerald-950' : 'border-[#E2E8F0] bg-slate-50'
                            }`}
                          >
                            <span className="font-mono font-bold">{opt.id}.</span>
                            <MathText text={opt.text} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="text-xs font-mono text-slate-500 pt-1 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Chapter: {q.chapter || 'General'} {q.topic ? `· ${q.topic}` : ''}
                    </span>
                    <span className="font-semibold text-emerald-700">Answer: {q.correctAnswer}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Folder Modal */}
      {folderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md max-h-[92dvh] overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base">Create Question Folder</h3>
              <button type="button" onClick={() => setFolderModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="space-y-3">
              <input
                type="text"
                required
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Folder name (e.g. Calculus 12th JEE)"
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={folderClass}
                  onChange={(e) => setFolderClass(e.target.value)}
                  className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="Class 11th">Class 11th</option>
                  <option value="Class 12th">Class 12th</option>
                </select>
                <input
                  type="text"
                  value={folderChapter}
                  onChange={(e) => setFolderChapter(e.target.value)}
                  placeholder="Chapter"
                  className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setFolderModal(false)} className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg">
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Question Create/Edit Modal */}
      {qModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-display font-bold text-base text-[#0F172A]">
                {editingQ ? 'Edit Mathematics Question' : 'Add Mathematics Question'}
              </h3>
              <button type="button" onClick={() => setQModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Question Title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Definite Integral Symmetry Problem"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Question Type</label>
                  <select
                    value={questionType}
                    onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="SINGLE_MCQ">Single Correct MCQ</option>
                    <option value="MULTI_MCQ">Multiple Correct MCQ</option>
                    <option value="NUMERICAL">Numerical Answer</option>
                    <option value="INTEGER">Integer Type</option>
                    <option value="IMAGE_BASED">Image-Based Question</option>
                  </select>
                </div>
              </div>

              {/* Math Symbol Toolbar */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Question Text (supports KaTeX $...$ and $$...$$)
                  </label>
                  <div className="flex flex-wrap items-center gap-1">
                    {MATH_SNIPPETS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => insertMathSymbol(s.insert)}
                        className="px-2 py-0.5 text-xs font-mono border border-[#E2E8F0] bg-slate-50 hover:bg-blue-50 hover:text-[#0032A0] rounded"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={4}
                  required
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Enter question prose and LaTeX equations like $\int_0^{\pi/2} \sin x\,dx$"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg font-mono"
                />
                {questionText && (
                  <div className="mt-2 p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg text-sm">
                    <p className="text-[11px] font-mono text-slate-400 uppercase mb-1">Live KaTeX Preview</p>
                    <MathText text={questionText} />
                  </div>
                )}
              </div>

              {/* Question Image Upload */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50">
                  <ImageIcon className="w-4 h-4 text-[#0032A0]" />
                  {uploadingImg ? 'Uploading Image...' : 'Upload Question Diagram / Image'}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
                {questionImageUrl && (
                  <span className="text-xs font-mono text-emerald-700 truncate max-w-xs">{questionImageUrl}</span>
                )}
              </div>

              {/* Options for MCQ / Image-based */}
              {(questionType === 'SINGLE_MCQ' || questionType === 'MULTI_MCQ' || questionType === 'IMAGE_BASED') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {options.map((opt, idx) => (
                    <div key={opt.id}>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Option {opt.id}</label>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const next = [...options];
                          next[idx] = { ...opt, text: e.target.value };
                          setOptions(next);
                        }}
                        placeholder={`Option ${opt.id} text or $LaTeX$`}
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Correct Answer</label>
                  <input
                    type="text"
                    required
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    placeholder={questionType === 'MULTI_MCQ' ? 'A,C' : questionType === 'SINGLE_MCQ' ? 'A' : '42'}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">+ Marks</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={positiveMarks}
                    onChange={(e) => setPositiveMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">- Negative</label>
                  <input
                    type="number"
                    step="0.25"
                    required
                    value={negativeMarks}
                    onChange={(e) => setNegativeMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="EASY">EASY</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HARD">HARD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class</label>
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value as 'Class 11th' | 'Class 12th')}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="Class 11th">Class 11th</option>
                    <option value="Class 12th">Class 12th</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={examCategory}
                    onChange={(e) => setExamCategory(e.target.value as 'JEE Main' | 'JEE Advanced' | 'MHT-CET')}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="JEE Main">JEE Main</option>
                    <option value="JEE Advanced">JEE Advanced</option>
                    <option value="MHT-CET">MHT-CET</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Chapter</label>
                  <input
                    type="text"
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                    placeholder="Integration"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Folder</label>
                  <select
                    value={qFolderId}
                    onChange={(e) => setQFolderId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="">General</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Solution Explanation</label>
                <textarea
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Step-by-step solution..."
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setQModal(false)} className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg">
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mathematical OCR Modal with Review & Correction */}
      {ocrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">
                  Mathematical PDF / Image OCR Extraction
                </h3>
                <p className="text-xs text-slate-500">
                  Preserves √, π, ∫, Σ, ∞, θ, α, β, matrices, fractions &amp; powers. Always review before saving.
                </p>
              </div>
              <button type="button" onClick={() => setOcrModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {ocrError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{ocrError}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Upload Question Paper Image or PDF</label>
                <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 text-center">
                  <Upload className="w-6 h-6 text-[#0032A0] mb-1.5" />
                  <span className="text-xs font-semibold text-slate-700">
                    {ocrFile ? ocrFile.name : 'Select PNG, JPG, WEBP, or PDF'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setOcrFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Or Paste Raw Math Text</label>
                <textarea
                  rows={4}
                  value={ocrRawText}
                  onChange={(e) => setOcrRawText(e.target.value)}
                  placeholder="Paste raw text containing math problems and options..."
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={ocrLoading}
                onClick={handleRunOCR}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a] disabled:opacity-60"
              >
                <ScanText className="w-4 h-4" />
                {ocrLoading ? 'Extracting Equations...' : 'Extract & Preview Questions'}
              </button>
            </div>

            {/* Review & Correction Editor */}
            {ocrDrafts.length > 0 && (
              <div className="space-y-3 border-t border-[#E2E8F0] pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-[#0F172A]">
                    Review Extracted Questions ({ocrDrafts.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleCommitOcrDrafts}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                  >
                    <Check className="w-4 h-4" />
                    Save All to Question Bank
                  </button>
                </div>

                {ocrDrafts.map((draft, idx) => (
                  <div key={idx} className="border border-[#E2E8F0] rounded-lg p-4 space-y-2.5 bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={draft.title || ''}
                        onChange={(e) => {
                          const next = [...ocrDrafts];
                          next[idx] = { ...draft, title: e.target.value };
                          setOcrDrafts(next);
                        }}
                        className="flex-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setOcrDrafts((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-red-600 hover:bg-red-100 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={draft.questionText || ''}
                      onChange={(e) => {
                        const next = [...ocrDrafts];
                        next[idx] = { ...draft, questionText: e.target.value };
                        setOcrDrafts(next);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#E2E8F0] rounded bg-white"
                    />
                    <div className="p-2.5 bg-white border border-[#E2E8F0] rounded text-xs">
                      <span className="font-mono text-[10px] text-slate-400 mr-2">RENDERED:</span>
                      <MathText text={draft.questionText || ''} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <input
                        type="text"
                        value={draft.correctAnswer || ''}
                        onChange={(e) => {
                          const next = [...ocrDrafts];
                          next[idx] = { ...draft, correctAnswer: e.target.value };
                          setOcrDrafts(next);
                        }}
                        placeholder="Answer (e.g. A)"
                        className="px-2.5 py-1.5 border border-[#E2E8F0] rounded bg-white font-mono"
                      />
                      <select
                        value={draft.questionType || 'SINGLE_MCQ'}
                        onChange={(e) => {
                          const next = [...ocrDrafts];
                          next[idx] = { ...draft, questionType: e.target.value as QuestionType };
                          setOcrDrafts(next);
                        }}
                        className="px-2.5 py-1.5 border border-[#E2E8F0] rounded bg-white"
                      >
                        <option value="SINGLE_MCQ">SINGLE_MCQ</option>
                        <option value="MULTI_MCQ">MULTI_MCQ</option>
                        <option value="NUMERICAL">NUMERICAL</option>
                        <option value="INTEGER">INTEGER</option>
                      </select>
                      <input
                        type="text"
                        value={draft.chapter || ''}
                        onChange={(e) => {
                          const next = [...ocrDrafts];
                          next[idx] = { ...draft, chapter: e.target.value };
                          setOcrDrafts(next);
                        }}
                        placeholder="Chapter"
                        className="px-2.5 py-1.5 border border-[#E2E8F0] rounded bg-white"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk & Answer Key Import Modal */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-display font-bold text-base">Bulk Import &amp; Answer Key Mapper</h3>
              <button type="button" onClick={() => setBulkModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            {bulkError && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg">{bulkError}</div>}
            <form onSubmit={handleBulkImport} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Questions JSON Array</label>
                <textarea
                  rows={6}
                  required
                  value={bulkJson}
                  onChange={(e) => setBulkJson(e.target.value)}
                  placeholder='[{"title":"Limit Problem","questionText":"Find $\\lim_{x\\to 0} \\frac{\\sin x}{x}$","questionType":"SINGLE_MCQ","options":[{"id":"A","text":"1"},{"id":"B","text":"0"}],"correctAnswer":"A"}]'
                  className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Optional Answer Key Override (e.g. 1:A, 2:B, 3:42)
                </label>
                <input
                  type="text"
                  value={answerKeyText}
                  onChange={(e) => setAnswerKeyText(e.target.value)}
                  placeholder="1:A, 2:C, 3:0"
                  className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setBulkModal(false)} className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg">
                  Import Questions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewQ && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-display font-bold text-base">{previewQ.title}</h3>
              <button type="button" onClick={() => setPreviewQ(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm leading-relaxed">
              <MathText text={previewQ.questionText} />
            </div>
            {previewQ.explanation && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                <p className="font-semibold text-[#0032A0] mb-1">Explanation:</p>
                <MathText text={previewQ.explanation} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
