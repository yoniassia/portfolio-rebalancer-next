interface SkeletonProps {
  variant?: 'line' | 'circle' | 'card' | 'chart';
  className?: string;
  width?: string;
  height?: string;
}

export function Skeleton({ variant = 'line', className, width, height }: SkeletonProps) {
  const baseStyle = {
    animation: 'shimmer 2s infinite',
    background: 'linear-gradient(90deg, var(--bg-input) 0%, var(--bg-card-hover) 50%, var(--bg-input) 100%)',
    backgroundSize: '200% 100%',
  };

  if (variant === 'line') {
    return (
      <>
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        <div
          className={className}
          style={{
            ...baseStyle,
            height: height ?? '1rem',
            width: width ?? '100%',
            borderRadius: '4px',
          }}
        />
      </>
    );
  }

  if (variant === 'circle') {
    return (
      <>
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        <div
          className={className}
          style={{
            ...baseStyle,
            width: width ?? '2.5rem',
            height: height ?? width ?? '2.5rem',
            borderRadius: '50%',
          }}
        />
      </>
    );
  }

  if (variant === 'card') {
    return (
      <>
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        <div className={className} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ ...baseStyle, height: '1rem', width: '33%', borderRadius: '4px' }} />
          <div style={{ ...baseStyle, height: '0.75rem', width: '100%', borderRadius: '4px' }} />
          <div style={{ ...baseStyle, height: '0.75rem', width: '67%', borderRadius: '4px' }} />
        </div>
      </>
    );
  }

  if (variant === 'chart') {
    return (
      <>
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        <div className={className} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', height: height ?? '200px' }}>
          <div style={{ ...baseStyle, height: '100%', borderRadius: '4px' }} />
        </div>
      </>
    );
  }

  return null;
}
