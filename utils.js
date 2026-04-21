/* ── utils.js ─────────────────────────────────────────
   Shared Utility Functions
   ─────────────────────────────────────────────────── */

/**
 * showToast(msg) — displays a temporary toast notification.
 * Requires an element with id="toast" in the DOM.
 */
let toastTimer = null;
function showToast(msg) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;
  
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

/**
 * enterApp() — dismisses the landing overlay and reveals the dashboard.
 * Called by CTA buttons and authentication success listeners.
 */
function enterApp() {
  const overlay = document.getElementById('landing-overlay');
  if (!overlay) return;
  
  overlay.classList.add('hidden');
  
  // Remove from DOM after animation completes so it doesn't block interaction
  overlay.addEventListener('animationend', () => {
    overlay.remove();
    // Initialise the app the first time if not already done
    if (!window._appInitialised && typeof init === 'function') {
      window._appInitialised = true;
      init();
    }
  }, { once: true });
}
