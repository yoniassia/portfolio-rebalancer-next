/**
 * NotificationPanel Component
 * List of pending rebalance proposals + recent executions
 * Each pending shows: trigger type, drift amount, proposed trades, approve/reject buttons
 */
import { useState, useEffect } from 'react';

interface Execution {
  id: number;
  trigger_type: string;
  status: string;
  portfolio_before?: any;
  portfolio_after?: any;
  target_weights?: any;
  drift_before?: number;
  trades?: any[];
  total_trades?: number;
  requested_at: string;
  approved_at?: string;
  executed_at?: string;
  completed_at?: string;
  notes?: string;
}

interface NotificationPanelProps {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const [pending, setPending] = useState<Execution[]>([]);
  const [recent, setRecent] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:3047/api/notifications', {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setPending(data.pending || []);
      setRecent(data.recent || []);
    } catch (err: any) {
      console.error('[NotificationPanel] Failed to fetch:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    setActionInProgress(id);
    try {
      const res = await fetch(`http://localhost:3047/api/notifications/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Refresh notifications
      await fetchNotifications();
    } catch (err: any) {
      console.error('[NotificationPanel] Approve failed:', err.message);
      alert(`Failed to approve: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (id: number) => {
    const reason = prompt('Reason for rejection (optional):');
    
    setActionInProgress(id);
    try {
      const res = await fetch(`http://localhost:3047/api/notifications/${id}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || '' }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Refresh notifications
      await fetchNotifications();
    } catch (err: any) {
      console.error('[NotificationPanel] Reject failed:', err.message);
      alert(`Failed to reject: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const formatTriggerType = (type: string) => {
    const map: Record<string, string> = {
      threshold: 'Drift Detected',
      scheduled: 'Scheduled',
      cashflow: 'Cash Flow',
      manual: 'Manual',
    };
    return map[type] || type;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      zIndex: 50, 
      display: 'flex', 
      alignItems: 'flex-start', 
      justifyContent: 'flex-end', 
      paddingTop: '64px', 
      paddingRight: '16px' 
    }}>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(0, 0, 0, 0.5)' 
        }}
      />

      {/* Panel */}
      <div style={{ 
        position: 'relative', 
        width: '100%', 
        maxWidth: '28rem', 
        background: 'var(--bg-card)', 
        border: '1px solid var(--border)', 
        borderRadius: '16px', 
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', 
        maxHeight: '80vh', 
        display: 'flex', 
        flexDirection: 'column' 
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '16px', 
          borderBottom: '1px solid var(--border)' 
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Notifications
          </h2>
          <button
            onClick={onClose}
            style={{ 
              padding: '4px', 
              borderRadius: '8px', 
              background: 'transparent', 
              border: 'none', 
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          ) : (
            <>
              {/* Pending Approvals */}
              {pending.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Pending Approvals
                  </h3>
                  {pending.map((exec) => (
                    <div
                      key={exec.id}
                      style={{ 
                        background: 'var(--bg-input)', 
                        border: '1px solid var(--accent)', 
                        borderRadius: '12px', 
                        padding: '16px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '12px' 
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}>
                            {formatTriggerType(exec.trigger_type)}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {formatDate(exec.requested_at)}
                          </div>
                        </div>
                        {exec.drift_before && (
                          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--warning)' }}>
                            {exec.drift_before.toFixed(1)}% drift
                          </div>
                        )}
                      </div>

                      {exec.notes && (
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                          {exec.notes}
                        </div>
                      )}

                      {exec.total_trades && (
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                          {exec.total_trades} trades proposed
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleApprove(exec.id)}
                          disabled={actionInProgress === exec.id}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            background: 'var(--accent)',
                            color: '#000000',
                            fontWeight: 600,
                            borderRadius: '8px',
                            border: 'none',
                            cursor: actionInProgress === exec.id ? 'not-allowed' : 'pointer',
                            opacity: actionInProgress === exec.id ? 0.5 : 1,
                            transition: 'opacity 0.2s',
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(exec.id)}
                          disabled={actionInProgress === exec.id}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            background: 'var(--bg-card-hover)',
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                            borderRadius: '8px',
                            border: 'none',
                            cursor: actionInProgress === exec.id ? 'not-allowed' : 'pointer',
                            opacity: actionInProgress === exec.id ? 0.5 : 1,
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Executions */}
              {recent.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Recent Activity
                  </h3>
                  {recent.map((exec) => (
                    <div
                      key={exec.id}
                      style={{ 
                        background: 'var(--bg-input)', 
                        border: '1px solid var(--border)', 
                        borderRadius: '12px', 
                        padding: '16px', 
                        opacity: 0.7 
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatTriggerType(exec.trigger_type)}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {formatDate(exec.completed_at || exec.requested_at)}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background: exec.status === 'complete' ? 'var(--profit)' : exec.status === 'rejected' ? 'var(--loss)' : 'var(--warning)',
                            color: exec.status === 'complete' || exec.status === 'rejected' ? '#FFFFFF' : '#000000',
                          }}
                        >
                          {exec.status}
                        </div>
                      </div>
                      {exec.notes && (
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                          {exec.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {pending.length === 0 && recent.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                  No notifications
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
