import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from '../../lib/tenantDb';
import {
  Check,
  Edit3,
  FileSpreadsheet,
  FolderOpen,
  Link2,
  ListChecks,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { formatCurrencyINR, syncGurukulTestSeriesToFirestore } from '../../lib/portalService';
import type { Exam, TestSeries } from '../../types/portal';

const CATEGORY_OPTIONS: Array<TestSeries['examCategory']> = [
  'IIT-JEE',
  'JEE Main',
  'JEE Advanced',
  'MHT-CET',
  'NEET',
  'G-PAT',
  'Foundation',
  'JEE Main PCMB',
  'JEE Advanced PCMB',
  'MHT-CET PCMB',
  'NEET PCB',
  'PCMB Foundation',
];

export const TestSeriesView: React.FC = () => {
  const [series, setSeries] = useState<TestSeries[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit Test Series Modal (with integrated Assigned Exams picker)
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TestSeries | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('2999');
  const [mockTestCount, setMockTestCount] = useState('25');
  const [classLevel, setClassLevel] = useState('Class 12th');
  const [examCategory, setExamCategory] = useState<TestSeries['examCategory']>('IIT-JEE');
  const [status, setStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED');
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);

  // Inline Assigned Exams search & filters
  const [examSearch, setExamSearch] = useState('');
  const [examClassFilter, setExamClassFilter] = useState('ALL');
  const [examStreamFilter, setExamStreamFilter] = useState('ALL');

  const [saving, setSaving] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'testSeries'),
      (snap) => {
        setSeries(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TestSeries, 'id'>) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    const u2 = onSnapshot(
      collection(db, 'exams'),
      (snap) => {
        setExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) })));
      },
      () => {}
    );
    return () => {
      u1();
      u2();
    };
  }, []);

  const openNew = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setPrice('2999');
    setMockTestCount('25');
    setClassLevel('Class 12th');
    setExamCategory('IIT-JEE');
    setStatus('PUBLISHED');
    setSelectedExamIds([]);
    setExamSearch('');
    setExamClassFilter('ALL');
    setExamStreamFilter('ALL');
    setModalOpen(true);
  };

  const openEdit = (ts: TestSeries) => {
    setEditing(ts);
    setTitle(ts.title);
    setDescription(ts.description || '');
    setPrice(String(ts.price ?? 0));
    setMockTestCount(String(ts.mockTestCount ?? 0));
    setClassLevel(ts.classLevel || 'Class 12th');
    setExamCategory(ts.examCategory || 'IIT-JEE');
    setStatus(ts.status || 'PUBLISHED');
    setSelectedExamIds(ts.examIds || []);
    setExamSearch('');
    setExamClassFilter('ALL');
    setExamStreamFilter('ALL');
    setModalOpen(true);
  };

  const filteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    return exams.filter((ex) => {
      if (examClassFilter !== 'ALL' && ex.classLevel !== examClassFilter) return false;
      if (examStreamFilter !== 'ALL' && ex.target !== examStreamFilter) return false;
      if (q) {
        const hay = `${ex.title} ${ex.code} ${ex.folderName || ''} ${ex.target}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [exams, examSearch, examClassFilter, examStreamFilter]);

  const toggleExamSelection = (examId: string) => {
    setSelectedExamIds((prev) =>
      prev.includes(examId) ? prev.filter((id) => id !== examId) : [...prev, examId]
    );
  };

  const handleAssignAllFiltered = () => {
    const filteredIds = filteredExams.map((e) => e.id);
    if (filteredIds.length === 0) return;
    const allSelected = filteredIds.every((id) => selectedExamIds.includes(id));
    if (allSelected) {
      setSelectedExamIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedExamIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    const payload = {
      title: title.trim(),
      description: description.trim(),
      price: Math.max(0, Number(price || 0)),
      mockTestCount: Math.max(0, Number(mockTestCount || 0)),
      classLevel: classLevel.trim() || 'Class 12th',
      examCategory,
      status,
      examIds: selectedExamIds,
      updatedAt: now,
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'testSeries', editing.id), payload);
      } else {
        await addDoc(collection(db, 'testSeries'), {
          ...payload,
          createdAt: now,
        });
      }
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'testSeries');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (ts: TestSeries) => {
    try {
      await updateDoc(doc(db, 'testSeries', ts.id), {
        status: ts.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `testSeries/${ts.id}`);
    }
  };

  const handleDelete = async (ts: TestSeries) => {
    try {
      await deleteDoc(doc(db, 'testSeries', ts.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `testSeries/${ts.id}`);
    }
  };

  const handleShare = (ts: TestSeries) => {
    const url = `${window.location.origin}/#test-series`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(ts.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLoadGurukulCatalog = async () => {
    setSyncingCatalog(true);
    setFeedback('');
    try {
      const added = await syncGurukulTestSeriesToFirestore(series.map((s) => s.title));
      setFeedback(
        added > 0
          ? `Added ${added} official Giri Sir's Gurukul Classes test series package(s).`
          : 'All official Gurukul Classes test series packages are already present.'
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Could not sync Gurukul test series.');
    } finally {
      setSyncingCatalog(false);
    }
  };

  const publishedCount = useMemo(
    () => series.filter((s) => s.status === 'PUBLISHED').length,
    [series]
  );

  return (
    <div className="space-y-6">
      {/* Header matching Storefront / Test Series layout */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-[#0032A0] font-semibold">Storefront</p>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Test Series</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {publishedCount} published packages · Assign exams by Class &amp; Stream
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={syncingCatalog}
            onClick={handleLoadGurukulCatalog}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#0032A0] rounded-lg transition-colors disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {syncingCatalog ? 'Syncing Gurukul...' : 'Load Gurukul Packages'}
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            New Test Series
          </button>
        </div>
      </div>

      {feedback && (
        <div className="bg-blue-50 border border-blue-200 text-[#0032A0] rounded-xl px-4 py-2.5 text-xs font-medium flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="text-slate-500 hover:text-slate-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Cards Grid */}
      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center text-xs font-mono text-slate-500">
          Loading Test Series packages...
        </div>
      ) : series.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center space-y-3">
          <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
          <div>
            <p className="text-sm font-medium text-slate-700">No Test Series packages created yet.</p>
            <p className="text-xs text-slate-500 mt-1">
              Load Gurukul IIT-JEE, NEET, MHT-CET &amp; G-PAT series or create a custom package.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={syncingCatalog}
              onClick={handleLoadGurukulCatalog}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Fill Gurukul Test Series
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {series.map((ts) => {
            const linked = exams.filter((ex) => (ts.examIds || []).includes(ex.id));
            return (
              <div
                key={ts.id}
                className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between gap-4 hover:shadow-sm transition-shadow"
              >
                <div className="space-y-3">
                  {/* Top Badge + Category + Price */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => togglePublish(ts)}
                        title="Click to toggle LIVE / DRAFT"
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          ts.status === 'PUBLISHED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-[#E2E8F0]'
                        }`}
                      >
                        {ts.status === 'PUBLISHED' ? 'LIVE' : 'DRAFT'}
                      </button>
                      <span className="text-[11px] font-mono font-semibold text-slate-600">{ts.examCategory}</span>
                    </div>
                    <span className="font-mono text-base font-bold text-[#0F172A] tabular-nums">
                      {formatCurrencyINR(ts.price)}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <h2 className="font-display font-bold text-base text-[#0F172A] leading-snug">{ts.title}</h2>
                    {ts.description && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">{ts.description}</p>
                    )}
                    <p className="text-[11px] font-mono text-slate-500 mt-1.5">
                      {ts.classLevel || 'Class 12th'} · {ts.mockTestCount} Mock Tests
                    </p>
                  </div>

                  {/* Assigned Exams Preview Box */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-600">Assigned Exams ({linked.length})</p>
                    {linked.length === 0 ? (
                      <div className="px-3 py-2.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800">
                        No exams linked yet. Click &quot;Assign Exams&quot; to attach tests.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-28 overflow-y-auto pr-0.5">
                        {linked.map((ex) => (
                          <div
                            key={ex.id}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-[#E2E8F0] flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="font-medium text-[#0F172A] truncate flex items-center gap-1.5">
                              <FileSpreadsheet className="w-3 h-3 text-[#0032A0] shrink-0" />
                              {ex.title}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500 shrink-0">
                              {ex.classLevel}/{ex.target}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Action Row */}
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(ts)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] bg-slate-50 hover:bg-slate-100 text-[#0F172A] rounded-lg transition-colors"
                  >
                    <ListChecks className="w-3.5 h-3.5 text-[#0032A0]" />
                    Assign Exams ({ts.examIds?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare(ts)}
                    title="Copy Test Series link"
                    className="p-2 text-slate-500 hover:text-[#0032A0] border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
                  >
                    {copiedId === ts.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(ts)}
                    title="Edit Test Series"
                    className="p-2 text-slate-500 hover:text-[#0032A0] border border-[#E2E8F0] rounded-lg hover:bg-slate-50"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ts)}
                    title="Delete Test Series"
                    className="p-2 text-slate-400 hover:text-red-600 border border-[#E2E8F0] rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / New Test Series Modal (with integrated Assigned Exams picker) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                {editing ? 'Edit Test Series' : 'New Test Series'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. All India IIT-JEE Advanced Test Series (AITS)"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class</label>
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="Class 12th">Class 12th</option>
                    <option value="Class 11th">Class 11th</option>
                    <option value="Class 11th & 12th">Class 11th &amp; 12th</option>
                    <option value="Class 7th–10th">Class 7th–10th</option>
                    <option value="All Classes">All Classes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={examCategory}
                    onChange={(e) => setExamCategory(e.target.value as TestSeries['examCategory'])}
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Number of Mocks</label>
                  <input
                    type="number"
                    min="0"
                    value={mockTestCount}
                    onChange={(e) => setMockTestCount(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Subtitle</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'PUBLISHED' | 'DRAFT')}
                    className="px-2 py-0.5 text-[11px] font-mono border border-[#E2E8F0] rounded bg-slate-50"
                  >
                    <option value="PUBLISHED">PUBLISHED (Live)</option>
                    <option value="DRAFT">DRAFT (Hidden)</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="25 Full-length Computer Based Tests simulating exact NTA and IIT testing software..."
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>

              {/* Integrated Assigned Exams Section */}
              <div className="pt-2 border-t border-[#E2E8F0] space-y-3">
                <label className="block text-xs font-bold text-[#0F172A]">Assigned Exams</label>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6 relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={examSearch}
                      onChange={(e) => setExamSearch(e.target.value)}
                      placeholder="Search exams by title or code..."
                      className="w-full pl-8 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <select
                      value={examClassFilter}
                      onChange={(e) => setExamClassFilter(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                    >
                      <option value="ALL">All Classes</option>
                      <option value="Class 12th">Class 12th</option>
                      <option value="Class 11th">Class 11th</option>
                      <option value="Class 10th">Class 10th</option>
                      <option value="Class 9th">Class 9th</option>
                      <option value="Class 8th">Class 8th</option>
                      <option value="All Classes">All Classes (Shared)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <select
                      value={examStreamFilter}
                      onChange={(e) => setExamStreamFilter(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                    >
                      <option value="ALL">All Streams</option>
                      <option value="JEE Main">JEE Main</option>
                      <option value="JEE Advanced">JEE Advanced</option>
                      <option value="MHT-CET">MHT-CET</option>
                      <option value="NEET">NEET</option>
                      <option value="G-PAT">G-PAT</option>
                      <option value="Foundation">Foundation</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-600">
                    <strong className="text-[#0F172A]">{selectedExamIds.length}</strong> exams assigned
                  </span>
                  <button
                    type="button"
                    onClick={handleAssignAllFiltered}
                    disabled={filteredExams.length === 0}
                    className="font-semibold text-[#0032A0] hover:underline disabled:opacity-40"
                  >
                    Assign All Filtered ({filteredExams.length})
                  </button>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-2 border border-[#E2E8F0] rounded-xl p-2.5 bg-slate-50/50">
                  {filteredExams.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      No exams match the selected filters. Create CBT exams in the Exams section first.
                    </p>
                  ) : (
                    filteredExams.map((ex) => {
                      const assigned = selectedExamIds.includes(ex.id);
                      return (
                        <div
                          key={ex.id}
                          onClick={() => toggleExamSelection(ex.id)}
                          className={`flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            assigned
                              ? 'border-[#0032A0] bg-blue-50/60'
                              : 'border-[#E2E8F0] bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={assigned}
                              onChange={() => {}}
                              className="rounded border-slate-300 text-[#0032A0]"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#0F172A] truncate">{ex.title}</p>
                              <p className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 flex-wrap">
                                <span className="text-[#0032A0] font-semibold">{ex.code}</span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-0.5">
                                  <FolderOpen className="w-3 h-3" />
                                  {ex.classLevel}
                                </span>
                                <span>·</span>
                                <span>{ex.target}</span>
                                <span>·</span>
                                <span>{ex.questionCount || 0} Qs</span>
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              toggleExamSelection(ex.id);
                            }}
                            className={`px-3 py-1 rounded-md text-[11px] font-semibold shrink-0 transition-colors ${
                              assigned
                                ? 'bg-[#0032A0] text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {assigned ? 'Assigned ✓' : 'Assign'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Test Series'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
