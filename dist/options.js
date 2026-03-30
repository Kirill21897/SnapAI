"use strict";
(() => {
  // src/types.ts
  var PROVIDER_DEFAULTS = {
    openai: {
      baseUrl: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini"
    },
    openrouter: {
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: "openai/gpt-4o-mini"
    }
  };

  // src/options.ts
  async function saveProviderSettings(settings) {
    const update = { provider: settings.provider };
    if (settings.provider === "openai") {
      if (settings.openaiApiKey) {
        update.openaiApiKey = settings.openaiApiKey;
      } else if (settings.openaiApiKey === "") {
        await chrome.storage.local.remove("openaiApiKey");
      }
      if (settings.openaiModel !== void 0) {
        update.openaiModel = settings.openaiModel;
      }
    } else {
      if (settings.openrouterApiKey) {
        update.openrouterApiKey = settings.openrouterApiKey;
      } else if (settings.openrouterApiKey === "") {
        await chrome.storage.local.remove("openrouterApiKey");
      }
      if (settings.openrouterModel !== void 0) {
        update.openrouterModel = settings.openrouterModel;
      }
    }
    await chrome.storage.local.set(update);
  }
  async function loadProviderSettings() {
    const result = await chrome.storage.local.get([
      "provider",
      "openaiApiKey",
      "openrouterApiKey",
      "openaiModel",
      "openrouterModel"
    ]);
    return {
      provider: result.provider ?? "openai",
      openaiApiKey: result.openaiApiKey,
      openrouterApiKey: result.openrouterApiKey,
      openaiModel: result.openaiModel ?? PROVIDER_DEFAULTS.openai.model,
      openrouterModel: result.openrouterModel ?? PROVIDER_DEFAULTS.openrouter.model
    };
  }
  function maskApiKey(key) {
    if (key.length <= 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
    return key.slice(0, 3) + "..." + key.slice(-4);
  }
  function getDefaultKeyPlaceholder(provider) {
    return provider === "openai" ? "sk-..." : "sk-or-...";
  }
  async function init() {
    const providerSelect = document.getElementById("provider");
    const apiKeyInput = document.getElementById("api-key");
    const modelInput = document.getElementById("model");
    const saveBtn = document.getElementById("save-btn");
    const clearBtn = document.getElementById("clear-btn");
    const statusEl = document.getElementById("status");
    function showStatus(message, isError = false) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? "#d93025" : "#1a73e8";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2500);
    }
    async function updateFormForProvider(provider) {
      const settings = await loadProviderSettings();
      const raw = await chrome.storage.local.get(["openaiModel", "openrouterModel"]);
      const apiKey = provider === "openai" ? settings.openaiApiKey : settings.openrouterApiKey;
      if (apiKey) {
        apiKeyInput.placeholder = maskApiKey(apiKey);
      } else {
        apiKeyInput.placeholder = getDefaultKeyPlaceholder(provider);
      }
      apiKeyInput.value = "";
      const defaultModel = PROVIDER_DEFAULTS[provider].model;
      modelInput.placeholder = defaultModel;
      const explicitModel = provider === "openai" ? raw.openaiModel : raw.openrouterModel;
      modelInput.value = explicitModel ?? "";
    }
    const initialSettings = await loadProviderSettings();
    providerSelect.value = initialSettings.provider;
    await updateFormForProvider(initialSettings.provider);
    providerSelect.addEventListener("change", async () => {
      await updateFormForProvider(providerSelect.value);
    });
    saveBtn.addEventListener("click", async () => {
      const provider = providerSelect.value;
      const key = apiKeyInput.value.trim();
      const modelRaw = modelInput.value.trim();
      const model = modelRaw || void 0;
      const settings = { provider };
      if (provider === "openai") {
        if (key) settings.openaiApiKey = key;
        if (model !== void 0) settings.openaiModel = model;
      } else {
        if (key) settings.openrouterApiKey = key;
        if (model !== void 0) settings.openrouterModel = model;
      }
      await saveProviderSettings(settings);
      if (key) {
        apiKeyInput.placeholder = maskApiKey(key);
        apiKeyInput.value = "";
      }
      showStatus("\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B");
    });
    clearBtn.addEventListener("click", async () => {
      const provider = providerSelect.value;
      const storageKey = provider === "openai" ? "openaiApiKey" : "openrouterApiKey";
      await chrome.storage.local.remove(storageKey);
      apiKeyInput.value = "";
      apiKeyInput.placeholder = getDefaultKeyPlaceholder(provider);
      showStatus("\u041A\u043B\u044E\u0447 \u0443\u0434\u0430\u043B\u0451\u043D");
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
