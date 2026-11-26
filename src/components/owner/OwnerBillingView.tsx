import React, { useMemo, useState } from 'react';
import {
  Building,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Plus,
  QrCode,
  Receipt,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Upload,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import { formatCurrencyINR, uploadFileToServer } from '../../lib/portalService';
import type {
  ManualPaymentGatewayConfig,
  ManualPaymentMode,
  OwnerBootstrapData,
  SaasPaymentRecord,
  SubscriptionInvoice,
} from '../../types/salar';

interface OwnerBillingViewProps {
  mode: 'billing' | 'payments';
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
}

const ALL_MODES: Array<{ id: ManualPaymentMode; label: string }> = [
  { id: 'UPI', label: 'UPI / QR' },
  { id: 'NEFT_IMPS_RTGS', label: 'NEFT / IMPS / RTGS' },
  { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { id: 'CHEQUE', label: 'Cheque / DD' },
  { id: 'CASH', label: 'Cash Receipt' },
];

export const OwnerBillingView: React.FC<OwnerBillingViewProps> = ({ mode, data, onRefresh }) => {
  const [invOrgId, setInvOrgId] = useState(data.organizations[0]?.id || '');
  const [subtotal, setSubtotal] = useState('4999');
  const [desc, setDesc] = useState('PRO Subscription Renewal + Add-on Capacity');

  // Manual Gateway Config State
  const [mgConfig, setMgConfig] = useState<ManualPaymentGatewayConfig>(data.systemSettings.manualGateway);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [configOpen, setConfigOpen] = useState(true);

  // Record Manual Payment Modal
  const [manualModalInvoice, setManualModalInvoice] = useState<SubscriptionInvoice | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [paymentMode, setPaymentMode] = useState<ManualPaymentMode>('UPI');
  const [utrOrReference, setUtrOrReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [approveImmediately, setApproveImmediately] = useState(true);

  // Reject Modal & Receipt Viewer
  const [rejectTarget, setRejectTarget] = useState<SaasPaymentRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  // Queue filters
  const [payTab, setPayTab] = useState<'PENDING' | 'VERIFIED' | 'REJECTED' | 'ALL'>('ALL');
  const [paySearch, setPaySearch] = useState('');
  const [copiedOrgId, setCopiedOrgId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const openInvoices = useMemo(
    () => data.subscriptionInvoices.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE'),
    [data.subscriptionInvoices]
  );

  const pendingPaymentsCount = useMemo(
    () => data.payments.filter((p) => p.status === 'PENDING').length,
    [data.payments]
  );

  const filteredPayments = useMemo(() => {
    const q = paySearch.trim().toLowerCase();
    return data.payments.filter((p) => {
      if (payTab === 'PENDING' && p.status !== 'PENDING') return false;
      if (payTab === 'VERIFIED' && p.status !== 'VERIFIED') return false;
      if (payTab === 'REJECTED' && p.status !== 'REJECTED' && p.status !== 'REFUNDED') return false;
      if (!q) return true;
      return (
        p.organizationName.toLowerCase().includes(q) ||
        p.gatewayPaymentId.toLowerCase().includes(q) ||
        (p.utrOrReference || '').toLowerCase().includes(q) ||
        (p.payerName || '').toLowerCase().includes(q)
      );
    });
  }, [data.payments, payTab, paySearch]);

  const openRecordModalForInvoice = (inv?: SubscriptionInvoice) => {
    setErr('');
    const target = inv || openInvoices[0] || null;
    setManualModalInvoice(target);
    setSelectedInvoiceId(target?.id || '');
    setPaymentMode('UPI');
    setUtrOrReference('');
    setPayerName(target?.organizationName || '');
    setPaidDate(new Date().toISOString().slice(0, 10));
    setReceiptUrl('');
    setPaymentNotes('');
    setApproveImmediately(true);
    setManualModalOpen(true);
  };

  const handleCopyPayLink = async (orgId: string) => {
    const url = `${window.location.origin}/pay?org=${encodeURIComponent(orgId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedOrgId(orgId);
      setTimeout(() => setCopiedOrgId(null), 2500);
    } catch {
      setMsg(`Share payment link: ${url}`);
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    setErr('');
    try {
      const res = await uploadFileToServer(file);
      setMgConfig((prev) => ({ ...prev, qrCodeUrl: res.url }));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to upload QR image.');
    } finally {
      setUploadingQr(false);
    }
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    setErr('');
    try {
      const res = await uploadFileToServer(file);
      setReceiptUrl(res.url);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to upload receipt proof.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleSaveManualGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await salarApi.updateManualGateway({
        ...mgConfig,
        setAsActiveGateway: true,
      });
      setMsg('Owner Manual Payment Gateway settings saved and set as active payment gateway.');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save manual gateway configuration.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invOrgId) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.createInvoice({
        organizationId: invOrgId,
        subtotal: Number(subtotal) || 0,
        gstPercent: data.systemSettings.defaultGstPercent,
        description: desc,
      });
      setMsg(
        `Created GST Invoice ${res.invoice.invoiceNumber} (${formatCurrencyINR(res.invoice.totalAmount)} incl. GST).`
      );
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create invoice.');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const invId = manualModalInvoice?.id || selectedInvoiceId;
    if (!invId) {
      setErr('Select a pending invoice to record payment against.');
      return;
    }
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.recordManualPayment({
        invoiceId: invId,
        paymentMode,
        utrOrReference: utrOrReference.trim(),
        payerName: payerName.trim() || undefined,
        paidDate,
        receiptUrl: receiptUrl.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
        approveImmediately,
      });
      setMsg(
        res.payment.status === 'VERIFIED'
          ? `Recorded & verified ${paymentMode} payment (${res.payment.gatewayPaymentId}) for ${res.invoice.invoiceNumber}.`
          : `Saved ${paymentMode} payment (${res.payment.gatewayPaymentId}) to Pending Review queue.`
      );
      setManualModalOpen(false);
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to record manual payment.');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (p: SaasPaymentRecord) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.approvePayment(p.id);
      setMsg(
        `Approved ${p.paymentMode || p.gateway} reference ${p.gatewayPaymentId} for ${p.organizationName}. Invoice marked PAID & license active.`
      );
      void res;
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to approve payment.');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await salarApi.rejectPayment(
        rejectTarget.id,
        rejectReason.trim() || 'UTR / payment proof could not be matched in bank statement.'
      );
      setMsg(`Rejected manual payment ${rejectTarget.gatewayPaymentId}.`);
      setRejectTarget(null);
      setRejectReason('');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to reject payment.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefund = async (paymentId: string) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await salarApi.refundPayment(paymentId);
      setMsg('Payment marked refunded and invoice status synchronized.');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Refund failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAcceptedMode = (modeId: ManualPaymentMode) => {
    setMgConfig((prev) => {
      const exists = prev.acceptedModes.includes(modeId);
      const next = exists
        ? prev.acceptedModes.filter((m) => m !== modeId)
        : [...prev.acceptedModes, modeId];
      return { ...prev, acceptedModes: next.length > 0 ? next : prev.acceptedModes };
    });
  };

  return (
    <div className="space-y-6">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>}

      {mode === 'billing' ? (
        <>
          {/* Create GST Invoice */}
          <form onSubmit={handleCreateInvoice} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#0032A0]" />
                <h2 className="font-display font-bold text-sm text-[#0F172A]">Generate GST Subscription Invoice</h2>
              </div>
              <span className="text-xs font-mono text-slate-500">
                GST: {data.systemSettings.defaultGstPercent}% · GSTIN: {data.systemSettings.gstNumber}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Client</label>
                <select
                  value={invOrgId}
                  onChange={(e) => setInvOrgId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  {data.organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id} — {o.instituteName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Base Subtotal (INR)</label>
                <input
                  type="number"
                  required
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg h-[38px]"
              >
                <Plus className="w-4 h-4" />
                Issue Invoice
              </button>
            </div>
          </form>

          {/* Invoices Table */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-[#0F172A]">Subscription Invoices</h3>
              <span className="text-xs font-mono text-slate-500">{data.subscriptionInvoices.length} Total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Subtotal + GST</th>
                    <th className="py-3 px-4">Total (INR)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Manual Payment Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.subscriptionInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0F172A]">{inv.invoiceNumber}</td>
                      <td className="py-3 px-4">
                        <p className="text-xs font-semibold text-[#0F172A]">{inv.organizationName}</p>
                        <p className="text-[11px] text-slate-500">{inv.description}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                        {formatCurrencyINR(inv.subtotal)} + {formatCurrencyINR(inv.gstAmount)} ({inv.gstPercent}%)
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-bold text-[#0F172A] tabular-nums">
                        {formatCurrencyINR(inv.totalAmount)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                            inv.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700'
                              : inv.status === 'PENDING' || inv.status === 'OVERDUE'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {(inv.status === 'PENDING' || inv.status === 'OVERDUE') && (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopyPayLink(inv.organizationId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50 text-slate-700"
                              title="Copy Client Manual Payment Link"
                            >
                              {copiedOrgId === inv.organizationId ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              {copiedOrgId === inv.organizationId ? 'Copied' : 'Pay Link'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openRecordModalForInvoice(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              Collect Manual
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Owner Manual Payment Gateway Top Bar */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Wallet className="w-5 h-5 text-[#0032A0]" />
                <h2 className="font-display font-bold text-base text-[#0F172A]">
                  Owner Manual Payment Gateway (UPI · QR · Bank NEFT/IMPS · Cash · Cheque)
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  ACTIVE GATEWAY: {data.systemSettings.activePaymentGateway}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure your receiving UPI QR &amp; bank details, share the client payment page, and approve or reject incoming UTR proofs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href={`/pay?org=${encodeURIComponent(data.organizations[0]?.id || '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50 text-slate-700"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#0032A0]" />
                Client Pay Page
              </a>
              <button
                type="button"
                onClick={() => setConfigOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg hover:bg-slate-50 text-slate-700"
              >
                <QrCode className="w-3.5 h-3.5 text-[#0032A0]" />
                {configOpen ? 'Hide Gateway Setup' : 'Configure UPI / Bank'}
              </button>
              <button
                type="button"
                onClick={() => openRecordModalForInvoice()}
                disabled={openInvoices.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a] disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Record Manual Payment
              </button>
            </div>
          </div>

          {/* Owner Manual Gateway Configuration Form */}
          {configOpen && (
            <form onSubmit={handleSaveManualGateway} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
                <div>
                  <h3 className="font-display font-bold text-sm text-[#0F172A]">
                    Receiving UPI / QR Code &amp; Bank Settlement Configuration
                  </h3>
                  <p className="text-xs text-slate-500">
                    Displayed to coaching institutes on the client manual payment page (<span className="font-mono">/pay?org=...</span>)
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0F172A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mgConfig.enabled}
                    onChange={(e) => setMgConfig({ ...mgConfig, enabled: e.target.checked })}
                  />
                  Manual Gateway Enabled
                </label>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* UPI & QR Column */}
                <div className="lg:col-span-5 space-y-3 p-4 rounded-xl bg-slate-50 border border-[#E2E8F0]">
                  <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#0032A0]">
                    <QrCode className="w-4 h-4" />
                    UPI &amp; QR CODE COLLECTION
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Owner UPI ID (VPA)</label>
                    <input
                      type="text"
                      value={mgConfig.upiId}
                      onChange={(e) => setMgConfig({ ...mgConfig, upiId: e.target.value })}
                      placeholder="e.g. salartech@okicici"
                      className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Payee Display Name</label>
                    <input
                      type="text"
                      value={mgConfig.upiDisplayName}
                      onChange={(e) => setMgConfig({ ...mgConfig, upiDisplayName: e.target.value })}
                      placeholder="SALAR Tech SaaS Platform"
                      className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">UPI QR Code Image</label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="text"
                        value={mgConfig.qrCodeUrl}
                        onChange={(e) => setMgConfig({ ...mgConfig, qrCodeUrl: e.target.value })}
                        placeholder="Upload QR PNG/JPG or paste URL"
                        className="flex-1 px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg bg-white"
                      />
                      <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-100 shrink-0 min-h-[38px]">
                        <Upload className="w-3.5 h-3.5 text-[#0032A0]" />
                        {uploadingQr ? 'Uploading...' : 'Upload QR'}
                        <input type="file" accept="image/*" onChange={handleQrUpload} className="hidden" />
                      </label>
                    </div>
                    {mgConfig.qrCodeUrl && (
                      <div className="mt-3 p-2 bg-white border border-[#E2E8F0] rounded-lg inline-flex items-center gap-3">
                        <img
                          src={mgConfig.qrCodeUrl}
                          alt="Owner UPI QR"
                          className="w-20 h-20 object-contain rounded border border-slate-100"
                        />
                        <div className="text-[11px] font-mono text-slate-500">
                          <p className="font-semibold text-[#0F172A]">Active QR Preview</p>
                          <button
                            type="button"
                            onClick={() => setMgConfig({ ...mgConfig, qrCodeUrl: '' })}
                            className="text-red-600 hover:underline mt-1"
                          >
                            Remove QR
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bank Account & Rules Column */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#0032A0]">
                    <Building className="w-4 h-4" />
                    BANK ACCOUNT (NEFT / IMPS / RTGS / CHEQUE)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Account Holder Name</label>
                      <input
                        type="text"
                        value={mgConfig.bankAccountName}
                        onChange={(e) => setMgConfig({ ...mgConfig, bankAccountName: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={mgConfig.bankName}
                        onChange={(e) => setMgConfig({ ...mgConfig, bankName: e.target.value })}
                        placeholder="e.g. HDFC Bank / SBI"
                        className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                      <input
                        type="text"
                        value={mgConfig.accountNumber}
                        onChange={(e) => setMgConfig({ ...mgConfig, accountNumber: e.target.value })}
                        placeholder="Enter bank account number"
                        className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code</label>
                        <input
                          type="text"
                          value={mgConfig.ifscCode}
                          onChange={(e) => setMgConfig({ ...mgConfig, ifscCode: e.target.value.toUpperCase() })}
                          placeholder="HDFC0001234"
                          className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
                        <input
                          type="text"
                          value={mgConfig.branchName}
                          onChange={(e) => setMgConfig({ ...mgConfig, branchName: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Accepted Manual Payment Modes</label>
                    <div className="flex flex-wrap gap-3">
                      {ALL_MODES.map((m) => (
                        <label key={m.id} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={mgConfig.acceptedModes.includes(m.id)}
                            onChange={() => toggleAcceptedMode(m.id)}
                          />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Client Payment Instructions</label>
                    <textarea
                      rows={2}
                      value={mgConfig.paymentInstructions}
                      onChange={(e) => setMgConfig({ ...mgConfig, paymentInstructions: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                    <div className="flex flex-wrap gap-5 text-xs text-slate-700">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mgConfig.requireReceiptUpload}
                          onChange={(e) => setMgConfig({ ...mgConfig, requireReceiptUpload: e.target.checked })}
                        />
                        Require Receipt Screenshot
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mgConfig.autoExtendOnApproval}
                          onChange={(e) => setMgConfig({ ...mgConfig, autoExtendOnApproval: e.target.checked })}
                        />
                        Auto-Extend Subscription &amp; License on Approval
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Manual Gateway
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Manual Verification Queue & Settlement Ledger */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', 'PENDING', 'VERIFIED', 'REJECTED'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPayTab(t)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      payTab === t ? 'bg-[#0032A0] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t === 'PENDING'
                      ? `Pending Approval (${pendingPaymentsCount})`
                      : t === 'VERIFIED'
                      ? 'Verified'
                      : t === 'REJECTED'
                      ? 'Rejected / Refunded'
                      : `All (${data.payments.length})`}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-auto sm:min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={paySearch}
                  onChange={(e) => setPaySearch(e.target.value)}
                  placeholder="Search UTR, institute, payer..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                    <th className="py-3 px-4">UTR / Reference &amp; Mode</th>
                    <th className="py-3 px-4">Client &amp; Payer</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Proof</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Owner Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                        No payment records match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 px-4 font-mono text-xs">
                          <p className="font-semibold text-[#0F172A]">{p.utrOrReference || p.gatewayPaymentId}</p>
                          <p className="text-[11px] text-slate-500">
                            {p.paymentMode || p.gateway} · {p.paidDate || p.createdAt.slice(0, 10)}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs font-semibold text-[#0F172A]">{p.organizationName}</p>
                          <p className="text-[11px] text-slate-500">
                            {p.payerName ? `Payer: ${p.payerName}` : p.gatewayOrderId}
                            {p.notes ? ` · ${p.notes}` : ''}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-bold text-[#0F172A] tabular-nums">
                          {formatCurrencyINR(p.amount)}
                        </td>
                        <td className="py-3 px-4">
                          {p.receiptUrl ? (
                            <button
                              type="button"
                              onClick={() => setPreviewReceiptUrl(p.receiptUrl || null)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono font-semibold text-[#0032A0] border border-[#E2E8F0] rounded hover:bg-slate-50"
                            >
                              <Eye className="w-3 h-3" />
                              Receipt
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                              p.status === 'VERIFIED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : p.status === 'PENDING'
                                ? 'bg-amber-50 text-amber-800'
                                : p.status === 'REJECTED'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {p.status}
                          </span>
                          {p.rejectionReason && (
                            <p className="text-[11px] text-red-600 mt-0.5 max-w-[180px] truncate" title={p.rejectionReason}>
                              {p.rejectionReason}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {p.status === 'PENDING' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleApprove(p)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                                >
                                  <ShieldCheck className="w-3 h-3" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setRejectTarget(p);
                                    setRejectReason('');
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
                                >
                                  <XCircle className="w-3 h-3" />
                                  Reject
                                </button>
                              </>
                            )}
                            {p.status === 'VERIFIED' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRefund(p.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Record Manual Payment Modal */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#0032A0]" />
                <h3 className="font-display font-bold text-base text-[#0F172A]">Record Manual SaaS Payment</h3>
              </div>
              <button type="button" onClick={() => setManualModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordManualPayment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pending Invoice *</label>
                <select
                  required
                  value={manualModalInvoice?.id || selectedInvoiceId}
                  onChange={(e) => {
                    const inv = openInvoices.find((i) => i.id === e.target.value) || null;
                    setManualModalInvoice(inv);
                    setSelectedInvoiceId(e.target.value);
                    if (inv) setPayerName(inv.organizationName);
                  }}
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="">Select open invoice...</option>
                  {openInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {inv.organizationName} ({formatCurrencyINR(inv.totalAmount)})
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
                    {ALL_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
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
                    UTR / Transaction / Cheque Ref *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={utrOrReference}
                    onChange={(e) => setUtrOrReference(e.target.value)}
                    placeholder="e.g. 432198765412 or CASH-01"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payer Name</label>
                  <input
                    type="text"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="Account / Sender name"
                    className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Receipt Screenshot / Proof (Optional)
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="text"
                    value={receiptUrl}
                    onChange={(e) => setReceiptUrl(e.target.value)}
                    placeholder="Upload receipt or paste link"
                    className="flex-1 px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
                  <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50 shrink-0 min-h-[38px]">
                    <Upload className="w-3.5 h-3.5 text-[#0032A0]" />
                    {uploadingReceipt ? 'Uploading...' : 'Upload'}
                    <input type="file" accept="image/*,.pdf" onChange={handleReceiptUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Owner Notes</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Verified in HDFC bank statement / received in cash"
                  className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={approveImmediately}
                  onChange={(e) => setApproveImmediately(e.target.checked)}
                />
                Approve immediately (mark invoice PAID &amp; extend subscription/license)
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  {busy ? 'Saving...' : approveImmediately ? 'Record & Verify Paid' : 'Save as Pending Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form onSubmit={handleRejectSubmit} className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4">
            <h3 className="font-display font-bold text-base text-[#0F172A]">
              Reject Payment Reference {rejectTarget.gatewayPaymentId}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rejection Reason</label>
              <textarea
                rows={3}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. UTR not found in bank statement, amount mismatch..."
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
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
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg"
              >
                Confirm Reject
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {previewReceiptUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-xl max-h-[92dvh] overflow-y-auto p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
              <h3 className="font-display font-bold text-sm text-[#0F172A]">Payment Receipt Proof</h3>
              <button type="button" onClick={() => setPreviewReceiptUrl(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            {previewReceiptUrl.toLowerCase().endsWith('.pdf') ? (
              <iframe src={previewReceiptUrl} title="Receipt PDF" className="w-full h-96 border rounded" />
            ) : (
              <img
                src={previewReceiptUrl}
                alt="Payment receipt proof"
                className="max-h-[70vh] mx-auto rounded border border-[#E2E8F0] object-contain"
              />
            )}
            <div className="flex justify-end">
              <a
                href={previewReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
              >
                Open Original File
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
