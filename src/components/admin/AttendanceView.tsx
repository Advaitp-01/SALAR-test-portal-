import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from '../../lib/tenantDb';
import { CalendarCheck, Check, Download, Search, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { exportToCsv } from '../../lib/portalService';
import type { AttendanceRecord, Batch, StudentProfile } from '../../types/portal';

export const AttendanceView: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedBatchId, setSelectedBatchId] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'batches'),
      (snap) => setBatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Batch, 'id'>) }))),
      () => {}
    );
    const u2 = onSnapshot(
      collection(db, 'students'),
      (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentProfile, 'id'>) }))),
      () => {}
    );
    const u3 = onSnapshot(
      collection(db, 'attendance'),
      (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const visibleStudents = useMemo(() => {
    return students.filter((s) => {
      if (selectedBatchId !== 'ALL' && s.batchId !== selectedBatchId) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return s.name.toLowerCase().includes(q) || (s.rollNumber || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [students, selectedBatchId, search]);

  const statusForToday = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    records
      .filter((r) => r.date === selectedDate)
      .forEach((r) => map.set(r.studentId, r));
    return map;
  }, [records, selectedDate]);

  const statsSummary = useMemo(() => {
    let present = 0;
    let absent = 0;
    visibleStudents.forEach((s) => {
      const rec = statusForToday.get(s.id);
      if (rec?.status === 'PRESENT') present += 1;
      else if (rec?.status === 'ABSENT') absent += 1;
    });
    return { present, absent, unmarked: visibleStudents.length - present - absent };
  }, [visibleStudents, statusForToday]);

  const markAttendance = async (student: StudentProfile, status: 'PRESENT' | 'ABSENT') => {
    const batchId = student.batchId || (selectedBatchId !== 'ALL' ? selectedBatchId : 'GENERAL');
    const docId = `${selectedDate}_${batchId}_${student.id}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const now = new Date().toISOString();
    try {
      await setDoc(doc(db, 'attendance', docId), {
        date: selectedDate,
        batchId,
        batchName: student.batchName || 'General',
        studentId: student.id,
        studentUid: student.uid || student.id,
        studentName: student.name,
        rollNumber: student.rollNumber || '',
        status,
        remarks: '',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `attendance/${docId}`);
    }
  };

  const handleExport = () => {
    exportToCsv(
      `gurukul-attendance-${selectedDate}.csv`,
      ['Date', 'Batch', 'Student Name', 'Roll Number', 'Status'],
      visibleStudents.map((s) => [
        selectedDate,
        s.batchName || 'General',
        s.name,
        s.rollNumber || '',
        statusForToday.get(s.id)?.status || 'UNMARKED',
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Attendance Management</h1>
          <p className="text-sm text-slate-500">Mark daily batch attendance and export attendance reports</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 rounded-lg self-start"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs text-slate-500">Present ({selectedDate})</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">{statsSummary.present}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs text-slate-500">Absent ({selectedDate})</p>
          <p className="font-mono text-2xl font-bold text-red-600 tabular-nums mt-1">{statsSummary.absent}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs text-slate-500">Unmarked</p>
          <p className="font-mono text-2xl font-bold text-slate-700 tabular-nums mt-1">{statsSummary.unmarked}</p>
        </div>
      </div>

      {/* Filters + Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
          />
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
          >
            <option value="ALL">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student or roll number..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-mono uppercase text-slate-500">
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Batch</th>
                <th className="py-3 px-4">Status ({selectedDate})</th>
                <th className="py-3 px-4 text-right">Mark Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] text-sm">
              {visibleStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                    <CalendarCheck className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                    No students found for the selected batch filter.
                  </td>
                </tr>
              ) : (
                visibleStudents.map((s) => {
                  const rec = statusForToday.get(s.id);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">{s.name}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{s.rollNumber || '—'}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{s.batchName || 'Unassigned'}</td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold">
                        {rec?.status === 'PRESENT' ? (
                          <span className="text-emerald-700">PRESENT</span>
                        ) : rec?.status === 'ABSENT' ? (
                          <span className="text-red-600">ABSENT</span>
                        ) : (
                          <span className="text-slate-400">UNMARKED</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => markAttendance(s, 'PRESENT')}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                              rec?.status === 'PRESENT'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => markAttendance(s, 'ABSENT')}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                              rec?.status === 'ABSENT'
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                            }`}
                          >
                            <X className="w-3.5 h-3.5" />
                            Absent
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
    </div>
  );
};
