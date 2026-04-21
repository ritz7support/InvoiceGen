/* ── auth.js ─────────────────────────────────────────
   Supabase Authentication & Landing Page Logic
   Load order in HTML: supabase CDN → auth.js → app.js
   ─────────────────────────────────────────────────── */

console.log('[auth] auth.js loaded ✓');

const SUPABASE_URL      = 'https://jqnmeiwwaoyzngjgiwyb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impxbm1laXd3YW95em5namdpd3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDg2NzQsImV4cCI6MjA5MTEyNDY3NH0.YTbQsGH-gs0NqT4LaZ40JPoB5i3N4h1zNnU-qgEdiM8';

// ── Initialise Supabase client ──────────────────────────────
// CRITICAL: Save the SDK module reference BEFORE declaring `var supabase = null`,
// because `var` at top-level IS window-property, so `var supabase = null`
// would immediately clobber window.supabase (the CDN module).
var _supabaseSdkModule = window.supabase || window.supabaseJs || null;
var supabase = null; // our client — starts null until createClient succeeds

function _initSupabase() {
  try {
    var sdkNamespace = null;

    // Check saved module first, then re-check window in case CDN loaded late
    if (_supabaseSdkModule && typeof _supabaseSdkModule.createClient === 'function') {
      sdkNamespace = _supabaseSdkModule;
    } else if (window._supabase && typeof window._supabase.createClient === 'function') {
      sdkNamespace = window._supabase;
    } else if (window.supabaseJs && typeof window.supabaseJs.createClient === 'function') {
      sdkNamespace = window.supabaseJs;
    }

    console.log('[auth] SDK namespace found:', !!sdkNamespace,
                '| _supabaseSdkModule type:', typeof _supabaseSdkModule);

    if (sdkNamespace) {
      supabase = sdkNamespace.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.supabase = supabase; // expose client on window for app.js
      console.log('[auth] Supabase client ready ✓');
      _attachAuthStateListener();
    } else {
      console.warn('[auth] Supabase SDK not found — will retry after DOMContentLoaded.');
    }
  } catch (e) {
    console.error('[auth] Supabase init failed:', e);
  }
}

_initSupabase();

// Retry once after DOM is ready in case the CDN script loaded late
if (!supabase) {
  document.addEventListener('DOMContentLoaded', function () {
    if (!supabase) {
      console.log('[auth] Retrying Supabase init after DOMContentLoaded...');
      _initSupabase();
    }
  });
}

/* ══════════════════════ TOAST ═════════════════════════════ */
window.showToast = function (msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3500);
};

/* ══════════════════════ ENTER APP ═════════════════════════ */
window.enterApp = function () {
  var overlay = document.getElementById('landing-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    // Remove from layout after the CSS exit animation (~500 ms)
    setTimeout(function () {
      if (overlay.classList.contains('hidden')) overlay.style.display = 'none';
    }, 550);
  }
  // Boot the invoice app only once
  if (!window._appInitialised && typeof init === 'function') {
    window._appInitialised = true;
    init();
  }
};

/* ══════════════════════ AUTH MODAL ════════════════════════ */
var isSignUpMode = false;

function getAuthRefs() {
  return {
    modal:      document.getElementById('auth-modal'),
    form:       document.getElementById('auth-form'),
    email:      document.getElementById('auth-email'),
    password:   document.getElementById('auth-password'),
    title:      document.getElementById('auth-title'),
    subtitle:   document.getElementById('auth-subtitle'),
    submitBtn:  document.getElementById('auth-submit-btn'),
    switchText: document.getElementById('auth-switch-text'),
    toggleBtn:  document.getElementById('auth-toggle-btn'),
    googleBtn:  document.getElementById('auth-google-btn'),
    signoutBtn: document.getElementById('signout-btn'),
  };
}

function updateAuthModeUI() {
  var r = getAuthRefs();
  if (!r.title) return;
  if (isSignUpMode) {
    r.title.textContent      = 'Create Account';
    r.subtitle.textContent   = 'Sign up to save and sync your invoices to the cloud.';
    r.submitBtn.textContent  = 'Create Account';
    r.switchText.textContent = 'Already have an account?';
    if (r.toggleBtn) r.toggleBtn.textContent = 'Sign In';
  } else {
    r.title.textContent      = 'Welcome Back';
    r.subtitle.textContent   = 'Sign in to access and manage your invoices.';
    r.submitBtn.textContent  = 'Sign In';
    r.switchText.textContent = "Don't have an account?";
    if (r.toggleBtn) r.toggleBtn.textContent = 'Sign Up';
  }
}

// ── Open modal (optionally force mode: 'signin' | 'signup') ──
window.openAuthModal = function (mode) {
  if (mode === 'signup') isSignUpMode = true;
  else                   isSignUpMode = false;
  updateAuthModeUI();

  var r = getAuthRefs();
  if (!r.modal) { console.error('[auth] #auth-modal not found in DOM'); return; }

  // 1. Remove .hidden so element participates in layout again
  r.modal.classList.remove('hidden');
  // 2. Yield one frame so the browser registers it as visible,
  //    then add .show which triggers the opacity/visibility transition
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      r.modal.classList.add('show');
    });
  });
};

window.closeAuthModal = function () {
  var r = getAuthRefs();
  if (!r.modal) return;
  r.modal.classList.remove('show');
  // Re-hide after transition (matches var(--t-base) = 0.25s)
  setTimeout(function () { r.modal.classList.add('hidden'); }, 300);
};

window.toggleAuthMode = function () {
  isSignUpMode = !isSignUpMode;
  updateAuthModeUI();
  var r = getAuthRefs();
  if (r.form) r.form.reset();
};

window.requireAuthToEnter = async function () {
  if (!supabase) { enterApp(); return; }         // no auth → let user in
  try {
    var res = await supabase.auth.getSession();
    if (res.data && res.data.session) {
      enterApp();
    } else {
      isSignUpMode = false;
      openAuthModal('signin');
    }
  } catch (e) {
    console.error('[auth] getSession error:', e);
    openAuthModal('signin');
  }
};

/* ══════════════════════ EMAIL / PASSWORD AUTH ════════════ */
window.handleAuthSubmit = async function (e) {
  if (e) e.preventDefault();
  if (!supabase) { showToast('Auth service unavailable.'); return; }

  var r        = getAuthRefs();
  var email    = r.email    ? r.email.value.trim() : '';
  var password = r.password ? r.password.value     : '';

  if (!email || !password) {
    showToast('Please enter your email and password.'); return;
  }

  r.submitBtn.disabled    = true;
  r.submitBtn.textContent = isSignUpMode ? 'Creating account…' : 'Signing in…';

  try {
    var result;
    if (isSignUpMode) {
      result = await supabase.auth.signUp({ email: email, password: password });
      if (result.error) throw result.error;
      showToast('✓ Check your inbox to confirm your account!');
      closeAuthModal();
    } else {
      result = await supabase.auth.signInWithPassword({ email: email, password: password });
      if (result.error) throw result.error;
      showToast('✓ Welcome back!');
      closeAuthModal();
      enterApp();
    }
  } catch (err) {
    showToast('⚠ ' + (err.message || 'Authentication failed.'));
  } finally {
    r.submitBtn.disabled = false;
    updateAuthModeUI();
  }
};

/* ══════════════════════ GOOGLE OAUTH ══════════════════════ */
window.signInWithGoogle = async function () {
  if (!supabase) { showToast('Auth service unavailable.'); return; }
  try {
    var redirectTo = window.location.origin + window.location.pathname;
    var result = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo }
    });
    if (result.error) throw result.error;
  } catch (err) {
    showToast('⚠ ' + (err.message || 'Google sign-in failed.'));
  }
};

/* ══════════════════════ SIGN OUT ══════════════════════════ */
window.signOut = async function () {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
    showToast('Signed out.');
    setTimeout(function () { window.location.reload(); }, 800);
  } catch (e) {
    showToast('Sign out failed. Please try again.');
  }
};

/* ══════════════════════ AUTH STATE LISTENER ══════════════ */
function _attachAuthStateListener() {
  if (!supabase) return;
  supabase.auth.onAuthStateChange(function (event, session) {
    var r         = getAuthRefs();
    var overlay   = document.getElementById('landing-overlay');
    var loginBtns = document.querySelectorAll(
      '#landing-signin-nav-btn, #landing-hero-signin-btn'
    );

    if (session) {
      if (r.signoutBtn) r.signoutBtn.style.display = 'inline-flex';
      loginBtns.forEach(function (b) { b.style.display = 'none'; });
      // Auto-enter if landing still visible (e.g. after OAuth redirect back)
      if (overlay && overlay.style.display !== 'none' &&
          !overlay.classList.contains('hidden')) {
        setTimeout(enterApp, 600);
      }
    } else {
      if (r.signoutBtn) r.signoutBtn.style.display = 'none';
      loginBtns.forEach(function (b) { b.style.removeProperty('display'); });
    }
  });
}
