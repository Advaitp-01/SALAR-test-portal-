import React, { useEffect, useState } from 'react';
import { doc, updateDoc } from '../../lib/tenantDb';
import { CheckCircle2, Save, Upload, User } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { uploadFileToServer } from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';

export const StudentProfileView: React.FC = () => {
  const { firebaseUser, studentProfile, refreshStudentProfile } = useAuth();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [classLevel, setClassLevel] = useState<'Class 11th' | 'Class 12th' | 'Dropper / Repeater'>('Class 12th');
  const [targetExam, setTargetExam] = useState<
    'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'Boards + CET' | 'JEE Main + Advanced'
  >('JEE Main');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (!studentProfile) return;
    setName(studentProfile.name || '');
    setMobile(studentProfile.mobile || '');
    setWhatsapp(studentProfile.whatsapp || '');
    setClassLevel(studentProfile.classLevel || 'Class 12th');
    setTargetExam(studentProfile.targetExam || 'JEE Main');
    setPhotoUrl(studentProfile.photoUrl || '');
  }, [studentProfile]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentProfile) return;
    setSaving(true);
    setSavedMsg('');
    try {
      // Strictly update only the 7 keys allowed by firestore.rules self-update policy
      await updateDoc(doc(db, 'students', studentProfile.id), {
        name: name.trim(),
        mobile: mobile.trim(),
        whatsapp: whatsapp.trim(),
        photoUrl: photoUrl.trim(),
        classLevel,
        targetExam,
        updatedAt: new Date().toISOString(),
      });
      await refreshStudentProfile();
      setSavedMsg('Profile updated successfully.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `students/${studentProfile.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">Student Profile</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your personal contact information, profile photo, and target Mathematics examination
        </p>
      </div>

      {savedMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{savedMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
        {/* Photo & Read-only Identifiers */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-5 border-b border-[#E2E8F0]">
          <div className="w-20 h-20 rounded-xl border border-[#E2E8F0] bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={name || 'Student'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-8 h-8 text-slate-400" />
            )}
          </div>
          <div className="space-y-2 flex-1">
            <div>
              <p className="font-display font-bold text-base text-[#0F172A]">
                {studentProfile?.name || firebaseUser?.displayName}
              </p>
              <p className="text-xs font-mono text-slate-500">
                Roll No: {studentProfile?.rollNumber || '—'} · Enrollment ID: {studentProfile?.enrollmentId || '—'}
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Uploading Photo...' : 'Upload Profile Photo'}
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Read-only academic details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 border border-[#E2E8F0] rounded-lg p-4 text-xs">
          <div>
            <span className="font-mono text-[11px] text-slate-500 block">EMAIL</span>
            <span className="font-medium text-[#0F172A] break-all">
              {studentProfile?.email || firebaseUser?.email || '—'}
            </span>
          </div>
          <div>
            <span className="font-mono text-[11px] text-slate-500 block">USERNAME</span>
            <span className="font-mono font-medium text-[#0F172A]">{studentProfile?.username || '—'}</span>
          </div>
          <div>
            <span className="font-mono text-[11px] text-slate-500 block">ASSIGNED BATCH</span>
            <span className="font-medium text-[#0032A0]">{studentProfile?.batchName || 'Unassigned'}</span>
          </div>
        </div>

        {/* Editable Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number</label>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Number</label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Class</label>
            <select
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value as typeof classLevel)}
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
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
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
            >
              <option value="JEE Main">JEE Main Mathematics</option>
              <option value="JEE Advanced">JEE Advanced Mathematics</option>
              <option value="MHT-CET">MHT-CET Mathematics</option>
              <option value="JEE Main + Advanced">JEE Main + Advanced</option>
              <option value="Boards + CET">Boards + CET</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Profile...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};
