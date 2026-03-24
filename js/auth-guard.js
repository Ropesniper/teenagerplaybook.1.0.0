// ═══════════════════════════════════════════════════════════════
//  auth-guard.js  v1.0.0
//  Shared utilities loaded on every protected page.
//
//  WHAT THIS FILE PROVIDES:
//    getSession()            — read current session from storage
//    saveSession(data, bool) — write session after login/signup
//    requireAuth()           — redirect to login if not logged in
//    requireAdmin()          — redirect if not admin
//    logout()                — clear session + redirect to login
//    authFetch(url, opts)    — fetch() with auth header + 401 handling
//    getDashboardContext(type) — UI copy per account type
//    getAccountTypeLabel(type) — badge label per account type
//    saveSessionProgress / loadSessionProgress / clearSessionProgress
//    showPopup / closePopup / showToast
//
//  HOW TO ADD A NEW ACCOUNT TYPE:
//    1. Add string to ACCOUNT_TYPES in server.js
//    2. Add role card in signup.html
//    3. Add case in getDashboardContext() below
//    4. Add entry in ACCOUNT_TYPE_LABELS below
// ═══════════════════════════════════════════════════════════════

const API_BASE = 'https://teenagerplaybook-1-0-0.onrender.com';

// All storage keys in one place — never write 'tp_*' strings elsewhere
const SESSION_KEYS = ['tp_token', 'tp_token_expiry', 'tp_remember', 'tp_role', 'tp_user', 'tp_display', 'tp_accountType'];

// ─────────────────────────────────────────────────────────────
// SESSION READ / WRITE
// ─────────────────────────────────────────────────────────────

function getSession() {
  // Try remember-me (localStorage) first
  const lsToken  = localStorage.getItem('tp_token');
  const remember = localStorage.getItem('tp_remember');
  const expiry   = localStorage.getItem('tp_token_expiry');

  if (lsToken && remember === 'true' && expiry && Date.now() < parseInt(expiry, 10)) {
    return {
      token:       lsToken,
      role:        localStorage.getItem('tp_role')        || 'user',
      username:    localStorage.getItem('tp_user')        || '',
      displayName: localStorage.getItem('tp_display')     || localStorage.getItem('tp_user') || '',
      accountType: localStorage.getItem('tp_accountType') || 'teenager',
    };
  }

  // Clear stale remember-me if expired
  if (lsToken && remember === 'true') SESSION_KEYS.forEach(k => localStorage.removeItem(k));

  // Fall back to session storage (tab-only)
  const ssToken = sessionStorage.getItem('tp_token');
  if (ssToken) {
    return {
      token:       ssToken,
      role:        sessionStorage.getItem('tp_role')        || 'user',
      username:    sessionStorage.getItem('tp_user')        || '',
      displayName: sessionStorage.getItem('tp_display')     || sessionStorage.getItem('tp_user') || '',
      accountType: sessionStorage.getItem('tp_accountType') || 'teenager',
    };
  }

  return null;
}

function saveSession(data, rememberMe) {
  const write = rememberMe ? localStorage : sessionStorage;
  const clear = rememberMe ? sessionStorage : localStorage;

  SESSION_KEYS.forEach(k => clear.removeItem(k));

  write.setItem('tp_token',       data.token       || '');
  write.setItem('tp_role',        data.role        || 'user');
  write.setItem('tp_user',        data.username    || '');
  write.setItem('tp_display',     data.displayName || data.username || '');
  write.setItem('tp_accountType', data.accountType || 'teenager');

  if (rememberMe) {
    write.setItem('tp_token_expiry', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    write.setItem('tp_remember', 'true');
  }
}

// ─────────────────────────────────────────────────────────────
// AUTH GUARDS
// ─────────────────────────────────────────────────────────────

function requireAuth() {
  const sess = getSession();
  if (!sess) { window.location.replace('login.html'); return null; }
  return sess;
}

function requireAdmin() {
  const sess = requireAuth();
  if (sess && sess.role !== 'admin') { window.location.replace('dashboard.html'); return null; }
  return sess;
}

function logout() {
  SESSION_KEYS.forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
  window.location.replace('login.html');
}

// ─────────────────────────────────────────────────────────────
// AUTH FETCH
// fetch() wrapper that injects the Authorization header and
// handles session expiry (401) gracefully.
// Returns null on network error or 401.
// ─────────────────────────────────────────────────────────────

async function authFetch(url, options) {
  const sess = getSession();
  if (!sess) { window.location.replace('login.html'); return null; }

  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({}, opts.headers || {}, {
    'Authorization': 'Bearer ' + sess.token,
  });

  try {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      _showSessionExpiredPopup();
      return null;
    }
    return res;
  } catch (_) {
    return null; // Network error — let caller handle
  }
}

function _showSessionExpiredPopup() {
  if (document.getElementById('_sessionExpiredPopup')) return;
  const el = document.createElement('div');
  el.id = '_sessionExpiredPopup';
  // Fully inline-styled so it works on any page regardless of which CSS is loaded
  el.setAttribute('style', [
    'position:fixed','inset:0','z-index:99999',
    'background:rgba(0,0,0,0.78)',
    'display:flex','align-items:center','justify-content:center',
    'font-family:\'Libre Baskerville\',serif',
  ].join(';'));
  el.innerHTML = `
    <div style="background:#2a1508;border:2px solid #6b432a;border-radius:14px;
                padding:28px 30px;max-width:400px;width:92%;
                box-shadow:0 16px 50px rgba(0,0,0,0.8);">
      <p style="font-family:'Cinzel',serif;font-size:0.95rem;color:#d4a843;
                letter-spacing:0.05em;margin-bottom:8px;">Session Expired</p>
      <p style="font-size:0.86rem;color:#c8a87a;line-height:1.65;margin-bottom:20px;">
        Your session has expired. Please sign in again — your progress is saved.
      </p>
      <button onclick="logout()"
        style="background:linear-gradient(135deg,#c49a5a,#d4a843);border:none;
               border-radius:8px;padding:9px 22px;color:#1a0f08;
               font-family:'Cinzel',serif;font-size:0.82rem;
               letter-spacing:0.05em;cursor:pointer;">
        Sign In Again
      </button>
    </div>`;
  document.body.appendChild(el);
}

// ─────────────────────────────────────────────────────────────
// ACCOUNT TYPE CONTEXT
// Controls greeting, intro text, and note prompt on the dashboard.
// Add a new 'case' block for each new accountType.
// ─────────────────────────────────────────────────────────────

function getDashboardContext(accountType) {
  switch (accountType) {
    case 'parent':
      return {
        greeting:        'Welcome, Guide',
        intro:           'As a parent, you play the most important role in your child\'s growth. These sessions help you understand what your teenager is learning so you can practise together at home.',
        notePrompt:      'Message your guide',
        notePlaceholder: 'e.g. My child struggles with eye contact. Could you suggest exercises we can do together at home?',
      };
    case 'teacher':
      return {
        greeting:        'Welcome, Educator',
        intro:           'This platform supports your classroom. Each session module is designed to develop communication skills. Use the notes section to request resources tailored to your students.',
        notePrompt:      'Message the guide',
        notePlaceholder: 'e.g. My Year 10 class struggle with confident posture during presentations. Can you suggest a warm-up?',
      };
    case 'other':
      return {
        greeting:        'Welcome, Scholar',
        intro:           'Every great communicator once stood where you stand. These sessions will help you understand how your body, face, and voice shape every interaction.',
        notePrompt:      'Leave a note for your guide',
        notePlaceholder: 'e.g. I\'d like to focus on speaking with more authority in professional settings.',
      };
    case 'teenager':
    default:
      return {
        greeting:        'Welcome back, Scholar',
        intro:           'Every great communicator once stood where you stand — at the beginning. Within these chambers, you will discover how your body speaks before your words, how your face reveals your soul, and how your voice carries the weight of meaning.',
        notePrompt:      'Need a personalised session?',
        notePlaceholder: 'e.g. I struggle with maintaining eye contact during presentations. Could I get a personalised session?',
      };
  }
}

const ACCOUNT_TYPE_LABELS = {
  teenager: '🎓 Teenager',
  parent:   '👨‍👩‍👧 Parent',
  teacher:  '📚 Teacher',
  other:    '✦ Scholar',
};

function getAccountTypeLabel(type) {
  return ACCOUNT_TYPE_LABELS[type] || '✦ Scholar';
}

// ─────────────────────────────────────────────────────────────
// SESSION PROGRESS (exercise resume)
// ─────────────────────────────────────────────────────────────

function saveSessionProgress(sessionType, checkpointIndex, videoTime) {
  try {
    localStorage.setItem('tp_progress_' + sessionType, JSON.stringify({
      checkpointIndex,
      videoTime,
      savedAt: Date.now(),
    }));
  } catch (_) {}
}

function loadSessionProgress(sessionType) {
  try {
    const raw  = localStorage.getItem('tp_progress_' + sessionType);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expire after 7 days
    if (Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem('tp_progress_' + sessionType);
      return null;
    }
    return data;
  } catch (_) { return null; }
}

function clearSessionProgress(sessionType) {
  try { localStorage.removeItem('tp_progress_' + sessionType); } catch (_) {}
}

// ─────────────────────────────────────────────────────────────
// POPUP & TOAST
// These require #msgPopup / #popupTitle / #popupBody / #toast
// to exist in the page HTML.
// ─────────────────────────────────────────────────────────────

function showPopup(title, msg, type, onClose) {
  // Works whether the page uses style.css (.hidden class) or its own inline styles
  const popup   = document.getElementById('msgPopup');
  const titleEl = document.getElementById('popupTitle');
  const bodyEl  = document.getElementById('popupBody');
  if (!titleEl || !bodyEl) return;

  titleEl.textContent = title || '';
  bodyEl.textContent  = msg   || '';
  bodyEl.className    = 'popup-body' + (type ? ' ' + type : '');

  if (popup) {
    popup.classList.remove('hidden');            // for pages using style.css
    popup.style.display = 'flex';               // for pages using inline styles
  }
  window._popupOnClose = typeof onClose === 'function' ? onClose : null;
}

function closePopup() {
  const popup = document.getElementById('msgPopup');
  if (popup) {
    popup.classList.add('hidden');              // for pages using style.css
    popup.style.display = 'none';              // for pages using inline styles
  }
  if (window._popupOnClose) { window._popupOnClose(); window._popupOnClose = null; }
}

function showToast(msg, duration) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg || '';
  t.classList.remove('hidden');                 // style.css pages
  t.style.display = 'block';                   // inline-style pages
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    t.classList.add('hidden');
    t.style.display = 'none';
  }, duration || 3500);
}

// ─────────────────────────────────────────────────────────────
// REPORT ERROR — injected on every protected page
// Shows a small floating button. Clicking opens a simple form.
// Submits to POST /report-error with page, description, userAgent.
// ─────────────────────────────────────────────────────────────

(function injectReportError() {
  // Only inject on pages that have auth (session exists when DOM loads)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _mountReportBtn);
  } else {
    _mountReportBtn();
  }
})();

function _mountReportBtn() {
  // Don't inject on login/signup/index (no session there)
  if (!document.querySelector('script[src="js/auth-guard.js"]')) return;

  // Button
  const btn = document.createElement('button');
  btn.id    = '_reportErrorBtn';
  btn.title = 'Report a problem on this page';
  btn.textContent = '⚠';
  btn.setAttribute('style', [
    'position:fixed','bottom:88px','right:24px','z-index:8800',
    'width:40px','height:40px','border-radius:50%','border:1px solid rgba(180,100,20,0.5)',
    'background:rgba(30,15,5,0.88)','color:#e09040','font-size:1rem',
    'cursor:pointer','box-shadow:0 2px 10px rgba(0,0,0,0.5)',
    'transition:transform 0.15s,background 0.2s','display:flex',
    'align-items:center','justify-content:center',
  ].join(';'));
  btn.addEventListener('mouseenter', () => { btn.style.background='rgba(80,40,10,0.95)'; btn.style.transform='scale(1.1)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background='rgba(30,15,5,0.88)'; btn.style.transform='scale(1)'; });
  btn.addEventListener('click', _openReportForm);
  document.body.appendChild(btn);

  // Overlay
  const overlay = document.createElement('div');
  overlay.id = '_reportOverlay';
  overlay.setAttribute('style','position:fixed;inset:0;z-index:8900;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;');
  overlay.innerHTML = `
    <div style="background:linear-gradient(160deg,#4a2e1a,#3a2010);border:2px solid var(--wood-mid,#4a2e1a);
                border-radius:16px;padding:28px 28px 24px;max-width:440px;width:92%;box-shadow:0 12px 48px rgba(0,0,0,0.7);">
      <p style="font-family:'Cinzel',serif;font-size:1rem;color:#d4a843;letter-spacing:0.06em;margin-bottom:6px;">⚠ Report a Problem</p>
      <p style="font-family:'Libre Baskerville',serif;font-size:0.82rem;color:#c8a87a;margin-bottom:16px;line-height:1.6;">
        Describe what went wrong. This goes directly to the admin.
      </p>
      <textarea id="_reportDesc"
        style="width:100%;min-height:90px;background:rgba(10,5,2,0.6);border:1px solid #4a2e1a;
               border-radius:8px;padding:10px 12px;color:#f5e6c8;font-family:'Libre Baskerville',serif;
               font-size:0.86rem;resize:vertical;box-sizing:border-box;margin-bottom:14px;"
        placeholder="e.g. The video on Body Postures page won't load. / The score didn't save after I completed the exercise.&#10;&#10;Be as specific as you can."></textarea>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="_closeReportForm()"
          style="background:none;border:1px solid #4a2e1a;border-radius:8px;padding:8px 18px;
                 color:#8a6840;font-family:'Cinzel',serif;font-size:0.78rem;cursor:pointer;">Cancel</button>
        <button id="_reportSubmitBtn" onclick="_submitReport()"
          style="background:linear-gradient(135deg,#c49a5a,#d4a843);border:none;border-radius:8px;
                 padding:8px 20px;color:#1a0f08;font-family:'Cinzel',serif;font-size:0.78rem;
                 font-weight:bold;cursor:pointer;letter-spacing:0.05em;">Send Report ✦</button>
      </div>
      <p id="_reportStatus" style="font-family:'Libre Baskerville',serif;font-size:0.78rem;
         color:#80c080;text-align:center;margin-top:10px;min-height:18px;"></p>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeReportForm(); });
  document.body.appendChild(overlay);
}

function _openReportForm() {
  const ov = document.getElementById('_reportOverlay');
  if (!ov) return;
  ov.style.display = 'flex';
  const ta = document.getElementById('_reportDesc');
  if (ta) { ta.value = ''; ta.focus(); }
  const st = document.getElementById('_reportStatus');
  if (st) st.textContent = '';
}

function _closeReportForm() {
  const ov = document.getElementById('_reportOverlay');
  if (ov) ov.style.display = 'none';
}

async function _submitReport() {
  const ta  = document.getElementById('_reportDesc');
  const btn = document.getElementById('_reportSubmitBtn');
  const st  = document.getElementById('_reportStatus');
  const desc = ta ? ta.value.trim() : '';
  if (!desc) { if (st) { st.style.color = '#e08060'; st.textContent = 'Please describe the problem first.'; } return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  const sess = getSession();
  if (!sess) { if (st) { st.style.color='#e08060'; st.textContent='You must be logged in to report errors.'; } if (btn) { btn.disabled=false; btn.textContent='Send Report ✦'; } return; }

  try {
    const res = await fetch(API_BASE + '/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sess.token },
      body: JSON.stringify({ description: desc, page: window.location.pathname, userAgent: navigator.userAgent }),
    });
    if (res.ok) {
      if (st) { st.style.color = '#80c080'; st.textContent = 'Report sent. Thank you — the admin will look into it.'; }
      if (ta) ta.value = '';
      setTimeout(_closeReportForm, 2200);
    } else {
      const d = await res.json().catch(() => ({}));
      if (st) { st.style.color='#e08060'; st.textContent = d.msg || 'Could not send. Try again.'; }
    }
  } catch (_) {
    if (st) { st.style.color='#e08060'; st.textContent = 'Network error — check your connection.'; }
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Send Report ✦'; }
}
