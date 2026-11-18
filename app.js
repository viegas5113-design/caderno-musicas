(() => {
  'use strict';

  const STORAGE_KEY = 'caderno_musicas_items_v1';
  const PREFS_KEY = 'caderno_musicas_prefs_v1';

  const CATEGORIES = {
    todas: { label: 'Todas', badge: '🌟 Todas' },
    mar: { label: 'Mar & Pesca', badge: '🌊 Mar & Pesca' },
    terra: { label: 'Terra & Raízes', badge: '🏡 Terra & Raízes' },
    familia: { label: 'Família & Amor', badge: '❤️ Família & Amor' },
    folclore: { label: 'Folclore & Cantigas', badge: '🎶 Folclore & Cantigas' }
  };

  const SEED_ITEMS = [];

  // State
  let items = [];
  let activeCategory = 'todas';
  let searchQuery = '';
  let currentItemId = null;
  let prefs = { readerScale: 1.32, baseFont: 17, darkMode: false };

  // Voice Recognition state
  let recognition = null;
  let isListening = false;
  let toastTimer = null;
  let importToVault = false;

  // DOM Elements
  const itemsGrid = document.getElementById('items-grid');
  const resultsCount = document.getElementById('results-count');
  const searchInput = document.getElementById('search-input');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const catButtons = document.querySelectorAll('.cat-btn');
  const offlineBadge = document.getElementById('offline-badge');

  const btnNew = document.getElementById('btn-new');
  const btnImport = document.getElementById('btn-import');
  const btnBackup = document.getElementById('btn-backup');
  const btnVault = document.getElementById('btn-vault');
  const btnClearPanel = document.getElementById('btn-clear-panel');
  const vaultCount = document.getElementById('vault-count');
  const fileInput = document.getElementById('file-input');

  const btnTheme = document.getElementById('btn-theme');
  const btnFontDown = document.getElementById('btn-font-down');
  const btnFontUp = document.getElementById('btn-font-up');

  // Reader modal
  const readerModal = document.getElementById('reader-modal');
  const readerTitle = document.getElementById('reader-title');
  const readerDate = document.getElementById('reader-date');
  const readerAudioWrap = document.getElementById('reader-audio-wrap');
  const readerAudio = document.getElementById('reader-audio');
  const readerBody = document.getElementById('reader-body');
  let currentAudioUrl = null;
  const readerCatBadge = document.getElementById('reader-cat-badge');
  const readerStyleBadge = document.getElementById('reader-style-badge');
  const readerFontDown = document.getElementById('reader-font-down');
  const readerFontUp = document.getElementById('reader-font-up');
  const btnCopy = document.getElementById('btn-copy');
  const btnShare = document.getElementById('btn-share');
  const btnToggleVault = document.getElementById('btn-toggle-vault');
  const btnEdit = document.getElementById('btn-edit');
  const btnDelete = document.getElementById('btn-delete');
  const shareFallback = document.getElementById('share-fallback');
  const shareWhatsapp = document.getElementById('share-whatsapp');
  const shareFacebook = document.getElementById('share-facebook');

  // Editor modal
  const editorModal = document.getElementById('editor-modal');
  const editorHeading = document.getElementById('editor-heading');
  const editorForm = document.getElementById('editor-form');
  const editId = document.getElementById('edit-id');
  const editTitle = document.getElementById('edit-title');
  const editCategory = document.getElementById('edit-category');
  const editStyle = document.getElementById('edit-style');
  const editContent = document.getElementById('edit-content');
  const editVault = document.getElementById('edit-vault');
  const btnVoice = document.getElementById('btn-voice');
  const voiceStatus = document.getElementById('voice-status');

  // Vault modal
  const vaultModal = document.getElementById('vault-modal');
  const vaultSearch = document.getElementById('vault-search');
  const vaultList = document.getElementById('vault-list');
  const btnVaultImport = document.getElementById('btn-vault-import');
  const btnVaultNew = document.getElementById('btn-vault-new');

  const toastEl = document.getElementById('toast');

  // Initialization
  function init() {
    loadPrefs();
    applyPrefs();
    loadItems();
    renderList();
    bindEvents();
    updateOnlineStatus();
    registerServiceWorker();
    loadLocalVaultCatalog();
  }

  async function loadLocalVaultCatalog() {
    try {
      const res = await fetch('./Minhas_Musicas/catalogo.json', { cache: 'no-store' });
      if (!res.ok) return;
      const catalog = await res.json();
      if (!Array.isArray(catalog) || catalog.length === 0) return;

      const existingIds = new Set(items.map((x) => x.id));
      const existingKeys = new Set(items.map((x) => normalizeKey(x.audioName || x.title)));
      let added = 0;
      for (const entry of catalog) {
        const key = normalizeKey(entry && (entry.audioName || entry.title));
        if (entry && entry.id && !existingIds.has(entry.id) && !existingKeys.has(key)) {
          items.push(entry);
          added++;
        }
      }
      if (deduplicateItems() || added > 0) {
        saveItems();
        renderList();
        if (!vaultModal.classList.contains('hidden')) renderVaultList();
      }
    } catch (_) {}
  }

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        prefs = { ...prefs, ...saved };
      }
    } catch (_) {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  function applyPrefs() {
    document.documentElement.style.setProperty('--base-font-size', `${prefs.baseFont}px`);
    document.documentElement.style.setProperty('--reader-font-size', `${prefs.readerScale}rem`);
    document.body.classList.toggle('dark-mode', Boolean(prefs.darkMode));
    btnTheme.textContent = prefs.darkMode ? '☀️' : '🌙';
  }

  function normalizeKey(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function deduplicateItems() {
    const seen = new Map();
    const cleaned = [];
    for (const item of items) {
      if (!item || !item.id || String(item.id).startsWith('seed-')) continue;
      const key = normalizeKey(item.audioName || item.title);
      if (!key) {
        cleaned.push(item);
        continue;
      }
      if (!seen.has(key)) {
        seen.set(key, cleaned.length);
        cleaned.push(item);
      } else {
        const idx = seen.get(key);
        const prev = cleaned[idx];
        // Preferir o que tem letra personalizada ou audioUrl local
        const prevIsPlaceholder = !prev.content || prev.content.startsWith('🎵 ');
        const currIsPlaceholder = !item.content || item.content.startsWith('🎵 ');
        if (prevIsPlaceholder && !currIsPlaceholder) {
          if (prev.hasAudio && !prev.audioUrl) deleteAudioBlob(prev.id);
          cleaned[idx] = item;
        } else if (!prev.audioUrl && item.audioUrl) {
          if (prev.hasAudio && !prev.audioUrl) deleteAudioBlob(prev.id);
          cleaned[idx] = { ...item, content: prevIsPlaceholder ? item.content : prev.content };
        } else {
          if (item.hasAudio && !item.audioUrl) deleteAudioBlob(item.id);
        }
      }
    }
    const changed = cleaned.length !== items.length;
    items = cleaned;
    return changed;
  }

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        items = [];
        saveItems();
      } else {
        const parsed = JSON.parse(raw);
        items = Array.isArray(parsed) ? parsed : [];
      }

      let changed = false;

      // Mover músicas existentes do painel principal para "Minhas Músicas"
      if (!localStorage.getItem('caderno_panel_cleared_v3')) {
        for (const item of items) {
          if (!item.inVault) {
            item.inVault = true;
            changed = true;
          }
        }
        localStorage.setItem('caderno_panel_cleared_v3', '1');
      }

      if (deduplicateItems()) {
        changed = true;
      }

      if (changed) saveItems();
    } catch (_) {
      items = [];
    }
  }

  function saveItems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat('pt-PT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(new Date(iso));
    } catch (_) {
      return '';
    }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 3000);
  }

  // Rendering
  function getFilteredItems() {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter((item) => {
        if (item.inVault) return false;
        if (activeCategory !== 'todas' && item.category !== activeCategory) {
          return false;
        }
        if (!q) return true;
        const haystack = `${item.title}\n${item.content}\n${item.style}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  function renderList() {
    const filtered = getFilteredItems();
    const panelTotal = items.filter((x) => !x.inVault).length;
    const vaultTotal = items.length - panelTotal;
    vaultCount.textContent = String(vaultTotal);
    btnClearPanel.classList.toggle('hidden', panelTotal === 0);

    resultsCount.textContent =
      panelTotal === 0
        ? 'Painel livre para novos temas'
        : filtered.length === panelTotal
          ? `${panelTotal} ${panelTotal === 1 ? 'letra no painel' : 'letras no painel'}`
          : `A mostrar ${filtered.length} de ${panelTotal} letras no painel`;

    itemsGrid.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div style="font-size: 2.2rem;">📖</div>
        <p>${
          searchQuery
            ? 'Nenhuma letra encontrada com essa pesquisa.'
            : panelTotal === 0
              ? 'Painel livre para novos temas. As tuas músicas estão guardadas em "📁 Minhas Músicas".'
              : 'Ainda não tens letras nesta categoria.'
        }</p>
      `;
      itemsGrid.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of filtered) {
      const card = document.createElement('article');
      card.className = 'poem-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Abrir ${item.title}`);

      const catInfo = CATEGORIES[item.category] || CATEGORIES.folclore;

      const badges = document.createElement('div');
      badges.className = 'card-badges';

      const bCat = document.createElement('span');
      bCat.className = 'badge badge-cat';
      bCat.textContent = catInfo.badge;

      const bStyle = document.createElement('span');
      bStyle.className = 'badge badge-style';
      bStyle.textContent = item.style || 'Fado';

      badges.append(bCat, bStyle);

      if (item.hasAudio) {
        const bAudio = document.createElement('span');
        bAudio.className = 'badge badge-audio';
        bAudio.textContent = '🎵 Áudio';
        badges.appendChild(bAudio);
      }

      const title = document.createElement('h3');
      title.className = 'card-title';
      title.textContent = item.title;

      const preview = document.createElement('p');
      preview.className = 'card-preview';
      preview.textContent = item.content;

      const footer = document.createElement('div');
      footer.className = 'card-footer';
      footer.innerHTML = `<span>${formatDate(item.updatedAt)}</span><span>Tocar para ler →</span>`;

      card.append(badges, title, preview, footer);
      card.addEventListener('click', () => openReader(item.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openReader(item.id);
        }
      });

      fragment.appendChild(card);
    }

    itemsGrid.appendChild(fragment);
  }

  // Reader Modal
  async function openReader(id) {
    const item = items.find((x) => x.id === id);
    if (!item) return;

    currentItemId = id;
    const catInfo = CATEGORIES[item.category] || CATEGORIES.folclore;
    readerCatBadge.textContent = catInfo.badge;
    readerStyleBadge.textContent = item.style || 'Fado';
    readerTitle.textContent = item.title;
    readerDate.textContent = `Atualizado em ${formatDate(item.updatedAt)}`;
    readerBody.textContent = item.content;
    btnToggleVault.textContent = item.inVault ? '↩️ Mover para o Painel' : '📁 Guardar em Minhas Músicas';
    shareFallback.classList.add('hidden');

    clearReaderAudio();
    if (item.audioUrl) {
      readerAudio.src = encodeURI(item.audioUrl);
      readerAudioWrap.classList.remove('hidden');
    } else if (item.hasAudio) {
      try {
        const blob = await getAudioBlob(item.id);
        if (blob) {
          currentAudioUrl = URL.createObjectURL(blob);
          readerAudio.src = currentAudioUrl;
          readerAudioWrap.classList.remove('hidden');
        }
      } catch (_) {}
    }

    readerModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function clearReaderAudio() {
    readerAudio.pause();
    readerAudio.removeAttribute('src');
    readerAudio.load();
    readerAudioWrap.classList.add('hidden');
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = null;
    }
  }

  function closeReader() {
    clearReaderAudio();
    readerModal.classList.add('hidden');
    document.body.style.overflow = '';
    currentItemId = null;
  }

  // Editor Modal
  function openEditor(item = null, defaultVault = false) {
    stopVoice();
    voiceStatus.textContent = '';

    if (item) {
      editorHeading.textContent = 'Editar Letra / Poema';
      editId.value = item.id;
      editTitle.value = item.title;
      editCategory.value = item.category || 'mar';
      editStyle.value = item.style || 'Fado';
      editContent.value = item.content;
      editVault.checked = Boolean(item.inVault);
    } else {
      editorHeading.textContent = defaultVault ? 'Guardar em Minhas Músicas' : 'Nova Letra / Poema';
      editId.value = '';
      editTitle.value = '';
      editCategory.value = activeCategory !== 'todas' ? activeCategory : 'mar';
      editStyle.value = 'Fado';
      editContent.value = '';
      editVault.checked = Boolean(defaultVault);
    }

    editorModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => editTitle.focus(), 60);
  }

  function closeEditor() {
    stopVoice();
    editorModal.classList.add('hidden');
    if (readerModal.classList.contains('hidden') && vaultModal.classList.contains('hidden')) {
      document.body.style.overflow = '';
    }
  }

  // Vault ("Minhas Músicas") Modal
  function openVault() {
    vaultSearch.value = '';
    renderVaultList();
    vaultModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeVault() {
    vaultModal.classList.add('hidden');
    if (readerModal.classList.contains('hidden') && editorModal.classList.contains('hidden')) {
      document.body.style.overflow = '';
    }
  }

  function renderVaultList() {
    const q = vaultSearch.value.trim().toLowerCase();
    const vaultItems = items
      .filter((x) => x.inVault)
      .filter((x) => !q || `${x.title}\n${x.content}\n${x.style}`.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    vaultList.innerHTML = '';

    if (vaultItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div style="font-size: 2rem;">📁</div>
        <p>${q ? 'Nenhuma música encontrada em Minhas Músicas.' : 'Ainda não guardaste músicas aqui. Podes mover qualquer letra para cá ou criar uma nova aqui.'}</p>
      `;
      vaultList.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const item of vaultItems) {
      const row = document.createElement('div');
      row.className = 'vault-item';

      const info = document.createElement('div');
      info.className = 'vault-item-info';
      const catInfo = CATEGORIES[item.category] || CATEGORIES.folclore;
      info.innerHTML = `
        <h3 class="vault-item-title">${item.hasAudio ? '🎵 ' : ''}${escapeHtml(item.title)}</h3>
        <div class="vault-item-meta">${escapeHtml(catInfo.badge)} · ${escapeHtml(item.style || 'Fado')} · ${escapeHtml(formatDate(item.updatedAt))}</div>
      `;
      info.addEventListener('click', () => openReader(item.id));

      const actions = document.createElement('div');
      actions.className = 'vault-item-actions';

      const btnOpen = document.createElement('button');
      btnOpen.type = 'button';
      btnOpen.className = 'btn btn-action';
      btnOpen.textContent = '📖 Abrir';
      btnOpen.addEventListener('click', () => openReader(item.id));

      const btnRestore = document.createElement('button');
      btnRestore.type = 'button';
      btnRestore.className = 'btn btn-secondary';
      btnRestore.textContent = '↩️ Painel';
      btnRestore.title = 'Mover de volta para o painel principal';
      btnRestore.addEventListener('click', () => {
        item.inVault = false;
        item.updatedAt = new Date().toISOString();
        saveItems();
        renderList();
        renderVaultList();
        showToast('Movido para o painel principal.');
      });

      actions.append(btnOpen, btnRestore);
      row.append(info, actions);
      frag.appendChild(row);
    }

    vaultList.appendChild(frag);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Copy & Share
  async function copyCurrentItem() {
    const item = items.find((x) => x.id === currentItemId);
    if (!item) return;
    const text = `${item.title}\n\n${item.content}`;

    try {
      await navigator.clipboard.writeText(text);
      showToast('Letra copiada!');
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Letra copiada!');
    }
  }

  async function shareCurrentItem() {
    const item = items.find((x) => x.id === currentItemId);
    if (!item) return;

    const fullText = `${item.title}\n(${item.style})\n\n${item.content}`;
    const encoded = encodeURIComponent(fullText);

    shareWhatsapp.href = `https://wa.me/?text=${encoded}`;
    shareFacebook.href = `https://www.facebook.com/sharer/sharer.php?quote=${encoded}&u=${encodeURIComponent(window.location.href)}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: fullText
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    shareFallback.classList.toggle('hidden');
  }

  // Voice Dictation (Português de Portugal)
  function toggleVoice() {
    if (isListening) {
      stopVoice();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceStatus.textContent = 'O ditado por voz não é suportado neste navegador. Usa o Chrome no telemóvel ou computador.';
      return;
    }

    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'pt-PT';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        isListening = true;
        btnVoice.classList.add('listening');
        btnVoice.textContent = '⏹️ Parar Ditado';
        voiceStatus.textContent = 'A ouvir em Português... fala os teus versos.';
      };

      recognition.onresult = (event) => {
        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += transcript;
          } else {
            interim += transcript;
          }
        }

        if (finalChunk.trim()) {
          const existing = editContent.value;
          const sep = existing && !existing.endsWith('\n') && !existing.endsWith(' ') ? '\n' : '';
          editContent.value = existing + sep + finalChunk.trim();
        }

        voiceStatus.textContent = interim
          ? `A ouvir: "${interim.trim()}"`
          : 'A ouvir em Português... fala os teus versos.';
      };

      recognition.onerror = (event) => {
        const msgMap = {
          'not-allowed': 'Permissão do microfone negada. Autoriza o microfone nas definições.',
          'no-speech': 'Não foi detetada voz. Tenta falar mais perto do microfone.',
          'network': 'O ditado por voz precisa de ligação à internet no Chrome.'
        };
        voiceStatus.textContent = msgMap[event.error] || `Erro no microfone: ${event.error}`;
        stopVoice(false);
      };

      recognition.onend = () => {
        if (isListening) {
          stopVoice(false);
        }
      };

      recognition.start();
    } catch (err) {
      voiceStatus.textContent = 'Não foi possível iniciar o microfone.';
      stopVoice(false);
    }
  }

  function stopVoice(clearStatus = false) {
    isListening = false;
    btnVoice.classList.remove('listening');
    btnVoice.textContent = '🎤 Ditar por Voz (Português)';
    if (clearStatus) voiceStatus.textContent = '';

    if (recognition) {
      try {
        recognition.onend = null;
        recognition.stop();
      } catch (_) {}
      recognition = null;
    }
  }

  // Backup (Export JSON)
  function exportBackup() {
    const payload = {
      app: 'Caderno de Poesia & Músicas',
      exportedAt: new Date().toISOString(),
      items
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `caderno-poesia-musicas-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Cópia de segurança descarregada! Podes guardá-la no Google Drive.');
  }

  // IndexedDB para ficheiros de áudio offline
  function openAudioDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB indisponível'));
      const req = indexedDB.open('caderno_musicas_audio_db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('audio')) {
          db.createObjectStore('audio');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveAudioBlob(id, blob) {
    const db = await openAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audio', 'readwrite');
      tx.objectStore('audio').put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAudioBlob(id) {
    const db = await openAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audio', 'readonly');
      const req = tx.objectStore('audio').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteAudioBlob(id) {
    try {
      const db = await openAudioDb();
      const tx = db.transaction('audio', 'readwrite');
      tx.objectStore('audio').delete(id);
    } catch (_) {}
  }

  function guessCategoryFromTitle(title) {
    const t = title.toLowerCase();
    if (/(mar|marinheiro|porto|cação|barco|pesca|onda|maré|farol)/.test(t)) return 'mar';
    if (/(lagos|sines|burgau|montinhos|terra|sol|calcário|barro)/.test(t)) return 'terra';
    if (/(amor|ti|rosto|família|dedos|neto|coração|mãe|pai)/.test(t)) return 'familia';
    return activeCategory !== 'todas' ? activeCategory : 'folclore';
  }

  // File Import (.txt, .doc, .docx, .rtf, .json, .mp3, .m4a, .wav, .ogg, .flac)
  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    let importedCount = 0;
    const AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'opus']);

    for (const file of fileList) {
      const name = file.name || 'Letra Importada';
      const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

      try {
        if (AUDIO_EXTS.has(ext) || (file.type && file.type.startsWith('audio/'))) {
          const id = generateId();
          await saveAudioBlob(id, file);
          const cleanTitle = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Música Áudio';
          items.unshift({
            id,
            title: cleanTitle,
            category: guessCategoryFromTitle(cleanTitle),
            style: 'Balada',
            hasAudio: true,
            audioName: name,
            inVault: importToVault,
            content: `🎵 Áudio importado: ${name}\n\nCarrega em "✏️ Editar" para escrever ou ditar por voz a letra desta música enquanto a ouves.`,
            updatedAt: new Date().toISOString()
          });
          importedCount++;
          continue;
        }

        if (ext === 'json') {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];
          const existingIds = new Set(items.map((x) => x.id));
          for (const entry of list) {
            if (entry && entry.title && entry.content) {
              const id = entry.id && !existingIds.has(entry.id) ? entry.id : generateId();
              items.push({
                id,
                title: String(entry.title),
                category: CATEGORIES[entry.category] ? entry.category : 'folclore',
                style: entry.style || 'Fado',
                content: String(entry.content),
                inVault: importToVault ? true : Boolean(entry.inVault),
                updatedAt: entry.updatedAt || new Date().toISOString()
              });
              importedCount++;
            }
          }
          continue;
        }

        let content = '';
        if (ext === 'docx') {
          content = await extractDocxText(file);
        } else if (ext === 'doc') {
          content = await extractLegacyDocText(file);
        } else {
          content = await file.text();
          if (ext === 'rtf' || content.trimStart().startsWith('{\\rtf')) {
            content = stripRtf(content);
          }
        }

        content = content.replace(/\r\n/g, '\n').trim();
        if (!content) continue;

        const cleanTitle = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Letra Importada';
        items.unshift({
          id: generateId(),
          title: cleanTitle,
          category: activeCategory !== 'todas' ? activeCategory : 'folclore',
          style: 'Fado',
          inVault: importToVault,
          content,
          updatedAt: new Date().toISOString()
        });
        importedCount++;
      } catch (_) {
        showToast(`Não foi possível ler o ficheiro "${name}".`);
      }
    }

    if (importedCount > 0) {
      deduplicateItems();
      saveItems();
      renderList();
      if (!vaultModal.classList.contains('hidden')) renderVaultList();
      showToast(
        importToVault
          ? `${importedCount} ${importedCount === 1 ? 'música guardada' : 'músicas guardadas'} em Minhas Músicas!`
          : `${importedCount} ${importedCount === 1 ? 'letra importada' : 'letras importadas'} com sucesso!`
      );
    }

    importToVault = false;
    fileInput.value = '';
  }

  function stripRtf(rtf) {
    return rtf
      .replace(/\\par[d]?/g, '\n')
      .replace(/\\line/g, '\n')
      .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\{\\[^{}]*\}/g, '')
      .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
      .replace(/[{}]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function extractLegacyDocText(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 512));

    // Alguns .doc antigos são na verdade RTF ou HTML
    if (head.trimStart().startsWith('{\\rtf')) {
      return stripRtf(new TextDecoder('latin1').decode(bytes));
    }
    if (/<html|<body|<p/i.test(head)) {
      const html = new TextDecoder('utf-8').decode(bytes);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return doc.body ? doc.body.innerText : '';
    }

    // Extração de blocos de texto legíveis (UTF-16LE ou Latin-1) de .doc binário
    const utf16Text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);
    const utf16Runs = utf16Text.match(/[A-Za-zÀ-ÿ0-9 ,.;:!?'"()\-\n\r]{12,}/g) || [];
    const joined16 = utf16Runs.join('\n').trim();
    if (joined16.length > 40) {
      return joined16.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
    }

    const latinText = new TextDecoder('latin1').decode(bytes);
    const latinRuns = latinText.match(/[A-Za-zÀ-ÿ0-9 ,.;:!?'"()\-\n\r]{12,}/g) || [];
    return latinRuns.join('\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function extractDocxText(file) {
    if (typeof DecompressionStream === 'undefined') {
      return extractLegacyDocText(file);
    }

    const buf = await file.arrayBuffer();
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);
    let offset = 0;

    while (offset + 30 < bytes.length) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;

      const compression = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const nameStart = offset + 30;
      const entryName = new TextDecoder('utf-8').decode(bytes.slice(nameStart, nameStart + nameLen));
      const dataStart = nameStart + nameLen + extraLen;
      const dataEnd = dataStart + compSize;

      if (entryName === 'word/document.xml' && compSize > 0) {
        const chunk = bytes.slice(dataStart, dataEnd);
        let xmlText = '';
        if (compression === 0) {
          xmlText = new TextDecoder('utf-8').decode(chunk);
        } else if (compression === 8) {
          const ds = new DecompressionStream('deflate-raw');
          const stream = new Blob([chunk]).stream().pipeThrough(ds);
          xmlText = await new Response(stream).text();
        }

        if (xmlText) {
          const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
          const paragraphs = Array.from(xml.getElementsByTagName('w:p'));
          return paragraphs
            .map((p) => Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent).join(''))
            .join('\n')
            .trim();
        }
      }

      offset = dataEnd;
    }

    return extractLegacyDocText(file);
  }

  // Event Listeners
  function bindEvents() {
    catButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        catButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.cat;
        renderList();
      });
    });

    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      btnClearSearch.classList.toggle('hidden', !searchQuery);
      renderList();
    });

    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      btnClearSearch.classList.add('hidden');
      renderList();
      searchInput.focus();
    });

    btnNew.addEventListener('click', () => openEditor(null, false));
    btnVault.addEventListener('click', openVault);
    btnVaultImport.addEventListener('click', () => {
      importToVault = true;
      fileInput.click();
    });
    btnClearPanel.addEventListener('click', () => {
      let moved = 0;
      for (const item of items) {
        if (!item.inVault) {
          item.inVault = true;
          moved++;
        }
      }
      if (moved > 0) {
        saveItems();
        renderList();
        showToast(`${moved} ${moved === 1 ? 'item movido' : 'itens movidos'} para Minhas Músicas.`);
      }
    });
    btnVaultNew.addEventListener('click', () => openEditor(null, true));
    vaultSearch.addEventListener('input', renderVaultList);
    btnImport.addEventListener('click', () => {
      importToVault = false;
      fileInput.click();
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    btnBackup.addEventListener('click', exportBackup);

    btnTheme.addEventListener('click', () => {
      prefs.darkMode = !prefs.darkMode;
      applyPrefs();
      savePrefs();
    });

    const adjustBaseFont = (delta) => {
      prefs.baseFont = Math.min(24, Math.max(14, prefs.baseFont + delta));
      applyPrefs();
      savePrefs();
    };

    const adjustReaderFont = (delta) => {
      prefs.readerScale = Math.min(2.4, Math.max(1.0, Number((prefs.readerScale + delta).toFixed(2))));
      applyPrefs();
      savePrefs();
    };

    btnFontDown.addEventListener('click', () => adjustBaseFont(-1));
    btnFontUp.addEventListener('click', () => adjustBaseFont(1));
    readerFontDown.addEventListener('click', () => adjustReaderFont(-0.14));
    readerFontUp.addEventListener('click', () => adjustReaderFont(0.14));

    btnCopy.addEventListener('click', copyCurrentItem);
    btnShare.addEventListener('click', shareCurrentItem);

    btnToggleVault.addEventListener('click', () => {
      const item = items.find((x) => x.id === currentItemId);
      if (!item) return;
      item.inVault = !item.inVault;
      item.updatedAt = new Date().toISOString();
      saveItems();
      renderList();
      if (!vaultModal.classList.contains('hidden')) renderVaultList();
      btnToggleVault.textContent = item.inVault ? '↩️ Mover para o Painel' : '📁 Guardar em Minhas Músicas';
      showToast(item.inVault ? 'Guardado em "Minhas Músicas" (oculto do painel).' : 'Movido para o painel principal.');
    });

    btnEdit.addEventListener('click', () => {
      const item = items.find((x) => x.id === currentItemId);
      if (item) {
        closeReader();
        openEditor(item);
      }
    });

    btnDelete.addEventListener('click', () => {
      const item = items.find((x) => x.id === currentItemId);
      if (!item) return;
      if (confirm(`Queres mesmo apagar "${item.title}"?`)) {
        if (item.hasAudio) deleteAudioBlob(item.id);
        items = items.filter((x) => x.id !== currentItemId);
        saveItems();
        closeReader();
        renderList();
        if (!vaultModal.classList.contains('hidden')) renderVaultList();
        showToast('Letra apagada.');
      }
    });

    btnVoice.addEventListener('click', toggleVoice);

    editorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      stopVoice();

      const title = editTitle.value.trim();
      const content = editContent.value.trim();
      if (!title || !content) return;

      const id = editId.value;
      const now = new Date().toISOString();

      if (id) {
        const idx = items.findIndex((x) => x.id === id);
        if (idx !== -1) {
          items[idx] = {
            ...items[idx],
            title,
            category: editCategory.value,
            style: editStyle.value,
            content,
            inVault: editVault.checked,
            updatedAt: now
          };
        }
        showToast('Letra atualizada!');
      } else {
        items.unshift({
          id: generateId(),
          title,
          category: editCategory.value,
          style: editStyle.value,
          content,
          inVault: editVault.checked,
          updatedAt: now
        });
        showToast(editVault.checked ? 'Guardado em Minhas Músicas!' : 'Nova letra guardada!');
      }

      saveItems();
      closeEditor();
      renderList();
      if (!vaultModal.classList.contains('hidden')) renderVaultList();
    });

    document.querySelectorAll('[data-close="reader"]').forEach((el) => {
      el.addEventListener('click', closeReader);
    });
    document.querySelectorAll('[data-close="editor"]').forEach((el) => {
      el.addEventListener('click', closeEditor);
    });
    document.querySelectorAll('[data-close="vault"]').forEach((el) => {
      el.addEventListener('click', closeVault);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!editorModal.classList.contains('hidden')) closeEditor();
        else if (!readerModal.classList.contains('hidden')) closeReader();
        else if (!vaultModal.classList.contains('hidden')) closeVault();
      }
    });

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }

  function updateOnlineStatus() {
    if (navigator.onLine) {
      offlineBadge.textContent = 'Pronto Offline';
      offlineBadge.classList.remove('is-offline');
    } else {
      offlineBadge.textContent = 'Modo Offline';
      offlineBadge.classList.add('is-offline');
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  init();
})();
