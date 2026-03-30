import type { Provider, StorageSchema, ProviderSettings } from './types';
import { PROVIDER_DEFAULTS } from './types';

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  const update: Partial<StorageSchema> = { provider: settings.provider };

  if (settings.provider === 'openai') {
    if (settings.openaiApiKey) {
      update.openaiApiKey = settings.openaiApiKey;
    } else if (settings.openaiApiKey === '') {
      await chrome.storage.local.remove('openaiApiKey');
    }
    if (settings.openaiModel !== undefined) {
      update.openaiModel = settings.openaiModel;
    }
  } else {
    if (settings.openrouterApiKey) {
      update.openrouterApiKey = settings.openrouterApiKey;
    } else if (settings.openrouterApiKey === '') {
      await chrome.storage.local.remove('openrouterApiKey');
    }
    if (settings.openrouterModel !== undefined) {
      update.openrouterModel = settings.openrouterModel;
    }
  }

  await chrome.storage.local.set(update);
}

export async function loadProviderSettings(): Promise<ProviderSettings> {
  const result = await chrome.storage.local.get([
    'provider', 'openaiApiKey', 'openrouterApiKey', 'openaiModel', 'openrouterModel',
  ]) as StorageSchema;

  return {
    provider: result.provider ?? 'openai',
    openaiApiKey: result.openaiApiKey,
    openrouterApiKey: result.openrouterApiKey,
    openaiModel: result.openaiModel ?? PROVIDER_DEFAULTS.openai.model,
    openrouterModel: result.openrouterModel ?? PROVIDER_DEFAULTS.openrouter.model,
  };
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 3) + '...' + key.slice(-4);
}

export function getDefaultKeyPlaceholder(provider: Provider): string {
  return provider === 'openai' ? 'sk-...' : 'sk-or-...';
}

async function init(): Promise<void> {
  const providerSelect = document.getElementById('provider') as HTMLSelectElement;
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  const modelInput = document.getElementById('model') as HTMLInputElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const statusEl = document.getElementById('status') as HTMLElement;

  function showStatus(message: string, isError = false): void {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#d93025' : '#1a73e8';
    setTimeout(() => { statusEl.textContent = ''; }, 2500);
  }

  async function updateFormForProvider(provider: Provider): Promise<void> {
    const settings = await loadProviderSettings();
    const raw = await chrome.storage.local.get(['openaiModel', 'openrouterModel']) as {
      openaiModel?: string;
      openrouterModel?: string;
    };

    const apiKey = provider === 'openai' ? settings.openaiApiKey : settings.openrouterApiKey;
    if (apiKey) {
      apiKeyInput.placeholder = maskApiKey(apiKey);
    } else {
      apiKeyInput.placeholder = getDefaultKeyPlaceholder(provider);
    }
    apiKeyInput.value = '';

    const defaultModel = PROVIDER_DEFAULTS[provider].model;
    modelInput.placeholder = defaultModel;
    const explicitModel = provider === 'openai' ? raw.openaiModel : raw.openrouterModel;
    modelInput.value = explicitModel ?? '';
  }

  // On page load
  const initialSettings = await loadProviderSettings();
  providerSelect.value = initialSettings.provider;
  await updateFormForProvider(initialSettings.provider);

  providerSelect.addEventListener('change', async () => {
    await updateFormForProvider(providerSelect.value as Provider);
  });

  saveBtn.addEventListener('click', async () => {
    const provider = providerSelect.value as Provider;
    const key = apiKeyInput.value.trim();
    const modelRaw = modelInput.value.trim();
    const model = modelRaw || undefined;

    const settings: ProviderSettings = { provider };
    if (provider === 'openai') {
      if (key) settings.openaiApiKey = key;
      if (model !== undefined) settings.openaiModel = model;
    } else {
      if (key) settings.openrouterApiKey = key;
      if (model !== undefined) settings.openrouterModel = model;
    }

    await saveProviderSettings(settings);

    if (key) {
      apiKeyInput.placeholder = maskApiKey(key);
      apiKeyInput.value = '';
    }

    showStatus('Настройки сохранены');
  });

  clearBtn.addEventListener('click', async () => {
    const provider = providerSelect.value as Provider;
    const storageKey = provider === 'openai' ? 'openaiApiKey' : 'openrouterApiKey';
    await chrome.storage.local.remove(storageKey);
    apiKeyInput.value = '';
    apiKeyInput.placeholder = getDefaultKeyPlaceholder(provider);
    showStatus('Ключ удалён');
  });
}

document.addEventListener('DOMContentLoaded', init);
