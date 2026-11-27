import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, subscribeCloudAuthNeeded } from '../lib/tenantDb';
import { DEFAULT_ROOT_ORG_ID, setActiveTenantOrgId } from '../lib/tenantDb';
import { auth, db, googleAuthProvider, isAuthorizedAdminEmail, testFirestoreConnection } from '../lib/firebase';
import { DEFAULT_INSTITUTE_SETTINGS } from '../lib/portalService';
import { salarApi } from '../lib/salarApi';
import type { InstituteSettings, StudentProfile, UserRole } from '../types/portal';
import type { TenantContextResponse } from '../types/salar';

const ROOT_ADMIN_BEARER_KEY = 'salar_root_admin_bearer';
const REDIRECT_ROLE_KEY = 'salar_google_redirect_role';

interface AuthContextValue {
  firebaseUser: User | null;
  role: UserRole | null;
  adminGateToken: string | null;
  isAdminUnlocked: boolean;
  cloudAuthNeeded: boolean;
  cloudLinkError: string;
  clearCloudLinkError: () => void;
  studentProfile: StudentProfile | null;
  settings: InstituteSettings;
  tenantContext: TenantContextResponse | null;
  isIsolatedTenant: boolean;
  tenantNotFound: boolean;
  authReady: boolean;
  syncStatus: 'SYNCED' | 'SYNCING' | 'OFFLINE';
  lastSyncedAt: Date;
  signInWithGoogle: (intendedRole: UserRole) => Promise<{ role: UserRole; error?: string }>;
  signInWithGoogleRedirectFallback: (intendedRole: UserRole) => Promise<void>;
  signInStudentEmail: (email: string, password: string) => Promise<{ error?: string }>;
  registerStudentEmail: (params: {
    name: string;
    email: string;
    password: string;
    mobile: string;
    classLevel: 'Class 11th' | 'Class 12th' | 'Dropper / Repeater';
    targetExam: 'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'Boards + CET' | 'JEE Main + Advanced';
    origin?: 'PORTAL_SIGNUP' | 'QUICK_JOIN';
  }) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  unlockAdminWithToken: (token: string) => void;
  logout: () => Promise<void>;
  refreshStudentProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function makeTenantFallbackSettings(ctx: TenantContextResponse | null): InstituteSettings {
  if (!ctx || !ctx.instituteName || ctx.organizationId === DEFAULT_ROOT_ORG_ID) {
    return DEFAULT_INSTITUTE_SETTINGS;
  }
  return {
    ...DEFAULT_INSTITUTE_SETTINGS,
    instituteName: ctx.instituteName,
    tagline: 'Online Computer-Based Testing & Academic Portal',
    storageTag: ctx.tenantId || ctx.organizationId || 'tenant-vault',
    logoUrl: ctx.logoUrl || '',
    heroTitle: `${ctx.instituteName} — Online Examination & Learning Portal`,
    heroSubtitle:
      'Computer-Based Test (CBT) engine, chapterwise question banks, structured courses, and instant rank analytics.',
    address: ctx.address || 'Institute Campus',
    phone: ctx.phone || '',
    whatsapp: ctx.phone || '',
    email: ctx.email || '',
    website: ctx.website || '',
    socialLinks: {
      youtube: '',
      instagram: '',
      telegram: '',
    },
    portalConfig: {
      ...DEFAULT_INSTITUTE_SETTINGS.portalConfig,
      allowGoogleAuth: false,
      upiId: '',
      upiPayeeName: ctx.instituteName,
      storageProvider: `SALAR Isolated Vault (${ctx.tenantId || ctx.organizationId})`,
    },
  };
}

const NEUTRAL_INITIAL_SETTINGS: InstituteSettings = {
  ...DEFAULT_INSTITUTE_SETTINGS,
  instituteName: 'Examination Portal',
  tagline: 'Online Computer-Based Testing & Academic Portal',
  storageTag: 'tenant-vault',
  logoUrl: '',
  heroTitle: 'Online Examination & Learning Portal',
  heroSubtitle:
    'Computer-Based Test (CBT) engine, chapterwise question banks, structured courses, and instant rank analytics.',
  address: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  socialLinks: { youtube: '', instagram: '', telegram: '' },
  portalConfig: {
    ...DEFAULT_INSTITUTE_SETTINGS.portalConfig,
    allowGoogleAuth: false,
    upiId: '',
    upiPayeeName: 'Examination Portal',
    storageProvider: 'SALAR Isolated Vault',
  },
};

function isDedicatedPortalOrSystemPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return (
    clean === '/owner' ||
    clean === '/owner/dashboard' ||
    clean === '/pay' ||
    clean === '/test' ||
    clean.startsWith('/p/')
  );
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [routeKey, setRouteKey] = useState<string>(
    () => `${window.location.pathname}${window.location.search}`
  );
  const [tenantResolved, setTenantResolved] = useState(false);
  const [tenantContext, setTenantContext] = useState<TenantContextResponse | null>(null);
  const [tenantNotFound, setTenantNotFound] = useState(false);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [adminGateToken, setAdminGateToken] = useState<string | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [settings, setSettings] = useState<InstituteSettings>(() =>
    isDedicatedPortalOrSystemPath(window.location.pathname)
      ? NEUTRAL_INITIAL_SETTINGS
      : DEFAULT_INSTITUTE_SETTINGS
  );
  const [firebaseAuthChecked, setFirebaseAuthChecked] = useState(false);
  const [adminSessionChecked, setAdminSessionChecked] = useState(false);
  const [cloudAuthNeeded, setCloudAuthNeeded] = useState(false);
  const [cloudLinkError, setCloudLinkError] = useState('');
  const [syncStatus, setSyncStatus] = useState<'SYNCED' | 'SYNCING' | 'OFFLINE'>('SYNCING');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());

  const activeOrgRef = useRef<string | null>(null);
  const redirectCheckedRef = useRef(false);

  const activeOrgId = tenantContext?.organizationId || DEFAULT_ROOT_ORG_ID;
  const isIsolatedTenant = Boolean(
    tenantContext?.found && tenantContext.organizationId && tenantContext.organizationId !== DEFAULT_ROOT_ORG_ID
  );

  const authReady = tenantResolved && firebaseAuthChecked && adminSessionChecked;

  // Watch browser history & custom SPA route changes to keep tenant context synchronized
  useEffect(() => {
    const syncRoute = () => {
      setRouteKey(`${window.location.pathname}${window.location.search}`);
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('salar-route-change', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('salar-route-change', syncRoute);
    };
  }, []);

  // Listen for Firestore permission-denied events while passcode-unlocked
  useEffect(() => {
    return subscribeCloudAuthNeeded(() => {
      if (!isIsolatedTenant && !auth.currentUser) {
        setCloudAuthNeeded(true);
      }
    });
  }, [isIsolatedTenant]);

  // Resolve active Tenant Organization before initializing auth or DB subscriptions
  useEffect(() => {
    let active = true;
    const pathClean = window.location.pathname.replace(/\/+$/, '') || '/';
    if (pathClean === '/owner' || pathClean === '/owner/dashboard' || pathClean === '/pay') {
      setActiveTenantOrgId(DEFAULT_ROOT_ORG_ID);
      setTenantContext(null);
      setTenantNotFound(false);
      setTenantResolved(true);
      return;
    }

    if (activeOrgRef.current === null) {
      setTenantResolved(false);
      setAdminSessionChecked(false);
      setFirebaseAuthChecked(false);
    }

    salarApi
      .getTenantContext()
      .then((ctx) => {
        if (!active) return;
        if (!ctx || !ctx.found) {
          activeOrgRef.current = DEFAULT_ROOT_ORG_ID;
          setActiveTenantOrgId(DEFAULT_ROOT_ORG_ID);
          setTenantContext(null);
          setTenantNotFound(true);
          setTenantResolved(true);
          return;
        }
        if (ctx.redirectToPath && window.location.pathname.replace(/\/+$/, '') !== ctx.redirectToPath) {
          window.history.replaceState({}, '', ctx.redirectToPath);
          window.dispatchEvent(new Event('salar-route-change'));
        }
        const orgId = ctx.organizationId || DEFAULT_ROOT_ORG_ID;
        const orgChanged = activeOrgRef.current !== null && activeOrgRef.current !== orgId;
        activeOrgRef.current = orgId;
        setActiveTenantOrgId(orgId);
        setTenantContext(ctx);
        setTenantNotFound(false);
        setSettings(makeTenantFallbackSettings(ctx));
        if (orgChanged) {
          // Clear any cross-tenant in-memory state ONLY when switching organizations
          setAdminSessionChecked(false);
          setFirebaseAuthChecked(false);
          setAdminGateToken(null);
          setStudentProfile(null);
          setFirebaseUser(null);
          setRole(null);
          setCloudAuthNeeded(false);
          setCloudLinkError('');
        }
        setTenantResolved(true);
      })
      .catch(() => {
        if (!active) return;
        setActiveTenantOrgId(DEFAULT_ROOT_ORG_ID);
        setTenantContext(null);
        setTenantNotFound(pathClean.startsWith('/p/') || pathClean === '/test');
        if (isDedicatedPortalOrSystemPath(pathClean)) {
          setSettings(NEUTRAL_INITIAL_SETTINGS);
        }
        setTenantResolved(true);
      });

    return () => {
      active = false;
    };
  }, [routeKey]);

  // Restore Admin session cookie or Bearer token (primary root OR isolated secondary tenant)
  useEffect(() => {
    if (!tenantResolved) return;
    let active = true;

    const storedRootBearer = (() => {
      try {
        return window.sessionStorage.getItem(ROOT_ADMIN_BEARER_KEY) || '';
      } catch {
        return '';
      }
    })();

    const checkSession = isIsolatedTenant
      ? salarApi.getTenantAdminSession(activeOrgId).catch(() => ({ authenticated: false as const }))
      : fetch('/api/auth/admin/session', {
          credentials: 'include',
          cache: 'no-store',
          headers: storedRootBearer ? { Authorization: `Bearer ${storedRootBearer}` } : undefined,
        })
          .then((r) => (r.ok ? r.json() : { authenticated: false }))
          .catch(() => ({ authenticated: false }));

    Promise.resolve(checkSession)
      .then((data: { authenticated?: boolean; token?: string }) => {
        if (!active) return;
        if (data?.authenticated) {
          setAdminGateToken(data.token || storedRootBearer || 'cookie-session');
          setRole('SUPER_ADMIN');
        } else if (!isIsolatedTenant && storedRootBearer) {
          try {
            window.sessionStorage.removeItem(ROOT_ADMIN_BEARER_KEY);
          } catch {
            // ignore
          }
        }
      })
      .finally(() => {
        if (active) setAdminSessionChecked(true);
      });

    return () => {
      active = false;
    };
  }, [tenantResolved, isIsolatedTenant, activeOrgId]);

  // Check Firestore / Tenant connection once on boot
  useEffect(() => {
    if (!tenantResolved) return;
    if (isIsolatedTenant) {
      setSyncStatus('SYNCED');
      return;
    }
    testFirestoreConnection().then((res) => {
      setSyncStatus(res.ok ? 'SYNCED' : 'OFFLINE');
    });
  }, [tenantResolved, isIsolatedTenant]);

  // Listen to active Institute Settings (root Firestore OR isolated tenant DB)
  useEffect(() => {
    if (!tenantResolved) return;
    const unsub = onSnapshot(
      doc(db, 'settings', 'institute'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<InstituteSettings>;
          const base = makeTenantFallbackSettings(tenantContext);
          const normalizedName = isIsolatedTenant
            ? data.instituteName || base.instituteName
            : !data.instituteName || data.instituteName === 'GYANSAI Maths IIT Center'
            ? DEFAULT_INSTITUTE_SETTINGS.instituteName
            : data.instituteName;
          setSettings({
            ...base,
            ...data,
            instituteName: normalizedName,
            socialLinks: {
              ...base.socialLinks,
              ...(data.socialLinks || {}),
            },
            portalConfig: {
              ...base.portalConfig,
              ...(data.portalConfig || {}),
              allowGoogleAuth: isIsolatedTenant ? false : (data.portalConfig?.allowGoogleAuth ?? true),
            },
          });
        }
        setLastSyncedAt(new Date());
        setSyncStatus('SYNCED');
      },
      () => {
        // Fallback silently to defaults if uninitialized
      }
    );
    return () => unsub();
  }, [tenantResolved, isIsolatedTenant, activeOrgId]);

  const syncStudentDoc = async (user: User, extra?: Partial<StudentProfile>) => {
    const studentRef = doc(db, 'students', user.uid);
    const snap = await getDoc(studentRef);
    const now = new Date().toISOString();
    if (snap.exists()) {
      const existing = { id: snap.id, ...(snap.data() as Omit<StudentProfile, 'id'>) };
      setStudentProfile(existing);
      return existing;
    }

    const rollNum = `GC-${Math.floor(10000 + Math.random() * 89999)}`;
    const uname = (user.email || user.displayName || 'student').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    const newProfile: Omit<StudentProfile, 'id'> = {
      uid: user.uid,
      name: extra?.name || user.displayName || 'Mathematics Student',
      email: user.email || '',
      mobile: extra?.mobile || '',
      whatsapp: extra?.whatsapp || extra?.mobile || '',
      classLevel: extra?.classLevel || 'Class 12th',
      targetExam: extra?.targetExam || 'JEE Main',
      rollNumber: rollNum,
      username: uname,
      enrollmentId: `ENR-${new Date().getFullYear()}-${rollNum.slice(3)}`,
      batchId: '',
      batchName: 'Unassigned',
      origin: extra?.origin || 'PORTAL_SIGNUP',
      status: extra?.origin === 'QUICK_JOIN' ? 'QUICK_JOIN' : 'ACTIVE',
      photoUrl: user.photoURL || '',
      attemptsCount: 0,
      avgPercentage: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(studentRef, newProfile);
    } catch {
      // Fallback safely if offline or rules reject duplicate write
    }
    const full = { id: user.uid, ...newProfile };
    setStudentProfile(full);
    return full;
  };

  // Student auth state (Firebase Auth for root portal, isolated cookie session for secondary tenants)
  useEffect(() => {
    if (!tenantResolved) return;

    if (isIsolatedTenant) {
      let active = true;
      salarApi
        .getTenantStudentSession(activeOrgId)
        .then((res) => {
          if (!active) return;
          if (res.authenticated && res.student) {
            const stu = res.student as unknown as StudentProfile;
            setFirebaseUser({
              uid: stu.uid,
              email: stu.email,
              displayName: stu.name,
              photoURL: stu.photoUrl || '',
            } as unknown as User);
            setStudentProfile(stu);
            if (!adminGateToken) {
              setRole('STUDENT');
            }
          } else {
            setFirebaseUser(null);
            setStudentProfile(null);
            if (!adminGateToken) setRole(null);
          }
        })
        .catch(() => {
          if (active) {
            setFirebaseUser(null);
            setStudentProfile(null);
          }
        })
        .finally(() => {
          if (active) setFirebaseAuthChecked(true);
        });
      return () => {
        active = false;
      };
    }

    if (!redirectCheckedRef.current) {
      redirectCheckedRef.current = true;
      getRedirectResult(auth)
        .then(async (cred) => {
          let intendedRole: UserRole | null = null;
          try {
            intendedRole = window.sessionStorage.getItem(REDIRECT_ROLE_KEY) as UserRole | null;
            window.sessionStorage.removeItem(REDIRECT_ROLE_KEY);
          } catch {
            // ignore
          }
          if (!cred?.user) return;
          const user = cred.user;
          const isPrimary = user.emailVerified && isAuthorizedAdminEmail(user.email);
          let isAdminDoc = false;
          if (!isPrimary) {
            try {
              const adminSnap = await getDoc(doc(db, 'admins', user.uid));
              isAdminDoc = adminSnap.exists();
            } catch {
              isAdminDoc = false;
            }
          }
          if (intendedRole === 'SUPER_ADMIN' && !isPrimary && !isAdminDoc) {
            await signOut(auth);
            setCloudLinkError(
              `Account ${user.email} does not hold Super Admin authorization. Sign in with gurukulclassestech@gmail.com or advaitp38@gmail.com.`
            );
            return;
          }
          if (isPrimary || isAdminDoc) {
            setRole('SUPER_ADMIN');
            setCloudAuthNeeded(false);
            setCloudLinkError('');
          }
        })
        .catch((err) => {
          try {
            window.sessionStorage.removeItem(REDIRECT_ROLE_KEY);
          } catch {
            // ignore
          }
          setCloudLinkError(mapFirebaseAuthError(err));
        });
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setStudentProfile(null);
        if (!adminGateToken) {
          setRole(null);
        }
        setFirebaseAuthChecked(true);
        return;
      }

      try {
        const isPrimary = user.emailVerified && isAuthorizedAdminEmail(user.email);
        let isAdminDoc = false;
        if (!isPrimary) {
          try {
            const adminSnap = await getDoc(doc(db, 'admins', user.uid));
            isAdminDoc = adminSnap.exists();
          } catch {
            isAdminDoc = false;
          }
        }

        if (isPrimary || isAdminDoc) {
          setRole('SUPER_ADMIN');
          setCloudAuthNeeded(false);
          setCloudLinkError('');
        } else if (!adminGateToken) {
          setRole('STUDENT');
          await syncStudentDoc(user);
        }
      } catch (err) {
        console.error('Auth state sync error:', err);
      } finally {
        setFirebaseAuthChecked(true);
      }
    });
    return () => unsub();
  }, [tenantResolved, isIsolatedTenant, activeOrgId, adminGateToken]);

  const mapFirebaseAuthError = (err: unknown): string => {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code || '') : '';
    const msg = err instanceof Error ? err.message : String(err);
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';

    if (code === 'auth/unauthorized-domain' || msg.includes('auth/unauthorized-domain')) {
      return `Firebase Unauthorized Domain (auth/unauthorized-domain): "${host}" must be added in Firebase Console > Authentication > Settings > Authorized domains.`;
    }
    if (code === 'auth/popup-blocked' || msg.includes('auth/popup-blocked')) {
      return 'Browser popup was blocked (Brave Shields or popup blocker). Allow popups for this site or click "Use Redirect Sign-In" below.';
    }
    if (code === 'auth/popup-closed-by-user' || msg.includes('auth/popup-closed-by-user')) {
      return 'Google Sign-In popup was closed before completing login. Please try again.';
    }
    if (code === 'auth/cancelled-popup-request' || msg.includes('auth/cancelled-popup-request')) {
      return 'Another Google Sign-In popup was already pending. Please try again.';
    }
    if (code === 'auth/network-request-failed' || msg.includes('auth/network-request-failed')) {
      return 'Network request to Google/Firebase failed. Disable strict Brave Shields on this site or check your internet connection.';
    }
    if (msg.includes('auth/operation-not-allowed')) {
      return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication > Sign-in method > Email/Password). Please use Google Sign-In or enable Email/Password in Firebase Console.';
    }
    if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
      return 'Invalid email or password. Please verify your credentials.';
    }
    if (msg.includes('auth/email-already-in-use')) {
      return 'An account with this email already exists. Please log in instead.';
    }
    if (msg.includes('auth/weak-password')) {
      return 'Password must be at least 6 characters long.';
    }
    return msg;
  };

  const signInWithGoogle = async (intendedRole: UserRole): Promise<{ role: UserRole; error?: string }> => {
    if (isIsolatedTenant) {
      return {
        role: 'STUDENT',
        error: 'Google Sign-In is disabled on isolated client portals. Please use your portal email & password.',
      };
    }
    setCloudLinkError('');
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const user = cred.user;
      const isPrimary = user.emailVerified && isAuthorizedAdminEmail(user.email);
      let isAdminDoc = false;
      if (!isPrimary) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', user.uid));
          isAdminDoc = adminSnap.exists();
        } catch {
          isAdminDoc = false;
        }
      }

      if (intendedRole === 'SUPER_ADMIN') {
        if (!isPrimary && !isAdminDoc) {
          await signOut(auth);
          const errMsg = `Account ${user.email} does not hold Super Admin authorization. Please sign in with gurukulclassestech@gmail.com or advaitp38@gmail.com.`;
          setCloudLinkError(errMsg);
          return {
            role: 'STUDENT',
            error: errMsg,
          };
        }
        setRole('SUPER_ADMIN');
        setCloudAuthNeeded(false);
        setCloudLinkError('');
        return { role: 'SUPER_ADMIN' };
      }

      if (isPrimary || isAdminDoc) {
        setRole('SUPER_ADMIN');
        setCloudAuthNeeded(false);
        setCloudLinkError('');
        return { role: 'SUPER_ADMIN' };
      }

      setRole('STUDENT');
      await syncStudentDoc(user);
      return { role: 'STUDENT' };
    } catch (err: unknown) {
      const mapped = mapFirebaseAuthError(err);
      if (intendedRole === 'SUPER_ADMIN') {
        setCloudLinkError(mapped);
      }
      return { role: 'STUDENT', error: mapped };
    }
  };

  const signInWithGoogleRedirectFallback = async (intendedRole: UserRole): Promise<void> => {
    if (isIsolatedTenant) return;
    setCloudLinkError('');
    try {
      window.sessionStorage.setItem(REDIRECT_ROLE_KEY, intendedRole);
    } catch {
      // ignore
    }
    try {
      await signInWithRedirect(auth, googleAuthProvider);
    } catch (err: unknown) {
      setCloudLinkError(mapFirebaseAuthError(err));
    }
  };

  const signInStudentEmail = async (email: string, password: string) => {
    if (isIsolatedTenant) {
      try {
        const res = await salarApi.loginTenantStudent(activeOrgId, { email: email.trim(), password });
        const stu = res.student as unknown as StudentProfile;
        setFirebaseUser({
          uid: stu.uid,
          email: stu.email,
          displayName: stu.name,
          photoURL: stu.photoUrl || '',
        } as unknown as User);
        setStudentProfile(stu);
        setRole('STUDENT');
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Login failed.' };
      }
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;
      if (user.emailVerified && isAuthorizedAdminEmail(user.email)) {
        setRole('SUPER_ADMIN');
      } else {
        setRole('STUDENT');
        await syncStudentDoc(user);
      }
      return {};
    } catch (err) {
      return { error: mapFirebaseAuthError(err) };
    }
  };

  const registerStudentEmail = async (params: {
    name: string;
    email: string;
    password: string;
    mobile: string;
    classLevel: 'Class 11th' | 'Class 12th' | 'Dropper / Repeater';
    targetExam: 'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'Boards + CET' | 'JEE Main + Advanced';
    origin?: 'PORTAL_SIGNUP' | 'QUICK_JOIN';
  }) => {
    if (isIsolatedTenant) {
      try {
        const res = await salarApi.registerTenantStudent(activeOrgId, {
          name: params.name.trim(),
          email: params.email.trim(),
          password: params.password,
          mobile: params.mobile.trim(),
          classLevel: params.classLevel,
          targetExam: params.targetExam,
          origin: params.origin || 'PORTAL_SIGNUP',
        });
        const stu = res.student as unknown as StudentProfile;
        setFirebaseUser({
          uid: stu.uid,
          email: stu.email,
          displayName: stu.name,
          photoURL: stu.photoUrl || '',
        } as unknown as User);
        setStudentProfile(stu);
        setRole('STUDENT');
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Registration failed.' };
      }
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
      await updateProfile(cred.user, { displayName: params.name.trim() });
      setRole('STUDENT');
      await syncStudentDoc(cred.user, {
        name: params.name.trim(),
        mobile: params.mobile.trim(),
        whatsapp: params.mobile.trim(),
        classLevel: params.classLevel,
        targetExam: params.targetExam,
        origin: params.origin || 'PORTAL_SIGNUP',
      });
      return {};
    } catch (err) {
      return { error: mapFirebaseAuthError(err) };
    }
  };

  const resetPassword = async (email: string) => {
    if (isIsolatedTenant) {
      return {
        error: `Please contact ${settings.instituteName} (${settings.email || 'institute admin'}) to reset your student portal password.`,
      };
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return {};
    } catch (err) {
      return { error: mapFirebaseAuthError(err) };
    }
  };

  const unlockAdminWithToken = (token: string) => {
    if (!isIsolatedTenant && token && token !== 'cookie-session') {
      try {
        window.sessionStorage.setItem(ROOT_ADMIN_BEARER_KEY, token);
      } catch {
        // ignore
      }
    }
    setAdminGateToken(token);
    setRole('SUPER_ADMIN');
  };

  const logout = async () => {
    setAdminGateToken(null);
    setStudentProfile(null);
    setRole(null);
    setCloudAuthNeeded(false);
    setCloudLinkError('');
    try {
      window.sessionStorage.removeItem(ROOT_ADMIN_BEARER_KEY);
    } catch {
      // ignore
    }
    if (isIsolatedTenant) {
      setFirebaseUser(null);
      try {
        await salarApi.logoutTenantAdmin(activeOrgId);
      } catch {
        // ignore
      }
      try {
        await salarApi.logoutTenantStudent(activeOrgId);
      } catch {
        // ignore
      }
      return;
    }

    try {
      await fetch('/api/auth/admin/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
    } catch {
      // Ignore network error on cookie cleanup
    }
    if (auth.currentUser) {
      await signOut(auth);
    }
  };

  const refreshStudentProfile = async () => {
    if (isIsolatedTenant) {
      if (!firebaseUser) return;
      const snap = await getDoc(doc(db, 'students', firebaseUser.uid));
      if (snap.exists()) {
        setStudentProfile({ id: snap.id, ...(snap.data() as Omit<StudentProfile, 'id'>) });
      }
      return;
    }
    if (!auth.currentUser) return;
    const snap = await getDoc(doc(db, 'students', auth.currentUser.uid));
    if (snap.exists()) {
      setStudentProfile({ id: snap.id, ...(snap.data() as Omit<StudentProfile, 'id'>) });
    }
  };

  const isAdminUnlocked = role === 'SUPER_ADMIN' || Boolean(adminGateToken);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        role,
        adminGateToken,
        isAdminUnlocked,
        cloudAuthNeeded,
        cloudLinkError,
        clearCloudLinkError: () => setCloudLinkError(''),
        studentProfile,
        settings,
        tenantContext,
        isIsolatedTenant,
        tenantNotFound,
        authReady,
        syncStatus,
        lastSyncedAt,
        signInWithGoogle,
        signInWithGoogleRedirectFallback,
        signInStudentEmail,
        registerStudentEmail,
        resetPassword,
        unlockAdminWithToken,
        logout,
        refreshStudentProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
