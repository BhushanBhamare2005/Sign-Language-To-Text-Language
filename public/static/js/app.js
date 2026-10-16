// ─────────────────────────────────────────────
//  SignBridge — app.js
// ─────────────────────────────────────────────

const API_BASE = window.API_BASE || '';

// ── STATE ──────────────────────────────────────
let state = {
  user: null,
  history: [],
  sessionSigns: 0,
  sessionAccuracies: [],
  cameraActive: false,
  stream: null,
  converting: false,
  convertInterval: null,
  currentOutput: '',
  settings: {
    autoTranslate: true,
    autoSpeak: false,
    autoSave: true,
    darkMode: true,
    confThreshold: 70,
    apiUrl: 'http://localhost:5000'
  }
};

// ── BOOT ───────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  const saved = localStorage.getItem('sb_user');
  if (saved) {
    state.user = JSON.parse(saved);
    bootApp();
  }
  // pre-load dictionary
  renderDictionary();
});

// ── AUTH ───────────────────────────────────────
function showLogin() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('registerOverlay').style.display = 'none';
}
function showRegister() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('registerOverlay').style.display = 'flex';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Please fill all fields.'; return; }

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      state.user = data.user;
      localStorage.setItem('sb_user', JSON.stringify(state.user));
      bootApp();
    } else {
      errEl.textContent = data.error || 'Login failed.';
    }
  } catch {
    // demo fallback
    state.user = { name: email.split('@')[0], email, plan: 'Free' };
    localStorage.setItem('sb_user', JSON.stringify(state.user));
    bootApp();
  }
}

async function handleRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('registerError');
  errEl.textContent = '';
  if (!name || !email || !password) { errEl.textContent = 'Please fill all fields.'; return; }

  try {
    const res = await fetch(`${API_BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (res.ok) {
      state.user = data.user;
      localStorage.setItem('sb_user', JSON.stringify(state.user));
      bootApp();
    } else {
      errEl.textContent = data.error || 'Registration failed.';
    }
  } catch {
    state.user = { name, email, plan: 'Free' };
    localStorage.setItem('sb_user', JSON.stringify(state.user));
    bootApp();
  }
}

function bootApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('registerOverlay').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  updateUserUI();
  loadHistory();
  updateAnalytics();
}

function handleLogout() {
  stopCamera();
  state.user = null;
  state.history = [];
  localStorage.removeItem('sb_user');
  document.getElementById('app').style.display = 'none';
  showLogin();
}

function updateUserUI() {
  if (!state.user) return;
  const initials = state.user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userName').textContent = state.user.name;
  document.getElementById('userPlan').textContent = (state.user.plan || 'Free') + ' Plan';
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent = state.user.name;
  document.getElementById('profileEmail').textContent = state.user.email;
  document.getElementById('editName').value = state.user.name;
  document.getElementById('editEmail').value = state.user.email;
}

// ── NAVIGATION ─────────────────────────────────
function navigate(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  const page = el.dataset.page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  const titles = {
    converter: 'Live Converter', upload: 'Upload Video',
    history: 'History', translation: 'Translation',
    dictionary: 'Sign Dictionary', analytics: 'Analytics',
    profile: 'Profile', settings: 'Settings'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  if (page === 'history') renderFullHistory();
  if (page === 'analytics') updateAnalytics();
}

// ── CAMERA ─────────────────────────────────────
async function toggleCamera() {
  if (state.cameraActive) {
    stopCamera();
  } else {
    await startCamera();
  }
}

async function startCamera() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const video = document.getElementById('videoFeed');
    video.srcObject = state.stream;
    video.style.display = 'block';
    document.getElementById('videoPlaceholder').style.display = 'none';

    // add live badge
    const area = document.getElementById('videoArea');
    const badge = document.createElement('div');
    badge.id = 'liveBadge';
    badge.className = 'rec-badge';
    badge.innerHTML = '<span class="rec-dot"></span> LIVE';
    area.appendChild(badge);

    state.cameraActive = true;
    document.getElementById('camText').textContent = 'Stop Camera';
    document.getElementById('camIcon').className = 'ti ti-player-stop';
    document.getElementById('statusBadge').textContent = '● RECORDING';
    document.getElementById('statusBadge').style.background = 'rgba(239,68,68,.12)';
    document.getElementById('statusBadge').style.color = '#EF4444';

    // Start sending frames for conversion every 2s
    state.convertInterval = setInterval(captureAndConvert, 2000);
  } catch (e) {
    toast('Camera access denied or unavailable.');
  }
}

function stopCamera() {
  if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
  clearInterval(state.convertInterval);
  const video = document.getElementById('videoFeed');
  video.style.display = 'none';
  video.srcObject = null;
  document.getElementById('videoPlaceholder').style.display = 'flex';
  const badge = document.getElementById('liveBadge');
  if (badge) badge.remove();
  state.cameraActive = false;
  document.getElementById('camText').textContent = 'Start Camera';
  document.getElementById('camIcon').className = 'ti ti-player-play';
  document.getElementById('statusBadge').textContent = '● READY';
  document.getElementById('statusBadge').style.background = '';
  document.getElementById('statusBadge').style.color = '';
}

async function captureAndConvert() {
  const video = document.getElementById('videoFeed');
  if (!video.srcObject) return;
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 240;
  canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);
  const frame = canvas.toDataURL('image/jpeg', 0.6);
  const signLang = document.getElementById('signLangSelect').value;
  const start = Date.now();

  try {
    const res = await fetch(`${API_BASE}/api/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame, sign_language: signLang })
    });
    const data = await res.json();
    const latency = ((Date.now() - start) / 1000).toFixed(1);

    if (data.text && data.text !== state.currentOutput) {
      state.currentOutput = data.text;
      typeText(data.text);
      updateConfidence(data.confidence || 0.87);
      updateStats(data.text, data.confidence || 0.87, latency);
      if (state.settings.autoTranslate) translateOutput();
      if (state.settings.autoSpeak) speakOutput();
      if (state.settings.autoSave) saveToHistorySilent(data.text, signLang);
    }
    document.getElementById('statLatency').textContent = latency + 's';
  } catch {
    // demo mode: cycle sample phrases
    demoConvert(signLang);
  }
}

// Demo fallback when backend unavailable
const demoData = [
  { text: 'Hello, how are you?', confidence: 0.92 },
  { text: 'My name is Arjun.', confidence: 0.88 },
  { text: 'Thank you very much!', confidence: 0.95 },
  { text: 'Good morning!', confidence: 0.90 },
  { text: 'Nice to meet you.', confidence: 0.85 },
  { text: 'Where is the library?', confidence: 0.78 },
  { text: 'I need help please.', confidence: 0.82 },
];
let demoIdx = 0;
function demoConvert(lang) {
  const d = demoData[demoIdx % demoData.length]; demoIdx++;
  state.currentOutput = d.text;
  typeText(d.text);
  updateConfidence(d.confidence);
  updateStats(d.text, d.confidence, (Math.random() * 0.8 + 0.6).toFixed(1));
  document.getElementById('statLatency').textContent = (Math.random() * 0.8 + 0.6).toFixed(1) + 's';
  if (state.settings.autoTranslate) translateOutput();
  if (state.settings.autoSpeak) speakOutput();
  if (state.settings.autoSave) saveToHistorySilent(d.text, lang);
}

// ── VIDEO UPLOAD ────────────────────────────────
function handleVideoUpload(event) {
  const file = event.target.files[0];
  if (file) processFile(file);
}
function handleDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) processFile(file);
}
async function processUpload(event) { handleVideoUpload(event); }

async function processFile(file) {
  const statusEl = document.getElementById('uploadStatus');
  const resultEl = document.getElementById('uploadResult');
  if (!statusEl) return;
  statusEl.innerHTML = `<div style="color:var(--text2)"><i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Processing ${file.name}...</div><div class="progress-bar"><div class="progress-fill" id="uploadProgress" style="width:0%"></div></div>`;
  resultEl.innerHTML = '';

  // simulate upload progress
  let p = 0;
  const prog = setInterval(() => {
    p = Math.min(p + Math.random() * 15, 90);
    const el = document.getElementById('uploadProgress');
    if (el) el.style.width = p + '%';
  }, 300);

  const formData = new FormData();
  formData.append('video', file);
  formData.append('sign_language', document.getElementById('signLangSelect')?.value || 'ASL');

  try {
    const res = await fetch(`${API_BASE}/api/convert_video`, { method: 'POST', body: formData });
    const data = await res.json();
    clearInterval(prog);
    const el = document.getElementById('uploadProgress');
    if (el) el.style.width = '100%';
    setTimeout(() => {
      statusEl.innerHTML = `<div style="color:var(--green)"><i class="ti ti-check"></i> Processed successfully</div>`;
      resultEl.innerHTML = `<div class="translated-box"><div class="lang-tag">Result</div>${data.text || 'No text detected'}</div>`;
      state.currentOutput = data.text || '';
      if (data.text) { typeText(data.text); updateConfidence(data.confidence || .8); }
    }, 400);
  } catch {
    clearInterval(prog);
    statusEl.innerHTML = '<div style="color:var(--text2)">Backend unavailable — demo result shown</div>';
    const sample = demoData[Math.floor(Math.random() * demoData.length)];
    resultEl.innerHTML = `<div class="translated-box"><div class="lang-tag">Demo Result</div>${sample.text}</div>`;
  }
}

// ── TEXT ANIMATION ──────────────────────────────
function typeText(text) {
  const el = document.getElementById('outputText');
  el.innerHTML = '';
  let i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      el.innerHTML = text.slice(0, ++i) + '<span class="output-cursor"></span>';
    } else {
      clearInterval(interval);
      el.innerHTML = text;
    }
  }, 45);
}

function updateConfidence(conf) {
  const pct = Math.round(conf * 100);
  document.getElementById('confFill').style.width = pct + '%';
  document.getElementById('confPct').textContent = pct + '%';
  document.getElementById('confLabel').textContent = `Confidence: ${pct}%`;
}

function updateStats(text, conf, latency) {
  const words = text.trim().split(/\s+/).length;
  state.sessionSigns += words;
  state.sessionAccuracies.push(conf);
  const avg = state.sessionAccuracies.reduce((a, b) => a + b, 0) / state.sessionAccuracies.length;
  document.getElementById('statSigns').textContent = state.sessionSigns;
  document.getElementById('statAccuracy').textContent = Math.round(avg * 100) + '%';
  document.getElementById('statLatency').textContent = latency + 's';
}

// ── OUTPUT ACTIONS ──────────────────────────────
function copyOutput() {
  const text = document.getElementById('outputText').innerText;
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard!'));
}
function speakOutput() {
  const text = document.getElementById('outputText').innerText;
  if (!text || text === 'Converted text will appear here...') return;
  const utter = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utter);
}
function clearOutput() {
  document.getElementById('outputText').innerHTML = '<span class="placeholder-hint">Converted text will appear here...</span>';
  document.getElementById('confFill').style.width = '0%';
  document.getElementById('confPct').textContent = '–';
  document.getElementById('confLabel').textContent = 'Confidence: –';
  state.currentOutput = '';
}
function exportResult() {
  const text = document.getElementById('outputText').innerText;
  if (!text) { toast('Nothing to export.'); return; }
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'signbridge_output.txt'; a.click();
}
function shareResult() {
  const text = document.getElementById('outputText').innerText;
  if (navigator.share) {
    navigator.share({ title: 'SignBridge Result', text });
  } else {
    navigator.clipboard.writeText(text).then(() => toast('Copied to share!'));
  }
}

// ── TRANSLATION ────────────────────────────────
const langNames = { hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German', ar: 'Arabic', ja: 'Japanese', mr: 'Marathi', zh: 'Chinese', pt: 'Portuguese', en: 'English' };

// Simple client-side demo translations for common phrases
const demoTranslations = {
  hi: { 'Hello, how are you?': 'नमस्ते, आप कैसे हैं?', 'My name is Arjun.': 'मेरा नाम अर्जुन है।', 'Thank you very much!': 'बहुत बहुत धन्यवाद!', 'Good morning!': 'सुप्रभात!', 'Nice to meet you.': 'आपसे मिलकर अच्छा लगा।', 'Where is the library?': 'पुस्तकालय कहाँ है?', 'I need help please.': 'मुझे मदद चाहिए।' },
  es: { 'Hello, how are you?': '¡Hola, cómo estás?', 'Thank you very much!': '¡Muchas gracias!', 'Good morning!': '¡Buenos días!' },
  fr: { 'Hello, how are you?': 'Bonjour, comment allez-vous?', 'Thank you very much!': 'Merci beaucoup!', 'Good morning!': 'Bonjour!' },
  mr: { 'Hello, how are you?': 'नमस्कार, तुम्ही कसे आहात?', 'Thank you very much!': 'खूप खूप धन्यवाद!', 'Good morning!': 'शुभ सकाळ!' }
};

async function translateOutput() {
  const text = state.currentOutput || document.getElementById('outputText').innerText;
  if (!text || text.includes('will appear here')) return;
  const toLang = document.getElementById('toLang').value;
  const box = document.getElementById('translatedBox');
  document.getElementById('translatedLangTag').textContent = langNames[toLang] || toLang;

  // Try backend first
  try {
    const res = await fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, from_lang: 'en', to_lang: toLang })
    });
    const data = await res.json();
    if (data.translated) {
      box.innerHTML = `<div class="lang-tag">${langNames[toLang] || toLang}</div>${data.translated}`;
      return;
    }
  } catch {}

  // Demo fallback
  const map = demoTranslations[toLang] || {};
  const translated = map[text] || `[${langNames[toLang] || toLang}] ${text}`;
  box.innerHTML = `<div class="lang-tag">${langNames[toLang] || toLang}</div>${translated}`;
}

function swapLang() {
  const from = document.getElementById('fromLang');
  const to = document.getElementById('toLang');
  [from.value, to.value] = [to.value, from.value];
  translateOutput();
}

// Translation page
let translateTimer;
function liveTranslate() {
  clearTimeout(translateTimer);
  translateTimer = setTimeout(async () => {
    const text = document.getElementById('tInputText').value.trim();
    if (!text) return;
    const toLang = document.getElementById('tToLang').value;
    const outEl = document.getElementById('tOutput');
    document.getElementById('tOutputLang').textContent = langNames[toLang] || toLang;

    try {
      const res = await fetch(`${API_BASE}/api/translate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from_lang: 'en', to_lang: toLang })
      });
      const data = await res.json();
      if (data.translated) { outEl.innerHTML = `<div class="lang-tag">${langNames[toLang]}</div>${data.translated}`; return; }
    } catch {}

    const map = demoTranslations[toLang] || {};
    outEl.innerHTML = `<div class="lang-tag">${langNames[toLang] || toLang}</div>${map[text] || '[Demo] ' + text}`;
  }, 500);
}
function copyTranslation() {
  const text = document.getElementById('tOutput').innerText;
  navigator.clipboard.writeText(text).then(() => toast('Copied!'));
}
function speakTranslation() {
  const text = document.getElementById('tOutput').innerText;
  const utter = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utter);
}

// ── HISTORY ────────────────────────────────────
function saveToHistory() {
  const text = document.getElementById('outputText').innerText;
  if (!text || text.includes('will appear here')) { toast('Nothing to save.'); return; }
  saveToHistorySilent(text, document.getElementById('signLangSelect').value);
  toast('Saved to history!');
}

function saveToHistorySilent(text, lang) {
  const entry = { id: Date.now(), text, lang, time: new Date().toISOString(), signs: text.trim().split(/\s+/).length };
  state.history.unshift(entry);
  if (state.history.length > 100) state.history.pop();
  localStorage.setItem('sb_history', JSON.stringify(state.history));
  renderRecentHistory();
  document.getElementById('histCount').textContent = state.history.length;
}

function loadHistory() {
  const saved = localStorage.getItem('sb_history');
  if (saved) state.history = JSON.parse(saved);
  renderRecentHistory();
  document.getElementById('histCount').textContent = state.history.length;
}

function renderRecentHistory() {
  const el = document.getElementById('recentHistory');
  if (!state.history.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i><p>No history yet</p></div>'; return; }
  el.innerHTML = state.history.slice(0, 4).map(h => `
    <div class="hist-item" onclick="loadHistoryItem('${h.id}')">
      <div class="hist-thumb"><i class="ti ti-video" style="color:var(--accent)"></i></div>
      <div class="hist-body"><p>${h.text}</p><small>${timeAgo(h.time)} · ${h.signs} signs</small></div>
      <span class="hist-tag tag-${h.lang}">${h.lang}</span>
    </div>`).join('');
}

function renderFullHistory() {
  const query = document.getElementById('histSearch')?.value.toLowerCase() || '';
  const filter = document.getElementById('histFilter')?.value || '';
  let items = state.history.filter(h =>
    (!query || h.text.toLowerCase().includes(query)) &&
    (!filter || h.lang === filter)
  );
  const el = document.getElementById('historyFull');
  if (!items.length) { el.innerHTML = '<div class="empty-state large"><i class="ti ti-inbox"></i><p>No history found.</p></div>'; return; }
  el.innerHTML = items.map(h => `
    <div class="hist-full-item">
      <span class="hist-tag tag-${h.lang}" style="font-size:12px;padding:5px 10px">${h.lang}</span>
      <div class="hist-full-body">
        <p>${h.text}</p>
        <small>${new Date(h.time).toLocaleString()} · ${h.signs} signs</small>
      </div>
      <div class="hist-full-actions">
        <button class="out-btn" onclick="navigator.clipboard.writeText('${h.text.replace(/'/g, "\\'")}').then(()=>toast('Copied!'))"><i class="ti ti-copy"></i></button>
        <button class="out-btn" onclick="deleteHistoryItem(${h.id})"><i class="ti ti-trash" style="color:var(--red)"></i></button>
      </div>
    </div>`).join('');
}

function filterHistory() { renderFullHistory(); }
function clearHistory() {
  if (!confirm('Clear all history?')) return;
  state.history = [];
  localStorage.removeItem('sb_history');
  renderRecentHistory();
  renderFullHistory();
  document.getElementById('histCount').textContent = '0';
  toast('History cleared.');
}
function deleteHistoryItem(id) {
  state.history = state.history.filter(h => h.id !== id);
  localStorage.setItem('sb_history', JSON.stringify(state.history));
  renderFullHistory();
  renderRecentHistory();
  document.getElementById('histCount').textContent = state.history.length;
}
function loadHistoryItem(id) {
  const h = state.history.find(i => i.id == id);
  if (!h) return;
  state.currentOutput = h.text;
  typeText(h.text);
  navigate(document.querySelector('[data-page="converter"]'));
}

// ── DICTIONARY ─────────────────────────────────
const dictData = [
  { name: 'Hello', icon: '👋', lang: 'ASL', desc: 'Wave hand side to side' },
  { name: 'Thank You', icon: '🙏', lang: 'ASL', desc: 'Touch chin, move forward' },
  { name: 'Please', icon: '🤲', lang: 'ASL', desc: 'Rub palm on chest' },
  { name: 'Sorry', icon: '✋', lang: 'ASL', desc: 'Fist circles on chest' },
  { name: 'Yes', icon: '✊', lang: 'ASL', desc: 'Nod fist up and down' },
  { name: 'No', icon: '🤏', lang: 'ASL', desc: 'Index and middle finger snap' },
  { name: 'Help', icon: '🆘', lang: 'ASL', desc: 'Fist on flat palm, lift' },
  { name: 'Love', icon: '🤟', lang: 'ASL', desc: 'Cross arms over chest' },
  { name: 'Good', icon: '👍', lang: 'ASL', desc: 'Flat hand from chin forward' },
  { name: 'Bad', icon: '👎', lang: 'ASL', desc: 'Flat hand from chin downward' },
  { name: 'Hello', icon: '👋', lang: 'BSL', desc: 'Two-finger salute at brow' },
  { name: 'Thank You', icon: '🙏', lang: 'BSL', desc: 'Flat hand from chin forward' },
  { name: 'Water', icon: '💧', lang: 'ISL', desc: 'W handshape, tap chin' },
  { name: 'Food', icon: '🍽️', lang: 'ISL', desc: 'Fingers to mouth gesture' },
  { name: 'Family', icon: '👨‍👩‍👧', lang: 'ASL', desc: 'F handshape circle forward' },
  { name: 'Friend', icon: '🤝', lang: 'ASL', desc: 'Hook index fingers together' },
];

function renderDictionary() {
  searchDictionary();
}
function searchDictionary() {
  const query = document.getElementById('dictSearch')?.value.toLowerCase() || '';
  const lang = document.getElementById('dictLang')?.value || 'ASL';
  const items = dictData.filter(d => d.lang === lang && (!query || d.name.toLowerCase().includes(query)));
  const el = document.getElementById('dictGrid');
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-search"></i><p>No signs found</p></div>'; return; }
  el.innerHTML = items.map(d => `
    <div class="dict-card">
      <div class="sign-icon">${d.icon}</div>
      <div class="sign-name">${d.name}</div>
      <div class="sign-lang">${d.lang}</div>
      <div class="sign-desc">${d.desc}</div>
    </div>`).join('');
}

// ── ANALYTICS ─────────────────────────────────
function updateAnalytics() {
  document.getElementById('totalConversions').textContent = state.history.length;
  document.getElementById('totalSigns').textContent = state.history.reduce((s, h) => s + (h.signs || 0), 0);
  const accs = state.sessionAccuracies;
  document.getElementById('avgAccuracyAll').textContent = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length * 100) + '%' : '–';
  drawCharts();
}

function drawCharts() {
  // Line chart — last 7 days
  const lineCanvas = document.getElementById('lineChart');
  if (!lineCanvas) return;
  const ctx = lineCanvas.getContext('2d');
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const values = days.map(() => Math.floor(Math.random() * 15));
  ctx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
  ctx.strokeStyle = '#4F8EF7'; ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = 30 + i * (lineCanvas.width - 60) / 6;
    const y = lineCanvas.height - 30 - v * (lineCanvas.height - 50) / 20;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#8B93B3'; ctx.font = '11px DM Sans';
  days.forEach((d, i) => {
    const x = 30 + i * (lineCanvas.width - 60) / 6;
    ctx.fillText(d, x - 8, lineCanvas.height - 10);
  });

  // Donut chart
  const donutCanvas = document.getElementById('donutChart');
  if (!donutCanvas) return;
  const dc = donutCanvas.getContext('2d');
  const langs = [{ label: 'ASL', color: '#4F8EF7', v: 60 }, { label: 'BSL', color: '#7C5CF6', v: 25 }, { label: 'ISL', color: '#22C97A', v: 15 }];
  let start = -Math.PI / 2;
  const cx = 100, cy = 100, r = 70, ri = 45;
  dc.clearRect(0, 0, donutCanvas.width, donutCanvas.height);
  langs.forEach(l => {
    const angle = (l.v / 100) * 2 * Math.PI;
    dc.beginPath(); dc.moveTo(cx, cy);
    dc.arc(cx, cy, r, start, start + angle);
    dc.closePath(); dc.fillStyle = l.color; dc.fill();
    start += angle;
  });
  dc.beginPath(); dc.arc(cx, cy, ri, 0, 2 * Math.PI);
  dc.fillStyle = '#111520'; dc.fill();
  dc.fillStyle = '#F0F4FF'; dc.font = '12px Syne'; dc.textAlign = 'center';
  dc.fillText('Langs', cx, cy - 4); dc.fillText('Used', cx, cy + 12);
  let ly = 30;
  langs.forEach(l => {
    dc.fillStyle = l.color; dc.fillRect(210, ly - 10, 12, 12);
    dc.fillStyle = '#8B93B3'; dc.font = '12px DM Sans'; dc.textAlign = 'left';
    dc.fillText(`${l.label} ${l.v}%`, 228, ly); ly += 22;
  });
}

// ── PROFILE ────────────────────────────────────
function saveProfile() {
  const name = document.getElementById('editName').value.trim();
  if (!name) return;
  state.user.name = name;
  localStorage.setItem('sb_user', JSON.stringify(state.user));
  updateUserUI();
  document.getElementById('profileMsg').textContent = '✓ Profile saved!';
  setTimeout(() => document.getElementById('profileMsg').textContent = '', 2500);
}

// ── SETTINGS ───────────────────────────────────
function loadSettings() {
  const saved = localStorage.getItem('sb_settings');
  if (saved) state.settings = { ...state.settings, ...JSON.parse(saved) };
  document.getElementById('autoTranslate').checked = state.settings.autoTranslate;
  document.getElementById('autoSpeak').checked = state.settings.autoSpeak;
  document.getElementById('autoSave').checked = state.settings.autoSave;
  document.getElementById('darkMode').checked = state.settings.darkMode;
  document.getElementById('confThreshold').value = state.settings.confThreshold;
  document.getElementById('confThreshVal').textContent = state.settings.confThreshold + '%';
  document.getElementById('apiUrl').value = state.settings.apiUrl;
}
function saveSettings() {
  state.settings.autoTranslate = document.getElementById('autoTranslate').checked;
  state.settings.autoSpeak = document.getElementById('autoSpeak').checked;
  state.settings.autoSave = document.getElementById('autoSave').checked;
  state.settings.darkMode = document.getElementById('darkMode').checked;
  state.settings.confThreshold = parseInt(document.getElementById('confThreshold').value);
  state.settings.apiUrl = document.getElementById('apiUrl').value;
  localStorage.setItem('sb_settings', JSON.stringify(state.settings));
  document.getElementById('settingsMsg').textContent = '✓ Settings saved!';
  setTimeout(() => document.getElementById('settingsMsg').textContent = '', 2500);
  toast('Settings saved.');
}

// ── UTILS ──────────────────────────────────────
function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)}d ago`;
}

window.addEventListener('beforeunload', stopCamera);
