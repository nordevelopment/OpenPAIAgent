/**
 * ChatManager.ts - Orchestrator of chat
 * Author: Norayr Petrosyan
 * 
 * Orchestrates the chat by coordinating the AIClient, ChatHistoryManager, AITools, and MemoryManager
 */

import { AIClient, AIMessages } from './AIClient.js';
import { ChatHistoryManager } from './ChatHistoryManager.js';
import { SessionManager } from './SessionManager.js';
import { AITools } from './AITools.js';
import { MemoryManager } from './MemoryManager.js';
import { config } from '../config.js';
import logger from '../utils/logger.js';

export interface ChatManagerDeps {
  aiClient: AIClient;
  historyManager: ChatHistoryManager;
  tools: AITools;
  memoryManager: MemoryManager;
  sessionManager: SessionManager;
}

export class ChatManager {
  private aiClient: AIClient;
  private historyManager: ChatHistoryManager;
  private tools: AITools;
  private memoryManager: MemoryManager;
  private sessionManager: SessionManager;

  constructor(deps: ChatManagerDeps) {
    this.aiClient = deps.aiClient;
    this.historyManager = deps.historyManager;
    this.tools = deps.tools;
    this.memoryManager = deps.memoryManager;
    this.sessionManager = deps.sessionManager;
  }

  /**
   * Send message to AI
   * @param userMessage - user message
   * @param sessionId - session ID
   * @returns AI response
   */


  async sendMessage(
    userMessage: string,
    sessionId: string,
    imageBase64?: string,
    onProgress?: (event: 'tool_start' | 'tool_done' | 'skills_loaded', data: any) => void | Promise<void>
  ): Promise<{ content: string; reasoning?: string }> {
    let finalContent: any = userMessage;

    if (imageBase64) {
      try {
        const processed = await this.aiClient.processImage({ base64: imageBase64, url: '' });
        finalContent = [
          { type: 'text', text: userMessage || 'What is this image? Describe it in details.' },
          { type: 'image_url', image_url: { url: processed.filePath } }
        ];
      } catch (err) {
        console.error('[ChatManager] Failed to process incoming image:', err);
      }
    }

    // Save user message in history
    await this.historyManager.addMessage(sessionId, {
      role: 'user',
      content: finalContent
    });

    // Notify client of matching skills if any
    if (onProgress && userMessage) {
      try {
        const session = await this.sessionManager.getSession(sessionId);
        const agentId = session?.agent_id || config.default_agent;
        const loadedSkills = this.aiClient.getMatchingSkillsList(agentId, userMessage);
        if (loadedSkills.length > 0) {
          await onProgress('skills_loaded', { skills: loadedSkills });
        }
      } catch (err) {
        console.error('[ChatManager] Failed to fetch or send matching skills:', err);
      }
    }

    // Get current available tools
    const availableTools = this.tools.getAvailableTools();

    let lastReasoning: string | undefined = undefined;

    // Fetch relevant memories context
    let memoriesContext = '';
    try {
      memoriesContext = await this.memoryManager.getRelevantContext(sessionId, userMessage);
    } catch (err) {
      console.error('[ChatManager] Failed to fetch relevant memories context:', err);
    }

    // Build session context for workspace project isolation
    const sessionFolderName = sessionId.startsWith('session_') || sessionId.startsWith('telegram_')
      ? sessionId
      : `session_${sessionId}`;
    const sessionWorkspaceDir = `workspace/${sessionFolderName}`;
    const sessionContext = `[CURRENT SESSION CONTEXT]\nSession ID: ${sessionId}\nAssigned Workspace Folder: ${sessionWorkspaceDir}/`;
    const combinedSystemContext = [sessionContext, memoriesContext].filter(Boolean).join('\n\n');

    // Run loop of interaction with AI (maximum iterations from config, to not go into infinite loop)
    const maxSteps = config.AI_MAX_THINKING_STEPS || 25;
    for (let i = 0; i < maxSteps; i++) {
      const fullHistory = await this.historyManager.getHistory(sessionId);

      // Limit history of last messages from config
      const history = fullHistory.slice(-config.AI_MAX_HISTORY_MESSAGES);

      // Get agent ID for this session
      const session = await this.sessionManager.getSession(sessionId);
      const agentId = session?.agent_id || config.default_agent;

      // Query AI (pass history, agent ID, description of tools, session and memories context)
      const aiResponse = await this.aiClient.sendMessage(history, agentId, availableTools, combinedSystemContext);

      if (aiResponse.reasoning) {
        lastReasoning = aiResponse.reasoning;
      }

      // If AI just answered text (without calling tools)
      if (!aiResponse.toolCalls || aiResponse.toolCalls.length === 0) {
        const finalContent = aiResponse.content ?? "I couldn't prepare an answer, Master.";

        await this.historyManager.addMessage(sessionId, {
          role: 'assistant',
          content: finalContent
        });

        // Trigger auto-rename if session has no title and it's a standard user session
        if (session && !session.title && sessionId !== 'task_session' && !sessionId.startsWith('telegram_')) {
          (async () => {
            try {
              const fullHistory = await this.historyManager.getHistory(sessionId);
              const firstMessages = fullHistory.slice(0, 3);
              const chatText = firstMessages
                .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
                .join('\n');

              const prompt = `Based on the following beginning of a chat session, generate a short, descriptive title of 2 to 4 words in the user's language. Respond ONLY with the title. Do not include quotes, markdown formatting, or any extra text.

Chat Beginning:
${chatText}

Title:`;

              const titleResponse = await this.aiClient.sendMessage([{ role: 'user', content: prompt }], agentId, undefined, undefined, true);
              const title = titleResponse.content ? titleResponse.content.trim().replace(/^["']|["']$/g, '') : '';
              if (title && title.length > 0 && !title.startsWith('Error:')) {
                await this.sessionManager.updateSessionTitle(sessionId, title);
              }
            } catch (err) {
              logger.error({ err }, '[Auto-Rename] Failed to auto-rename session');
            }
          })().catch(e => logger.error({ err: e }, '[Auto-Rename] Unhandled background error'));
        }

        return { content: finalContent, reasoning: lastReasoning };
      }

      await this.historyManager.addMessage(sessionId, {
        role: 'assistant',
        content: aiResponse.content || '',
        tool_calls: aiResponse.toolCalls
      });

      logger.debug({ toolCalls: aiResponse.toolCalls }, '[Agent] AI decided to use tools');

      for (const toolCall of aiResponse.toolCalls) {
        try {
          const toolArgs = JSON.parse(toolCall.function.arguments);

          if (onProgress) {
            await onProgress('tool_start', {
              name: toolCall.function.name,
              arguments: toolArgs
            });
          }

          const result = await this.tools.executeTool({
            name: toolCall.function.name,
            arguments: toolArgs
          }, sessionId);

          if (onProgress) {
            await onProgress('tool_done', {
              name: toolCall.function.name,
              result: result.result
            });
          }

          // Save result of tool execution in history
          await this.historyManager.addMessage(sessionId, {
            role: 'tool',
            content: JSON.stringify(result.result),
            tool_call_id: toolCall.id
          });
        } catch (error) {
          logger.error({ err: error }, `[ChatManager] Error executing tool ${toolCall.function.name}:`);

          if (onProgress) {
            await onProgress('tool_done', {
              name: toolCall.function.name,
              result: { error: (error as Error).message }
            });
          }

          // save error in history for AI to know
          await this.historyManager.addMessage(sessionId, {
            role: 'tool',
            content: JSON.stringify({ error: (error as Error).message }),
            tool_call_id: toolCall.id
          });
        }
      }

    }

    return { content: "The thinking iteration limit has been exceeded, Try again later." };
  }


  /**
   * Get chat history
   * @param sessionId - session ID
   * @returns array of messages
   */
  async getHistory(sessionId: string): Promise<AIMessages[]> {
    //logger.info({ sessionId }, '[ChatManager] Getting history for session');
    return await this.historyManager.getHistory(sessionId);
  }

  async getAllSessions(): Promise<any[]> {
    return await this.sessionManager.getAllSessions();
  }

  async getLastSession(): Promise<any | null> {
    return await this.sessionManager.getLastSession();
  }

  /**
   * Clear chat history
   * @param sessionId - session ID
   */
  async clearHistory(sessionId: string): Promise<void> {
    await this.historyManager.clearHistory(sessionId);
  }

  /**
   * Clear all memories for a session
   * @param sessionId - session ID
   */
  async clearMemory(sessionId: string): Promise<void> {
    await this.memoryManager.clearAll(sessionId);
  }


  /**
   * Create new session
   * @param sessionId - session ID
   * @param agentId - agent ID
   */
  async createSession(sessionId: string, agentId?: string): Promise<void> {
    await this.sessionManager.createSession(sessionId, agentId);
  }

  /**
   * Delete session
   * @param sessionId - session ID
   */
  async deleteSession(sessionId: string): Promise<number> {
    // Message history and memories will be deleted automatically due to ON DELETE CASCADE
    return await this.sessionManager.deleteSession(sessionId);
  }

  /**
   * Get session
   * @param sessionId - session ID
   */
  async getSession(sessionId: string): Promise<any> {
    return await this.sessionManager.getSession(sessionId);
  }

  /**
   * Update sessions with old agent ID to new agent ID
   */
  async updateSessionsAgent(oldAgentId: string, newAgentId: string): Promise<number> {
    return await this.sessionManager.updateSessionsAgent(oldAgentId, newAgentId);
  }

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<number> {
    return await this.sessionManager.updateSessionTitle(sessionId, title);
  }
}
