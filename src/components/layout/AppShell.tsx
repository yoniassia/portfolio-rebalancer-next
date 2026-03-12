'use client';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { UserBadge } from '../shared/UserBadge';
import { useRebalanceStore } from '../../store/rebalance-store';
import { RebalanceStep } from '../../types/rebalancer';

interface AppShellProps {
  children: ReactNode;
  className?: string;
}

const NAV_TABS = [
  { step: RebalanceStep.Portfolio, icon: '💼', label: 'Portfolio' },
  { step: RebalanceStep.Optimize,  icon: '🎯', label: 'Optimize' },
  { step: RebalanceStep.Execute,   icon: '⚡', label: 'Execute' },
  { step: RebalanceStep.Results,   icon: '📊', label: 'Results' },
];

export function AppShell({ children, className }: AppShellProps) {
  const { step, setStep, isConnected } = useRebalanceStore();
  const showNav = isConnected && step > RebalanceStep.Connect;

  return (
    <div className={cn('min-h-screen', className)} style={{ background: 'var(--bg-primary)' }}>
      <div
        className="mx-auto min-h-screen flex flex-col relative"
        style={{ maxWidth: 480, background: 'var(--bg-primary)', paddingBottom: showNav ? 64 : 0 }}
      >
        {/* Top user bar */}
        {isConnected && (
          <div className="flex justify-end px-4 pt-3 pb-0">
            <UserBadge />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {children}
        </div>

        {/* Bottom Nav */}
        {showNav && (
          <nav
            style={{
              position: 'fixed',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: 480,
              display: 'flex',
              background: 'var(--bg-card)',
              borderTop: '1px solid var(--border)',
              padding: '8px 0 env(safe-area-inset-bottom, 8px)',
              zIndex: 50,
            }}
          >
            {NAV_TABS.map(tab => {
              const active = step === tab.step;
              const past = step > tab.step;
              return (
                <button
                  key={tab.step}
                  onClick={() => setStep(tab.step)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '4px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: active ? 'var(--accent)' : past ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                    fontSize: 10,
                    fontWeight: active ? 700 : 600,
                    opacity: past || active ? 1 : 0.4,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {active && (
                    <div style={{ width: 20, height: 2, borderRadius: 1, background: 'var(--accent)', marginTop: 1 }} />
                  )}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
