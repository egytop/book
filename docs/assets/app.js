(() => {
  'use strict';

  const el = (sel, root = document) => root.querySelector(sel);
  const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const PREF_KEY = 'hurras_reader_prefs_v1';
  const LAST_CH_KEY = 'hurras_last_chapter_v1';

  let novel = null;      // decrypted { title, seriesTitle, author, parts, chapters }
  let currentChapter = 0;

  // ---------------- crypto ----------------
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function decryptNovel(password, payload) {
    const enc = new TextEncoder();
    const salt = b64ToBytes(payload.salt);
    const iv = b64ToBytes(payload.iv);
    const ciphertext = b64ToBytes(payload.ciphertext);

    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: payload.iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    const text = new TextDecoder().decode(plainBuf);
    return JSON.parse(text);
  }

  // ---------------- gate ----------------
  function setupGate() {
    const form = el('#gateForm');
    const input = el('#gatePassword');
    const msg = el('#gateMsg');
    const doorway = el('.doorway');
    const doorL = el('.door-left');
    const doorR = el('.door-right');
    const gate = el('#gate');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = input.value;
      if (!pw) return;
      msg.textContent = 'جاري فتح الباب…';

      try {
        const res = await fetch('data/novel.enc.json');
        const payload = await res.json();
        const data = await decryptNovel(pw, payload);
        novel = data;

        doorway.classList.add('open');
        doorL.classList.add('open');
        doorR.classList.add('open');
        msg.textContent = '';

        setTimeout(() => {
          gate.classList.add('unlocked');
          el('#reader').classList.remove('hidden');
          initReader();
        }, 700);

      } catch (err) {
        msg.textContent = 'كلمة السر غير صحيحة، حاول تاني.';
        doorL.classList.add('shake');
        doorR.classList.add('shake');
        setTimeout(() => {
          doorL.classList.remove('shake');
          doorR.classList.remove('shake');
        }, 450);
      }
    });
  }

  // ---------------- reader ----------------
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { font: 'amiri', size: 18, color: '#16233d', theme: 'paper' };
  }

  function savePrefs(prefs) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  const FONT_MAP = {
    amiri: "'Amiri', serif",
    cairo: "'Cairo', sans-serif",
    arefruqaa: "'Aref Ruqaa', serif",
    tajawal: "'Tajawal', sans-serif",
    lateef: "'Lateef', serif",
  };

  let prefs = loadPrefs();

  function applyPrefs() {
    const view = el('#chapterView');
    view.style.fontFamily = FONT_MAP[prefs.font] || FONT_MAP.amiri;
    view.style.fontSize = prefs.size + 'px';
    view.style.color = prefs.color;

    document.body.classList.remove('theme-paper', 'theme-sepia', 'theme-night');
    document.body.classList.add('theme-' + prefs.theme);

    els('.font-opt').forEach(b => b.classList.toggle('active', b.dataset.font === prefs.font));
    els('.color-opt').forEach(b => b.classList.toggle('active', b.dataset.color === prefs.color));
    els('.theme-opt').forEach(b => b.classList.toggle('active', b.dataset.theme === prefs.theme));
    el('#sizeVal').textContent = prefs.size;
  }

  function buildToc() {
    const list = el('#tocList');
    list.innerHTML = '';
    novel.parts.forEach(part => {
      const label = document.createElement('div');
      label.className = 'toc-part';
      label.textContent = part.title;
      list.appendChild(label);
      part.chapterIds.forEach(id => {
        const ch = novel.chapters[id];
        const btn = document.createElement('button');
        btn.className = 'toc-chapter';
        btn.textContent = ch.title;
        btn.dataset.id = id;
        btn.addEventListener('click', () => {
          goToChapter(id);
          closeDrawers();
        });
        list.appendChild(btn);
      });
    });
  }

  function renderChapter(id) {
    currentChapter = id;
    const ch = novel.chapters[id];
    const view = el('#chapterView');
    view.innerHTML = '';

    const part = novel.parts.find(p => p.chapterIds.includes(id));
    if (part) {
      const partLabel = document.createElement('div');
      partLabel.className = 'ch-part-label';
      partLabel.textContent = part.title;
      view.appendChild(partLabel);
    }

    const title = document.createElement('h2');
    title.className = 'ch-title';
    title.textContent = ch.title;
    view.appendChild(title);

    ch.paragraphs.forEach(p => {
      const node = document.createElement('p');
      node.className = p.q ? 'ch-quote' : 'ch-para';
      node.textContent = p.t;
      view.appendChild(node);
    });

    els('.toc-chapter').forEach(b => b.classList.toggle('active', Number(b.dataset.id) === id));
    el('#btnPrev').disabled = id <= 0;
    el('#btnNext').disabled = id >= novel.chapters.length - 1;

    view.scrollIntoView({ block: 'start' });
    window.scrollTo(0, 0);

    try { localStorage.setItem(LAST_CH_KEY, String(id)); } catch (e) {}
  }

  function goToChapter(id) {
    if (id < 0 || id >= novel.chapters.length) return;
    renderChapter(id);
  }

  function closeDrawers() {
    el('#tocDrawer').classList.remove('open');
    el('#settingsDrawer').classList.remove('open');
    el('#drawerOverlay').classList.add('hidden');
  }
  function openDrawer(which) {
    el(which).classList.add('open');
    el('#drawerOverlay').classList.remove('hidden');
  }

  function setupReaderChrome() {
    el('#btnToc').addEventListener('click', () => openDrawer('#tocDrawer'));
    el('#btnTocClose').addEventListener('click', closeDrawers);
    el('#btnSettings').addEventListener('click', () => openDrawer('#settingsDrawer'));
    el('#btnSettingsClose').addEventListener('click', closeDrawers);
    el('#drawerOverlay').addEventListener('click', closeDrawers);

    el('#btnPrev').addEventListener('click', () => goToChapter(currentChapter - 1));
    el('#btnNext').addEventListener('click', () => goToChapter(currentChapter + 1));

    els('.font-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        prefs.font = btn.dataset.font;
        savePrefs(prefs);
        applyPrefs();
      });
    });

    el('#sizeDown').addEventListener('click', () => {
      prefs.size = Math.max(14, prefs.size - 1);
      savePrefs(prefs);
      applyPrefs();
    });
    el('#sizeUp').addEventListener('click', () => {
      prefs.size = Math.min(30, prefs.size + 1);
      savePrefs(prefs);
      applyPrefs();
    });

    els('.color-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        prefs.color = btn.dataset.color;
        savePrefs(prefs);
        applyPrefs();
      });
    });
    el('#colorCustom').addEventListener('input', (e) => {
      prefs.color = e.target.value;
      savePrefs(prefs);
      applyPrefs();
    });

    els('.theme-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        prefs.theme = btn.dataset.theme;
        savePrefs(prefs);
        applyPrefs();
      });
    });
  }

  function initReader() {
    el('.rh-book').textContent = novel.title;
    el('.rh-series').textContent = novel.seriesTitle;
    buildToc();
    setupReaderChrome();
    applyPrefs();

    let startChapter = 0;
    try {
      const saved = localStorage.getItem(LAST_CH_KEY);
      if (saved !== null) {
        const n = Number(saved);
        if (n >= 0 && n < novel.chapters.length) startChapter = n;
      }
    } catch (e) {}

    renderChapter(startChapter);
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupGate();
    el('#gatePassword').focus();
  });
})();
