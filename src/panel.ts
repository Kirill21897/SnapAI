import {
  SelectionState,
  PanelState,
  Action,
  Message,
  AIRequest,
  AIResponse,
  AIError,
  RequestMessage,
  MAX_QUOTE_LENGTH,
  MAX_DIALOG_DEPTH,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

const PANEL_HOST_ID = 'context-ai-panel-host';

const ACTION_LABELS: Record<Action, string> = {
  explain:   'Объяснить',
  summarize: 'Резюмировать',
  elaborate: 'Разобрать подробнее',
};

const ACTIONS: Action[] = ['explain', 'summarize', 'elaborate'];

// ─── Quote truncation (req 2.2) ───────────────────────────────────────────────

export function truncateQuote(text: string): string {
  if (text.length <= MAX_QUOTE_LENGTH) return text;
  return text.slice(0, MAX_QUOTE_LENGTH) + '…';
}

// ─── Module-level state ───────────────────────────────────────────────────────

let state: PanelState = {
  selection: '',
  messages: [],
  isLoading: false,
  error: null,
};

/** The last request sent — used for retry (req 5.3). */
let lastRequest: AIRequest | null = null;

/** Shadow root reference for re-renders. */
let shadowRoot: ShadowRoot | null = null;

// ─── Styles ───────────────────────────────────────────────────────────────────

const STYLES = `
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

// ─── Render ───────────────────────────────────────────────────────────────────

function render(): void {
  if (!shadowRoot) return;

  // Clear previous content (keep style tag)
  const existing = shadowRoot.getElementById('panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'panel';

  // Quote (req 2.2)
  const quote = document.createElement('div');
  quote.className = 'quote';
  quote.textContent = truncateQuote(state.selection);
  panel.appendChild(quote);

  // Action buttons (req 2.3)
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'actions';
  for (const action of ACTIONS) {
    const btn = document.createElement('button');
    btn.className = 'btn-action';
    btn.textContent = ACTION_LABELS[action];
    btn.disabled = state.isLoading;
    btn.addEventListener('click', () => sendAction(action));
    actionsDiv.appendChild(btn);
  }
  panel.appendChild(actionsDiv);

  // Query row (req 2.4, 4.2, 4.3, 8.1)
  const queryRow = document.createElement('div');
  queryRow.className = 'query-row';

  const queryInput = document.createElement('input');
  queryInput.id = 'query-input';
  queryInput.type = 'text';
  queryInput.placeholder = 'Введите вопрос';
  queryInput.disabled = state.isLoading;
  queryInput.setAttribute('aria-label', 'Введите вопрос');
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendQuery();
  });
  queryRow.appendChild(queryInput);

  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn-send';
  sendBtn.textContent = 'Отправить';
  sendBtn.disabled = state.isLoading;
  sendBtn.addEventListener('click', handleSendQuery);
  queryRow.appendChild(sendBtn);

  panel.appendChild(queryRow);

  // Empty query hint (req 4.2) — shown via aria-describedby / inline hint
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.id = 'query-hint';
  hint.style.display = 'none';
  hint.textContent = 'Введите вопрос';
  panel.appendChild(hint);

  // Loading indicator (req 3.4)
  if (state.isLoading) {
    const loader = document.createElement('div');
    loader.className = 'loader';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    loader.appendChild(spinner);
    loader.appendChild(document.createTextNode('Загрузка…'));
    panel.appendChild(loader);
  }

  // Messages / Response area (req 4.4, 6.1)
  if (state.messages.length > 0) {
    const responseArea = document.createElement('div');
    responseArea.className = 'response-area';

    const messagesDiv = document.createElement('div');
    messagesDiv.className = 'messages';

    for (const msg of state.messages) {
      const msgEl = document.createElement('div');
      msgEl.className = msg.role === 'user' ? 'msg-user' : 'msg-assistant';
      msgEl.textContent = msg.content;
      messagesDiv.appendChild(msgEl);
    }
    responseArea.appendChild(messagesDiv);

    // Copy button (req 6.1, 6.2, 6.3) — show when last message is assistant
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg?.role === 'assistant') {
      const responseActions = document.createElement('div');
      responseActions.className = 'response-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-copy';
      copyBtn.id = 'btn-copy';
      copyBtn.textContent = 'Копировать';
      copyBtn.addEventListener('click', () => copyResponse(lastMsg.content));
      responseActions.appendChild(copyBtn);

      responseArea.appendChild(responseActions);
    }

    panel.appendChild(responseArea);
  }

  // Error message (req 5.1, 5.2, 5.4)
  if (state.error) {
    const errDiv = document.createElement('div');
    errDiv.className = 'error-msg';
    errDiv.textContent = state.error;
    panel.appendChild(errDiv);

    // Retry button (req 5.2) — only for generic errors, not "no API key"
    if (state.error !== 'Добавьте API-ключ в настройках расширения') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn-retry';
      retryBtn.textContent = 'Повторить';
      retryBtn.addEventListener('click', retryRequest);
      panel.appendChild(retryBtn);
    }
  }

  shadowRoot.appendChild(panel);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export function sendAction(action: Action): void {
  if (state.isLoading) return;

  const req: AIRequest = {
    selection: state.selection,
    messages: state.messages,
    action,
  };
  lastRequest = req;
  dispatchRequest(req);
}

function handleSendQuery(): void {
  const input = shadowRoot?.getElementById('query-input') as HTMLInputElement | null;
  const query = input?.value.trim() ?? '';
  sendQuery(query, input);
}

export function sendQuery(query: string, inputEl?: HTMLInputElement | null): void {
  if (state.isLoading) return;

  // Show hint if empty (req 4.2)
  if (!query) {
    const hint = shadowRoot?.getElementById('query-hint') as HTMLElement | null;
    if (hint) hint.style.display = 'block';
    return;
  }

  const req: AIRequest = {
    selection: state.selection,
    messages: state.messages,
    query,
  };
  lastRequest = req;

  // Clear input
  if (inputEl) inputEl.value = '';

  dispatchRequest(req);
}

export function copyResponse(content: string): void {
  navigator.clipboard.writeText(content).then(() => {
    const btn = shadowRoot?.getElementById('btn-copy') as HTMLButtonElement | null;
    if (!btn) return;
    btn.textContent = 'Скопировано';
    setTimeout(() => {
      if (btn) btn.textContent = 'Копировать';
    }, 2000);
  }).catch(() => {
    // Silently ignore copy errors (per error handling table)
  });
}

function retryRequest(): void {
  if (!lastRequest) return;
  dispatchRequest(lastRequest);
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function dispatchRequest(req: AIRequest): void {
  state = { ...state, isLoading: true, error: null };
  render();

  const message: RequestMessage = { type: 'AI_REQUEST', payload: req };

  chrome.runtime.sendMessage(message, (response: { type: string; payload: AIResponse | AIError }) => {
    if (chrome.runtime.lastError) {
      state = {
        ...state,
        isLoading: false,
        error: 'Не удалось получить ответ. Попробуйте ещё раз',
      };
      render();
      return;
    }

    const payload = response?.payload;
    if (!payload) {
      state = {
        ...state,
        isLoading: false,
        error: 'Не удалось получить ответ. Попробуйте ещё раз',
      };
      render();
      return;
    }

    if (payload.ok) {
      // Append user message + assistant response to history
      const userContent = req.query ?? (req.action ? `[${req.action}]` : '');
      const newMessages: Message[] = [
        ...state.messages,
        ...(userContent ? [{ role: 'user' as const, content: userContent }] : []),
        { role: 'assistant' as const, content: payload.content },
      ];

      // Enforce MAX_DIALOG_DEPTH (req 8.3): keep last N pairs
      const trimmed = newMessages.slice(-MAX_DIALOG_DEPTH * 2);

      state = {
        ...state,
        messages: trimmed,
        isLoading: false,
        error: null,
      };
    } else {
      state = {
        ...state,
        isLoading: false,
        error: payload.message,
      };
    }

    render();
  });
}

// ─── Mount / Unmount ──────────────────────────────────────────────────────────

/**
 * Mounts the panel into a Shadow DOM host appended to document.body.
 * Called by content.ts when the trigger icon is clicked.
 */
export function mountPanel(selection: SelectionState): void {
  // Reset state for new session
  state = {
    selection: selection.text,
    messages: [],
    isLoading: false,
    error: null,
  };
  lastRequest = null;

  // Remove any existing panel
  unmountPanel();

  const host = document.createElement('div');
  host.id = PANEL_HOST_ID;
  document.body.appendChild(host);

  shadowRoot = host.attachShadow({ mode: 'open' });

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  shadowRoot.appendChild(styleEl);

  render();

  // Close on Escape (req 2.5)
  document.addEventListener('keydown', handleKeyDown);

  // Close on outside click (req 2.6)
  document.addEventListener('mousedown', handleOutsideClick, true);
}

/**
 * Removes the panel from the DOM and cleans up listeners.
 */
export function unmountPanel(): void {
  const host = document.getElementById(PANEL_HOST_ID);
  if (host) host.remove();
  shadowRoot = null;

  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('mousedown', handleOutsideClick, true);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') unmountPanel();
}

function handleOutsideClick(e: MouseEvent): void {
  const host = document.getElementById(PANEL_HOST_ID);
  if (host && !host.contains(e.target as Node)) {
    unmountPanel();
  }
}
