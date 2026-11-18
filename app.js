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

  const SEED_ITEMS = [
    {
      id: 'seed-1',
      title: 'Maré Mansa de Sines',
      category: 'mar',
      style: 'Fado',
      content:
        'Quando a barra acorda cedo\n' +
        'E o sal beija o convés,\n' +
        'O mar guarda o seu segredo\n' +
        'Debaixo dos nossos pés.\n\n' +
        'Vai o barco pela espuma\n' +
        'Com a fé de regressar,\n' +
        'Não há estrela nem bruma\n' +
        'Que nos faça desviar.',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'seed-2',
      title: 'Ventos de Burgau a Lagos',
      category: 'terra',
      style: 'Balada',
      content:
        'Dos Montinhos ao Burgau\n' +
        'Sopra a brisa da manhã,\n' +
        'Cada pedra, cada vau\n' +
        'Tem memória e tem amanhã.\n\n' +
        'Em Lagos canta a ribeira,\n' +
        'Em Sines brilha o farol,\n' +
        'É na nossa terra inteira\n' +
        'Que aquece o mesmo sol.',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'seed-3',
      title: 'Quadras da Nossa Roda',
      category: 'folclore',
      style: 'Quadras',
      content:
        'Quem canta seus males espanta,\n' +
        'Quem escreve guarda a voz,\n' +
        'Na viola que se levanta\n' +
        'Vive a história entre nós.',
      updatedAt: new Date().toISOString()
    }
  ];

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
  const fileInput = document.getElementById('file-input');

  const btnTheme = document.getElementById('btn-theme');
  const btnFontDown = document.getElementById('btn-font-down');
  const btnFontUp = document.getElementById('btn-font-up');

  // Reader modal
  const readerModal = document.getElementById('reader-modal');
  const readerTitle = document.getElementById('reader-title');
  const readerDate = document.getElementById('reader-date');
  const readerBody = document.getElementById('reader-body');
  const readerCatBadge = document.getElementById('reader-cat-badge');
  const readerStyleBadge = document.getElementById('reader-style-badge');
  const readerFontDown = document.getElementById('reader-font-down');
  const readerFontUp = document.getElementById('reader-font-up');
  const btnCopy = document.getElementById('btn-copy');
  const btnShare = document.getElementById('btn-share');
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
  const btnVoice = document.getElementById('btn-voice');
  const voiceStatus = document.getElementById('voice-status');

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

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        items = [...SEED_ITEMS];
        saveItems();
      } else {
        const parsed = JSON.parse(raw);
        items = Array.isArray(parsed) ? parsed : [];
      }
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
    const total = items.length;
    resultsCount.textContent =
      filtered.length === total
        ? `${total} ${total === 1 ? 'letra guardada' : 'letras guardadas'}`
        : `A mostrar ${filtered.length} de ${total} letras`;

    itemsGrid.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div style="font-size: 2.2rem;">📖</div>
        <p>${searchQuery ? 'Nenhuma letra encontrada com essa pesquisa.' : 'Ainda não tens letras nesta categoria.'}</p>
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
  function openReader(id) {
    const item = items.find((x) => x.id === id);
    if (!item) return;

    currentItemId = id;
    const catInfo = CATEGORIES[item.category] || CATEGORIES.folclore;
    readerCatBadge.textContent = catInfo.badge;
    readerStyleBadge.textContent = item.style || 'Fado';
    readerTitle.textContent = item.title;
    readerDate.textContent = `Atualizado em ${formatDate(item.updatedAt)}`;
    readerBody.textContent = item.content;
    shareFallback.classList.add('hidden');

    readerModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeReader() {
    readerModal.classList.add('hidden');
    document.body.style.overflow = '';
    currentItemId = null;
  }

  // Editor Modal
  function openEditor(item = null) {
    stopVoice();
    voiceStatus.textContent = '';

    if (item) {
      editorHeading.textContent = 'Editar Letra / Poema';
      editId.value = item.id;
      editTitle.value = item.title;
      editCategory.value = item.category || 'mar';
      editStyle.value = item.style || 'Fado';
      editContent.value = item.content;
    } else {
      editorHeading.textContent = 'Nova Letra / Poema';
      editId.value = '';
      editTitle.value = '';
      editCategory.value = activeCategory !== 'todas' ? activeCategory : 'mar';
      editStyle.value = 'Fado';
      editContent.value = '';
    }

    editorModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => editTitle.focus(), 60);
  }

  function closeEditor() {
    stopVoice();
    editorModal.classList.add('hidden');
    if (readerModal.classList.contains('hidden')) {
      document.body.style.overflow = '';
    }
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

  // File Import (.txt, .doc, .docx, .rtf, .json)
  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    let importedCount = 0;

    for (const file of fileList) {
      const name = file.name || 'Letra Importada';
      const ext = name.split('.').pop().toLowerCase();

      try {
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
          content,
          updatedAt: new Date().toISOString()
        });
        importedCount++;
      } catch (_) {
        showToast(`Não foi possível ler o ficheiro "${name}".`);
      }
    }

    if (importedCount > 0) {
      saveItems();
      renderList();
      showToast(`${importedCount} ${importedCount === 1 ? 'letra importada' : 'letras importadas'} com sucesso!`);
    }

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

    btnNew.addEventListener('click', () => openEditor(null));
    btnImport.addEventListener('click', () => fileInput.click());
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
        items = items.filter((x) => x.id !== currentItemId);
        saveItems();
        closeReader();
        renderList();
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
          updatedAt: now
        });
        showToast('Nova letra guardada!');
      }

      saveItems();
      closeEditor();
      renderList();
    });

    document.querySelectorAll('[data-close="reader"]').forEach((el) => {
      el.addEventListener('click', closeReader);
    });
    document.querySelectorAll('[data-close="editor"]').forEach((el) => {
      el.addEventListener('click', closeEditor);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!editorModal.classList.contains('hidden')) closeEditor();
        else if (!readerModal.classList.contains('hidden')) closeReader();
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
