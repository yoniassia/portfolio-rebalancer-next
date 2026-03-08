import type { ReactNode } from 'react';

interface BottomBarProps {
  children: ReactNode;
}

export function BottomBar({ children }: BottomBarProps) {
  return (
    <div 
      className="px-4 py-3 mt-auto sticky bottom-0"
      style={{ 
        borderTop: '1px solid var(--border)', 
        background: 'var(--bg-card)',
        paddingBottom: 'env(safe-area-inset-bottom, 12px)'
      }}
    >
      {children}
    </div>
  );
}
