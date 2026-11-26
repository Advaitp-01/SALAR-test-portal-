import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query } from '../../lib/tenantDb';
import { Bell, Plus, Send, Trash2, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import type { Batch, PortalNotification, StudentProfile } from '../../types/portal';

export const NotificationsView: React.FC = () => {
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<PortalNotification['type']>('EXAM_REMINDER');
  const [targetType, setTargetType] = useState<'ALL' | 'BATCH' | 'STUDENT'>('ALL');
  const [targetBatchId, setTargetBatchId] = useState('');
  const [targetStudentUid, setTargetStudentUid] = useState('');

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc')),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PortalNotification, 'id'>) }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );
    const u2 = onSnapshot(
      collection(db, 'batches'),
      (snap) => setBatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Batch, 'id'>) }))),
      () => {}
    );
    const u3 = onSnapshot(
      collection(db, 'students'),
      (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentProfile, 'id'>) }))),
      () => {}
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const batchObj = batches.find((b) => b.id === targetBatchId);
    try {
      await addDoc(collection(db, 'notifications'), {
        title: title.trim(),
        message: message.trim(),
        type,
        targetType,
        targetBatchId: targetType === 'BATCH' ? targetBatchId : '',
        targetBatchName: targetType === 'BATCH' ? batchObj?.name || '' : '',
        targetStudentUid: targetType === 'STUDENT' ? targetStudentUid : '',
        readBy: [],
        createdAt: new Date().toISOString(),
      });
      setTitle('');
      setMessage('');
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notifications');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Notifications &amp; Announcements</h1>
          <p className="text-sm text-slate-500">Broadcast exam reminders, result releases, and study material updates</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a] self-start"
        >
          <Plus className="w-4 h-4" />
          Create Notification
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center">
          <Bell className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="font-display font-bold text-base text-[#0F172A]">No Notifications Sent</p>
          <p className="text-xs text-slate-500 mt-1">Send announcements to all students or specific batches.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div key={n.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500">
                  <span className="text-[#0032A0] font-semibold">{n.type}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Target: {n.targetType === 'BATCH' ? n.targetBatchName || 'Batch' : n.targetType}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{n.createdAt.slice(0, 16).replace('T', ' ')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700">{(n.readBy || []).length} Read</span>
                </div>
                <h3 className="font-display font-bold text-base text-[#0F172A]">{n.title}</h3>
                <p className="text-sm text-slate-600">{n.message}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(n.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-display font-bold text-base">Send Portal Notification</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSend} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notification Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as PortalNotification['type'])}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="EXAM_REMINDER">Exam Reminder</option>
                    <option value="RESULT">Result Announcement</option>
                    <option value="PAYMENT">Payment Notification</option>
                    <option value="MATERIAL">Study Material Update</option>
                    <option value="GENERAL">General Notice</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Audience</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as typeof targetType)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="ALL">All Students</option>
                    <option value="BATCH">Specific Batch</option>
                    <option value="STUDENT">Specific Student</option>
                  </select>
                </div>
              </div>

              {targetType === 'BATCH' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Batch</label>
                  <select
                    required
                    value={targetBatchId}
                    onChange={(e) => setTargetBatchId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="">Choose batch...</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === 'STUDENT' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Student</label>
                  <select
                    required
                    value={targetStudentUid}
                    onChange={(e) => setTargetStudentUid(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="">Choose student...</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.uid || s.id}>
                        {s.name} ({s.rollNumber || s.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Message</label>
                <textarea
                  rows={3}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg">
                  <Send className="w-3.5 h-3.5" />
                  Send Notification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
