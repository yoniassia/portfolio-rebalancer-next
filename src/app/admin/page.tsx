'use client';

import { useState, useEffect, useCallback } from 'react';

const ADMIN_KEY = 'rebalancer-admin-2026';
const GREEN = '#00C853';
const RED = '#FF5252';
const YELLOW = '#FFD600';
const BLUE = '#4FC3F7';
const PURPLE = '#AB47BC';
const ORANGE = '#FF7043';
const BG = '#0D0D0D';
const CARD_BG = '#1A1A2E';
const BORDER = '#2A2A3E';
const TEXT = '#E0E0E0';
const TEXT_DIM = '#888';
const MONO = 'JetBrains Mono, monospace';

interface DashboardData {
  generatedAt: string;
  kpi: {
    totalUsers: number;
    totalPolicies: number;
    activePolicies: number;
    scheduledPolicies: number;
    driftPolicies: number;
    authExpiredPolicies: number;
    avgDrift: number;
    maxDrift: number;
    portfoliosDrifting: number;
    totalExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
    runningExecutions: number;
    totalTradesExecuted: number;
    totalTradesFailed: number;
  };
  breakdowns: {
    byMode: Record<string, number>;
    byAccountType: Record<string, number>;
    byMethod: Record<string, number>;
    byRisk: Record<string, number>;
    byTrigger: Record<string, number>;
  };
  usersTable: any[];
  policiesTable: any[];
  executionsTable: any[];
  timeline: Record<string, number>;
}

interface ReturnsDbData {
  instruments: number;
  trackedInstruments: number;
  priceRows: number;
  returnRows: number;
  cachedMatrices: number;
  oldestPrice: string | null;
  newestPrice: string | null;
  coverage: {
    total: number;
    withData: number;
    coveragePct: number;
    stale: number;
    neverUpdated: number;
  };
  byType: Record<string, number>;
  byTypeWithData: Record<string, number>;
  recentlyUpdated: { id: number; symbol: string; type: string; lastUpdated: string; hoursAgo: number }[];
  topStale: { id: number; symbol: string; type: string; lastUpdated: string | null }[];
  instrumentList: { id: number; symbol: string; displayName?: string; type: string; typeId: number; crypto: boolean; lastUpdated: string | null; stale: boolean }[];
}

type SortConfig = { key: string; dir: 'asc' | 'desc' };

function sortData<T>(data: T[], sort: SortConfig): T[] {
  return [...data].sort((a: any, b: any) => {
    const av = a[sort.key], bv = b[sort.key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

function fmt(n: number, decimals = 2): string {
  return n?.toFixed(decimals) ?? '—';
}

function fmtDate(ts: string | number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtRelative(ts: string | number): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

// ===== Chart Components =====

function BarChart({ data, color = GREEN }: { data: { label: string; value: number }[]; color?: string }) {
  if (!data.length) return <div style={{ color: TEXT_DIM, padding: 16 }}>No data</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, padding: '8px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 24 }}>
          <span style={{ fontSize: 10, color: TEXT_DIM, fontFamily: MONO }}>{d.value}</span>
          <div style={{
            width: '100%', maxWidth: 40,
            height: `${Math.max((d.value / max) * 90, 4)}px`,
            background: color, borderRadius: 4, marginTop: 2,
          }} />
          <span style={{ fontSize: 9, color: TEXT_DIM, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 60 }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div style={{ color: TEXT_DIM, padding: 16 }}>No data</div>;
  const size = 120;
  const cx = size / 2, cy = size / 2, r = 45, inner = 28;
  let cumAngle = -90;

  const arcs = data.map(d => {
    const angle = (d.value / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
    const ix1 = cx + inner * Math.cos(endRad), iy1 = cy + inner * Math.sin(endRad);
    const ix2 = cx + inner * Math.cos(startRad), iy2 = cy + inner * Math.sin(startRad);
    return { ...d, path: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${largeArc} 0 ${ix2} ${iy2} Z` };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} stroke={BG} strokeWidth={1} />)}
        <text x={cx} y={cy + 4} textAnchor="middle" fill={TEXT} fontSize={14} fontFamily={MONO}>{total}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
            <span style={{ color: TEXT_DIM }}>{d.label}: </span>
            <span style={{ color: TEXT, fontFamily: MONO }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Sortable Table =====

function SortableTable({ columns, data, sort, onSort }: {
  columns: { key: string; label: string; align?: string; render?: (v: any, row: any) => React.ReactNode }[];
  data: any[];
  sort: SortConfig;
  onSort: (key: string) => void;
}) {
  const sorted = sortData(data, sort);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} onClick={() => onSort(col.key)} style={{
                padding: '8px 10px', textAlign: (col.align as any) || 'left', color: TEXT_DIM,
                borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                {col.label} {sort.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${BORDER}20` }}>
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: '7px 10px', fontFamily: MONO, fontSize: 11,
                  textAlign: (col.align as any) || 'left', color: TEXT,
                }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={columns.length} style={{ padding: 20, textAlign: 'center', color: TEXT_DIM }}>No data yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ===== KPI Card =====

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px',
      flex: '1 1 140px', minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: MONO, color: color || TEXT }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ===== Tabs =====

function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
          color: active === t ? GREEN : TEXT_DIM, fontSize: 13, fontWeight: active === t ? 600 : 400,
          borderBottom: active === t ? `2px solid ${GREEN}` : '2px solid transparent',
        }}>{t}</button>
      ))}
    </div>
  );
}

// ===== Drift Indicator =====

function DriftBadge({ value, threshold }: { value: number | null; threshold: number }) {
  if (value == null) return <span style={{ color: TEXT_DIM }}>—</span>;
  const pct = (value * 100).toFixed(1);
  const exceeds = value > threshold;
  return (
    <span style={{
      color: exceeds ? RED : GREEN,
      fontWeight: exceeds ? 700 : 400,
      fontFamily: MONO,
    }}>
      {pct}%
      {exceeds && ' ⚠'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: GREEN, failed: RED, running: BLUE, pending: YELLOW, 'auth-expired': ORANGE,
  };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'uppercase',
      background: `${colors[status] || TEXT_DIM}22`,
      color: colors[status] || TEXT_DIM,
      border: `1px solid ${colors[status] || TEXT_DIM}44`,
    }}>
      {status}
    </span>
  );
}

function TriggerBadge({ trigger }: { trigger: string }) {
  const colors: Record<string, string> = { scheduled: BLUE, drift: YELLOW, manual: TEXT_DIM };
  const icons: Record<string, string> = { scheduled: '🕐', drift: '📊', manual: '👤' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
      background: `${colors[trigger] || TEXT_DIM}22`,
      color: colors[trigger] || TEXT_DIM,
    }}>
      {icons[trigger] || ''} {trigger}
    </span>
  );
}

// ===== Policy Detail Modal =====

function PolicyModal({ policy, onClose }: { policy: any; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16,
        padding: 28, maxWidth: 600, width: '90%', maxHeight: '80vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: GREEN, fontSize: 18 }}>Policy: {policy.username}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: TEXT_DIM, fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: TEXT }}>
          {([
            ['ID', policy.id],
            ['Mode', policy.mode],
            ['Account', policy.accountType],
            ['Method', policy.optimizationMethod],
            ['Risk Level', policy.riskLevel],
            ['Drift Threshold', `${(policy.driftThreshold * 100).toFixed(0)}%`],
            ['Schedule', policy.schedule || '—'],
            ['Instruments', policy.instruments],
            ['Enabled', policy.enabled ? '✅ Yes' : '❌ No'],
            ['Last Rebalance', policy.lastRebalanceAt ? fmtRelative(policy.lastRebalanceAt) : 'Never'],
            ['Next Scheduled', policy.nextScheduledAt ? fmtDate(policy.nextScheduledAt) : '—'],
            ['Last Drift', policy.lastDriftValue != null ? `${(policy.lastDriftValue * 100).toFixed(1)}%` : '—'],
            ['Created', fmtDate(policy.createdAt)],
          ] as [string, any][]).map(([label, val]) => (
            <div key={label}>
              <span style={{ color: TEXT_DIM }}>{label}: </span>
              <span style={{ fontFamily: MONO }}>{typeof val === 'string' || typeof val === 'number' ? val : JSON.stringify(val)}</span>
            </div>
          ))}
        </div>

        {policy.lastDriftDetails?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8, textTransform: 'uppercase' }}>Top Drift Items</div>
            {policy.lastDriftDetails.map((d: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                <span style={{ color: TEXT }}>{d.symbol}</span>
                <span style={{ color: Math.abs(d.drift) > policy.driftThreshold ? RED : GREEN, fontFamily: MONO }}>
                  {(d.drift * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== MAIN DASHBOARD =====

export default function RebalancerAdmin() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [activeTab, setActiveTab] = useState('Policies');
  const [selectedPolicy, setSelectedPolicy] = useState<any>(null);
  const [policySort, setPolicySort] = useState<SortConfig>({ key: 'createdAt', dir: 'desc' });
  const [execSort, setExecSort] = useState<SortConfig>({ key: 'startedAt', dir: 'desc' });
  const [triggerCronLoading, setTriggerCronLoading] = useState(false);
  const [cronResult, setCronResult] = useState<string | null>(null);
  const [returnsDb, setReturnsDb] = useState<ReturnsDbData | null>(null);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [updateReturnsLoading, setUpdateReturnsLoading] = useState(false);
  const [updateReturnsResult, setUpdateReturnsResult] = useState<string | null>(null);
  const [instrumentSearch, setInstrumentSearch] = useState('');
  const [instrumentSort, setInstrumentSort] = useState<SortConfig>({ key: 'symbol', dir: 'asc' });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/dashboard?key=${ADMIN_KEY}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReturnsDb = useCallback(async () => {
    setReturnsLoading(true);
    try {
      const res = await fetch(`/api/admin/returns-stats?key=${ADMIN_KEY}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReturnsDb(await res.json());
    } catch {} finally {
      setReturnsLoading(false);
    }
  }, []);

  const triggerUpdateReturns = async (seed: boolean = false) => {
    setUpdateReturnsLoading(true);
    setUpdateReturnsResult(null);
    try {
      const url = `/api/cron/update-returns?key=${ADMIN_KEY}${seed ? '&seed=true' : ''}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      const json = await res.json();
      setUpdateReturnsResult(JSON.stringify(json, null, 2));
      fetchReturnsDb();
    } catch (e: any) {
      setUpdateReturnsResult(`Error: ${e.message}`);
    } finally {
      setUpdateReturnsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [autoRefresh, fetchData]);

  const toggleSort = (setter: (s: SortConfig) => void, current: SortConfig) => (key: string) => {
    setter(current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const triggerCron = async (dryRun: boolean) => {
    setTriggerCronLoading(true);
    setCronResult(null);
    try {
      const res = await fetch(`/api/cron/rebalance?key=${ADMIN_KEY}${dryRun ? '&dry=true' : ''}`);
      const json = await res.json();
      setCronResult(JSON.stringify(json, null, 2));
      if (!dryRun) fetchData();
    } catch (e: any) {
      setCronResult(`Error: ${e.message}`);
    } finally {
      setTriggerCronLoading(false);
    }
  };

  if (loading) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREEN, fontFamily: MONO }}>
      Loading dashboard...
    </div>
  );

  if (error && !data) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: RED, fontFamily: MONO }}>
      Error: {error}
    </div>
  );

  if (!data) return null;
  const { kpi, breakdowns } = data;

  const modeColors: Record<string, string> = { scheduled: BLUE, drift: YELLOW, both: PURPLE };
  const methodColors = [GREEN, BLUE, YELLOW, RED, PURPLE, ORANGE];
  const triggerColors: Record<string, string> = { scheduled: BLUE, drift: YELLOW, manual: TEXT_DIM };

  const timelineData = Object.entries(data.timeline).sort().slice(-14).map(([d, v]) => ({ label: d.slice(5), value: v }));
  const modeData = Object.entries(breakdowns.byMode).map(([k, v]) => ({ label: k, value: v, color: modeColors[k] || TEXT_DIM }));
  const methodData = Object.entries(breakdowns.byMethod).map(([k, v], i) => ({ label: k.replace(/-/g, ' '), value: v, color: methodColors[i % methodColors.length] }));
  const triggerData = Object.entries(breakdowns.byTrigger).map(([k, v]) => ({ label: k, value: v, color: triggerColors[k] || TEXT_DIM }));
  const accountData = Object.entries(breakdowns.byAccountType).map(([k, v]) => ({ label: k, value: v, color: k === 'real' ? GREEN : BLUE }));

  // Policy table columns
  const policyCols = [
    { key: 'username', label: 'User', render: (v: string) => <span style={{ color: GREEN, fontWeight: 600 }}>{v}</span> },
    { key: 'mode', label: 'Mode', render: (v: string) => <span style={{ color: modeColors[v] || TEXT }}>{v}</span> },
    { key: 'enabled', label: 'Active', render: (v: boolean) => v ? <span style={{ color: GREEN }}>●</span> : <span style={{ color: RED }}>●</span> },
    { key: 'accountType', label: 'Account', render: (v: string) => <span style={{ color: v === 'real' ? GREEN : BLUE, textTransform: 'uppercase' as const }}>{v}</span> },
    { key: 'optimizationMethod', label: 'Method' },
    { key: 'instruments', label: 'Instruments', align: 'right' },
    { key: 'driftThreshold', label: 'Thresh', align: 'right', render: (v: number) => `${(v * 100).toFixed(0)}%` },
    { key: 'lastDriftValue', label: 'Drift', align: 'right', render: (v: number, row: any) => <DriftBadge value={v} threshold={row.driftThreshold} /> },
    { key: 'schedule', label: 'Schedule', render: (v: string) => <span style={{ fontSize: 10, color: TEXT_DIM }}>{v || '—'}</span> },
    { key: 'lastRebalanceAt', label: 'Last Run', render: (v: string) => <span style={{ fontSize: 10 }}>{v ? fmtRelative(v) : 'Never'}</span> },
    { key: 'nextScheduledAt', label: 'Next', render: (v: string) => <span style={{ fontSize: 10 }}>{v ? fmtRelative(v) : '—'}</span> },
  ];

  const execCols = [
    { key: 'startedAt', label: 'Time', render: (v: string) => fmtDate(v) },
    { key: 'username', label: 'User', render: (v: string) => <span style={{ color: GREEN }}>{v}</span> },
    { key: 'trigger', label: 'Trigger', render: (v: string) => <TriggerBadge trigger={v} /> },
    { key: 'status', label: 'Status', render: (v: string) => <StatusBadge status={v} /> },
    { key: 'driftAtTrigger', label: 'Drift', align: 'right', render: (v: number) => v != null ? `${(v * 100).toFixed(1)}%` : '—' },
    { key: 'tradesPlanned', label: 'Planned', align: 'right' },
    { key: 'tradesExecuted', label: 'Executed', align: 'right', render: (v: number) => <span style={{ color: v > 0 ? GREEN : TEXT_DIM }}>{v}</span> },
    { key: 'tradesFailed', label: 'Failed', align: 'right', render: (v: number) => <span style={{ color: v > 0 ? RED : TEXT_DIM }}>{v}</span> },
    { key: 'accountType', label: 'Account', render: (v: string) => <span style={{ color: v === 'real' ? GREEN : BLUE, textTransform: 'uppercase' as const, fontSize: 10 }}>{v}</span> },
    { key: 'error', label: 'Error', render: (v: string) => v ? <span title={v} style={{ color: RED, fontSize: 10, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{v}</span> : '—' },
  ];

  return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT, fontFamily: 'Inter, DM Sans, sans-serif' }}>
      {selectedPolicy && <PolicyModal policy={selectedPolicy} onClose={() => setSelectedPolicy(null)} />}

      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, background: BG, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: GREEN }}>⚖️ Rebalancer Admin</span>
          <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
            Last: {new Date(data.generatedAt).toLocaleTimeString()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 12, color: TEXT_DIM, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
          </label>
          <button
            onClick={() => triggerCron(true)}
            disabled={triggerCronLoading}
            style={{
              background: YELLOW + '22', color: YELLOW, border: `1px solid ${YELLOW}44`, borderRadius: 8,
              padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: triggerCronLoading ? 0.5 : 1,
            }}
          >
            🔍 Dry Run
          </button>
          <button
            onClick={() => triggerCron(false)}
            disabled={triggerCronLoading}
            style={{
              background: `${RED}22`, color: RED, border: `1px solid ${RED}44`, borderRadius: 8,
              padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: triggerCronLoading ? 0.5 : 1,
            }}
          >
            ▶ Run Cron
          </button>
          <button onClick={fetchData} style={{
            background: GREEN, color: '#000', border: 'none', borderRadius: 8, padding: '6px 16px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Cron Result Panel */}
        {cronResult && (
          <div style={{
            background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: TEXT_DIM, textTransform: 'uppercase' }}>Cron Result</span>
              <button onClick={() => setCronResult(null)} style={{ background: 'none', border: 'none', color: TEXT_DIM, cursor: 'pointer' }}>✕</button>
            </div>
            <pre style={{ fontSize: 11, fontFamily: MONO, color: TEXT, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
              {cronResult}
            </pre>
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="👤 Users" value={kpi.totalUsers} color={GREEN} />
          <KpiCard label="📋 Policies" value={kpi.totalPolicies} sub={`${kpi.activePolicies} active`} />
          <KpiCard label="🕐 Scheduled" value={kpi.scheduledPolicies} color={BLUE} />
          <KpiCard label="📊 Drift-Based" value={kpi.driftPolicies} color={YELLOW} />
          <KpiCard label="⚠️ Auth Expired" value={kpi.authExpiredPolicies} color={kpi.authExpiredPolicies > 0 ? RED : TEXT_DIM} />
          <KpiCard label="📈 Avg Drift" value={`${fmt(kpi.avgDrift)}%`} color={kpi.avgDrift > 5 ? RED : GREEN} />
          <KpiCard label="🔴 Max Drift" value={`${fmt(kpi.maxDrift)}%`} color={kpi.maxDrift > 5 ? RED : YELLOW} />
          <KpiCard label="⚡ Drifting Now" value={kpi.portfoliosDrifting} color={kpi.portfoliosDrifting > 0 ? RED : GREEN} />
          <KpiCard label="Total Executions" value={kpi.totalExecutions} sub={`${kpi.completedExecutions} ok, ${kpi.failedExecutions} fail`} />
          <KpiCard label="Total Trades" value={kpi.totalTradesExecuted} sub={`${kpi.totalTradesFailed} failed`} />
        </div>

        {/* Charts Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Executions (last 14 days)</div>
            <BarChart data={timelineData} />
          </div>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>By Rebalance Mode</div>
            <DonutChart data={modeData} />
          </div>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>By Optimization Method</div>
            <DonutChart data={methodData} />
          </div>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>By Trigger Type</div>
            <DonutChart data={triggerData} />
          </div>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>By Account Type</div>
            <DonutChart data={accountData} />
          </div>
        </div>

        {/* Data Tables */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
          <Tabs tabs={['Policies', 'Executions', 'Users', 'Returns DB']} active={activeTab} onChange={(t) => {
            setActiveTab(t);
            if (t === 'Returns DB' && !returnsDb && !returnsLoading) fetchReturnsDb();
          }} />

          {activeTab === 'Policies' && (
            <SortableTable
              columns={policyCols}
              data={data.policiesTable}
              sort={policySort}
              onSort={toggleSort(setPolicySort, policySort)}
            />
          )}

          {activeTab === 'Executions' && (
            <SortableTable
              columns={execCols}
              data={data.executionsTable}
              sort={execSort}
              onSort={toggleSort(setExecSort, execSort)}
            />
          )}

          {activeTab === 'Returns DB' && (
            <div>
              {returnsLoading && <div style={{ color: TEXT_DIM, fontFamily: MONO, padding: 20 }}>Loading returns DB stats...</div>}
              {returnsDb && (
                <>
                  {/* KPI Row */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                    <KpiCard label="📊 Instruments" value={returnsDb.coverage.total} sub={`${returnsDb.coverage.withData} with data`} color={BLUE} />
                    <KpiCard label="📈 Price Rows" value={returnsDb.priceRows.toLocaleString()} color={GREEN} />
                    <KpiCard label="📉 Return Rows" value={returnsDb.returnRows.toLocaleString()} color={GREEN} />
                    <KpiCard label="🧮 Cached Matrices" value={returnsDb.cachedMatrices} color={PURPLE} />
                    <KpiCard label="✅ Coverage" value={`${returnsDb.coverage.coveragePct}%`} color={returnsDb.coverage.coveragePct > 80 ? GREEN : YELLOW} />
                    <KpiCard label="⚠️ Stale" value={returnsDb.coverage.stale} color={returnsDb.coverage.stale > 10 ? RED : TEXT_DIM} sub={`${returnsDb.coverage.neverUpdated} never fetched`} />
                    <KpiCard label="📅 Date Range" value={returnsDb.oldestPrice?.slice(0, 10) ?? '—'} sub={`→ ${returnsDb.newestPrice?.slice(0, 10) ?? '—'}`} />
                  </div>

                  {/* Action Buttons + Update Result */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                    <button
                      onClick={() => triggerUpdateReturns(false)}
                      disabled={updateReturnsLoading}
                      style={{
                        background: `${BLUE}22`, color: BLUE, border: `1px solid ${BLUE}44`, borderRadius: 8,
                        padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        opacity: updateReturnsLoading ? 0.5 : 1,
                      }}
                    >
                      {updateReturnsLoading ? '⏳ Updating...' : '🔄 Run Daily Update'}
                    </button>
                    <button
                      onClick={() => triggerUpdateReturns(true)}
                      disabled={updateReturnsLoading}
                      style={{
                        background: `${YELLOW}22`, color: YELLOW, border: `1px solid ${YELLOW}44`, borderRadius: 8,
                        padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        opacity: updateReturnsLoading ? 0.5 : 1,
                      }}
                    >
                      🌱 Seed + Update
                    </button>
                    <button
                      onClick={fetchReturnsDb}
                      style={{
                        background: `${GREEN}22`, color: GREEN, border: `1px solid ${GREEN}44`, borderRadius: 8,
                        padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      ↻ Refresh Stats
                    </button>
                  </div>

                  {updateReturnsResult && (
                    <div style={{
                      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, marginBottom: 16,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: TEXT_DIM, textTransform: 'uppercase' }}>Update Result</span>
                        <button onClick={() => setUpdateReturnsResult(null)} style={{ background: 'none', border: 'none', color: TEXT_DIM, cursor: 'pointer', fontSize: 12 }}>✕</button>
                      </div>
                      <pre style={{ fontSize: 10, fontFamily: MONO, color: TEXT, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 250, overflow: 'auto' }}>
                        {updateReturnsResult}
                      </pre>
                    </div>
                  )}

                  {/* Charts Row: By Type + Recently Updated + Top Stale */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>By Asset Type</div>
                      <DonutChart data={Object.entries(returnsDb.byType).map(([k, v], i) => ({
                        label: k,
                        value: v,
                        color: [GREEN, BLUE, YELLOW, PURPLE, ORANGE, RED][i % 6]!,
                      }))} />
                      <div style={{ marginTop: 8, fontSize: 11, color: TEXT_DIM }}>
                        With data: {Object.entries(returnsDb.byTypeWithData).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </div>
                    </div>

                    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recently Updated</div>
                      {returnsDb.recentlyUpdated.length === 0 ? (
                        <div style={{ color: TEXT_DIM, fontSize: 12, padding: 8 }}>No recent updates</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {returnsDb.recentlyUpdated.map(i => (
                            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                              <span style={{ color: GREEN, fontFamily: MONO, fontWeight: 600 }}>{i.symbol}</span>
                              <span style={{ color: TEXT_DIM, fontFamily: MONO }}>{i.hoursAgo < 1 ? '<1h ago' : `${Math.round(i.hoursAgo)}h ago`}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top Stale Instruments</div>
                      {returnsDb.topStale.length === 0 ? (
                        <div style={{ color: GREEN, fontSize: 12, padding: 8 }}>All instruments up to date ✓</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {returnsDb.topStale.map(i => (
                            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                              <span style={{ color: RED, fontFamily: MONO, fontWeight: 600 }}>{i.symbol}</span>
                              <span style={{ color: TEXT_DIM, fontFamily: MONO, fontSize: 10 }}>
                                {i.lastUpdated ? fmtRelative(i.lastUpdated) : 'never'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Full Instrument Table */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: TEXT_DIM }}>{returnsDb.instrumentList.length} instruments tracked</span>
                      <input
                        type="text"
                        placeholder="Search instruments..."
                        value={instrumentSearch}
                        onChange={e => setInstrumentSearch(e.target.value)}
                        style={{
                          background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 12px',
                          color: TEXT, fontSize: 12, fontFamily: MONO, width: 220, outline: 'none',
                        }}
                      />
                    </div>
                    <SortableTable
                      columns={[
                        { key: 'symbol', label: 'Symbol', render: (v: string) => <span style={{ color: GREEN, fontWeight: 600 }}>{v}</span> },
                        { key: 'displayName', label: 'Name', render: (v: string) => <span style={{ color: TEXT, fontSize: 10 }}>{v || '—'}</span> },
                        { key: 'type', label: 'Type', render: (v: string) => <span style={{ color: v === 'Crypto' ? YELLOW : BLUE }}>{v}</span> },
                        { key: 'lastUpdated', label: 'Last Updated', render: (v: string) => v ? <span style={{ fontSize: 10 }}>{fmtRelative(v)}</span> : <span style={{ color: RED, fontSize: 10 }}>never</span> },
                        { key: 'stale', label: 'Status', render: (v: boolean) => v
                          ? <span style={{ color: RED, fontSize: 10, fontWeight: 700 }}>● STALE</span>
                          : <span style={{ color: GREEN, fontSize: 10, fontWeight: 700 }}>● OK</span>
                        },
                      ]}
                      data={returnsDb.instrumentList.filter(i => {
                        if (!instrumentSearch) return true;
                        const q = instrumentSearch.toLowerCase();
                        return i.symbol.toLowerCase().includes(q)
                          || (i.displayName || '').toLowerCase().includes(q)
                          || i.type.toLowerCase().includes(q);
                      })}
                      sort={instrumentSort}
                      onSort={toggleSort(setInstrumentSort, instrumentSort)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'Users' && (
            <div>
              <div style={{ marginBottom: 12, fontSize: 13, color: TEXT_DIM }}>
                {data.usersTable.length} users with rebalance policies
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: MONO }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: TEXT_DIM, fontSize: 10, textTransform: 'uppercase' }}>Username</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_DIM, fontSize: 10, textTransform: 'uppercase' }}>Policies</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_DIM, fontSize: 10, textTransform: 'uppercase' }}>Active</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_DIM, fontSize: 10, textTransform: 'uppercase' }}>Executions</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: TEXT_DIM, fontSize: 10, textTransform: 'uppercase' }}>Modes</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_DIM, fontSize: 10, textTransform: 'uppercase' }}>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.usersTable.map((u: any, i: number) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                        <td style={{ padding: '8px 12px', color: GREEN, fontWeight: 700 }}>{u.username || u.displayName}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: TEXT }}>{u.policyCount}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: u.activePolicies > 0 ? GREEN : TEXT_DIM }}>{u.activePolicies}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: TEXT }}>{u.totalExecutions}</td>
                        <td style={{ padding: '8px 12px', color: TEXT_DIM }}>{u.modes}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_DIM }}>{fmtRelative(u.lastActivity)}</td>
                      </tr>
                    ))}
                    {data.usersTable.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: TEXT_DIM }}>No users yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
