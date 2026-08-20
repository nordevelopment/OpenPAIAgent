import ExcelJS from 'exceljs';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  AlignmentType, 
  Table, 
  TableRow, 
  TableCell,
  WidthType
} from 'docx';
import fs from 'fs/promises';
import mammoth from 'mammoth';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

// Excel Interfaces
export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExcelSheetData {
  name: string;
  columns?: ExcelColumn[];
  rows: Record<string, any>[] | any[][];
}

export interface ExcelCellUpdate {
  cell: string; // e.g. 'A1', 'B5'
  value: any;
}

export interface ExcelEditOperation {
  sheetName?: string;
  cellUpdates?: ExcelCellUpdate[];
  appendRows?: (Record<string, any> | any[])[];
}

// DOCX Interfaces
export interface DocxParagraph {
  text: string;
  heading?: 'Heading1' | 'Heading2' | 'Heading3';
  bold?: boolean;
  italic?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

export interface DocxTable {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export interface DocxDocumentData {
  title?: string;
  paragraphs: (DocxParagraph | DocxTable)[];
}

export class OfficeDocumentService {
  /**
   * Create Excel XLSX File
   */
  async createExcel(outputPath: string, sheets: ExcelSheetData[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    for (const sheetData of sheets) {
      const sheet = workbook.addWorksheet(sheetData.name || 'Sheet');
      
      if (sheetData.columns && sheetData.columns.length > 0) {
        sheet.columns = sheetData.columns.map(col => ({
          header: col.header,
          key: col.key,
          width: col.width || 15
        }));
      }
      
      if (sheetData.rows && sheetData.rows.length > 0) {
        sheet.addRows(sheetData.rows);
      }
      
      // Header row styling if exists
      const headerRow = sheet.getRow(1);
      if (headerRow.cellCount > 0) {
        headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F4E78' } // Dark blue
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 24;
      }
    }
    
    await workbook.xlsx.writeFile(outputPath);
  }

  /**
   * Parse markdown string inline styles into TextRun elements
   */
  private parseInlineTextRuns(text: string): TextRun[] {
    const runs: TextRun[] = [];
    const regex = /(\*\*.*?\*\*|\*.*?\*|__.*?__|_[^_]+_|`.*?`|[^*_`]+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const part = match[0];
      if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
        runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
      } else if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
        runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
      } else if (part.startsWith('`') && part.endsWith('`')) {
        runs.push(new TextRun({ text: part.slice(1, -1), font: 'Consolas' }));
      } else if (part) {
        runs.push(new TextRun({ text: part }));
      }
    }
    return runs.length > 0 ? runs : [new TextRun({ text })];
  }

  /**
   * Parse Markdown string into DOCX children elements
   */
  private parseMarkdownToDocx(markdown: string): any[] {
    const lines = markdown.split(/\r?\n/);
    const children: any[] = [];
    let tableBuffer: string[] = [];

    const flushTable = () => {
      if (tableBuffer.length === 0) return;
      const rowsData: string[][] = [];
      for (const tLine of tableBuffer) {
        if (tLine.includes('---')) continue;
        const cells = tLine.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (cells.length > 0) rowsData.push(cells);
      }
      tableBuffer = [];
      if (rowsData.length === 0) return;

      const [headerRow, ...bodyRows] = rowsData;
      const tableRows: TableRow[] = [];

      if (headerRow) {
        const headerCells = headerRow.map(h => 
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: h, bold: true, color: 'FFFFFF' })],
              alignment: AlignmentType.CENTER
            })],
            shading: { fill: '1F4E78' }
          })
        );
        tableRows.push(new TableRow({ children: headerCells }));
      }

      for (const row of bodyRows) {
        const cells = row.map(cellText => 
          new TableCell({
            children: [new Paragraph({ children: this.parseInlineTextRuns(cellText) })],
            margins: { top: 100, bottom: 100, left: 150, right: 150 }
          })
        );
        tableRows.push(new TableRow({ children: cells }));
      }

      children.push(
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE }
        })
      );
      children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Table line
      if (line.startsWith('|') && line.endsWith('|')) {
        tableBuffer.push(line);
        continue;
      } else {
        flushTable();
      }

      if (!line) {
        continue;
      }

      // Title & Headings
      if (line.startsWith('# ')) {
        children.push(
          new Paragraph({
            children: this.parseInlineTextRuns(line.substring(2)),
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 }
          })
        );
      } else if (line.startsWith('## ')) {
        children.push(
          new Paragraph({
            children: this.parseInlineTextRuns(line.substring(3)),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 150 }
          })
        );
      } else if (line.startsWith('### ')) {
        children.push(
          new Paragraph({
            children: this.parseInlineTextRuns(line.substring(4)),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 150, after: 100 }
          })
        );
      } else if (line.startsWith('#### ')) {
        children.push(
          new Paragraph({
            children: this.parseInlineTextRuns(line.substring(5)),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 100, after: 80 }
          })
        );
      } else if (line.startsWith('* ') || line.startsWith('- ')) {
        // Bullet list
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: '•  ', bold: true }),
              ...this.parseInlineTextRuns(line.substring(2))
            ],
            spacing: { after: 100 },
            indent: { left: 300 }
          })
        );
      } else {
        // Regular paragraph
        children.push(
          new Paragraph({
            children: this.parseInlineTextRuns(line),
            spacing: { after: 150 }
          })
        );
      }
    }

    flushTable();
    return children;
  }

  /**
   * Create Word DOCX File from Markdown string or Structured Data
   */
  async createDocx(outputPath: string, input: string | DocxDocumentData): Promise<void> {
    let children: any[] = [];

    if (typeof input === 'string') {
      children = this.parseMarkdownToDocx(input);
    } else if (input && typeof input === 'object') {
      if (input.title) {
        children.push(
          new Paragraph({
            text: input.title,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
          })
        );
      }

      if (Array.isArray(input.paragraphs)) {
        for (const item of input.paragraphs) {
          if ('type' in item && item.type === 'table') {
            const tableRows: TableRow[] = [];
            
            const headerCells = item.headers.map(h => 
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: h, bold: true, color: 'FFFFFF' })],
                  alignment: AlignmentType.CENTER
                })],
                shading: { fill: '1F4E78' }
              })
            );
            tableRows.push(new TableRow({ children: headerCells }));

            for (const rowData of item.rows) {
              const rowCells = rowData.map(cellText => 
                new TableCell({
                  children: [new Paragraph({ text: cellText })],
                  margins: { top: 100, bottom: 100, left: 150, right: 150 }
                })
              );
              tableRows.push(new TableRow({ children: rowCells }));
            }

            children.push(
              new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE }
              })
            );
            children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
          } else {
            const p = item as DocxParagraph;
            const textRun = new TextRun({
              text: p.text,
              bold: p.bold,
              italics: p.italic
            });

            let heading: any = undefined;
            if (p.heading === 'Heading1') heading = HeadingLevel.HEADING_1;
            else if (p.heading === 'Heading2') heading = HeadingLevel.HEADING_2;
            else if (p.heading === 'Heading3') heading = HeadingLevel.HEADING_3;

            let alignment: any = AlignmentType.START;
            if (p.alignment === 'center') alignment = AlignmentType.CENTER;
            else if (p.alignment === 'right') alignment = AlignmentType.END;
            else if (p.alignment === 'justify') alignment = AlignmentType.BOTH;

            children.push(
              new Paragraph({
                children: [textRun],
                heading,
                alignment,
                spacing: { after: 150 }
              })
            );
          }
        }
      }
    }

    if (children.length === 0) {
      children.push(new Paragraph({ text: 'Empty Document' }));
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(outputPath, buffer);
  }

  /**
   * Helper to format cell value from ExcelJS
   */
  private formatCellValue(val: any): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if (val instanceof Date) return val.toISOString().split('T')[0];
      if ('result' in val) return String(val.result ?? '');
      if ('text' in val) return String(val.text ?? '');
      if ('richText' in val && Array.isArray(val.richText)) {
        return val.richText.map((r: any) => r.text || '').join('');
      }
      return JSON.stringify(val);
    }
    return String(val);
  }

  /**
   * Read Excel (.xlsx, .xls) spreadsheet content and format as Markdown tables
   */
  async readExcel(filePath: string, options?: { sheetName?: string; limitRows?: number }): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const maxRows = options?.limitRows || 100;
    const sheetsToRead = options?.sheetName 
      ? workbook.worksheets.filter(s => s.name.toLowerCase() === options.sheetName!.toLowerCase())
      : workbook.worksheets;

    if (sheetsToRead.length === 0) {
      return `[EXCEL INFO: No matching sheet found in workbook. Available sheets: ${workbook.worksheets.map(s => s.name).join(', ')}]`;
    }

    const output: string[] = [];

    for (const sheet of sheetsToRead) {
      output.push(`### Sheet: ${sheet.name}`);

      const rawRows: string[][] = [];
      let maxCols = 0;

      sheet.eachRow({ includeEmpty: false }, (row, _rowNumber) => {
        if (rawRows.length >= maxRows) return;
        const rowVals: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          while (rowVals.length < colNumber - 1) {
            rowVals.push('');
          }
          const formatted = this.formatCellValue(cell.value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
          rowVals.push(formatted);
        });
        if (rowVals.length > maxCols) {
          maxCols = rowVals.length;
        }
        rawRows.push(rowVals);
      });

      if (rawRows.length === 0) {
        output.push('_Sheet is empty_\n');
        continue;
      }

      // Pad all rows to maxCols
      for (const row of rawRows) {
        while (row.length < maxCols) {
          row.push('');
        }
      }

      // Format markdown table
      const headerRow = rawRows[0];
      const separatorRow = new Array(maxCols).fill('---');
      const bodyRows = rawRows.slice(1);

      output.push(`| ${headerRow.join(' | ')} |`);
      output.push(`| ${separatorRow.join(' | ')} |`);

      for (const bRow of bodyRows) {
        output.push(`| ${bRow.join(' | ')} |`);
      }

      if (sheet.rowCount > maxRows) {
        output.push(`\n_[TRUNCATED: Showing first ${maxRows} of ${sheet.rowCount} rows]_`);
      }

      output.push('');
    }

    return output.join('\n').trim();
  }

  /**
   * Edit or update an existing Excel spreadsheet
   */
  async editExcel(filePath: string, operations: ExcelEditOperation[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    for (const op of operations) {
      let sheet = op.sheetName ? workbook.getWorksheet(op.sheetName) : workbook.worksheets[0];
      if (!sheet) {
        sheet = workbook.addWorksheet(op.sheetName || 'Sheet1');
      }

      if (op.cellUpdates && Array.isArray(op.cellUpdates)) {
        for (const update of op.cellUpdates) {
          sheet.getCell(update.cell).value = update.value;
        }
      }

      if (op.appendRows && Array.isArray(op.appendRows)) {
        sheet.addRows(op.appendRows);
      }
    }

    await workbook.xlsx.writeFile(filePath);
  }

  /**
   * Read Word (.docx) document content and format as Markdown
   */
  async readDocx(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    try {
      if (typeof (mammoth as any).convertToMarkdown === 'function') {
        const result = await (mammoth as any).convertToMarkdown({ buffer });
        if (result.value && result.value.trim().length > 0) {
          return result.value.trim();
        }
      }
    } catch {
      // Fallback
    }

    const raw = await mammoth.extractRawText({ buffer });
    return raw.value.trim() || 'Empty Document';
  }

  /**
   * Read PDF document text and structure
   */
  async readPdf(filePath: string, options?: { maxPages?: number }): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      const infoResult = await parser.getInfo().catch(() => null);

      const meta: string[] = [];
      if (textResult.total) meta.push(`Pages: ${textResult.total}`);
      if (infoResult?.info?.Title) meta.push(`Title: ${infoResult.info.Title}`);
      if (infoResult?.info?.Author) meta.push(`Author: ${infoResult.info.Author}`);

      const header = meta.length > 0 ? `[PDF METADATA: ${meta.join(' | ')}]\n\n` : '';

      if (options?.maxPages && options.maxPages > 0 && textResult.pages && textResult.pages.length > options.maxPages) {
        const slicedPages = textResult.pages.slice(0, options.maxPages);
        const pageTexts = slicedPages.map((p: any) => `--- Page ${p.num} ---\n${p.text}`).join('\n\n');
        return `${header}${pageTexts}\n\n_[TRUNCATED: Showing first ${options.maxPages} of ${textResult.total} pages]_`;
      }

      return `${header}${textResult.text.trim()}`;
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
}
