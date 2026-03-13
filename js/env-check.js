// ═══════════════════════════════════════════════════════════════
//  env-check.js — Pre-session environment checker
//  Used by bodypostures.html, facialexpression.html, intonation.html
//
//  Shows a popup before the video starts with:
//  - Camera/mic test
//  - Lighting quality check (camera sessions)
//  - Noise level check (mic sessions)
//  - CDN library status
//  - Environment advice
// ═══════════════════════════════════════════════════════════════

// ── Called by each exercise page on load ──
// type: 'camera' | 'mic' | 'both'
// onReady: callback when user confirms ready
async function runEnvironmentCheck(type, onReady) {
  const popup = document.getElementById('envCheckPopup');
  if (!popup) return onReady(); // skip if popup not in DOM
  popup.classList.remove('hidden');

  const statusEl  = document.getElementById('envStatus');
  const adviceEl  = document.getElementById('envAdvice');
  const startBtn  = document.getElementById('envStartBtn');
  const retryBtn  = document.getElementById('envRetryBtn');

  startBtn.style.display  = 'none';
  retryBtn.style.display  = 'none';

  setEnvStatus('⏳', 'Checking your environment…', 'loading');

  const results = { camera: null, lighting: null, mic: null, noise: null, cdn: null };
  const issues  = [];
  const advice  = [];

  // ── 1. CDN libraries check ──
  results.cdn = checkCDNStatus(type);
  if (!results.cdn.ok) {
    issues.push(results.cdn.msg);
    advice.push('Ensure you have an internet connection. AI models load from cdn.jsdelivr.net.');
  }

  // ── 2. Camera check ──
  if (type === 'camera' || type === 'both') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user' } });

      // Check lighting from a quick snapshot
      results.lighting = await checkLighting(stream);
      stream.getTracks().forEach(t => t.stop());

      if (!results.lighting.ok) {
        issues.push('Lighting may be too ' + results.lighting.level + '.');
        advice.push(results.lighting.advice);
      }
    } catch(e) {
      issues.push('Camera access was denied or unavailable.');
      advice.push('Allow camera access in your browser settings before starting.');
      results.camera = { ok: false };
    }
  }

  // ── 3. Microphone / noise check ──
  if (type === 'mic' || type === 'both') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      results.noise = await checkNoise(stream);
      stream.getTracks().forEach(t => t.stop());

      if (!results.noise.ok) {
        issues.push('Background noise detected (' + results.noise.level + ').');
        advice.push(results.noise.advice);
      }
    } catch(e) {
      issues.push('Microphone access was denied or unavailable.');
      advice.push('Allow microphone access in your browser settings before starting.');
      results.mic = { ok: false };
    }
  }

  // ── Render results ──
  renderChecklist(results, type);

  if (issues.length === 0) {
    setEnvStatus('✦', 'Environment looks good — you\'re ready to begin!', 'good');
    adviceEl.innerHTML = '';
    startBtn.style.display = 'inline-flex';
  } else {
    const severity = issues.length >= 2 ? 'warn-high' : 'warn-low';
    setEnvStatus(issues.length >= 2 ? '⚠️' : '⚡', issues.join(' '), severity);
    adviceEl.innerHTML = advice.map(a => `<p class="env-advice-item">• ${a}</p>`).join('');
    startBtn.style.display  = 'inline-flex';  // always allow start
    retryBtn.style.display  = 'inline-flex';
    startBtn.textContent    = 'Start Anyway';
  }

  startBtn.onclick = () => {
    popup.classList.add('hidden');
    onReady();
  };
  retryBtn.onclick = () => runEnvironmentCheck(type, onReady);
}

// ── Check CDN libraries are reachable ──
function checkCDNStatus(type) {
  const missing = [];
  if (type === 'camera' || type === 'both') {
    if (typeof Pose === 'undefined')    missing.push('MediaPipe Pose');
    if (typeof posenet === 'undefined') missing.push('PoseNet');
    if (typeof faceapi === 'undefined') missing.push('face-api.js');
    if (typeof FaceMesh === 'undefined') missing.push('Face Mesh');
  }
  // Mic uses only Web Audio API — always available in modern browsers
  if (missing.length === 0) return { ok: true, msg: '' };
  // Some missing is normal (page-specific) — only flag if ALL missing
  const allMissing = missing.length >= 2;
  return {
    ok:  !allMissing,
    msg: allMissing ? 'Some AI libraries failed to load (' + missing.join(', ') + '). Scores may use fallback mode.' : ''
  };
}

// ── Check lighting via quick canvas snapshot ──
async function checkLighting(stream) {
  return new Promise(resolve => {
    const v   = document.createElement('video');
    v.srcObject = stream;
    v.muted     = true;
    v.setAttribute('playsinline', '');
    // Fix 6: must wait for both loadeddata AND a brief play period before snapshot
    // otherwise canvas drawImage gets a blank/black frame
    v.onloadeddata = () => {
      v.play().then(() => {
        setTimeout(() => {
        try {
          const c   = document.createElement('canvas');
          c.width   = 80; c.height = 60;
          const ctx = c.getContext('2d');
          ctx.drawImage(v, 0, 0, 80, 60);
          const px  = ctx.getImageData(0, 0, 80, 60).data;
          let total = 0;
          for (let i = 0; i < px.length; i += 4) {
            total += 0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2];
          }
          const avg = total / (px.length / 4);
          if (avg < 45)
            resolve({ ok: false, level: 'dark',  advice: 'Move to a brighter area or turn on a light facing you. The AI needs to see you clearly.' });
          else if (avg > 215)
            resolve({ ok: false, level: 'bright', advice: 'Reduce the light behind you (avoid sitting with a window directly behind). The camera is overexposing.' });
          else
            resolve({ ok: true, level: 'good', advice: '' });
        } catch(e) { resolve({ ok: true, level: 'unknown', advice: '' }); }
        }, 900);
      }).catch(() => {
        resolve({ ok: true, level: 'unknown', advice: '' });
      });
    };
    v.onerror = () => resolve({ ok: true, level: 'unknown', advice: '' });
  });
}

// ── Check background noise level ──
async function checkNoise(stream) {
  return new Promise(resolve => {
    try {
      const ctx      = new (window.AudioContext || window.webkitAudioContext)();
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);

      setTimeout(() => {
        const buf = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatTimeDomainData(buf);
        let rms = 0;
        for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / buf.length);
        ctx.close();

        if (rms > 0.06)
          resolve({ ok: false, level: 'high',   advice: 'Move to a quieter room. Background noise disrupts pitch detection and intonation scoring.' });
        else if (rms > 0.025)
          resolve({ ok: false, level: 'moderate', advice: 'Some background noise detected. A quieter environment will give more accurate intonation scores.' });
        else
          resolve({ ok: true,  level: 'quiet', advice: '' });
      }, 1200);
    } catch(e) { resolve({ ok: true, level: 'unknown', advice: '' }); }
  });
}

// ── Render individual check rows ──
function renderChecklist(results, type) {
  const list = document.getElementById('envChecklist');
  if (!list) return;
  list.innerHTML = '';

  const row = (icon, label, sub) => {
    const d = document.createElement('div');
    d.className = 'env-check-row';
    d.innerHTML = `<span class="env-check-icon">${icon}</span>
                   <span class="env-check-label">${label}<span class="env-check-sub">${sub}</span></span>`;
    list.appendChild(d);
  };

  // CDN
  row(results.cdn && !results.cdn.ok ? '⚠️' : '✓', 'AI Libraries', results.cdn && !results.cdn.ok ? 'some unavailable — fallback active' : 'loaded');

  if (type === 'camera' || type === 'both') {
    if (results.camera && !results.camera.ok) row('✗', 'Camera', 'access denied');
    else if (results.lighting) row(results.lighting.ok ? '✓' : '⚡', 'Camera & Lighting', results.lighting.ok ? 'good' : results.lighting.level);
    else row('✓', 'Camera', 'available');
  }
  if (type === 'mic' || type === 'both') {
    if (results.mic && !results.mic.ok) row('✗', 'Microphone', 'access denied');
    else if (results.noise) row(results.noise.ok ? '✓' : '⚡', 'Microphone & Noise', results.noise.ok ? 'quiet' : results.noise.level + ' background noise');
    else row('✓', 'Microphone', 'available');
  }
}

function setEnvStatus(icon, msg, cls) {
  const el = document.getElementById('envStatus');
  if (!el) return;
  el.className = 'env-status-msg env-status-' + cls;
  el.innerHTML = `<span class="env-status-icon">${icon}</span> ${msg}`;
}

// ── Noise gate helper — used during scoring to detect if user is speaking ──
// Returns true if the audio signal is above the noise floor
function isVoiceActive(analyser, noiseFloor) {
  if (!analyser) return false;
  const buf = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatTimeDomainData(buf);
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  return rms > (noiseFloor || 0.012);
}
