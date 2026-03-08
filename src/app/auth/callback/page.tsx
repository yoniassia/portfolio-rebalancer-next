'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CallbackHandler() {
  const params = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) { setStatus('error'); setErrorMsg(error); return; }
    if (!code || !state) { setStatus('error'); setErrorMsg('Missing code or state'); return; }

    fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          // Store tokens in localStorage for client-side access
          localStorage.setItem('etoro_access_token', data.accessToken);
          if (data.refreshToken) localStorage.setItem('etoro_refresh_token', data.refreshToken);
          localStorage.setItem('etoro_expires_at', data.expiresAt);
          localStorage.setItem('etoro_user', JSON.stringify(data.user));
          setStatus('success');
          setTimeout(() => { window.location.href = '/?auth=success'; }, 800);
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus('error');
          setErrorMsg(data.error || `Token exchange failed (${res.status})`);
        }
      })
      .catch((err) => { setStatus('error'); setErrorMsg(err.message); });
  }, [params]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
        {status === 'processing' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>Connecting to eToro...</h2>
            <p style={{ color: '#888', fontSize: 14 }}>Exchanging authorization code</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 20, marginBottom: 8, color: '#00C853' }}>Connected!</h2>
            <p style={{ color: '#888', fontSize: 14 }}>Redirecting to Portfolio Rebalancer...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <h2 style={{ fontSize: 20, marginBottom: 8, color: '#FF5252' }}>Connection Failed</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>{errorMsg}</p>
            <button onClick={() => { window.location.href = '/'; }}
              style={{ background: '#00C853', color: '#000', border: 'none', borderRadius: 8,
                padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0f' }} />}>
      <CallbackHandler />
    </Suspense>
  );
}
