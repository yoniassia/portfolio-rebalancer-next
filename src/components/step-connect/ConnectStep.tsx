'use client';
import { useState, useEffect } from 'react';
import { Button } from '../shared/Button';
import { BottomBar } from '../layout/BottomBar';
import { cn } from '../../utils/cn';

interface ConnectStepProps {
  onConnect: (apiKey: string, userKey: string, mode: 'demo' | 'sso', accountType?: 'real' | 'demo') => Promise<void>;
}

export function ConnectStep({ onConnect }: ConnectStepProps) {
  const [mode, setMode] = useState<'demo' | 'sso'>('demo');
  const [accountType, setAccountType] = useState<'real' | 'demo'>('demo');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasExistingAuth, setHasExistingAuth] = useState(false);

  useEffect(() => {
    // If returning from shared SSO (?auth=success), fetch session from server cookie
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success' && !localStorage.getItem('etoro_access_token')) {
      fetch('/api/auth/me', { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.username) {
            // Store user info so the rest of the app recognizes the session
            localStorage.setItem('etoro_user', JSON.stringify({
              userId: data.userId,
              username: data.username,
              displayName: data.displayName,
            }));
            // Mark as authenticated (accessToken lives server-side in shared cookie)
            localStorage.setItem('etoro_access_token', 'shared-session');
            localStorage.setItem('etoro_expires_at', String(Date.now() + 30 * 24 * 3600 * 1000));
            setHasExistingAuth(true);
            setMode('sso');
            // Clean URL
            window.history.replaceState({}, '', '/');
          }
        })
        .catch(() => {});
      return;
    }

    // Check if user already has tokens in localStorage
    const accessToken = localStorage.getItem('etoro_access_token');
    const expiresAt = localStorage.getItem('etoro_expires_at');
    
    if (accessToken && expiresAt && Number(expiresAt) > Date.now()) {
      setHasExistingAuth(true);
    }
  }, []);

  const handleSSOLogin = () => {
    // Redirect to SSO login
    window.location.href = '/api/auth/login';
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      if (mode === 'sso') {
        // Use existing SSO tokens from localStorage
        const accessToken = localStorage.getItem('etoro_access_token') || '';
        const userInfo = localStorage.getItem('etoro_user');
        const user = userInfo ? JSON.parse(userInfo) : {};
        
        if (!accessToken) {
          throw new Error('No SSO session found. Please login.');
        }
        
        await onConnect(accessToken, user.userId || '', 'sso', accountType);
      } else {
        // Demo mode
        await onConnect('', '', 'demo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const isDemo = mode === 'demo';

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-6 space-y-6">
        {/* Logo area */}
        <div className="text-center">
          <div 
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'var(--accent)' }}
          >
            <svg className="w-8 h-8" style={{ color: '#000' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Portfolio Rebalancer</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Connect to your eToro account</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button
            onClick={() => setMode('demo')}
            className={cn('flex-1 py-2.5 text-sm font-medium transition-colors')}
            style={{
              background: mode === 'demo' ? 'var(--accent)' : 'var(--bg-card)',
              color: mode === 'demo' ? '#000' : 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => mode !== 'demo' && (e.currentTarget.style.background = 'var(--bg-card-hover)')}
            onMouseLeave={(e) => mode !== 'demo' && (e.currentTarget.style.background = 'var(--bg-card)')}
          >
            Demo Mode
          </button>
          <button
            onClick={() => setMode('sso')}
            className={cn('flex-1 py-2.5 text-sm font-medium transition-colors')}
            style={{
              background: mode === 'sso' ? 'var(--accent)' : 'var(--bg-card)',
              color: mode === 'sso' ? '#000' : 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => mode !== 'sso' && (e.currentTarget.style.background = 'var(--bg-card-hover)')}
            onMouseLeave={(e) => mode !== 'sso' && (e.currentTarget.style.background = 'var(--bg-card)')}
          >
            eToro Account
          </button>
        </div>

        {isDemo && (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--blue)' }}>
            Demo mode uses simulated data. No login required.
          </div>
        )}

        {!isDemo && !hasExistingAuth && (
          <div className="space-y-4">
            <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--blue)' }}>
              Login with your eToro account to access your live portfolio
            </div>
            <Button
              onClick={handleSSOLogin}
              className="w-full"
              size="lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Login with eToro
            </Button>
          </div>
        )}

        {!isDemo && hasExistingAuth && (
          <div className="space-y-4">
            <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(0,200,83,0.12)', color: 'var(--profit)' }}>
              ✓ Authenticated with eToro. Select account and click Continue.
            </div>
            
            {/* Account type toggle */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Portfolio Account</label>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <button
                  onClick={() => setAccountType('demo')}
                  className={cn('flex-1 py-2.5 text-sm font-medium transition-colors')}
                  style={{
                    background: accountType === 'demo' ? 'var(--accent)' : 'var(--bg-card)',
                    color: accountType === 'demo' ? '#000' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => accountType !== 'demo' && (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={(e) => accountType !== 'demo' && (e.currentTarget.style.background = 'var(--bg-card)')}
                >
                  📊 Virtual Portfolio
                </button>
                <button
                  onClick={() => setAccountType('real')}
                  className={cn('flex-1 py-2.5 text-sm font-medium transition-colors')}
                  style={{
                    background: accountType === 'real' ? 'var(--accent)' : 'var(--bg-card)',
                    color: accountType === 'real' ? '#000' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => accountType !== 'real' && (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                  onMouseLeave={(e) => accountType !== 'real' && (e.currentTarget.style.background = 'var(--bg-card)')}
                >
                  💰 Real Portfolio
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {accountType === 'demo' 
                  ? 'Use your eToro virtual portfolio for testing' 
                  : 'Use your real eToro portfolio (live positions)'}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--loss)' }}>
            {error}
          </div>
        )}
      </div>

      <BottomBar>
        {(isDemo || hasExistingAuth) && (
          <Button
            onClick={handleConnect}
            loading={isConnecting}
            className="w-full"
            size="lg"
          >
            {isDemo ? 'Start Demo' : 'Continue'}
          </Button>
        )}
      </BottomBar>
    </div>
  );
}
