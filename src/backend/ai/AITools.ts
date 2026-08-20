/**
 * AITools.ts - Tools/functions for AI
 * Responsible for executing functions that AI can call
 * Author: Norayr Petrosyan
 */

import fsSync from 'fs';
import path from 'path';
import { FileSystemManager } from "../services/FileSystemManager.js";
import { WebPageContent } from "../services/WebPageContent.js";
import { imageService } from "../services/imageService.js";
import { MemoryManager } from "./MemoryManager.js";
import { browserService } from "../services/BrowserService.js";
import { OfficeDocumentService, ExcelSheetData, DocxDocumentData, ExcelEditOperation } from "../services/OfficeDocumentService.js";

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

  constructor(private memoryManager?: MemoryManager) { }

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
      case 'read_file': {
        const ext = path.extname(p).toLowerCase();
        const validP = this.fsManager.validatePath(p);
        if (ext === '.pdf') {
          result = await this.officeService.readPdf(validP, { maxPages: args.maxPages as number | undefined });
        } else if (ext === '.docx' || ext === '.doc') {
          result = await this.officeService.readDocx(validP);
        } else if (ext === '.xlsx' || ext === '.xls') {
          result = await this.officeService.readExcel(validP, {
            sheetName: args.sheetName as string | undefined,
            limitRows: args.limitRows as number | undefined
          });
        } else {
          result = await this.fsManager.readFile(p, { encoding: args.encoding as BufferEncoding });
        }
        break;
      }
      case 'read_excel': {
        const validP = this.fsManager.validatePath(p);
        result = await this.officeService.readExcel(validP, {
          sheetName: args.sheetName as string | undefined,
          limitRows: args.limitRows as number | undefined
        });
        break;
      }
      case 'edit_excel': {
        const validP = this.fsManager.validatePath(p);
        await this.officeService.editExcel(validP, args.operations as ExcelEditOperation[]);
        result = `Excel spreadsheet ${p} updated successfully.`;
        break;
      }
      case 'read_docx': {
        const validP = this.fsManager.validatePath(p);
        result = await this.officeService.readDocx(validP);
        break;
      }
      case 'read_pdf': {
        const validP = this.fsManager.validatePath(p);
        result = await this.officeService.readPdf(validP, { maxPages: args.maxPages as number | undefined });
        break;
      }
      case 'write_file': {
        const ext = path.extname(p).toLowerCase();
        const validP = this.fsManager.validatePath(p);

        if (ext === '.pdf') {
          const htmlContent = (args.html as string) || (args.content as string) || '';
          await browserService.generatePdf(htmlContent, validP);
          result = `PDF successfully generated and saved to ${p}`;
        } else if (ext === '.docx' || ext === '.doc') {
          const content = (args.content as string) || (args.markdown as string) || (args.document as DocxDocumentData) || '';
          await this.officeService.createDocx(validP, content);
          result = `Word document successfully generated and saved to ${p}`;
        } else if (ext === '.xlsx' || ext === '.xls') {
          const sheets = (args.sheets as ExcelSheetData[]) || [];
          await this.officeService.createExcel(validP, sheets);
          result = `Excel spreadsheet successfully generated and saved to ${p}`;
        } else {
          await this.fsManager.writeFile(p, args.content as string);
          result = "File written successfully.";
        }
        break;
      }
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
        let targetPath = args.path as string;
        if (!targetPath.toLowerCase().endsWith('.pdf')) {
          targetPath += '.pdf';
        }
        const pdfPath = this.fsManager.validatePath(targetPath);
        await browserService.generatePdf(args.html as string, pdfPath);
        result = `PDF successfully generated and saved to ${targetPath}`;
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
        const content = (args.content as string) || (args.markdown as string) || (args.document as DocxDocumentData);
        await this.officeService.createDocx(docxPath, content);
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
          description: 'Reads the contents of a file. Automatically extracts clean text/markdown and structured data from text files (.txt, .md, .csv, .json, code), PDF documents (.pdf), Word documents (.docx), and Excel spreadsheets (.xlsx, .xls). All paths must be within workspace/ (e.g., session_xxx/report.pdf).',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the file relative to the workspace or the absolute path within the workspace' },
              sheetName: { type: 'string', description: 'Optional: Specific sheet name to read for Excel files (.xlsx)' },
              limitRows: { type: 'integer', description: 'Optional: Max rows to read per sheet for Excel files (default: 100)' },
              maxPages: { type: 'integer', description: 'Optional: Max pages to read for PDF files (default: all)' },
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
          description: "Creates or overwrites any file or document in the workspace. Automatically generates Word documents (.docx) from Markdown, PDF documents (.pdf) from styled HTML, Excel spreadsheets (.xlsx) from sheets data, or standard text/code files (.txt, .md, .py, .json, .csv). SECURITY POLICY: If the target file already exists on disk, you MUST call 'read_file' first in the current session to inspect its contents before overwriting it. All paths must be within workspace/ (e.g., session_xxx/report.docx, session_xxx/invoice.pdf, session_xxx/budget.xlsx, session_xxx/app.ts).",
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Output path relative to workspace (e.g. session_xxx/report.docx, session_xxx/invoice.pdf, session_xxx/budget.xlsx, session_xxx/app.ts)' },
              content: { type: 'string', description: 'Content to write: Text/code for regular files; Markdown for Word documents (.docx); styled HTML for PDF documents (.pdf)' },
              sheets: {
                type: 'array',
                description: 'For Excel files (.xlsx): Array of sheets [{ name: "Sheet1", columns: [{ header: "Name", key: "name" }], rows: [{ name: "Alice" }] }]',
                items: { type: 'object' }
              }
            },
            required: ['path']
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
          description: 'Gets web page content by direct URL. Uses headless browser (Puppeteer) or static HTTP fetch to render pages, execute scripts and extract clean markdown content.',
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
                maximum: 30,
                default: 25,
                description: 'The number of steps (quality/time trade-off).'
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
          name: 'edit_excel',
          description: 'Updates an existing Excel spreadsheet (.xlsx) in the workspace by updating specific cells, adding rows, or adding sheets.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to Excel file in workspace (e.g. session_xxx/data.xlsx)' },
              operations: {
                type: 'array',
                description: 'List of update operations: [{ sheetName: "Sheet1", cellUpdates: [{ cell: "B2", value: 150 }], appendRows: [["New item", 200]] }]',
                items: { type: 'object' }
              }
            },
            required: ['path', 'operations']
          }
        }
      }
    ];
  }
}
