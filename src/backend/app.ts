import Fastify, { FastifyInstance, LogController } from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import basicAuth from '@fastify/basic-auth';
import staticPlugin from '@fastify/static';
import cookiePlugin from '@fastify/cookie';
import multipartPlugin from '@fastify/multipart';
import pointOfView from '@fastify/view';
import ejs from 'ejs';

import { config } from './config.js';
import { DatabaseClient } from './database/DatabaseClient.js';
import { registerRoutes } from './routes.js';
import { AIClient } from './ai/AIClient.js';
import { ChatHistoryManager } from './ai/ChatHistoryManager.js';
import { SessionManager } from './ai/SessionManager.js';
import { AITools } from './ai/AITools.js';
import { MemoryManager } from './ai/MemoryManager.js';
import { ChatManager } from './ai/ChatManager.js';
import { AgentService } from './ai/AgentService.js';

import { TelegramBot } from './services/TelegramBot.js';

// Augment Fastify types to support sessionId
declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get cookie secret
 */
function getCookieSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  return secret || 'default-secret-key-for-development-only-32chars!!';
}

/**
 * Create and configure Fastify application
 * @returns {Promise<FastifyInstance>} Configured Fastify instance
 */
export async function buildApp(): Promise<FastifyInstance> {

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL || 'info',
      transport: config.ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
    logController: new LogController({
      disableRequestLogging: true,
    }),
    bodyLimit: 20971520, // 20MB
  });

  try {
    await app.register(cookiePlugin, {
      secret: getCookieSecret(),
    });

    // Multipart for file uploads
    await app.register(multipartPlugin);

    // Basic Auth Setup
    if (config.APP_PASSWORD) {
      await app.register(basicAuth, {
        validate: async (username, password, _request, _reply) => {
          const expectedUser = config.APP_USER || 'admin';
          if (username !== expectedUser || password !== config.APP_PASSWORD) {
            throw new Error('Unauthorized');
          }
        },
        authenticate: true
      });

      app.addHook('onRequest', (request, reply, next) => {
        if (request.url === '/api/health') {
          next();
          return;
        }
        app.basicAuth(request, reply, (err) => {
          if (err) {
            request.log.error({ err }, 'BasicAuth auth error');
            reply.status(401).send({ success: false, message: 'Unauthorized' });
            return;
          }
          next();
        });
      });
    }

    // Create chat components
    const db = new DatabaseClient();
    await db.initialize();

    const aiClient = new AIClient();
    const historyManager = new ChatHistoryManager(db);
    const sessionManager = new SessionManager(db);
    const memoryManager = new MemoryManager(db);
    const tools = new AITools(memoryManager);
    const agentService = new AgentService();
    const chatManager = new ChatManager({
      aiClient,
      historyManager,
      tools,
      memoryManager,
      sessionManager
    });

    // --- Telegram Bot Service initialization---
    const telegramBot = new TelegramBot(chatManager);
    telegramBot.start().catch(err => {
      app.log.error({ err }, 'Failed to start Telegram bot');
    });

    // --- SESSION AUTO-MANAGEMENT HOOK ---
    app.addHook('onRequest', async (request, reply) => {
      // Игнорируем статику и системные пути
      if (request.url.startsWith('/assets') || request.url.includes('.')) return;

      let sessionId = request.cookies.sessionId;

      // Проверяем, существует ли сессия в базе
      let session = sessionId ? await chatManager.getSession(sessionId) : null;

      if (!session) {
        // Если сессии нет, пытаемся взять последнюю или создаем новую
        const lastSession = await chatManager.getLastSession();
        if (lastSession) {
          sessionId = lastSession.id;
        } else {
          sessionId = 'session_' + crypto.randomUUID();
          await chatManager.createSession(sessionId);
        }

        // Устанавливаем куку, так как мы её изменили/создали
        reply.setCookie('sessionId', sessionId!, {
          path: '/',
          maxAge: 86400000,
          httpOnly: true,
          sameSite: 'lax',
          secure: config.ENV === 'production'
        });
      }

      // Приклеиваем к запросу для использования в роутах
      request.sessionId = sessionId!;
    });

    // Register hook for graceful shutdown
    app.addHook('onClose', async () => {
      app.log.info('Stopping Telegram bot...');
      await telegramBot.stop();

      app.log.info('Closing database connection...');
      db.close();
    });

    await app.register(staticPlugin, {
      root: path.join(__dirname, '../../storage'),
      prefix: '/storage/',
      decorateReply: false,
    });

    await app.register(staticPlugin, {
      root: path.join(__dirname, '../../frontend'),
      prefix: '/',
    });

    await app.register(pointOfView, {
      engine: {
        ejs: ejs,
      },
      root: path.join(process.cwd(), 'src/views'),
    });

    // Register routes
    await registerRoutes(app, chatManager, agentService, telegramBot, db);

    return app;

  } catch (error) {
    app.log.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to initialize application');
    throw error;
  }

}
