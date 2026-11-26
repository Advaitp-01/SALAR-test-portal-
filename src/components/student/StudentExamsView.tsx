import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from '../../lib/tenantDb';
import { Award, Clock, FileText, Folder, PlayCircle, Search } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Exam, ExamAssignment, ExamAttempt } from '../../types/portal';

interface StudentExamsViewProps {
  onLaunchExam: (exam: Exam) => void;
}

export const StudentExamsView: React.FC<StudentExamsViewProps> = ({ onLaunchExam }) => {
  const { firebaseUser, studentProfile } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [assignments, setAssignments] = useState<ExamAssignment[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterMode, setFilterMode] = useState<'MY_CLASS' | '11TH' | '12TH' | 'ALL'>('MY_CLASS');
  const [activeFolder, setActiveFolder] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!firebaseUser) return;

    const u1 = onSnapshot(
      query(collection(db, 'exams'), where('status', '==', 'LIVE')),
      (snap) => {
        setExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    const u2 = onSnapshot(
      query(collection(db, 'examAssignments'), where('studentUid', '==', firebaseUser.uid)),
      (snap) => setAssignments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAssignment, 'id'>) }))),
      () => {}
    );
    const u3 = onSnapshot(
      query(collection(db, 'examAttempts'), where('studentUid', '==', firebaseUser.uid)),
      (snap) => setAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamAttempt, 'id'>) }))),
      () => {}
    );

    return () => {
      u1();
      u2();
      u3();
    };
  }, [firebaseUser]);

  const assignedExamIds = useMemo(() => new Set(assignments.map((a) => a.examId)), [assignments]);

  // Student-visible examinations
  const accessibleExams = useMemo(() => {
    const myClass = studentProfile?.classLevel;
    const myBatchId = studentProfile?.batchId;
    return exams.filter((ex) => {
      if (ex.isPublic) return true;
      if (assignedExamIds.has(ex.id)) return true;
      if (myBatchId && (ex.assignedBatchIds || []).includes(myBatchId)) return true;
      if (ex.classLevel === 'All Classes') return true;
      if (myClass && ex.classLevel === myClass) return true;
      return false;
    });
  }, [exams, assignedExamIds, studentProfile?.classLevel, studentProfile?.batchId]);

  const folders = useMemo(() => {
    const map = new Map<string, number>();
    accessibleExams.forEach((ex) => {
      const f = ex.folderName || 'General';
      map.set(f, (map.get(f) || 0) + 1);
    });
    return Array.from(map.entries());
  }, [accessibleExams]);

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase();
    const myClass = studentProfile?.classLevel || 'Class 12th';

    return accessibleExams.filter((ex) => {
      if (filterMode === 'MY_CLASS') {
        if (ex.classLevel !== myClass && ex.classLevel !== 'All Classes' && !assignedExamIds.has(ex.id)) {
          return false;
        }
      } else if (filterMode === '11TH') {
        if (ex.classLevel !== 'Class 11th' && ex.classLevel !== 'All Classes') return false;
      } else if (filterMode === '12TH') {
        if (ex.classLevel !== 'Class 12th' && ex.classLevel !== 'All Classes') return false;
      }

      if (activeFolder !== 'ALL' && (ex.folderName || 'General') !== activeFolder) return false;
      if (!q) return true;
      return (
        ex.title.toLowerCase().includes(q) ||
        ex.code.toLowerCase().includes(q) ||
        ex.target.toLowerCase().includes(q)
      );
    });
  }, [accessibleExams, filterMode, activeFolder, search, studentProfile?.classLevel, assignedExamIds]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Your Examinations</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live Class 11th &amp; Class 12th JEE Main, JEE Advanced &amp; MHT-CET Computer-Based Tests
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by exam title or code..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
          />
        </div>
      </div>

      {/* Class Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap p-1 bg-white border border-[#E2E8F0] rounded-lg gap-1">
          {[
            { id: 'MY_CLASS', label: 'Assigned to My Class' },
            { id: '11TH', label: 'Class 11th Papers' },
            { id: '12TH', label: 'Class 12th Papers' },
            { id: 'ALL', label: 'All Classes' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterMode(f.id as typeof filterMode)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterMode === f.id ? 'bg-[#0032A0] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Folder Chips */}
        {folders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveFolder('ALL')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded-lg border ${
                activeFolder === 'ALL'
                  ? 'bg-blue-50 border-[#0032A0] text-[#0032A0] font-semibold'
                  : 'bg-white border-[#E2E8F0] text-slate-600'
              }`}
            >
              All Folders ({accessibleExams.length})
            </button>
            {folders.map(([folder, count]) => (
              <button
                key={folder}
                type="button"
                onClick={() => setActiveFolder(folder)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded-lg border ${
                  activeFolder === folder
                    ? 'bg-blue-50 border-[#0032A0] text-[#0032A0] font-semibold'
                    : 'bg-white border-[#E2E8F0] text-slate-600'
                }`}
              >
                <Folder className="w-3 h-3" />
                {folder} ({count})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Exam Cards */}
      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center text-xs font-mono text-slate-500">
          Loading published examinations...
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">No examinations match this filter.</p>
          <p className="text-xs text-slate-500 mt-1">
            Switch to All Classes or check back when your faculty publishes new LIVE papers.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredExams.map((ex) => {
            const att = attempts.find((a) => a.examId === ex.id);
            const isCompleted = att?.status === 'SUBMITTED' || att?.status === 'EVALUATED';
            const isInProgress = att?.status === 'IN_PROGRESS';

            return (
              <div
                key={ex.id}
                className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[#0032A0] font-bold">{ex.code}</span>
                    <span className="text-slate-500">
                      {ex.classLevel} · {ex.target}
                    </span>
                  </div>
                  <h2 className="font-display font-bold text-base text-[#0F172A]">{ex.title}</h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-600 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {ex.durationMinutes} min
                    </span>
                    <span>{ex.questionCount || 0} Qs</span>
                    <span>{ex.totalMarks} Marks</span>
                  </div>

                  {isCompleted && (att?.resultsPublished ?? true) && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs font-mono">
                      <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                        <Award className="w-3.5 h-3.5" />
                        Score: {att.finalScore ?? att.autoScore ?? 0}/{att.totalMarks}
                      </span>
                      <span className="text-emerald-700 font-bold">{att.percentage ?? 0}%</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onLaunchExam(ex)}
                  className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                    isCompleted
                      ? 'border border-[#0032A0] text-[#0032A0] bg-white hover:bg-blue-50'
                      : isInProgress
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-[#0032A0] hover:bg-[#00257a] text-white'
                  }`}
                >
                  <PlayCircle className="w-4 h-4" />
                  {isCompleted ? 'View Scorecard & Solutions' : isInProgress ? 'Resume Exam' : 'Start Exam'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
