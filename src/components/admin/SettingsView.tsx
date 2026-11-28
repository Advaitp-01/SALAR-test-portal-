import React, { useEffect, useState } from 'react';
import { doc, setDoc } from '../../lib/tenantDb';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Globe,
  Layout,
  Mail,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { buildDefaultFrontendConfig, PCMB_DEFAULT_SUBJECTS } from '../../lib/gurukulData';
import { DEFAULT_INSTITUTE_SETTINGS, uploadFileToServer } from '../../lib/portalService';
import { useAuth } from '../../context/AuthContext';
import type {
  FrontendCustomizationConfig,
  FrontendSectionVisibility,
  InstituteSettings,
} from '../../types/portal';

type SettingsTab = 'branding' | 'subjects' | 'frontend' | 'campus' | 'contact';

function resolveFrontend(settings: InstituteSettings): FrontendCustomizationConfig {
  const base = buildDefaultFrontendConfig(settings.instituteName);
  const saved = settings.portalConfig?.frontend;
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    highlights: Array.isArray(saved.highlights) ? saved.highlights : base.highlights,
    subjects: Array.isArray(saved.subjects) ? saved.subjects : base.subjects,
    approachSteps: Array.isArray(saved.approachSteps) ? saved.approachSteps : base.approachSteps,
    features: Array.isArray(saved.features) ? saved.features : base.features,
    campusFacilities: Array.isArray(saved.campusFacilities) ? saved.campusFacilities : base.campusFacilities,
    performers: Array.isArray(saved.performers) ? saved.performers : base.performers,
    gpatSchedules: Array.isArray(saved.gpatSchedules) ? saved.gpatSchedules : base.gpatSchedules,
    testimonial: { ...base.testimonial, ...(saved.testimonial || {}) },
    sectionHeadings: { ...base.sectionHeadings, ...(saved.sectionHeadings || {}) },
    sectionVisibility: { ...base.sectionVisibility, ...(saved.sectionVisibility || {}) },
  };
}

export const SettingsView: React.FC = () => {
  const { settings } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('branding');
  const [form, setForm] = useState<InstituteSettings>(DEFAULT_INSTITUTE_SETTINGS);
  const [fe, setFe] = useState<FrontendCustomizationConfig>(() => resolveFrontend(DEFAULT_INSTITUTE_SETTINGS));
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingCampusIdx, setUploadingCampusIdx] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    const merged: InstituteSettings = {
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
    };
    setForm(merged);
    setFe(resolveFrontend(merged));
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

  const handleUploadCampusImage = async (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCampusIdx(idx);
    try {
      const res = await uploadFileToServer(file);
      setFe((prev) => ({
        ...prev,
        campusFacilities: prev.campusFacilities.map((c, i) => (i === idx ? { ...c, imageUrl: res.url } : c)),
      }));
    } finally {
      setUploadingCampusIdx(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    const now = new Date().toISOString();

    // Enforce firestore.rules field length bounds cleanly & exclude any non-schema `id`
    const cleanInstituteName = (form.instituteName.trim() || DEFAULT_INSTITUTE_SETTINGS.instituteName).slice(0, 150);
    const payload = {
      instituteName: cleanInstituteName,
      tagline: (form.tagline || '').slice(0, 200),
      storageTag: (form.storageTag || '').slice(0, 120),
      logoUrl: form.logoUrl || '',
      logoWidth: Number(form.logoWidth || 40),
      logoHeight: Number(form.logoHeight || 40),
      heroImage: form.heroImage || '',
      heroTitle: (form.heroTitle || '').slice(0, 200),
      heroSubtitle: (form.heroSubtitle || '').slice(0, 400),
      primaryCta: (form.primaryCta || '').slice(0, 100),
      secondaryCta: (form.secondaryCta || '').slice(0, 100),
      faviconUrl: form.faviconUrl || '',
      primaryColor: form.primaryColor || '#0032A0',
      secondaryColor: form.secondaryColor || '#2563EB',
      address: (form.address || '').slice(0, 400),
      phone: (form.phone || '').slice(0, 60),
      whatsapp: (form.whatsapp || '').slice(0, 60),
      email: (form.email || '').slice(0, 120),
      website: (form.website || '').slice(0, 250),
      socialLinks: form.socialLinks,
      portalConfig: {
        ...form.portalConfig,
        frontend: fe,
      },
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, 'settings', 'institute'), payload);
      setSavedMsg('All branding, PCMB subjects, frontend sections, and portal controls synced live.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/institute');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadGurukulDefaults = () => {
    setForm(DEFAULT_INSTITUTE_SETTINGS);
    setFe(buildDefaultFrontendConfig(DEFAULT_INSTITUTE_SETTINGS.instituteName));
    setSavedMsg('Loaded Gurukul PCMB default website content into editor. Click "Save All Changes" to publish.');
  };

  const handleResetTenantFrontend = () => {
    const fresh = buildDefaultFrontendConfig(form.instituteName);
    setFe(fresh);
    setSavedMsg(`Reset frontend blocks for ${form.instituteName || 'this portal'}. Click "Save All Changes" to publish.`);
  };

  const toggleVis = (key: keyof FrontendSectionVisibility, val: boolean) => {
    setFe((prev) => ({
      ...prev,
      sectionVisibility: {
        ...prev.sectionVisibility,
        [key]: val,
      },
    }));
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'branding', label: 'Branding & Hero', icon: Palette },
    { id: 'subjects', label: 'Subjects Taught (PCMB)', icon: BookOpen },
    { id: 'frontend', label: 'Frontend Sections & Copy', icon: Layout },
    { id: 'campus', label: 'Campus, Performers & G-PAT', icon: Award },
    { id: 'contact', label: 'Contact, UPI & Portal Rules', icon: SettingsIcon },
  ];

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Institute &amp; Frontend Studio</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Edit every public website section, PCMB subjects taught, branding, contact details, UPI, and exam rules live
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetTenantFrontend}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-slate-700 rounded-lg whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Current Defaults
          </button>
          <button
            type="button"
            onClick={handleLoadGurukulDefaults}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#0032A0] rounded-lg whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5" />
            Load Gurukul PCMB Defaults
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving All...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {savedMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {/* Segmented Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 border border-[#E2E8F0] rounded-xl overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                active ? 'bg-white text-[#0032A0] shadow-xs' : 'text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: BRANDING & HERO */}
      {activeTab === 'branding' && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E2E8F0]">
            <Palette className="w-4 h-4 text-[#0032A0]" />
            <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
              Branding, Visual Identity &amp; Hero Banner
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Institute Name *</label>
              <input
                type="text"
                required
                maxLength={150}
                value={form.instituteName}
                onChange={(e) => setForm((p) => ({ ...p, instituteName: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline (max 200 chars)</label>
              <input
                type="text"
                maxLength={200}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hero Headline (max 200 chars)</label>
              <input
                type="text"
                maxLength={200}
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Hero Subtitle (max 400 chars)</label>
            <textarea
              rows={2}
              maxLength={400}
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
      )}

      {/* TAB 2: SUBJECTS TAUGHT (PCMB) */}
      {activeTab === 'subjects' && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
            <div>
              <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
                Subjects Taught Showcase (Physics, Chemistry, Mathematics &amp; Biology)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Customize subjects displayed on the public portal for IIT-JEE, NEET, MHT-CET &amp; Foundation students
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setFe((p) => ({ ...p, subjects: PCMB_DEFAULT_SUBJECTS.map((s) => ({ ...s })) }))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg text-[#0032A0] hover:bg-slate-50"
              >
                Load Standard PCMB (4 Subjects)
              </button>
              <button
                type="button"
                onClick={() =>
                  setFe((p) => ({
                    ...p,
                    subjects: [
                      ...p.subjects,
                      {
                        id: `subj-${Date.now()}`,
                        name: 'New Subject',
                        tagline: 'Stream · Track',
                        description: 'Structured theory, daily practice sheets, and timed CBT drills.',
                        topics: 'Key syllabus topics',
                      },
                    ],
                  }))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg hover:bg-[#00257a]"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Subject
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subjects Section Heading</label>
              <input
                type="text"
                value={fe.sectionHeadings.subjectsHeading}
                onChange={(e) =>
                  setFe((p) => ({
                    ...p,
                    sectionHeadings: { ...p.sectionHeadings, subjectsHeading: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subjects Section Subheading</label>
              <input
                type="text"
                value={fe.sectionHeadings.subjectsSubheading}
                onChange={(e) =>
                  setFe((p) => ({
                    ...p,
                    sectionHeadings: { ...p.sectionHeadings, subjectsSubheading: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={fe.sectionVisibility.showSubjects}
              onChange={(e) => toggleVis('showSubjects', e.target.checked)}
            />
            Show Subjects Taught section on Public Portal
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fe.subjects.map((subj, idx) => (
              <div key={subj.id || idx} className="border border-[#E2E8F0] rounded-xl p-4 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#0032A0]">SUBJECT 0{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setFe((p) => ({
                        ...p,
                        subjects: p.subjects.filter((_, i) => i !== idx),
                      }))
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Subject Name</label>
                    <input
                      type="text"
                      value={subj.name}
                      onChange={(e) =>
                        setFe((p) => ({
                          ...p,
                          subjects: p.subjects.map((s, i) => (i === idx ? { ...s, name: e.target.value } : s)),
                        }))
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Short Tagline</label>
                    <input
                      type="text"
                      value={subj.tagline}
                      onChange={(e) =>
                        setFe((p) => ({
                          ...p,
                          subjects: p.subjects.map((s, i) => (i === idx ? { ...s, tagline: e.target.value } : s)),
                        }))
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={subj.description}
                    onChange={(e) =>
                      setFe((p) => ({
                        ...p,
                        subjects: p.subjects.map((s, i) => (i === idx ? { ...s, description: e.target.value } : s)),
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Key Topics</label>
                  <input
                    type="text"
                    value={subj.topics}
                    onChange={(e) =>
                      setFe((p) => ({
                        ...p,
                        subjects: p.subjects.map((s, i) => (i === idx ? { ...s, topics: e.target.value } : s)),
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: FRONTEND SECTIONS & COPY */}
      {activeTab === 'frontend' && (
        <div className="space-y-6">
          {/* Announcement, About & Headings */}
          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
            <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A] pb-2 border-b border-[#E2E8F0]">
              Announcement Strip, About &amp; Section Headings
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Top Announcement Text</label>
                <input
                  type="text"
                  value={fe.announcementText}
                  onChange={(e) => setFe((p) => ({ ...p, announcementText: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fe.announcementEnabled}
                    onChange={(e) => setFe((p) => ({ ...p, announcementEnabled: e.target.checked }))}
                  />
                  Enable Announcement Banner
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Established Year</label>
                <input
                  type="text"
                  value={fe.establishedYear}
                  onChange={(e) => setFe((p) => ({ ...p, establishedYear: e.target.value }))}
                  className="w-full px-3 py-2 text-xs font-mono border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Founder / Academic Lead</label>
                <input
                  type="text"
                  value={fe.founderName}
                  onChange={(e) => setFe((p) => ({ ...p, founderName: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Institute Motto</label>
                <input
                  type="text"
                  value={fe.motto}
                  onChange={(e) => setFe((p) => ({ ...p, motto: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">About Section Heading</label>
                <input
                  type="text"
                  value={fe.aboutHeading}
                  onChange={(e) => setFe((p) => ({ ...p, aboutHeading: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Office Hours</label>
                <input
                  type="text"
                  value={fe.officeHours}
                  onChange={(e) => setFe((p) => ({ ...p, officeHours: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">About Section Description</label>
              <textarea
                rows={2}
                value={fe.aboutBody}
                onChange={(e) => setFe((p) => ({ ...p, aboutBody: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Courses Section Heading</label>
                <input
                  type="text"
                  value={fe.sectionHeadings.coursesHeading}
                  onChange={(e) =>
                    setFe((p) => ({
                      ...p,
                      sectionHeadings: { ...p.sectionHeadings, coursesHeading: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Courses Subheading</label>
                <input
                  type="text"
                  value={fe.sectionHeadings.coursesSubheading}
                  onChange={(e) =>
                    setFe((p) => ({
                      ...p,
                      sectionHeadings: { ...p.sectionHeadings, coursesSubheading: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Test Series Section Heading</label>
                <input
                  type="text"
                  value={fe.sectionHeadings.testSeriesHeading}
                  onChange={(e) =>
                    setFe((p) => ({
                      ...p,
                      sectionHeadings: { ...p.sectionHeadings, testSeriesHeading: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Test Series Subheading</label>
                <input
                  type="text"
                  value={fe.sectionHeadings.testSeriesSubheading}
                  onChange={(e) =>
                    setFe((p) => ({
                      ...p,
                      sectionHeadings: { ...p.sectionHeadings, testSeriesSubheading: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Footer Note</label>
              <input
                type="text"
                value={fe.footerNote}
                onChange={(e) => setFe((p) => ({ ...p, footerNote: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
            </div>
          </section>

          {/* Hero Highlights */}
          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
                Hero Highlight KPIs
              </h3>
              <button
                type="button"
                onClick={() =>
                  setFe((p) => ({ ...p, highlights: [...p.highlights, { value: '100%', label: 'New Metric' }] }))
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Add KPI
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {fe.highlights.map((h, idx) => (
                <div key={idx} className="border border-[#E2E8F0] rounded-lg p-3 space-y-2 bg-slate-50">
                  <div className="flex justify-between items-center text-[11px] font-mono text-slate-500">
                    <span>KPI {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => setFe((p) => ({ ...p, highlights: p.highlights.filter((_, i) => i !== idx) }))}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                  <input
                    type="text"
                    value={h.value}
                    onChange={(e) =>
                      setFe((p) => ({
                        ...p,
                        highlights: p.highlights.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)),
                      }))
                    }
                    placeholder="Value (e.g. PCMB)"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-[#E2E8F0] rounded"
                  />
                  <input
                    type="text"
                    value={h.label}
                    onChange={(e) =>
                      setFe((p) => ({
                        ...p,
                        highlights: p.highlights.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                      }))
                    }
                    placeholder="Label"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Approach Steps & Key Features */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
                  Teaching Approach Steps
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setFe((p) => ({
                      ...p,
                      approachSteps: [...p.approachSteps, { title: 'Step', description: 'Step details' }],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Step
                </button>
              </div>
              <div className="space-y-3">
                {fe.approachSteps.map((step, idx) => (
                  <div key={idx} className="border border-[#E2E8F0] rounded-lg p-3 bg-slate-50 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={step.title}
                        onChange={(e) =>
                          setFe((p) => ({
                            ...p,
                            approachSteps: p.approachSteps.map((x, i) =>
                              i === idx ? { ...x, title: e.target.value } : x
                            ),
                          }))
                        }
                        className="flex-1 px-2.5 py-1.5 text-xs font-semibold bg-white border border-[#E2E8F0] rounded"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFe((p) => ({ ...p, approachSteps: p.approachSteps.filter((_, i) => i !== idx) }))
                        }
                        className="text-xs text-red-600 hover:underline px-1"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="text"
                      value={step.description}
                      onChange={(e) =>
                        setFe((p) => ({
                          ...p,
                          approachSteps: p.approachSteps.map((x, i) =>
                            i === idx ? { ...x, description: e.target.value } : x
                          ),
                        }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded"
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
                  Academic Features &amp; Pillars
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setFe((p) => ({
                      ...p,
                      features: [...p.features, { title: 'Feature', description: 'Feature description' }],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Feature
                </button>
              </div>
              <div className="space-y-3">
                {fe.features.map((feat, idx) => (
                  <div key={idx} className="border border-[#E2E8F0] rounded-lg p-3 bg-slate-50 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={feat.title}
                        onChange={(e) =>
                          setFe((p) => ({
                            ...p,
                            features: p.features.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)),
                          }))
                        }
                        className="flex-1 px-2.5 py-1.5 text-xs font-semibold bg-white border border-[#E2E8F0] rounded"
                      />
                      <button
                        type="button"
                        onClick={() => setFe((p) => ({ ...p, features: p.features.filter((_, i) => i !== idx) }))}
                        className="text-xs text-red-600 hover:underline px-1"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="text"
                      value={feat.description}
                      onChange={(e) =>
                        setFe((p) => ({
                          ...p,
                          features: p.features.map((x, i) =>
                            i === idx ? { ...x, description: e.target.value } : x
                          ),
                        }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Section Visibility Toggles */}
          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
            <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
              Public Frontend Section Visibility
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(
                [
                  { key: 'showAnnouncement', label: 'Top Announcement Strip' },
                  { key: 'showHighlights', label: 'Hero Highlights KPI Strip' },
                  { key: 'showSubjects', label: 'Subjects Taught (PCMB)' },
                  { key: 'showCourses', label: 'Courses Catalog Section' },
                  { key: 'showTestSeries', label: 'Online Test Series Section' },
                  { key: 'showGpat', label: 'G-PAT Schedule Matrix' },
                  { key: 'showAbout', label: 'About Institute Block' },
                  { key: 'showApproach', label: 'Teaching Approach Steps' },
                  { key: 'showFeatures', label: 'Academic Feature Pillars' },
                  { key: 'showCampus', label: 'Campus & Residential Cards' },
                  { key: 'showPerformers', label: 'Toppers & Rank Holders' },
                  { key: 'showTestimonial', label: 'Student Testimonial Card' },
                  { key: 'showContact', label: 'Contact & Footer Section' },
                ] as Array<{ key: keyof FrontendSectionVisibility; label: string }>
              ).map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between gap-2 p-3 border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50"
                >
                  <span className="text-xs font-medium text-slate-700">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(fe.sectionVisibility[item.key])}
                    onChange={(e) => toggleVis(item.key, e.target.checked)}
                  />
                </label>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: CAMPUS, PERFORMERS, TESTIMONIAL & G-PAT */}
      {activeTab === 'campus' && (
        <div className="space-y-6">
          {/* Campus Facilities */}
          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E2E8F0]">
              <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
                Campus &amp; Residential Facilities
              </h2>
              <button
                type="button"
                onClick={() =>
                  setFe((p) => ({
                    ...p,
                    campusFacilities: [
                      ...p.campusFacilities,
                      { title: 'New Facility', description: 'Facility highlights', imageUrl: '' },
                    ],
                  }))
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Facility
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Campus Section Heading</label>
              <input
                type="text"
                value={fe.sectionHeadings.campusHeading}
                onChange={(e) =>
                  setFe((p) => ({ ...p, sectionHeadings: { ...p.sectionHeadings, campusHeading: e.target.value } }))
                }
                className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fe.campusFacilities.map((fac, idx) => (
                <div key={idx} className="border border-[#E2E8F0] rounded-xl p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#0032A0]">FACILITY 0{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setFe((p) => ({ ...p, campusFacilities: p.campusFacilities.filter((_, i) => i !== idx) }))
                      }
                      className="text-xs text-red-600 font-semibold hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    type="text"
                    value={fac.title}
                    onChange={(e) =>
                      setFe((p) => ({
                        ...p,
                        campusFacilities: p.campusFacilities.map((x, i) =>
                          i === idx ? { ...x, title: e.target.value } : x
                        ),
                      }))
                    }
                    placeholder="Facility title"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                  />
                  <textarea
                    rows={2}
                    value={fac.description}
                    onChange={(e) =>
                      setFe((p) => ({
                        ...p,
                        campusFacilities: p.campusFacilities.map((x, i) =>
                          i === idx ? { ...x, description: e.target.value } : x
                        ),
                      }))
                    }
                    placeholder="Description"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={fac.imageUrl || ''}
                      onChange={(e) =>
                        setFe((p) => ({
                          ...p,
                          campusFacilities: p.campusFacilities.map((x, i) =>
                            i === idx ? { ...x, imageUrl: e.target.value } : x
                          ),
                        }))
                      }
                      placeholder="Image URL"
                      className="flex-1 px-3 py-1.5 text-xs font-mono bg-white border border-[#E2E8F0] rounded-lg"
                    />
                    <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-white border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-100">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingCampusIdx === idx ? '...' : 'Upload'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadCampusImage(e, idx)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Performers / Toppers */}
          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E2E8F0]">
              <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
                Toppers &amp; Verified Rank Holders
              </h2>
              <button
                type="button"
                onClick={() =>
                  setFe((p) => ({
                    ...p,
                    performers: [...p.performers, { name: 'Student Name', exam: 'IIT-JEE', score: 'AIR Rank' }],
                  }))
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Performer
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Performers Section Heading</label>
              <input
                type="text"
                value={fe.sectionHeadings.performersHeading}
                onChange={(e) =>
                  setFe((p) => ({
                    ...p,
                    sectionHeadings: { ...p.sectionHeadings, performersHeading: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {fe.performers.map((perf, idx) => (
                <div key={idx} className="border border-[#E2E8F0] rounded-lg p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span>RANK HOLDER {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => setFe((p) => ({ ...p, performers: p.performers.filter((_, i) => i !== idx) }))}
                      className="text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    type="text"
                    value={perf.name}
                    onChange={(e) =>
                      setFe((p) => ({
                        ...p,
                        performers: p.performers.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                      }))
                    }
                    placeholder="Student Name"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded"
                  />
                  <input
                    type="text"
                    value={perf.exam}
                    onChange={(e) =>
                      setFe((p) => ({
                        ...p,
                        performers: p.performers.map((x, i) => (i === idx ? { ...x, exam: e.target.value } : x)),
                      }))
                    }
                    placeholder="Exam (e.g. NEET-UG / JEE Advanced)"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-[#E2E8F0] rounded"
                  />
                  <input
                    type="text"
                    value={perf.score}
                    onChange={(e) =>
                      setFe((p) => ({
                        ...p,
                        performers: p.performers.map((x, i) => (i === idx ? { ...x, score: e.target.value } : x)),
                      }))
                    }
                    placeholder="Rank / Score"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-[#E2E8F0] rounded"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Student Testimonial & G-PAT Schedules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
              <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
                Featured Student Testimonial
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Student Name</label>
                  <input
                    type="text"
                    value={fe.testimonial.name}
                    onChange={(e) =>
                      setFe((p) => ({ ...p, testimonial: { ...p.testimonial, name: e.target.value } }))
                    }
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Batch / Role</label>
                  <input
                    type="text"
                    value={fe.testimonial.role}
                    onChange={(e) =>
                      setFe((p) => ({ ...p, testimonial: { ...p.testimonial, role: e.target.value } }))
                    }
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Quote</label>
                <textarea
                  rows={3}
                  value={fe.testimonial.quote}
                  onChange={(e) =>
                    setFe((p) => ({ ...p, testimonial: { ...p.testimonial, quote: e.target.value } }))
                  }
                  className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg"
                />
              </div>
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
                  G-PAT Examination Schedules
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setFe((p) => ({
                      ...p,
                      gpatSchedules: [
                        ...p.gpatSchedules,
                        { title: 'GPAT Foundation Test', classLevel: 'Class 10', code: 'GC-GPAT', duration: '60 mins' },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </div>
              <div className="space-y-2.5">
                {fe.gpatSchedules.map((gpat, idx) => (
                  <div key={idx} className="border border-[#E2E8F0] rounded-lg p-3 bg-slate-50 grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={gpat.code}
                      onChange={(e) =>
                        setFe((p) => ({
                          ...p,
                          gpatSchedules: p.gpatSchedules.map((x, i) =>
                            i === idx ? { ...x, code: e.target.value } : x
                          ),
                        }))
                      }
                      className="col-span-3 px-2 py-1 text-[11px] font-mono bg-white border border-[#E2E8F0] rounded"
                    />
                    <input
                      type="text"
                      value={gpat.title}
                      onChange={(e) =>
                        setFe((p) => ({
                          ...p,
                          gpatSchedules: p.gpatSchedules.map((x, i) =>
                            i === idx ? { ...x, title: e.target.value } : x
                          ),
                        }))
                      }
                      className="col-span-5 px-2 py-1 text-xs bg-white border border-[#E2E8F0] rounded"
                    />
                    <input
                      type="text"
                      value={gpat.classLevel}
                      onChange={(e) =>
                        setFe((p) => ({
                          ...p,
                          gpatSchedules: p.gpatSchedules.map((x, i) =>
                            i === idx ? { ...x, classLevel: e.target.value } : x
                          ),
                        }))
                      }
                      className="col-span-3 px-2 py-1 text-[11px] bg-white border border-[#E2E8F0] rounded"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFe((p) => ({ ...p, gpatSchedules: p.gpatSchedules.filter((_, i) => i !== idx) }))
                      }
                      className="col-span-1 text-red-600 text-xs font-bold"
                      aria-label="Remove schedule"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 5: CONTACT, UPI & PORTAL RULES */}
      {activeTab === 'contact' && (
        <div className="space-y-6">
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
                  maxLength={400}
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

          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E2E8F0]">
              <SettingsIcon className="w-4 h-4 text-[#0032A0]" />
              <h2 className="font-display font-bold text-sm uppercase tracking-wider text-[#0F172A]">
                UPI &amp; PORTAL CONFIGURATION
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Institute UPI ID (For Purchases)
                </label>
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
        </div>
      )}
    </form>
  );
};

