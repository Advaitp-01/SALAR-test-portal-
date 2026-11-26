import React, { useEffect, useState } from 'react';
import { doc, setDoc } from '../../lib/tenantDb';
import { CheckCircle2, Globe, Mail, Palette, Save, Settings as SettingsIcon, Upload } from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { DEFAULT_INSTITUTE_SETTINGS, uploadFileToServer } from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';
import type { InstituteSettings } from '../../types/portal';

export const SettingsView: React.FC = () => {
  const { settings } = useAuth();
  const [form, setForm] = useState<InstituteSettings>(DEFAULT_INSTITUTE_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    setForm({
      ...DEFAULT_INSTITUTE_SETTINGS,
      ...settings,
      socialLinks: {
        ...DEFAULT_INSTITUTE_SETTINGS.socialLinks,
        ...(settings.socialLinks || {}),
      },
      portalConfig: {
        ...DEFAULT_INSTITUTE_SETTINGS.portalConfig,
        ...(settings.portalConfig || {}),
      },
    });
  }, [settings]);

  const handleUploadAsset = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logoUrl' | 'heroImage'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (field === 'logoUrl') setUploadingLogo(true);
    else setUploadingHero(true);
    try {
      const res = await uploadFileToServer(file);
      setForm((prev) => ({ ...prev, [field]: res.url }));
    } finally {
      if (field === 'logoUrl') setUploadingLogo(false);
      else setUploadingHero(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    const now = new Date().toISOString();

    // Strip any non-schema key such as `id` to match firestore.rules hasOnly()
    const payload = {
      instituteName: form.instituteName.trim() || DEFAULT_INSTITUTE_SETTINGS.instituteName,
      tagline: form.tagline,
      storageTag: form.storageTag,
      logoUrl: form.logoUrl,
      logoWidth: Number(form.logoWidth || 40),
      logoHeight: Number(form.logoHeight || 40),
      heroImage: form.heroImage,
      heroTitle: form.heroTitle,
      heroSubtitle: form.heroSubtitle,
      primaryCta: form.primaryCta,
      secondaryCta: form.secondaryCta,
      faviconUrl: form.faviconUrl,
      primaryColor: form.primaryColor || '#0032A0',
      secondaryColor: form.secondaryColor || '#2563EB',
      address: form.address,
      phone: form.phone,
      whatsapp: form.whatsapp,
      email: form.email,
      website: form.website,
      socialLinks: form.socialLinks,
      portalConfig: form.portalConfig,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, 'settings', 'institute'), payload);
      setSavedMsg('Institute branding, contact info, and portal configuration synced live.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/institute');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Institute Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live branding, contact details, UPI payment configuration, and portal behavior controls
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving Settings...' : 'Save All Settings'}
        </button>
      </div>

      {savedMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {/* Section 1: BRANDING */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E2E8F0]">
          <Palette className="w-4 h-4 text-[#0032A0]" />
          <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">BRANDING</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Institute Name *</label>
            <input
              type="text"
              required
              value={form.instituteName}
              onChange={(e) => setForm((p) => ({ ...p, instituteName: e.target.value }))}
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline</label>
            <input
              type="text"
              value={form.tagline}
              onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Storage Tag</label>
            <input
              type="text"
              value={form.storageTag}
              onChange={(e) => setForm((p) => ({ ...p, storageTag: e.target.value }))}
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Logo URL / Upload</label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                value={form.logoUrl}
                onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
                placeholder="Logo URL or upload file"
                className="flex-1 px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
              />
              <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50">
                <Upload className="w-3.5 h-3.5" />
                {uploadingLogo ? 'Uploading...' : 'Upload'}
                <input type="file" accept="image/*" onChange={(e) => handleUploadAsset(e, 'logoUrl')} className="hidden" />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-0.5">Logo Width (px)</label>
                <input
                  type="number"
                  value={form.logoWidth}
                  onChange={(e) => setForm((p) => ({ ...p, logoWidth: Number(e.target.value) }))}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-0.5">Logo Height (px)</label>
                <input
                  type="number"
                  value={form.logoHeight}
                  onChange={(e) => setForm((p) => ({ ...p, logoHeight: Number(e.target.value) }))}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Hero Banner Image</label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                value={form.heroImage}
                onChange={(e) => setForm((p) => ({ ...p, heroImage: e.target.value }))}
                className="flex-1 px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
              />
              <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50">
                <Upload className="w-3.5 h-3.5" />
                {uploadingHero ? 'Uploading...' : 'Upload'}
                <input type="file" accept="image/*" onChange={(e) => handleUploadAsset(e, 'heroImage')} className="hidden" />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-0.5">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))}
                    className="h-8 w-10 border border-[#E2E8F0] rounded"
                  />
                  <input
                    type="text"
                    value={form.primaryColor}
                    onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-500 mb-0.5">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.secondaryColor}
                    onChange={(e) => setForm((p) => ({ ...p, secondaryColor: e.target.value }))}
                    className="h-8 w-10 border border-[#E2E8F0] rounded"
                  />
                  <input
                    type="text"
                    value={form.secondaryColor}
                    onChange={(e) => setForm((p) => ({ ...p, secondaryColor: e.target.value }))}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Hero Title</label>
            <input
              type="text"
              value={form.heroTitle}
              onChange={(e) => setForm((p) => ({ ...p, heroTitle: e.target.value }))}
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Favicon URL</label>
            <input
              type="text"
              value={form.faviconUrl}
              onChange={(e) => setForm((p) => ({ ...p, faviconUrl: e.target.value }))}
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Hero Subtitle</label>
          <textarea
            rows={2}
            value={form.heroSubtitle}
            onChange={(e) => setForm((p) => ({ ...p, heroSubtitle: e.target.value }))}
            className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Primary CTA Label</label>
            <input
              type="text"
              value={form.primaryCta}
              onChange={(e) => setForm((p) => ({ ...p, primaryCta: e.target.value }))}
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Secondary CTA Label</label>
            <input
              type="text"
              value={form.secondaryCta}
              onChange={(e) => setForm((p) => ({ ...p, secondaryCta: e.target.value }))}
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
        </div>
      </section>

      {/* Section 2: CONTACT INFORMATION */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E2E8F0]">
          <Mail className="w-4 h-4 text-[#0032A0]" />
          <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
            CONTACT INFORMATION
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Center Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Number</label>
            <input
              type="text"
              value={form.whatsapp}
              onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))}
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Website URL</label>
            <input
              type="text"
              value={form.website}
              onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">YouTube Channel</label>
            <input
              type="text"
              value={form.socialLinks.youtube || ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, socialLinks: { ...p.socialLinks, youtube: e.target.value } }))
              }
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Instagram</label>
            <input
              type="text"
              value={form.socialLinks.instagram || ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, socialLinks: { ...p.socialLinks, instagram: e.target.value } }))
              }
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Telegram</label>
            <input
              type="text"
              value={form.socialLinks.telegram || ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, socialLinks: { ...p.socialLinks, telegram: e.target.value } }))
              }
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
        </div>
      </section>

      {/* Section 3: PORTAL CONFIGURATION */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E2E8F0]">
          <SettingsIcon className="w-4 h-4 text-[#0032A0]" />
          <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
            PORTAL CONFIGURATION
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Institute UPI ID (For Purchases)</label>
            <input
              type="text"
              value={form.portalConfig.upiId}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  portalConfig: { ...p.portalConfig, upiId: e.target.value },
                }))
              }
              className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">UPI Payee Name</label>
            <input
              type="text"
              value={form.portalConfig.upiPayeeName}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  portalConfig: { ...p.portalConfig, upiPayeeName: e.target.value },
                }))
              }
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Bank / Payment Instructions Shown to Students
            </label>
            <input
              type="text"
              value={form.portalConfig.bankDetails}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  portalConfig: { ...p.portalConfig, bankDetails: e.target.value },
                }))
              }
              className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {[
            { key: 'allowGoogleAuth', label: 'Allow Google Sign-In for Students' },
            { key: 'allowEmailPasswordAuth', label: 'Allow Email & Password Authentication' },
            { key: 'allowQuickJoin', label: 'Enable Quick Join Candidate Registration' },
            { key: 'allowPublicRegistration', label: 'Enable Public Student Registration' },
            { key: 'autoSubmitOnExpiry', label: 'Auto-Submit CBT Exam on Timer Expiry' },
            { key: 'strictNegativeMarking', label: 'Enforce Negative Marking Rules' },
            { key: 'enableEmailNotifications', label: 'Enable Email Notification Alerts' },
            { key: 'enableWhatsAppNotifications', label: 'Enable WhatsApp Contact & Alerts' },
            { key: 'compactTables', label: 'Use Compact Table Density' },
          ].map((item) => {
            const k = item.key as keyof InstituteSettings['portalConfig'];
            const checked = Boolean(form.portalConfig[k]);
            return (
              <label
                key={item.key}
                className="flex items-center justify-between gap-3 p-3 border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50"
              >
                <span className="text-xs font-medium text-slate-700">{item.label}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      portalConfig: { ...p.portalConfig, [k]: e.target.checked },
                    }))
                  }
                />
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 font-mono">
            <Globe className="w-3.5 h-3.5 text-[#0032A0]" />
            Storage Mode: {form.portalConfig.storageProvider}
          </span>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </section>
    </form>
  );
};
