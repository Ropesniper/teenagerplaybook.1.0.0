// ═══════════════════════════════════════════════════════════════
//  env-check.js — Pre-session agreement popup
//  Quick consent dialog: tick & go. No slow environment scanning.
// ═══════════════════════════════════════════════════════════════

async function runEnvironmentCheck(type, onReady) {
  const popup = document.getElementById('envCheckPopup');
  if (!popup) { onReady(); return; }

  const isCam = type === 'camera' || type === 'both';
  const isMic = type === 'mic'    || type === 'both';

  let deviceNote = isCam && isMic ? 'Camera and microphone'
                 : isCam          ? 'Camera'
                                  : 'Microphone';

  const items = isCam
    ? ['Position yourself so your <strong>full body is visible</strong> to the camera',
       'Ensure you have <strong>good lighting</strong> — avoid sitting with a bright window behind you',
       'Wear comfortable clothing that allows free movement']
    : ['Find a <strong>quiet environment</strong> with minimal background noise',
       'Speak clearly and at a natural pace',
       'Keep your microphone or device close enough to capture your voice clearly'];

  popup.innerHTML = `
    <div class="popup-box wood-panel" style="max-width:500px;">
      <p class="popup-title" style="margin-bottom:6px;">Before You Begin</p>
      <p style="font-family:'IM Fell English',serif;font-style:italic;font-size:0.88rem;
                color:var(--text-muted);text-align:center;margin-bottom:18px;line-height:1.7;">
        ${deviceNote} access will be requested when the first exercise starts.
      </p>

      <ul style="list-style:none;padding:0;margin:0 0 18px 0;text-align:left;">
        ${items.map(item => `
          <li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
            <span style="color:var(--gold);font-size:0.9rem;margin-top:2px;flex-shrink:0;">✦</span>
            <span style="font-family:'Libre Baskerville',serif;font-size:0.88rem;
                         color:var(--text-muted);line-height:1.6;">${item}</span>
          </li>`).join('')}
      </ul>

      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:20px;
                  background:rgba(20,10,4,0.4);border-radius:8px;padding:12px 14px;">
        <input type="checkbox" id="sessionAgreeTick"
               style="width:18px;height:18px;cursor:pointer;accent-color:var(--gold);flex-shrink:0;margin-top:2px;">
        <label for="sessionAgreeTick"
               style="font-family:'Libre Baskerville',serif;font-size:0.85rem;
                      color:var(--text-muted);line-height:1.6;cursor:pointer;">
          I understand the session requirements and am ready to begin.${isCam ? ' My camera feed is processed entirely in the browser and is never stored or transmitted.' : ''}
        </label>
      </div>

      <div class="popup-actions">
        <button class="btn btn-primary" id="envStartBtn" disabled
                style="opacity:0.45;cursor:not-allowed;transition:opacity 0.2s;">
          Begin Session ✦
        </button>
      </div>
    </div>
  `;

  popup.classList.remove('hidden');

  const tick     = document.getElementById('sessionAgreeTick');
  const startBtn = document.getElementById('envStartBtn');

  tick.addEventListener('change', () => {
    const ok = tick.checked;
    startBtn.disabled      = !ok;
    startBtn.style.opacity = ok ? '1' : '0.45';
    startBtn.style.cursor  = ok ? 'pointer' : 'not-allowed';
  });

  startBtn.addEventListener('click', () => {
    if (!tick.checked) return;
    popup.classList.add('hidden');
    onReady();
  });
}

// ── Noise gate helper — used during scoring to detect if user is speaking ──
function isVoiceActive(analyser, noiseFloor) {
  if (!analyser) return false;
  const buf = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatTimeDomainData(buf);
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  return rms > (noiseFloor || 0.012);
}
