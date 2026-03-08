import { useState, useEffect } from 'react';
import { Button } from '../shared/Button';
import { BottomBar } from '../layout/BottomBar';
import type { ServiceMode, ActivationMode, AutonomyLevel } from '../../types/rebalancer';

interface ConfigureStepProps {
  serviceMode: ServiceMode;
  activationMode: ActivationMode;
  autonomyLevel: AutonomyLevel;
  driftThreshold: number;
  cryptoThreshold: number;
  scheduleFrequency: 'weekly' | 'monthly' | 'quarterly';
  scheduleDayOfWeek: number;
  scheduleDayOfMonth: number;
  scheduleHour: number;
  onUpdate: (config: Partial<ConfigureState>) => void;
  onContinue: () => void;
}

interface ConfigureState {
  serviceMode: ServiceMode;
  activationMode: ActivationMode;
  autonomyLevel: AutonomyLevel;
  driftThreshold: number;
  cryptoThreshold: number;
  scheduleFrequency: 'weekly' | 'monthly' | 'quarterly';
  scheduleDayOfWeek: number;
  scheduleDayOfMonth: number;
  scheduleHour: number;
}

const SERVICE_MODES = [
  { id: 'auto' as ServiceMode, icon: '🤖', label: 'Fully Automated', desc: 'Set and forget. Engine maintains your target weights continuously.' },
  { id: 'semi-auto' as ServiceMode, icon: '⚙️', label: 'Semi-Automated', desc: 'Pick a risk level. Engine maps to preset model and auto-rebalances.' },
  { id: 'manual' as ServiceMode, icon: '🎛️', label: 'Manual Expert', desc: 'Choose methodology and parameters. Execute on-demand or scheduled.' },
];

const ACTIVATION_MODES = [
  { id: 'trigger' as ActivationMode, icon: '📊', label: 'Threshold-Based', desc: 'Monitors drift continuously. Rebalances when assets drift beyond threshold.' },
  { id: 'scheduled' as ActivationMode, icon: '📅', label: 'Scheduled', desc: 'Fixed intervals.' },
  { id: 'manual' as ActivationMode, icon: '✋', label: 'Manual', desc: 'You trigger rebalance explicitly.' },
];

const AUTONOMY_LEVELS = [
  { id: 'full-auto' as AutonomyLevel, icon: '🟢', label: 'Full Auto', desc: 'Execute immediately when triggered. You\'ll be notified after.' },
  { id: 'approve' as AutonomyLevel, icon: '🟡', label: 'Approve First', desc: 'Engine proposes rebalance. You approve before execution.' },
  { id: 'inform' as AutonomyLevel, icon: '🔴', label: 'Inform Only', desc: 'Engine calculates and notifies. You execute manually.' },
];

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ConfigureStep({
  serviceMode,
  activationMode,
  autonomyLevel,
  driftThreshold,
  cryptoThreshold,
  scheduleFrequency,
  scheduleDayOfWeek,
  scheduleDayOfMonth,
  scheduleHour,
  onUpdate,
  onContinue,
}: ConfigureStepProps) {
  const [localServiceMode, setLocalServiceMode] = useState<ServiceMode>(serviceMode);
  const [localActivationMode, setLocalActivationMode] = useState<ActivationMode>(activationMode);
  const [localAutonomyLevel, setLocalAutonomyLevel] = useState<AutonomyLevel>(autonomyLevel);
  const [localDriftThreshold, setLocalDriftThreshold] = useState(driftThreshold);
  const [localCryptoThreshold, setLocalCryptoThreshold] = useState(cryptoThreshold);
  const [localScheduleFrequency, setLocalScheduleFrequency] = useState<'weekly' | 'monthly' | 'quarterly'>(scheduleFrequency);
  const [localScheduleDayOfWeek, setLocalScheduleDayOfWeek] = useState(scheduleDayOfWeek);
  const [localScheduleDayOfMonth, setLocalScheduleDayOfMonth] = useState(scheduleDayOfMonth);
  const [localScheduleHour, setLocalScheduleHour] = useState(scheduleHour);

  useEffect(() => {
    onUpdate({
      serviceMode: localServiceMode,
      activationMode: localActivationMode,
      autonomyLevel: localAutonomyLevel,
      driftThreshold: localDriftThreshold,
      cryptoThreshold: localCryptoThreshold,
      scheduleFrequency: localScheduleFrequency,
      scheduleDayOfWeek: localScheduleDayOfWeek,
      scheduleDayOfMonth: localScheduleDayOfMonth,
      scheduleHour: localScheduleHour,
    });
  }, [
    localServiceMode,
    localActivationMode,
    localAutonomyLevel,
    localDriftThreshold,
    localCryptoThreshold,
    localScheduleFrequency,
    localScheduleDayOfWeek,
    localScheduleDayOfMonth,
    localScheduleHour,
    onUpdate,
  ]);

  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
        {/* Service Mode */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Service Mode</h3>
          {SERVICE_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setLocalServiceMode(mode.id)}
              className="w-full text-left rounded-lg p-3 transition-colors"
              style={{
                background: localServiceMode === mode.id ? 'var(--accent)' : 'var(--bg-card)',
                border: `1px solid ${localServiceMode === mode.id ? 'var(--accent)' : 'var(--border)'}`,
                color: localServiceMode === mode.id ? '#000000' : 'var(--text-primary)',
              }}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">{mode.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{mode.label}</div>
                  <p className="text-xs mt-0.5" style={{ 
                    color: localServiceMode === mode.id ? 'rgba(0,0,0,0.7)' : 'var(--text-secondary)'
                  }}>
                    {mode.desc}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Activation Mode */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Activation Mode</h3>
          {ACTIVATION_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setLocalActivationMode(mode.id)}
              className="w-full text-left rounded-lg p-3 transition-colors"
              style={{
                background: localActivationMode === mode.id ? 'var(--accent)' : 'var(--bg-card)',
                border: `1px solid ${localActivationMode === mode.id ? 'var(--accent)' : 'var(--border)'}`,
                color: localActivationMode === mode.id ? '#000000' : 'var(--text-primary)',
              }}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">{mode.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{mode.label}</div>
                  <p className="text-xs mt-0.5" style={{ 
                    color: localActivationMode === mode.id ? 'rgba(0,0,0,0.7)' : 'var(--text-secondary)'
                  }}>
                    {mode.desc}
                  </p>
                </div>
              </div>
            </button>
          ))}

          {/* Threshold-based settings */}
          {localActivationMode === 'trigger' && (
            <div className="rounded-lg p-3 space-y-3" style={{ background: 'var(--bg-input)' }}>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Drift Threshold: {localDriftThreshold}%
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={localDriftThreshold}
                  onChange={(e) => setLocalDriftThreshold(Number(e.target.value))}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>1%</span>
                  <span>10%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Crypto Threshold: {localCryptoThreshold}%
                </label>
                <input
                  type="range"
                  min={5}
                  max={15}
                  value={localCryptoThreshold}
                  onChange={(e) => setLocalCryptoThreshold(Number(e.target.value))}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>5%</span>
                  <span>15%</span>
                </div>
              </div>
            </div>
          )}

          {/* Scheduled settings */}
          {localActivationMode === 'scheduled' && (
            <div className="rounded-lg p-3 space-y-3" style={{ background: 'var(--bg-input)' }}>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Frequency
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['weekly', 'monthly', 'quarterly'] as const).map((freq) => (
                    <button
                      key={freq}
                      onClick={() => setLocalScheduleFrequency(freq)}
                      className="py-2 px-3 text-xs font-medium rounded-lg transition-colors capitalize"
                      style={{
                        background: localScheduleFrequency === freq ? 'var(--accent)' : 'var(--bg-card)',
                        border: `1px solid ${localScheduleFrequency === freq ? 'var(--accent)' : 'var(--border)'}`,
                        color: localScheduleFrequency === freq ? '#000000' : 'var(--text-secondary)',
                      }}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>

              {localScheduleFrequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    Day of Week
                  </label>
                  <select
                    value={localScheduleDayOfWeek}
                    onChange={(e) => setLocalScheduleDayOfWeek(Number(e.target.value))}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ 
                      background: 'var(--bg-card)', 
                      border: '1px solid var(--border)', 
                      color: 'var(--text-primary)' 
                    }}
                  >
                    {DAYS_OF_WEEK.map((day, i) => (
                      <option key={i} value={i}>{day}</option>
                    ))}
                  </select>
                </div>
              )}

              {localScheduleFrequency === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    Day of Month
                  </label>
                  <select
                    value={localScheduleDayOfMonth}
                    onChange={(e) => setLocalScheduleDayOfMonth(Number(e.target.value))}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ 
                      background: 'var(--bg-card)', 
                      border: '1px solid var(--border)', 
                      color: 'var(--text-primary)' 
                    }}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Time (hour)
                </label>
                <select
                  value={localScheduleHour}
                  onChange={(e) => setLocalScheduleHour(Number(e.target.value))}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ 
                    background: 'var(--bg-card)', 
                    border: '1px solid var(--border)', 
                    color: 'var(--text-primary)' 
                  }}
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                    <option key={hour} value={hour}>
                      {hour.toString().padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Autonomy Level */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Autonomy Level</h3>
          {AUTONOMY_LEVELS.map((level) => (
            <button
              key={level.id}
              onClick={() => setLocalAutonomyLevel(level.id)}
              className="w-full text-left rounded-lg p-3 transition-colors"
              style={{
                background: localAutonomyLevel === level.id ? 'var(--accent)' : 'var(--bg-card)',
                border: `1px solid ${localAutonomyLevel === level.id ? 'var(--accent)' : 'var(--border)'}`,
                color: localAutonomyLevel === level.id ? '#000000' : 'var(--text-primary)',
              }}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">{level.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{level.label}</div>
                  <p className="text-xs mt-0.5" style={{ 
                    color: localAutonomyLevel === level.id ? 'rgba(0,0,0,0.7)' : 'var(--text-secondary)'
                  }}>
                    {level.desc}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <BottomBar>
        <Button onClick={onContinue} className="w-full" size="lg">
          Continue
        </Button>
      </BottomBar>
    </div>
  );
}
