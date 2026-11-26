import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, Shield, ShieldCheck } from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import type { OwnerAuthStatus } from '../../types/salar';

interface OwnerLoginViewProps {
  onBackToClientPortal: () => void;
  onAuthenticated: () => void;
}

export const OwnerLoginView: React.FC<OwnerLoginViewProps> = ({
  onBackToClientPortal,
  onAuthenticated,
}) => {
  const [status, setStatus] = useState<OwnerAuthStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // First-run claim fields (no hardcoded credentials)
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');

  // TOTP MFA step
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    salarApi
      .getAuthStatus()
      .then((res) => {
        if (active) setStatus(res);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load owner authentication status.');
      })
      .finally(() => {
        if (active) setLoadingStatus(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await salarApi.login({
        username: username.trim(),
        password,
        mfaCode: mfaRequired ? mfaCode.trim() : undefined,
      });
      if (res.mfaRequired) {
        setMfaRequired(true);
        return;
      }
      if (res.ok) {
        onAuthenticated();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (username.trim().length < 3) {
      setError('Owner username must be at least 3 characters.');
      return;
    }
    if (password.length < 8) {
      setError('Owner password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await salarApi.claimOwner({
        username: username.trim(),
        password,
        displayName: displayName.trim() || undefined,
        email: email.trim() || undefined,
      });
      if (res.ok) {
        onAuthenticated();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initialize Owner account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* White Header */}
      <header className="bg-white border-b border-[#E2E8F0] h-16 px-4 sm:px-8 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={onBackToClientPortal}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-[#0F172A] transition-colors shrink-0 min-h-[38px]"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Back to client portal
        </button>

        <div className="text-[11px] sm:text-xs font-mono font-semibold tracking-wider text-slate-600 uppercase truncate text-right">
          SALAR TECH · GOVERNANCE
        </div>
      </header>

      {/* Centered Login Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-xl p-5 sm:p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#0F172A] text-white flex items-center justify-center mb-4">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="font-display text-xl font-bold text-[#0F172A]">Owner License Console</h1>
            <p className="text-xs text-slate-500 mt-1">
              {status?.requiresClaim
                ? 'First-run setup: claim your encrypted Platform Owner account'
                : 'Authorized SALAR Tech SaaS & multi-tenant infrastructure access'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          {loadingStatus ? (
            <div className="py-10 text-center text-xs font-mono text-slate-500">
              Checking governance session...
            </div>
          ) : status?.requiresClaim ? (
            <form onSubmit={handleClaim} className="space-y-4" autoComplete="off">
              <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0] text-xs text-slate-600 leading-relaxed">
                No hardcoded owner credentials exist. Create the initial Platform Owner credentials below (stored with scrypt hashing and HTTP-only signed session cookies).
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Owner Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. SALAR Tech Founder"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0032A0]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Governance Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@salartech.com"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0032A0]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Owner Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter owner username"
                  autoComplete="off"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0032A0]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Owner Password (min 8 characters)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create strong owner password"
                    autoComplete="new-password"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0032A0]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <KeyRound className="w-4 h-4" />
                {submitting ? 'Provisioning Owner Account...' : 'Claim & Enter Owner Console'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Owner Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter owner username"
                  autoComplete="off"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0032A0]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Owner Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter owner password"
                    autoComplete="new-password"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0032A0]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mfaRequired && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-[#E2E8F0] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                    <ShieldCheck className="w-4 h-4 text-[#0032A0]" />
                    2FA Authenticator Code Required
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit TOTP code"
                    className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0032A0]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Lock className="w-4 h-4" />
                {submitting
                  ? 'Verifying Credentials...'
                  : mfaRequired
                  ? 'Verify MFA & Sign In'
                  : 'Sign In to Owner Console'}
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>HTTP-ONLY SESSION COOKIE</span>
            <span>RATE LIMITED</span>
          </div>
        </div>
      </main>
    </div>
  );
};
