// ── SUPABASE CONFIG — fill these in after Supabase setup ─────
const SUPABASE_URL = 'https://fpocnfnxeeurygjwtmly.supabase.co';   // Project URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb2NuZm54ZWV1cnlnand0bWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NzMwMDgsImV4cCI6MjEwNjQ0OTAwOH0.5-0Z-ZH3KFMB987TX5CihCvlZcUIF19FDW5IS-FSHjk';                  // anon/public key
const SUPABASE_SVC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb2NuZm54ZWV1cnlnand0bWx5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDg3MzAwOCwiZXhwIjoyMTA2NDQ5MDA4fQ.Y5z1OCKdE-I2mhJZJCk3Mt7kukLb3ZYUvtmSiDewvWQ';          // service_role key (admin ops)
const STORAGE_BUCKET = 'files';                                  // your bucket name
const ADMIN_PASSWORD = 'Aman2005!';
// ─────────────────────────────────────────────────────────────

let isAdmin = false;
let currentFilter = 'all';
let deleteTarget = null;
let selectedFile = null;
let allFiles = [];

const CAT_META = {
  exe: { label: 'EXE', icon: '⚙', cls: 'cat-exe', badge: 'badge-exe' },
  bat: { label: 'BAT', icon: '📜', cls: 'cat-bat', badge: 'badge-bat' },
  vbs: { label: 'VBS', icon: '🔧', cls: 'cat-vbs', badge: 'badge-vbs' },
  apk: { label: 'APK', icon: '📱', cls: 'cat-apk', badge: 'badge-apk' },
  script: { label: 'SCRIPT', icon: '💻', cls: 'cat-script', badge: 'badge-script' },
  other: { label: 'FILE', icon: '📦', cls: 'cat-other', badge: 'badge-other' },
};

// ── SUPABASE HELPERS ──────────────────────────────────────────
function sbHeaders(useServiceKey = false) {
  const key = useServiceKey ? SUPABASE_SVC_KEY : SUPABASE_ANON_KEY;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}
function getPublicUrl(storageKey) {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodeURIComponent(storageKey)}`;
}
function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

// ── FETCH FILES FROM DATABASE ─────────────────────────────────
async function loadFiles() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/files?select=*&order=created_at.desc`,
      { headers: sbHeaders() }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DB error ${res.status}: ${err}`);
    }
    const data = await res.json();
    allFiles = data.map(row => ({
      id: row.id,
      name: row.name,
      cat: row.cat,
      version: row.version || '',
      size: row.size || '',
      desc: row.description || '',
      filename: row.filename,
      key: row.storage_key,
      date: row.created_at,
    }));
    renderFiles();
  } catch (err) {
    grid().innerHTML = emptyHTML('❌', 'Could not load files', err.message + ' — check your SUPABASE_URL and SUPABASE_ANON_KEY in script.js');
  }
}

// ── RENDER ────────────────────────────────────────────────────
function renderFiles() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  const visible = allFiles.filter(f => {
    const matchCat = currentFilter === 'all' || f.cat === currentFilter;
    const matchQ = !q || (f.name || '').toLowerCase().includes(q) || (f.desc || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  document.getElementById('totalFiles').textContent = allFiles.length;
  document.getElementById('totalExe').textContent = allFiles.filter(f => f.cat === 'exe').length;
  document.getElementById('totalApk').textContent = allFiles.filter(f => f.cat === 'apk').length;
  document.getElementById('totalScripts').textContent = allFiles.filter(f => ['bat', 'vbs', 'script'].includes(f.cat)).length;

  if (!visible.length) {
    grid().innerHTML = emptyHTML(
      '📭',
      allFiles.length ? 'No results found' : 'No files yet',
      allFiles.length ? 'Try a different search or category.' : isAdmin ? 'Click "+ Upload File" to add your first file.' : 'Check back soon!'
    );
    return;
  }

  grid().innerHTML = visible.map(f => {
    const m = CAT_META[f.cat] || CAT_META.other;
    const date = f.date ? new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const dlUrl = getPublicUrl(f.key);
    const delBtn = isAdmin
      ? `<button class="del-btn" onclick="openDeleteModal('${esc(f.id)}','${esc(f.key)}')" title="Delete">🗑</button>`
      : '';

    return `<div class="file-card ${m.cls}">
      <div class="card-top">
        <div class="card-icon">${m.icon}</div>
        <span class="card-badge ${m.badge}">${m.label}</span>
      </div>
      <div>
        <div class="card-title">${esc(f.name)}</div>
        ${f.desc ? `<div class="card-desc" style="margin-top:6px">${esc(f.desc)}</div>` : ''}
      </div>
      <div class="card-meta">
        ${f.version ? `<span class="meta-item">🏷 v${esc(f.version)}</span>` : ''}
        ${f.size ? `<span class="meta-item">📦 ${esc(f.size)}</span>` : ''}
        ${date ? `<span class="meta-item">📅 ${date}</span>` : ''}
      </div>
      <div class="card-actions">
        <a class="dl-btn" href="${esc(dlUrl)}" download="${esc(f.filename || f.name)}" target="_blank">⬇ Download</a>
        ${delBtn}
      </div>
    </div>`;
  }).join('');
}

function grid() { return document.getElementById('fileGrid'); }
function emptyHTML(icon, title, msg) {
  return `<div class="empty-state"><div class="big">${icon}</div><h3>${esc(title)}</h3><p>${esc(msg)}</p></div>`;
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── UPLOAD ────────────────────────────────────────────────────
async function addFile() {
  const name = document.getElementById('up_name').value.trim();
  const cat = document.getElementById('up_cat').value;
  const ver = document.getElementById('up_ver').value.trim();
  const desc = document.getElementById('up_desc').value.trim();

  if (!name) { showToast('⚠ Please enter a file name.'); return; }
  if (!selectedFile) { showToast('⚠ Please select a file first.'); return; }

  const addBtn = document.querySelector('.upload-actions .btn-primary');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  addBtn.disabled = true;
  addBtn.textContent = '⏳ Uploading...';
  progressWrap.style.display = 'block';
  progressText.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = 'Step 1/2 — Uploading file to storage…';

  try {
    // Step 1: Upload binary to Supabase Storage
    const storageKey = `${Date.now()}_${selectedFile.name}`;
    const autoSize = formatBytes(selectedFile.size);

    const uploadRes = await uploadWithProgress(selectedFile, storageKey, progressBar, progressText);
    if (!uploadRes.ok) {
      const errTxt = await uploadRes.text();
      throw new Error(`Storage upload failed (${uploadRes.status}): ${errTxt}`);
    }

    progressBar.style.width = '90%';
    progressText.textContent = 'Step 2/2 — Saving metadata to database…';

    // Step 2: Insert metadata row into Supabase DB
    const metaRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
      method: 'POST',
      headers: { ...sbHeaders(true), 'Prefer': 'return=representation' },
      body: JSON.stringify({
        name: name,
        cat: cat,
        version: ver || null,
        size: autoSize || null,
        description: desc || null,
        filename: selectedFile.name,
        storage_key: storageKey,
      }),
    });
    if (!metaRes.ok) {
      const errTxt = await metaRes.text();
      throw new Error(`DB insert failed (${metaRes.status}): ${errTxt}`);
    }

    progressBar.style.width = '100%';
    progressText.textContent = 'Done!';
    showToast('✅ File uploaded to Supabase!');
    resetUpload();
    await loadFiles();
  } catch (err) {
    showToast('❌ ' + err.message);
  } finally {
    doneUploading(addBtn, progressWrap, progressText);
  }
}

// XHR upload with progress bar (returns promise resolving to response-like object)
function uploadWithProgress(file, storageKey, progressBar, progressText) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(storageKey)}`);
    xhr.setRequestHeader('apikey', SUPABASE_SVC_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_SVC_KEY}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 80);
      progressBar.style.width = pct + '%';
      progressText.textContent = `Step 1/2 — Uploading… ${pct}%`;
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: () => Promise.resolve(xhr.responseText) });
    xhr.onerror = () => resolve({ ok: false, status: 0, text: () => Promise.resolve('Network error') });
    xhr.send(file);
  });
}

function doneUploading(btn, wrap, text) {
  btn.disabled = false;
  btn.textContent = '⬆ Add to Hub';
  wrap.style.display = 'none';
  text.style.display = 'none';
}

function resetUpload() {
  document.getElementById('up_name').value = '';
  document.getElementById('up_ver').value = '';
  document.getElementById('up_size').value = '';
  document.getElementById('up_desc').value = '';
  document.getElementById('dzText').textContent = 'Click or drag & drop your file here';
  document.getElementById('fileInput').value = '';
  selectedFile = null;
  const p = document.getElementById('uploadPanel');
  if (p.classList.contains('open')) toggleUpload();
}

// ── FILE SELECT & DRAG-DROP ───────────────────────────────────
function applyFile(file) {
  selectedFile = file;
  document.getElementById('dzText').textContent = '✅ ' + file.name;
  if (!document.getElementById('up_name').value)
    document.getElementById('up_name').value = file.name.replace(/\.[^.]+$/, '');
  const ext = file.name.split('.').pop().toLowerCase();
  const map = { exe: 'exe', bat: 'bat', cmd: 'bat', vbs: 'vbs', vbe: 'vbs', apk: 'apk', py: 'script', sh: 'script', ps1: 'script', rb: 'script' };
  if (map[ext]) document.getElementById('up_cat').value = map[ext];
}

window.handleFileSelect = e => { const f = e.target.files[0]; if (f) applyFile(f); };

const dz = document.getElementById('dropZone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag-over');
  const f = e.dataTransfer.files[0]; if (f) applyFile(f);
});

// ── FILTER & SEARCH ───────────────────────────────────────────
window.setFilter = cat => {
  currentFilter = cat;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === cat));
  renderFiles();
};

window.toggleUpload = () => {
  const p = document.getElementById('uploadPanel');
  p.classList.toggle('open');
  document.getElementById('uploadToggle').textContent = p.classList.contains('open') ? '✕ Close' : '＋ Upload File';
};

window.addFile = addFile;

// ── ADMIN ─────────────────────────────────────────────────────
window.openAdminModal = () => {
  if (isAdmin) { logout(); return; }
  document.getElementById('adminModal').classList.add('open');
  setTimeout(() => document.getElementById('adminPass').focus(), 80);
};
window.closeAdminModal = () => {
  document.getElementById('adminModal').classList.remove('open');
  document.getElementById('adminPass').value = '';
};
window.verifyAdmin = () => {
  const pass = document.getElementById('adminPass').value;
  if (pass === ADMIN_PASSWORD) {
    isAdmin = true;
    window.closeAdminModal();
    document.getElementById('uploadToggle').style.display = 'flex';
    document.getElementById('adminBtn').textContent = '🔓 Logout';
    renderFiles();
    showToast('✅ Admin mode enabled!');
  } else {
    showToast('❌ Wrong password.');
    document.getElementById('adminPass').value = '';
  }
};
function logout() {
  isAdmin = false;
  document.getElementById('uploadToggle').style.display = 'none';
  document.getElementById('adminBtn').textContent = '🔐 Admin';
  if (document.getElementById('uploadPanel').classList.contains('open')) window.toggleUpload();
  renderFiles();
  showToast('Logged out.');
}

// ── DELETE ────────────────────────────────────────────────────
window.openDeleteModal = (id, storageKey) => {
  deleteTarget = { id, storageKey };
  document.getElementById('deleteModal').classList.add('open');
};
window.closeDeleteModal = () => {
  deleteTarget = null;
  document.getElementById('deleteModal').classList.remove('open');
};
window.confirmDelete = async () => {
  if (!deleteTarget) return;
  const { id, storageKey } = deleteTarget;
  try {
    // Step 1: Delete from Storage
    const storRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(storageKey)}`,
      { method: 'DELETE', headers: sbHeaders(true) }
    );
    if (!storRes.ok && storRes.status !== 404) {
      const err = await storRes.text();
      throw new Error(`Storage delete failed: ${err}`);
    }
    // Step 2: Delete DB row
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/files?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: sbHeaders(true) }
    );
    if (!dbRes.ok) {
      const err = await dbRes.text();
      throw new Error(`DB delete failed: ${err}`);
    }
    window.closeDeleteModal();
    showToast('🗑 File deleted from Supabase.');
    await loadFiles();
  } catch (err) {
    showToast('❌ ' + err.message);
  }
};

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, dur = 3200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), dur);
}

// ── MODAL CLOSE ON OVERLAY ────────────────────────────────────
document.getElementById('adminModal').addEventListener('click', e => { if (e.target === e.currentTarget) window.closeAdminModal(); });
document.getElementById('deleteModal').addEventListener('click', e => { if (e.target === e.currentTarget) window.closeDeleteModal(); });

// ── BOOT ──────────────────────────────────────────────────────
loadFiles();
