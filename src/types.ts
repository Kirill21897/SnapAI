// Selection & UI types

export interface SelectionState {
  text: string;
  rect: DOMRect;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface PanelState {
  selection: string;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export type Action = 'explain' | 'summarize' | 'elaborate';

// AI request/response types

export interface AIRequest {
  selection: string;
  messages: Message[];
  action?: Action;
  query?: string;
}

export interface AIResponse {
  ok: true;
  content: string;
}

export interface AIError {
  ok: false;
  message: string;
}

// Messaging protocol between content script and service worker

export interface RequestMessage {
  type: 'AI_REQUEST';
  payload: AIRequest;
}

export interface ResponseMessage {
  type: 'AI_RESPONSE';
  payload: AIResponse | AIError;
}

// Provider types

export type Provider = 'openai' | 'openrouter';

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface ProviderSettings {
  provider: Provider;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  openaiModel?: string;
  openrouterModel?: string;
}

// Storage

export interface StorageSchema {
  /** @deprecated Use openaiApiKey instead. Kept for migration only. */
  apiKey?: string;

  // New fields
  provider?: Provider;        // 'openai' | 'openrouter', default: 'openai'
  openaiApiKey?: string;
  openrouterApiKey?: string;
  openaiModel?: string;       // default: 'gpt-4o-mini'
  openrouterModel?: string;   // default: 'openai/gpt-4o-mini'
}

// Provider constants

export const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4o-mini',
  },
} as const;

// Returns OpenRouter-specific headers; uses a function to avoid top-level
// access to chrome.runtime.id in test environments.
export function getOpenRouterHeaders(): Record<string, string> {
  return {
    'HTTP-Referer': chrome.runtime.id,
    'X-Title': 'Context AI Assistant',
  };
}

// OpenAI API types

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
}

// System prompts for predefined actions

export const SYSTEM_PROMPTS: Record<Action, string> = {
  explain:   'Объясни следующий текст простыми словами:',
  summarize: 'Кратко изложи суть следующего текста:',
  elaborate: 'Дай развёрнутый анализ следующего текста:',
};

// Constraints

export const MAX_SELECTION_LENGTH = 10000;
export const MAX_QUOTE_LENGTH = 300;
export const MAX_DIALOG_DEPTH = 5;
export const REQUEST_TIMEOUT_MS = 15000;
