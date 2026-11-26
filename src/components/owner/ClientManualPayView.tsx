import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building,
  CheckCircle2,
  Copy,
  QrCode,
  ShieldCheck,
  Upload,
  Wallet,
} from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import { formatCurrencyINR, uploadFileToServer } from '../../lib/portalService';
import type { ManualPaymentMode, PublicManualPaymentInfo } from '../../types/salar';

interface ClientManualPayViewProps {
  onBackToPortal: () => void;
}

export const ClientManualPayView: React.FC<ClientManualPayViewProps> = ({ onBackToPortal }) => {
  const [info, setInfo] = useState<PublicManualPaymentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [invoiceId, setInvoiceId] = useState('');
  const [paymentMode, setPaymentMode] = useState<ManualPaymentMode>('UPI');
  const [utrOrReference, setUtrOrReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState('');
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => {
    let active = true;
    salarApi
      .getPublicManualPaymentInfo()
      .then((res) => {
        if (!active) return;
        setInfo(res);
        if (res.pendingInvoices.length > 0) {
          setInvoiceId(res.pendingInvoices[0].id);
        }
        if (res.manualGateway.acceptedModes.length > 0) {
          setPaymentMode(res.manualGateway.acceptedModes[0]);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load payment details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCopy = async (label: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedField(label);
      setTimeout(() => setCopiedField(''), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    setError('');
    try {
      const res = await uploadFileToServer(file);
      setReceiptUrl(res.url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to upload receipt proof.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info || !invoiceId) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await salarApi.submitClientManualPayment({
        organizationId: info.organizationId,
        invoiceId,
        paymentMode,
        utrOrReference: utrOrReference.trim(),
        payerName: payerName.trim() || undefined,
        paidDate,
        receiptUrl: receiptUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setSubmittedRef(res.payment.gatewayPaymentId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <header className="bg-white border-b border-[#E2E8F0] h-16 px-4 sm:px-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToPortal}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-[#0F172A] shrink-0 min-h-[38px]"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Back to portal
        </button>
        <div className="text-[11px] sm:text-xs font-mono font-semibold text-slate-600 uppercase truncate text-right">
          SALAR TECH · MANUAL PAY
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-xs font-mono text-slate-500">
            Loading SALAR Tech billing instructions...
          </div>
        ) : !info ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-red-600">
            {error || 'Payment details unavailable.'}
          </div>
        ) : !info.enabled ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-slate-600">
            Manual Payment Gateway is currently unavailable for this account.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Owner UPI QR & Bank Info */}
            <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
              <div>
                <p className="text-[11px] font-mono text-[#0032A0] font-semibold">{info.organizationId}</p>
                <h1 className="font-display font-bold text-lg text-[#0F172A]">{info.instituteName}</h1>
                <p className="text-xs text-slate-500 mt-1">{info.manualGateway.paymentInstructions}</p>
              </div>

              {info.manualGateway.qrCodeUrl && (
                <div className="p-4 rounded-xl bg-slate-50 border border-[#E2E8F0] text-center space-y-2">
                  <img
                    src={info.manualGateway.qrCodeUrl}
                    alt="Owner Payment QR Code"
                    className="w-44 h-44 object-contain mx-auto bg-white p-2 rounded-lg border border-[#E2E8F0]"
                  />
                  <p className="text-xs font-semibold text-[#0F172A]">{info.manualGateway.upiDisplayName}</p>
                </div>
              )}

              {info.manualGateway.upiId && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-[#E2E8F0] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                      <QrCode className="w-3 h-3 text-[#0032A0]" />
                      UPI ID (VPA)
                    </p>
                    <p className="font-mono text-xs font-bold text-[#0F172A] truncate">{info.manualGateway.upiId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('upi', info.manualGateway.upiId)}
                    className="px-2.5 py-1 text-xs font-semibold bg-white border border-[#E2E8F0] rounded hover:bg-slate-100"
                  >
                    {copiedField === 'upi' ? 'Copied' : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {info.manualGateway.accountNumber && (
                <div className="p-4 rounded-lg bg-slate-50 border border-[#E2E8F0] space-y-1.5 text-xs">
                  <p className="font-mono font-semibold text-[#0032A0] flex items-center gap-1.5 mb-2">
                    <Building className="w-3.5 h-3.5" />
                    BANK ACCOUNT DETAILS
                  </p>
                  <p>
                    <span className="text-slate-500">Beneficiary:</span>{' '}
                    <strong className="text-[#0F172A]">{info.manualGateway.bankAccountName}</strong>
                  </p>
                  {info.manualGateway.bankName && (
                    <p>
                      <span className="text-slate-500">Bank:</span> {info.manualGateway.bankName}{' '}
                      {info.manualGateway.branchName ? `(${info.manualGateway.branchName})` : ''}
                    </p>
                  )}
                  <p className="font-mono">
                    <span className="text-slate-500 font-sans">A/C No:</span>{' '}
                    <strong>{info.manualGateway.accountNumber}</strong>
                  </p>
                  <p className="font-mono">
                    <span className="text-slate-500 font-sans">IFSC:</span>{' '}
                    <strong>{info.manualGateway.ifscCode}</strong>
                  </p>
                </div>
              )}
            </div>

            {/* Right: Submit UTR / Proof Form */}
            <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6">
              {submittedRef ? (
                <div className="py-10 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h2 className="font-display font-bold text-lg text-[#0F172A]">
                    Payment Proof Submitted for Verification
                  </h2>
                  <p className="text-xs text-slate-600 max-w-md mx-auto">
                    Reference <strong className="font-mono text-[#0F172A]">{submittedRef}</strong> has been sent to the SALAR Tech billing verification queue. Your invoice and license will activate as soon as the credit is verified.
                  </p>
                </div>
              ) : info.pendingInvoices.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h2 className="font-display font-bold text-base text-[#0F172A]">All Invoices Settled</h2>
                  <p className="text-xs text-slate-500">
                    There are currently no pending subscription invoices for {info.instituteName}.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
                    <Wallet className="w-4 h-4 text-[#0032A0]" />
                    <h2 className="font-display font-bold text-base text-[#0F172A]">Submit Manual Payment Proof</h2>
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Select Open Invoice</label>
                    <select
                      required
                      value={invoiceId}
                      onChange={(e) => setInvoiceId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                    >
                      {info.pendingInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} — {formatCurrencyINR(inv.totalAmount)} ({inv.description})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode</label>
                      <select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value as ManualPaymentMode)}
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                      >
                        {info.manualGateway.acceptedModes.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date</label>
                      <input
                        type="date"
                        required
                        value={paidDate}
                        onChange={(e) => setPaidDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        UTR / Transaction Reference *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={4}
                        value={utrOrReference}
                        onChange={(e) => setUtrOrReference(e.target.value)}
                        placeholder="12-digit UPI UTR / Bank Ref"
                        className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Sender / Payer Name</label>
                      <input
                        type="text"
                        value={payerName}
                        onChange={(e) => setPayerName(e.target.value)}
                        placeholder="Name on bank / UPI account"
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Payment Screenshot / Receipt {info.manualGateway.requireReceiptUpload ? '*' : '(Optional)'}
                    </label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="text"
                        required={info.manualGateway.requireReceiptUpload}
                        value={receiptUrl}
                        onChange={(e) => setReceiptUrl(e.target.value)}
                        placeholder="Upload receipt image or PDF"
                        className="flex-1 px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                      />
                      <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50 shrink-0 min-h-[38px]">
                        <Upload className="w-3.5 h-3.5 text-[#0032A0]" />
                        {uploadingReceipt ? 'Uploading...' : 'Upload'}
                        <input type="file" accept="image/*,.pdf" onChange={handleUploadReceipt} className="hidden" />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any billing remarks"
                      className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 bg-[#0032A0] hover:bg-[#00257a] text-white text-sm font-semibold rounded-lg disabled:opacity-60"
                  >
                    {submitting ? 'Submitting Proof...' : 'Submit Payment Proof for Verification'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
