/**
 * MemoryManager - Manages vector memory using sqlite-vec
 * Responsible for storing and retrieving memories from the vector database
 * Author: Norayr Petrosyan
 */

import { DatabaseClient } from '../database/DatabaseClient.js';
import { config } from '../config.js';
import axios from 'axios';
import logger from '../utils/logger.js';

export interface Memory {
  id: number;
  session_id: string;
  key: string;
  value: string;
  category: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  memory: Memory;
  similarity: number;
}

export class MemoryManager {
  constructor(private db: DatabaseClient) { }

  /**
   * Get semantic embedding for text
   */
  private async getEmbedding(text: string): Promise<number[]> {
    if (!config.AI_API_KEY) {
      console.error('[MemoryManager] ❌ No API key');
      return [];
    }

    try {
      const model = config.AI_EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b';
      const baseUrl = config.AI_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
      const embeddingUrl = baseUrl.includes('/chat/completions')
        ? baseUrl.replace('/chat/completions', '/embeddings')
        : 'https://openrouter.ai/api/v1/embeddings';

      const response = await axios.post(
        embeddingUrl,
        { model, input: text.replace(/\n/g, ' ') },
        {
          headers: {
            'Authorization': `Bearer ${config.AI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.data?.data?.[0]?.embedding) {
        return response.data.data[0].embedding;
      }
      return [];
    } catch (error: any) {
      console.error('[MemoryManager] ❌ Embedding API error:', error.message);
      return [];
    }
  }

  private serializeEmbedding(embedding: number[]): Buffer {
    const buffer = Buffer.alloc(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buffer.writeFloatLE(embedding[i], i * 4);
    }
    return buffer;
  }

  /**
   * Save memory with embedding
   */
  async saveMemory(
    _sessionId: string,
    key: string,
    value: string,
    category: string = 'personal'
  ): Promise<Memory> {
    const content = `${key}: ${value}`;
    const embedding = await this.getEmbedding(content);

    // Save text record first
    const memoryId = await this.db.insert('memories', {
      session_id: 'global',
      key,
      value,
      category,
      content
    });

    if (embedding.length > 0) {
      const expectedDim = config.AI_EMBEDDING_DIM || 4096;
      if (embedding.length !== expectedDim) {
        logger.error(
          { memoryId, actual: embedding.length, expected: expectedDim },
          '[MemoryManager] Embedding dimension mismatch! Set AI_EMBEDDING_DIM to match your model.'
        );
      } else {
        try {
          const serialized = this.serializeEmbedding(embedding);
          const vecSql = 'INSERT INTO vec_memories (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)';
          await this.db.run(vecSql, [memoryId, serialized]);
          logger.info({ memoryId, bytes: serialized.length }, '[MemoryManager] Vector saved successfully');
        } catch (err: any) {
          logger.error({ memoryId, err }, '[MemoryManager] Vector save failed');
        }
      }
    }

    return (await this.getById(memoryId))!;
  }

  async getById(id: number): Promise<Memory | undefined> {
    const rows = await this.db.select('memories', { id });
    return rows[0] as Memory | undefined;
  }

  async searchMemories(
    sessionId: string,
    query: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.getEmbedding(query);

    if (queryEmbedding.length === 0) {
      const keywords = await this.searchMemoriesByKeyword(sessionId, query, limit);
      return keywords.map(m => ({ memory: m, similarity: 0.5 }));
    }

    const serializedQuery = this.serializeEmbedding(queryEmbedding);

    try {
      const sql = `
        SELECT 
          m.*, 
          1 - vec_distance_cosine(vm.embedding, ?) as similarity
        FROM memories m
        JOIN vec_memories vm ON m.id = vm.rowid
        WHERE m.session_id = 'global' OR m.session_id = ?
        ORDER BY similarity DESC
        LIMIT ?
      `;

      const result = await this.db.query(sql, [serializedQuery, sessionId, limit]);

      return (result.rows as any[]).map((row: any) => ({
        memory: {
          id: row.id,
          session_id: row.session_id,
          key: row.key,
          value: row.value,
          category: row.category,
          content: row.content,
          created_at: row.created_at,
          updated_at: row.updated_at
        },
        similarity: row.similarity
      }));
    } catch (error: any) {
      console.error('[MemoryManager] ❌ Search error:', error.message);
      const fallback = await this.searchMemoriesByKeyword(sessionId, query, limit);
      return fallback.map(m => ({ memory: m, similarity: 0.5 }));
    }
  }

  async searchMemoriesByKeyword(sessionId: string, query: string, limit: number = 5): Promise<Memory[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    const sql = `
      SELECT * FROM memories 
      WHERE (session_id = 'global' OR session_id = ?) 
      AND (LOWER(key) LIKE ? OR LOWER(value) LIKE ? OR LOWER(content) LIKE ?) 
      ORDER BY updated_at DESC LIMIT ?
    `;
    const result = await this.db.query(sql, [sessionId, searchTerm, searchTerm, searchTerm, limit]);
    return result.rows as Memory[];
  }

  async deleteMemoryByKey(sessionId: string, key: string): Promise<void> {
    // Find memories matching session_id and key to delete their vectors
    const sqlSelect = 'SELECT id FROM memories WHERE (session_id = \'global\' OR session_id = ?) AND key = ?';
    const result = await this.db.query(sqlSelect, [sessionId, key]);
    for (const row of result.rows as any[]) {
      await this.db.run('DELETE FROM vec_memories WHERE rowid = ?', [row.id]);
    }
    await this.db.run('DELETE FROM memories WHERE (session_id = \'global\' OR session_id = ?) AND key = ?', [sessionId, key]);
  }

  async clearAll(sessionId: string): Promise<void> {
    await this.db.run(`
      DELETE FROM vec_memories 
      WHERE rowid IN (SELECT id FROM memories WHERE session_id = 'global' OR session_id = ?)
    `, [sessionId]);
    await this.db.run('DELETE FROM memories WHERE session_id = \'global\' OR session_id = ?', [sessionId]);
  }

  async getRelevantContext(sessionId: string, query: string, limit: number = 3): Promise<string> {
    if (!query || query.trim().length < 15) return '';

    try {
      // Optimization: Skip embedding API call if there are no memories stored for this session
      const countResult = await this.db.query('SELECT COUNT(*) as count FROM memories WHERE session_id = \'global\' OR session_id = ?', [sessionId]);
      const count = (countResult.rows[0] as any)?.count || 0;
      if (count === 0) return '';
    } catch (err) {
      logger.error({ err }, '[MemoryManager] Failed to count memories');
    }

    logger.debug({ query }, '[MemoryManager] Relevant memories query');

    // Lower threshold to 0.5 to ensure all relevant session memories are retrieved
    // even for indirect queries. The LLM will ignore them if they are irrelevant to the prompt.
    const threshold = 0.5;

    const results = await this.searchMemories(sessionId, query, limit);
    const filtered = results.filter(r => r.similarity >= threshold);
    logger.debug({ filtered }, '[MemoryManager] Relevant memories - filtered');
    if (filtered.length === 0) return '';

    const contextItems = filtered.map(r => `  - ${r.memory.key}: ${r.memory.value}`);
    return `\n\n[YOUR MEMORIES]\n${contextItems.join('\n')}`;
  }
}
