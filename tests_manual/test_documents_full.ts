import path from 'path';
import fs from 'fs/promises';
import { OfficeDocumentService } from '../src/backend/services/OfficeDocumentService.js';
import { AITools } from '../src/backend/ai/AITools.js';

async function runTests() {
  console.log('--- Starting Document Service & AI Tools Test ---');
  const officeService = new OfficeDocumentService();
  const tools = new AITools();

  const testDir = path.join(process.cwd(), 'workspace', 'session_test_docs');
  await fs.mkdir(testDir, { recursive: true });

  // 1. Text File
  const txtPath = path.join(testDir, 'sample.txt');
  await fs.writeFile(txtPath, 'Hello from PAIAgent Text File!\nLine 2 of test.', 'utf-8');
  console.log('1. Created sample.txt');

  const readTxtResult = await tools.executeTool({
    name: 'read_file',
    arguments: { path: 'session_test_docs/sample.txt' }
  });
  console.log('Read TXT via AITools result:\n', readTxtResult.result);

  // 2. Excel File
  const xlsxPath = path.join(testDir, 'sample_budget.xlsx');
  await officeService.createExcel(xlsxPath, [
    {
      name: 'Q1 Budget',
      columns: [
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Status', key: 'status', width: 15 }
      ],
      rows: [
        { category: 'Marketing', amount: 5000, status: 'Approved' },
        { category: 'Development', amount: 12000, status: 'Pending' }
      ]
    }
  ]);
  console.log('2. Created sample_budget.xlsx');

  const readExcelResult = await tools.executeTool({
    name: 'read_file',
    arguments: { path: 'session_test_docs/sample_budget.xlsx' }
  });
  console.log('Read Excel via AITools result:\n', readExcelResult.result);

  // 3. Edit Excel
  const editExcelResult = await tools.executeTool({
    name: 'edit_excel',
    arguments: {
      path: 'session_test_docs/sample_budget.xlsx',
      operations: [
        {
          sheetName: 'Q1 Budget',
          cellUpdates: [{ cell: 'B2', value: 7500 }],
          appendRows: [['Office Supplies', 1200, 'Approved']]
        }
      ]
    }
  });
  console.log('Edit Excel via AITools result:\n', editExcelResult.result);

  const readExcelAfterEdit = await tools.executeTool({
    name: 'read_excel',
    arguments: { path: 'session_test_docs/sample_budget.xlsx' }
  });
  console.log('Read Excel after edit:\n', readExcelAfterEdit.result);

  // 4. Word (.docx) File
  const docxPath = path.join(testDir, 'sample_report.docx');
  const markdownReport = `# Quarterly Summary Report
## Overview
This is a test report generated for OpenPAIAgent document processing.

### Key Highlights
* Performance increased by **25%**
* Customer satisfaction rated at *98%*
* All deliverables completed on time

| Metric | Target | Actual |
| Item A | 100 | 125 |
| Item B | 50 | 52 |
`;
  await officeService.createDocx(docxPath, markdownReport);
  console.log('3. Created sample_report.docx');

  const readDocxResult = await tools.executeTool({
    name: 'read_file',
    arguments: { path: 'session_test_docs/sample_report.docx' }
  });
  console.log('Read DOCX via AITools result:\n', readDocxResult.result);

  console.log('\n--- All Document Operations Passed Successfully! ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
