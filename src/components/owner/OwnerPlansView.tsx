import React, { useEffect, useState } from 'react';
import { Check, CreditCard, Save } from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import { formatCurrencyINR } from '../../lib/portalService';
import type { LicensePlan, OwnerBootstrapData } from '../../types/salar';

interface OwnerPlansViewProps {
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
}

export const OwnerPlansView: React.FC<OwnerPlansViewProps> = ({ data, onRefresh }) => {
  const [editingPlan, setEditingPlan] = useState<LicensePlan | null>(null);
  const [customOrgId, setCustomOrgId] = useState(data.organizations[0]?.id || '');
  const [customPrice, setCustomPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (data.organizations.length > 0 && !data.organizations.some((o) => o.id === customOrgId)) {
      setCustomOrgId(data.organizations[0].id);
    }
  }, [data.organizations, customOrgId]);

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await salarApi.updatePlan(editingPlan.id, {
        name: editingPlan.name,
        monthlyPrice: Number(editingPlan.monthlyPrice),
        quarterlyPrice: Number(editingPlan.quarterlyPrice),
        yearlyPrice: Number(editingPlan.yearlyPrice),
        studentLimit: Number(editingPlan.studentLimit),
        examLimit: Number(editingPlan.examLimit),
        storageLimitMb: Number(editingPlan.storageLimitMb),
        allowDedicated: editingPlan.allowDedicated,
        addOnPrices: editingPlan.addOnPrices,
      });
      setMsg(`Updated ${editingPlan.name} pricing & capacity limits.`);
      setEditingPlan(null);
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to update plan.');
    } finally {
      setBusy(false);
    }
  };

  const handleCustomOrgPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customOrgId) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await salarApi.updateOrganization(customOrgId, {
        customPrice: customPrice.trim() ? Number(customPrice) : null,
      });
      setMsg(`Updated custom contract price override for ${customOrgId}.`);
      setCustomPrice('');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save custom price.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>}

      {/* Plan Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {data.licensePlans.map((plan) => (
          <div key={plan.id} className="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-[#0032A0]">{plan.code}</span>
                <span className="text-[11px] font-mono text-slate-500">
                  {plan.allowDedicated ? 'Dedicated Allowed' : 'Multi-Tenant'}
                </span>
              </div>
              <h3 className="font-display font-bold text-lg text-[#0F172A]">{plan.name}</h3>
              <p className="text-xs text-slate-500 mt-1">{plan.description}</p>

              <div className="mt-4 p-3.5 rounded-lg bg-slate-50 border border-[#E2E8F0] space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Monthly</span>
                  <span className="font-mono font-bold text-[#0F172A] tabular-nums">
                    {formatCurrencyINR(plan.monthlyPrice)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Quarterly</span>
                  <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                    {formatCurrencyINR(plan.quarterlyPrice)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Yearly</span>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    {formatCurrencyINR(plan.yearlyPrice)}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded border border-[#E2E8F0]">
                  <p className="font-mono font-bold text-sm text-[#0F172A] tabular-nums">{plan.studentLimit}</p>
                  <p className="text-[10px] text-slate-500">Students</p>
                </div>
                <div className="p-2 rounded border border-[#E2E8F0]">
                  <p className="font-mono font-bold text-sm text-[#0F172A] tabular-nums">{plan.examLimit}</p>
                  <p className="text-[10px] text-slate-500">Exams</p>
                </div>
                <div className="p-2 rounded border border-[#E2E8F0]">
                  <p className="font-mono font-bold text-sm text-[#0F172A] tabular-nums">
                    {Math.round(plan.storageLimitMb / 1024)}GB
                  </p>
                  <p className="text-[10px] text-slate-500">Storage</p>
                </div>
              </div>

              <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
              <p className="text-[11px] font-mono text-slate-500">
                Add-ons: +{formatCurrencyINR(plan.addOnPrices.extra100StudentsMonthly)}/100 stu · +{formatCurrencyINR(plan.addOnPrices.extra10GbStorageMonthly)}/10GB
              </p>
              <button
                type="button"
                onClick={() => setEditingPlan({ ...plan, addOnPrices: { ...plan.addOnPrices } })}
                className="w-full py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg"
              >
                Edit Plan Pricing &amp; Limits
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Plan Drawer/Form */}
      {editingPlan && (
        <form onSubmit={handleSavePlan} className="bg-white border border-[#0032A0] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <h3 className="font-display font-bold text-base text-[#0F172A]">
              Configure {editingPlan.code} Plan Limits &amp; Rates
            </h3>
            <button
              type="button"
              onClick={() => setEditingPlan(null)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly (INR)</label>
              <input
                type="number"
                value={editingPlan.monthlyPrice}
                onChange={(e) => setEditingPlan({ ...editingPlan, monthlyPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quarterly (INR)</label>
              <input
                type="number"
                value={editingPlan.quarterlyPrice}
                onChange={(e) => setEditingPlan({ ...editingPlan, quarterlyPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Yearly (INR)</label>
              <input
                type="number"
                value={editingPlan.yearlyPrice}
                onChange={(e) => setEditingPlan({ ...editingPlan, yearlyPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Student Limit</label>
              <input
                type="number"
                value={editingPlan.studentLimit}
                onChange={(e) => setEditingPlan({ ...editingPlan, studentLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Limit</label>
              <input
                type="number"
                value={editingPlan.examLimit}
                onChange={(e) => setEditingPlan({ ...editingPlan, examLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Storage (MB)</label>
              <input
                type="number"
                value={editingPlan.storageLimitMb}
                onChange={(e) => setEditingPlan({ ...editingPlan, storageLimitMb: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
            >
              <Save className="w-3.5 h-3.5" />
              Save Plan Configuration
            </button>
          </div>
        </form>
      )}

      {/* Per-Client Custom Pricing Override */}
      <form onSubmit={handleCustomOrgPrice} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#0032A0]" />
          <h3 className="font-display font-bold text-sm text-[#0F172A]">Custom Client Pricing Override</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Client Organization</label>
            <select
              value={customOrgId}
              onChange={(e) => setCustomOrgId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white"
            >
              {data.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} — {o.instituteName} ({o.customPrice ? formatCurrencyINR(o.customPrice) : 'Plan Default'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Contract Price (INR)</label>
            <input
              type="number"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              placeholder="Leave blank to reset to plan default"
              className="w-full px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold bg-[#0F172A] text-white rounded-lg hover:bg-slate-800 h-[38px]"
          >
            Apply Client Pricing Override
          </button>
        </div>
      </form>
    </div>
  );
};
