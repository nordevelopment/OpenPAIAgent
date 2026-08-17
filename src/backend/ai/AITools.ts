/**
 * AITools.ts - Tools/functions for AI
 * Responsible for executing functions that AI can call
 * Author: Norayr Petrosyan
 */

import fsSync from 'fs';
import { FileSystemManager } from "../services/FileSystemManager.js";
import { WebPageContent } from "../services/WebPageContent.js";
import { imageService } from "../services/imageService.js";
import { MemoryManager } from "./MemoryManager.js";
import { browserService } from "../services/BrowserService.js";
import { OfficeDocumentService, ExcelSheetData, DocxDocumentData } from "../services/OfficeDocumentService.js";

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  result: unknown;
}

export interface ToolExecutionContext {
  toolCall: ToolCall;
  sessionId?: string;
  readHistory: Map<string, Set<string>>;
  fsManager: FileSystemManager;
  webPage: WebPageContent;
  officeService: OfficeDocumentService;
  memoryManager?: MemoryManager;
}

export interface ToolMiddleware {
  name: string;
  onBeforeExecute?: (ctx: ToolExecutionContext) => Promise<ToolResult | void>;
  onAfterExecute?: (ctx: ToolExecutionContext, result: ToolResult) => Promise<ToolResult>;
  onError?: (ctx: ToolExecutionContext, error: Error) => Promise<ToolResult | void>;
}

/**
 * Middleware: requireReadBeforeWrite Security Policy
 */
const RequireReadBeforeWriteMiddleware: ToolMiddleware = {
  name: 'RequireReadBeforeWrite',
  async onBeforeExecute(ctx) {
    if (ctx.toolCall.name === 'write_file') {
      const p = ctx.toolCall.arguments.path as string;
      const normalized = ctx.fsManager.validatePath(p);
      const fileExists = fsSync.existsSync(normalized);
      const sId = ctx.sessionId || 'default';
      const sessionReads = ctx.readHistory.get(sId);

      if (fileExists && (!sessionReads || !sessionReads.has(normalized))) {
        throw new Error(
          `SECURITY_POLICY_DENIED: File '${p}' already exists on disk. ` +
          `You MUST call 'read_file' first in this session to inspect its existing content before overwriting it.`
        );
      }
    }
  },
  async onAfterExecute(ctx, result) {
    const { name, arguments: args } = ctx.toolCall;
    const p = args.path as string;
    if (name === 'read_file' || name === 'write_file') {
      try {
        const normalized = ctx.fsManager.validatePath(p);
        const sId = ctx.sessionId || 'default';
        if (!ctx.readHistory.has(sId)) {
          ctx.readHistory.set(sId, new Set());
        }
        ctx.readHistory.get(sId)!.add(normalized);
      } catch {
        // Ignore path validation errors if execution didn't throw
      }
    }
    return result;
  }
};

/**
 * Middleware: Truncate large tool output strings to prevent context window pollution
 */
const OutputTruncationMiddleware: ToolMiddleware = {
  name: 'OutputTruncation',
  async onAfterExecute(_ctx, toolResult) {
    const maxChars = 4000;
    if (typeof toolResult.result === 'string' && toolResult.result.length > maxChars) {
      const truncated = toolResult.result.slice(0, maxChars);
      return {
        ...toolResult,
        result: `${truncated}\n\n[TRUNCATED: Output exceeded ${maxChars} characters limit. (${toolResult.result.length} characters total)]`
      };
    }
    return toolResult;
  }
};

/**
 * Middleware: Graceful fallback for dynamic web scraping errors
 */
const GracefulFallbackMiddleware: ToolMiddleware = {
  name: 'GracefulFallback',
  async onError(ctx, error) {
    if (ctx.toolCall.name === 'fetch_web_page') {
      const isDynamic = (ctx.toolCall.arguments.dynamic ?? true) === true;
      if (isDynamic) {
        try {
          const staticContent = await ctx.webPage.fetchPage({
            url: ctx.toolCall.arguments.url as string,
            dynamic: false
          });
          return {
            name: ctx.toolCall.name,
            result: `[FALLBACK_STATIC_FETCH]: Dynamic rendering failed (${error.message}). Switched to static fetch:\n\n${staticContent}`
          };
        } catch {
          // If fallback fails too, let default error handler process it
          return undefined;
        }
      }
    }
    return undefined;
  }
};

export class AITools {
  private fsManager = new FileSystemManager();
  private webPage = new WebPageContent();
  private officeService = new OfficeDocumentService();

  /**
   * Tracks files that have been read in each session to enforce
   * requireReadBeforeWrite workspace security policy.
   */
  private readHistory = new Map<string, Set<string>>();

  /**
   * Registered tool middlewares pipeline
   */
  private middlewares: ToolMiddleware[] = [
    RequireReadBeforeWriteMiddleware,
    OutputTruncationMiddleware,
    GracefulFallbackMiddleware
  ];

  constructor(private memoryManager?: MemoryManager) {}

  /**
   * Register a custom tool middleware
   */
  public registerMiddleware(middleware: ToolMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Clear session read history (useful for tests or session resets)
   */
  public clearReadHistory(sessionId?: string): void {
    if (sessionId) {
      this.readHistory.delete(sessionId);
    } else {
      this.readHistory.clear();
    }
  }

  /**
   * Execute a tool through the middleware lifecycle pipeline
   * @param toolCall - tool call from AI
   * @param sessionId - optional session identifier
   * @returns execution result
   */
  async executeTool(toolCall: ToolCall, sessionId?: string): Promise<ToolResult> {
    const ctx: ToolExecutionContext = {
      toolCall,
      sessionId,
      readHistory: this.readHistory,
      fsManager: this.fsManager,
      webPage: this.webPage,
      officeService: this.officeService,
      memoryManager: this.memoryManager
    };

    try {
      // 1. Before Execute Hooks
      for (const mw of this.middlewares) {
        if (mw.onBeforeExecute) {
          const earlyResult = await mw.onBeforeExecute(ctx);
          if (earlyResult) {
            return earlyResult;
          }
        }
      }

      // 2. Core Tool Execution
      let result = await this.executeCoreTool(ctx);

      // 3. After Execute Hooks
      for (const mw of this.middlewares) {
        if (mw.onAfterExecute) {
          result = await mw.onAfterExecute(ctx, result);
        }
      }

      return result;
    } catch (error) {
      // 4. Error Recovery Hooks
      for (const mw of this.middlewares) {
        if (mw.onError) {
          try {
            const fallbackResult = await mw.onError(ctx, error as Error);
            if (fallbackResult) {
              return fallbackResult;
            }
          } catch {
            // Ignore error handler failures, continue down pipeline
          }
        }
      }

      return { name: toolCall.name, result: `Error executing tool: ${(error as Error).message}` };
    }
  }

  /**
   * Raw execution of core tool logic
   */
  private async executeCoreTool(ctx: ToolExecutionContext): Promise<ToolResult> {
    const { name, arguments: args } = ctx.toolCall;
    const { sessionId } = ctx;
    const p = args.path as string;
    let result: any;

    switch (name) {
      case 'read_file':
        result = await this.fsManager.readFile(p, { encoding: args.encoding as BufferEncoding });
        break;
      case 'write_file':
        await this.fsManager.writeFile(p, args.content as string);
        result = "File written successfully.";
        break;
      case 'list_directory':
        result = await this.fsManager.listDirectory(p);
        break;
      case 'delete_item':
        if (args.recursive) await this.fsManager.deleteDirectory(p, true);
        else await this.fsManager.deleteFile(p);
        result = "Object deleted successfully.";
        break;
      case 'move_or_rename':
        await this.fsManager.moveFile(args.source as string, args.destination as string);
        result = "Move/rename completed successfully.";
        break;
      case 'get_file_info':
        result = await this.fsManager.getStats(p);
        break;
      case 'fetch_web_page':
        result = await this.webPage.fetchPage({
          url: args.url as string,
          dynamic: args.dynamic as boolean | undefined
        });
        break;
      case 'generate_pdf': {
        const originalPath = args.path as string;
        if (!originalPath.toLowerCase().endsWith('.pdf')) {
          throw new Error(`The output path for generate_pdf must end with '.pdf' (received: '${originalPath}'). If you want to write a raw HTML/text file, use the 'write_file' tool instead.`);
        }
        const pdfPath = this.fsManager.validatePath(originalPath);
        await browserService.generatePdf(args.html as string, pdfPath);
        result = `PDF successfully generated and saved to ${args.path}`;
        break;
      }
      case 'generate_excel': {
        const excelPath = this.fsManager.validatePath(args.path as string);
        await this.officeService.createExcel(excelPath, args.sheets as ExcelSheetData[]);
        result = `Excel spreadsheet successfully generated and saved to ${args.path}`;
        break;
      }
      case 'generate_docx': {
        const docxPath = this.fsManager.validatePath(args.path as string);
        await this.officeService.createDocx(docxPath, args.document as DocxDocumentData);
        result = `Word document successfully generated and saved to ${args.path}`;
        break;
      }
      case 'generate_image':
        result = await imageService.generateImage(
          args.prompt as string,
          args.aspectRatio as string | undefined,
          args.steps as number | undefined,
          args.provider as 'together' | 'xai' | undefined
        );
        break;
      case 'save_memory':
        if (!this.memoryManager) throw new Error("MemoryManager is not configured on this agent.");
        if (!sessionId) throw new Error("Session ID is required for memory operations.");
        result = await this.memoryManager.saveMemory(
          sessionId,
          args.key as string,
          args.value as string,
          (args.category as string) || 'personal'
        );
        break;
      case 'search_memories': {
        if (!this.memoryManager) throw new Error("MemoryManager is not configured on this agent.");
        if (!sessionId) throw new Error("Session ID is required for memory operations.");
        const searchResults = await this.memoryManager.searchMemories(
          sessionId,
          args.query as string,
          (args.limit as number) || 5
        );
        result = searchResults.map(r => ({
          key: r.memory.key,
          value: r.memory.value,
          category: r.memory.category,
          similarity: r.similarity
        }));
        break;
      }
      case 'delete_memory':
        if (!this.memoryManager) throw new Error("MemoryManager is not configured on this agent.");
        if (!sessionId) throw new Error("Session ID is required for memory operations.");
        await this.memoryManager.deleteMemoryByKey(sessionId, args.key as string);
        result = `Memory with key '${args.key}' deleted successfully.`;
        break;
      default:
        throw new Error(`Tool ${name} is not implemented.`);
    }

    return { name, result };
  }

  /**
   * Get available tools in OpenAI Function Calling format
   * @returns Array of tool descriptions
   */
  getAvailableTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Reads the contents of a text file. All paths must be within workspace/ (e.g., project/file.txt).',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the file relative to the workspace or the absolute path within the workspace' },
              encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: "Creates or overwrites a file. SECURITY POLICY: If the target file already exists on disk, you MUST call 'read_file' first in the current session to inspect its contents before overwriting it. All paths must be within workspace/ (e.g., project/file.txt).",
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the file relative to the workspace or the absolute path within the workspace' },
              content: { type: 'string', description: 'The text content of the file' }
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'Shows a list of files and folders in the specified directory. All paths must be within workspace/.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the directory relative to the workspace or the absolute path within the workspace' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_item',
          description: 'Deletes a file or directory. All paths must be within workspace/.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the object to delete (within workspace)' },
              recursive: { type: 'boolean', description: 'Whether to delete recursively (for directories)' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'move_or_rename',
          description: 'Moves or renames a file or directory. All paths must be within workspace/.',
          parameters: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'From where (within workspace)' },
              destination: { type: 'string', description: 'To where (within workspace)' }
            },
            required: ['source', 'destination']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_file_info',
          description: 'Gets information about a file: size, modification date, type. All paths must be within workspace/.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the object (within workspace)' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'fetch_web_page',
          description: 'Gets web page content or performs web searches. To search the web for information, pass a search URL like https://html.duckduckgo.com/html/?q=YOUR_QUERY. Uses headless browser (Puppeteer) by default to execute JS and render dynamic sites.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL of the page to retrieve' },
              dynamic: { type: 'boolean', description: 'Defaults to true (uses Puppeteer browser). Set to false only for raw API calls or static text.', default: true }
            },
            required: ['url']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_pdf',
          description: 'Generates a binary PDF document from HTML content and saves it in the workspace. The output file path MUST end with `.pdf`. Do NOT use this tool if you only want to save/write an HTML file; use `write_file` for that.',
          parameters: {
            type: 'object',
            properties: {
              html: { type: 'string', description: 'The complete HTML document content to render (with CSS, margins, styles, etc.). Use clean layouts and inline/embedded CSS.' },
              path: { type: 'string', description: 'The output file path relative to the workspace (e.g. workspace/report.pdf or report.pdf).' }
            },
            required: ['html', 'path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_image',
          description: 'Generates an image from a text prompt using AI. Returns the relative path. IMPORTANT: You MUST display the generated image in your response using markdown syntax: ![Caption](relative_path).',
          parameters: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'The detailed description of the image to generate.' },
              aspectRatio: {
                type: 'string',
                enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
                default: '2:3',
                description: 'The aspect ratio of the generated image.'
              },
              steps: {
                type: 'integer',
                minimum: 1,
                maximum: 50,
                default: 25,
                description: 'The number of inference steps (quality/time trade-off).'
              },
              provider: {
                type: 'string',
                enum: ['together', 'xai'],
                default: 'together',
                description: 'The image generation provider.'
              }
            },
            required: ['prompt']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'save_memory',
          description: 'Saves or updates an important fact about the user, preference, or context in long-term memory.',
          parameters: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Short snake_case unique key for the memory (e.g. user_name, favorite_pizza).' },
              value: { type: 'string', description: 'The description/value to remember.' },
              category: {
                type: 'string',
                enum: ['personal', 'preference', 'event', 'goal', 'task', 'information', 'intention', 'fact', 'context'],
                default: 'personal',
                description: 'Category classification.'
              }
            },
            required: ['key', 'value']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_memories',
          description: 'Searches stored memories semantically or using keyword matches for relevant information.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The topic, keyword, or query to search for.' },
              limit: { type: 'integer', default: 5, description: 'Max results to return.' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_memory',
          description: 'Deletes a specific fact from memory using its key.',
          parameters: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'The exact key of the memory to delete.' }
            },
            required: ['key']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_excel',
          description: 'Generates a highly-formatted Excel spreadsheet (.xlsx) in the workspace.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Output path relative to workspace (e.g. sales_report.xlsx).' },
              sheets: {
                type: 'array',
                description: 'Array of sheet definitions to add to the workbook.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Name of the sheet.' },
                    columns: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          header: { type: 'string', description: 'Header column title.' },
                          key: { type: 'string', description: 'Row object key (data identifier).' },
                          width: { type: 'integer', description: 'Width of column (optional).' }
                        },
                        required: ['header', 'key']
                      }
                    },
                    rows: {
                      type: 'array',
                      description: 'Row data objects mapping keys to values (numbers, strings, formulas like {"formula": "A2*B2"}).',
                      items: { type: 'object' }
                    }
                  },
                  required: ['name', 'columns', 'rows']
                }
              }
            },
            required: ['path', 'sheets']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_docx',
          description: 'Generates a professionally-formatted Word document (.docx) in the workspace with paragraphs, headers, and tables.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Output path relative to workspace (e.g. proposal.docx).' },
              document: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Title of the document (placed at the top).' },
                  paragraphs: {
                    type: 'array',
                    description: 'Sequential elements of paragraphs or tables.',
                    items: {
                      type: 'object',
                      properties: {
                        text: { type: 'string', description: 'Paragraph text content (leave empty for table).' },
                        heading: { type: 'string', enum: ['Heading1', 'Heading2', 'Heading3'], description: 'Header style (optional).' },
                        bold: { type: 'boolean', description: 'Bold text (optional).' },
                        italic: { type: 'boolean', description: 'Italic text (optional).' },
                        alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'Text alignment (optional).' },
                        type: { type: 'string', enum: ['table'], description: 'Specify "table" to render a grid (optional).' },
                        headers: { type: 'array', items: { type: 'string' }, description: 'Table column headers (required for table).' },
                        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Table body cells matrix (required for table).' }
                      }
                    }
                  }
                },
                required: ['title', 'paragraphs']
              }
            },
            required: ['path', 'document']
          }
        }
      }
    ];
  }
}
