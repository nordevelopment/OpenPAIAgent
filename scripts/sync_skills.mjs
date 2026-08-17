import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseAgentsDir = path.join(__dirname, '../agents');
const srcSkillsDir = path.join(baseAgentsDir, 'main_agent', 'skills');
const skills = fs.readdirSync(srcSkillsDir);

const agentDirs = fs.readdirSync(baseAgentsDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'main_agent')
  .map(d => d.name);

console.log('Target agents:', agentDirs);

for (const agent of agentDirs) {
  const destDir = path.join(baseAgentsDir, agent, 'skills');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  for (const skill of skills) {
    fs.copyFileSync(path.join(srcSkillsDir, skill), path.join(destDir, skill));
  }
  console.log(`Successfully synced ${skills.length} skills to ${agent}/skills`);
}
