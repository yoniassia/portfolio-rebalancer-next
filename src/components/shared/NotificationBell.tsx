/**
 * NotificationBell Component
 * Shows count of pending approvals as a badge
 * Click opens notification panel
 */
import { useState, useEffect } from 'react';
import { NotificationPanel } from './NotificationPanel';

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Fetch pending count
  const fetchPendingCount = async () => {
    try {
      const res = await fetch('http://localhost:3047/api/notifications', {
        credentials: 'include',
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          // Not authenticated
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setPendingCount(data.pending?.length || 0);
    } catch (err: any) {
      console.error('[NotificationBell] Failed to fetch pending count:', err.message);
    }
  };

  // Poll every 30 seconds
  useEffect(() => {
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleTogglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  const handlePanelClose = () => {
    setIsPanelOpen(false);
    // Refresh count after panel closes
    fetchPendingCount();
  };

  return (
    <>
      <button
        onClick={handleTogglePanel}
        style={{
          position: 'relative',
          padding: '8px',
          borderRadius: '8px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
        className={className}
        aria-label="Notifications"
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        {/* Bell Icon */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke={pendingCount > 0 ? 'var(--accent)' : 'var(--text-secondary)'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        
        {pendingCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#000000',
            background: 'var(--accent)',
            borderRadius: '50%',
          }}>
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {isPanelOpen && (
        <NotificationPanel onClose={handlePanelClose} />
      )}
    </>
  );
}
