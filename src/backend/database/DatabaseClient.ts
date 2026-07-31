/**
 * DatabaseClient - Client for working with SQLite
 * Low-level access to the database
 * Author: Norayr Petrosyan
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as sqliteVec from 'sqlite-vec';
import logger from '../utils/logger.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export interface QueryResult {
  rows: unknown[];
  changes: number;
}

export class DatabaseClient {
  private db: Database.Database;

  constructor(dbPath: string = './database.sqlite') {
    // Create/open database
    this.db = new Database(dbPath);

    // Load sqlite-vec extension for vector search
    sqliteVec.load(this.db);

    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
  }

  /**
   * Execute SQL query (SELECT)
   * @param sql - SQL query
   * @param params - query parameters
   * @returns query result
   */
  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return {
        rows,
        changes: 0,
      };
    } catch (error) {
      logger.error({ sql, params, err: error }, 'DatabaseClient: query error');
      throw error;
    }
  }

  /**
   * Insert data into table
   * @param table - table name
   * @param data - data to insert
   * @returns ID of inserted record
   */
  async insert(table: string, data: Record<string, unknown>): Promise<number> {
    try {
      const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));
      const columns = Object.keys(cleanData).join(', ');
      const placeholders = Object.keys(cleanData).map(() => '?').join(', ');
      const values = Object.values(cleanData);

      const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...values);

      return Number(result.lastInsertRowid);
    } catch (error) {
      logger.error({ table, data, err: error }, 'DatabaseClient: insert error');
      throw error;
    }
  }

  /**
   * Get data from table
   * @param table - table name
   * @param where - filter conditions
   * @returns array of records
   */
  async select(table: string, where: Record<string, unknown> = {}): Promise<unknown[]> {
    try {
      let sql = `SELECT * FROM ${table}`;
      const values: unknown[] = [];

      if (Object.keys(where).length > 0) {
        const conditions = Object.keys(where).map(key => {
          values.push(where[key]);
          return `${key} = ?`;
        }).join(' AND ');
        sql += ` WHERE ${conditions}`;
      }

      const stmt = this.db.prepare(sql);
      return stmt.all(...values);
    } catch (error) {
      logger.error({ table, where, err: error }, 'DatabaseClient: select error');
      throw error;
    }
  }

  /**
   * Update data
   * @param table - table name
   * @param data - data to update
   * @param where - filter conditions
   * @returns number of updated records
   */
  async update(table: string, data: Record<string, unknown>, where: Record<string, unknown>): Promise<number> {
    try {
      const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));
      const setClause = Object.keys(cleanData).map(key => `${key} = ?`).join(', ');
      const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ');
      const values = [...Object.values(cleanData), ...Object.values(where)];

      const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...values);

      return result.changes;
    } catch (error) {
      logger.error({ table, data, where, err: error }, 'DatabaseClient: update error');
      throw error;
    }
  }

  /**
   * Deletw data
   * @param table - table name
   * @param where - filter conditions
   * @returns number of deleted records
   */
  async delete(table: string, where: Record<string, unknown>): Promise<number> {
    try {
      const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ');
      const values = Object.values(where);

      const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
      //console.log(sql);
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...values);

      return result.changes;
    } catch (error) {
      logger.error({ table, where, err: error }, 'DatabaseClient: delete error');
      throw error;
    }
  }

  /**
   * Initialize database (create tables)
   */
  async initialize(): Promise<void> {
    let schemaPath = path.join(__dirname, 'schema.sql');

    if (!fs.existsSync(schemaPath)) {
      const fallbackPath = path.join(process.cwd(), 'src/backend/database/schema.sql');
      if (fs.existsSync(fallbackPath)) {
        schemaPath = fallbackPath;
      }
    }

    if (!fs.existsSync(schemaPath)) {
      logger.warn('DatabaseClient: schema.sql not found, skipping initialization');
      return;
    }

    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);

    // Ensure vec_memories table matches configured AI_EMBEDDING_DIM
    const expectedDim = config.AI_EMBEDDING_DIM || 4096;
    try {
      // Try to detect current vec_memories dimension by inserting a probe vector
      // If the dimension mismatches, recreation is needed
      const testBuffer = Buffer.alloc(expectedDim * 4); // Zero vector with target dimension
      try {
        const probeStmt = this.db.prepare('INSERT INTO vec_memories (rowid, embedding) VALUES (-999, ?)');
        probeStmt.run(testBuffer);
        // If probe succeeded, dimension matches — delete the probe row
        this.db.prepare('DELETE FROM vec_memories WHERE rowid = -999').run();
        logger.info({ expectedDim }, 'DatabaseClient: vec_memories dimension verified');
      } catch (dimErr: any) {
        // Dimension mismatch detected — recreate vec_memories with the correct dimension
        logger.warn({ expectedDim, err: dimErr.message }, 'DatabaseClient: vec_memories dimension mismatch, recreating table');
        this.db.exec('DROP TABLE IF EXISTS vec_memories');
        this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(embedding float[${expectedDim}])`);
        logger.info({ expectedDim }, 'DatabaseClient: vec_memories recreated with correct dimension');
      }
    } catch (err: any) {
      logger.error({ err }, 'DatabaseClient: Failed to verify vec_memories dimension');
    }

    // Migration: Add is_auto column to tasks table if it doesn't exist
    try {
      this.db.exec('ALTER TABLE tasks ADD COLUMN is_auto INTEGER DEFAULT 0');
      logger.info('DatabaseClient: Added is_auto column to tasks table');
    } catch (e) {
      // Ignore error if column already exists
    }

    // Migration: Add title column to sessions table if it doesn't exist
    try {
      this.db.exec('ALTER TABLE sessions ADD COLUMN title TEXT');
      logger.info('DatabaseClient: Added title column to sessions table');
    } catch (e) {
      // Ignore error if column already exists
    }
  }

  /**
   * Execute SQL commands (INSERT, UPDATE, DELETE), not returning data
   * @param sql - SQL command
   * @param params - parameters
   * @returns execution result
   */
  async run(sql: string, params: unknown[] = []): Promise<Database.RunResult> {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.run(...params);
    } catch (error) {
      logger.error({ sql, params, err: error }, 'DatabaseClient: run error');
      throw error;
    }
  }

  /**
   * Close connection to database
   */
  close(): void {
    this.db.close();
  }
}

