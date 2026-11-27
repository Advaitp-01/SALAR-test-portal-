export type LicenseStatus =
  | 'CREATED'
  | 'AVAILABLE'
  | 'ASSIGNED'
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'RELEASING'
  | 'RELEASED'
  | 'REVOKED';

export type PlanCode = 'STARTER' | 'PRO' | 'ENTERPRISE';
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
export type DeploymentType = 'SHARED_MULTI_TENANT' | 'DEDICATED';
export type HealthState = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'OFFLINE';

export type OwnerModuleId =
  | 'overview'
  | 'clients'
  | 'licenses'
  | 'allocations'
  | 'plans'
  | 'billing'
  | 'payments'
  | 'infrastructure'
  | 'load-balancing'
  | 'database'
  | 'domains'
  | 'analytics'
  | 'backups'
  | 'security'
  | 'notifications'
  | 'audit-logs'
  | 'settings';

export interface OwnerAuthStatus {
  hasEnvOwner: boolean;
  hasClaimedOwner: boolean;
  requiresClaim: boolean;
  mfaEnabled: boolean;
}

export interface TenantContextResponse {
  found: boolean;
  isDefaultRoot?: boolean;
  organizationId?: string;
  portalSlug?: string;
  portalPath?: string;
  redirectToPath?: string;
  instituteName?: string;
  tenantId?: string;
  databaseId?: string;
  databaseStatus?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  portalAllocationId?: string;
  licenseId?: string;
  licenseKey?: string;
  subscriptionStatus?: string;
  domainStatus?: 'VERIFIED_ACTIVE' | 'PENDING_DNS' | 'SSL_FAILED';
  verifiedDomain?: string;
  adminAccountClaimed?: boolean;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  logoUrl?: string;
  planCode?: PlanCode;
  deploymentType?: DeploymentType;
  studentCapacity?: number;
  examCapacity?: number;
  status?: string;
  licenseStatus?: LicenseStatus;
  accessBlocked?: boolean;
  blockReason?: string | null;
}

export interface Organization {
  id: string;
  instituteName: string;
  shortCode: string;
  contactPerson: string;
  email: string;
  mobile: string;
  address: string;
  country: string;
  state: string;
  city: string;
  website: string;
  logoUrl: string;
  customDomain: string;
  subdomain: string;
  portalSlug: string;
  portalPath: string;
  planId: string;
  planCode: PlanCode;
  billingCycle: BillingCycle;
  customPrice?: number | null;
  studentCapacity: number;
  examCapacity: number;
  storageLimitMb: number;
  deploymentType: DeploymentType;
  tenantId: string;
  databaseId?: string;
  portalAllocationId: string;
  licenseId: string;
  previousPortalSlugs?: string[];
  lastInvitationAt?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'PENDING';
  createdAt: string;
  updatedAt: string;
}

export interface TenantRecord {
  id: string;
  organizationId: string;
  databaseId?: string;
  namespace: string;
  isolationMode: 'SHARED_SCHEMA' | 'DEDICATED_DB';
  storageBucketPrefix: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  studentCount: number;
  examCount: number;
  questionCount: number;
  storageUsedMb: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenantDomain {
  id: string;
  organizationId: string;
  tenantId: string;
  domain: string;
  type: 'SUBDOMAIN' | 'CUSTOM_DOMAIN';
  dnsTarget: string;
  dnsVerified: boolean;
  sslStatus: 'PENDING' | 'ACTIVE' | 'FAILED' | 'EXPIRED';
  sslExpiresAt?: string;
  lastCheckedAt?: string;
  verificationNotes?: string;
  redirectToDomain?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PortalBindingRecord {
  organizationId: string;
  instituteName: string;
  portalSlug: string;
  portalPath: string;
  subdomain: string;
  customDomain: string;
  verifiedDomain: string;
  licenseId: string;
  licenseKey: string;
  licenseStatus: LicenseStatus;
  expiryDate: string;
  portalAllocationId: string;
  allocationCode: string;
  tenantId: string;
  databaseId: string;
  databaseStatus: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  adminEmail: string;
  adminAccountStatus: 'CLAIMED' | 'PENDING_SETUP';
  subscriptionStatus: string;
  domainStatus: 'VERIFIED_ACTIVE' | 'PENDING_DNS' | 'SSL_FAILED';
  dnsVerified: boolean;
  sslStatus: string;
}

export interface LicensePlan {
  id: string;
  code: PlanCode;
  name: string;
  description: string;
  monthlyPrice: number;
  quarterlyPrice: number;
  yearlyPrice: number;
  studentLimit: number;
  examLimit: number;
  storageLimitMb: number;
  allowDedicated: boolean;
  features: string[];
  addOnPrices: {
    extra100StudentsMonthly: number;
    extra10GbStorageMonthly: number;
    extra50ExamsMonthly: number;
  };
  isActive: boolean;
  updatedAt: string;
}

export interface LicenseRecord {
  id: string;
  licenseKey: string;
  signature: string;
  organizationId: string;
  tenantId: string;
  planId: string;
  planCode: PlanCode;
  portalAllocationId: string;
  issueDate: string;
  activationDate?: string;
  expirationDate: string;
  renewalDate: string;
  billingCycle: BillingCycle;
  studentLimit: number;
  examLimit: number;
  storageLimitMb: number;
  priceAmount: number;
  featurePermissions: string[];
  status: LicenseStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseEvent {
  id: string;
  licenseId: string;
  licenseKey: string;
  fromStatus: LicenseStatus | 'NONE';
  toStatus: LicenseStatus;
  actor: string;
  reason: string;
  timestamp: string;
}

export interface PortalAllocation {
  id: string;
  code: string;
  name: string;
  deploymentType: DeploymentType;
  region: string;
  environment: 'development' | 'staging' | 'production';
  capacityStudents: number;
  capacityExams: number;
  capacityStorageMb: number;
  currentOrganizationId: string | null;
  currentTenantId: string | null;
  status: 'AVAILABLE' | 'ASSIGNED' | 'PROVISIONING' | 'RELEASING' | 'MAINTENANCE';
  healthStatus: HealthState;
  endpointUrl: string;
  reassignmentCount: number;
  lastHealthCheckAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortalDeployment {
  id: string;
  allocationId: string;
  organizationId: string;
  tenantId: string;
  deploymentType: DeploymentType;
  environment: string;
  version: string;
  status: 'DEPLOYED' | 'PROVISIONING' | 'ROLLED_BACK';
  stepsCompleted: string[];
  deployedBy: string;
  deployedAt: string;
}

export interface DeploymentInstance {
  id: string;
  instanceName: string;
  region: string;
  environment: string;
  hostname: string;
  pid: number;
  weight: number;
  status: HealthState;
  lastHeartbeatAt: string;
  createdAt: string;
}

export interface ScalingPolicy {
  minInstances: number;
  maxInstances: number;
  targetCpuPercent: number;
  targetMemoryPercent: number;
  targetRequestsPerMin: number;
  targetQueueDepth: number;
  autoScalingEnabled: boolean;
  cdnEnabled: boolean;
  redisCacheEnabled: boolean;
  updatedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  organizationId: string;
  organizationName: string;
  planId: string;
  planCode: PlanCode;
  billingCycle: BillingCycle;
  baseAmount: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  currency: 'INR';
  status: 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'CANCELLED' | 'EXPIRED';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionInvoice {
  id: string;
  invoiceNumber: string;
  subscriptionId: string;
  organizationId: string;
  organizationName: string;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  dueDate: string;
  paidAt?: string;
  status: 'PAID' | 'PENDING' | 'OVERDUE' | 'VOID' | 'REFUNDED';
  description: string;
  createdAt: string;
}

export type ManualPaymentMode = 'UPI' | 'BANK_TRANSFER' | 'NEFT_IMPS_RTGS' | 'CHEQUE' | 'CASH';

export interface ManualPaymentGatewayConfig {
  enabled: boolean;
  upiId: string;
  upiDisplayName: string;
  qrCodeUrl: string;
  bankAccountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  acceptedModes: ManualPaymentMode[];
  paymentInstructions: string;
  requireReceiptUpload: boolean;
  autoExtendOnApproval: boolean;
}

export interface SaasPaymentRecord {
  id: string;
  invoiceId: string;
  subscriptionId: string;
  organizationId: string;
  organizationName: string;
  gateway: 'MANUAL' | 'BANK_TRANSFER';
  paymentMode?: ManualPaymentMode;
  gatewayOrderId: string;
  gatewayPaymentId: string;
  utrOrReference?: string;
  payerName?: string;
  paidDate?: string;
  receiptUrl?: string;
  notes?: string;
  idempotencyKey: string;
  amount: number;
  gstAmount: number;
  currency: 'INR';
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'FAILED' | 'REFUNDED';
  signatureVerified: boolean;
  verifiedOnServerBy?: string;
  failureReason?: string;
  rejectionReason?: string;
  submittedBy?: 'OWNER' | 'CLIENT_PORTAL';
  refundedAt?: string;
  createdAt: string;
  verifiedAt?: string;
}

export interface UsageRecord {
  id: string;
  organizationId: string;
  tenantId: string;
  period: string;
  activeStudents: number;
  examsCreated: number;
  totalAttempts: number;
  storageUsedMb: number;
  apiRequests: number;
  bandwidthMb: number;
  recordedAt: string;
}

export interface BackupJob {
  id: string;
  scope: 'FULL_PLATFORM' | 'TENANT' | 'STORAGE';
  organizationId?: string;
  tenantId?: string;
  archiveName: string;
  sizeBytes: number;
  sha256Checksum: string;
  encrypted: boolean;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  status: 'COMPLETED' | 'VERIFIED' | 'FAILED';
  retainedForCompliance: boolean;
  createdBy: string;
  createdAt: string;
}

export interface RestoreJob {
  id: string;
  backupJobId: string;
  targetOrganizationId?: string;
  targetTenantId?: string;
  dryRun: boolean;
  status: 'COMPLETED' | 'FAILED';
  notes: string;
  restoredBy: string;
  createdAt: string;
}

export interface OwnerNotification {
  id: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  category: 'BILLING' | 'SECURITY' | 'INFRASTRUCTURE' | 'LICENSE' | 'REASSIGNMENT';
  read: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  actorType: 'OWNER' | 'SYSTEM' | 'WEBHOOK';
  action: string;
  resourceType: string;
  resourceId: string;
  ip: string;
  details: string;
  status: 'SUCCESS' | 'DENIED' | 'FAILED';
  timestamp: string;
}

export interface OwnerSession {
  id: string;
  ownerId: string;
  username: string;
  ip: string;
  userAgent: string;
  mfaVerified: boolean;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface SystemSettings {
  platformName: string;
  ownerDisplayName: string;
  ownerEmail: string;
  supportEmail: string;
  gstNumber: string;
  defaultGstPercent: number;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  retentionDays: number;
  rateLimitMaxAttempts: number;
  rateLimitWindowMinutes: number;
  sessionTimeoutHours: number;
  enforceMfaForSensitiveActions: boolean;
  backupEncryptionEnabled: boolean;
  activePaymentGateway: 'MANUAL' | 'BANK_TRANSFER';
  manualGateway: ManualPaymentGatewayConfig;
  updatedAt: string;
}

export interface PublicManualPaymentInfo {
  enabled: boolean;
  organizationId: string;
  instituteName: string;
  manualGateway: ManualPaymentGatewayConfig;
  pendingInvoices: SubscriptionInvoice[];
}

export interface InfrastructureSnapshot {
  timestamp: string;
  hostname: string;
  platform: string;
  nodeVersion: string;
  uptimeSeconds: number;
  environment: 'development' | 'staging' | 'production';
  cpuCores: number;
  loadAvg1m: number;
  cpuLoadPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPercent: number;
  processRssMb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  diskPercent: number;
  uploadsBytes: number;
  uploadsCount: number;
  backupsBytes: number;
  backupsCount: number;
  activeRequests: number;
  requestsPerMin: number;
  totalRequests: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  errorRatePercent: number;
  serverHealth: HealthState;
  integrations: {
    cloudflareConfigured: boolean;
    redisConfigured: boolean;
    smtpConfigured: boolean;
    firestoreProjectId: string;
  };
  persistenceStatus?: CloudPersistenceStatus;
}

export interface CloudPersistenceStatus {
  mode: 'UPSTASH_KV' | 'VERCEL_BLOB' | 'LOCAL_DISK' | 'EPHEMERAL_TMP';
  persistent: boolean;
  providerLabel: string;
  isVercel: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface OwnerBootstrapData {
  ownerProfile: {
    id: string;
    username: string;
    displayName: string;
    email: string;
    mfaEnabled: boolean;
    lastLoginAt?: string;
  };
  ownerSessions: OwnerSession[];
  organizations: Organization[];
  tenants: TenantRecord[];
  tenantDomains: TenantDomain[];
  portalBindings?: PortalBindingRecord[];
  licensePlans: LicensePlan[];
  licenses: LicenseRecord[];
  licenseEvents: LicenseEvent[];
  portalAllocations: PortalAllocation[];
  portalDeployments: PortalDeployment[];
  deploymentInstances: DeploymentInstance[];
  scalingPolicy: ScalingPolicy;
  subscriptions: SubscriptionRecord[];
  subscriptionInvoices: SubscriptionInvoice[];
  payments: SaasPaymentRecord[];
  usageRecords: UsageRecord[];
  backupJobs: BackupJob[];
  restoreJobs: RestoreJob[];
  notifications: OwnerNotification[];
  auditLogs: AuditLogEntry[];
  systemSettings: SystemSettings;
  archivedTenants: Array<{
    archivedAt: string;
    organizationId: string;
    organizationName: string;
    tenantId: string;
    allocationId: string;
    reason: string;
    exportArchiveName: string;
  }>;
  infrastructure: InfrastructureSnapshot;
  persistenceStatus?: CloudPersistenceStatus;
  computedMetrics: {
    totalClients: number;
    activeClients: number;
    totalLicenses: number;
    activeLicenses: number;
    availableAllocations: number;
    assignedAllocations: number;
    mrr: number;
    arr: number;
    pendingPaymentsCount: number;
    pendingPaymentsTotal: number;
    expiringLicensesCount: number;
    totalStudentsAcrossClients: number;
    totalExamsAcrossClients: number;
  };
}

export interface ReassignmentStepReport {
  step: number;
  name: string;
  status: 'PASSED';
  detail: string;
}
