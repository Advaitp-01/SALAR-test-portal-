import type {
  BillingCycle,
  DeploymentType,
  InfrastructureSnapshot,
  LicensePlan,
  LicenseRecord,
  LicenseStatus,
  ManualPaymentGatewayConfig,
  ManualPaymentMode,
  Organization,
  OwnerAuthStatus,
  OwnerBootstrapData,
  PlanCode,
  PortalAllocation,
  PublicManualPaymentInfo,
  ReassignmentStepReport,
  RestoreJob,
  SaasPaymentRecord,
  ScalingPolicy,
  SubscriptionInvoice,
  SystemSettings,
  TenantContextResponse,
  TenantDomain,
} from '../types/salar';

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  const text = await res.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: text || `Request failed (${res.status})` };
  }

  if (!res.ok) {
    const errObj = parsed as { error?: string; pendingInvoices?: string[]; mfaRequired?: boolean };
    const err = new Error(errObj.error || `HTTP ${res.status}`) as Error & {
      status?: number;
      pendingInvoices?: string[];
      mfaRequired?: boolean;
    };
    err.status = res.status;
    err.pendingInvoices = errObj.pendingInvoices;
    err.mfaRequired = errObj.mfaRequired;
    throw err;
  }

  return parsed as T;
}

export const salarApi = {
  getTenantContext: (pathnameOverride?: string, searchOverride?: string) => {
    const p = (pathnameOverride ?? window.location.pathname).replace(/\/+$/, '');
    const s = searchOverride ?? window.location.search ?? '';
    const params = new URLSearchParams(s);
    const pMatch = p.match(/^\/p\/([^/]+)(?:\/pay)?$/i);
    if (pMatch && pMatch[1] && !params.has('slug')) {
      params.set('slug', decodeURIComponent(pMatch[1]));
    }
    const qs = params.toString();
    return apiRequest<TenantContextResponse>(`/api/public/tenant-context${qs ? `?${qs}` : ''}`);
  },

  getPublicManualPaymentInfo: (orgId?: string) => {
    const params = new URLSearchParams(window.location.search || '');
    if (orgId) params.set('org', orgId);
    const p = window.location.pathname.replace(/\/+$/, '');
    const pMatch = p.match(/^\/p\/([^/]+)(?:\/pay)?$/i);
    if (pMatch && pMatch[1] && !params.has('slug') && !params.has('org')) {
      params.set('slug', decodeURIComponent(pMatch[1]));
    }
    const qs = params.toString();
    return apiRequest<PublicManualPaymentInfo>(`/api/public/manual-payment-info${qs ? `?${qs}` : ''}`);
  },

  submitClientManualPayment: (payload: {
    organizationId: string;
    invoiceId: string;
    paymentMode: ManualPaymentMode;
    utrOrReference: string;
    payerName?: string;
    paidDate?: string;
    receiptUrl?: string;
    notes?: string;
  }) =>
    apiRequest<{ payment: SaasPaymentRecord }>('/api/public/manual-payments/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAuthStatus: () => apiRequest<OwnerAuthStatus>('/api/owner/auth/status'),

  getSession: () =>
    apiRequest<{ authenticated: boolean; username?: string; role?: string }>('/api/owner/auth/session'),

  claimOwner: (payload: { username: string; password: string; displayName?: string; email?: string }) =>
    apiRequest<{ ok: boolean; username: string; role: string }>('/api/owner/auth/claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { username: string; password: string; mfaCode?: string }) =>
    apiRequest<{ ok?: boolean; mfaRequired?: boolean; username?: string; role?: string }>(
      '/api/owner/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  logout: () => apiRequest<{ ok: boolean }>('/api/owner/auth/logout', { method: 'POST' }),

  getBootstrap: () => apiRequest<OwnerBootstrapData>('/api/owner/bootstrap'),

  createOrganization: (payload: {
    instituteName: string;
    shortCode?: string;
    contactPerson?: string;
    email: string;
    mobile?: string;
    address?: string;
    country?: string;
    state?: string;
    city?: string;
    website?: string;
    customDomain?: string;
    planCode: PlanCode;
    billingCycle: BillingCycle;
    deploymentType: DeploymentType;
    portalAllocationId?: string;
    studentCapacity?: number;
    examCapacity?: number;
    customPrice?: number | null;
    initialAdminPasscode?: string;
  }) =>
    apiRequest<{
      organization: Organization;
      license: LicenseRecord;
      allocation: PortalAllocation;
      portalPath: string;
    }>('/api/owner/organizations', { method: 'POST', body: JSON.stringify(payload) }),

  setClientAdminPasscode: (organizationId: string, passcode: string) =>
    apiRequest<{ ok: boolean; organizationId: string }>(
      `/api/owner/organizations/${encodeURIComponent(organizationId)}/admin-passcode`,
      { method: 'POST', body: JSON.stringify({ passcode }) }
    ),

  updateOrganization: (id: string, payload: Partial<Organization>) =>
    apiRequest<{ organization: Organization }>(`/api/owner/organizations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  changeClientDomain: (
    id: string,
    payload: {
      portalSlug?: string;
      subdomain?: string;
      customDomain?: string;
      keepOldRedirect?: boolean;
    }
  ) =>
    apiRequest<{ organization: Organization; tenantDomains: TenantDomain[] }>(
      `/api/owner/organizations/${encodeURIComponent(id)}/change-domain`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  generateAdminInvitation: (id: string) =>
    apiRequest<{
      organizationId: string;
      instituteName: string;
      adminEmail: string;
      portalPath: string;
      subdomain: string;
      licenseKey: string;
      planCode: PlanCode;
      expiryDate: string;
      accountStatus: string;
      subscriptionStatus: string;
      adminClaimed: boolean;
      invitationCode: string;
      expiresAt: string;
      onboardingSteps: string[];
    }>(`/api/owner/organizations/${encodeURIComponent(id)}/admin-invitation`, {
      method: 'POST',
    }),

  createLicense: (payload: {
    organizationId?: string;
    shortCode?: string;
    planCode: PlanCode;
    billingCycle: BillingCycle;
    customDays?: number;
    studentLimit?: number;
    examLimit?: number;
    priceAmount?: number;
    notes?: string;
  }) =>
    apiRequest<{ license: LicenseRecord }>('/api/owner/licenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  transitionLicense: (id: string, status: LicenseStatus, reason: string) =>
    apiRequest<{ license: LicenseRecord }>(`/api/owner/licenses/${encodeURIComponent(id)}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    }),

  renewLicense: (id: string, extraDays?: number, priceAmount?: number) =>
    apiRequest<{ license: LicenseRecord }>(`/api/owner/licenses/${encodeURIComponent(id)}/renew`, {
      method: 'POST',
      body: JSON.stringify({ extraDays, priceAmount }),
    }),

  verifyLicenseKey: (licenseKey: string) =>
    apiRequest<{
      valid: boolean;
      signatureValid?: boolean;
      notExpired?: boolean;
      status?: LicenseStatus;
      organizationId?: string;
      expirationDate?: string;
      reason?: string;
    }>('/api/owner/licenses/verify', {
      method: 'POST',
      body: JSON.stringify({ licenseKey }),
    }),

  createAllocation: (payload: {
    name?: string;
    deploymentType: DeploymentType;
    region: string;
    environment: 'development' | 'staging' | 'production';
    capacityStudents: number;
    capacityExams: number;
    capacityStorageMb: number;
  }) =>
    apiRequest<{ allocation: PortalAllocation }>('/api/owner/allocations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  checkAllocationHealth: (id: string) =>
    apiRequest<{ allocation: PortalAllocation; infrastructure: InfrastructureSnapshot }>(
      `/api/owner/allocations/${encodeURIComponent(id)}/health-check`,
      { method: 'POST' }
    ),

  reassignAllocation: (
    id: string,
    payload: {
      authorizedRelease: boolean;
      forceWaiveDues?: boolean;
      releaseReason: string;
      targetMode: 'NEW_CLIENT' | 'EXISTING_CLIENT' | 'RELEASE_ONLY';
      targetOrganizationId?: string;
      newInstituteName?: string;
      newContactPerson?: string;
      newEmail?: string;
      newMobile?: string;
      newCity?: string;
      newState?: string;
      newPlanCode?: PlanCode;
      newBillingCycle?: BillingCycle;
      initialAdminPasscode?: string;
    }
  ) =>
    apiRequest<{
      allocation: PortalAllocation;
      newOrganization?: Organization;
      licenseKey?: string;
      stepsReport: ReassignmentStepReport[];
      exportArchiveName?: string;
    }>(`/api/owner/allocations/${encodeURIComponent(id)}/reassign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePlan: (id: string, payload: Partial<LicensePlan>) =>
    apiRequest<{ plan: LicensePlan }>(`/api/owner/plans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createInvoice: (payload: {
    organizationId: string;
    subtotal: number;
    gstPercent?: number;
    dueDate?: string;
    description: string;
  }) =>
    apiRequest<{ invoice: SubscriptionInvoice }>('/api/owner/billing/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyPayment: (payload: {
    invoiceId: string;
    gateway: 'MANUAL' | 'BANK_TRANSFER';
    gatewayOrderId?: string;
    gatewayPaymentId: string;
    idempotencyKey?: string;
  }) =>
    apiRequest<{ payment: SaasPaymentRecord; invoice: SubscriptionInvoice }>(
      '/api/owner/billing/payments/verify',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  updateManualGateway: (
    payload: Partial<ManualPaymentGatewayConfig> & { setAsActiveGateway?: boolean }
  ) =>
    apiRequest<{ manualGateway: ManualPaymentGatewayConfig; activePaymentGateway: string }>(
      '/api/owner/billing/manual-gateway',
      { method: 'PATCH', body: JSON.stringify(payload) }
    ),

  recordManualPayment: (payload: {
    invoiceId: string;
    paymentMode: ManualPaymentMode;
    utrOrReference: string;
    payerName?: string;
    paidDate?: string;
    receiptUrl?: string;
    notes?: string;
    approveImmediately?: boolean;
  }) =>
    apiRequest<{ payment: SaasPaymentRecord; invoice: SubscriptionInvoice }>(
      '/api/owner/billing/payments/manual',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  approvePayment: (id: string) =>
    apiRequest<{ payment: SaasPaymentRecord; invoice?: SubscriptionInvoice }>(
      `/api/owner/billing/payments/${encodeURIComponent(id)}/approve`,
      { method: 'POST' }
    ),

  rejectPayment: (id: string, reason: string) =>
    apiRequest<{ payment: SaasPaymentRecord }>(
      `/api/owner/billing/payments/${encodeURIComponent(id)}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),

  refundPayment: (id: string) =>
    apiRequest<{ payment: SaasPaymentRecord }>(`/api/owner/billing/payments/${encodeURIComponent(id)}/refund`, {
      method: 'POST',
    }),

  getLiveInfrastructure: () =>
    apiRequest<{ infrastructure: InfrastructureSnapshot }>('/api/owner/infrastructure/live'),

  updateScalingPolicy: (payload: Partial<ScalingPolicy>) =>
    apiRequest<{ scalingPolicy: ScalingPolicy }>('/api/owner/infrastructure/scaling-policy', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  probeDatabase: () =>
    apiRequest<{
      checkedAt: string;
      saasStoreWriteMs: number;
      firestoreReachable: boolean;
      firestoreLatencyMs: number;
      firestoreNote: string;
      totalOrganizations: number;
      totalTenants: number;
      archivedTenants: number;
    }>('/api/owner/infrastructure/probe-db', { method: 'POST' }),

  addDomain: (payload: { organizationId: string; domain: string; type: 'SUBDOMAIN' | 'CUSTOM_DOMAIN' }) =>
    apiRequest<{ domain: TenantDomain }>('/api/owner/domains', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyDomain: (id: string) =>
    apiRequest<{ domain: TenantDomain }>(`/api/owner/domains/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
    }),

  deleteDomain: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/owner/domains/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  transferDomain: (id: string, targetOrganizationId: string) =>
    apiRequest<{ domain: TenantDomain }>(`/api/owner/domains/${encodeURIComponent(id)}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ targetOrganizationId }),
    }),

  createBackup: (payload: { scope: 'FULL_PLATFORM' | 'TENANT' | 'STORAGE'; organizationId?: string }) =>
    apiRequest<{ backup: import('../types/salar').BackupJob }>('/api/owner/backups', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyBackup: (id: string) =>
    apiRequest<{ backup: import('../types/salar').BackupJob; valid: boolean; error?: string }>(
      `/api/owner/backups/${encodeURIComponent(id)}/verify`,
      { method: 'POST' }
    ),

  restoreBackup: (id: string, dryRun: boolean) =>
    apiRequest<{ restoreJob: RestoreJob }>(`/api/owner/backups/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ dryRun }),
    }),

  setupMfa: () =>
    apiRequest<{ secret: string; otpauthUrl: string }>('/api/owner/security/mfa/setup', {
      method: 'POST',
    }),

  enableMfa: (code: string) =>
    apiRequest<{ mfaEnabled: boolean }>('/api/owner/security/mfa/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  disableMfa: () =>
    apiRequest<{ mfaEnabled: boolean }>('/api/owner/security/mfa/disable', {
      method: 'POST',
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ ok: boolean }>('/api/owner/security/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  revokeSession: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/owner/security/sessions/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
    }),

  markNotificationRead: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/owner/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    }),

  updateSettings: (payload: Partial<SystemSettings>) =>
    apiRequest<{ systemSettings: SystemSettings }>('/api/owner/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Per-Tenant Isolated Auth API (for secondary client portals)
  getTenantAdminStatus: (orgId: string) =>
    apiRequest<{ hasClaimedPasscode: boolean; requiresClaim: boolean }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/admin/status`
    ),

  getTenantAdminSession: (orgId: string) =>
    apiRequest<{ authenticated: boolean; role?: string; orgId?: string; email?: string }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/admin/session`
    ),

  claimTenantAdmin: (orgId: string, passcode: string, email?: string) =>
    apiRequest<{ ok: boolean; token: string; role: string }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/admin/claim`,
      { method: 'POST', body: JSON.stringify({ passcode, ...(email ? { email } : {}) }) }
    ),

  loginTenantAdmin: (orgId: string, passcode: string, email?: string) =>
    apiRequest<{ ok: boolean; token: string; role: string }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/admin/login`,
      { method: 'POST', body: JSON.stringify({ passcode, ...(email ? { email } : {}) }) }
    ),

  logoutTenantAdmin: (orgId: string) =>
    apiRequest<{ ok: boolean }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/admin/logout`,
      { method: 'POST' }
    ),

  getTenantStudentSession: (orgId: string) =>
    apiRequest<{ authenticated: boolean; role?: string; student?: Record<string, unknown> }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/student/session`
    ),

  registerTenantStudent: (
    orgId: string,
    payload: {
      name: string;
      email: string;
      password: string;
      mobile?: string;
      classLevel?: string;
      targetExam?: string;
      origin?: 'PORTAL_SIGNUP' | 'QUICK_JOIN';
    }
  ) =>
    apiRequest<{ ok: boolean; student: Record<string, unknown> }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/student/register`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  loginTenantStudent: (orgId: string, payload: { email: string; password: string }) =>
    apiRequest<{ ok: boolean; student: Record<string, unknown> }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/student/login`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  logoutTenantStudent: (orgId: string) =>
    apiRequest<{ ok: boolean }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/student/logout`,
      { method: 'POST' }
    ),
};
