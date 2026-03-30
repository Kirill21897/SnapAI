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
  function getOpenRouterHeaders() {
    return {
      "HTTP-Referer": chrome.runtime.id,
      "X-Title": "Context AI Assistant"
    };
  }
  var SYSTEM_PROMPTS = {
    explain: "\u041E\u0431\u044A\u044F\u0441\u043D\u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0442\u0435\u043A\u0441\u0442 \u043F\u0440\u043E\u0441\u0442\u044B\u043C\u0438 \u0441\u043B\u043E\u0432\u0430\u043C\u0438:",
    summarize: "\u041A\u0440\u0430\u0442\u043A\u043E \u0438\u0437\u043B\u043E\u0436\u0438 \u0441\u0443\u0442\u044C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0430:",
    elaborate: "\u0414\u0430\u0439 \u0440\u0430\u0437\u0432\u0451\u0440\u043D\u0443\u0442\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0430:"
  };
  var MAX_DIALOG_DEPTH = 5;
  var REQUEST_TIMEOUT_MS = 15e3;

  // src/background.ts
  var STORAGE_KEY = "apiKey";
  async function getApiKey() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ?? null;
  }
  async function saveApiKey(key) {
    await chrome.storage.local.set({ [STORAGE_KEY]: key });
  }
  async function clearApiKey() {
    await chrome.storage.local.remove(STORAGE_KEY);
  }
  async function migrateApiKey() {
    const result = await chrome.storage.local.get(["apiKey", "openaiApiKey"]);
    if (result.apiKey && !result.openaiApiKey) {
      await chrome.storage.local.set({ openaiApiKey: result.apiKey });
      await chrome.storage.local.remove("apiKey");
    }
  }
  function buildHeaders(apiKey, provider) {
    const base = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    if (provider === "openrouter") {
      return { ...base, ...getOpenRouterHeaders() };
    }
    return base;
  }
  async function resolveProviderConfig() {
    const result = await chrome.storage.local.get([
      "provider",
      "openaiApiKey",
      "openrouterApiKey",
      "openaiModel",
      "openrouterModel"
    ]);
    const provider = result.provider ?? "openai";
    if (provider === "openrouter") {
      const apiKey2 = result.openrouterApiKey;
      if (!apiKey2) return null;
      return {
        provider,
        apiKey: apiKey2,
        model: result.openrouterModel ?? PROVIDER_DEFAULTS.openrouter.model,
        baseUrl: PROVIDER_DEFAULTS.openrouter.baseUrl
      };
    }
    const apiKey = result.openaiApiKey;
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: result.openaiModel ?? PROVIDER_DEFAULTS.openai.model,
      baseUrl: PROVIDER_DEFAULTS.openai.baseUrl
    };
  }
  function buildMessages(req) {
    const messages = [];
    if (req.action) {
      messages.push({ role: "system", content: SYSTEM_PROMPTS[req.action] });
    } else {
      messages.push({ role: "system", content: "\u041E\u0442\u0432\u0435\u0442\u044C \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044F \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u043E\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0430." });
    }
    messages.push({ role: "user", content: req.selection });
    const history = req.messages.slice(-MAX_DIALOG_DEPTH * 2);
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    if (req.query) {
      messages.push({ role: "user", content: req.query });
    }
    return messages;
  }
  async function handleAIRequest(req) {
    await migrateApiKey();
    const config = await resolveProviderConfig();
    if (!config) {
      return { ok: false, message: "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 API-\u043A\u043B\u044E\u0447 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F" };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const body = {
        model: config.model,
        messages: buildMessages(req)
      };
      const response = await fetch(config.baseUrl, {
        method: "POST",
        headers: buildHeaders(config.apiKey, config.provider),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errText = await response.text();
        console.error("[Context AI] API error:", response.status, errText);
        return { ok: false, message: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437" };
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      if (!content) {
        return { ok: false, message: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437" };
      }
      return { ok: true, content };
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("[Context AI] fetch error:", err);
      return { ok: false, message: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437" };
    }
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "AI_REQUEST") {
        handleAIRequest(message.payload).then((result) => {
          sendResponse({ type: "AI_RESPONSE", payload: result });
        });
        return true;
      }
    });
  }
})();
