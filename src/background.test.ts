import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { buildMessages, getApiKey, saveApiKey, clearApiKey, handleAIRequest } from './background';
import { AIRequest, Action, Message } from './types';
import { SYSTEM_PROMPTS, MAX_DIALOG_DEPTH } from './types';

// --- Chrome API mock ---

const storageMock: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storageMock[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(storageMock, obj);
      }),
      remove: vi.fn(async (key: string) => {
        delete storageMock[key];
      }),
    },
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
  },
});

beforeEach(() => {
  Object.keys(storageMock).forEach((k) => delete storageMock[k]);
  vi.clearAllMocks();
});

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('buildMessages', () => {
  it('includes system prompt for action', () => {
    const req: AIRequest = { selection: 'hello', messages: [], action: 'explain' };
    const msgs = buildMessages(req);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe(SYSTEM_PROMPTS.explain);
  });

  it('includes selection as first user message', () => {
    const req: AIRequest = { selection: 'some text', messages: [], action: 'summarize' };
    const msgs = buildMessages(req);
    expect(msgs[1]).toEqual({ role: 'user', content: 'some text' });
  });

  it('appends query as last user message when present', () => {
    const req: AIRequest = { selection: 'ctx', messages: [], query: 'what does this mean?' };
    const msgs = buildMessages(req);
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: 'what does this mean?' });
  });

  it('caps dialog history at MAX_DIALOG_DEPTH * 2 messages', () => {
    const history: Message[] = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg ${i}`,
    }));
    const req: AIRequest = { selection: 'ctx', messages: history };
    const msgs = buildMessages(req);
    // system + selection + up to MAX_DIALOG_DEPTH*2 history messages
    const historyInMsgs = msgs.slice(2);
    expect(historyInMsgs.length).toBeLessThanOrEqual(MAX_DIALOG_DEPTH * 2);
  });
});

describe('storage helpers', () => {
  it('saveApiKey / getApiKey round-trip', async () => {
    await saveApiKey('sk-test-key');
    const key = await getApiKey();
    expect(key).toBe('sk-test-key');
  });

  it('clearApiKey removes the key', async () => {
    await saveApiKey('sk-test-key');
    await clearApiKey();
    const key = await getApiKey();
    expect(key).toBeNull();
  });

  it('getApiKey returns null when nothing stored', async () => {
    const key = await getApiKey();
    expect(key).toBeNull();
  });
});

describe('handleAIRequest — no API key', () => {
  it('returns AIError when key is missing', async () => {
    const req: AIRequest = { selection: 'text', messages: [], action: 'explain' };
    const result = await handleAIRequest(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('API-ключ');
    }
  });
});

describe('handleAIRequest — fetch errors', () => {
  it('returns AIError on network failure', async () => {
    await saveApiKey('sk-test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const req: AIRequest = { selection: 'text', messages: [], action: 'explain' };
    const result = await handleAIRequest(req);
    expect(result.ok).toBe(false);
  });

  it('returns AIError on non-ok HTTP response', async () => {
    await saveApiKey('sk-test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const req: AIRequest = { selection: 'text', messages: [], action: 'explain' };
    const result = await handleAIRequest(req);
    expect(result.ok).toBe(false);
  });
});

// ─── Property-based tests ─────────────────────────────────────────────────────

describe('Property 5: action request building', () => {
  it('system message matches action, user message contains selection', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Action>('explain', 'summarize', 'elaborate'),
        fc.string({ minLength: 1 }),
        (action, selection) => {
          const req: AIRequest = { selection, messages: [], action };
          const msgs = buildMessages(req);
          expect(msgs[0].role).toBe('system');
          expect(msgs[0].content).toBe(SYSTEM_PROMPTS[action]);
          expect(msgs[1]).toEqual({ role: 'user', content: selection });
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 7: query request contains selection and query', () => {
  it('both selection and query appear in messages', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (selection, query) => {
          const req: AIRequest = { selection, messages: [], query };
          const msgs = buildMessages(req);
          const contents = msgs.map((m) => m.content);
          expect(contents).toContain(selection);
          expect(contents).toContain(query);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 11: API key round-trip', () => {
  it('saved key is returned by getApiKey', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (key) => {
        await saveApiKey(key);
        const retrieved = await getApiKey();
        expect(retrieved).toBe(key);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 13: dialog context includes history', () => {
  it('all history messages appear in built messages', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: fc.constantFrom<'user' | 'assistant'>('user', 'assistant'),
            content: fc.string({ minLength: 1 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (history) => {
          const req: AIRequest = { selection: 'ctx', messages: history, query: 'follow-up' };
          const msgs = buildMessages(req);
          for (const h of history) {
            expect(msgs.some((m) => m.content === h.content)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 14: dialog depth invariant', () => {
  it('history in built messages never exceeds MAX_DIALOG_DEPTH pairs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (n) => {
          const history: Message[] = Array.from({ length: n * 2 }, (_, i) => ({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `msg ${i}`,
          }));
          const req: AIRequest = { selection: 'ctx', messages: history };
          const msgs = buildMessages(req);
          // subtract system message + selection message
          const historyMsgs = msgs.slice(2);
          expect(historyMsgs.length).toBeLessThanOrEqual(MAX_DIALOG_DEPTH * 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
