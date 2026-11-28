import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from '../../lib/tenantDb';
import {
  Download,
  Edit2,
  Eye,
  Layers,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { exportToCsv } from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';
import type { Batch, ExamAttempt, StudentProfile } from '../../types/portal';

export const StudentsView: React.FC = () => {
  const { tenantContext } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);

  const [tab, setTab] = useState<'all' | 'quick-join' | 'batches'>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'QUICK_JOIN' | 'INACTIVE'>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentProfile | null>(null);
  const [detailStudent, setDetailStudent] = useState<StudentProfile | null>(null);
  const [assignStudent, setAssignStudent] = useState<StudentProfile | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [classLevel, setClassLevel] = useState<'Class 11th' | 'Class 12th' | 'Dropper / Repeater'>('Class 12th');
  const [targetExam, setTargetExam] = useState<
    'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'NEET' | 'Boards + CET' | 'JEE Main + Advanced' | 'PCMB Foundation'
  >('JEE Main');
  const [rollNumber, setRollNumber] = useState('');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'QUICK_JOIN' | 'INACTIVE'>('ACTIVE');

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'students'),
      (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentProfile, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'students')
    );
    const u2 = onSnapshot(
      collection(db, 'batches'),
      (snap) => setBatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Batch, 'id'>) }))),
      () => {}
    );
    const u3 = onSnapshot(
      collection(db, 'examAttempts'),
      (snap) => setAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, 'id'>) }))),
      () => {}
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const attemptStatsByStudent = useMemo(() => {
    const map = new Map<string, { count: number; avg: number; history: ExamAttempt[] }>();
    students.forEach((s) => {
      const uid = s.uid || s.id;
      const list = attempts.filter((a) => a.studentUid === uid || a.studentId === s.id);
      const avg =
        list.length > 0
          ? Math.round((list.reduce((acc, a) => acc + Number(a.percentage || 0), 0) / list.length) * 10) / 10
          : 0;
      map.set(s.id, { count: list.length, avg, history: list });
    });
    return map;
  }, [students, attempts]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (tab === 'quick-join' && s.origin !== 'QUICK_JOIN' && s.status !== 'QUICK_JOIN') return false;
      if (tab === 'batches' && !s.batchId) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.mobile || '').toLowerCase().includes(q) ||
          (s.rollNumber || '').toLowerCase().includes(q) ||
          (s.username || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [students, tab, statusFilter, search]);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setEmail('');
    setMobile('');
    setWhatsapp('');
    setClassLevel('Class 12th');
    setTargetExam('JEE Main');
    const rollPrefix =
      tenantContext?.portalSlug && tenantContext.portalSlug !== 'gurukul'
        ? tenantContext.portalSlug.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3) || 'ST'
        : 'GY';
    setRollNumber(`${rollPrefix}-${Math.floor(10000 + Math.random() * 89999)}`);
    setUsername('');
    setStatus('ACTIVE');
    setModalOpen(true);
  };

  const openEdit = (s: StudentProfile) => {
    setEditing(s);
    setName(s.name);
    setEmail(s.email || '');
    setMobile(s.mobile || '');
    setWhatsapp(s.whatsapp || '');
    setClassLevel(s.classLevel || 'Class 12th');
    setTargetExam(s.targetExam || 'JEE Main');
    setRollNumber(s.rollNumber || '');
    setUsername(s.username || '');
    setStatus((s.status === 'SUSPENDED' ? 'INACTIVE' : s.status) || 'ACTIVE');
    setModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        whatsapp: (whatsapp || mobile).trim(),
        classLevel,
        targetExam,
        rollNumber: rollNumber.trim(),
        username: username.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
        status,
        origin: editing?.origin || 'ADMIN_ADDED',
        updatedAt: now,
      };
      if (editing) {
        await updateDoc(doc(db, 'students', editing.id), payload);
      } else {
        await addDoc(collection(db, 'students'), {
          ...payload,
          uid: '',
          enrollmentId: `ENR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`,
          batchId: '',
          batchName: 'Unassigned',
          photoUrl: '',
          attemptsCount: 0,
          avgPercentage: 0,
          createdAt: now,
        });
      }
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'students');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: StudentProfile) => {
    try {
      await deleteDoc(doc(db, 'students', s.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `students/${s.id}`);
    }
  };

  const handleAssignBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignStudent) return;
    const batchObj = batches.find((b) => b.id === selectedBatchId);
    try {
      await updateDoc(doc(db, 'students', assignStudent.id), {
        batchId: batchObj ? batchObj.id : '',
        batchName: batchObj ? batchObj.name : 'Unassigned',
        updatedAt: new Date().toISOString(),
      });
      setAssignStudent(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `students/${assignStudent.id}`);
    }
  };

  const handleExportCsv = () => {
    const fileSlug = (tenantContext?.portalSlug || 'institute').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    exportToCsv(
      `${fileSlug}-students.csv`,
      ['Name', 'Email', 'Mobile', 'WhatsApp', 'Class', 'Target', 'Roll Number', 'Username', 'Batch', 'Status'],
      filteredStudents.map((s) => [
        s.name,
        s.email || '',
        s.mobile || '',
        s.whatsapp || '',
        s.classLevel || '',
        s.targetExam || '',
        s.rollNumber || '',
        s.username || '',
        s.batchName || 'Unassigned',
        s.status,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Student Management</h1>
          <p className="text-sm text-slate-500">Manage enrolled students, Quick Join candidates, and batch assignments</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-[#E2E8F0] hover:bg-slate-50 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add Student
          </button>
        </div>
      </div>

      {/* Tabs + Search + Status Filter */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'all', label: `All Students (${students.length})` },
              {
                id: 'quick-join',
                label: `Quick Join Candidates (${students.filter((s) => s.origin === 'QUICK_JOIN' || s.status === 'QUICK_JOIN').length})`,
              },
              { id: 'batches', label: `Enrolled Batches (${students.filter((s) => Boolean(s.batchId)).length})` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  tab === t.id ? 'bg-white text-[#0032A0] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, roll no, mobile..."
                className="pl-9 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="QUICK_JOIN">Quick Join</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-mono uppercase text-slate-500">
                <th className="py-3 px-4">Candidate / Student</th>
                <th className="py-3 px-4">Mobile / WhatsApp</th>
                <th className="py-3 px-4">Class / Target</th>
                <th className="py-3 px-4">Roll Number / Username</th>
                <th className="py-3 px-4">Origin &amp; Assignment</th>
                <th className="py-3 px-4">Exam Activity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] text-sm">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No student records match your current search or filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => {
                  const stats = attemptStatsByStudent.get(s.id) || { count: 0, avg: 0, history: [] };
                  const waNumber = (s.whatsapp || s.mobile || '').replace(/[^0-9]/g, '');
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#0F172A]">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.email || 'No email'}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                        <p>{s.mobile || '—'}</p>
                        {s.whatsapp && <p className="text-slate-400">WA: {s.whatsapp}</p>}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <p className="font-medium text-slate-800">{s.classLevel || 'Class 12th'}</p>
                        <p className="text-slate-500">{s.targetExam || 'JEE Main'}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        <p className="font-semibold text-[#0032A0]">{s.rollNumber || '—'}</p>
                        <p className="text-slate-500">@{s.username || 'student'}</p>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <p className="font-medium text-slate-800">{s.batchName || 'Unassigned'}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {s.origin} · {s.status}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums">
                        <p className="font-semibold text-slate-800">{stats.count} Attempts</p>
                        <p className="text-slate-500">Avg: {stats.avg}%</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailStudent(s)}
                            title="View Details & History"
                            className="p-1.5 text-slate-600 hover:text-[#0032A0] hover:bg-blue-50 rounded"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAssignStudent(s);
                              setSelectedBatchId(s.batchId || '');
                            }}
                            title="Assign Batch"
                            className="p-1.5 text-slate-600 hover:text-[#0032A0] hover:bg-blue-50 rounded"
                          >
                            <Layers className="w-4 h-4" />
                          </button>
                          {waNumber && (
                            <a
                              href={`https://wa.me/${waNumber.length === 10 ? `91${waNumber}` : waNumber}`}
                              target="_blank"
                              rel="noreferrer"
                              title="WhatsApp Contact"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            title="Edit Student"
                            className="p-1.5 text-slate-600 hover:text-[#0032A0] hover:bg-blue-50 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            title="Delete Student"
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Student Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg overflow-hidden shadow-lg">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#0F172A]">
                {editing ? 'Edit Student Record' : 'Add New Student'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveStudent} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class</label>
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value as typeof classLevel)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="Class 11th">Class 11th</option>
                    <option value="Class 12th">Class 12th</option>
                    <option value="Dropper / Repeater">Dropper / Repeater</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Exam</label>
                  <select
                    value={targetExam}
                    onChange={(e) => setTargetExam(e.target.value as typeof targetExam)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="JEE Main">JEE Main</option>
                    <option value="JEE Advanced">JEE Advanced</option>
                    <option value="MHT-CET">MHT-CET</option>
                    <option value="NEET">NEET</option>
                    <option value="JEE Main + Advanced">JEE Main + Advanced</option>
                    <option value="Boards + CET">Boards + CET</option>
                    <option value="PCMB Foundation">PCMB Foundation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Roll Number</label>
                  <input
                    type="text"
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as typeof status)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="QUICK_JOIN">QUICK_JOIN</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                >
                  {saving ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Batch Modal */}
      {assignStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#0F172A]">Assign Batch — {assignStudent.name}</h3>
              <button type="button" onClick={() => setAssignStudent(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAssignBatch} className="space-y-4">
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
              >
                <option value="">Unassigned</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.classLevel})
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssignStudent(null)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg">
                  Save Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Detail & Exam History Drawer/Modal */}
      {detailStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-4">
              <div>
                <h3 className="font-display font-bold text-lg text-[#0F172A]">{detailStudent.name}</h3>
                <p className="text-xs font-mono text-slate-500">
                  {detailStudent.rollNumber} · {detailStudent.classLevel} · {detailStudent.targetExam}
                </p>
              </div>
              <button type="button" onClick={() => setDetailStudent(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-[#E2E8F0]">
                <p className="text-slate-500">Email</p>
                <p className="font-medium text-slate-900 truncate">{detailStudent.email || '—'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-[#E2E8F0]">
                <p className="text-slate-500">Mobile / WhatsApp</p>
                <p className="font-mono font-medium text-slate-900">{detailStudent.mobile || '—'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-[#E2E8F0]">
                <p className="text-slate-500">Batch</p>
                <p className="font-medium text-slate-900">{detailStudent.batchName || 'Unassigned'}</p>
              </div>
            </div>
            <div>
              <h4 className="font-display font-bold text-sm text-[#0F172A] mb-2">Examination History &amp; Results</h4>
              {(attemptStatsByStudent.get(detailStudent.id)?.history || []).length === 0 ? (
                <p className="text-xs text-slate-500 border border-dashed border-[#E2E8F0] rounded-lg p-4 text-center">
                  No exam attempts recorded for this student yet.
                </p>
              ) : (
                <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
                  {(attemptStatsByStudent.get(detailStudent.id)?.history || []).map((att) => (
                    <div key={att.id} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-[#0F172A]">{att.examTitle}</p>
                        <p className="font-mono text-slate-500">
                          {att.status} · {(att.submittedAt || att.startedAt).slice(0, 10)}
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <p className="font-bold text-[#0032A0]">
                          {att.finalScore ?? att.autoScore ?? 0} / {att.totalMarks}
                        </p>
                        <p className="text-slate-500">{att.percentage ?? 0}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
