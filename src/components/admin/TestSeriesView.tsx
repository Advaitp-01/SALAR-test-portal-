import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from '../../lib/tenantDb';
import { Check, Edit3, FileSpreadsheet, Link2, Plus, Share2, Trash2, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { formatCurrencyINR } from '../../lib/portalService';
import type { Exam, TestSeries } from '../../types/portal';

export const TestSeriesView: React.FC = () => {
  const [series, setSeries] = useState<TestSeries[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TestSeries | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('999');
  const [mockTestCount, setMockTestCount] = useState('15');
  const [classLevel, setClassLevel] = useState('Class 12th');
  const [examCategory, setExamCategory] = useState<
    'JEE Main Mathematics' | 'JEE Advanced Mathematics' | 'MHT-CET Mathematics'
  >('JEE Main Mathematics');
  const [status, setStatus] = useState<'PUBLISHED' | 'DRAFT'>('DRAFT');
  const [saving, setSaving] = useState(false);

  // Assign Exams modal
  const [assignSeries, setAssignSeries] = useState<TestSeries | null>(null);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
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
    setPrice('999');
    setMockTestCount('15');
    setClassLevel('Class 12th');
    setExamCategory('JEE Main Mathematics');
    setStatus('DRAFT');
    setModalOpen(true);
  };

  const openEdit = (ts: TestSeries) => {
    setEditing(ts);
    setTitle(ts.title);
    setDescription(ts.description || '');
    setPrice(String(ts.price));
    setMockTestCount(String(ts.mockTestCount));
    setClassLevel(ts.classLevel || 'Class 12th');
    setExamCategory(ts.examCategory);
    setStatus(ts.status);
    setModalOpen(true);
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
      classLevel,
      examCategory,
      status,
      updatedAt: now,
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'testSeries', editing.id), payload);
      } else {
        await addDoc(collection(db, 'testSeries'), {
          ...payload,
          examIds: [],
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

  const openAssignExams = (ts: TestSeries) => {
    setAssignSeries(ts);
    setSelectedExamIds(ts.examIds || []);
  };

  const toggleExamSelection = (examId: string) => {
    setSelectedExamIds((prev) =>
      prev.includes(examId) ? prev.filter((id) => id !== examId) : [...prev, examId]
    );
  };

  const saveAssignedExams = async () => {
    if (!assignSeries) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'testSeries', assignSeries.id), {
        examIds: selectedExamIds,
        updatedAt: new Date().toISOString(),
      });
      setAssignSeries(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `testSeries/${assignSeries.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Test Series Storefront</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            JEE Main Mathematics, JEE Advanced Mathematics, and MHT-CET Mathematics mock test packages
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
        >
          <Plus className="w-4 h-4" />
          New Test Series
        </button>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center text-xs font-mono text-slate-500">
          Loading Test Series packages...
        </div>
      ) : series.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">No Mathematics Test Series packages created.</p>
          <p className="text-xs text-slate-500 mt-1">Create a Test Series and link published CBT exams to it.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {series.map((ts) => (
            <div
              key={ts.id}
              className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                  <span className="text-[#0032A0] font-semibold">{ts.examCategory}</span>
                  <span
                    className={`px-2 py-0.5 rounded font-semibold ${
                      ts.status === 'PUBLISHED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-[#E2E8F0]'
                    }`}
                  >
                    {ts.status}
                  </span>
                </div>
                <h2 className="font-display font-bold text-base text-[#0F172A]">{ts.title}</h2>
                <p className="text-xs text-slate-600">{ts.description}</p>
                <div className="flex items-center justify-between pt-2 text-xs font-mono tabular-nums text-slate-600">
                  <span className="text-base font-bold text-[#0F172A]">{formatCurrencyINR(ts.price)}</span>
                  <span>
                    {ts.mockTestCount} Mock Tests · {ts.examIds?.length || 0} Linked
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAssignExams(ts)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Assign Exams ({ts.examIds?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => togglePublish(ts)}
                  className="px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 rounded-lg"
                >
                  {ts.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => handleShare(ts)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 rounded-lg"
                >
                  {copiedId === ts.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
                  {copiedId === ts.id ? 'Copied' : 'Share'}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(ts)}
                  className="p-1.5 text-slate-500 hover:text-[#0032A0] rounded-lg ml-auto"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(ts)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                {editing ? 'Edit Test Series' : 'New Test Series'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. JEE Main Mathematics 2026 Full Mock Series"
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Category</label>
                  <select
                    value={examCategory}
                    onChange={(e) => setExamCategory(e.target.value as typeof examCategory)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="JEE Main Mathematics">JEE Main Mathematics</option>
                    <option value="JEE Advanced Mathematics">JEE Advanced Mathematics</option>
                    <option value="MHT-CET Mathematics">MHT-CET Mathematics</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class Level</label>
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="Class 11th">Class 11th</option>
                    <option value="Class 12th">Class 12th</option>
                    <option value="Class 11th & 12th">Class 11th &amp; 12th</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price (INR)</label>
                  <input
                    type="number"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mock Tests</label>
                  <input
                    type="number"
                    min="0"
                    value={mockTestCount}
                    onChange={(e) => setMockTestCount(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'PUBLISHED' | 'DRAFT')}
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="PUBLISHED">PUBLISHED</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Test Series'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Exams Modal */}
      {assignSeries && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">
                  Assign CBT Exams — {assignSeries.title}
                </h3>
                <p className="text-xs text-slate-500">Select exams included in this Test Series subscription</p>
              </div>
              <button type="button" onClick={() => setAssignSeries(null)} className="text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {exams.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No exams available yet.</p>
              ) : (
                exams.map((ex) => {
                  const checked = selectedExamIds.includes(ex.id);
                  return (
                    <label
                      key={ex.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer ${
                        checked ? 'border-[#0032A0] bg-blue-50/50' : 'border-[#E2E8F0] hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExamSelection(ex.id)}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#0F172A] truncate">{ex.title}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {ex.code} · {ex.classLevel} · {ex.questionCount || 0} Qs
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">{ex.status}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="px-5 py-3.5 border-t border-[#E2E8F0] bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignSeries(null)}
                className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveAssignedExams}
                className="px-5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
              >
                {saving ? 'Saving...' : 'Save Exam Links'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
