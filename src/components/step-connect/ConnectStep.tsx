'use client';
import { useState, useEffect } from 'react';
import { Button } from '../shared/Button';
import { BottomBar } from '../layout/BottomBar';

interface ConnectStepProps {
  onConnect: (apiKey: string, userKey: string, mode: 'demo' | 'sso', accountType?: 'real' | 'demo') => Promise<void>;
}

export function ConnectStep({ onConnect }: ConnectStepProps) {
  const [connectMode, setConnectMode] = useState<'demo' | 'live'>('live');
  const [accountType, setAccountType] = useState<'real' | 'demo'>('real');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingUser, setExistingUser] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing session
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.username) {
            localStorage.setItem('etoro_user', JSON.stringify({ userId: data.userId, username: data.username, displayName: data.displayName }));
            localStorage.setItem('etoro_access_token', 'shared-session');
            localStorage.setItem('etoro_expires_at', String(Date.now() + 30 * 24 * 3600 * 1000));
            setExistingUser(data.username);
            window.history.replaceState({}, '', '/');
          }
        })
        .catch(() => {});
      return;
    }
    const token = localStorage.getItem('etoro_access_token');
    const expiresAt = localStorage.getItem('etoro_expires_at');
    const userStr = localStorage.getItem('etoro_user');
    if (token && expiresAt && Number(expiresAt) > Date.now()) {
      try {
        const u = JSON.parse(userStr || '{}');
        setExistingUser(u.username || 'Connected');
      } catch {}
    }
  }, []);

  const handleConnect = async () => {
    setError(null);
    setIsConnecting(true);
    try {
      if (connectMode === 'demo') {
        await onConnect('', '', 'demo', 'demo');
      } else {
        await onConnect('', '', 'sso', accountType);
      }
    } catch (e: any) {
      setError(e.message || 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto">

        {/* Logo / Hero */}
        <div className="text-center pt-4 pb-2">
          <div style={{ fontSize: 48, marginBottom: 8 }}>⚖️</div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Portfolio Rebalancer</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Analyze, optimize, and rebalance your eToro portfolio
          </p>
        </div>

        {/* Existing session banner */}
        {existingUser && (
          <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--profit)' }}>Connected as {existingUser}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Tap Continue to resume your session</div>
            </div>
          </div>
        )}

        {/* Mode Toggle */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-tertiary)' }}>Mode</div>
          <div className="flex gap-2">
            {(['live', 'demo'] as const).map(m => (
              <button
                key={m}
                onClick={() => setConnectMode(m)}
                className="flex-1 rounded-xl py-3 font-semibold text-sm transition-all"
                style={{
                  background: connectMode === m ? 'var(--accent)' : 'var(--bg-card)',
                  border: `1.5px solid ${connectMode === m ? 'var(--accent)' : 'var(--border)'}`,
                  color: connectMode === m ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {m === 'live' ? '🔗 Live (eToro SSO)' : '🎮 Demo Mode'}
              </button>
            ))}
          </div>
        </div>

        {/* Live mode: real vs demo portfolio sub-toggle */}
        {connectMode === 'live' && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-tertiary)' }}>Portfolio</div>
            <div className="flex gap-2">
              {(['real', 'demo'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setAccountType(t)}
                  className="flex-1 rounded-xl py-3 font-semibold text-sm transition-all"
                  style={{
                    background: accountType === t ? (t === 'real' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)') : 'var(--bg-card)',
                    border: `1.5px solid ${accountType === t ? (t === 'real' ? '#10b981' : '#f59e0b') : 'var(--border)'}`,
                    color: accountType === t ? (t === 'real' ? '#10b981' : '#f59e0b') : 'var(--text-secondary)',
                  }}
                >
                  {t === 'real' ? '💰 Real Portfolio' : '🧪 Demo Portfolio'}
                </button>
              ))}
            </div>
            <div className="text-xs mt-2 text-center" style={{ color: 'var(--text-tertiary)' }}>
              {accountType === 'real'
                ? 'Trades will use your real money — review carefully before executing'
                : 'Paper trading account — safe to practice with'}
            </div>
          </div>
        )}

        {/* Demo mode info */}
        {connectMode === 'demo' && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="text-sm font-semibold mb-1" style={{ color: '#a5b4fc' }}>🎮 Demo Mode</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Explore the full flow with simulated portfolio data. No eToro account required. Perfect for testing.
            </div>
          </div>
        )}

        {/* Live mode info */}
        {connectMode === 'live' && (
          <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>What happens next:</div>
            <div className="space-y-1.5">
              {['Redirect to eToro SSO login', 'Authorize read + trade access', 'Return here with your portfolio loaded'].map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, minWidth: 16 }}>{i + 1}.</span>
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      <BottomBar>
        <Button
          onClick={handleConnect}
          className="w-full"
          size="lg"
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting…' :
            existingUser ? 'Continue →' :
            connectMode === 'demo' ? 'Start Demo' :
            `Sign in with eToro →`}
        </Button>
      </BottomBar>
    </div>
  );
}
