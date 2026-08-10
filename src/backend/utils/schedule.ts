/**
 * schedule.ts - Utility for calculating task recurrence intervals and CRON schedules
 * Author: Antigravity AI
 */

import { CronExpressionParser } from 'cron-parser';

export interface TaskSchedulable {
  repeat_interval?: number | null;
  cron_expression?: string | null;
}

/**
 * Calculates the next execution timestamp (ISO string) for a task.
 * Returns null if the task is one-shot (neither repeat_interval nor cron_expression is set).
 */
export function getNextRunTime(task: TaskSchedulable, currentDate = new Date(), tz: string = 'UTC'): string | null {
  if (task.cron_expression && task.cron_expression.trim() !== '') {
    try {
      const interval = CronExpressionParser.parse(task.cron_expression.trim(), { currentDate, tz });
      return interval.next().toDate().toISOString();
    } catch (err) {
      console.error(`[Scheduler] Invalid CRON expression "${task.cron_expression}":`, err);
      return null;
    }
  }

  if (task.repeat_interval && task.repeat_interval > 0) {
    const nextMs = currentDate.getTime() + task.repeat_interval * 1000;
    return new Date(nextMs).toISOString();
  }

  return null;
}
