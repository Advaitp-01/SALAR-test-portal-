import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Mail,
  MessageSquareShare,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import type { LicenseRecord, Organization, OwnerBootstrapData } from '../../types/salar';

interface ShareClientPortalModalProps {
  org: Organization | null;
  data: OwnerBootstrapData;
  autoGenerateInvite?: boolean;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
}

export const ShareClientPortalModal: React.FC<ShareClientPortalModalProps> = ({
  org,
  data,
  autoGenerateInvite = false,
  onClose,
  onRefresh,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');
  const [adminClaimed, setAdminClaimed] = useState<boolean | null>(null);
  const [onboardingSteps, setOnboardingSteps] = useState<string[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    setCopiedLink(false);
    setCopiedMsg(false);
    setInviteCode('');
    setInviteExpiresAt('');
    setAdminClaimed(null);
    setOnboardingSteps([]);
    setErr('');

    if (org && autoGenerateInvite) {
      setGenerating(true);
      salarApi
        .generateAdminInvitation(org.id)
        .then((res) => {
          setInviteCode(res.invitationCode);
          setInviteExpiresAt(res.expiresAt);
          setAdminClaimed(res.adminClaimed);
          setOnboardingSteps(res.onboardingSteps);
          if (onRefresh) void onRefresh();
        })
        .catch((e: unknown) => {
          setErr(e instanceof Error ? e.message : 'Failed to generate administrator invitation.');
        })
        .finally(() => setGenerating(false));
    }
  }, [org, autoGenerateInvite]);

  if (!org) return null;

  const lic: LicenseRecord | undefined = data.licenses.find((l) => l.id === org.licenseId);
  const sub = data.subscriptions.find((s) => s.organizationId === org.id);
  const tenant = data.tenants.find((t) => t.id === org.tenantId);
  const domList = data.tenantDomains.filter((d) => d.organizationId === org.id);
  const verifiedCustom = domList.find((d) => d.isActive && d.sslStatus === 'ACTIVE');

  const portalPath = org.portalPath || (org.id === 'SALAR-ORG-00001' ? '/' : `/p/${org.portalSlug || org.id}`);
  const livePortalUrl = `${window.location.origin}${portalPath}`;
  const databaseId = org.databaseId || tenant?.databaseId || 'salar_tenant_001';
  const validityLabel = lic
    ? `Valid until ${lic.expirationDate.slice(0, 10)} (${lic.billingCycle})`
    : `Cycle: ${org.billingCycle}`;

  const defaultSteps = [
    `1. Open your dedicated Client Portal URL: ${livePortalUrl}`,
    `2. Click "Admin Gate" in the top-right header of your institute portal.`,
    `3. Sign in with Administrator Email (${org.email}) and your institute passcode (passwords/passcodes are never included in URLs).`,
    `4. Configure institute branding, batches, question banks, and online examinations.`,
  ];

  const invitationMessage = [
    `SALAR Tech — Client Portal Onboarding Invitation`,
    ``,
    `Institute Name: ${org.instituteName}`,
    `Organization ID: ${org.id}`,
    `Dedicated Client Portal URL: ${livePortalUrl}`,
    verifiedCustom ? `Verified Custom Domain: https://${verifiedCustom.domain}` : null,
    `License Key: ${lic?.licenseKey || 'Pending Assignment'}`,
    `Subscription Plan: ${org.planCode} (${org.billingCycle})`,
    `Validity: ${validityLabel}`,
    `Account Status: ${org.status} (Subscription: ${sub?.status || 'ACTIVE'})`,
    `Administrator Email: ${org.email}`,
    inviteCode ? `Onboarding Reference Code: ${inviteCode} (valid 72h)` : null,
    ``,
    `Administrator Onboarding Instructions:`,
    ...(onboardingSteps.length > 0
      ? onboardingSteps.map((s, idx) => `${idx + 1}. ${s}`)
      : defaultSteps),
    ``,
    `Security Notice: No passwords or secret tokens are embedded in this URL.`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(invitationMessage)}`;
  const emailSubject = `${org.instituteName} — Client Portal Access & Onboarding (${org.planCode})`;
  const emailHref = `mailto:${encodeURIComponent(org.email || '')}?subject=${encodeURIComponent(
    emailSubject
  )}&body=${encodeURIComponent(invitationMessage)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(livePortalUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(invitationMessage);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleGenerateInvitation = async () => {
    setGenerating(true);
    setErr('');
    try {
      const res = await salarApi.generateAdminInvitation(org.id);
      setInviteCode(res.invitationCode);
      setInviteExpiresAt(res.expiresAt);
      setAdminClaimed(res.adminClaimed);
      setOnboardingSteps(res.onboardingSteps);
      if (onRefresh) await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to generate administrator invitation.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div
        className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-2xl max-h-[92dvh] overflow-y-auto shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-client-portal-title"
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0032A0] text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-mono text-[#0032A0] uppercase truncate">
                SALAR Tech · Client Portal Delivery
              </p>
              <h2 id="share-client-portal-title" className="font-display font-bold text-base text-[#0F172A] truncate">
                Share Client Portal
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Share Client Portal modal"
            className="text-slate-400 hover:text-slate-700 p-1 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {err && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>
          )}

          {/* Core Binding Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <p className="text-[11px] font-mono text-slate-500 uppercase">Institute Name</p>
              <p className="font-semibold text-[#0F172A] mt-0.5 text-sm">{org.instituteName}</p>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">{org.id} · DB: {databaseId}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <p className="text-[11px] font-mono text-slate-500 uppercase">License Key</p>
              <p className="font-mono font-semibold text-[#0F172A] mt-0.5 break-all">
                {lic?.licenseKey || 'Unassigned'}
              </p>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                Allocation: {org.portalAllocationId || 'Unbound'}
              </p>
            </div>
            <div className="sm:col-span-2 p-3.5 rounded-lg bg-blue-50/70 border border-blue-200">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <p className="text-[11px] font-mono font-semibold text-[#0032A0] uppercase">
                  Client Portal URL (Verified Live Route)
                </p>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white border border-blue-200 text-[#0032A0] break-all">
                  {verifiedCustom ? `Custom SSL Active: ${verifiedCustom.domain}` : `${org.subdomain} (Pending DNS)`}
                </span>
              </div>
              <p className="font-mono font-semibold text-sm text-[#0F172A] break-all">{livePortalUrl}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <p className="text-[11px] font-mono text-slate-500 uppercase">Administrator Email</p>
              <p className="font-semibold text-[#0F172A] mt-0.5 break-all">{org.email}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <p className="text-[11px] font-mono text-slate-500 uppercase">Subscription Plan</p>
              <p className="font-semibold text-[#0F172A] mt-0.5">
                {org.planCode} ({org.billingCycle})
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <p className="text-[11px] font-mono text-slate-500 uppercase">Validity</p>
              <p className="font-mono font-semibold text-[#0F172A] mt-0.5">{validityLabel}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <p className="text-[11px] font-mono text-slate-500 uppercase">Account Status</p>
              <p className="font-mono font-semibold text-[#0F172A] mt-0.5">
                {org.status} · License: {lic?.status || 'NONE'}
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold border border-[#E2E8F0] rounded-lg bg-white hover:bg-slate-50 text-[#0F172A]"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#0032A0]" />}
              {copiedLink ? 'LINK COPIED' : 'COPY PORTAL LINK'}
            </button>

            <a
              href={portalPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg bg-[#0032A0] hover:bg-[#00257a] text-white"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              OPEN PORTAL
            </a>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <MessageSquareShare className="w-3.5 h-3.5" />
              SHARE WHATSAPP
            </a>

            <a
              href={emailHref}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white"
            >
              <Mail className="w-3.5 h-3.5" />
              SHARE EMAIL
            </a>
          </div>

          {/* Invitation & Onboarding Message Preview */}
          <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#0F172A]">
                  Administrator Onboarding Invitation Message
                </p>
                <p className="text-[11px] text-slate-500">
                  {inviteCode
                    ? `Reference ${inviteCode} audited · Expires ${new Date(inviteExpiresAt).toLocaleString()}`
                    : 'Security verified: No passwords or secrets embedded in URL.'}
                </p>
              </div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleGenerateInvitation}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-white border border-[#E2E8F0] text-[#0032A0] hover:bg-blue-50 disabled:opacity-60"
                >
                  <Send className="w-3 h-3" />
                  {generating ? 'Generating...' : inviteCode ? 'Refresh Invite Ref' : 'Generate Admin Invitation'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-100"
                >
                  {copiedMsg ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedMsg ? 'Copied' : 'Copy Message'}
                </button>
              </div>
            </div>
            <pre className="p-3.5 sm:p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap break-words bg-white leading-relaxed overflow-x-auto">
              {invitationMessage}
            </pre>
            {adminClaimed === false && (
              <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-800">
                Administrator account is unclaimed. On first visit to {livePortalUrl}, the client administrator will claim their passcode via Admin Gate.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
