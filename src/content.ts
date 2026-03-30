import { SelectionState, MAX_SELECTION_LENGTH } from './types';
import { mountPanel, unmountPanel } from './panel';

// --- Icon element ---

const ICON_ID = 'context-ai-trigger-icon';
const ICON_SIZE = 32;
const ICON_OFFSET = 6; // px gap below/right of selection

let triggerIconEl: HTMLElement | null = null;
let showIconTimer: ReturnType<typeof setTimeout> | null = null;

// --- Exported functions ---

/**
 * Reads window.getSelection() and returns SelectionState or null.
 * Returns null if selection is empty or collapsed.
 */
export function getSelection(): SelectionState | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const text = sel.toString();
  if (!text || text.length === 0) return null;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Ignore zero-size rects (e.g. programmatic selections with no visual range)
  if (rect.width === 0 && rect.height === 0) return null;

  return { text, rect };
}

/**
 * Creates (or repositions) the floating trigger icon near the selection.
 * Positioned at the bottom-right of the selection rect (req 1.4).
 */
export function showTriggerIcon(rect: DOMRect): void {
  if (!triggerIconEl) {
    triggerIconEl = document.createElement('div');
    triggerIconEl.id = ICON_ID;
    triggerIconEl.setAttribute('role', 'button');
    triggerIconEl.setAttribute('aria-label', 'Context AI Assistant');
    triggerIconEl.setAttribute('tabindex', '0');
    applyIconStyles(triggerIconEl);
    document.body.appendChild(triggerIconEl);
  }

  // Position: bottom-right of selection, offset so it doesn't overlap text (req 1.4)
  const x = rect.right + window.scrollX + ICON_OFFSET;
  const y = rect.bottom + window.scrollY + ICON_OFFSET;

  triggerIconEl.style.left = `${x}px`;
  triggerIconEl.style.top = `${y}px`;
  triggerIconEl.style.display = 'flex';
}

/**
 * Hides and removes the trigger icon from the DOM.
 */
export function hideTriggerIcon(): void {
  if (triggerIconEl) {
    triggerIconEl.remove();
    triggerIconEl = null;
  }
}

/**
 * Mounts the Panel in a Shadow DOM host appended to document.body.
 * Passes the selection state to the panel for display.
 */
export function openPanel(selection: SelectionState): void {
  hideTriggerIcon();
  mountPanel(selection);
}

/**
 * Unmounts the Panel by removing the Shadow DOM host.
 */
export function closePanel(): void {
  unmountPanel();
}

// --- Internal helpers ---

function applyIconStyles(el: HTMLElement): void {
  Object.assign(el.style, {
    position: 'absolute',
    width: `${ICON_SIZE}px`,
    height: `${ICON_SIZE}px`,
    borderRadius: '50%',
    background: '#4F46E5',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: '2147483647', // max z-index, above all page content (req 1.4)
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    fontSize: '18px',
    userSelect: 'none',
    pointerEvents: 'auto',
  });
  el.textContent = '✦';

  // Wire up click: open panel with current selection (req 2.1)
  el.addEventListener('click', () => {
    const selection = getSelection();
    if (selection) {
      openPanel(selection);
    }
  });

  // Also support keyboard activation (Enter/Space) for accessibility
  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const selection = getSelection();
      if (selection) {
        openPanel(selection);
      }
    }
  });
}

/**
 * Determines whether the icon should be shown for a given text length.
 * Exported for testability (Properties 1, 2).
 */
export function shouldShowIcon(textLength: number): boolean {
  return textLength >= 1 && textLength <= MAX_SELECTION_LENGTH;
}

// --- Event listeners ---

function handleMouseUp(): void {
  if (showIconTimer !== null) {
    clearTimeout(showIconTimer);
    showIconTimer = null;
  }

  // Use a short delay (≤ 300 ms) to let the browser finalise the selection
  showIconTimer = setTimeout(() => {
    showIconTimer = null;
    const state = getSelection();

    if (!state) {
      hideTriggerIcon();
      return;
    }

    if (!shouldShowIcon(state.text.length)) {
      // Selection > 10 000 chars: hide icon (req 1.3)
      hideTriggerIcon();
      return;
    }

    showTriggerIcon(state.rect);
  }, 300);
}

function handleSelectionChange(): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.toString().length === 0) {
    // Selection cleared — hide icon immediately (req 1.2)
    if (showIconTimer !== null) {
      clearTimeout(showIconTimer);
      showIconTimer = null;
    }
    hideTriggerIcon();
  }
}

// Only attach listeners when running in a real browser context
if (typeof document !== 'undefined') {
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('selectionchange', handleSelectionChange);
}
