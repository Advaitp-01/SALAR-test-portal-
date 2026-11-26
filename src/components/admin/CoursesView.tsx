import React, { useEffect, useState } from 'react';
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
  FolderPlus,
  Layers,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { formatCurrencyINR, GENERATED_ASSETS, uploadFileToServer } from '../../lib/portalService';
import type { Course, CourseChapter, CourseModule, Enrollment, StudentProfile } from '../../types/portal';

export const CoursesView: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'Foundation'>('JEE Main');
  const [classLevel, setClassLevel] = useState('Class 12th');
  const [price, setPrice] = useState('4999');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [status, setStatus] = useState<'PUBLISHED' | 'DRAFT'>('DRAFT');
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [saving, setSaving] = useState(false);

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
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const openCreateModal = () => {
    setEditingCourse(null);
    setName('');
    setDescription('');
    setCategory('JEE Main');
    setClassLevel('Class 12th');
    setPrice('4999');
    setThumbnailUrl(GENERATED_ASSETS.courseJeeMain);
    setStatus('DRAFT');
    setCourseModalOpen(true);
  };

  const openEditModal = (c: Course) => {
    setEditingCourse(c);
    setName(c.name);
    setDescription(c.description || '');
    setCategory(c.category);
    setClassLevel(c.classLevel || 'Class 12th');
    setPrice(String(c.price));
    setThumbnailUrl(c.thumbnailUrl || '');
    setStatus(c.status);
    setCourseModalOpen(true);
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
      classLevel,
      price: Math.max(0, Number(price || 0)),
      thumbnailUrl: thumbnailUrl.trim(),
      status,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Courses</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Mathematics courses for Class 11th, Class 12th, JEE Main, JEE Advanced &amp; MHT-CET
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Create Course
        </button>
      </div>

      {/* Course Cards */}
      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center text-xs font-mono text-slate-500">
          Loading Mathematics courses...
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">No courses created yet.</p>
          <p className="text-xs text-slate-500 mt-1">Click Create Course to add structured modules and PDFs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((c) => {
            const enrList = courseEnrollments(c.id);
            return (
              <div
                key={c.id}
                className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-4/3 bg-slate-100 border-b border-[#E2E8F0] relative">
                    <img
                      src={c.thumbnailUrl || GENERATED_ASSETS.courseJeeMain}
                      alt={c.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#0032A0] font-semibold">
                        {c.category} · {c.classLevel || 'Class 12th'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          c.status === 'PUBLISHED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-[#E2E8F0]'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <h2 className="font-display font-bold text-base text-[#0F172A]">{c.name}</h2>
                    <p className="text-xs text-slate-600 line-clamp-2">{c.description}</p>
                    <div className="flex items-center justify-between pt-2 text-xs font-mono text-slate-600 tabular-nums">
                      <span className="text-base font-bold text-[#0F172A]">{formatCurrencyINR(c.price)}</span>
                      <span>
                        {c.modules?.length || 0} Modules · {Math.max(c.enrolledCount || 0, enrList.length)} Enrolled
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-[#E2E8F0] bg-slate-50 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openModulesModal(c)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Modules ({c.modules?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignTarget(c);
                      setSelectedStudentId('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-100 rounded-lg"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Enroll
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePublish(c)}
                    className="px-2.5 py-1.5 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-100 rounded-lg"
                  >
                    {c.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(c)}
                    className="p-1.5 text-slate-500 hover:text-[#0032A0] rounded-lg ml-auto"
                    title="Edit course"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCourse(c)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                    title="Delete course"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Course Modal */}
      {courseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                {editingCourse ? 'Edit Mathematics Course' : 'Create Mathematics Course'}
              </h3>
              <button type="button" onClick={() => setCourseModalOpen(false)} className="text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCourse} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. JEE Main Calculus & Algebra Mastery"
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as typeof category)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="JEE Main">JEE Main</option>
                    <option value="JEE Advanced">JEE Advanced</option>
                    <option value="MHT-CET">MHT-CET</option>
                    <option value="Foundation">Foundation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class</label>
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
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fee (INR)</label>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course Thumbnail</label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="text"
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                    placeholder="Image URL or upload"
                    className="flex-1 px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingThumb ? 'Uploading...' : 'Upload'}
                    <input type="file" accept="image/*" onChange={handleUploadThumb} className="hidden" />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Publication Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'PUBLISHED' | 'DRAFT')}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="DRAFT">DRAFT (Hidden from public)</option>
                  <option value="PUBLISHED">PUBLISHED (Live in Student Portal)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCourseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
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
                <p className="text-xs text-slate-500">Add structured Mathematics modules, chapter PDFs &amp; lectures</p>
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
