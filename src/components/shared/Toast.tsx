import { useToast, type Toast as ToastType } from '../../hooks/useToast';

function ToastItem({ toast }: { toast: ToastType }) {
  const { removeToast } = useToast();
  
  const icons = {
    success: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  
  const colors = {
    success: { border: 'var(--profit)', text: 'var(--profit)', bg: 'rgba(0, 200, 83, 0.1)' },
    error: { border: 'var(--loss)', text: 'var(--loss)', bg: 'rgba(239, 68, 68, 0.1)' },
    warning: { border: 'var(--warning)', text: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.1)' },
    info: { border: 'var(--blue)', text: 'var(--blue)', bg: 'rgba(59, 130, 246, 0.1)' },
  };
  
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${colors[toast.type].border}`,
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
        animation: 'slide-in 0.3s ease-out',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        maxWidth: '24rem',
      }}
    >
      <div style={{ flexShrink: 0, color: colors[toast.type].text }}>{icons[toast.type]}</div>
      <p style={{ fontSize: '14px', color: 'var(--text-primary)', flex: 1 }}>{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        style={{
          flexShrink: 0,
          color: 'var(--text-secondary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
        aria-label="Close notification"
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();
  
  if (toasts.length === 0) return null;
  
  return (
    <>
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
      <div style={{ 
        position: 'fixed', 
        top: '16px', 
        right: '16px', 
        zIndex: 50, 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px', 
        pointerEvents: 'none' 
      }}>
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={toast} />
          </div>
        ))}
      </div>
    </>
  );
}
