// ═══════════════════════════════════════════════════════════════
//  file-library.js  v2 — Universal file library overlay
//  Included on every protected page via <script src="js/file-library.js">
//
//  ── HOW TO ADD A NEW FILE TYPE ──────────────────────────────
//  1. Add the extension string to the correct array in FILE_CATEGORIES
//     (or create a new category key with icon, label, and exts)
//  2. If it needs a special viewer, add a branch in _flibOpenFile()
//  3. That's it. No other files need changing.
//
//  ── FILE CATEGORIES (single source of truth) ────────────────
//  Each category has:
//    icon   – emoji shown on cards and filter chips
//    label  – text shown on filter chips
//    exts   – array of lowercase dot-prefixed extensions
//    viewer – 'video' | 'audio' | 'pdf' | 'image' | 'zip' | 'text' | 'download'
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── SINGLE SOURCE OF TRUTH for all supported file types ──
  // To add a new type: add its extension to the right exts[] array.
  // To add a new category: add a new key below, then add a filter chip
  // in the injectUI() HTML and a viewer branch in _flibOpenFile().
  const FILE_CATEGORIES = {
    video: {
      icon: '🎬', label: 'Video', viewer: 'video',
      exts: ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.ogv', '.3gp', '.flv', '.wmv'],
    },
    audio: {
      icon: '🎵', label: 'Audio', viewer: 'audio',
      exts: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.aiff', '.aif', '.opus', '.wma', '.mid', '.midi'],
    },
    pdf: {
      icon: '📄', label: 'PDF', viewer: 'pdf',
      exts: ['.pdf'],
    },
    image: {
      icon: '🖼️', label: 'Image', viewer: 'image',
      exts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.tif', '.ico', '.avif', '.heic', '.heif'],
    },
    document: {
      icon: '📝', label: 'Document', viewer: 'download',
      exts: ['.doc', '.docx', '.odt', '.rtf', '.pages',
             '.ppt', '.pptx', '.odp', '.key',
             '.xls', '.xlsx', '.ods', '.numbers', '.csv'],
    },
    text: {
      icon: '📃', label: 'Text', viewer: 'text',
      exts: ['.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.ini', '.log', '.html', '.css', '.js', '.py', '.ts'],
    },
    archive: {
      icon: '🗜️', label: 'Archive', viewer: 'download',
      exts: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tar.gz', '.tar.bz2', '.tgz'],
    },
    other: {
      icon: '📎', label: 'Other', viewer: 'download',
      exts: [], // catch-all
    },
  };

  // Build a fast extension → category lookup map
  const EXT_TO_CAT = {};
  for (const [cat, def] of Object.entries(FILE_CATEGORIES)) {
    for (const ext of def.exts) EXT_TO_CAT[ext] = cat;
  }

  function getFileCategory(filename) {
    if (!filename) return 'other';
    const parts = filename.split('.');
    if (parts.length < 2) return 'other';
    // Check two-part extensions first (e.g. .tar.gz)
    const twoExt = '.' + parts.slice(-2).join('.').toLowerCase();
    if (EXT_TO_CAT[twoExt]) return EXT_TO_CAT[twoExt];
    const ext = '.' + parts.pop().toLowerCase();
    return EXT_TO_CAT[ext] || 'other';
  }

  function fileIcon(filename) {
    return FILE_CATEGORIES[getFileCategory(filename)]?.icon || '📎';
  }

  function fileViewer(filename) {
    return FILE_CATEGORIES[getFileCategory(filename)]?.viewer || 'download';
  }

  // Authenticated URL via the /files/:name route
  function fileUrl(filename) {
    return API_BASE + '/files/' + encodeURIComponent(filename);
  }

  // ── Build the filter chip HTML from FILE_CATEGORIES ──────
  function buildChips() {
    const cats = Object.entries(FILE_CATEGORIES).filter(([k]) => k !== 'other');
    const chips = cats.map(([cat, def]) =>
      `<button class="flib-chip" data-cat="${cat}">${def.icon} ${def.label}</button>`
    ).join('');
    return `<button class="flib-chip flib-chip-active" data-cat="">All</button>${chips}<button class="flib-chip" data-cat="other">📎 Other</button>`;
  }

  // ── Inject the overlay and FAB into the page ─────────────
  function injectUI() {
    // Floating action button
    const fab = document.createElement('button');
    fab.id        = 'fileLibFab';
    fab.innerHTML = '📁';
    fab.title     = 'File Library';
    fab.setAttribute('style', [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:8900',
      'width:54px', 'height:54px', 'border-radius:50%', 'border:none',
      'background:linear-gradient(135deg,var(--wood-honey),var(--gold))',
      'color:var(--ink)', 'font-size:1.4rem',
      'display:flex', 'align-items:center', 'justify-content:center',
      'cursor:pointer', 'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
      'transition:transform 0.2s,box-shadow 0.2s',
    ].join(';'));
    fab.addEventListener('mouseenter', () => {
      fab.style.transform  = 'scale(1.1)';
      fab.style.boxShadow  = '0 6px 28px rgba(0,0,0,0.75)';
    });
    fab.addEventListener('mouseleave', () => {
      fab.style.transform  = 'scale(1)';
      fab.style.boxShadow  = '0 4px 20px rgba(0,0,0,0.6)';
    });
    fab.addEventListener('click', openLibrary);
    document.body.appendChild(fab);

    // Main overlay
    const overlay = document.createElement('div');
    overlay.id = 'fileLibOverlay';
    overlay.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:9000',
      'background:rgba(10,5,2,0.95)',
      'display:none', 'flex-direction:column',
      'font-family:\'Libre Baskerville\',serif',
    ].join(';'));

    overlay.innerHTML = `
      <!-- ── Header ── -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:16px 24px;border-bottom:1px solid var(--wood-mid);
                  background:rgba(30,15,8,0.95);flex-shrink:0;flex-wrap:wrap;gap:10px;">
        <div>
          <p style="font-family:'Cinzel',serif;font-size:1.05rem;color:var(--gold);
                    letter-spacing:0.08em;margin:0;">📁 FILE LIBRARY</p>
          <p style="font-size:0.78rem;color:var(--text-dim);margin:3px 0 0;"
             id="fileLibSubtitle">All uploaded files</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <input id="fileLibSearch" type="text" placeholder="Search…"
            style="background:rgba(20,10,4,0.8);border:1px solid var(--wood-mid);
                   border-radius:8px;padding:7px 12px;color:var(--text-main);
                   font-family:'Libre Baskerville',serif;font-size:0.83rem;width:180px;">
          <button id="fileLibClose"
            style="background:none;border:1px solid var(--wood-mid);border-radius:8px;
                   color:var(--text-muted);font-size:0.9rem;padding:6px 14px;cursor:pointer;">
            ✕ Close
          </button>
        </div>
      </div>

      <!-- ── Category filter chips (auto-generated) ── -->
      <div style="display:flex;flex-wrap:wrap;gap:7px;padding:12px 24px;
                  border-bottom:1px solid var(--wood-mid);flex-shrink:0;
                  background:rgba(18,8,3,0.6);" id="fileLibFilters">
        ${buildChips()}
      </div>

      <!-- ── Admin upload panel (hidden for non-admins) ── -->
      <div id="fileLibUploadPanel" style="display:none;padding:14px 24px;
           border-bottom:1px solid var(--wood-mid);background:rgba(12,6,2,0.8);flex-shrink:0;">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">

          <div style="flex:0 0 auto;min-width:180px;">
            <p style="font-family:'Cinzel',serif;font-size:0.68rem;color:var(--gold-dim);
                      letter-spacing:0.07em;margin-bottom:5px;">SAVE AS</p>
            <select id="flibTargetSelect"
              style="width:100%;padding:8px 10px;background:rgba(20,10,4,0.9);
                     border:1px solid var(--wood-mid);border-radius:8px;
                     color:var(--text-main);font-family:'Cinzel',serif;font-size:0.78rem;">
              <option value="BodyPostures">BodyPostures (session)</option>
              <option value="FacialExpression">FacialExpression (session)</option>
              <option value="Intonation">Intonation (session)</option>
              <option value="custom">Custom name…</option>
            </select>
          </div>

          <div id="flibCustomWrap" style="display:none;flex:0 0 auto;min-width:150px;">
            <p style="font-family:'Cinzel',serif;font-size:0.68rem;color:var(--gold-dim);
                      letter-spacing:0.07em;margin-bottom:5px;">CUSTOM NAME</p>
            <input id="flibCustomName" type="text" placeholder="e.g. Guide_Week3_Notes"
              style="width:100%;padding:8px 10px;background:rgba(20,10,4,0.9);
                     border:1px solid var(--wood-mid);border-radius:8px;
                     color:var(--text-main);font-family:'Libre Baskerville',serif;font-size:0.82rem;">
          </div>

          <div style="flex:1;min-width:200px;">
            <p style="font-family:'Cinzel',serif;font-size:0.68rem;color:var(--gold-dim);
                      letter-spacing:0.07em;margin-bottom:5px;">
              FILE <span style="color:var(--text-dim);text-transform:none;font-family:'Libre Baskerville',serif;">
              — any type: video, PDF, image, audio, ZIP, document…</span>
            </p>
            <div id="flibDrop"
              style="border:2px dashed var(--wood-mid);border-radius:10px;padding:12px 16px;
                     text-align:center;cursor:pointer;transition:border-color 0.2s;background:rgba(20,10,4,0.5);"
              onclick="document.getElementById('flibFileInput').click()"
              ondragover="event.preventDefault();this.style.borderColor='var(--gold)'"
              ondragleave="this.style.borderColor='var(--wood-mid)'"
              ondrop="window._flibDrop(event)">
              <span id="flibDropLabel" style="font-size:0.82rem;color:var(--text-dim);">
                Click or drag &amp; drop any file
              </span>
              <input type="file" id="flibFileInput" accept="*" style="display:none;"
                     onchange="window._flibSelect(event)">
            </div>
          </div>

          <button onclick="window._flibUpload()"
            style="flex:0 0 auto;background:linear-gradient(135deg,var(--wood-honey),var(--gold));
                   color:var(--ink);border:none;border-radius:8px;
                   padding:10px 20px;font-family:'Cinzel',serif;font-size:0.78rem;
                   letter-spacing:0.06em;cursor:pointer;white-space:nowrap;align-self:flex-end;">
            Upload ✦
          </button>
        </div>

        <!-- Upload progress bar -->
        <div style="margin-top:8px;height:4px;border-radius:2px;
                    background:rgba(40,20,10,0.5);overflow:hidden;">
          <div id="flibUploadBar"
            style="height:100%;width:0%;border-radius:2px;transition:width 0.3s;
                   background:linear-gradient(90deg,var(--wood-honey),var(--gold));"></div>
        </div>
      </div>

      <!-- ── File grid ── -->
      <div style="overflow-y:auto;flex:1;padding:20px 24px;">
        <div id="fileLibGrid"
          style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;">
          <p style="color:var(--text-dim);font-style:italic;font-size:0.86rem;grid-column:1/-1;">
            Loading…
          </p>
        </div>
      </div>

      <!-- ── In-library file viewer (slides over everything) ── -->
      <div id="fileLibViewer"
        style="display:none;position:absolute;inset:0;z-index:9100;
               background:rgba(8,4,1,0.98);flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:12px 22px;border-bottom:1px solid var(--wood-mid);flex-shrink:0;">
          <p id="fileLibViewerTitle"
            style="font-family:'Cinzel',serif;color:var(--gold);
                   font-size:0.9rem;letter-spacing:0.06em;margin:0;word-break:break-all;"></p>
          <button onclick="window._flibCloseViewer()"
            style="flex-shrink:0;background:none;border:1px solid var(--wood-mid);
                   border-radius:8px;color:var(--text-muted);font-size:0.85rem;
                   padding:5px 14px;cursor:pointer;margin-left:12px;">
            ← Back
          </button>
        </div>
        <div id="fileLibViewerBody"
          style="flex:1;overflow:auto;padding:24px;
                 display:flex;align-items:flex-start;justify-content:center;">
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // ── Styles ──────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
      .flib-chip {
        background: rgba(20,10,4,0.55);
        border: 1px solid var(--wood-mid);
        border-radius: 20px;
        padding: 4px 12px;
        font-family: 'Cinzel', serif;
        font-size: 0.7rem;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s, background 0.2s;
      }
      .flib-chip:hover     { border-color: var(--gold-dim); color: var(--text-main); }
      .flib-chip-active    { border-color: var(--gold); color: var(--gold); background: rgba(80,50,12,0.35); }

      .flib-card {
        background: rgba(28,14,7,0.7);
        border: 1px solid var(--wood-mid);
        border-radius: 12px;
        padding: 14px 12px;
        cursor: default;
        transition: border-color 0.2s, transform 0.15s;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .flib-card:hover   { border-color: var(--gold-dim); transform: translateY(-2px); }
      .flib-card-icon    { font-size: 2rem; text-align: center; line-height: 1; }
      .flib-card-name    { font-family: 'Cinzel', serif; font-size: 0.7rem; color: var(--text-main);
                           letter-spacing: 0.03em; word-break: break-all; line-height: 1.45; }
      .flib-card-size    { font-size: 0.68rem; color: var(--text-dim); }
      .flib-card-desc    { font-size: 0.7rem; color: var(--text-dim); font-style: italic; }
      .flib-card-actions { display: flex; gap: 6px; margin-top: 4px; }
      .flib-btn-open {
        flex: 1; padding: 5px 0;
        border: 1px solid var(--gold-dim); border-radius: 6px;
        background: rgba(80,50,12,0.35); color: var(--gold);
        font-family: 'Cinzel', serif; font-size: 0.67rem; letter-spacing: 0.05em;
        cursor: pointer; transition: background 0.2s;
      }
      .flib-btn-open:hover { background: rgba(120,80,20,0.5); }
      .flib-btn-del {
        padding: 5px 8px;
        border: 1px solid rgba(180,60,40,0.4); border-radius: 6px;
        background: none; color: rgba(200,80,60,0.8); font-size: 0.7rem; cursor: pointer;
      }
      #fileLibViewer { display: flex !important; }
    `;
    document.head.appendChild(style);

    // ── Wire events ──────────────────────────────────────────
    document.getElementById('fileLibClose').addEventListener('click', closeLibrary);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeLibrary(); });

    document.getElementById('fileLibSearch').addEventListener('input', e => {
      _filterGrid(e.target.value, _activeCat);
    });

    document.getElementById('fileLibFilters').addEventListener('click', e => {
      const chip = e.target.closest('.flib-chip');
      if (!chip) return;
      document.querySelectorAll('#fileLibFilters .flib-chip')
              .forEach(c => c.classList.remove('flib-chip-active'));
      chip.classList.add('flib-chip-active');
      _activeCat = chip.dataset.cat;
      _filterGrid(document.getElementById('fileLibSearch').value, _activeCat);
    });

    document.getElementById('flibTargetSelect').addEventListener('change', e => {
      document.getElementById('flibCustomWrap').style.display =
        e.target.value === 'custom' ? 'block' : 'none';
    });
  }

  // ── State ─────────────────────────────────────────────────
  let _allFiles   = [];
  let _activeCat  = '';
  let _uploadFile = null;

  // ── Open / Close overlay ──────────────────────────────────
  function openLibrary() {
    const overlay = document.getElementById('fileLibOverlay');
    overlay.style.display      = 'flex';
    document.body.style.overflow = 'hidden';
    const sess = typeof getSession === 'function' ? getSession() : null;
    if (sess && sess.role === 'admin') {
      document.getElementById('fileLibUploadPanel').style.display = 'block';
    }
    _loadFiles();
  }

  function closeLibrary() {
    document.getElementById('fileLibOverlay').style.display = 'none';
    document.body.style.overflow = '';
    window._flibCloseViewer();
  }

  // ── Load file list from server ────────────────────────────
  async function _loadFiles() {
    const grid = document.getElementById('fileLibGrid');
    grid.innerHTML = '<p style="color:var(--text-dim);font-style:italic;font-size:0.86rem;grid-column:1/-1;">Loading…</p>';
    const sess = typeof getSession === 'function' ? getSession() : null;
    if (!sess) return;

    try {
      const endpoint = sess.role === 'admin'
        ? API_BASE + '/admin/files'
        : API_BASE + '/personal-files';

      const res = await authFetch(endpoint);
      if (!res) return;
      const data = await res.json();

      _allFiles = sess.role === 'admin'
        ? data.map(f => ({ name: f.name, size: f.size, label: f.name }))
        : data.map(f => ({ name: f.filename, size: '', label: f.label || f.filename, desc: f.description }));

      const sub = document.getElementById('fileLibSubtitle');
      if (sub) sub.textContent = `${_allFiles.length} file${_allFiles.length !== 1 ? 's' : ''} in library`;

      _renderGrid(_allFiles);
    } catch (e) {
      grid.innerHTML = '<p style="color:var(--text-dim);font-style:italic;grid-column:1/-1;">Could not load files — check the server is running.</p>';
    }
  }

  // ── Render grid of file cards ─────────────────────────────
  function _renderGrid(files) {
    const grid = document.getElementById('fileLibGrid');
    const sess = typeof getSession === 'function' ? getSession() : null;
    if (!files.length) {
      grid.innerHTML = '<p style="color:var(--text-dim);font-style:italic;font-size:0.86rem;grid-column:1/-1;">No files match.</p>';
      return;
    }
    grid.innerHTML = '';
    files.forEach(file => {
      const cat  = getFileCategory(file.name);
      const card = document.createElement('div');
      card.className        = 'flib-card';
      card.dataset.filename = file.name;
      card.dataset.cat      = cat;

      const safeName  = (file.label || file.name).replace(/</g, '&lt;');
      const safeFile  = file.name.replace(/'/g, "\\'");
      const safeLabel = (file.label || file.name).replace(/'/g, "\\'");

      card.innerHTML = `
        <div class="flib-card-icon">${fileIcon(file.name)}</div>
        <div class="flib-card-name">${safeName}</div>
        ${file.size ? `<div class="flib-card-size">${file.size}</div>` : ''}
        ${file.desc ? `<div class="flib-card-desc">${file.desc.replace(/</g,'&lt;')}</div>` : ''}
        <div class="flib-card-actions">
          <button class="flib-btn-open"
            onclick="window._flibOpenFile('${safeFile}','${safeLabel}')">Open</button>
          ${sess && sess.role === 'admin'
            ? `<button class="flib-btn-del" title="Delete"
                onclick="window._flibDeleteFile('${safeFile}')">🗑</button>` : ''}
        </div>`;
      grid.appendChild(card);
    });
  }

  // ── Filter: search query + category chip ──────────────────
  function _filterGrid(query, cat) {
    const q = (query || '').toLowerCase().trim();
    const filtered = _allFiles.filter(f => {
      const matchCat   = !cat || getFileCategory(f.name) === cat;
      const matchQuery = !q
        || f.name.toLowerCase().includes(q)
        || (f.label || '').toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
    _renderGrid(filtered);
  }

  // ── Open a file in the viewer panel ───────────────────────
  window._flibOpenFile = function (filename, label) {
    const viewer  = document.getElementById('fileLibViewer');
    const body    = document.getElementById('fileLibViewerBody');
    const title   = document.getElementById('fileLibViewerTitle');

    title.textContent = label || filename;
    body.innerHTML    = '';
    body.style.padding = '24px';
    body.style.alignItems = 'flex-start';
    viewer.style.display  = 'flex';

    const url     = fileUrl(filename);
    const viewer_type = fileViewer(filename);

    if (viewer_type === 'video') {
      body.style.alignItems = 'center';
      body.innerHTML = `
        <video controls playsinline autoplay
          style="max-width:100%;max-height:80vh;border-radius:10px;background:#000;
                 box-shadow:0 8px 40px rgba(0,0,0,0.8);">
          <source src="${url}">
          Your browser does not support HTML5 video.
        </video>`;

    } else if (viewer_type === 'audio') {
      body.style.alignItems = 'center';
      body.innerHTML = `
        <div style="text-align:center;padding:20px;">
          <div style="font-size:5rem;margin-bottom:20px;">${fileIcon(filename)}</div>
          <p style="font-family:'Cinzel',serif;color:var(--gold);margin-bottom:20px;
                    letter-spacing:0.06em;">${(label || filename).replace(/</g,'&lt;')}</p>
          <audio controls autoplay
            style="width:100%;max-width:540px;border-radius:8px;">
            <source src="${url}">
            Your browser does not support audio playback.
          </audio>
        </div>`;

    } else if (viewer_type === 'pdf') {
      body.style.padding   = '0';
      body.style.alignItems = 'stretch';
      body.style.width     = '100%';
      body.innerHTML = `
        <iframe src="${url}#toolbar=1"
          style="width:100%;height:100%;border:none;"
          title="${(label || filename).replace(/"/g,'&quot;')}">
        </iframe>`;

    } else if (viewer_type === 'image') {
      body.style.alignItems = 'center';
      body.innerHTML = `
        <img src="${url}" alt="${(label || filename).replace(/"/g,'&quot;')}"
          style="max-width:100%;max-height:85vh;border-radius:10px;
                 box-shadow:0 8px 40px rgba(0,0,0,0.8);object-fit:contain;">`;

    } else if (viewer_type === 'text') {
      body.style.width = '100%';
      body.innerHTML = `<p style="color:var(--text-dim);font-style:italic;margin-bottom:12px;font-size:0.82rem;">Loading…</p>`;
      fetch(url, { headers: { Authorization: 'Bearer ' + (getSession()?.token || '') } })
        .then(r => r.text())
        .then(text => {
          const safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          body.innerHTML = `
            <pre style="white-space:pre-wrap;word-break:break-word;
                        font-family:'Libre Baskerville',monospace;font-size:0.82rem;
                        color:var(--text-muted);line-height:1.7;width:100%;
                        background:rgba(10,5,2,0.5);border-radius:8px;
                        padding:18px;border:1px solid var(--wood-mid);">${safe}</pre>`;
        })
        .catch(() => {
          body.innerHTML = _downloadFallback(filename, label, url);
        });

    } else {
      // Archive / Office / unknown — offer download
      body.style.alignItems = 'center';
      body.innerHTML = _downloadFallback(filename, label, url);
    }
  };

  function _downloadFallback(filename, label, url) {
    const sess = typeof getSession === 'function' ? getSession() : null;
    const safeLabel = (label || filename).replace(/</g,'&lt;');
    return `
      <div style="text-align:center;padding:30px 20px;">
        <div style="font-size:5rem;margin-bottom:20px;">${fileIcon(filename)}</div>
        <p style="font-family:'Cinzel',serif;color:var(--gold);font-size:1rem;
                  letter-spacing:0.06em;margin-bottom:8px;">${safeLabel}</p>
        <p style="color:var(--text-dim);font-size:0.84rem;margin-bottom:28px;">
          This file type cannot be previewed in the browser.
        </p>
        <a href="${url}" download="${filename.replace(/"/g,'&quot;')}"
           ${sess ? `onclick="this.href='${url}'"` : ''}
          style="display:inline-block;padding:12px 28px;
                 background:linear-gradient(135deg,var(--wood-honey),var(--gold));
                 color:var(--ink);border-radius:10px;font-family:'Cinzel',serif;
                 font-size:0.84rem;letter-spacing:0.06em;text-decoration:none;
                 box-shadow:0 4px 16px rgba(0,0,0,0.4);">
          ⬇ Download ${filename.replace(/</g,'&lt;')}
        </a>
      </div>`;
  }

  window._flibCloseViewer = function () {
    const viewer = document.getElementById('fileLibViewer');
    if (!viewer) return;
    viewer.style.display = 'none';
    const body = document.getElementById('fileLibViewerBody');
    if (body) body.innerHTML = '';
  };

  // ── Admin: select file ────────────────────────────────────
  window._flibSelect = function (e) {
    _uploadFile = e.target.files[0];
    if (_uploadFile) {
      document.getElementById('flibDropLabel').textContent = '✦ ' + _uploadFile.name;
    }
  };

  window._flibDrop = function (e) {
    e.preventDefault();
    document.getElementById('flibDrop').style.borderColor = 'var(--wood-mid)';
    _uploadFile = e.dataTransfer.files[0];
    if (_uploadFile) {
      document.getElementById('flibDropLabel').textContent = '✦ ' + _uploadFile.name;
    }
  };

  // ── Admin: upload ─────────────────────────────────────────
  window._flibUpload = async function () {
    if (!_uploadFile) { if (typeof showToast === 'function') showToast('Select a file first.'); return; }
    const sess = typeof getSession === 'function' ? getSession() : null;
    if (!sess || sess.role !== 'admin') return;

    const sel    = document.getElementById('flibTargetSelect').value;
    const custom = document.getElementById('flibCustomName').value.trim().replace(/\s+/g, '_');
    const target = sel === 'custom' ? (custom || 'CustomFile') : sel;

    const form = new FormData();
    form.append('video', _uploadFile); // 'video' is the multer field name
    form.append('target', target);

    const bar = document.getElementById('flibUploadBar');
    bar.style.width = '8%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/admin/upload-file');
    xhr.setRequestHeader('Authorization', 'Bearer ' + sess.token);

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + '%';
    };

    xhr.onload = () => {
      setTimeout(() => { bar.style.width = '0%'; }, 1400);
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (typeof showToast === 'function') showToast('"' + data.filename + '" uploaded ✦');
        } catch (_) {}
        _uploadFile = null;
        document.getElementById('flibDropLabel').textContent = 'Click or drag & drop any file';
        document.getElementById('flibFileInput').value = '';
        _loadFiles();
      } else {
        let msg = 'Upload failed.';
        try { msg = JSON.parse(xhr.responseText).msg || msg; } catch (_) {}
        if (typeof showToast === 'function') showToast(msg);
      }
    };

    xhr.onerror = () => { bar.style.width = '0%'; if (typeof showToast === 'function') showToast('Network error.'); };
    xhr.send(form);
  };

  // ── Admin: delete ─────────────────────────────────────────
  window._flibDeleteFile = async function (name) {
    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
    const sess = typeof getSession === 'function' ? getSession() : null;
    if (!sess) return;
    try {
      const res = await authFetch(API_BASE + '/admin/files/' + encodeURIComponent(name), { method: 'DELETE' });
      if (res && res.ok) {
        if (typeof showToast === 'function') showToast('"' + name + '" deleted.');
        _loadFiles();
      } else {
        if (typeof showToast === 'function') showToast('Could not delete.');
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Server error.');
    }
  };

  // ── Init ──────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
  } else {
    injectUI();
  }

})();
