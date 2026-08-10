import { describe, it, expect } from 'vitest';
import { getNextRunTime } from '../src/backend/utils/schedule.js';

describe('Task Scheduling Utility (schedule.ts)', () => {
  it('should return null for one-shot tasks without interval or cron', () => {
    const nextRun = getNextRunTime({ repeat_interval: null, cron_expression: null });
    expect(nextRun).toBeNull();
  });

  it('should calculate next run time based on repeat_interval in seconds', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const nextRun = getNextRunTime({ repeat_interval: 300 }, now);
    expect(nextRun).toBe('2026-08-10T12:05:00.000Z');
  });

  it('should calculate next run time based on standard CRON expression', () => {
    const now = new Date('2026-08-10T08:00:00.000Z'); // 8:00 AM UTC
    // Daily at 09:00 UTC
    const nextRun = getNextRunTime({ cron_expression: '0 9 * * *' }, now);
    expect(nextRun).toBe('2026-08-10T09:00:00.000Z');
  });

  it('should return null on invalid CRON expression', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const nextRun = getNextRunTime({ cron_expression: 'invalid cron expression' }, now);
    expect(nextRun).toBeNull();
  });
});
