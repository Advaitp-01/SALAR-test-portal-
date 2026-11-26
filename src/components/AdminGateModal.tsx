import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Info, Lock, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AdminGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminGateModal: React.FC<AdminGateModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { signInWithGoogle, unlockAdminWithToken, isIsolatedTenant, tenantContext, settings } = useAuth();
  const [adminEmail, setAdminEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [requiresClaim, setRequiresClaim] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const tenantOrgId = tenantContext?.organizationId;
  const statusUrl =
    isIsolatedTenant && tenantOrgId
      ? `/api/tenant/${encodeURIComponent(tenantOrgId)}/auth/admin/status`
      : '/api/auth/admin/status';

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setAdminEmail('');
    setPasscode('');
    setConfirmPasscode('');
    fetch(statusUrl)
      .then((r) => r.json())
      .then((d) => {
        setRequiresClaim(Boolean(d.requiresClaim));
      })
      .catch(() => {
        setRequiresClaim(false);
      });
  }, [isOpen, statusUrl]);

  if (!isOpen) return null;

  const handleGoogleAdmin = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await signInWithGoogle('SUPER_ADMIN');
      if (res.error) {
        setError(res.error);
      } else if (res.role === 'SUPER_ADMIN') {
        onSuccess();
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isIsolatedTenant && !adminEmail.trim()) {
      setError('Please enter your institute administrator email.');
      return;
    }
    if (!passcode.trim()) {
      setError('Please enter your administrator passcode.');
      return;
    }

    if (requiresClaim) {
      if (passcode.trim().length < 6) {
        setError('Passcode must be at least 6 characters.');
        return;
      }
      if (passcode !== confirmPasscode) {
        setError('Passcodes do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint =
        isIsolatedTenant && tenantOrgId
          ? `/api/tenant/${encodeURIComponent(tenantOrgId)}/auth/admin/${requiresClaim ? 'claim' : 'login'}`
          : requiresClaim
          ? '/api/auth/admin/claim'
          : '/api/auth/admin/login';
      const resp = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(
          isIsolatedTenant ? { email: adminEmail.trim(), passcode } : { passcode }
        ),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || 'Authentication failed.');
        return;
      }
      if (data.token) {
        unlockAdminWithToken(data.token);
        onSuccess();
      }
    } catch {
      setError('Unable to reach authentication service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-gate-title"
      >
        {/* Header */}
        <div className="bg-[#0032A0] px-5 sm:px-6 py-4 sm:py-5 text-white flex items-start justify-between sticky top-0 z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase text-blue-100 mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Secure Faculty Gate
            </div>
            <h2 id="admin-gate-title" className="text-xl font-bold tracking-tight">
              Admin Console Login
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Admin Console Login"
            className="text-blue-100 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* Admin Account Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#0032A0]" />
              Auto-Stored Super Admin Session · {settings.instituteName}
            </div>
            <p>
              Unlock once with your administrator passcode—your session is remembered automatically on this browser until
              you sign out.{!isIsolatedTenant ? ' Google Sign-In is optional.' : ''}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs leading-relaxed">
              {error}
            </div>
          )}

          {/* Password-based Login (Primary, No Google Login Required) */}
          <form onSubmit={handlePasswordSubmit} className="space-y-3.5" autoComplete="off">
            {requiresClaim && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs">
                First-run setup: Set your initial server-verified Admin Gate passcode (min 6 characters).
              </div>
            )}

            {isIsolatedTenant && (
              <div>
                <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Administrator Email ({settings.instituteName})
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@institute.com"
                  autoComplete="off"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB]"
                />
              </div>
            )}

            <div>
              <label htmlFor="admin-passcode" className="block text-xs font-semibold text-slate-700 mb-1.5">
                {requiresClaim ? 'Create Admin Passcode' : 'Administrator Passcode'}
              </label>
              <div className="relative">
                <input
                  id="admin-passcode"
                  type={showPass ? 'text' : 'password'}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter passcode"
                  autoComplete="new-password"
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB]"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Hide passcode' : 'Show passcode'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {requiresClaim && (
              <div>
                <label htmlFor="admin-passcode-confirm" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Confirm Admin Passcode
                </label>
                <input
                  id="admin-passcode-confirm"
                  type={showPass ? 'text' : 'password'}
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  placeholder="Confirm passcode"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB]"
                />
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5 sm:gap-3 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2.5 min-h-[42px] bg-[#0032A0] hover:bg-[#00257a] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                {loading ? 'Verifying...' : requiresClaim ? 'Claim & Unlock Admin Console' : 'Unlock Admin Console'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 min-h-[42px] border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel &amp; Return
              </button>
            </div>
          </form>

          {!isIsolatedTenant && (
            <>
              <div className="relative flex items-center">
                <div className="flex-grow border-t border-slate-200" />
                <span className="px-3 text-xs font-mono text-slate-400">OPTIONAL GOOGLE SYNC</span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              {/* Optional Google Sign-In */}
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleAdmin}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                Sign in with Google ({'gurukulclassestech@gmail.com'})
              </button>
            </>
          )}

          {/* Faculty help information */}
          <div className="pt-2 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Faculty Directory profiles are managed inside the Admin Console. Faculty members do not have a separate
              portal login; only Super Admin credentials unlock this gate.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
