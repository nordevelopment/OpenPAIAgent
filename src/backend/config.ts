import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

export const config = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '127.0.0.1',
  ENV: process.env.NODE_ENV || 'local',
  APP_USER: process.env.APP_USER || 'admin',
  APP_PASSWORD: process.env.APP_PASSWORD || '',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_API_URL: process.env.AI_API_URL || '',
  AI_DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL || 'qwen/qwen3.5-flash-02-23',
  AI_EMBEDDING_MODEL: process.env.AI_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B',
  AI_MAX_HISTORY_MESSAGES: process.env.AI_MAX_HISTORY_MESSAGES || 30,
  AI_TEMPERATURE: process.env.AI_TEMPERATURE || 0.2,
  AI_MAX_TOKENS: process.env.AI_MAX_TOKENS || 16000,
  AI_TOP_P: process.env.AI_TOP_P || 0.9,
  AI_TIMEOUT: 180000,
  AI_MAX_FILE_READ_SIZE: parseInt(process.env.AI_MAX_FILE_READ_SIZE || '1048576'),
  AI_MAX_THINKING_STEPS: parseInt(process.env.AI_MAX_THINKING_STEPS || '25'),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  ALLOWED_TELEGRAM_USER_IDS: process.env.ALLOWED_TELEGRAM_USER_IDS || '',

  default_agent: 'main_agent',

  images: {
    defaultProvider: process.env.IMAGE_DEFAULT_PROVIDER || 'together',
    together: {
      key: process.env.TOGETHER_API_KEY || '',
      url: process.env.TOGETHER_API_URL || 'https://api.together.xyz/v1/images/generations',
      model: process.env.TOGETHER_IMAGE_MODEL || 'black-forest-labs/FLUX.2-dev',
      steps: parseInt(process.env.IMAGE_GENERATION_STEPS || '26')
    },
    xai: {
      key: process.env.XAI_API_KEY || '',
      url: process.env.XAI_API_URL || 'https://api.x.ai/v1/images/generations',
      model: process.env.XAI_IMAGE_MODEL || 'grok-imagine-image'
    }
  },

  storageDir: 'storage',
  generatedImagesDir: 'storage/generated'
};

// Load dynamic config from config.json if it exists
const configJsonPath = path.join(process.cwd(), 'config.json');
if (fs.existsSync(configJsonPath)) {
  try {
    const raw = fs.readFileSync(configJsonPath, 'utf-8');
    if (raw.trim()) {
      const parsed = JSON.parse(raw);
      if (parsed.ai_api_key) {
        config.AI_API_KEY = parsed.ai_api_key;
      }
      if (parsed.ai_api_url) {
        config.AI_API_URL = parsed.ai_api_url;
      }
      if (parsed.ai_default_model) {
        config.AI_DEFAULT_MODEL = parsed.ai_default_model;
      }
      if (parsed.telegram_bot_token) {
        config.TELEGRAM_BOT_TOKEN = parsed.telegram_bot_token;
      }
      if (parsed.allowed_telegram_user_ids) {
        config.ALLOWED_TELEGRAM_USER_IDS = parsed.allowed_telegram_user_ids;
      }
      if (parsed.app_user) {
        config.APP_USER = parsed.app_user;
      }
      if (parsed.app_password) {
        config.APP_PASSWORD = parsed.app_password;
      }
      if (parsed.together_api_key) {
        config.images.together.key = parsed.together_api_key;
      }
      if (parsed.xai_api_key) {
        config.images.xai.key = parsed.xai_api_key;
      }
      if (parsed.ai_max_file_read_size) {
        config.AI_MAX_FILE_READ_SIZE = parseInt(parsed.ai_max_file_read_size, 25);
      }
      if (parsed.ai_max_thinking_steps) {
        config.AI_MAX_THINKING_STEPS = parseInt(parsed.ai_max_thinking_steps, 25);
      }
    }
  } catch (err) {
    console.error('Failed to parse config.json:', err);
  }
}