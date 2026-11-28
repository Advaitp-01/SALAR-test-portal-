import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  updateDoc,
  writeBatch,
} from '../../lib/tenantDb';
import {
  BookOpen,
  Edit3,
  FileText,
  FolderOpen,
  FolderPlus,
  Layers,
  ListChecks,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import {
  formatCurrencyINR,
  GENERATED_ASSETS,
  syncGurukulCoursesToFirestore,
  uploadFileToServer,
} from '../../lib/portalService';
import type { Course, CourseChapter, CourseModule, Enrollment, Exam, StudentProfile } from '../../types/portal';

export const CoursesView: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Course['category']>('JEE Advanced');
  const [classLevel, setClassLevel] = useState('Class 12th');
  const [subjectTag, setSubjectTag] = useState('PCMB');
  const [price, setPrice] = useState('35000');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [status, setStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED');
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);

  // Inline Assigned Exams search & filters
  const [examSearch, setExamSearch] = useState('');
  const [examClassFilter, setExamClassFilter] = useState('ALL');
  const [examStreamFilter, setExamStreamFilter] = useState('ALL');

  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Modules & Chapters Modal
  const [modulesTarget, setModulesTarget] = useState<Course | null>(null);
  const [modulesDraft, setModulesDraft] = useState<CourseModule[]>([]);
  const [newModTitle, setNewModTitle] = useState('');
  const [activeModId, setActiveModId] = useState('');
  const [newChTitle, setNewChTitle] = useState('');
  const [newChVideo, setNewChVideo] = useState('');
  const [newChDuration, setNewChDuration] = useState('');
  const [newChPdfUrl, setNewChPdfUrl] = useState('');
  const [newChPdfName, setNewChPdfName] = useState('');
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // Assign Students Modal
  const [assignTarget, setAssignTarget] = useState<Course | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'courses'),
      (snap) => {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    const u2 = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentProfile, 'id'>) })));
      },
      () => {}
    );
    const u3 = onSnapshot(
      collection(db, 'enrollments'),
      (snap) => {
        setEnrollments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Enrollment, 'id'>) })));
      },
      () => {}
    );
    const u4 = onSnapshot(
      collection(db, 'exams'),
      (snap) => {
        setExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) })));
      },
      () => {}
    );
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);

  const openCreateModal = () => {
    setEditingCourse(null);
    setName('');
    setDescription('');
    setCategory('JEE Advanced');
    setClassLevel('Class 12th');
    setSubjectTag('PHYSICS · CHEMISTRY · MATHEMATICS · BIOLOGY');
    setPrice('35000');
    setThumbnailUrl(GENERATED_ASSETS.courseJeeAdv);
    setStatus('PUBLISHED');
    setSelectedExamIds([]);
    setExamSearch('');
    setExamClassFilter('ALL');
    setExamStreamFilter('ALL');
    setCourseModalOpen(true);
  };

  const openEditModal = (c: Course) => {
    setEditingCourse(c);
    setName(c.name);
    setDescription(c.description || '');
    setCategory(c.category || 'JEE Main');
    setClassLevel(c.classLevel || 'Class 12th');
    setSubjectTag(c.subjectTag || 'PCMB');
    setPrice(String(c.price ?? 0));
    setThumbnailUrl(c.thumbnailUrl || GENERATED_ASSETS.courseJeeMain);
    setStatus(c.status || 'PUBLISHED');
    setSelectedExamIds(c.examIds || []);
    setExamSearch('');
    setExamClassFilter('ALL');
    setExamStreamFilter('ALL');
    setCourseModalOpen(true);
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

  const handleUploadThumb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingThumb(true);
    try {
      const res = await uploadFileToServer(file);
      setThumbnailUrl(res.url);
    } finally {
      setUploadingThumb(false);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    const payload = {
      name: name.trim(),
      description: description.trim(),
      category,
      classLevel: classLevel.trim() || 'Class 12th',
      subjectTag: subjectTag.trim() || 'PCMB',
      price: Math.max(0, Number(price || 0)),
      thumbnailUrl: thumbnailUrl.trim(),
      status,
      examIds: selectedExamIds,
      updatedAt: now,
    };
    try {
      if (editingCourse) {
        await updateDoc(doc(db, 'courses', editingCourse.id), payload);
      } else {
        await addDoc(collection(db, 'courses'), {
          ...payload,
          enrolledCount: 0,
          modules: [],
          createdAt: now,
        });
      }
      setCourseModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'courses');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (c: Course) => {
    try {
      await updateDoc(doc(db, 'courses', c.id), {
        status: c.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `courses/${c.id}`);
    }
  };

  const handleDeleteCourse = async (c: Course) => {
    try {
      await deleteDoc(doc(db, 'courses', c.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `courses/${c.id}`);
    }
  };

  const handleLoadGurukulCourses = async () => {
    setSyncingCatalog(true);
    setFeedback('');
    try {
      const added = await syncGurukulCoursesToFirestore(courses.map((c) => c.name));
      setFeedback(
        added > 0
          ? `Added ${added} official Giri Sir's Gurukul Classes course(s) from the website catalog.`
          : 'All 5 official Gurukul Classes courses are already synced.'
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to sync Gurukul courses.');
    } finally {
      setSyncingCatalog(false);
    }
  };

  const openModulesModal = (c: Course) => {
    setModulesTarget(c);
    const mods = c.modules ? JSON.parse(JSON.stringify(c.modules)) : [];
    setModulesDraft(mods);
    setActiveModId(mods[0]?.id || '');
    setNewModTitle('');
    setNewChTitle('');
    setNewChVideo('');
    setNewChDuration('');
    setNewChPdfUrl('');
    setNewChPdfName('');
  };

  const addModuleToDraft = () => {
    if (!newModTitle.trim()) return;
    const mod: CourseModule = {
      id: `mod-${Date.now()}`,
      title: newModTitle.trim(),
      chapters: [],
    };
    const next = [...modulesDraft, mod];
    setModulesDraft(next);
    setActiveModId(mod.id);
    setNewModTitle('');
  };

  const handleUploadChapterPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      const res = await uploadFileToServer(file);
      setNewChPdfUrl(res.url);
      setNewChPdfName(res.fileName);
    } finally {
      setUploadingPdf(false);
    }
  };

  const addChapterToActiveModule = () => {
    if (!activeModId || !newChTitle.trim()) return;
    const ch: CourseChapter = {
      id: `ch-${Date.now()}`,
      title: newChTitle.trim(),
      videoUrl: newChVideo.trim(),
      duration: newChDuration.trim(),
      pdfUrl: newChPdfUrl.trim(),
      pdfName: newChPdfName.trim(),
    };
    setModulesDraft((prev) =>
      prev.map((m) => (m.id === activeModId ? { ...m, chapters: [...m.chapters, ch] } : m))
    );
    setNewChTitle('');
    setNewChVideo('');
    setNewChDuration('');
    setNewChPdfUrl('');
    setNewChPdfName('');
  };

  const removeChapter = (modId: string, chId: string) => {
    setModulesDraft((prev) =>
      prev.map((m) => (m.id === modId ? { ...m, chapters: m.chapters.filter((c) => c.id !== chId) } : m))
    );
  };

  const removeModule = (modId: string) => {
    setModulesDraft((prev) => prev.filter((m) => m.id !== modId));
  };

  const saveModulesChanges = async () => {
    if (!modulesTarget) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'courses', modulesTarget.id), {
        modules: modulesDraft,
        updatedAt: new Date().toISOString(),
      });
      setModulesTarget(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `courses/${modulesTarget.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAssignStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget || !selectedStudentId) return;
    const student = students.find((s) => s.id === selectedStudentId);
    if (!student) return;
    const now = new Date().toISOString();
    try {
      const batch = writeBatch(db);
      const enrRef = doc(collection(db, 'enrollments'));
      batch.set(enrRef, {
        studentUid: student.uid || student.id,
        studentId: student.id,
        studentName: student.name,
        itemType: 'COURSE',
        itemId: assignTarget.id,
        itemTitle: assignTarget.name,
        status: 'ACTIVE',
        enrolledAt: now,
      });
      batch.update(doc(db, 'courses', assignTarget.id), {
        enrolledCount: increment(1),
        updatedAt: now,
      });
      await batch.commit();
      setSelectedStudentId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'enrollments');
    }
  };

  const courseEnrollments = (courseId: string) =>
    enrollments.filter((e) => e.itemType === 'COURSE' && e.itemId === courseId && e.status === 'ACTIVE');

  const activeCount = useMemo(() => courses.filter((c) => c.status === 'PUBLISHED').length, [courses]);

  return (
    <div className="space-y-6">
      {/* Header matching Learning / Course Management layout */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-[#0032A0] font-semibold">Learning</p>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Course Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeCount} active courses · Assign Class 11th / 12th / Foundation tests
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={syncingCatalog}
            onClick={handleLoadGurukulCourses}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#0032A0] rounded-lg transition-colors disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {syncingCatalog ? 'Syncing Gurukul...' : 'Load Gurukul Courses'}
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            New Course
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

      {/* Course Cards */}
      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center text-xs font-mono text-slate-500">
          Loading Gurukul courses...
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
          <div>
            <p className="text-sm font-medium text-slate-700">No courses created yet.</p>
            <p className="text-xs text-slate-500 mt-1">
              Import the 5 official Giri Sir&apos;s Gurukul Classes courses or create a new course.
            </p>
          </div>
          <button
            type="button"
            disabled={syncingCatalog}
            onClick={handleLoadGurukulCourses}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Fill Official Gurukul Courses
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((c) => {
            const enrList = courseEnrollments(c.id);
            const totalEnrolled = Math.max(c.enrolledCount || 0, enrList.length);
            const linked = exams.filter((ex) => (c.examIds || []).includes(ex.id));
            return (
              <div
                key={c.id}
                className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col justify-between hover:shadow-sm transition-shadow"
              >
                <div>
                  <div className="aspect-video bg-slate-100 border-b border-[#E2E8F0] relative">
                    <img
                      src={c.thumbnailUrl || GENERATED_ASSETS.courseJeeMain}
                      alt={c.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => togglePublish(c)}
                          title="Click to toggle LIVE / DRAFT"
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            c.status === 'PUBLISHED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-[#E2E8F0]'
                          }`}
                        >
                          {c.status === 'PUBLISHED' ? 'LIVE' : 'DRAFT'}
                        </button>
                        <span className="text-xs font-mono text-slate-500">{totalEnrolled} enrolled</span>
                      </div>
                      <span className="font-mono font-bold text-base text-[#0F172A] tabular-nums">
                        {formatCurrencyINR(c.price)}
                      </span>
                    </div>

                    <div>
                      <p className="text-[11px] font-mono font-semibold text-[#0032A0]">
                        {c.category} · {c.classLevel || 'Class 12th'}
                        {c.subjectTag ? ` · ${c.subjectTag}` : ''}
                      </p>
                      <h2 className="font-display font-bold text-base text-[#0F172A] mt-0.5 leading-snug">{c.name}</h2>
                      {c.description && <p className="text-xs text-slate-600 line-clamp-2 mt-1">{c.description}</p>}
                    </div>

                    {/* Assigned Exams Preview Box */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-600">Assigned Exams ({linked.length})</p>
                      {linked.length === 0 ? (
                        <div className="px-3 py-2.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800">
                          No exams assigned yet. Click &quot;Assign Exams&quot; to attach tests.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-28 overflow-y-auto pr-0.5">
                          {linked.map((ex) => (
                            <div
                              key={ex.id}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-[#E2E8F0] flex items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="font-medium text-[#0F172A] truncate">{ex.title}</span>
                              <span className="font-mono text-[10px] text-slate-500 shrink-0">{ex.code}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-[#E2E8F0] bg-slate-50 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(c)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-100 text-[#0F172A] rounded-lg"
                  >
                    <ListChecks className="w-3.5 h-3.5 text-[#0032A0]" />
                    Assign Exams ({linked.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => openModulesModal(c)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                    title="Manage course modules & PDFs"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    {c.modules?.length || 0}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignTarget(c);
                      setSelectedStudentId('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-100 rounded-lg"
                    title="Enroll student"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(c)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-100 text-slate-700 rounded-lg"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCourse(c)}
                    className="p-1.5 text-slate-400 hover:text-red-600 border border-[#E2E8F0] bg-white rounded-lg hover:bg-red-50"
                    title="Delete course"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Course Modal (with integrated Assigned Exams picker) */}
      {courseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                {editingCourse ? 'Edit Course' : 'New Course'}
              </h3>
              <button
                type="button"
                onClick={() => setCourseModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCourse} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course Title *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Two-Year IIT-JEE Integrated Regular Course"
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
                    <option value="Class 10th (3-Year)">Class 10th (3-Year)</option>
                    <option value="Class 9th (4-Year)">Class 9th (4-Year)</option>
                    <option value="Class 8th (5-Year)">Class 8th (5-Year)</option>
                    <option value="All Classes">All Classes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Track</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Course['category'])}
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="JEE Advanced">JEE Advanced</option>
                    <option value="JEE Main">JEE Main</option>
                    <option value="MHT-CET">MHT-CET</option>
                    <option value="NEET">NEET</option>
                    <option value="Foundation">Foundation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Tag</label>
                  <input
                    type="text"
                    value={subjectTag}
                    onChange={(e) => setSubjectTag(e.target.value)}
                    placeholder="PCMB / Physics · Chemistry · Maths · Bio"
                    className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
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
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Description</label>
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
                  placeholder="Integrated classroom programme with daily practice sheets, supervised study hours & mock tests..."
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course Banner Image</label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="text"
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                    placeholder="/assets/gurukul/course_two-year-iit-jee-integrated-course.webp"
                    className="flex-1 px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
                  <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingThumb ? 'Uploading...' : 'Upload'}
                    <input type="file" accept="image/*" onChange={handleUploadThumb} className="hidden" />
                  </label>
                </div>
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
                  onClick={() => setCourseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingCourse ? 'Save Changes' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modules & Chapters Modal */}
      {modulesTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">
                  Course Curriculum — {modulesTarget.name}
                </h3>
                <p className="text-xs text-slate-500">Add structured modules, chapter PDFs &amp; lectures</p>
              </div>
              <button type="button" onClick={() => setModulesTarget(null)} className="text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Add Module */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newModTitle}
                  onChange={(e) => setNewModTitle(e.target.value)}
                  placeholder="New module title (e.g. Module 02: Vector Algebra & 3D)"
                  className="flex-1 px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
                <button
                  type="button"
                  onClick={addModuleToDraft}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  Add Module
                </button>
              </div>

              {/* Modules List */}
              {modulesDraft.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6 border border-dashed border-[#E2E8F0] rounded-lg">
                  No modules added yet. Create your first module above.
                </p>
              ) : (
                <div className="space-y-4">
                  {modulesDraft.map((mod) => (
                    <div
                      key={mod.id}
                      className={`border rounded-xl p-4 space-y-3 ${
                        activeModId === mod.id ? 'border-[#0032A0] bg-blue-50/20' : 'border-[#E2E8F0]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setActiveModId(mod.id)}
                          className="font-display font-bold text-sm text-[#0F172A] text-left"
                        >
                          {mod.title} ({mod.chapters.length} chapters)
                        </button>
                        <button
                          type="button"
                          onClick={() => removeModule(mod.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove Module
                        </button>
                      </div>

                      {mod.chapters.length > 0 && (
                        <div className="space-y-1.5">
                          {mod.chapters.map((ch) => (
                            <div
                              key={ch.id}
                              className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 flex items-center justify-between text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-[#0F172A] truncate">{ch.title}</p>
                                <div className="flex flex-wrap gap-3 text-[11px] font-mono text-slate-500 mt-0.5">
                                  {ch.duration && <span>{ch.duration}</span>}
                                  {ch.pdfName && (
                                    <span className="inline-flex items-center gap-1 text-[#0032A0]">
                                      <FileText className="w-3 h-3" />
                                      {ch.pdfName}
                                    </span>
                                  )}
                                  {ch.videoUrl && (
                                    <span className="inline-flex items-center gap-1 text-emerald-700">
                                      <Video className="w-3 h-3" />
                                      Video linked
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeChapter(mod.id, ch.id)}
                                className="text-slate-400 hover:text-red-600 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add Chapter to Selected Module */}
              {modulesDraft.length > 0 && (
                <div className="bg-slate-50 border border-[#E2E8F0] rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-[#0F172A]">Add Chapter to Selected Module</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={activeModId}
                      onChange={(e) => setActiveModId(e.target.value)}
                      className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                    >
                      {modulesDraft.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newChTitle}
                      onChange={(e) => setNewChTitle(e.target.value)}
                      placeholder="Chapter title"
                      className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                    />
                    <input
                      type="text"
                      value={newChVideo}
                      onChange={(e) => setNewChVideo(e.target.value)}
                      placeholder="Video URL (optional)"
                      className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                    />
                    <input
                      type="text"
                      value={newChDuration}
                      onChange={(e) => setNewChDuration(e.target.value)}
                      placeholder="Duration (e.g. 2h 15m)"
                      className="px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white rounded-lg cursor-pointer hover:bg-slate-100">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingPdf ? 'Uploading PDF...' : newChPdfName ? `PDF: ${newChPdfName}` : 'Attach Chapter PDF'}
                      <input type="file" accept=".pdf,application/pdf" onChange={handleUploadChapterPdf} className="hidden" />
                    </label>
                    <button
                      type="button"
                      onClick={addChapterToActiveModule}
                      className="px-4 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                    >
                      Add Chapter
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-[#E2E8F0] bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModulesTarget(null)}
                className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveModulesChanges}
                className="px-5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
              >
                {saving ? 'Saving...' : 'Save Curriculum'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Student Enrollment Modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#0F172A]">
                Enroll Student — {assignTarget.name}
              </h3>
              <button type="button" onClick={() => setAssignTarget(null)} className="text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAssignStudent} className="flex gap-2">
              <select
                required
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
              >
                <option value="">Select student...</option>
                {students.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.rollNumber || st.email})
                  </option>
                ))}
              </select>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg">
                Grant Access
              </button>
            </form>
            <div className="border-t border-[#E2E8F0] pt-3 space-y-1.5 max-h-48 overflow-y-auto">
              <p className="text-[11px] font-mono text-slate-500 uppercase">Active Enrollments</p>
              {courseEnrollments(assignTarget.id).length === 0 ? (
                <p className="text-xs text-slate-500">No students enrolled yet.</p>
              ) : (
                courseEnrollments(assignTarget.id).map((enr) => (
                  <div key={enr.id} className="text-xs flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-[#0F172A]">{enr.studentName || enr.studentUid}</span>
                    <span className="font-mono text-emerald-700">{enr.enrolledAt.slice(0, 10)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
