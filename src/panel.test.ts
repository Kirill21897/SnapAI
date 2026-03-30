import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { truncateQuote } from './panel';
import { MAX_QUOTE_LENGTH } from './types';

// ─── Property 3: Quote truncation ────────────────────────────────────────────
// Validates: Requirements 2.2

describe('Property 3: quote truncation', () => {
  it('strings ≤ 300 chars are returned unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: MAX_QUOTE_LENGTH }),
        (text) => {
          expect(truncateQuote(text)).toBe(text);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('strings > 300 chars are truncated to 300 chars + ellipsis', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: MAX_QUOTE_LENGTH + 1, maxLength: MAX_QUOTE_LENGTH + 500 }),
        (text) => {
          const result = truncateQuote(text);
          expect(result.endsWith('…')).toBe(true);
          // The text before the ellipsis is exactly MAX_QUOTE_LENGTH chars
          expect(result.slice(0, MAX_QUOTE_LENGTH)).toBe(text.slice(0, MAX_QUOTE_LENGTH));
          // Total length: MAX_QUOTE_LENGTH chars + 1 ellipsis char
          expect([...result].length).toBe(MAX_QUOTE_LENGTH + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('boundary: exactly 300 chars — no truncation', () => {
    const text = 'a'.repeat(MAX_QUOTE_LENGTH);
    expect(truncateQuote(text)).toBe(text);
  });

  it('boundary: 301 chars — truncated with ellipsis', () => {
    const text = 'a'.repeat(MAX_QUOTE_LENGTH + 1);
    const result = truncateQuote(text);
    expect(result).toBe('a'.repeat(MAX_QUOTE_LENGTH) + '…');
  });
});

// ─── Unit tests for panel rendering ──────────────────────────────────────────

// We need to mock chrome and set up DOM before importing panel mount functions.
// panel.ts uses chrome.runtime.sendMessage and document.body.

const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    lastError: null as null | { message: string },
  },
};

vi.stubGlobal('chrome', chromeMock);

// Import after stubbing globals
import { mountPanel, unmountPanel, sendAction, sendQuery } from './panel';
import { SelectionState } from './types';

function makeSelection(text: string): SelectionState {
  return {
    text,
    rect: new DOMRect(0, 0, 100, 20),
  };
}

beforeEach(() => {
  // Clean up any mounted panel
  unmountPanel();
  vi.clearAllMocks();
  chromeMock.runtime.lastError = null;
  // Reset document body
  document.body.innerHTML = '';
});

// ─── Unit test 5.6: panel contains 3 action buttons and query field ───────────
// Validates: Requirements 2.3, 2.4

describe('Panel rendering', () => {
  it('contains three action buttons', () => {
    mountPanel(makeSelection('Hello world'));
    const host = document.getElementById('context-ai-panel-host');
    expect(host).not.toBeNull();
    const shadow = host!.shadowRoot!;
    const buttons = shadow.querySelectorAll('.btn-action');
    expect(buttons.length).toBe(3);
  });

  it('contains a query input field', () => {
    mountPanel(makeSelection('Hello world'));
    const host = document.getElementById('context-ai-panel-host');
    const shadow = host!.shadowRoot!;
    const input = shadow.getElementById('query-input');
    expect(input).not.toBeNull();
  });

  it('displays truncated quote for long selection', () => {
    const longText = 'x'.repeat(400);
    mountPanel(makeSelection(longText));
    const host = document.getElementById('context-ai-panel-host');
    const shadow = host!.shadowRoot!;
    const quote = shadow.querySelector('.quote');
    expect(quote?.textContent).toBe(truncateQuote(longText));
  });

  it('displays full quote for short selection', () => {
    const text = 'Short selection text';
    mountPanel(makeSelection(text));
    const host = document.getElementById('context-ai-panel-host');
    const shadow = host!.shadowRoot!;
    const quote = shadow.querySelector('.quote');
    expect(quote?.textContent).toBe(text);
  });
});

// ─── Unit test 5.7: empty query shows hint, does not send ────────────────────
// Validates: Requirements 4.2

describe('Empty query handling', () => {
  it('does not call chrome.runtime.sendMessage when query is empty', () => {
    mountPanel(makeSelection('some text'));
    sendQuery('');
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('shows hint element when query is empty', () => {
    mountPanel(makeSelection('some text'));
    sendQuery('');
    const host = document.getElementById('context-ai-panel-host');
    const shadow = host!.shadowRoot!;
    const hint = shadow.getElementById('query-hint') as HTMLElement | null;
    expect(hint?.style.display).toBe('block');
  });
});

// ─── Unit test 5.8: no API key message ───────────────────────────────────────
// Validates: Requirements 5.4

describe('No API key error message', () => {
  it('displays API key error message when service worker returns no-key error', () => {
    mountPanel(makeSelection('some text'));

    // Simulate service worker returning "no API key" error
    chromeMock.runtime.sendMessage.mockImplementation(
      (_msg: unknown, callback: (resp: unknown) => void) => {
        callback({
          type: 'AI_RESPONSE',
          payload: { ok: false, message: 'Добавьте API-ключ в настройках расширения' },
        });
      }
    );

    sendAction('explain');

    const host = document.getElementById('context-ai-panel-host');
    const shadow = host!.shadowRoot!;
    const errEl = shadow.querySelector('.error-msg');
    expect(errEl?.textContent).toContain('API-ключ');
  });

  it('does not show retry button for API key error', () => {
    mountPanel(makeSelection('some text'));

    chromeMock.runtime.sendMessage.mockImplementation(
      (_msg: unknown, callback: (resp: unknown) => void) => {
        callback({
          type: 'AI_RESPONSE',
          payload: { ok: false, message: 'Добавьте API-ключ в настройках расширения' },
        });
      }
    );

    sendAction('explain');

    const host = document.getElementById('context-ai-panel-host');
    const shadow = host!.shadowRoot!;
    const retryBtn = shadow.querySelector('.btn-retry');
    expect(retryBtn).toBeNull();
  });
});

// ─── Property 6: loading state blocks re-submission ──────────────────────────
// Validates: Requirements 3.4, 4.3

describe('Property 6: loading state blocks re-submission', () => {
  it('action buttons are disabled while loading', () => {
    mountPanel(makeSelection('test'));

    // sendMessage never calls back → panel stays in loading state
    chromeMock.runtime.sendMessage.mockImplementation(() => {
      // intentionally never calls callback
    });

    sendAction('explain');

    const host = document.getElementById('context-ai-panel-host');
    const shadow = host!.shadowRoot!;
    const buttons = shadow.querySelectorAll<HTMLButtonElement>('.btn-action');
    buttons.forEach((btn) => {
      expect(btn.disabled).toBe(true);
    });
  });

  it('send button is disabled while loading', () => {
    mountPanel(makeSelection('test'));

    chromeMock.runtime.sendMessage.mockImplementation(() => {
      // never calls back
    });

    sendAction('summarize');

    const host = document.getElementById('context-ai-panel-host');
    const shadow = host!.shadowRoot!;
    const sendBtn = shadow.querySelector<HTMLButtonElement>('.btn-send');
    expect(sendBtn?.disabled).toBe(true);
  });

  it('loading indicator is visible while loading', () => {
    mountPanel(makeSelection('test'));

    chromeMock.runtime.sendMessage.mockImplementation(() => {
      // never calls back
    });

    sendAction('elaborate');

    const host = document.getElementById('context-ai-panel-host');
    const shadow = host!.shadowRoot!;
    const loader = shadow.querySelector('.loader');
    expect(loader).not.toBeNull();
  });
});

// ─── Property 4: panel closes on dismiss events ───────────────────────────────
// Validates: Requirements 2.5, 2.6

describe('Property 4: panel dismiss', () => {
  it('closes on Escape key', () => {
    mountPanel(makeSelection('test'));
    expect(document.getElementById('context-ai-panel-host')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.getElementById('context-ai-panel-host')).toBeNull();
  });

  it('closes on outside click', () => {
    mountPanel(makeSelection('test'));
    expect(document.getElementById('context-ai-panel-host')).not.toBeNull();

    // Click on document body (outside the panel host)
    const outsideEl = document.createElement('div');
    document.body.appendChild(outsideEl);
    outsideEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(document.getElementById('context-ai-panel-host')).toBeNull();
  });

  it('does not close when clicking inside the panel host', () => {
    mountPanel(makeSelection('test'));
    const host = document.getElementById('context-ai-panel-host')!;

    host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(document.getElementById('context-ai-panel-host')).not.toBeNull();
  });
});

// ─── Property 10: copy round-trip ────────────────────────────────────────────
// Validates: Requirements 6.1, 6.2

describe('Property 10: copy round-trip', () => {
  it('clipboard receives exact response text after copy', async () => {
    // jsdom supports navigator.clipboard via mock
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn((text: string) => {
          written.push(text);
          return Promise.resolve();
        }),
      },
      writable: true,
      configurable: true,
    });

    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (responseText) => {
        written.length = 0;
        mountPanel(makeSelection('ctx'));

        // Simulate a successful AI response so copy button appears
        chromeMock.runtime.sendMessage.mockImplementation(
          (_msg: unknown, callback: (resp: unknown) => void) => {
            callback({
              type: 'AI_RESPONSE',
              payload: { ok: true, content: responseText },
            });
          }
        );

        sendAction('explain');

        // Trigger copy
        const host = document.getElementById('context-ai-panel-host');
        const shadow = host?.shadowRoot;
        const copyBtn = shadow?.getElementById('btn-copy') as HTMLButtonElement | null;
        copyBtn?.click();

        // Wait for clipboard promise
        await Promise.resolve();

        expect(written[written.length - 1]).toBe(responseText);

        unmountPanel();
      }),
      { numRuns: 50 }
    );
  });
});
