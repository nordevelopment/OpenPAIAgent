import fs from 'node:fs';
import { execSync } from 'node:child_process';

if (!fs.existsSync('node_modules')) {
  console.log('⚠️  Папка node_modules не найдена! Автоматически запускаем npm install...\n');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('\n✅ Зависимости успешно установлены!\n');
  } catch (error) {
    console.error('\n❌ Ошибка при выполнении npm install:', error);
    process.exit(1);
  }
}
