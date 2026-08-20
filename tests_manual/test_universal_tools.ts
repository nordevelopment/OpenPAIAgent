import path from 'path';
import fs from 'fs/promises';
import { AITools } from '../src/backend/ai/AITools.js';

async function testUniversalTools() {
  console.log('--- Testing Unified read_file & write_file Tools ---');
  const tools = new AITools();

  const testDir = path.join(process.cwd(), 'workspace', 'session_unified_test');
  await fs.mkdir(testDir, { recursive: true });

  // 1. Write and Read Word DOCX
  console.log('\n1. Testing Word DOCX via write_file...');
  const writeDocxResult = await tools.executeTool({
    name: 'write_file',
    arguments: {
      path: 'session_unified_test/contract.docx',
      content: '# Service Agreement\n\n## 1. Scope\nProvider agrees to deliver AI Agent integration.\n\n## 2. Payment\n* Amount: **$10,000**\n* Term: Net 30'
    }
  });
  console.log('write_file DOCX result:', writeDocxResult.result);

  const readDocxResult = await tools.executeTool({
    name: 'read_file',
    arguments: { path: 'session_unified_test/contract.docx' }
  });
  console.log('read_file DOCX result:\n', readDocxResult.result);

  // 2. Write and Read Excel XLSX
  console.log('\n2. Testing Excel XLSX via write_file...');
  const writeExcelResult = await tools.executeTool({
    name: 'write_file',
    arguments: {
      path: 'session_unified_test/inventory.xlsx',
      sheets: [
        {
          name: 'Products',
          columns: [
            { header: 'ID', key: 'id' },
            { header: 'Product', key: 'product' },
            { header: 'Stock', key: 'stock' }
          ],
          rows: [
            { id: 1, product: 'Microphone', stock: 45 },
            { id: 2, product: 'Webcam 4K', stock: 20 }
          ]
        }
      ]
    }
  });
  console.log('write_file Excel result:', writeExcelResult.result);

  const readExcelResult = await tools.executeTool({
    name: 'read_file',
    arguments: { path: 'session_unified_test/inventory.xlsx' }
  });
  console.log('read_file Excel result:\n', readExcelResult.result);

  // 3. Edit Excel and Read
  console.log('\n3. Testing edit_excel...');
  await tools.executeTool({
    name: 'edit_excel',
    arguments: {
      path: 'session_unified_test/inventory.xlsx',
      operations: [
        {
          sheetName: 'Products',
          cellUpdates: [{ cell: 'C2', value: 50 }],
          appendRows: [[3, 'Monitor 32"', 15]]
        }
      ]
    }
  });

  const readExcelAfterEdit = await tools.executeTool({
    name: 'read_file',
    arguments: { path: 'session_unified_test/inventory.xlsx' }
  });
  console.log('read_file Excel after edit:\n', readExcelAfterEdit.result);

  // 4. Write and Read Standard Text/Code
  console.log('\n4. Testing standard text file...');
  await tools.executeTool({
    name: 'write_file',
    arguments: {
      path: 'session_unified_test/script.py',
      content: 'print("Hello from AI generated Python script!")'
    }
  });

  const readCodeResult = await tools.executeTool({
    name: 'read_file',
    arguments: { path: 'session_unified_test/script.py' }
  });
  console.log('read_file Python script result:\n', readCodeResult.result);

  console.log('\n✅ All Unified read_file & write_file Operations Succeeded!');
}

testUniversalTools().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
