import { describe, it, expect, vi } from 'vitest';
import { AITools, ToolMiddleware } from '../src/backend/ai/AITools.js';

describe('AITools Middleware Pipeline', () => {
  it('should execute onBeforeExecute, onAfterExecute, and allow custom middlewares', async () => {
    const aiTools = new AITools();
    const calls: string[] = [];

    const customMiddleware: ToolMiddleware = {
      name: 'TestLogger',
      async onBeforeExecute(ctx) {
        calls.push(`before:${ctx.toolCall.name}`);
      },
      async onAfterExecute(ctx, result) {
        calls.push(`after:${ctx.toolCall.name}`);
        return {
          ...result,
          result: `${result.result} (modified by middleware)`
        };
      }
    };

    aiTools.registerMiddleware(customMiddleware);

    const testFile = 'middleware_test_file.txt';
    const writeRes = await aiTools.executeTool({
      name: 'write_file',
      arguments: { path: testFile, content: 'Hello middleware' }
    });

    expect(calls).toContain('before:write_file');
    expect(calls).toContain('after:write_file');
    expect(writeRes.result).toContain('modified by middleware');

    // Clean up
    await aiTools.executeTool({
      name: 'delete_item',
      arguments: { path: testFile }
    });
  });

  it('should allow short-circuiting execution in onBeforeExecute', async () => {
    const aiTools = new AITools();
    const mockMiddleware: ToolMiddleware = {
      name: 'ShortCircuit',
      async onBeforeExecute(ctx) {
        if (ctx.toolCall.name === 'list_directory') {
          return { name: ctx.toolCall.name, result: 'intercepted_by_middleware' };
        }
      }
    };

    aiTools.registerMiddleware(mockMiddleware);

    const res = await aiTools.executeTool({
      name: 'list_directory',
      arguments: { path: '.' }
    });

    expect(res.result).toBe('intercepted_by_middleware');
  });

  it('should truncate outputs exceeding 4000 characters (OutputTruncationMiddleware)', async () => {
    const aiTools = new AITools();
    const largeContent = 'A'.repeat(5000);
    const testFile = 'large_file_test.txt';

    await aiTools.executeTool({
      name: 'write_file',
      arguments: { path: testFile, content: largeContent }
    });

    const readRes = await aiTools.executeTool({
      name: 'read_file',
      arguments: { path: testFile }
    });

    const resultStr = readRes.result as string;
    expect(resultStr).toContain('[TRUNCATED: Output exceeded 4000 characters limit. (5000 characters total)]');
    expect(resultStr.startsWith('A'.repeat(4000))).toBe(true);

    // Clean up
    await aiTools.executeTool({
      name: 'delete_item',
      arguments: { path: testFile }
    });
  });

  it('should trigger onError hook and support graceful fallbacks', async () => {
    const aiTools = new AITools();
    const fallbackMiddleware: ToolMiddleware = {
      name: 'CustomFallback',
      async onError(ctx, error) {
        if (ctx.toolCall.name === 'get_file_info') {
          return { name: ctx.toolCall.name, result: `handled_error: ${error.message}` };
        }
      }
    };

    aiTools.registerMiddleware(fallbackMiddleware);

    const res = await aiTools.executeTool({
      name: 'get_file_info',
      arguments: { path: 'non_existent_file_xyz_123.txt' }
    });

    expect(res.result).toContain('handled_error:');
  });
});
