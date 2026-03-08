import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface AppShellProps {
  children: ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className={cn('min-h-screen', className)} style={{ background: 'var(--bg-primary)' }}>
      <div className="mx-auto min-h-screen flex flex-col" style={{ maxWidth: 480, background: 'var(--bg-primary)' }}>
        {children}
      </div>
    </div>
  );
}
