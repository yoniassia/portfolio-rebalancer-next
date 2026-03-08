import { STEPS } from '../../constants/steps';
import { cn } from '../../utils/cn';
import { NotificationBell } from '../shared/NotificationBell';
import type { RebalanceStep } from '../../types/rebalancer';

interface StepHeaderProps {
  currentStep: RebalanceStep;
  onBack?: () => void;
  showBack?: boolean;
}

export function StepHeader({ currentStep, onBack, showBack }: StepHeaderProps) {
  const info = STEPS[currentStep] ?? STEPS[0]!;
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="sticky top-0 z-10" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <div className="h-1" style={{ background: 'var(--bg-input)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'var(--accent)' }}
        />
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          {showBack && onBack && (
            <button
              onClick={onBack}
              className="p-1 -ml-1"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              aria-label="Go back"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                Step {currentStep + 1}/{STEPS.length}
              </span>
            </div>
            <h1 className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{info.label}</h1>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{info.description}</p>
          </div>
          
          {/* Notification Bell */}
          <div className="ml-2">
            <NotificationBell />
          </div>
        </div>
        <div className="flex gap-1.5 mt-2">
          {STEPS.map((s, i) => (
            <div
              key={s.step}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: i <= currentStep ? 'var(--accent)' : 'var(--border)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
