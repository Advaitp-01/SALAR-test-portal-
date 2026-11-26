import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from '../../lib/tenantDb';
import { CheckCircle2, CreditCard, RefreshCw, Search, Trash2, XCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { approvePaymentTransaction, formatCurrencyINR } from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';
import type { PaymentRecord } from '../../types/portal';

export const PaymentsView: React.FC = () => {
  const { firebaseUser, tenantContext, settings } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [search, setSearch] = useState('');

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PaymentRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [banner, setBanner] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'payments'),
      (snap) => {
        setPayments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const counts = useMemo(() => {
    return {
      PENDING: payments.filter((p) => p.status === 'PENDING').length,
      APPROVED: payments.filter((p) => p.status === 'APPROVED').length,
      REJECTED: payments.filter((p) => p.status === 'REJECTED').length,
    };
  }, [payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...payments]
      .filter((p) => {
        if (tab !== 'ALL' && p.status !== tab) return false;
        if (!q) return true;
        return (
          p.studentName.toLowerCase().includes(q) ||
          (p.studentEmail || '').toLowerCase().includes(q) ||
          p.utr.toLowerCase().includes(q) ||
          p.itemTitle.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.submissionDate || '').localeCompare(a.submissionDate || ''));
  }, [payments, tab, search]);

  const verifierEmail = firebaseUser?.email || tenantContext?.email || settings.email || 'admin@institute.local';

  const handleApprove = async (p: PaymentRecord) => {
    setProcessingId(p.id);
    setBanner('');
    try {
      await approvePaymentTransaction(p, verifierEmail);
      setBanner(`Approved UTR ${p.utr} and activated enrollment for ${p.studentName}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `payments/${p.id}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setProcessingId(rejectTarget.id);
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'payments', rejectTarget.id), {
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim() || 'UTR could not be verified in bank statement.',
        verifiedBy: verifierEmail,
        verifiedAt: now,
        updatedAt: now,
      });
      setRejectTarget(null);
      setRejectionReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `payments/${rejectTarget.id}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (p: PaymentRecord) => {
    setProcessingId(p.id);
    try {
      await deleteDoc(doc(db, 'payments', p.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `payments/${p.id}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Payments &amp; UTR Verification</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verify student UPI/UTR reference numbers before granting Course or Test Series access
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg font-semibold">
            {counts.PENDING} Pending
          </span>
          <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-semibold">
            {counts.APPROVED} Verified
          </span>
        </div>
      </div>

      {banner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2.5 text-xs font-medium">
          {banner}
        </div>
      )}

      {/* Tabs + Search */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                tab === t ? 'bg-white text-[#0032A0] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'ALL'
                ? `All (${payments.length})`
                : `${t.charAt(0) + t.slice(1).toLowerCase()} (${counts[t]})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, UTR, or item..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="p-2 border border-[#E2E8F0] rounded-lg text-slate-600 hover:bg-slate-50"
            title="Reset search"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-mono text-slate-500 uppercase">
                <th className="px-4 py-3">Submission Date</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">UTR Reference</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 font-mono">
                    Loading payment submissions...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    <CreditCard className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                    No {tab === 'ALL' ? '' : tab.toLowerCase()} UTR payment records found.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                      {p.submissionDate.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#0F172A]">{p.studentName}</p>
                      <p className="text-[11px] text-slate-500">{p.studentEmail || p.studentUid}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0F172A]">{p.itemTitle}</p>
                      <p className="font-mono text-[11px] text-slate-500">{p.itemType}</p>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-[#0F172A] tabular-nums">
                      {formatCurrencyINR(p.amount)}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[#0032A0]">{p.utr}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                          p.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : p.status === 'REJECTED'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {p.status}
                      </span>
                      {p.rejectionReason && (
                        <p className="text-[11px] text-red-600 mt-0.5 max-w-[180px] truncate">{p.rejectionReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {p.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              disabled={processingId === p.id}
                              onClick={() => handleApprove(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Verify &amp; Approve
                            </button>
                            <button
                              type="button"
                              disabled={processingId === p.id}
                              onClick={() => {
                                setRejectTarget(p);
                                setRejectionReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={processingId === p.id}
                          onClick={() => handleDelete(p)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                          title="Delete record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-display font-bold text-base text-[#0F172A]">Reject UTR Submission</h3>
            <p className="text-xs text-slate-600">
              Student: <strong>{rejectTarget.studentName}</strong> · UTR:{' '}
              <span className="font-mono font-semibold">{rejectTarget.utr}</span>
            </p>
            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rejection Reason</label>
                <input
                  type="text"
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. UTR mismatch or payment not received"
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
