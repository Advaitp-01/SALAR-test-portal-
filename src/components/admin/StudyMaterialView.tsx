import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, increment, onSnapshot, updateDoc } from '../../lib/tenantDb';
import { BookOpen, Download, Edit2, FileText, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { uploadFileToServer } from '../../lib/portalService';
import type { StudyMaterial } from '../../types/portal';

export const StudyMaterialView: React.FC = () => {
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudyMaterial | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classLevel, setClassLevel] = useState<'Class 11th' | 'Class 12th' | 'Both'>('Class 12th');
  const [subject, setSubject] = useState('Physics');
  const [chapter, setChapter] = useState('');
  const [category, setCategory] = useState<'Notes' | 'Formula Sheets' | 'DPP' | 'PDF' | 'Practice Worksheets'>('Formula Sheets');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'studyMaterials'),
      (snap) => setMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudyMaterial, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'studyMaterials')
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      if (catFilter !== 'ALL' && m.category !== catFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return m.title.toLowerCase().includes(s) || (m.chapter || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [materials, catFilter, search]);

  const openAdd = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setClassLevel('Class 12th');
    setSubject('Physics');
    setChapter('');
    setCategory('Formula Sheets');
    setFileUrl('');
    setFileName('');
    setFileSize('');
    setModalOpen(true);
  };

  const openEdit = (m: StudyMaterial) => {
    setEditing(m);
    setTitle(m.title);
    setDescription(m.description || '');
    setClassLevel(m.classLevel);
    setSubject(m.subject || 'Physics');
    setChapter(m.chapter || '');
    setCategory(m.category);
    setFileUrl(m.fileUrl);
    setFileName(m.fileName);
    setFileSize(m.fileSize || '');
    setModalOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFileToServer(file);
      setFileUrl(res.url);
      setFileName(res.fileName);
      setFileSize(res.fileSize);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileUrl) return;
    const now = new Date().toISOString();
    const payload = {
      title: title.trim(),
      description: description.trim(),
      classLevel,
      subject: subject || 'PCMB',
      chapter: chapter.trim(),
      category,
      fileUrl,
      fileName: fileName || 'material.pdf',
      fileSize: fileSize || 'PDF',
      updatedAt: now,
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'studyMaterials', editing.id), payload);
      } else {
        await addDoc(collection(db, 'studyMaterials'), { ...payload, downloadCount: 0, createdAt: now });
      }
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'studyMaterials');
    }
  };

  const handleDownload = async (m: StudyMaterial) => {
    try {
      await updateDoc(doc(db, 'studyMaterials', m.id), {
        downloadCount: increment(1),
      });
    } catch {
      // Non-blocking counter increment
    }
    const link = document.createElement('a');
    link.href = `${m.fileUrl}?download=1`;
    link.download = m.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'studyMaterials', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studyMaterials/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Study Material &amp; Formula Books</h1>
          <p className="text-sm text-slate-500">Upload Physics, Chemistry, Mathematics &amp; Biology notes, formula sheets, DPPs, and PDFs</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a] self-start"
        >
          <Plus className="w-4 h-4" />
          Upload Material
        </button>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search formula books, DPPs, chapters..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
        >
          <option value="ALL">All Categories</option>
          <option value="Notes">Notes</option>
          <option value="Formula Sheets">Formula Sheets</option>
          <option value="DPP">DPP</option>
          <option value="PDF">PDF</option>
          <option value="Practice Worksheets">Practice Worksheets</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="font-display font-bold text-base text-[#0F172A]">No Study Material Uploaded</p>
          <p className="text-xs text-slate-500 mt-1">Upload PCMB formula sheets, DPPs, or chapter notes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((m) => (
            <div key={m.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                  <span className="text-[#0032A0] font-semibold">
                    {m.subject || 'PCMB'} · {m.category}
                  </span>
                  <span>{m.classLevel}</span>
                </div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">{m.title}</h3>
                {m.description && <p className="text-xs text-slate-600 line-clamp-2">{m.description}</p>}
                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 pt-1">
                  <FileText className="w-3.5 h-3.5 text-[#0032A0]" />
                  <span className="truncate">{m.fileName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{m.fileSize || 'PDF'}</span>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {m.downloadCount || 0} Downloads
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownload(m)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(m)}
                    className="p-1.5 border border-[#E2E8F0] rounded-lg text-slate-600 hover:bg-slate-50"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    className="p-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-display font-bold text-base">
                {editing ? 'Edit Study Material' : 'Upload Study Material'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Material Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class</label>
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value as typeof classLevel)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="Class 11th">Class 11th</option>
                    <option value="Class 12th">Class 12th</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as typeof category)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="Notes">Notes</option>
                    <option value="Formula Sheets">Formula Sheets</option>
                    <option value="DPP">DPP</option>
                    <option value="PDF">PDF</option>
                    <option value="Practice Worksheets">Practice Worksheets</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject (PCMB)</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="Physics">Physics</option>
                    <option value="Chemistry">Chemistry</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Biology">Biology</option>
                    <option value="Combined PCMB">Combined PCMB</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Chapter / Topic</label>
                  <input
                    type="text"
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                    placeholder="e.g. Electrostatics / Genetics / Calculus"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">PDF / File Upload</label>
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-xs font-semibold text-slate-700">
                  <Upload className="w-4 h-4 text-[#0032A0]" />
                  {uploading ? 'Uploading...' : fileName ? `${fileName} (${fileSize})` : 'Choose PDF or Document'}
                  <input type="file" accept=".pdf,image/*,.txt,.csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!fileUrl || uploading}
                  className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg disabled:opacity-50"
                >
                  Save Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
