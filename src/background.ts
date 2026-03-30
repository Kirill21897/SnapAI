import {
  AIRequest,
  AIResponse,
  AIError,
  OpenAIMessage,
  RequestMessage,
  Provider,
  ProviderConfig,
  StorageSchema,
  PROVIDER_DEFAULTS,
  getOpenRouterHeaders,
  SYSTEM_PROMPTS,
  MAX_DIALOG_DEPTH,
  REQUEST_TIMEOUT_MS,
} from './types';

const STORAGE_KEY = 'apiKey';

// --- Storage helpers ---

export async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as string) ?? null;
}

export async function saveApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: key });
}

export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

// --- Provider helpers ---

/** Migrates legacy `apiKey` → `openaiApiKey`. Idempotent. */
export async function migrateApiKey(): Promise<void> {
  const result = await chrome.storage.local.get(['apiKey', 'openaiApiKey']) as Pick<StorageSchema, 'apiKey' | 'openaiApiKey'>;
  if (result.apiKey && !result.openaiApiKey) {
    await chrome.storage.local.set({ openaiApiKey: result.apiKey });
    await chrome.storage.local.remove('apiKey');
  }
}

/** Builds request headers for the given provider. */
export function buildHeaders(apiKey: string, provider: Provider): Record<string, string> {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    return { ...base, ...getOpenRouterHeaders() };
  }
  return base;
}

/** Reads provider config from storage. Returns null if API key is missing. */
export async function resolveProviderConfig(): Promise<ProviderConfig | null> {
  const result = await chrome.storage.local.get([
    'provider', 'openaiApiKey', 'openrouterApiKey', 'openaiModel', 'openrouterModel',
  ]) as Pick<StorageSchema, 'provider' | 'openaiApiKey' | 'openrouterApiKey' | 'openaiModel' | 'openrouterModel'>;

  const provider: Provider = result.provider ?? 'openai';

  if (provider === 'openrouter') {
    const apiKey = result.openrouterApiKey;
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: result.openrouterModel ?? PROVIDER_DEFAULTS.openrouter.model,
      baseUrl: PROVIDER_DEFAULTS.openrouter.baseUrl,
    };
  }

  // default: openai
  const apiKey = result.openaiApiKey;
  if (!apiKey) return null;
  return {
    provider,
    apiKey,
    model: result.openaiModel ?? PROVIDER_DEFAULTS.openai.model,
    baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
  };
}

// --- Messages builder ---

export function buildMessages(req: AIRequest): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  // 1. System message: action instruction or generic context
  if (req.action) {
    messages.push({ role: 'system', content: SYSTEM_PROMPTS[req.action] });
  } else {
    messages.push({ role: 'system', content: 'Ответь на вопрос пользователя, используя контекст выделенного текста.' });
  }

  // 2. User message: selection text
  messages.push({ role: 'user', content: req.selection });

  // 3. Dialog history (up to MAX_DIALOG_DEPTH pairs)
  const history = req.messages.slice(-MAX_DIALOG_DEPTH * 2);
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // 4. Current query (if present)
  if (req.query) {
    messages.push({ role: 'user', content: req.query });
  }

  return messages;
}

// --- AI request handler ---

export async function handleAIRequest(req: AIRequest): Promise<AIResponse | AIError> {
  await migrateApiKey();

  const config = await resolveProviderConfig();

  if (!config) {
    return { ok: false, message: 'Добавьте API-ключ в настройках расширения' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body = {
      model: config.model,
      messages: buildMessages(req),
    };

    const response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: buildHeaders(config.apiKey, config.provider),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Context AI] API error:', response.status, errText);
      return { ok: false, message: 'Не удалось получить ответ. Попробуйте ещё раз' };
    }

    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';

    if (!content) {
      return { ok: false, message: 'Не удалось получить ответ. Попробуйте ещё раз' };
    }

    return { ok: true, content };
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[Context AI] fetch error:', err);
    return { ok: false, message: 'Не удалось получить ответ. Попробуйте ещё раз' };
  }
}

// --- Message listener ---

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: RequestMessage, _sender, sendResponse) => {
    if (message.type === 'AI_REQUEST') {
      handleAIRequest(message.payload).then((result) => {
        sendResponse({ type: 'AI_RESPONSE', payload: result });
      });
      return true; // keep message channel open for async response
    }
  });
}
