import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { salarApi } from '../../lib/salarApi';
import type { OwnerBootstrapData } from '../../types/salar';

interface OwnerSecurityViewProps {
  data: OwnerBootstrapData;
  onRefresh: () => Promise<void>;
}

export const OwnerSecurityView: React.FC<OwnerSecurityViewProps> = ({ data, onRefresh }) => {
  const [mfaSecret, setMfaSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handleSetupMfa = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await salarApi.setupMfa();
      setMfaSecret(res.secret);
      setOtpauthUrl(res.otpauthUrl);
      setMsg('Add the TOTP secret below to Google Authenticator / Authy, then verify the 6-digit code.');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'MFA setup failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await salarApi.enableMfa(mfaCode.trim());
      setMsg('RFC-6238 TOTP Two-Factor Authentication is now active on the Owner Console.');
      setMfaSecret('');
      setOtpauthUrl('');
      setMfaCode('');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Invalid authenticator code.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await salarApi.disableMfa();
      setMsg('Two-Factor Authentication disabled.');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to disable MFA.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await salarApi.changePassword(currentPassword, newPassword);
      setMsg('Owner scrypt password hash updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Password change failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeSession = async (id: string) => {
    setBusy(true);
    setErr('');
    try {
      await salarApi.revokeSession(id);
      setMsg('Session terminated and revoked.');
      await onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to revoke session.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TOTP 2FA Panel */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#0032A0]" />
              <h2 className="font-display font-bold text-base text-[#0F172A]">
                Two-Factor Authentication (TOTP MFA)
              </h2>
            </div>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded font-semibold ${
                data.ownerProfile.mfaEnabled
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-800'
              }`}
            >
              {data.ownerProfile.mfaEnabled ? 'ENABLED' : 'NOT ENABLED'}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Protect Platform Owner sign-in with RFC-6238 6-digit authenticator verification codes.
          </p>

          {data.ownerProfile.mfaEnabled ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleDisableMfa}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
            >
              <ShieldOff className="w-4 h-4" />
              Disable 2FA
            </button>
          ) : !mfaSecret ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleSetupMfa}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
            >
              <KeyRound className="w-4 h-4" />
              Generate TOTP Authenticator Secret
            </button>
          ) : (
            <form onSubmit={handleEnableMfa} className="space-y-3 p-4 rounded-lg bg-slate-50 border border-[#E2E8F0]">
              <div>
                <p className="text-[11px] font-mono text-slate-500">SECRET KEY (BASE32)</p>
                <p className="font-mono text-sm font-bold text-[#0F172A] select-all mt-0.5">{mfaSecret}</p>
              </div>
              <div>
                <p className="text-[11px] font-mono text-slate-500">OTPAUTH URI</p>
                <p className="font-mono text-[11px] text-slate-600 break-all">{otpauthUrl}</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  className="flex-1 px-3 py-2 text-sm font-mono border border-[#E2E8F0] rounded-lg bg-white"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold bg-[#0032A0] text-white rounded-lg"
                >
                  Verify &amp; Enable
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Password Change */}
        <form onSubmit={handlePasswordChange} className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#0032A0]" />
            <h2 className="font-display font-bold text-base text-[#0F172A]">Rotate Owner Console Password</h2>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">New Password (min 8 chars)</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold bg-[#0F172A] text-white rounded-lg hover:bg-slate-800"
          >
            Update Scrypt Password
          </button>
        </form>
      </div>

      {/* Active Owner Sessions */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
          <h3 className="font-display font-bold text-sm text-[#0F172A]">Owner Session Registry</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-mono text-slate-500 uppercase">
                <th className="py-3 px-4">Session ID &amp; Actor</th>
                <th className="py-3 px-4">IP / Client</th>
                <th className="py-3 px-4">Issued / Expires</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4 text-right">Revoke</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.ownerSessions.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 px-4 font-mono text-xs">
                    <p className="font-semibold text-[#0F172A]">{s.id}</p>
                    <p className="text-slate-500">@{s.username}</p>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    <p className="font-mono">{s.ip}</p>
                    <p className="text-[11px] text-slate-400 truncate max-w-xs">{s.userAgent}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                    <p>In: {new Date(s.issuedAt).toLocaleString()}</p>
                    <p>Exp: {new Date(s.expiresAt).toLocaleString()}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                        s.revokedAt ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {s.revokedAt ? 'REVOKED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {!s.revokedAt && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRevokeSession(s.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
