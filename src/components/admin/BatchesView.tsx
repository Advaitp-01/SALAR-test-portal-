import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from '../../lib/tenantDb';
import { BarChart3, Edit2, Layers, Plus, Trash2, Users, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import type { Batch, Exam, ExamAttempt, FacultyProfile, StudentProfile } from '../../types/portal';

export const BatchesView: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [faculty, setFaculty] = useState<FacultyProfile[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [manageBatch, setManageBatch] = useState<Batch | null>(null);

  const [name, setName] = useState('');
  const [classLevel, setClassLevel] = useState<'Class 11th' | 'Class 12th'>('Class 12th');
  const [academicYear, setAcademicYear] = useState('2025-26');
  const [schedule, setSchedule] = useState('');
  const [capacity, setCapacity] = useState(100);
  const [facultyName, setFacultyName] = useState('');
  const [assignedExamIds, setAssignedExamIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'batches'),
      (snap) => setBatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Batch, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'batches')
    );
    const u2 = onSnapshot(
      collection(db, 'students'),
      (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentProfile, 'id'>) }))),
      () => {}
    );
    const u3 = onSnapshot(
      collection(db, 'exams'),
      (snap) => setExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) }))),
      () => {}
    );
    const u4 = onSnapshot(
      collection(db, 'examAttempts'),
      (snap) => setAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, 'id'>) }))),
      () => {}
    );
    const u5 = onSnapshot(
      collection(db, 'faculty'),
      (snap) => setFaculty(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FacultyProfile, 'id'>) }))),
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

  const batchMetrics = useMemo(() => {
    const map = new Map<string, { members: StudentProfile[]; avgScore: number; attemptCount: number }>();
    batches.forEach((b) => {
      const members = students.filter((s) => s.batchId === b.id);
      const memberUids = new Set(members.map((m) => m.uid || m.id));
      const bAttempts = attempts.filter((a) => memberUids.has(a.studentUid) || (a.studentId && memberUids.has(a.studentId)));
      const avgScore =
        bAttempts.length > 0
          ? Math.round((bAttempts.reduce((acc, a) => acc + Number(a.percentage || 0), 0) / bAttempts.length) * 10) / 10
          : 0;
      map.set(b.id, { members, avgScore, attemptCount: bAttempts.length });
    });
    return map;
  }, [batches, students, attempts]);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setClassLevel('Class 12th');
    setAcademicYear('2025-26');
    setSchedule('Mon–Sat · 07:30 AM – 09:30 AM');
    setCapacity(100);
    setFacultyName(faculty[0]?.name || '');
    setAssignedExamIds([]);
    setStatus('ACTIVE');
    setModalOpen(true);
  };

  const openEdit = (b: Batch) => {
    setEditing(b);
    setName(b.name);
    setClassLevel(b.classLevel);
    setAcademicYear(b.academicYear);
    setSchedule(b.schedule || '');
    setCapacity(b.capacity);
    setFacultyName(b.facultyName || '');
    setAssignedExamIds(b.assignedExamIds || []);
    setStatus(b.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const payload = {
      name: name.trim(),
      classLevel,
      academicYear: academicYear.trim(),
      schedule: schedule.trim(),
      capacity: Number(capacity),
      facultyName: facultyName.trim(),
      assignedExamIds,
      status,
      updatedAt: now,
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'batches', editing.id), payload);
      } else {
        await addDoc(collection(db, 'batches'), { ...payload, studentCount: 0, createdAt: now });
      }
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'batches');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'batches', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `batches/${id}`);
    }
  };

  const toggleStudentInBatch = async (student: StudentProfile, batch: Batch) => {
    const isMember = student.batchId === batch.id;
    try {
      await updateDoc(doc(db, 'students', student.id), {
        batchId: isMember ? '' : batch.id,
        batchName: isMember ? 'Unassigned' : batch.name,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `students/${student.id}`);
    }
  };

  const toggleExamInBatch = (examId: string) => {
    setAssignedExamIds((prev) => (prev.includes(examId) ? prev.filter((id) => id !== examId) : [...prev, examId]));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Batch Management</h1>
          <p className="text-sm text-slate-500">Organize Class 11th &amp; 12th PCMB batches, capacity, and exam assignments</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] rounded-lg self-start"
        >
          <Plus className="w-4 h-4" />
          Create Batch
        </button>
      </div>

      {batches.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <Layers className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="font-display font-bold text-base text-[#0F172A]">No Batches Created</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">Create Class 11th or Class 12th PCMB batches to group students.</p>
          <button type="button" onClick={openAdd} className="px-4 py-2 text-xs font-semibold text-white bg-[#0032A0] rounded-lg">
            Create First Batch
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {batches.map((b) => {
            const metrics = batchMetrics.get(b.id) || { members: [], avgScore: 0, attemptCount: 0 };
            const fillPct = Math.min(100, Math.round((metrics.members.length / Math.max(1, b.capacity)) * 100));
            return (
              <div key={b.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#0032A0] font-semibold">
                      {b.classLevel} · {b.academicYear}
                    </span>
                    <span className={b.status === 'ACTIVE' ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                      {b.status}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-base text-[#0F172A]">{b.name}</h3>
                  <p className="text-xs text-slate-500">{b.schedule || 'Schedule TBD'}</p>
                  {b.facultyName && <p className="text-xs font-medium text-slate-700">Mentor: {b.facultyName}</p>}

                  {/* Capacity Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono mb-1 tabular-nums">
                      <span className="text-slate-600">
                        Capacity: {metrics.members.length} / {b.capacity}
                      </span>
                      <span className="text-slate-500">{fillPct}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#0032A0]" style={{ width: `${fillPct}%` }} />
                    </div>
                  </div>

                  {/* Performance Analytics */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs font-mono tabular-nums">
                    <div>
                      <p className="text-slate-400 text-[10px]">STUDENTS</p>
                      <p className="font-bold text-[#0F172A]">{metrics.members.length}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px]">AVG SCORE</p>
                      <p className="font-bold text-[#0032A0]">{metrics.avgScore}%</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px]">EXAMS</p>
                      <p className="font-bold text-[#0F172A]">{(b.assignedExamIds || []).length}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setManageBatch(b)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Students ({metrics.members.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(b)}
                    className="p-1.5 border border-[#E2E8F0] rounded-lg text-slate-600 hover:bg-slate-50"
                    title="Edit Batch"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(b.id)}
                    className="p-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50"
                    title="Delete Batch"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Batch Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-display font-bold text-base text-[#0F172A]">
                {editing ? 'Edit Batch' : 'Create PCMB Batch'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sankalp JEE 2026"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Year</label>
                  <input
                    type="text"
                    required
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'ARCHIVED')}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Schedule</label>
                <input
                  type="text"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Faculty</label>
                <input
                  type="text"
                  value={facultyName}
                  onChange={(e) => setFacultyName(e.target.value)}
                  list="faculty-options"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
                <datalist id="faculty-options">
                  {faculty.map((f) => (
                    <option key={f.id} value={f.name} />
                  ))}
                </datalist>
              </div>
              {exams.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Assign Examinations</label>
                  <div className="max-h-36 overflow-y-auto border border-[#E2E8F0] rounded-lg p-2 space-y-1">
                    {exams.map((ex) => (
                      <label key={ex.id} className="flex items-center gap-2 text-xs cursor-pointer py-1 px-1.5 hover:bg-slate-50 rounded">
                        <input
                          type="checkbox"
                          checked={assignedExamIds.includes(ex.id)}
                          onChange={() => toggleExamInBatch(ex.id)}
                        />
                        <span className="font-mono text-[#0032A0]">{ex.code}</span>
                        <span className="truncate">{ex.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg">
                  Save Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Batch Students Modal */}
      {manageBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">{manageBatch.name} — Student Roster</h3>
                <p className="text-xs text-slate-500">Click Assign / Remove to update student batch enrollment</p>
              </div>
              <button type="button" onClick={() => setManageBatch(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-lg">
              {students.length === 0 ? (
                <p className="p-4 text-xs text-slate-500 text-center">No students available yet.</p>
              ) : (
                students.map((s) => {
                  const inThisBatch = s.batchId === manageBatch.id;
                  return (
                    <div key={s.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#0F172A] truncate">{s.name}</p>
                        <p className="font-mono text-slate-500">
                          {s.rollNumber || 'No Roll'} · {s.classLevel} · Current: {s.batchName || 'Unassigned'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleStudentInBatch(s, manageBatch)}
                        className={`px-3 py-1.5 font-semibold rounded-lg transition-colors shrink-0 ${
                          inThisBatch
                            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                            : 'bg-[#0032A0] text-white hover:bg-[#00257a]'
                        }`}
                      >
                        {inThisBatch ? 'Remove' : 'Assign'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
