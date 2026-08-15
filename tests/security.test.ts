import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentService } from '../src/backend/ai/AgentService.js';
import { FileSystemManager } from '../src/backend/services/FileSystemManager.js';
import { AITools } from '../src/backend/ai/AITools.js';
import path from 'path';

describe('Security Features', () => {
  describe('AgentService sanitization', () => {
    const agentService = new AgentService();
    const dangerousId = '../../src/backend';

    it('should sanitize agentId and return false for exists on traversal path', async () => {
      const exists = await agentService.agentExists(dangerousId);
      expect(exists).toBe(false);
    });

    it('should sanitize agentId and not throw when calling getAgentFiles', async () => {
      const files = await agentService.getAgentFiles(dangerousId);
      expect(files).toBeDefined();
      expect(Object.keys(files)).toEqual(['Agent.md', 'Identity.md', 'Memory.md', 'User.md']);
    });
  });

  describe('FileSystemManager workspace boundary restrictions', () => {
    const fsManager = new FileSystemManager();

    it('should block reading files outside the allowed workspace', async () => {
      const outsidePath = path.resolve(process.cwd(), 'package.json');
      await expect(fsManager.readFile(outsidePath)).rejects.toThrow(/Access denied/);
    });

    it('should block path traversal prefixes (bypass attempt)', async () => {
      const allowedRoot = fsManager['allowedRoots'][0];
      const bypassPath = allowedRoot + '_secret/secret.txt';
      expect(() => fsManager['validatePath'](bypassPath)).toThrow(/Access denied/);
    });
  });

  describe('AITools requireReadBeforeWrite policy', () => {
    const aiTools = new AITools();
    const testFile = 'test_security_file.txt';

    it('should allow creating a new non-existing file without prior read_file', async () => {
      aiTools.clearReadHistory();
      const res = await aiTools.executeTool({
        name: 'write_file',
        arguments: { path: testFile, content: 'initial content' }
      }, 'session_a');

      expect(res.result).toBe('File written successfully.');
    });

    it('should block overwriting an existing file without prior read_file in session', async () => {
      const res = await aiTools.executeTool({
        name: 'write_file',
        arguments: { path: testFile, content: 'blind overwrite' }
      }, 'session_b');

      expect(res.result).toContain('SECURITY_POLICY_DENIED');
    });

    it('should allow overwriting after calling read_file in the same session', async () => {
      await aiTools.executeTool({
        name: 'read_file',
        arguments: { path: testFile }
      }, 'session_b');

      const res = await aiTools.executeTool({
        name: 'write_file',
        arguments: { path: testFile, content: 'safe overwrite after read' }
      }, 'session_b');

      expect(res.result).toBe('File written successfully.');
    });

    it('cleanup test file', async () => {
      await aiTools.executeTool({
        name: 'delete_item',
        arguments: { path: testFile }
      }, 'session_b');
    });
  });

  describe('HTTP Basic Auth and System Settings API', () => {
    let app: any;
    let configModule: any;
    let originalUser: string;
    let originalPassword: string;

    beforeAll(async () => {
      // Dynamic imports to load config and app dynamically
      const { config } = await import('../src/backend/config.js');
      const { buildApp } = await import('../src/backend/app.js');
      configModule = config;

      originalUser = config.APP_USER;
      originalPassword = config.APP_PASSWORD;

      // Set mock configs to trigger Basic Auth
      config.APP_USER = 'testuser';
      config.APP_PASSWORD = 'testpassword';

      app = await buildApp();
    });

    afterAll(async () => {
      if (app) {
        await app.close();
      }
      if (configModule) {
        configModule.APP_USER = originalUser;
        configModule.APP_PASSWORD = originalPassword;
      }
    });

    it('should return 401 Unauthorized for GET / without credentials', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/'
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 401 Unauthorized for GET / with wrong credentials', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: {
          authorization: 'Basic ' + Buffer.from('testuser:wrong').toString('base64')
        }
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 OK for GET / with correct credentials', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: {
          authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64')
        }
      });
      expect(response.statusCode).toBe(200);
    });

    it('should bypass Basic Auth and return 200 OK for GET /api/health', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health'
      });
      expect(response.statusCode).toBe(200);
    });
  });
});
