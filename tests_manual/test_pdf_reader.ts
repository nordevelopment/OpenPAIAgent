import { OfficeDocumentService } from '../src/backend/services/OfficeDocumentService.js';
import fs from 'fs/promises';
import path from 'path';

async function testPdfDirect() {
  const officeService = new OfficeDocumentService();
  const testDir = path.join(process.cwd(), 'workspace', 'session_test_docs');
  await fs.mkdir(testDir, { recursive: true });

  // Create a minimal valid PDF with text stream
  const minimalPdf = Buffer.from(
    '%PDF-1.4\n' +
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n' +
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n' +
    '5 0 obj << /Length 55 >> stream\n' +
    'BT /F1 24 Tf 100 700 Td (Hello OpenPAIAgent PDF World!) Tj ET\n' +
    'endstream\n' +
    'endobj\n' +
    'xref\n' +
    '0 6\n' +
    '0000000000 65535 f \n' +
    '0000000009 00000 n \n' +
    '0000000058 00000 n \n' +
    '0000000115 00000 n \n' +
    '0000000244 00000 n \n' +
    '0000000318 00000 n \n' +
    'trailer << /Size 6 /Root 1 0 R >>\n' +
    'startxref\n' +
    '425\n' +
    '%%EOF\n'
  );

  const pdfPath = path.join(testDir, 'test_sample.pdf');
  await fs.writeFile(pdfPath, minimalPdf);

  const parsedText = await officeService.readPdf(pdfPath);
  console.log('Parsed PDF Text:', JSON.stringify(parsedText));
  if (parsedText.includes('Hello OpenPAIAgent PDF World!')) {
    console.log('✅ PDF parsing verified successfully!');
  } else {
    throw new Error('PDF parsing output did not contain expected text');
  }
}

testPdfDirect().catch(err => {
  console.error('PDF Reader test error:', err);
  process.exit(1);
});
