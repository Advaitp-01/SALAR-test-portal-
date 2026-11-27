import {
  addDoc as fsAddDoc,
  collection as fsCollection,
  deleteDoc as fsDeleteDoc,
  doc as fsDoc,
  getDoc as fsGetDoc,
  getDocs as fsGetDocs,
  increment as fsIncrement,
  onSnapshot as fsOnSnapshot,
  orderBy as fsOrderBy,
  query as fsQuery,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  where as fsWhere,
  writeBatch as fsWriteBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type FieldValue,
  type Firestore,
  type OrderByDirection,
  type Query,
  type QueryConstraint,
  type QuerySnapshot,
  type SetOptions,
  type UpdateData,
  type WhereFilterOp,
  type WriteBatch,
} from 'firebase/firestore';
import { auth } from './firebase';

export const DEFAULT_ROOT_ORG_ID = 'SALAR-ORG-00001';

const cloudAuthNeededListeners = new Set<(reason: string) => void>();

export function subscribeCloudAuthNeeded(fn: (reason: string) => void): () => void {
  cloudAuthNeededListeners.add(fn);
  return () => {
    cloudAuthNeededListeners.delete(fn);
  };
}

export function notifyCloudAuthNeeded(reason: string): void {
  cloudAuthNeededListeners.forEach((fn) => fn(reason));
}

let activeTenantOrgId: string = DEFAULT_ROOT_ORG_ID;

export function setActiveTenantOrgId(orgId?: string | null): void {
  activeTenantOrgId = orgId && orgId.trim() ? orgId.trim() : DEFAULT_ROOT_ORG_ID;
  emitTenantChange('*');
}

export function getActiveTenantOrgId(): string {
  return activeTenantOrgId;
}

export function isIsolatedSecondaryTenant(): boolean {
  return activeTenantOrgId !== DEFAULT_ROOT_ORG_ID;
}

// Local reactive bus so onSnapshot listeners refresh immediately on writes
type ListenerFn = () => void;
const listeners = new Map<string, Set<ListenerFn>>();

export function emitTenantChange(colPath: string): void {
  if (colPath === '*') {
    listeners.forEach((set) => set.forEach((fn) => fn()));
    return;
  }
  const normalized = colPath.replace(/^\/+|\/+$/g, '');
  listeners.forEach((set, key) => {
    if (key === '*' || normalized.startsWith(key) || key.startsWith(normalized)) {
      set.forEach((fn) => fn());
    }
  });
}

function subscribeKey(key: string, fn: ListenerFn): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    if (set && set.size === 0) listeners.delete(key);
  };
}

export interface TenantCollectionRef {
  __tenantKind: 'collection';
  orgId: string;
  path: string;
}

export interface TenantDocRef {
  __tenantKind: 'doc';
  orgId: string;
  collectionPath: string;
  id: string;
  path: string;
}

export interface TenantConstraint {
  __tenantKind: 'where' | 'orderBy';
  field: string;
  op?: string;
  value?: unknown;
  direction?: 'asc' | 'desc';
}

export interface TenantQueryRef {
  __tenantKind: 'query';
  orgId: string;
  collectionPath: string;
  filters: Array<{ field: string; op: string; value: unknown }>;
  orderBys: Array<{ field: string; direction: 'asc' | 'desc' }>;
}

function isTenantRef(val: unknown): val is TenantCollectionRef | TenantDocRef | TenantQueryRef {
  return Boolean(val && typeof val === 'object' && '__tenantKind' in (val as Record<string, unknown>));
}

function randomDocId(): string {
  return `td_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readTenantBearerToken(orgId: string): string {
  try {
    return (
      window.sessionStorage.getItem(`salar_tenant_bearer_${orgId}_admin`) ||
      window.sessionStorage.getItem(`salar_tenant_bearer_${orgId}_student`) ||
      ''
    );
  } catch {
    return '';
  }
}

async function tenantDbFetch<T>(orgId: string, endpoint: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const bearer = readTenantBearerToken(orgId);
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  const res = await fetch(`/api/tenant/${encodeURIComponent(orgId)}/db${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: text || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    const msg = (parsed as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return parsed as T;
}

export function collection(
  db: Firestore,
  path: string,
  ...pathSegments: string[]
): CollectionReference<DocumentData> {
  if (!isIsolatedSecondaryTenant()) {
    return fsCollection(db, path, ...pathSegments);
  }
  const fullPath = [path, ...pathSegments].map((s) => s.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
  const ref: TenantCollectionRef = {
    __tenantKind: 'collection',
    orgId: activeTenantOrgId,
    path: fullPath,
  };
  return ref as unknown as CollectionReference<DocumentData>;
}

export function doc(
  reference: Firestore | CollectionReference<DocumentData> | DocumentReference<DocumentData>,
  ...pathSegments: string[]
): DocumentReference<DocumentData> {
  const dbOrCollectionRef = reference as any;
  if (!isIsolatedSecondaryTenant() && !isTenantRef(dbOrCollectionRef)) {
    if (pathSegments.length === 0) {
      return fsDoc(dbOrCollectionRef);
    }
    return fsDoc(dbOrCollectionRef, pathSegments[0], ...pathSegments.slice(1));
  }

  if (isTenantRef(dbOrCollectionRef) && dbOrCollectionRef.__tenantKind === 'collection') {
    const id = pathSegments[0] || randomDocId();
    const ref: TenantDocRef = {
      __tenantKind: 'doc',
      orgId: dbOrCollectionRef.orgId,
      collectionPath: dbOrCollectionRef.path,
      id,
      path: `${dbOrCollectionRef.path}/${id}`,
    };
    return ref as unknown as DocumentReference<DocumentData>;
  }

  const allSegs = pathSegments.flatMap((s) => s.split('/').filter(Boolean));
  const id = allSegs.pop() || randomDocId();
  const collectionPath = allSegs.join('/');
  const ref: TenantDocRef = {
    __tenantKind: 'doc',
    orgId: activeTenantOrgId,
    collectionPath,
    id,
    path: `${collectionPath}/${id}`,
  };
  return ref as unknown as DocumentReference<DocumentData>;
}

export function where(fieldPath: string, opStr: WhereFilterOp, value: unknown): QueryConstraint {
  if (!isIsolatedSecondaryTenant()) {
    return fsWhere(fieldPath, opStr, value);
  }
  return {
    __tenantKind: 'where',
    field: fieldPath,
    op: String(opStr),
    value,
  } as unknown as QueryConstraint;
}

export function orderBy(fieldPath: string, directionStr: OrderByDirection = 'asc'): QueryConstraint {
  if (!isIsolatedSecondaryTenant()) {
    return fsOrderBy(fieldPath, directionStr);
  }
  return {
    __tenantKind: 'orderBy',
    field: fieldPath,
    direction: directionStr,
  } as unknown as QueryConstraint;
}

export function query(
  target: Query<DocumentData>,
  ...constraints: QueryConstraint[]
): Query<DocumentData> {
  if (!isIsolatedSecondaryTenant() && !isTenantRef(target)) {
    return fsQuery(target, ...constraints);
  }
  const base = target as unknown as TenantCollectionRef | TenantQueryRef;
  const filters = base.__tenantKind === 'query' ? [...base.filters] : [];
  const orderBys = base.__tenantKind === 'query' ? [...base.orderBys] : [];
  for (const rawC of constraints) {
    const c = rawC as unknown as TenantConstraint;
    if (!c || typeof c !== 'object') continue;
    if (c.__tenantKind === 'where') {
      filters.push({ field: c.field, op: c.op || '==', value: c.value });
    } else if (c.__tenantKind === 'orderBy') {
      orderBys.push({ field: c.field, direction: c.direction || 'asc' });
    }
  }
  const qRef: TenantQueryRef = {
    __tenantKind: 'query',
    orgId: base.orgId,
    collectionPath: base.__tenantKind === 'collection' ? base.path : base.collectionPath,
    filters,
    orderBys,
  };
  return qRef as unknown as Query<DocumentData>;
}

export function increment(n: number): FieldValue {
  if (!isIsolatedSecondaryTenant()) {
    return fsIncrement(n);
  }
  return { __tenantOp: 'increment', value: n } as unknown as FieldValue;
}

function makeDocSnapshot(orgId: string, collectionPath: string, id: string, data?: Record<string, unknown>) {
  const ref: TenantDocRef = {
    __tenantKind: 'doc',
    orgId,
    collectionPath,
    id,
    path: `${collectionPath}/${id}`,
  };
  return {
    id,
    ref,
    exists: () => Boolean(data),
    data: () => data,
  };
}

function makeQuerySnapshot(
  orgId: string,
  collectionPath: string,
  items: Array<{ id: string; data: Record<string, unknown> }>
) {
  const docs = items.map((item) => makeDocSnapshot(orgId, collectionPath, item.id, item.data));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb: (docSnap: any) => void) => docs.forEach(cb),
  };
}

export async function getDoc(
  docRef: DocumentReference<DocumentData>
): Promise<DocumentSnapshot<DocumentData>> {
  if (!isTenantRef(docRef)) {
    return fsGetDoc(docRef);
  }
  const dRef = docRef as unknown as TenantDocRef;
  const res = await tenantDbFetch<{ exists: boolean; id: string; data?: Record<string, unknown> }>(
    dRef.orgId,
    '/doc/get',
    { collectionPath: dRef.collectionPath, docId: dRef.id }
  );
  return makeDocSnapshot(
    dRef.orgId,
    dRef.collectionPath,
    dRef.id,
    res.exists ? res.data : undefined
  ) as unknown as DocumentSnapshot<DocumentData>;
}

export async function getDocs(
  queryOrColRef: Query<DocumentData>
): Promise<QuerySnapshot<DocumentData>> {
  if (!isTenantRef(queryOrColRef)) {
    return fsGetDocs(queryOrColRef);
  }
  const ref = queryOrColRef as unknown as TenantCollectionRef | TenantQueryRef;
  const colPath = ref.__tenantKind === 'collection' ? ref.path : ref.collectionPath;
  const filters = ref.__tenantKind === 'query' ? ref.filters : [];
  const orderBys = ref.__tenantKind === 'query' ? ref.orderBys : [];
  const res = await tenantDbFetch<{ docs: Array<{ id: string; data: Record<string, unknown> }> }>(
    ref.orgId,
    '/query',
    { collectionPath: colPath, filters, orderBys }
  );
  return makeQuerySnapshot(
    ref.orgId,
    colPath,
    res.docs || []
  ) as unknown as QuerySnapshot<DocumentData>;
}

export function onSnapshot(
  reference: DocumentReference<DocumentData>,
  onNext: (snapshot: DocumentSnapshot<DocumentData>) => void,
  onError?: (error: Error) => void
): () => void;
export function onSnapshot(
  reference: Query<DocumentData>,
  onNext: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError?: (error: Error) => void
): () => void;
export function onSnapshot(
  target: DocumentReference<DocumentData> | Query<DocumentData>,
  onNext: (snapshot: any) => void,
  onError?: (error: Error) => void
): () => void {
  if (!isTenantRef(target)) {
    const wrappedError = (err: Error & { code?: string }) => {
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      if (
        (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) &&
        !auth.currentUser
      ) {
        notifyCloudAuthNeeded(msg || 'Cloud Firestore authorization required.');
        return;
      }
      if (onError) {
        onError(err);
      }
    };
    return fsOnSnapshot(target as any, onNext, wrappedError as any);
  }

  let active = true;
  const ref = target as unknown as TenantCollectionRef | TenantQueryRef | TenantDocRef;
  const watchPath =
    ref.__tenantKind === 'doc'
      ? ref.collectionPath
      : ref.__tenantKind === 'collection'
      ? ref.path
      : ref.collectionPath;

  const fetchOnce = async () => {
    if (!active) return;
    try {
      if (ref.__tenantKind === 'doc') {
        const snap = await getDoc(target as DocumentReference<DocumentData>);
        if (active) onNext(snap);
      } else {
        const snap = await getDocs(target as Query<DocumentData>);
        if (active) onNext(snap);
      }
    } catch (err) {
      if (active && onError) {
        onError(err instanceof Error ? err : new Error('Snapshot sync failed'));
      }
    }
  };

  void fetchOnce();
  const unsubBus = subscribeKey(watchPath, () => {
    void fetchOnce();
  });
  const timer = window.setInterval(() => {
    void fetchOnce();
  }, 5000);

  return () => {
    active = false;
    unsubBus();
    window.clearInterval(timer);
  };
}

export async function addDoc(
  colRef: CollectionReference<DocumentData>,
  data: DocumentData
): Promise<DocumentReference<DocumentData>> {
  if (!isTenantRef(colRef)) {
    return fsAddDoc(colRef, data);
  }
  const cRef = colRef as unknown as TenantCollectionRef;
  const res = await tenantDbFetch<{ id: string }>(cRef.orgId, '/doc/add', {
    collectionPath: cRef.path,
    data,
  });
  emitTenantChange(cRef.path);
  const outRef: TenantDocRef = {
    __tenantKind: 'doc',
    orgId: cRef.orgId,
    collectionPath: cRef.path,
    id: res.id,
    path: `${cRef.path}/${res.id}`,
  };
  return outRef as unknown as DocumentReference<DocumentData>;
}

export async function setDoc(
  docRef: DocumentReference<DocumentData>,
  data: DocumentData,
  options?: SetOptions
): Promise<void> {
  if (!isTenantRef(docRef)) {
    return options ? fsSetDoc(docRef, data, options) : fsSetDoc(docRef, data);
  }
  const dRef = docRef as unknown as TenantDocRef;
  await tenantDbFetch(dRef.orgId, '/doc/set', {
    collectionPath: dRef.collectionPath,
    docId: dRef.id,
    data,
    merge: Boolean((options as { merge?: boolean } | undefined)?.merge),
  });
  emitTenantChange(dRef.collectionPath);
}

export async function updateDoc(
  docRef: DocumentReference<DocumentData>,
  data: UpdateData<DocumentData> | Record<string, unknown>
): Promise<void> {
  if (!isTenantRef(docRef)) {
    return fsUpdateDoc(docRef, data as UpdateData<DocumentData>);
  }
  const dRef = docRef as unknown as TenantDocRef;
  await tenantDbFetch(dRef.orgId, '/doc/update', {
    collectionPath: dRef.collectionPath,
    docId: dRef.id,
    data,
  });
  emitTenantChange(dRef.collectionPath);
}

export async function deleteDoc(docRef: DocumentReference<DocumentData>): Promise<void> {
  if (!isTenantRef(docRef)) {
    return fsDeleteDoc(docRef);
  }
  const dRef = docRef as unknown as TenantDocRef;
  await tenantDbFetch(dRef.orgId, '/doc/delete', {
    collectionPath: dRef.collectionPath,
    docId: dRef.id,
  });
  emitTenantChange(dRef.collectionPath);
}

export function writeBatch(db: Firestore): WriteBatch {
  if (!isIsolatedSecondaryTenant()) {
    return fsWriteBatch(db);
  }
  const orgId = activeTenantOrgId;
  const ops: Array<{
    type: 'set' | 'update' | 'delete';
    collectionPath: string;
    docId: string;
    data?: Record<string, unknown>;
    merge?: boolean;
  }> = [];

  const batchImpl = {
    set(docRef: DocumentReference<DocumentData>, data: DocumentData, options?: SetOptions) {
      const dRef = docRef as unknown as TenantDocRef;
      ops.push({
        type: 'set',
        collectionPath: dRef.collectionPath,
        docId: dRef.id,
        data: data as Record<string, unknown>,
        merge: Boolean((options as { merge?: boolean } | undefined)?.merge),
      });
      return batchImpl;
    },
    update(docRef: DocumentReference<DocumentData>, data: UpdateData<DocumentData>) {
      const dRef = docRef as unknown as TenantDocRef;
      ops.push({
        type: 'update',
        collectionPath: dRef.collectionPath,
        docId: dRef.id,
        data: data as Record<string, unknown>,
      });
      return batchImpl;
    },
    delete(docRef: DocumentReference<DocumentData>) {
      const dRef = docRef as unknown as TenantDocRef;
      ops.push({
        type: 'delete',
        collectionPath: dRef.collectionPath,
        docId: dRef.id,
      });
      return batchImpl;
    },
    async commit() {
      if (ops.length === 0) return;
      await tenantDbFetch(orgId, '/batch', { ops });
      const touched = new Set(ops.map((o) => o.collectionPath));
      touched.forEach((p) => emitTenantChange(p));
    },
  };
  return batchImpl as unknown as WriteBatch;
}
