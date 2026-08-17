/**
 * AgentService.ts - Service for working with agent descriptions
 * Allows you to get a list of available agents and their configurations
 * Author: Norayr Petrosyan
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentService {
    private baseAgentsPath: string;

    constructor() {
        // Path to agents folder in project root
        this.baseAgentsPath = path.join(__dirname, '../../../agents');
    }

    /**
     * Get list of available agents (folder names in agents directory)
     * Excludes system templates like base-template
     */
    async getAvailableAgents(): Promise<string[]> {
        if (!fs.existsSync(this.baseAgentsPath)) {
            console.warn(`AgentService: Directory not found: ${this.baseAgentsPath}`);
            return [];
        }

        const SYSTEM_TEMPLATES = ['base-template', 'base_template'];
        const entries = fs.readdirSync(this.baseAgentsPath, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory() && !SYSTEM_TEMPLATES.includes(entry.name))
            .map(entry => entry.name);
    }

    /**
     * Sanitize agent ID to prevent Path Traversal.
     * Returns only the safe folder name.
     */
    private getSafeAgentId(agentId: string): string {
        return agentId
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_-]/g, '');
    }

    /**
     * Check if agent exists
     * @param agentId - agent ID (folder name)
     */
    async agentExists(agentId: string): Promise<boolean> {
        const safeAgentId = this.getSafeAgentId(agentId);
        if (!safeAgentId) return false;
        const agentPath = path.join(this.baseAgentsPath, safeAgentId);
        return fs.existsSync(agentPath) && fs.lstatSync(agentPath).isDirectory();
    }

    // List of allowed files to be edited for security
    public readonly ALLOWED_EDIT_FILES = ['Agent.md', 'Identity.md', 'Memory.md', 'User.md'];

    /**
     * Get the contents of all allowed markdown files for a given agent
     * @param agentId - agent ID (folder name)
     */
    async getAgentFiles(agentId: string): Promise<Record<string, string>> {
        const safeAgentId = this.getSafeAgentId(agentId);
        const files: Record<string, string> = {};
        const agentPath = path.join(this.baseAgentsPath, safeAgentId);

        for (const filename of this.ALLOWED_EDIT_FILES) {
            const filePath = path.join(agentPath, filename);
            if (fs.existsSync(filePath)) {
                files[filename] = fs.readFileSync(filePath, 'utf-8');
            } else {
                files[filename] = '';
            }
        }
        return files;
    }

    /**
     * Save updated contents back to the agent's files
     * @param agentId - agent ID (folder name)
     * @param files - dictionary of filename to file content
     */
    async saveAgentFiles(agentId: string, files: Record<string, string>): Promise<void> {
        const safeAgentId = this.getSafeAgentId(agentId);
        const agentPath = path.join(this.baseAgentsPath, safeAgentId);
        if (!fs.existsSync(agentPath) || !fs.lstatSync(agentPath).isDirectory()) {
            throw new Error(`Agent directory does not exist: ${safeAgentId}`);
        }

        for (const [filename, content] of Object.entries(files)) {
            if (!this.ALLOWED_EDIT_FILES.includes(filename)) {
                console.warn(`AgentService: Attempted to save disallowed file: ${filename}`);
                continue; // Prevent Path Traversal and other security issues
            }
            const filePath = path.join(agentPath, filename);
            fs.writeFileSync(filePath, content, 'utf-8');
        }
    }

    /**
     * Create a new agent by copying files from base-template (or main_agent as fallback)
     * @param agentId - agent ID (folder name)
     */
    async createAgent(agentId: string): Promise<void> {
        const safeAgentId = this.getSafeAgentId(agentId);
        if (!safeAgentId) {
            throw new Error('Invalid Agent ID');
        }

        const newAgentPath = path.join(this.baseAgentsPath, safeAgentId);
        if (fs.existsSync(newAgentPath)) {
            throw new Error(`Agent with ID "${safeAgentId}" already exists`);
        }

        // Create directory
        fs.mkdirSync(newAgentPath, { recursive: true });

        // Determine template source: base-template preferred, fallback to main_agent
        const baseTemplatePath = path.join(this.baseAgentsPath, 'base-template');
        const mainAgentPath = path.join(this.baseAgentsPath, 'main_agent');
        let templatePath = fs.existsSync(baseTemplatePath) ? baseTemplatePath : mainAgentPath;

        if (fs.existsSync(templatePath)) {
            for (const filename of this.ALLOWED_EDIT_FILES) {
                const srcFile = path.join(templatePath, filename);
                const destFile = path.join(newAgentPath, filename);
                if (fs.existsSync(srcFile)) {
                    fs.copyFileSync(srcFile, destFile);
                } else {
                    fs.writeFileSync(destFile, '', 'utf-8');
                }
            }

            // Copy skills directory if it exists
            const srcSkillsDir = path.join(templatePath, 'skills');
            const destSkillsDir = path.join(newAgentPath, 'skills');
            if (fs.existsSync(srcSkillsDir)) {
                fs.mkdirSync(destSkillsDir, { recursive: true });
                const skillFiles = fs.readdirSync(srcSkillsDir);
                for (const file of skillFiles) {
                    if (file.endsWith('.md')) {
                        fs.copyFileSync(path.join(srcSkillsDir, file), path.join(destSkillsDir, file));
                    }
                }
            }
        } else {
            // Fallback: create empty files
            for (const filename of this.ALLOWED_EDIT_FILES) {
                const destFile = path.join(newAgentPath, filename);
                fs.writeFileSync(destFile, '', 'utf-8');
            }
        }
    }

    /**
     * Delete an agent profile and all its files
     * @param agentId - agent ID (folder name)
     */
    async deleteAgent(agentId: string): Promise<void> {
        const safeAgentId = this.getSafeAgentId(agentId);
        if (safeAgentId === 'main_agent' || safeAgentId === 'base-template' || safeAgentId === 'base_template') {
            throw new Error('Cannot delete system agent or base template');
        }

        const agentPath = path.join(this.baseAgentsPath, safeAgentId);
        if (!fs.existsSync(agentPath) || !fs.lstatSync(agentPath).isDirectory()) {
            throw new Error(`Agent "${safeAgentId}" does not exist`);
        }

        // Delete directory recursively
        fs.rmSync(agentPath, { recursive: true, force: true });
    }
}

