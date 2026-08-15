/**
 * AIClient.ts - Client for communication with AI API
 * Responsible for sending messages to AI and receiving responses
 * Author: Norayr Petrosyan
 */
import { config } from '../config.js';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // Обычно JSON-строка от LLM
  };
}


export interface AIMessages {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | AiContentItem[] | null;
  tool_call_id?: string; // For role: 'tool' 
  tool_calls?: AIToolCall[];    // For role: 'assistant' when calling tools
}

export interface AIResponse {
  content: string;
  toolCalls?: AIToolCall[];
  reasoning?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

interface AiContentItem {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export class AIClient {
  get apiKey(): string {
    return config.AI_API_KEY;
  }
  get apiUrl(): string {
    return config.AI_API_URL || '';
  }
  get model(): string {
    return config.AI_DEFAULT_MODEL;
  }

  constructor() {
  }

  buildSystemPrompt(agentId: string = 'main_agent'): string {
    const mainAgentPath = path.join(__dirname, `../../../agents/${agentId}`);

    if (fs.existsSync(mainAgentPath)) {
      // Strict order of file loading
      const order = [
        'Identity.md',
        'User.md',
        'Agent.md',
        'Memory.md'
      ];

      let systemPrompt = '';

      for (const fileName of order) {
        const filePath = path.join(mainAgentPath, fileName);

        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          systemPrompt += `\n${content}`;
        }
      }

      return systemPrompt.trim();

    } else {
      console.warn(`AIClient: Agent directory not found: ${agentId}`);
      return '';
    }
  }

  /**
   * Search for matching skills inside agents/<agentId>/skills/ based on query
   */
  getMatchingSkills(agentId: string, query: string): string {
    if (!query) return '';

    const agentPath = path.join(__dirname, `../../../agents/${agentId}`);
    const skillsDirPath = path.join(agentPath, 'skills');

    if (!fs.existsSync(skillsDirPath) || !fs.statSync(skillsDirPath).isDirectory()) {
      return '';
    }

    const files = fs.readdirSync(skillsDirPath);
    const matchedSkills: string[] = [];
    // Strip URLs to prevent keyword matching inside links (e.g., 'development' in amazon URL)
    const queryLower = query.replace(/https?:\/\/[^\s]+/g, '').toLowerCase();

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(skillsDirPath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split(/\r?\n/);
          if (lines.length === 0) continue;

          const firstLine = lines[0].trim();
          let keywords: string[] = [];
          let body = '';

          if (firstLine.toLowerCase().startsWith('keywords:')) {
            keywords = firstLine
              .substring(9)
              .split(',')
              .map(k => k.trim().toLowerCase())
              .filter(k => k.length > 0);
            body = lines.slice(1).join('\n').trim();
          } else {
            // Fallback: use filename without extension as keyword
            const filenameKeyword = file.substring(0, file.lastIndexOf('.')).toLowerCase();
            keywords = [filenameKeyword];
            body = content.trim();
          }

          const isMatched = keywords.some(keyword => {
            if (!keyword) return false;
            const escaped = keyword.replace(/[\/\\^$*+?.()|[\]{}]/g, '\\$&');
            // Match whole word using Unicode property escapes (not preceded or followed by any letter)
            const regex = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'gu');
            return regex.test(queryLower);
          });

          if (isMatched) {
            const skillName = file.substring(0, file.lastIndexOf('.')).toUpperCase();
            matchedSkills.push(`### SKILL: ${skillName}\n${body}`);
            logger.debug(`[AIClient] Dynamic skill loaded: ${file}`);
          }
        } catch (err) {
          logger.error({ err }, `[AIClient] Failed to read skill file ${file}`);
        }
      }
    }

    return matchedSkills.join('\n\n');
  }

  /**
   * Search for matching skills inside agents/<agentId>/skills/ and return their names
   */
  getMatchingSkillsList(agentId: string, query: string): string[] {
    if (!query) return [];

    const agentPath = path.join(__dirname, `../../../agents/${agentId}`);
    const skillsDirPath = path.join(agentPath, 'skills');

    if (!fs.existsSync(skillsDirPath) || !fs.statSync(skillsDirPath).isDirectory()) {
      return [];
    }

    const files = fs.readdirSync(skillsDirPath);
    const matchedNames: string[] = [];
    const queryLower = query.replace(/https?:\/\/[^\s]+/g, '').toLowerCase();

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(skillsDirPath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split(/\r?\n/);
          if (lines.length === 0) continue;

          const firstLine = lines[0].trim();
          let keywords: string[] = [];

          if (firstLine.toLowerCase().startsWith('keywords:')) {
            keywords = firstLine
              .substring(9)
              .split(',')
              .map(k => k.trim().toLowerCase())
              .filter(k => k.length > 0);
          } else {
            const filenameKeyword = file.substring(0, file.lastIndexOf('.')).toLowerCase();
            keywords = [filenameKeyword];
          }

          const isMatched = keywords.some(keyword => {
            if (!keyword) return false;
            const escaped = keyword.replace(/[\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'gu');
            return regex.test(queryLower);
          });

          if (isMatched) {
            const skillName = file.substring(0, file.lastIndexOf('.')).toUpperCase();
            matchedNames.push(skillName);
          }
        } catch (err) {
          // ignore
        }
      }
    }

    return matchedNames;
  }


  /**
   * Send a message to AI
   * @param messages - array of messages (dialog history)
   * @param tools - list of available tools (from AITools.getAvailableTools())
   * @param agentId - ID of the agent (folder name in agents/)
   * @param tools - list of available tools
   * @param additionalSystem - additional system prompt (e.g., memory context)
   * @returns ответ от AI
   */
  async sendMessage(
    messages: AIMessages[],
    agentId?: string,
    tools?: any[],
    additionalSystem?: string,
    skipSkills?: boolean
  ): Promise<AIResponse> {

    const systemPrompt = this.buildSystemPrompt(agentId);

    // Dynamic skills selection based on last user query
    let userQuery = '';
    let activeSkillsContent = '';

    if (!skipSkills) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          const content = messages[i].content;
          if (typeof content === 'string') {
            userQuery = content;
            break;
          } else if (Array.isArray(content)) {
            userQuery = content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join(' ');
            break;
          }
        }
      }

      if (userQuery) {
        activeSkillsContent = this.getMatchingSkills(agentId || 'main_agent', userQuery);
      }
    }

    // Convert local stored image paths to base64 strings for the API request
    const processedMessages: AIMessages[] = await Promise.all(messages.map(async (msg): Promise<AIMessages> => {
      if (Array.isArray(msg.content)) {
        const newContent: AiContentItem[] = await Promise.all(msg.content.map(async (item): Promise<AiContentItem> => {
          if (item.type === 'image_url' && item.image_url && item.image_url.url.startsWith('/storage/')) {
            try {
              const relativePath = item.image_url.url;
              const cleanPath = relativePath.startsWith('/storage') ? relativePath.substring(8) : relativePath;
              const fullPath = path.join(config.storageDir, cleanPath);
              const fileData = await fsp.readFile(fullPath);
              const base64 = fileData.toString('base64');
              const mimeType = 'image/jpeg';
              return {
                type: 'image_url' as const,
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              };
            } catch (err) {
              console.error('Error reading stored image for AI request:', err);
              return item;
            }
          }
          return item;
        }));
        return { ...msg, content: newContent };
      }
      return msg;
    }));

    // Add system prompt to the beginning of messages
    const messagesWithSystem: AIMessages[] = [];
    let finalSystemPrompt = systemPrompt;
    if (activeSkillsContent) {
      finalSystemPrompt = finalSystemPrompt ? `${finalSystemPrompt}\n\n[ACTIVE SKILLS]\n${activeSkillsContent}` : activeSkillsContent;
    }
    if (additionalSystem) {
      finalSystemPrompt = finalSystemPrompt ? `${finalSystemPrompt}\n${additionalSystem}` : additionalSystem;
    }
    if (finalSystemPrompt) {
      messagesWithSystem.push({
        role: 'system',
        content: finalSystemPrompt,
      });
    }
    messagesWithSystem.push(...processedMessages);

    // Real code to send a request to the AI API
    // For example, using axios
    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: messagesWithSystem,
      temperature: config.AI_TEMPERATURE,
      max_tokens: config.AI_MAX_TOKENS,
      top_p: config.AI_TOP_P,
    };

    // If tools are passed, add them to the request
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    // console.log('AIClient: requestBody', requestBody);

    try {
      const response = await axios.post(
        this.apiUrl,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'PAIAgent'
          },
          timeout: config.AI_TIMEOUT
        }
      );

      const data = response.data;
      // console.log('AIClient: response', data);

      const message = data.choices?.[0]?.message;
      const reasoning = message?.reasoning_content || message?.reasoning || undefined;

      // If there is no text, no function calls, no reasoning, then there is trouble
      if (!message?.content && (!message?.tool_calls || message.tool_calls.length === 0) && !reasoning) {
        return {
          content: 'Error: AI response not received',
        };
      }

      return {
        content: message?.content || '', // Empty string is ok if there are tool calls
        toolCalls: message?.tool_calls || undefined,
        reasoning: reasoning,
      };

    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('AIClient: Axios Error ', error.response?.data);
        return {
          content: 'Error: AI response ' + error.response?.data?.error.message + ' : ' + error.message,
        };
      } else {
        console.error('AIClient: Error ', error);
        return {
          content: 'Error: AI response ' + error.message,
        };
      }
    }
  }


  /**
   * Process and resize incoming images
   */
  async processImage(imageData: { base64: string, url: string }, logger?: any): Promise<{ filePath: string, base64Image: string }> {
    try {
      const matches = imageData.base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      const data = matches ? matches[2] : imageData.base64;
      const imgBuffer = Buffer.from(data, 'base64');

      const metadata = await sharp(imgBuffer).metadata();
      let pipeline = sharp(imgBuffer);
      if (metadata.width && metadata.width > 1024) {
        pipeline = pipeline.resize({ width: 1024 });
      }

      const resized = await pipeline
        .jpeg({ quality: 85 })
        .toBuffer();

      // Convert to base64
      const base64Image = `data:image/jpeg;base64,${resized.toString('base64')}`;

      //save image to file
      const filename = `${Date.now()}.jpg`;
      const imagesDir = path.join(config.storageDir, 'images');
      await fsp.mkdir(imagesDir, { recursive: true });
      const fullPath = path.join(imagesDir, filename);
      await fsp.writeFile(fullPath, resized);

      // Return relative path for frontend use
      const filePath = `/storage/images/${filename}`;

      return { filePath, base64Image };

    } catch (err: any) {
      logger?.error({ error: err.message }, '[AI SERVICE] Image processing error');
      throw new Error('Image processing failed');
    }
  }

}
