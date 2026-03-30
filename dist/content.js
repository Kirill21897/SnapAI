"use strict";
(() => {
  // src/types.ts
  var MAX_SELECTION_LENGTH = 1e4;
  var MAX_QUOTE_LENGTH = 300;
  var MAX_DIALOG_DEPTH = 5;

  // src/panel.ts
  var PANEL_HOST_ID = "context-ai-panel-host";
  var ACTION_LABELS = {
    explain: "\u041E\u0431\u044A\u044F\u0441\u043D\u0438\u0442\u044C",
    summarize: "\u0420\u0435\u0437\u044E\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
    elaborate: "\u0420\u0430\u0437\u043E\u0431\u0440\u0430\u0442\u044C \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435"
  };
  var ACTIONS = ["explain", "summarize", "elaborate"];
  function truncateQuote(text) {
    if (text.length <= MAX_QUOTE_LENGTH) return text;
    return text.slice(0, MAX_QUOTE_LENGTH) + "\u2026";
  }
  var state = {
    selection: "",
    messages: [],
    isLoading: false,
    error: null
  };
  var lastRequest = null;
  var shadowRoot = null;
  var STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :host { all: initial; }

  #panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 380px;
    max-height: 80vh;
    overflow-y: auto;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    color: #1a1a1a;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  .quote {
    background: #f5f5f5;
    border-left: 3px solid #4F46E5;
    padding: 8px 10px;
    border-radius: 4px;
    font-style: italic;
    color: #444;
    font-size: 13px;
    word-break: break-word;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn-action {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid #4F46E5;
    border-radius: 6px;
    background: #fff;
    color: #4F46E5;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.15s;
  }
  .btn-action:hover:not(:disabled) { background: #EEF2FF; }
  .btn-action:disabled { opacity: 0.45; cursor: not-allowed; }

  .query-row {
    display: flex;
    gap: 8px;
  }

  #query-input {
    flex: 1;
    padding: 7px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }
  #query-input:focus { border-color: #4F46E5; }
  #query-input:disabled { background: #f9f9f9; }

  .btn-send {
    padding: 7px 14px;
    background: #4F46E5;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.15s;
  }
  .btn-send:hover:not(:disabled) { background: #4338CA; }
  .btn-send:disabled { opacity: 0.45; cursor: not-allowed; }

  .hint {
    color: #e53e3e;
    font-size: 12px;
  }

  .loader {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #666;
    font-size: 13px;
  }
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #d1d5db;
    border-top-color: #4F46E5;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .messages {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .msg-user {
    background: #EEF2FF;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    color: #3730a3;
    align-self: flex-end;
    max-width: 90%;
    word-break: break-word;
  }

  .msg-assistant {
    background: #f9fafb;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    color: #1a1a1a;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .response-area {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .response-actions {
    display: flex;
    gap: 8px;
  }

  .btn-copy, .btn-retry {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    border: 1px solid #d1d5db;
    background: #fff;
    transition: background 0.15s;
  }
  .btn-copy:hover { background: #f3f4f6; }
  .btn-retry {
    border-color: #e53e3e;
    color: #e53e3e;
  }
  .btn-retry:hover { background: #fff5f5; }

  .error-msg {
    color: #e53e3e;
    font-size: 13px;
    background: #fff5f5;
    border-radius: 6px;
    padding: 8px 10px;
  }
`;
  function render() {
    if (!shadowRoot) return;
    const existing = shadowRoot.getElementById("panel");
    if (existing) existing.remove();
    const panel = document.createElement("div");
    panel.id = "panel";
    const quote = document.createElement("div");
    quote.className = "quote";
    quote.textContent = truncateQuote(state.selection);
    panel.appendChild(quote);
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "actions";
    for (const action of ACTIONS) {
      const btn = document.createElement("button");
      btn.className = "btn-action";
      btn.textContent = ACTION_LABELS[action];
      btn.disabled = state.isLoading;
      btn.addEventListener("click", () => sendAction(action));
      actionsDiv.appendChild(btn);
    }
    panel.appendChild(actionsDiv);
    const queryRow = document.createElement("div");
    queryRow.className = "query-row";
    const queryInput = document.createElement("input");
    queryInput.id = "query-input";
    queryInput.type = "text";
    queryInput.placeholder = "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u043E\u043F\u0440\u043E\u0441";
    queryInput.disabled = state.isLoading;
    queryInput.setAttribute("aria-label", "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u043E\u043F\u0440\u043E\u0441");
    queryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSendQuery();
    });
    queryRow.appendChild(queryInput);
    const sendBtn = document.createElement("button");
    sendBtn.className = "btn-send";
    sendBtn.textContent = "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C";
    sendBtn.disabled = state.isLoading;
    sendBtn.addEventListener("click", handleSendQuery);
    queryRow.appendChild(sendBtn);
    panel.appendChild(queryRow);
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.id = "query-hint";
    hint.style.display = "none";
    hint.textContent = "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u043E\u043F\u0440\u043E\u0441";
    panel.appendChild(hint);
    if (state.isLoading) {
      const loader = document.createElement("div");
      loader.className = "loader";
      const spinner = document.createElement("div");
      spinner.className = "spinner";
      loader.appendChild(spinner);
      loader.appendChild(document.createTextNode("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026"));
      panel.appendChild(loader);
    }
    if (state.messages.length > 0) {
      const responseArea = document.createElement("div");
      responseArea.className = "response-area";
      const messagesDiv = document.createElement("div");
      messagesDiv.className = "messages";
      for (const msg of state.messages) {
        const msgEl = document.createElement("div");
        msgEl.className = msg.role === "user" ? "msg-user" : "msg-assistant";
        msgEl.textContent = msg.content;
        messagesDiv.appendChild(msgEl);
      }
      responseArea.appendChild(messagesDiv);
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg?.role === "assistant") {
        const responseActions = document.createElement("div");
        responseActions.className = "response-actions";
        const copyBtn = document.createElement("button");
        copyBtn.className = "btn-copy";
        copyBtn.id = "btn-copy";
        copyBtn.textContent = "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C";
        copyBtn.addEventListener("click", () => copyResponse(lastMsg.content));
        responseActions.appendChild(copyBtn);
        responseArea.appendChild(responseActions);
      }
      panel.appendChild(responseArea);
    }
    if (state.error) {
      const errDiv = document.createElement("div");
      errDiv.className = "error-msg";
      errDiv.textContent = state.error;
      panel.appendChild(errDiv);
      if (state.error !== "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 API-\u043A\u043B\u044E\u0447 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F") {
        const retryBtn = document.createElement("button");
        retryBtn.className = "btn-retry";
        retryBtn.textContent = "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C";
        retryBtn.addEventListener("click", retryRequest);
        panel.appendChild(retryBtn);
      }
    }
    shadowRoot.appendChild(panel);
  }
  function sendAction(action) {
    if (state.isLoading) return;
    const req = {
      selection: state.selection,
      messages: state.messages,
      action
    };
    lastRequest = req;
    dispatchRequest(req);
  }
  function handleSendQuery() {
    const input = shadowRoot?.getElementById("query-input");
    const query = input?.value.trim() ?? "";
    sendQuery(query, input);
  }
  function sendQuery(query, inputEl) {
    if (state.isLoading) return;
    if (!query) {
      const hint = shadowRoot?.getElementById("query-hint");
      if (hint) hint.style.display = "block";
      return;
    }
    const req = {
      selection: state.selection,
      messages: state.messages,
      query
    };
    lastRequest = req;
    if (inputEl) inputEl.value = "";
    dispatchRequest(req);
  }
  function copyResponse(content) {
    navigator.clipboard.writeText(content).then(() => {
      const btn = shadowRoot?.getElementById("btn-copy");
      if (!btn) return;
      btn.textContent = "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E";
      setTimeout(() => {
        if (btn) btn.textContent = "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C";
      }, 2e3);
    }).catch(() => {
    });
  }
  function retryRequest() {
    if (!lastRequest) return;
    dispatchRequest(lastRequest);
  }
  function dispatchRequest(req) {
    state = { ...state, isLoading: true, error: null };
    render();
    const message = { type: "AI_REQUEST", payload: req };
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        state = {
          ...state,
          isLoading: false,
          error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437"
        };
        render();
        return;
      }
      const payload = response?.payload;
      if (!payload) {
        state = {
          ...state,
          isLoading: false,
          error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437"
        };
        render();
        return;
      }
      if (payload.ok) {
        const userContent = req.query ?? (req.action ? `[${req.action}]` : "");
        const newMessages = [
          ...state.messages,
          ...userContent ? [{ role: "user", content: userContent }] : [],
          { role: "assistant", content: payload.content }
        ];
        const trimmed = newMessages.slice(-MAX_DIALOG_DEPTH * 2);
        state = {
          ...state,
          messages: trimmed,
          isLoading: false,
          error: null
        };
      } else {
        state = {
          ...state,
          isLoading: false,
          error: payload.message
        };
      }
      render();
    });
  }
  function mountPanel(selection) {
    state = {
      selection: selection.text,
      messages: [],
      isLoading: false,
      error: null
    };
    lastRequest = null;
    unmountPanel();
    const host = document.createElement("div");
    host.id = PANEL_HOST_ID;
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });
    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    shadowRoot.appendChild(styleEl);
    render();
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOutsideClick, true);
  }
  function unmountPanel() {
    const host = document.getElementById(PANEL_HOST_ID);
    if (host) host.remove();
    shadowRoot = null;
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("mousedown", handleOutsideClick, true);
  }
  function handleKeyDown(e) {
    if (e.key === "Escape") unmountPanel();
  }
  function handleOutsideClick(e) {
    const host = document.getElementById(PANEL_HOST_ID);
    if (host && !host.contains(e.target)) {
      unmountPanel();
    }
  }

  // src/content.ts
  var ICON_ID = "context-ai-trigger-icon";
  var ICON_SIZE = 32;
  var ICON_OFFSET = 6;
  var triggerIconEl = null;
  var showIconTimer = null;
  function getSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const text = sel.toString();
    if (!text || text.length === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return { text, rect };
  }
  function showTriggerIcon(rect) {
    if (!triggerIconEl) {
      triggerIconEl = document.createElement("div");
      triggerIconEl.id = ICON_ID;
      triggerIconEl.setAttribute("role", "button");
      triggerIconEl.setAttribute("aria-label", "Context AI Assistant");
      triggerIconEl.setAttribute("tabindex", "0");
      applyIconStyles(triggerIconEl);
      document.body.appendChild(triggerIconEl);
    }
    const x = rect.right + window.scrollX + ICON_OFFSET;
    const y = rect.bottom + window.scrollY + ICON_OFFSET;
    triggerIconEl.style.left = `${x}px`;
    triggerIconEl.style.top = `${y}px`;
    triggerIconEl.style.display = "flex";
  }
  function hideTriggerIcon() {
    if (triggerIconEl) {
      triggerIconEl.remove();
      triggerIconEl = null;
    }
  }
  function openPanel(selection) {
    hideTriggerIcon();
    mountPanel(selection);
  }
  function closePanel() {
    unmountPanel();
  }
  function applyIconStyles(el) {
    Object.assign(el.style, {
      position: "absolute",
      width: `${ICON_SIZE}px`,
      height: `${ICON_SIZE}px`,
      borderRadius: "50%",
      background: "#4F46E5",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      zIndex: "2147483647",
      // max z-index, above all page content (req 1.4)
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      fontSize: "18px",
      userSelect: "none",
      pointerEvents: "auto"
    });
    el.textContent = "\u2726";
    el.addEventListener("click", () => {
      const selection = getSelection();
      if (selection) {
        openPanel(selection);
      }
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const selection = getSelection();
        if (selection) {
          openPanel(selection);
        }
      }
    });
  }
  function shouldShowIcon(textLength) {
    return textLength >= 1 && textLength <= MAX_SELECTION_LENGTH;
  }
  function handleMouseUp() {
    if (showIconTimer !== null) {
      clearTimeout(showIconTimer);
      showIconTimer = null;
    }
    showIconTimer = setTimeout(() => {
      showIconTimer = null;
      const state2 = getSelection();
      if (!state2) {
        hideTriggerIcon();
        return;
      }
      if (!shouldShowIcon(state2.text.length)) {
        hideTriggerIcon();
        return;
      }
      showTriggerIcon(state2.rect);
    }, 300);
  }
  function handleSelectionChange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().length === 0) {
      if (showIconTimer !== null) {
        clearTimeout(showIconTimer);
        showIconTimer = null;
      }
      hideTriggerIcon();
    }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", handleSelectionChange);
  }
})();
