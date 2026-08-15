/**
 * ai_providers.ts - Pre-configured AI Provider Presets
 */

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  requiresApiKey: boolean;
  isOpenAICompatible: boolean;
  description?: string;
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter.ai (Default)',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'qwen/qwen3.7-flash',
    requiresApiKey: true,
    isOpenAICompatible: true,
    description: 'Unified API gateway for 200+ AI models'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI Direct',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
    isOpenAICompatible: true,
    description: 'Official OpenAI completions API'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek Direct',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    requiresApiKey: true,
    isOpenAICompatible: true,
    description: 'Official DeepSeek V3 & R1 API'
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen / Alibaba Cloud (DashScope)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-max',
    requiresApiKey: true,
    isOpenAICompatible: true,
    description: 'Alibaba Cloud DashScope OpenAI-compatible endpoint'
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'qwen2.5:7b',
    requiresApiKey: false,
    isOpenAICompatible: true,
    description: 'Local LLM runner on http://localhost:11434'
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1/chat/completions',
    defaultModel: 'local-model',
    requiresApiKey: false,
    isOpenAICompatible: true,
    description: 'Local LM Studio server on http://localhost:1234'
  },
  custom: {
    id: 'custom',
    name: 'Custom Provider...',
    baseUrl: '',
    defaultModel: '',
    requiresApiKey: true,
    isOpenAICompatible: true,
    description: 'Custom API endpoint or reverse proxy'
  }
};

/**
 * Get array of all provider configurations
 */
export function getAIProvidersList(): AIProvider[] {
  return Object.values(AI_PROVIDERS);
}
