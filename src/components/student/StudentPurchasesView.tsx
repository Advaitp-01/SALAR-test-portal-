import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from '../../lib/tenantDb';
import { ShoppingBag } from 'lucide-react';
import { db } from '../../lib/firebase';
import { formatCurrencyINR } from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';
import type { Enrollment, PaymentRecord } from '../../types/portal';

export const StudentPurchasesView: React.FC = () => {
  const { firebaseUser, isIsolatedTenant } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser) return;
    const u1 = onSnapshot(
      query(collection(db, 'payments'), where('studentUid', '==', firebaseUser.uid)),
      (snap) => {
        setPayments(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) }))
            .sort((a, b) => (b.submissionDate || '').localeCompare(a.submissionDate || ''))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    const u2 = onSnapshot(
      query(collection(db, 'enrollments'), where('studentUid', '==', firebaseUser.uid)),
      (snap) => setEnrollments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Enrollment, 'id'>) }))),
      () => {}
    );
    return () => {
      u1();
      u2();
    };
  }, [firebaseUser]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">My Purchases</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Track submitted UTR payment verification status and active course or test series enrollments
        </p>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-mono text-slate-500 uppercase">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Item Purchased</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">UTR Reference</th>
                <th className="px-4 py-3">Payment Status</th>
                <th className="px-4 py-3">Enrollment Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500 font-mono">
                    Loading purchases...
                  </td>
                </tr>
              ) : payments.length === 0 && enrollments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-700">No purchases or UTR submissions yet.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {isIsolatedTenant
                        ? 'Explore Courses or Test Series to submit an enrollment request.'
                        : 'Explore PCMB Courses or Test Series to submit an enrollment request.'}
                    </p>
                  </td>
                </tr>
              ) : (
                <>
                  {payments.map((p) => {
                    const enr = enrollments.find(
                      (e) => e.paymentId === p.id || (e.itemId === p.itemId && e.status === 'ACTIVE')
                    );
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                          {p.submissionDate.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#0F172A]">{p.itemTitle}</p>
                          <p className="font-mono text-[11px] text-slate-500">{p.itemType}</p>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-[#0F172A] tabular-nums">
                          {formatCurrencyINR(p.amount)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#0032A0] font-semibold">{p.utr}</td>
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
                            <p className="text-[11px] text-red-600 mt-0.5">{p.rejectionReason}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          {enr?.status === 'ACTIVE' ? (
                            <span className="text-emerald-700 font-semibold">ACTIVE</span>
                          ) : (
                            <span className="text-slate-400">LOCKED UNTIL VERIFIED</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {enrollments
                    .filter((e) => !e.paymentId && !payments.some((p) => p.itemId === e.itemId))
                    .map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono text-slate-500">{e.enrolledAt.slice(0, 10)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#0F172A]">{e.itemTitle}</p>
                          <p className="font-mono text-[11px] text-slate-500">{e.itemType}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500">Admin Assigned</td>
                        <td className="px-4 py-3 font-mono text-slate-400">—</td>
                        <td className="px-4 py-3 font-mono text-emerald-700">GRANTED</td>
                        <td className="px-4 py-3 font-mono text-emerald-700 font-semibold">{e.status}</td>
                      </tr>
                    ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
