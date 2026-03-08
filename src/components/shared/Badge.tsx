import { cn } from '../../utils/cn';
import type { ReactNode } from 'react';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: ReactNode;
  className?: string;
}

const styles = {
  success: { background: 'rgba(0,200,83,0.12)', color: 'var(--profit)' },
  warning: { background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' },
  error: { background: 'rgba(239,68,68,0.12)', color: 'var(--loss)' },
  info: { background: 'rgba(59,130,246,0.12)', color: 'var(--blue)' },
  neutral: { background: 'var(--bg-input)', color: 'var(--text-secondary)' },
};

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        className,
      )}
      style={styles[variant]}
    >
      {children}
    </span>
  );
}
