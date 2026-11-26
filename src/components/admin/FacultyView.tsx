import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from '../../lib/tenantDb';
import { Edit2, GraduationCap, Mail, Phone, Plus, Trash2, Upload, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { GENERATED_ASSETS, uploadFileToServer } from '../../lib/portalService';
import type { Batch, FacultyProfile } from '../../types/portal';

export const FacultyView: React.FC = () => {
  const [faculty, setFaculty] = useState<FacultyProfile[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FacultyProfile | null>(null);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [qualification, setQualification] = useState('');
  const [subjectSpecialization, setSubjectSpecialization] = useState('Mathematics');
  const [experience, setExperience] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [assignedBatches, setAssignedBatches] = useState<string[]>([]);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'faculty'),
      (snap) => setFaculty(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FacultyProfile, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'faculty')
    );
    const u2 = onSnapshot(
      collection(db, 'batches'),
      (snap) => setBatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Batch, 'id'>) }))),
      () => {}
    );
    return () => {
      u1();
      u2();
    };
  }, []);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setQualification('');
    setSubjectSpecialization('Mathematics (Calculus & Algebra)');
    setExperience('');
    setEmail('');
    setContactNumber('');
    setPhotoUrl('');
    setAssignedBatches([]);
    setStatus('ACTIVE');
    setModalOpen(true);
  };

  const openEdit = (f: FacultyProfile) => {
    setEditing(f);
    setName(f.name);
    setQualification(f.qualification);
    setSubjectSpecialization(f.subjectSpecialization);
    setExperience(f.experience || '');
    setEmail(f.email || '');
    setContactNumber(f.contactNumber || '');
    setPhotoUrl(f.photoUrl || '');
    setAssignedBatches(f.assignedBatches || []);
    setStatus(f.status);
    setModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFileToServer(file);
      setPhotoUrl(res.url);
    } finally {
      setUploading(false);
    }
  };

  const toggleBatch = (batchName: string) => {
    setAssignedBatches((prev) =>
      prev.includes(batchName) ? prev.filter((b) => b !== batchName) : [...prev, batchName]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const payload = {
      name: name.trim(),
      qualification: qualification.trim(),
      subjectSpecialization: subjectSpecialization.trim(),
      experience: experience.trim(),
      email: email.trim(),
      contactNumber: contactNumber.trim(),
      photoUrl: photoUrl.trim(),
      assignedBatches,
      status,
      updatedAt: now,
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'faculty', editing.id), payload);
      } else {
        await addDoc(collection(db, 'faculty'), { ...payload, createdAt: now });
      }
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'faculty');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'faculty', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `faculty/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Faculty Directory</h1>
          <p className="text-sm text-slate-500">
            Mathematics department faculty management directory (administrative roster only)
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0032A0] hover:bg-[#00257a] rounded-lg transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          Add Faculty
        </button>
      </div>

      {faculty.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <GraduationCap className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="font-display font-bold text-base text-[#0F172A]">No Faculty Profiles Yet</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">Add Mathematics professors and mentors to assign them to batches.</p>
          <button
            type="button"
            onClick={openAdd}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0032A0] rounded-lg"
          >
            Add First Faculty Member
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {faculty.map((f) => (
            <div key={f.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={f.photoUrl || GENERATED_ASSETS.facultyDirector}
                      alt={f.name}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-xl object-cover border border-[#E2E8F0] shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display font-bold text-base text-[#0F172A] truncate">{f.name}</h3>
                      <p className="text-xs text-slate-500 truncate">{f.qualification}</p>
                      <span
                        className={`inline-block mt-1 text-[11px] font-mono font-semibold ${
                          f.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {f.status} · {f.experience || 'Senior Faculty'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <p className="font-medium text-slate-800">{f.subjectSpecialization}</p>
                  {f.email && (
                    <p className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{f.email}</span>
                    </p>
                  )}
                  {f.contactNumber && (
                    <p className="flex items-center gap-2 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{f.contactNumber}</span>
                    </p>
                  )}
                </div>

                {(f.assignedBatches || []).length > 0 && (
                  <div className="text-xs">
                    <p className="text-[11px] font-mono text-slate-400 uppercase mb-1">Assigned Batches</p>
                    <p className="text-slate-700">{(f.assignedBatches || []).join(' · ')}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => openEdit(f)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(f.id)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-display font-bold text-base text-[#0F172A]">
                {editing ? 'Edit Faculty Profile' : 'Add Mathematics Faculty'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Faculty Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Qualification</label>
                  <input
                    type="text"
                    required
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    placeholder="M.Sc. Mathematics, IIT"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Experience</label>
                  <input
                    type="text"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="15 Years"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Specialization (Maths)</label>
                <input
                  type="text"
                  required
                  value={subjectSpecialization}
                  onChange={(e) => setSubjectSpecialization(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Number</label>
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Profile Photo</label>
                  <label className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading...' : photoUrl ? 'Change Photo' : 'Upload Photo'}
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>
              {batches.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Assigned Batches</label>
                  <div className="flex flex-wrap gap-2">
                    {batches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBatch(b.name)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          assignedBatches.includes(b.name)
                            ? 'bg-[#0032A0] text-white border-[#0032A0]'
                            : 'bg-white text-slate-700 border-[#E2E8F0]'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg">
                  Save Faculty
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
