'use client';
import { useState, useEffect } from 'react';
import { useRebalanceStore } from '../../store/rebalance-store';
import { RebalanceStep } from '../../types/rebalancer';

export function UserBadge() {
  const [user, setUser] = useState<{ username: string } | null>(null);
  const { isConnected, mode, reset, setStep } = useRebalanceStore();

  useEffect(() => {
    if (!isConnected) { setUser(null); return; }
    try {
      const u = JSON.parse(localStorage.getItem('etoro_user') || 'null');
      if (u?.username) setUser(u);
    } catch {}
    // Also try server
    if (!user) {
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.username) setUser({ username: data.username }); })
        .catch(() => {});
    }
  }, [isConnected]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    localStorage.removeItem('etoro_user');
    localStorage.removeItem('etoro_access_token');
    localStorage.removeItem('etoro_refresh_token');
    localStorage.removeItem('etoro_expires_at');
    reset();
    setStep(RebalanceStep.Connect);
  };

  if (!isConnected) return null;

  return (
    <div className="flex items-center gap-2">
      {mode === 'demo' ? (
        <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
          🎮 Demo
        </span>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          ✅ {user?.username || 'Live'}
        </span>
      )}
      <button
        onClick={handleLogout}
        className="text-xs px-2 py-1 rounded-lg"
        style={{ color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        Logout
      </button>
    </div>
  );
}
