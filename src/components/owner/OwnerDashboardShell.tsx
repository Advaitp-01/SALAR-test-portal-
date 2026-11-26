import React, { useCallback, useEffect, useState } from 'react';
import { salarApi } from '../../lib/salarApi';
import type { OwnerBootstrapData, OwnerModuleId } from '../../types/salar';
import { OwnerAllocationsView } from './OwnerAllocationsView';
import { OwnerBackupsView } from './OwnerBackupsView';
import { OwnerBillingView } from './OwnerBillingView';
import { OwnerClientsView } from './OwnerClientsView';
import { OwnerDomainsView } from './OwnerDomainsView';
import { OwnerInfrastructureView } from './OwnerInfrastructureView';
import { OwnerLayout } from './OwnerLayout';
import { OwnerLicensesView } from './OwnerLicensesView';
import { OwnerOperationsView } from './OwnerOperationsView';
import { OwnerOverviewView } from './OwnerOverviewView';
import { OwnerPlansView } from './OwnerPlansView';
import { OwnerSecurityView } from './OwnerSecurityView';

interface OwnerDashboardShellProps {
  onBackToClientPortal: () => void;
  onSessionExpired: () => void;
}

export const OwnerDashboardShell: React.FC<OwnerDashboardShellProps> = ({
  onBackToClientPortal,
  onSessionExpired,
}) => {
  const [activeModule, setActiveModule] = useState<OwnerModuleId>('overview');
  const [preselectedAllocId, setPreselectedAllocId] = useState<string | null>(null);
  const [data, setData] = useState<OwnerBootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadBootstrap = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const res = await salarApi.getBootstrap();
        setData(res);
        setError('');
      } catch (err: unknown) {
        const e = err as Error & { status?: number };
        if (e.status === 401) {
          onSessionExpired();
          return;
        }
        setError(e.message || 'Failed to load Owner Console data.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onSessionExpired]
  );

  useEffect(() => {
    void loadBootstrap(false);
  }, [loadBootstrap]);

  const handleLogout = async () => {
    try {
      await salarApi.logout();
    } finally {
      onSessionExpired();
    }
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl px-6 py-4 text-xs font-mono text-slate-600">
          {error || 'Loading SALAR Tech Owner Control Room...'}
        </div>
      </div>
    );
  }

  return (
    <OwnerLayout
      activeModule={activeModule}
      onSelectModule={(mod) => {
        if (mod !== 'allocations') setPreselectedAllocId(null);
        setActiveModule(mod);
      }}
      data={data}
      refreshing={refreshing}
      onRefresh={() => loadBootstrap(true)}
      onBackToClientPortal={onBackToClientPortal}
      onLogout={handleLogout}
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
      )}

      {activeModule === 'overview' && <OwnerOverviewView data={data} onNavigate={setActiveModule} />}
      {activeModule === 'clients' && (
        <OwnerClientsView
          data={data}
          onRefresh={() => loadBootstrap(true)}
          onReassignPortal={(allocId) => {
            setPreselectedAllocId(allocId);
            setActiveModule('allocations');
          }}
        />
      )}
      {activeModule === 'licenses' && <OwnerLicensesView data={data} onRefresh={() => loadBootstrap(true)} />}
      {activeModule === 'allocations' && (
        <OwnerAllocationsView
          data={data}
          onRefresh={() => loadBootstrap(true)}
          initialReassignAllocationId={preselectedAllocId}
          onClearInitialReassign={() => setPreselectedAllocId(null)}
        />
      )}
      {activeModule === 'plans' && <OwnerPlansView data={data} onRefresh={() => loadBootstrap(true)} />}
      {(activeModule === 'billing' || activeModule === 'payments') && (
        <OwnerBillingView mode={activeModule} data={data} onRefresh={() => loadBootstrap(true)} />
      )}
      {(activeModule === 'infrastructure' ||
        activeModule === 'load-balancing' ||
        activeModule === 'database') && (
        <OwnerInfrastructureView
          mode={activeModule}
          data={data}
          onRefresh={() => loadBootstrap(true)}
        />
      )}
      {(activeModule === 'domains' || activeModule === 'analytics') && (
        <OwnerDomainsView mode={activeModule} data={data} onRefresh={() => loadBootstrap(true)} />
      )}
      {activeModule === 'backups' && <OwnerBackupsView data={data} onRefresh={() => loadBootstrap(true)} />}
      {activeModule === 'security' && <OwnerSecurityView data={data} onRefresh={() => loadBootstrap(true)} />}
      {(activeModule === 'notifications' ||
        activeModule === 'audit-logs' ||
        activeModule === 'settings') && (
        <OwnerOperationsView mode={activeModule} data={data} onRefresh={() => loadBootstrap(true)} />
      )}
    </OwnerLayout>
  );
};
