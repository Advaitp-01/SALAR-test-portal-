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

const OWNER_BEARER_KEY = 'salar_owner_bearer';

function getOwnerBearer(): string {
  try {
    return window.sessionStorage.getItem(OWNER_BEARER_KEY) || '';
  } catch {
    return '';
  }
}

export function setOwnerBearer(token: string): void {
  try {
    if (token) window.sessionStorage.setItem(OWNER_BEARER_KEY, token);
    else window.sessionStorage.removeItem(OWNER_BEARER_KEY);
  } catch {
    // ignore storage errors
  }
}

export function setTenantBearer(orgId: string, kind: 'admin' | 'student', token: string): void {
  try {
    const key = `salar_tenant_bearer_${orgId}_${kind}`;
    if (token) window.sessionStorage.setItem(key, token);
    else window.sessionStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

export function getTenantBearer(orgId: string, preferKind?: 'admin' | 'student'): string {
  try {
    if (preferKind) {
      return window.sessionStorage.getItem(`salar_tenant_bearer_${orgId}_${preferKind}`) || '';
    }
    return (
      window.sessionStorage.getItem(`salar_tenant_bearer_${orgId}_admin`) ||
      window.sessionStorage.getItem(`salar_tenant_bearer_${orgId}_student`) ||
      ''
    );
  } catch {
    return '';
  }
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!headers.Authorization && !headers.authorization) {
    if (
      url.startsWith('/api/owner') &&
      !url.startsWith('/api/owner/auth/login') &&
      !url.startsWith('/api/owner/auth/claim') &&
      !url.startsWith('/api/owner/auth/status')
    ) {
      const ownerToken = getOwnerBearer();
      if (ownerToken) {
        headers.Authorization = `Bearer ${ownerToken}`;
      }
    } else {
      const tenantMatch = url.match(/^\/api\/tenant\/([^/]+)/);
      if (tenantMatch && tenantMatch[1]) {
        const orgId = decodeURIComponent(tenantMatch[1]);
        const preferKind = url.includes('/auth/admin/')
          ? 'admin'
          : url.includes('/auth/student/')
          ? 'student'
          : undefined;
        const tenantToken = getTenantBearer(orgId, preferKind);
        if (tenantToken) {
          headers.Authorization = `Bearer ${tenantToken}`;
        }
      }
    }
  }

  const res = await fetch(url, {
    ...options,
    cache: 'no-store',
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
    if (res.status === 401 && url.startsWith('/api/owner') && !url.startsWith('/api/owner/auth/login')) {
      setOwnerBearer('');
    }
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
    } else if ((p === '/test' || p === '/salar-test') && !params.has('slug')) {
      params.set('slug', 'salar-test');
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
    } else if ((p === '/test' || p === '/salar-test') && !params.has('slug') && !params.has('org')) {
      params.set('slug', 'salar-test');
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

  claimOwner: async (payload: { username: string; password: string; displayName?: string; email?: string }) => {
    const res = await apiRequest<{ ok: boolean; username: string; role: string; token?: string }>(
      '/api/owner/auth/claim',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    if (res.token) setOwnerBearer(res.token);
    return res;
  },

  login: async (payload: { username: string; password: string; mfaCode?: string }) => {
    const res = await apiRequest<{ ok?: boolean; mfaRequired?: boolean; username?: string; role?: string; token?: string }>(
      '/api/owner/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    if (res.ok && res.token) setOwnerBearer(res.token);
    return res;
  },

  logout: async () => {
    try {
      return await apiRequest<{ ok: boolean }>('/api/owner/auth/logout', { method: 'POST' });
    } finally {
      setOwnerBearer('');
    }
  },

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
    startDate?: string;
    expirationDate?: string;
    trialDays?: number;
    customDays?: number;
  }) =>
    apiRequest<{
      organization: Organization;
      license: LicenseRecord;
      allocation: PortalAllocation;
      portalPath: string;
    }>('/api/owner/organizations', { method: 'POST', body: JSON.stringify(payload) }),

  assignClientValidity: (
    organizationId: string,
    payload: {
      mode?: 'TRIAL' | 'CUSTOM_DATE';
      billingCycle: BillingCycle;
      planCode?: PlanCode;
      studentCapacity?: number;
      examCapacity?: number;
      customPrice?: number | null;
      generateInvoice?: boolean;
      startDate?: string;
      expirationDate?: string;
      days?: number;
      notes?: string;
    }
  ) =>
    apiRequest<{
      organization: Organization;
      license: LicenseRecord;
      subscription?: import('../types/salar').SubscriptionRecord;
      invoice?: SubscriptionInvoice;
    }>(
      `/api/owner/organizations/${encodeURIComponent(organizationId)}/validity`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

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

  deleteOrganization: (id: string, options?: { createBackup?: boolean }) =>
    apiRequest<{
      ok: boolean;
      deletedOrganizationId: string;
      deletedInstituteName: string;
      freedAllocationId?: string | null;
      freedAllocCodes?: string[];
      backupArchiveName?: string;
    }>(`/api/owner/organizations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ createBackup: Boolean(options?.createBackup) }),
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
      newStartDate?: string;
      newExpirationDate?: string;
      newTrialDays?: number;
      newCustomDays?: number;
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

  exportPersistenceSnapshot: () =>
    apiRequest<{
      format: 'SALAR-PLATFORM-SNAPSHOT-V1';
      exportedAt: string;
      keys?: string;
      saasDb: string;
      adminGate?: string;
      tenants: Record<string, string>;
    }>('/api/owner/persistence/export'),

  importPersistenceSnapshot: (bundle: Record<string, unknown>) =>
    apiRequest<{
      ok: boolean;
      organizationsCount: number;
      tenantsCount: number;
      persistenceStatus: import('../types/salar').CloudPersistenceStatus;
    }>('/api/owner/persistence/import', {
      method: 'POST',
      body: JSON.stringify(bundle),
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

  claimTenantAdmin: async (orgId: string, passcode: string, email?: string) => {
    const res = await apiRequest<{ ok: boolean; token: string; role: string }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/admin/claim`,
      { method: 'POST', body: JSON.stringify({ passcode, ...(email ? { email } : {}) }) }
    );
    if (res.token) setTenantBearer(orgId, 'admin', res.token);
    return res;
  },

  loginTenantAdmin: async (orgId: string, passcode: string, email?: string) => {
    const res = await apiRequest<{ ok: boolean; token: string; role: string }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/admin/login`,
      { method: 'POST', body: JSON.stringify({ passcode, ...(email ? { email } : {}) }) }
    );
    if (res.token) setTenantBearer(orgId, 'admin', res.token);
    return res;
  },

  logoutTenantAdmin: async (orgId: string) => {
    try {
      return await apiRequest<{ ok: boolean }>(
        `/api/tenant/${encodeURIComponent(orgId)}/auth/admin/logout`,
        { method: 'POST' }
      );
    } finally {
      setTenantBearer(orgId, 'admin', '');
    }
  },

  getTenantStudentSession: (orgId: string) =>
    apiRequest<{ authenticated: boolean; role?: string; student?: Record<string, unknown> }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/student/session`
    ),

  registerTenantStudent: async (
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
  ) => {
    const res = await apiRequest<{ ok: boolean; token?: string; student: Record<string, unknown> }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/student/register`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
    if (res.token) setTenantBearer(orgId, 'student', res.token);
    return res;
  },

  loginTenantStudent: async (orgId: string, payload: { email: string; password: string }) => {
    const res = await apiRequest<{ ok: boolean; token?: string; student: Record<string, unknown> }>(
      `/api/tenant/${encodeURIComponent(orgId)}/auth/student/login`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
    if (res.token) setTenantBearer(orgId, 'student', res.token);
    return res;
  },

  logoutTenantStudent: async (orgId: string) => {
    try {
      return await apiRequest<{ ok: boolean }>(
        `/api/tenant/${encodeURIComponent(orgId)}/auth/student/logout`,
        { method: 'POST' }
      );
    } finally {
      setTenantBearer(orgId, 'student', '');
    }
  },
};
