import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, orderBy, query, updateDoc } from '../../lib/tenantDb';
import { db } from '../../lib/firebase';
import { compressImageBlobToDataUrl } from '../../lib/portalService';
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  MessageCircle,
  Play,
  Share2,
  X,
  Zap,
} from 'lucide-react';
import type { Exam } from '../../types/portal';
import type { TenantContextResponse } from '../../types/salar';

interface ShareExamModalProps {
  exam: Exam | null;
  instituteName: string;
  tenantContext?: TenantContextResponse | null;
  onClose: () => void;
  onTestCbt?: (exam: Exam) => void;
  onCopied?: (message: string) => void;
}

function getMarkingFromExam(ex: Exam): { pos: number; neg: number } {
  const tag = (ex.examTag || ex.target || '').toUpperCase();
  if (tag.includes('MHT-CET')) return { pos: 2, neg: 0 };
  return { pos: 4, neg: 1 };
}

export const ShareExamModal: React.FC<ShareExamModalProps> = ({
  exam,
  instituteName,
  tenantContext,
  onClose,
  onTestCbt,
  onCopied,
}) => {
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const portalBase =
    tenantContext?.portalPath && tenantContext.portalPath !== '/' ? tenantContext.portalPath : '';

  const domainOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string; origin: string }> = [];
    const seen = new Set<string>();

    if (browserOrigin) {
      seen.add(browserOrigin);
      opts.push({
        id: 'current',
        label: browserHost.includes('vercel.app')
          ? 'Vercel App Domain'
          : browserHost === 'localhost' || browserHost === '127.0.0.1'
          ? 'Local Preview URL'
          : `Current Domain (${browserHost})`,
        origin: browserOrigin,
      });
    }

    const assignedHost = tenantContext?.verifiedDomain?.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (assignedHost) {
      const assignedOrigin = `https://${assignedHost}`;
      if (!seen.has(assignedOrigin)) {
        seen.add(assignedOrigin);
        opts.push({
          id: 'verified-domain',
          label:
            tenantContext?.domainStatus === 'VERIFIED_ACTIVE'
              ? `Verified Domain (${assignedHost})`
              : `Assigned Domain (${assignedHost})`,
          origin: assignedOrigin,
        });
      }
    }

    return opts;
  }, [browserOrigin, browserHost, tenantContext?.verifiedDomain, tenantContext?.domainStatus]);

  const [selectedOrigin, setSelectedOrigin] = useState<string>(() => browserOrigin || domainOptions[0]?.origin || '');
  const [customOriginMode, setCustomOriginMode] = useState(false);
  const [customOriginInput, setCustomOriginInput] = useState('');
  const [shareMethod, setShareMethod] = useState<'cbt' | 'overview'>('cbt');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!exam) return;
    let active = true;
    const orgId = tenantContext?.organizationId || 'SALAR-ORG-00001';
    const bearer = (() => {
      try {
        if (orgId === 'SALAR-ORG-00001') {
          return window.sessionStorage.getItem('salar_root_admin_bearer') || '';
        }
        return window.sessionStorage.getItem(`salar_tenant_bearer_${orgId}_admin`) || '';
      } catch {
        return '';
      }
    })();

    Promise.all([
      getDocs(query(collection(db, 'exams', exam.id, 'questions'), orderBy('orderIndex', 'asc'))),
      fetch('/api/salar/cloud/status', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(async ([snap, cloudStatus]) => {
        if (!active) return;
        const isEphemeralServer = Boolean(cloudStatus && cloudStatus.persistent === false);
        const rawQuestions = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Record<string, unknown>),
        })) as Array<Record<string, unknown> & { id: string; questionImageUrl?: string }>;

        const questions = await Promise.all(
          rawQuestions.map(async (q) => {
            const url = typeof q.questionImageUrl === 'string' ? q.questionImageUrl : '';
            if (isEphemeralServer && url.startsWith('/api/files/')) {
              try {
                const imgResp = await fetch(url, { cache: 'force-cache' });
                if (imgResp.ok) {
                  const blob = await imgResp.blob();
                  if (blob.type.startsWith('image/')) {
                    const dataUrl = await compressImageBlobToDataUrl(blob);
                    if (dataUrl && dataUrl.startsWith('data:image/')) {
                      void updateDoc(doc(db, 'exams', exam.id, 'questions', q.id), {
                        questionImageUrl: dataUrl,
                      }).catch(() => {});
                      return { ...q, questionImageUrl: dataUrl };
                    }
                  }
                }
              } catch {
                // ignore if unreadable
              }
            }
            return q;
          })
        );

        if (!active) return;
        return fetch('/api/public/cbt/publish-snapshot', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          body: JSON.stringify({
            orgId,
            instituteName,
            exam,
            questions,
          }),
        });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [exam, instituteName, tenantContext?.organizationId]);

  if (!exam) return null;

  const { pos, neg } = getMarkingFromExam(exam);
  const normalizedOrigin = (
    customOriginMode && customOriginInput.trim()
      ? customOriginInput.trim().startsWith('http')
        ? customOriginInput.trim()
        : `https://${customOriginInput.trim()}`
      : selectedOrigin || browserOrigin
  ).replace(/\/+$/, '');

  const directCbtUrl = `${normalizedOrigin}${portalBase}/?cbt=${encodeURIComponent(exam.code)}`;
  const directExamIdUrl = `${normalizedOrigin}${portalBase}/?exam=${encodeURIComponent(exam.id)}`;
  const overviewUrl = `${normalizedOrigin}${portalBase}/?exam=${encodeURIComponent(exam.id)}&view=overview`;
  const activeUrl = shareMethod === 'cbt' ? directCbtUrl : overviewUrl;

  const fullInviteMessage = [
    `*${instituteName} — Online Examination*`,
    `Paper: ${exam.title} (${exam.code})`,
    `Class: ${exam.classLevel} · Target: ${exam.examTag || exam.target}`,
    `Duration: ${exam.durationMinutes} mins · Marking: +${pos} / -${neg} · Questions: ${exam.questionCount || 0}`,
    '',
    shareMethod === 'cbt'
      ? `Direct CBT Exam Link:\n${directCbtUrl}`
      : `Exam Overview & Instructions Link:\n${overviewUrl}`,
    '',
    'Open the link, sign in with your Student account, and start your examination.',
  ].join('\n');

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(fullInviteMessage)}`;
  const emailSubject = `${instituteName}: ${exam.title} (${exam.code}) Online Examination Link`;
  const emailHref = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(fullInviteMessage)}`;

  const handleCopy = (key: string, value: string, toastLabel: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedKey(key);
    onCopied?.(toastLabel);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-3 sm:p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[94dvh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#E2E8F0] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Share2 className="w-5 h-5 text-[#0032A0] shrink-0" />
            <h2 className="font-display font-bold text-base text-[#0F172A] truncate">
              Share Online Examination to Students
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg shrink-0"
            aria-label="Close share examination modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
          {/* Exam Paper Ready Card */}
          <div className="bg-slate-50 border border-[#E2E8F0] rounded-xl p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wide text-[#0032A0]">
                Exam Paper Ready to Share
              </span>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2 py-0.5 bg-white border border-[#E2E8F0] rounded font-bold text-[#0032A0]">
                  {exam.code}
                </span>
                <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded font-semibold text-emerald-700">
                  {exam.classLevel}
                </span>
              </div>
            </div>

            <h3 className="font-display font-bold text-lg text-[#0F172A] leading-snug">{exam.title}</h3>

            <p className="text-xs font-mono text-slate-600 tabular-nums">
              Duration: {exam.durationMinutes} mins <span aria-hidden="true">·</span> Scheme: +{pos} / -{neg}{' '}
              <span aria-hidden="true">·</span>{' '}
              <span className="text-[#0032A0] font-semibold">{exam.questionCount || 0} Questions</span>{' '}
              <span aria-hidden="true">·</span>{' '}
              <span className="text-emerald-700 font-semibold">Short link ready</span>
            </p>
          </div>

          {/* Vercel Public Access & Domain Selector Box */}
          <div className="bg-amber-50/75 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 leading-relaxed">
                <p className="font-semibold text-amber-900">Fix Vercel &ldquo;You Need Access&rdquo; Screen for Students:</p>
                <p className="text-amber-900/90">
                  Vercel preview URLs may enable <span className="font-semibold">Vercel Authentication</span> by default,
                  which shows a login screen before students open the portal. To allow direct student access: go to{' '}
                  <span className="font-semibold">
                    Vercel Dashboard &rarr; Project Settings &rarr; Deployment Protection &rarr; Turn Off &ldquo;Vercel
                    Authentication&rdquo;
                  </span>
                  .
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-slate-700 mr-1">Active Share URL:</span>
              {domainOptions.map((opt) => {
                const active = !customOriginMode && selectedOrigin === opt.origin;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setCustomOriginMode(false);
                      setSelectedOrigin(opt.origin);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      active
                        ? 'bg-[#0032A0] text-white border-[#0032A0]'
                        : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
                    }`}
                  >
                    {active && <Check className="w-3.5 h-3.5" />}
                    {opt.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomOriginMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  customOriginMode
                    ? 'bg-[#0032A0] text-white border-[#0032A0]'
                    : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Custom Domain
              </button>
            </div>

            {customOriginMode && (
              <input
                type="url"
                value={customOriginInput}
                onChange={(e) => setCustomOriginInput(e.target.value)}
                placeholder="https://portal.yourinstitute.com"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-amber-300 rounded-lg focus:outline-none focus:border-[#0032A0]"
              />
            )}
          </div>

          {/* Method Toggle: Direct Test CBT Link vs Overview & Details Link */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-wide text-slate-500">
              Select Sharing Method for Students
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShareMethod('cbt')}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors ${
                  shareMethod === 'cbt'
                    ? 'bg-[#0032A0] text-white border-[#0032A0]'
                    : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <Zap className="w-3.5 h-3.5" />
                Direct Test CBT Link
              </button>
              <button
                type="button"
                onClick={() => setShareMethod('overview')}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors ${
                  shareMethod === 'overview'
                    ? 'bg-[#0032A0] text-white border-[#0032A0]'
                    : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Overview &amp; Details Link
              </button>
            </div>

            {/* Method description */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-slate-700 leading-relaxed">
              {shareMethod === 'cbt' ? (
                <p>
                  <span className="font-semibold text-[#0032A0]">Direct CBT Test Link:</span> When students tap this link
                  on mobile or desktop, they instantly enter the online CBT exam console once signed in, with the
                  real-time countdown timer, question palette, diagram zooms, and submission options.
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-[#0032A0]">Overview &amp; Details Link:</span> Students first see
                  the examination overview card with title, duration, marking scheme, and instructions before launching
                  the live CBT session.
                </p>
              )}
            </div>
          </div>

          {/* Active Share URL Box */}
          <div className="bg-slate-50 border border-[#E2E8F0] rounded-xl p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-mono">
                <span className="font-bold text-[#0032A0] uppercase">
                  {shareMethod === 'cbt' ? 'Direct Student CBT Link' : 'Overview & Details Link'}
                </span>
                <span className="text-slate-500 tabular-nums">{activeUrl.length} chars · Short</span>
              </div>
              {onTestCbt ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onTestCbt(exam);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0032A0] hover:underline"
                >
                  Test CBT Now
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              ) : (
                <a
                  href={activeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0032A0] hover:underline"
                >
                  Open Link
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <input
              type="text"
              readOnly
              value={activeUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full px-3 py-2.5 text-xs font-mono font-semibold text-[#0032A0] bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#0032A0]"
            />
          </div>

          {/* 3 Primary Share Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  'primary',
                  activeUrl,
                  shareMethod === 'cbt' ? 'Direct CBT link copied.' : 'Overview link copied.'
                )
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-[#0032A0] hover:bg-[#00257a] text-white rounded-lg transition-colors"
            >
              {copiedKey === 'primary' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedKey === 'primary' ? 'Copied!' : shareMethod === 'cbt' ? 'Copy CBT Link' : 'Copy Overview Link'}
            </button>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-[#059669] hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>

            <a
              href={emailHref}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white hover:bg-slate-50 text-[#0F172A] border border-[#E2E8F0] rounded-lg transition-colors"
            >
              <Mail className="w-4 h-4 text-slate-600" />
              Email
            </a>
          </div>

          {/* Quick 1-Click Copy Links */}
          <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-wide text-slate-500">
              Quick 1-Click Copy Links
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleCopy('short-cbt', directCbtUrl, 'Short CBT link copied.')}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 border border-[#E2E8F0] rounded-lg text-left transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#0F172A] truncate">Short CBT Link</p>
                  <p className="font-mono text-[11px] text-slate-500 truncate">{portalBase}/?cbt={exam.code}</p>
                </div>
                {copiedKey === 'short-cbt' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleCopy('overview-link', overviewUrl, 'Overview & Details link copied.')}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 border border-[#E2E8F0] rounded-lg text-left transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#0F172A] truncate">Overview &amp; Instructions</p>
                  <p className="font-mono text-[11px] text-slate-500 truncate">
                    {portalBase}/?exam={exam.id}&amp;view=overview
                  </p>
                </div>
                {copiedKey === 'overview-link' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleCopy('exam-id', directExamIdUrl, 'Direct Exam ID link copied.')}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 border border-[#E2E8F0] rounded-lg text-left transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#0F172A] truncate">Direct Exam ID Link</p>
                  <p className="font-mono text-[11px] text-slate-500 truncate">{portalBase}/?exam={exam.id}</p>
                </div>
                {copiedKey === 'exam-id' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleCopy('invite-msg', fullInviteMessage, 'Full WhatsApp/Telegram invitation copied.')}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 border border-[#E2E8F0] rounded-lg text-left transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#0F172A] truncate">Full Student Invite Message</p>
                  <p className="font-mono text-[11px] text-slate-500 truncate">Title · Duration · Marks · Link</p>
                </div>
                {copiedKey === 'invite-msg' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
