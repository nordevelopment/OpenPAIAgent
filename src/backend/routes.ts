/**
 * routes.ts - API routes
 * Author: Norayr Petrosyan
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { ChatManager } from './ai/ChatManager.js';
import { AgentService } from './ai/AgentService.js';
import { TelegramBot } from './services/TelegramBot.js';
import { config } from './config.js';
import { updateEnvFile } from './utils/envHelper.js';
import { DatabaseClient } from './database/DatabaseClient.js';
import { TaskModel } from './models/task.js';
import { getNextRunTime } from './utils/schedule.js';
import fs from 'fs';
import path from 'path';
import { getAIProvidersList } from './config/ai_providers.js';
import { openRouterService } from './services/OpenRouterService.js';
import { exec } from 'child_process';




/**
 * Types for chat request body
 */
interface ChatRequestBody {
  message: string;
  sessionId?: string;
  image?: string;
}

interface ClearHistoryRequestBody {
  sessionId: string;
}

/**
 * Register all API routes
 * @param app - Fastify instance
 * @param chatManager - chat manager
 * @param agentService - agent service
 * @param telegramBot - telegram bot
 * @param db - database client
 */
export async function registerRoutes(app: FastifyInstance, chatManager: ChatManager, agentService: AgentService, telegramBot: TelegramBot, db: DatabaseClient): Promise<void> {

  const taskModel = new TaskModel(db);

  // In-flight guard to prevent concurrent task execution overlaps
  let isExecutingTasks = false;

  // Helper to execute tasks sequentially in background
  async function executeTasks(tasksToRun: any[]) {
    const taskSessionId = 'task_session';

    // Ensure session exists
    const session = await chatManager.getSession(taskSessionId);
    if (!session) {
      await chatManager.createSession(taskSessionId, 'main_agent');
    }

    let telegramOwnerId: number | null = null;
    if (config.ALLOWED_TELEGRAM_USER_IDS) {
      const firstId = config.ALLOWED_TELEGRAM_USER_IDS.split(',')[0].trim();
      if (firstId) {
        telegramOwnerId = parseInt(firstId, 10);
      }
    }

    for (const task of tasksToRun) {
      try {
        //app.log.info(`[Task Runner] Starting task #${task.id}: "${task.title}"`);
        // Tasks are already claimed (status='running' in DB) by claimReadyTasks, no need to update here

        if (telegramOwnerId && telegramBot) {
          await telegramBot.sendMessage(telegramOwnerId, `⏳ **[TASK #${task.id}] STARTED**\nInstruction: "${task.title}"`).catch(err => {
            console.error('[Telegram] Notification error:', err);
          });
        }

        // Send message to agent
        const response = await chatManager.sendMessage(task.title, taskSessionId);

        // Check if task is recurring (has interval or cron schedule)
        const nextRunIso = getNextRunTime(task);

        if (nextRunIso) {
          // Recurring task: reschedule for next run and set back to 'ready'
          await taskModel.update(task.id, {
            status: 'ready',
            run_at: nextRunIso,
            result: response.content
          });
        } else {
          // One-shot task: set to done
          await taskModel.update(task.id, {
            status: 'done',
            result: response.content
          });
        }

        //app.log.info(`[Task Runner] Completed task #${task.id}`);
        if (telegramOwnerId && telegramBot) {
          const statusHeader = nextRunIso ? `🔁 **[TASK #${task.id}] RECURRED** (Next: ${nextRunIso})` : `✅ **[TASK #${task.id}] COMPLETED**`;
          await telegramBot.sendMessage(telegramOwnerId, `${statusHeader}\nInstruction: "${task.title}"\n\nResult:\n${response.content}`).catch(err => {
            console.error('[Telegram] Notification error:', err);
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Failed to execute task ${task.id}:`, error);

        const nextRunIso = getNextRunTime(task);
        if (nextRunIso) {
          await taskModel.update(task.id, {
            status: 'ready',
            run_at: nextRunIso,
            result: `Error: ${errorMsg}`
          });
        } else {
          await taskModel.update(task.id, {
            status: 'failed',
            result: errorMsg
          });
        }

        if (telegramOwnerId && telegramBot) {
          await telegramBot.sendMessage(telegramOwnerId, `❌ **[TASK #${task.id}] FAILED**\nInstruction: "${task.title}"\n\nError: ${errorMsg}`).catch(err => {
            console.error('[Telegram] Notification error:', err);
          });
        }
      }
    }
  }

  // Main chat template route
  app.get('/', async (_request, reply) => {
    return reply.view('chat.ejs');
  });

  // Render system settings page
  app.get('/settings', async (_request, reply) => {
    return reply.view('settings.ejs');
  });

  // Render task management page
  app.get('/tasks', async (_request, reply) => {
    return reply.view('tasks.ejs');
  });

  // Get all tasks
  app.get('/api/tasks', async (_request, reply) => {
    const tasks = await taskModel.findAll();
    return reply.send({ tasks });
  });

  // Create a new task
  app.post('/api/tasks', async (request: FastifyRequest<{ Body: { title: string, status?: 'ready' | 'done' | 'running' | 'failed', run_at?: string, is_auto?: boolean, repeat_interval?: number, cron_expression?: string } }>, reply: FastifyReply) => {
    const { title, status, run_at, is_auto, repeat_interval, cron_expression } = request.body;
    if (!title || typeof title !== 'string') {
      return reply.status(400).send({ success: false, message: 'Invalid title' });
    }

    try {
      const taskId = await taskModel.create({
        title,
        status,
        run_at: run_at || undefined,
        is_auto: is_auto ? 1 : 0,
        repeat_interval: repeat_interval !== undefined ? repeat_interval : undefined,
        cron_expression: cron_expression || undefined
      });
      return reply.send({ success: true, taskId, message: 'Task created successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create task');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to create task' });
    }
  });

  // Update a task
  app.put('/api/tasks/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: { title?: string, status?: 'ready' | 'done' | 'running' | 'failed', result?: string, run_at?: string, is_auto?: boolean, repeat_interval?: number | null, cron_expression?: string | null } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ success: false, message: 'Invalid task ID' });
    }

    const { title, status, result, run_at, is_auto, repeat_interval, cron_expression } = request.body;

    try {
      const existing = await taskModel.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, message: 'Task not found' });
      }

      await taskModel.update(id, {
        title,
        status,
        result,
        run_at: run_at === '' ? undefined : run_at,
        is_auto: is_auto !== undefined ? (is_auto ? 1 : 0) : undefined,
        repeat_interval,
        cron_expression
      });
      return reply.send({ success: true, message: 'Task updated successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update task');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to update task' });
    }
  });

  // Delete a task
  app.delete('/api/tasks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ success: false, message: 'Invalid task ID' });
    }

    try {
      const existing = await taskModel.findById(id);
      if (!existing) {
        return reply.status(404).send({ success: false, message: 'Task not found' });
      }

      await taskModel.delete(id);
      return reply.send({ success: true, message: 'Task deleted successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete task');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to delete task' });
    }
  });

  // Run ready tasks in background
  app.post('/api/tasks/run', async (_request, reply) => {
    if (isExecutingTasks) {
      return reply.send({ success: true, message: 'Task execution is already in progress' });
    }

    const nowIso = new Date().toISOString();
    const readyTasks = await taskModel.claimReadyTasks(nowIso);

    if (readyTasks.length === 0) {
      return reply.send({ success: true, message: 'No tasks ready to run' });
    }

    // Run them in background with in-flight guard
    isExecutingTasks = true;
    executeTasks(readyTasks).catch(err => {
      console.error('Error in background tasks runner:', err);
    }).finally(() => {
      isExecutingTasks = false;
    });

    return reply.send({ success: true, message: `Started executing ${readyTasks.length} tasks in the background.` });
  });

  // Render agent editor page
  app.get('/edit-agent/:agentId', async (request: FastifyRequest<{ Params: { agentId: string } }>, reply: FastifyReply) => {
    const { agentId } = request.params;

    const exists = await agentService.agentExists(agentId);
    if (!exists) {
      return reply.status(404).send('Agent not found');
    }

    const files = await agentService.getAgentFiles(agentId);
    return reply.view('edit_agent.ejs', { agentId, files });
  });

  // Save agent files
  app.post('/api/agents/:id/files', async (request: FastifyRequest<{ Params: { id: string }, Body: { files: Record<string, string> } }>, reply: FastifyReply) => {
    const agentId = request.params.id;
    const { files } = request.body;

    const exists = await agentService.agentExists(agentId);
    if (!exists) {
      return reply.status(404).send({ success: false, message: 'Agent not found' });
    }

    if (!files || typeof files !== 'object') {
      return reply.status(400).send({ success: false, message: 'Invalid files payload' });
    }

    try {
      await agentService.saveAgentFiles(agentId, files);
      return reply.send({ success: true, message: 'Agent files updated successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to save agent files');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to save agent files' });
    }
  });

  // Health check
  app.get('/api/health', async (_request, _reply) => {
    return { status: 'ok', message: 'System initialized', timestamp: new Date().toISOString() };
  });

  // Get list of available agents
  app.get('/api/agents', async (_request, _reply) => {
    const agents = await agentService.getAvailableAgents();
    return _reply.send({ agents });
  });

  // Create new agent profile
  app.post('/api/agents/create', async (request: FastifyRequest<{ Body: { agentId: string } }>, reply: FastifyReply) => {
    const { agentId } = request.body;
    if (!agentId || typeof agentId !== 'string') {
      return reply.status(400).send({ success: false, message: 'Invalid agentId' });
    }

    try {
      await agentService.createAgent(agentId);
      return reply.send({ success: true, message: 'Agent created successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create agent');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to create agent' });
    }
  });

  // Delete agent profile
  app.delete('/api/agents/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const agentId = request.params.id;
    if (agentId === 'main_agent' || agentId === 'base-template' || agentId === 'base_template') {
      return reply.status(400).send({ success: false, message: 'Cannot delete system agent or base template' });
    }

    try {
      await agentService.deleteAgent(agentId);
      // Update database sessions referencing this agent to fallback to main_agent
      await chatManager.updateSessionsAgent(agentId, 'main_agent');
      return reply.send({ success: true, message: 'Agent deleted successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete agent');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to delete agent' });
    }
  });

  // Chat with agent (Streaming via Server-Sent Events)
  app.post('/api/chat', async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
    const { message, image } = request.body;
    const sessionId = request.sessionId;
    //request.log.info({ message, sessionId, hasImage: !!image }, 'Chat request (stream)');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const response = await chatManager.sendMessage(message, sessionId, image, (event, data) => {
        sendEvent(event, data);
      });
      sendEvent('final', {
        message: response.content,
        reasoning: response.reasoning
      });
    } catch (error) {
      request.log.error({ err: error }, 'Chat stream error');
      sendEvent('error', {
        message: error instanceof Error ? error.message : 'Internal Server Error'
      });
    } finally {
      reply.raw.end();
    }
  });

  app.get('/api/sessions', async (_request, _reply) => {
    const sessions = await chatManager.getAllSessions();
    return _reply.send({ sessions });
  });

  app.post('/api/chat/get_history', async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
    const sessionId = request.body.sessionId || request.sessionId;
    //request.log.info({ sessionId }, 'Get history request');
    const history = await chatManager.getHistory(sessionId);
    return reply.send({ history });
  });

  // route clear chat history
  app.post('/api/chat/clear_history', async (request: FastifyRequest<{ Body: ClearHistoryRequestBody }>, reply: FastifyReply) => {
    const sessionId = request.body.sessionId || request.sessionId;
    await chatManager.clearHistory(sessionId);
    return reply.send({ success: true, message: 'Chat history cleared' });
  });

  // Clear memory route
  app.post('/api/memory/clear', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.sessionId;
    await chatManager.clearMemory(sessionId);
    return reply.send({ success: true, message: 'Memory cleared' });
  });

  // Create new session
  app.post('/api/sessions/create', async (request: FastifyRequest<{ Body: { agentId?: string } }>, reply: FastifyReply) => {
    const { agentId } = request.body || {};
    const sessionId = 'session_' + crypto.randomUUID();
    await chatManager.createSession(sessionId, agentId);

    reply.setCookie('sessionId', sessionId, {
      path: '/',
      maxAge: 86400000,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.ENV === 'production'
    });

    return reply.send({ success: true, sessionId });
  });

  // Get current session
  app.get('/api/sessions/current', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await chatManager.getSession(request.sessionId);
    return reply.send({ sessionId: request.sessionId, agentId: session?.agent_id || 'main_agent' });
  });

  // Switch to existing session
  app.post('/api/sessions/switch', async (request: FastifyRequest<{ Body: { sessionId: string } }>, reply: FastifyReply) => {
    const { sessionId } = request.body;

    const session = await chatManager.getSession(sessionId);
    if (!session) {
      return reply.status(404).send({ success: false, message: 'Session not found' });
    }

    reply.setCookie('sessionId', sessionId, {
      path: '/',
      maxAge: 86400000,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.ENV === 'production'
    });

    return reply.send({ success: true, sessionId, agentId: session.agent_id || 'main_agent' });
  });

  // Delete session
  app.delete('/api/sessions/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    await chatManager.deleteSession(id);
    return reply.send({ success: true, message: 'Session deleted' });
  });

  // Update session title
  app.put('/api/sessions/:id/title', async (request: FastifyRequest<{ Params: { id: string }, Body: { title: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { title } = request.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return reply.status(400).send({ success: false, message: 'Invalid title' });
    }

    try {
      await chatManager.updateSessionTitle(id, title.trim());
      return reply.send({ success: true, message: 'Session title updated successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update session title');
      return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : 'Failed to update session title' });
    }
  });

  // Get system settings
  app.get('/api/settings', async (_request, reply) => {
    return reply.send({
      providers: getAIProvidersList(),
      hasAiApiKey: !!config.AI_API_KEY,
      aiApiUrl: config.AI_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
      aiDefaultModel: config.AI_DEFAULT_MODEL || 'qwen/qwen3.7-flash',
      hasTelegramBotToken: !!config.TELEGRAM_BOT_TOKEN,
      allowedTelegramUserIds: config.ALLOWED_TELEGRAM_USER_IDS || '',
      appUser: config.APP_USER || 'admin',
      hasAppPassword: !!config.APP_PASSWORD,
      appPasswordMasked: config.APP_PASSWORD ? '******' : '',
      hasTogetherApiKey: !!config.images.together.key,
      hasXaiApiKey: !!config.images.xai.key,
      aiApiKeyMasked: config.AI_API_KEY ? '******' : '',
      telegramBotTokenMasked: config.TELEGRAM_BOT_TOKEN ? '******' : '',
      togetherApiKeyMasked: config.images.together.key ? '******' : '',
      xaiApiKeyMasked: config.images.xai.key ? '******' : ''
    });
  });

  // Get OpenRouter live models with pricing
  app.get('/api/ai/openrouter-models', async (_request, reply) => {
    try {
      const models = await openRouterService.getModels();
      return reply.send({ success: true, models });
    } catch (err) {
      return reply.status(500).send({ success: false, message: 'Failed to fetch OpenRouter models', models: [] });
    }
  });

  // Save system settings
  app.post('/api/settings', async (request: FastifyRequest<{ Body: { aiApiKey?: string, aiApiUrl?: string, aiDefaultModel?: string, telegramBotToken?: string, allowedTelegramUserIds?: string, appUser?: string, appPassword?: string, togetherApiKey?: string, xaiApiKey?: string } }>, reply: FastifyReply) => {
    const { aiApiKey, aiApiUrl, aiDefaultModel, telegramBotToken, allowedTelegramUserIds, appUser, appPassword, togetherApiKey, xaiApiKey } = request.body;

    const envPath = path.join(process.cwd(), '.env');
    const configJsonPath = path.join(process.cwd(), 'config.json');
    const isNewKey = (key?: string) => key !== undefined && key !== '******';

    if (fs.existsSync(envPath)) {
      // .env mode
      const envUpdates: Record<string, string> = {};

      if (isNewKey(aiApiKey)) {
        const clean = aiApiKey!.trim();
        envUpdates.AI_API_KEY = clean;
        config.AI_API_KEY = clean;
      }
      if (aiApiUrl !== undefined) {
        const clean = aiApiUrl.trim();
        envUpdates.AI_API_URL = clean;
        config.AI_API_URL = clean;
      }
      if (aiDefaultModel !== undefined) {
        const clean = aiDefaultModel.trim();
        envUpdates.AI_DEFAULT_MODEL = clean;
        config.AI_DEFAULT_MODEL = clean;
      }
      if (isNewKey(telegramBotToken)) {
        const clean = telegramBotToken!.trim();
        envUpdates.TELEGRAM_BOT_TOKEN = clean;
        config.TELEGRAM_BOT_TOKEN = clean;
        telegramBot.updateToken(clean).catch(err => {
          request.log.error({ err }, 'Failed to reload Telegram bot dynamically');
        });
      }
      if (allowedTelegramUserIds !== undefined) {
        const clean = allowedTelegramUserIds.trim();
        envUpdates.ALLOWED_TELEGRAM_USER_IDS = clean;
        config.ALLOWED_TELEGRAM_USER_IDS = clean;
      }
      if (appUser !== undefined) {
        const clean = appUser.trim();
        envUpdates.APP_USER = clean;
        config.APP_USER = clean;
      }
      if (isNewKey(appPassword)) {
        const clean = appPassword!.trim();
        envUpdates.APP_PASSWORD = clean;
        config.APP_PASSWORD = clean;
      }
      if (isNewKey(togetherApiKey)) {
        const clean = togetherApiKey!.trim();
        envUpdates.TOGETHER_API_KEY = clean;
        config.images.together.key = clean;
      }
      if (isNewKey(xaiApiKey)) {
        const clean = xaiApiKey!.trim();
        envUpdates.XAI_API_KEY = clean;
        config.images.xai.key = clean;
      }

      updateEnvFile(envPath, envUpdates);

      // Clean up config.json if it exists to prevent conflict/duplication
      if (fs.existsSync(configJsonPath)) {
        try {
          fs.unlinkSync(configJsonPath);
        } catch (e) {
          // ignore
        }
      }
    } else {
      // config.json mode
      let configData: Record<string, string> = {};
      if (fs.existsSync(configJsonPath)) {
        try {
          const raw = fs.readFileSync(configJsonPath, 'utf-8');
          if (raw.trim()) {
            configData = JSON.parse(raw);
          }
        } catch (err) {
          // ignore
        }
      }

      if (isNewKey(aiApiKey)) {
        configData.ai_api_key = aiApiKey!.trim();
        config.AI_API_KEY = configData.ai_api_key;
      }
      if (aiApiUrl !== undefined) {
        const cleanUrl = aiApiUrl.trim();
        configData.ai_api_url = cleanUrl;
        config.AI_API_URL = cleanUrl;
      }
      if (aiDefaultModel !== undefined) {
        const cleanModel = aiDefaultModel.trim();
        configData.ai_default_model = cleanModel;
        config.AI_DEFAULT_MODEL = cleanModel;
      }
      if (isNewKey(telegramBotToken)) {
        const cleanToken = telegramBotToken!.trim();
        configData.telegram_bot_token = cleanToken;
        config.TELEGRAM_BOT_TOKEN = cleanToken;
        telegramBot.updateToken(cleanToken).catch(err => {
          request.log.error({ err }, 'Failed to reload Telegram bot dynamically');
        });
      }
      if (allowedTelegramUserIds !== undefined) {
        const cleanIds = allowedTelegramUserIds.trim();
        configData.allowed_telegram_user_ids = cleanIds;
        config.ALLOWED_TELEGRAM_USER_IDS = cleanIds;
      }
      if (appUser !== undefined) {
        const clean = appUser.trim();
        configData.app_user = clean;
        config.APP_USER = clean;
      }
      if (isNewKey(appPassword)) {
        const clean = appPassword!.trim();
        configData.app_password = clean;
        config.APP_PASSWORD = clean;
      }
      if (isNewKey(togetherApiKey)) {
        configData.together_api_key = togetherApiKey!.trim();
        config.images.together.key = configData.together_api_key;
      }
      if (isNewKey(xaiApiKey)) {
        configData.xai_api_key = xaiApiKey!.trim();
        config.images.xai.key = configData.xai_api_key;
      }

      fs.writeFileSync(configJsonPath, JSON.stringify(configData, null, 2), 'utf-8');
    }

    return reply.send({ success: true, message: 'Settings saved successfully' });
  });

  // Open workspace directory in OS File Explorer / Finder
  const openWorkspaceHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const workspacePath = path.resolve(process.cwd(), 'workspace');
      if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
      }
      
      const platform = process.platform;
      
      let command = '';
      if (platform === 'win32') {
        command = `start "" "${workspacePath}"`;
      } else if (platform === 'darwin') {
        command = `open "${workspacePath}"`;
      } else {
        command = `xdg-open "${workspacePath}"`;
      }

      exec(command, (err) => {
        if (err) {
          request.log.warn({ err }, 'Primary open command failed, trying fallback');
          if (platform === 'win32') {
            exec(`explorer "${workspacePath}"`);
          }
        }
      });

      return reply.send({ success: true, path: workspacePath });
    } catch (err: any) {
      request.log.error({ err }, 'Failed to open workspace directory');
      return reply.status(500).send({ success: false, message: err?.message || 'Failed to open workspace' });
    }
  };

  app.post('/api/workspace/open', openWorkspaceHandler);
  app.get('/api/workspace/open', openWorkspaceHandler);

  // Start automatic task scheduler (scans for ready auto-tasks every 60 seconds)
  const taskInterval = setInterval(async () => {
    if (isExecutingTasks) return; // Skip if already executing
    try {
      const nowIso = new Date().toISOString();
      const readyAutoTasks = await taskModel.claimReadyTasks(nowIso, true);
      if (readyAutoTasks.length > 0) {
        //app.log.info(`[Scheduler] Found ${readyAutoTasks.length} auto-run tasks. Executing...`);
        isExecutingTasks = true;
        executeTasks(readyAutoTasks).catch(err => {
          console.error('[Scheduler] Error running automatic tasks:', err);
        }).finally(() => {
          isExecutingTasks = false;
        });
      }
    } catch (err) {
      console.error('[Scheduler] Error in automatic task runner:', err);
    }
  }, 60000);

  app.addHook('onClose', async () => {
    clearInterval(taskInterval);
  });

}
