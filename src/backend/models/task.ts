/**
 * TaskModel - Model for managing background tasks
 * Author: Antigravity AI
 */

import { DatabaseClient } from '../database/DatabaseClient.js';

export interface Task {
  id: number;
  title: string;
  status: 'ready' | 'done' | 'running' | 'failed';
  result?: string;
  run_at?: string;
  is_auto?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTask {
  title: string;
  status?: 'ready' | 'done' | 'running' | 'failed';
  result?: string;
  run_at?: string;
  is_auto?: number;
}

export class TaskModel {
  constructor(private db: DatabaseClient) {}

  /**
   * Create a new task
   * @param dto Task details
   * @returns Inserted task ID
   */
  async create(dto: CreateTask): Promise<number> {
    return await this.db.insert('tasks', {
      title: dto.title,
      status: dto.status || 'ready',
      result: dto.result || null,
      run_at: dto.run_at || null,
      is_auto: dto.is_auto !== undefined ? dto.is_auto : 0
    });
  }

  /**
   * Find a task by ID
   * @param id Task ID
   */
  async findById(id: number): Promise<Task | null> {
    const rows = await this.db.select('tasks', { id });
    return rows[0] as Task || null;
  }

  /**
   * Get all tasks ordered by creation date desc
   */
  async findAll(): Promise<Task[]> {
    const result = await this.db.query('SELECT * FROM tasks ORDER BY created_at DESC');
    return result.rows as Task[];
  }

  /**
   * Find tasks that are ready to run (status = 'ready' and run_at is null or passed)
   * @param nowIso Current timestamp in ISO format
   * @param onlyAuto Filter to only return auto-execution tasks (default: false)
   */
  async findReadyToRun(nowIso: string, onlyAuto: boolean = false): Promise<Task[]> {
    let sql = 'SELECT * FROM tasks WHERE status = \'ready\' AND (run_at IS NULL OR run_at <= ?)';
    const params: unknown[] = [nowIso];
    if (onlyAuto) {
      sql += ' AND is_auto = 1';
    }
    const result = await this.db.query(sql, params);
    return result.rows as Task[];
  }

  /**
   * Atomically claim ready tasks by selecting them and immediately updating
   * their status to 'running'. This prevents race conditions where concurrent
   * dispatch sources (scheduler + manual trigger) pick up the same tasks.
   * @param nowIso Current timestamp in ISO format
   * @param onlyAuto Filter to only return auto-execution tasks
   * @returns Array of claimed tasks (already marked as 'running' in DB)
   */
  async claimReadyTasks(nowIso: string, onlyAuto: boolean = false): Promise<Task[]> {
    // Step 1: Find ready task IDs
    let selectSql = 'SELECT id FROM tasks WHERE status = \'ready\' AND (run_at IS NULL OR run_at <= ?)';
    const params: unknown[] = [nowIso];
    if (onlyAuto) {
      selectSql += ' AND is_auto = 1';
    }
    const selectResult = await this.db.query(selectSql, params);
    const rows = selectResult.rows as { id: number }[];
    if (rows.length === 0) return [];

    // Step 2: Atomically set status='running' for exactly those IDs that are still 'ready'
    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const updateNow = new Date().toISOString();
    const updateSql = `UPDATE tasks SET status = 'running', updated_at = ? WHERE id IN (${placeholders}) AND status = 'ready'`;
    await this.db.run(updateSql, [updateNow, ...ids]);

    // Step 3: Return the claimed tasks (now status='running')
    const fetchSql = `SELECT * FROM tasks WHERE id IN (${placeholders}) AND status = 'running'`;
    const fetchResult = await this.db.query(fetchSql, [...ids]);
    return fetchResult.rows as Task[];
  }

  /**
   * Update task fields
   * @param id Task ID
   * @param data Fields to update
   */
  async update(id: number, data: Partial<CreateTask>): Promise<number> {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString()
    };
    return await this.db.update('tasks', updateData, { id });
  }

  /**
   * Delete task by ID
   * @param id Task ID
   */
  async delete(id: number): Promise<number> {
    return await this.db.delete('tasks', { id });
  }
}
