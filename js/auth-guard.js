const API_BASE = 'https://teenagerplaybook-1-0-0.onrender.com';

// auth-guard.js — shared utilities for all protected pages

// ── Session retrieval ──
function getSession() {
  const lsToken  = localStorage.getItem('tp_token');
  const lsExpiry = localStorage.getItem('tp_token_expiry');
  const remember = localStorage.getItem('tp_remember');

  if (lsToken && remember === 'true') {
    if (lsExpiry && Date.now() < parseInt(lsExpiry)) {
      return { token: lsToken, role: localStorage.getItem('tp_role')||'user', username: localStorage.getItem('tp_user')||'User' };
    } else {
      ['tp_token','tp_token_expiry','tp_remember','tp_role','tp_user'].forEach(k => localStorage.removeItem(k));
    }
  }
  const ssToken = sessionStorage.getItem('tp_token');
  if (ssToken) {
    return { token: ssToken, role: sessionStorage.getItem('tp_role')||'user', username: sessionStorage.getItem('tp_user')||'User' };
  }
  return null;
}

function requireAuth() {
  const sess = getSession();
  if (!sess) { window.location.href = 'login.html'; return null; }
  return sess;
}

function requireAdmin() {
  const sess = requireAuth();
  if (sess && sess.role !== 'admin') { window.location.href = 'dashboard.html'; return null; }
  return sess;
}

function logout() {
  ['tp_token','tp_token_expiry','tp_remember','tp_role','tp_user'].forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  window.location.href = 'login.html';
}

// ── Fix 5: JWT-aware fetch wrapper ──
// Wraps fetch() — if server returns 401, token has expired.
// Shows a re-login popup instead of silently failing.
async function authFetch(url, options = {}) {
  const sess = getSession();
  if (!sess) { window.location.href = 'login.html'; return null; }

  const headers = Object.assign({}, options.headers || {}, {
    'Authorization': 'Bearer ' + sess.token
  });

  try {
    const res = await fetch(url, Object.assign({}, options, { headers }));

    if (res.status === 401) {
      // Token expired or invalid — clear session and prompt re-login
      showSessionExpiredPopup();
      return null;
    }
    return res;
  } catch(e) {
    // Network error — don't logout, just return null silently
    return null;
  }
}

function showSessionExpiredPopup() {
  // Create popup if not already present
  let popup = document.getElementById('sessionExpiredPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id        = 'sessionExpiredPopup';
    popup.className = 'popup-overlay';
    popup.innerHTML = `
      <div class="popup-box wood-panel">
        <p class="popup-title">Session Expired</p>
        <p class="popup-body">Your session has expired after 8 days of inactivity. Please log in again to continue — your progress has been saved locally.</p>
        <div class="popup-actions">
          <button class="btn btn-primary" onclick="window.location.href='login.html'">Log In Again</button>
        </div>
      </div>`;
    document.body.appendChild(popup);
  }
  popup.classList.remove('hidden');
}

// ── Fix 3: Session resume helpers ──
// Saves exercise progress (current checkpoint + video time) to localStorage
// so if user closes the tab mid-session, they can resume

function saveSessionProgress(sessionType, checkpointIndex, videoTime) {
  const key  = 'tp_progress_' + sessionType;
  const data = { checkpointIndex, videoTime, savedAt: Date.now() };
  localStorage.setItem(key, JSON.stringify(data));
}

function loadSessionProgress(sessionType) {
  const key  = 'tp_progress_' + sessionType;
  const raw  = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    // Expire saved progress after 7 days
    if (Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch(e) { return null; }
}

function clearSessionProgress(sessionType) {
  localStorage.removeItem('tp_progress_' + sessionType);
}

// ── Popup utilities ──
function showPopup(title, msg, type='', onClose=null) {
  const titleEl = document.getElementById('popupTitle');
  const bodyEl  = document.getElementById('popupBody');
  const popup   = document.getElementById('msgPopup');
  if (!titleEl || !bodyEl || !popup) return;
  titleEl.textContent = title;
  bodyEl.textContent  = msg;
  bodyEl.className    = 'popup-body ' + type;
  popup.classList.remove('hidden');
  window._popupOnClose = onClose;
}

function closePopup() {
  const popup = document.getElementById('msgPopup');
  if (popup) popup.classList.add('hidden');
  if (typeof window._popupOnClose === 'function') {
    window._popupOnClose();
    window._popupOnClose = null;
  }
}

function showToast(msg, duration=3500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => t.classList.add('hidden'), duration);
}
