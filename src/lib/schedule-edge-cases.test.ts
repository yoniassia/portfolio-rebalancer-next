import { describe, it, expect } from 'vitest';
import { computeNextScheduledTime, type ScheduleFrequency } from './policy-store';

describe('computeNextScheduledTime — edge cases', () => {
  describe('weekly', () => {
    it('same day, schedule time is later today → returns today', () => {
      const now = new Date('2026-03-09T08:00:00Z'); // Monday 08:00
      const result = computeNextScheduledTime(
        { frequency: 'weekly', dayOfWeek: 1, hour: 14, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.toISOString()).toBe('2026-03-09T14:00:00.000Z');
    });

    it('same day, schedule time already passed → returns next week', () => {
      const now = new Date('2026-03-09T16:00:00Z'); // Monday 16:00
      const result = computeNextScheduledTime(
        { frequency: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.getUTCDay()).toBe(1);
      expect(next.toISOString()).toBe('2026-03-16T09:00:00.000Z');
    });

    it('defaults to Monday when dayOfWeek is undefined', () => {
      const now = new Date('2026-03-11T10:00:00Z'); // Wednesday
      const result = computeNextScheduledTime(
        { frequency: 'weekly', hour: 9, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.getUTCDay()).toBe(1); // Monday
    });

    it('Sunday (dayOfWeek=0) works correctly', () => {
      const now = new Date('2026-03-09T10:00:00Z'); // Monday
      const result = computeNextScheduledTime(
        { frequency: 'weekly', dayOfWeek: 0, hour: 12, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.getUTCDay()).toBe(0);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('monthly', () => {
    it('day of month already passed this month → next month', () => {
      const now = new Date('2026-03-20T10:00:00Z');
      const result = computeNextScheduledTime(
        { frequency: 'monthly', dayOfMonth: 5, hour: 9, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.getUTCMonth()).toBe(3); // April
      expect(next.getUTCDate()).toBe(5);
    });

    it('day of month is today but time has passed → next month', () => {
      const now = new Date('2026-03-15T14:00:00Z');
      const result = computeNextScheduledTime(
        { frequency: 'monthly', dayOfMonth: 15, hour: 9, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.getUTCMonth()).toBe(3); // April
    });

    it('day of month is today and time is later → today', () => {
      const now = new Date('2026-03-15T06:00:00Z');
      const result = computeNextScheduledTime(
        { frequency: 'monthly', dayOfMonth: 15, hour: 9, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.toISOString()).toBe('2026-03-15T09:00:00.000Z');
    });

    it('defaults to day 1 when dayOfMonth is undefined', () => {
      const now = new Date('2026-03-15T10:00:00Z');
      const result = computeNextScheduledTime(
        { frequency: 'monthly', hour: 9, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.getUTCDate()).toBe(1);
      expect(next.getUTCMonth()).toBe(3); // April
    });
  });

  describe('quarterly', () => {
    it('returns next quarter start from mid-quarter', () => {
      const now = new Date('2026-02-15T10:00:00Z');
      const result = computeNextScheduledTime(
        { frequency: 'quarterly', dayOfMonth: 1, hour: 0, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect([0, 3, 6, 9]).toContain(next.getUTCMonth());
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    });

    it('wraps across year boundary (Q4 → next year Q1)', () => {
      const now = new Date('2026-11-15T10:00:00Z');
      const result = computeNextScheduledTime(
        { frequency: 'quarterly', dayOfMonth: 1, hour: 0, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.getUTCFullYear()).toBe(2027);
      expect(next.getUTCMonth()).toBe(0); // January
    });

    it('Q1 start when we are in Q1 before the date → returns Q1 date', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const result = computeNextScheduledTime(
        { frequency: 'quarterly', dayOfMonth: 15, hour: 9, minute: 0 },
        now,
      );
      const next = new Date(result);
      expect(next.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    });
  });

  describe('general', () => {
    it('result is always in the future relative to fromDate', () => {
      const frequencies: ScheduleFrequency[] = ['weekly', 'monthly', 'quarterly'];
      for (const frequency of frequencies) {
        const now = new Date();
        const result = computeNextScheduledTime(
          { frequency, dayOfWeek: 3, dayOfMonth: 15, hour: 12, minute: 30 },
          now,
        );
        expect(new Date(result).getTime()).toBeGreaterThan(now.getTime());
      }
    });

    it('minute=59 is handled correctly', () => {
      const now = new Date('2026-03-01T00:00:00Z');
      const result = computeNextScheduledTime(
        { frequency: 'monthly', dayOfMonth: 15, hour: 23, minute: 59 },
        now,
      );
      const next = new Date(result);
      expect(next.getUTCHours()).toBe(23);
      expect(next.getUTCMinutes()).toBe(59);
    });
  });
});
