/**
 * GCP Rich Editor — lightweight contenteditable editor (no external deps)
 * Exposes: window.GCP.RichEditor({ container, initialHtml, authorName }) → { getHtml, getCleanHtml, setHtml, destroy, focus, acceptAllChanges, rejectAllChanges, hasTrackedChanges }
 */
(function () {

  const FONT_FAMILIES = [
    { label: 'Font',            value: '' },
    { label: 'Arial',           value: 'Arial' },
    { label: 'Georgia',         value: 'Georgia' },
    { label: 'Times New Roman', value: 'Times New Roman' },
    { label: 'Courier New',     value: 'Courier New' },
    { label: 'Verdana',         value: 'Verdana' },
    { label: 'Trebuchet MS',    value: 'Trebuchet MS' },
  ];

  const FONT_SIZES = [
    { label: 'Size',    value: '' },
    { label: 'Small',   value: '2' },
    { label: 'Normal',  value: '3' },
    { label: 'Large',   value: '5' },
    { label: 'X-Large', value: '6' },
    { label: 'Huge',    value: '7' },
  ];

  const TOOLS = [
    { cmd: 'bold',          icon: '<b>B</b>',          title: 'Bold (Ctrl+B)' },
    { cmd: 'italic',        icon: '<i>I</i>',          title: 'Italic (Ctrl+I)' },
    { cmd: 'underline',     icon: '<u>U</u>',          title: 'Underline (Ctrl+U)' },
    { sep: true },
    { cmd: 'h2',            icon: 'H2',                title: 'Heading 2' },
    { cmd: 'h3',            icon: 'H3',                title: 'Heading 3' },
    { sep: true },
    { cmd: 'insertUnorderedList', icon: '&#8226;&#8212;', title: 'Bullet list' },
    { cmd: 'insertOrderedList',   icon: '1.',            title: 'Numbered list' },
    { sep: true },
    { cmd: 'justifyLeft',   icon: '&#8676;',           title: 'Align left' },
    { cmd: 'justifyCenter', icon: '&#8596;',           title: 'Center' },
    { cmd: 'justifyRight',  icon: '&#8677;',           title: 'Align right' },
    { sep: true },
    { cmd: 'removeFormat',  icon: '&#10005;',          title: 'Clear formatting' },
  ];

  const TOOLBAR_CSS = `
    .gcp-re-wrap { display:flex; flex-direction:column; border:1px solid var(--border,#e5e7eb); border-radius:14px; overflow:hidden; background:var(--card,#fff); }
    .gcp-re-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:2px; padding:6px 8px; border-bottom:1px solid var(--border,#e5e7eb); background:rgba(0,0,0,.02); }
    .gcp-re-btn { display:inline-flex; align-items:center; justify-content:center; min-width:30px; height:30px; padding:0 7px; border-radius:8px; border:1px solid transparent; background:transparent; cursor:pointer; font-size:13px; font-weight:700; color:var(--text,#1f2a37); transition:background .12s ease,border-color .12s ease; }
    .gcp-re-btn:hover { background:rgba(0,0,0,.06); border-color:rgba(0,0,0,.10); }
    .gcp-re-btn.active { background:rgba(10,132,255,.14); border-color:rgba(10,132,255,.30); color:#0a84ff; }
    .gcp-re-sep { width:1px; height:22px; background:var(--border,#e5e7eb); margin:0 3px; align-self:center; flex-shrink:0; }
    .gcp-re-select { height:30px; padding:0 5px; border-radius:8px; border:1px solid transparent; background:transparent; cursor:pointer; font-size:12px; font-weight:600; color:var(--text,#1f2a37); outline:none; max-width:130px; transition:background .12s ease,border-color .12s ease; }
    .gcp-re-select:hover { background:rgba(0,0,0,.06); border-color:rgba(0,0,0,.10); }
    .gcp-re-color-wrap { position:relative; display:inline-flex; align-items:center; justify-content:center; min-width:30px; height:30px; padding:0 7px; border-radius:8px; border:1px solid transparent; background:transparent; cursor:pointer; transition:background .12s ease,border-color .12s ease; overflow:hidden; }
    .gcp-re-color-wrap:hover { background:rgba(0,0,0,.06); border-color:rgba(0,0,0,.10); }
    .gcp-re-color-label { display:flex; flex-direction:column; align-items:center; gap:1px; pointer-events:none; }
    .gcp-re-color-a { font-size:13px; font-weight:900; line-height:1; color:var(--text,#1f2a37); }
    .gcp-re-color-bar { height:3px; width:14px; border-radius:2px; background:#000; }
    .gcp-re-color-input { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%; border:none; padding:0; }
    .gcp-re-body { flex:1; min-height:260px; padding:14px 16px; outline:none; font-size:15px; line-height:1.65; color:var(--text,#1f2a37); overflow-y:auto; }
    .gcp-re-body:empty::before { content:attr(data-placeholder); color:var(--muted,#6b7280); pointer-events:none; }
    .gcp-re-body h2 { font-size:1.3em; font-weight:800; margin:.8em 0 .3em; }
    .gcp-re-body h3 { font-size:1.1em; font-weight:700; margin:.7em 0 .25em; }
    .gcp-re-body ul,.gcp-re-body ol { margin:.4em 0; padding-left:1.6em; }
    .gcp-re-body li { margin:.2em 0; }
    .gcp-re-body p { margin:.3em 0; }
    [data-theme="dark"] .gcp-re-wrap { background:rgba(30,33,44,.92); }
    [data-theme="dark"] .gcp-re-toolbar { background:rgba(22,25,34,.60); }
    [data-theme="dark"] .gcp-re-btn { color:#c0cce0; }
    [data-theme="dark"] .gcp-re-btn:hover { background:rgba(255,255,255,.07); }
    [data-theme="dark"] .gcp-re-btn.active { background:rgba(33,150,243,.20); color:#90caf9; }
    [data-theme="dark"] .gcp-re-body { color:#e8ecf4; }
    [data-theme="dark"] .gcp-re-select { color:#c0cce0; }
    [data-theme="dark"] .gcp-re-select:hover { background:rgba(255,255,255,.07); }
    [data-theme="dark"] .gcp-re-color-a { color:#c0cce0; }

    /* Track Changes */
    .gcp-re-btn.tc-on { background:rgba(245,158,11,.18); border-color:rgba(217,119,6,.45); color:#92400e; }
    .gcp-re-tc-bar { display:flex; align-items:center; gap:8px; padding:5px 10px; border-bottom:1px solid var(--border,#e5e7eb); background:rgba(245,158,11,.07); font-size:12px; font-weight:600; color:#78350f; flex-wrap:wrap; }
    .gcp-re-tc-status { flex:1; min-width:0; }
    .gcp-re-tc-actions { display:flex; gap:5px; flex-shrink:0; }
    .gcp-re-tc-action { padding:2px 9px; border-radius:6px; border:1px solid; cursor:pointer; font-size:11px; font-weight:700; background:transparent; line-height:1.6; }
    .gcp-re-tc-action.accept { border-color:rgba(22,163,74,.35); color:#15803d; }
    .gcp-re-tc-action.accept:hover { background:rgba(22,163,74,.1); }
    .gcp-re-tc-action.reject { border-color:rgba(220,38,38,.35); color:#b91c1c; }
    .gcp-re-tc-action.reject:hover { background:rgba(220,38,38,.1); }
    .gcp-re-body ins[data-tc-id] { text-decoration:underline; text-decoration-color:rgba(22,163,74,.8); background:rgba(22,163,74,.12); border-radius:2px; padding:0 1px; cursor:default; font-style:normal; }
    .gcp-re-body del[data-tc-id] { text-decoration:line-through; text-decoration-color:rgba(220,38,38,.8); background:rgba(220,38,38,.12); border-radius:2px; padding:0 1px; cursor:default; }
    [data-theme="dark"] .gcp-re-btn.tc-on { background:rgba(245,158,11,.22); color:#fcd34d; }
    [data-theme="dark"] .gcp-re-tc-bar { background:rgba(120,80,10,.18); color:#fcd34d; }
    [data-theme="dark"] .gcp-re-body ins[data-tc-id] { background:rgba(22,163,74,.22); }
    [data-theme="dark"] .gcp-re-body del[data-tc-id] { background:rgba(220,38,38,.22); }
  `;

  let styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const s = document.createElement('style');
    s.textContent = TOOLBAR_CSS;
    document.head.appendChild(s);
  }

  function execCmd(cmd, value) {
    document.execCommand(cmd, false, value || null);
  }

  function handleHeading(tag) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    let block = range.commonAncestorContainer;
    while (block && block.nodeType !== Node.ELEMENT_NODE) block = block.parentNode;
    // If already that heading, convert to paragraph
    if (block && block.tagName && block.tagName.toLowerCase() === tag) {
      document.execCommand('formatBlock', false, 'p');
    } else {
      document.execCommand('formatBlock', false, tag);
    }
  }

  function RichEditor({ container, initialHtml, placeholder, authorName }) {
    injectStyle();

    const wrap = document.createElement('div');
    wrap.className = 'gcp-re-wrap';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'gcp-re-toolbar';
    toolbar.setAttribute('aria-label', 'Editor toolbar');

    // Body (created early so save/restore can reference it)
    const body = document.createElement('div');
    body.className = 'gcp-re-body';
    body.contentEditable = 'true';
    body.setAttribute('role', 'textbox');
    body.setAttribute('aria-multiline', 'true');
    body.setAttribute('data-placeholder', placeholder || 'Start typing…');
    if (initialHtml) body.innerHTML = initialHtml;

    // --- Track Changes state ---
    const tc = { enabled: false, authorName: authorName || 'Unknown', counter: 0 };
    function newTcId() { return `tc${Date.now()}${++tc.counter}`; }

    // TC bar (sits between toolbar and body)
    const tcBar = document.createElement('div');
    tcBar.className = 'gcp-re-tc-bar';
    tcBar.style.display = 'none';

    const tcStatus = document.createElement('span');
    tcStatus.className = 'gcp-re-tc-status';

    const tcActionsEl = document.createElement('div');
    tcActionsEl.className = 'gcp-re-tc-actions';

    const tcAcceptAll = document.createElement('button');
    tcAcceptAll.type = 'button';
    tcAcceptAll.className = 'gcp-re-tc-action accept';
    tcAcceptAll.textContent = 'Accept All';

    const tcRejectAll = document.createElement('button');
    tcRejectAll.type = 'button';
    tcRejectAll.className = 'gcp-re-tc-action reject';
    tcRejectAll.textContent = 'Reject All';

    tcActionsEl.appendChild(tcAcceptAll);
    tcActionsEl.appendChild(tcRejectAll);
    tcBar.appendChild(tcStatus);
    tcBar.appendChild(tcActionsEl);

    // --- Selection save/restore (needed for dropdowns & color picker) ---
    let savedRange = null;

    function saveSelection() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
    }

    function restoreSelection() {
      if (!savedRange) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }

    // Save selection whenever editor loses focus (e.g. user clicks a select)
    body.addEventListener('focusout', saveSelection);

    // --- Font family select ---
    const fontFamilySelect = document.createElement('select');
    fontFamilySelect.className = 'gcp-re-select';
    fontFamilySelect.title = 'Font family';
    fontFamilySelect.setAttribute('aria-label', 'Font family');
    FONT_FAMILIES.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      fontFamilySelect.appendChild(opt);
    });
    fontFamilySelect.addEventListener('mousedown', saveSelection);
    fontFamilySelect.addEventListener('change', () => {
      if (fontFamilySelect.value) {
        restoreSelection();
        execCmd('fontName', fontFamilySelect.value);
      }
      fontFamilySelect.value = '';
      body.focus();
    });
    toolbar.appendChild(fontFamilySelect);

    // --- Font size select ---
    const fontSizeSelect = document.createElement('select');
    fontSizeSelect.className = 'gcp-re-select';
    fontSizeSelect.title = 'Font size';
    fontSizeSelect.setAttribute('aria-label', 'Font size');
    FONT_SIZES.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      fontSizeSelect.appendChild(opt);
    });
    fontSizeSelect.addEventListener('mousedown', saveSelection);
    fontSizeSelect.addEventListener('change', () => {
      if (fontSizeSelect.value) {
        restoreSelection();
        execCmd('fontSize', fontSizeSelect.value);
      }
      fontSizeSelect.value = '';
      body.focus();
    });
    toolbar.appendChild(fontSizeSelect);

    // --- Font colour picker ---
    const colorWrap = document.createElement('span');
    colorWrap.className = 'gcp-re-color-wrap';
    colorWrap.title = 'Font colour';

    const colorLabel = document.createElement('span');
    colorLabel.className = 'gcp-re-color-label';
    colorLabel.setAttribute('aria-hidden', 'true');

    const colorA = document.createElement('span');
    colorA.className = 'gcp-re-color-a';
    colorA.textContent = 'A';

    const colorBar = document.createElement('span');
    colorBar.className = 'gcp-re-color-bar';

    colorLabel.appendChild(colorA);
    colorLabel.appendChild(colorBar);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'gcp-re-color-input';
    colorInput.value = '#000000';
    colorInput.setAttribute('aria-label', 'Font colour');

    colorWrap.appendChild(colorLabel);
    colorWrap.appendChild(colorInput);

    colorInput.addEventListener('mousedown', saveSelection);
    colorInput.addEventListener('change', () => {
      colorBar.style.background = colorInput.value;
      restoreSelection();
      execCmd('foreColor', colorInput.value);
      body.focus();
    });

    toolbar.appendChild(colorWrap);

    // Separator before existing tools
    const firstSep = document.createElement('span');
    firstSep.className = 'gcp-re-sep';
    firstSep.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(firstSep);

    // --- Existing format buttons ---
    TOOLS.forEach(tool => {
      if (tool.sep) {
        const sep = document.createElement('span');
        sep.className = 'gcp-re-sep';
        sep.setAttribute('aria-hidden', 'true');
        toolbar.appendChild(sep);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gcp-re-btn';
      btn.innerHTML = tool.icon;
      btn.title = tool.title;
      btn.setAttribute('aria-label', tool.title);
      btn.dataset.cmd = tool.cmd;

      btn.addEventListener('mousedown', e => {
        e.preventDefault(); // keep editor focus
        if (tool.cmd === 'h2' || tool.cmd === 'h3') {
          handleHeading(tool.cmd);
        } else {
          execCmd(tool.cmd);
        }
        body.focus();
        updateActive();
      });
      toolbar.appendChild(btn);
    });

    // --- Track Changes toggle button ---
    const tcSep = document.createElement('span');
    tcSep.className = 'gcp-re-sep';
    tcSep.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(tcSep);

    const tcBtn = document.createElement('button');
    tcBtn.type = 'button';
    tcBtn.className = 'gcp-re-btn';
    tcBtn.textContent = 'TC';
    tcBtn.title = 'Track Changes';
    tcBtn.setAttribute('aria-label', 'Toggle track changes');
    tcBtn.setAttribute('aria-pressed', 'false');
    toolbar.appendChild(tcBtn);

    // --- Assemble DOM ---
    wrap.appendChild(toolbar);
    wrap.appendChild(tcBar);
    wrap.appendChild(body);
    container.innerHTML = '';
    container.appendChild(wrap);

    // --- Track Changes helpers ---

    function countChanges() {
      const ids = new Set();
      body.querySelectorAll('[data-tc-id]').forEach(el => ids.add(el.getAttribute('data-tc-id')));
      return ids.size;
    }

    function updateTcBar() {
      const n = countChanges();
      const show = tc.enabled || n > 0;
      tcBar.style.display = show ? '' : 'none';
      if (!show) return;
      const parts = [];
      if (tc.enabled) parts.push('Track Changes On');
      if (n > 0) parts.push(`${n} change${n === 1 ? '' : 's'}`);
      else if (tc.enabled) parts.push('No changes yet');
      tcStatus.textContent = parts.join(' · ');
      tcAcceptAll.style.display = n > 0 ? '' : 'none';
      tcRejectAll.style.display = n > 0 ? '' : 'none';
      tcBtn.classList.toggle('tc-on', tc.enabled);
      tcBtn.setAttribute('aria-pressed', String(tc.enabled));
    }

    function acceptAllChanges() {
      body.querySelectorAll('del[data-tc-id]').forEach(el => el.remove());
      body.querySelectorAll('ins[data-tc-id]').forEach(el => {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      });
      body.normalize();
      updateTcBar();
    }

    function rejectAllChanges() {
      body.querySelectorAll('ins[data-tc-id]').forEach(el => el.remove());
      body.querySelectorAll('del[data-tc-id]').forEach(el => {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      });
      body.normalize();
      updateTcBar();
    }

    function hasTrackedChanges() {
      return !!body.querySelector('[data-tc-id]');
    }

    function getCleanHtml() {
      const clone = body.cloneNode(true);
      clone.querySelectorAll('del[data-tc-id]').forEach(el => el.remove());
      clone.querySelectorAll('ins[data-tc-id]').forEach(el => {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      });
      return clone.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)*$/, '').trim();
    }

    // Convert a StaticRange (from getTargetRanges) to a live Range
    function staticToRange(sr) {
      const r = document.createRange();
      r.setStart(sr.startContainer, sr.startOffset);
      r.setEnd(sr.endContainer, sr.endOffset);
      return r;
    }

    // Wrap a range's content in a <del data-tc-id> element.
    // placeCursorAfter: true = cursor after del, false = cursor before del.
    function wrapRangeAsDeletion(range, placeCursorAfter) {
      if (range.collapsed) return null;
      try {
        const id = newTcId();
        const frag = range.cloneContents();
        const del = document.createElement('del');
        del.setAttribute('data-tc-id', id);
        del.setAttribute('data-tc-author', tc.authorName);
        del.setAttribute('data-tc-time', new Date().toISOString());
        del.title = `Deleted by ${tc.authorName}`;
        del.appendChild(frag);
        range.deleteContents();
        range.insertNode(del);
        // Reposition cursor
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        placeCursorAfter ? r.setStartAfter(del) : r.setStartBefore(del);
        r.collapse(true);
        sel.addRange(r);
        return del;
      } catch (_) {
        try { range.deleteContents(); } catch (__) {}
        return null;
      }
    }

    // Insert text as a tracked <ins> element at the current cursor.
    // Extends an adjacent <ins> by the same author if possible.
    function insertTracked(text) {
      if (!text) return;
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // Extend an existing adjacent <ins> by the same author
      const { startContainer, startOffset } = range;
      if (startContainer.nodeType === Node.TEXT_NODE) {
        const parent = startContainer.parentElement;
        if (parent && parent.tagName === 'INS' &&
            parent.getAttribute('data-tc-author') === tc.authorName &&
            startOffset === startContainer.length) {
          startContainer.textContent += text;
          const r = document.createRange();
          r.setStart(startContainer, startContainer.length);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          return;
        }
      }

      // Create a new <ins>
      const id = newTcId();
      const ins = document.createElement('ins');
      ins.setAttribute('data-tc-id', id);
      ins.setAttribute('data-tc-author', tc.authorName);
      ins.setAttribute('data-tc-time', new Date().toISOString());
      ins.title = `Added by ${tc.authorName}`;
      ins.textContent = text;
      range.insertNode(ins);
      const r = document.createRange();
      r.setStartAfter(ins);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }

    // --- TC button and bar events ---

    tcBtn.addEventListener('mousedown', e => e.preventDefault());
    tcBtn.addEventListener('click', () => {
      if (!body.isContentEditable) return;
      tc.enabled = !tc.enabled;
      updateTcBar();
    });

    tcAcceptAll.addEventListener('mousedown', e => e.preventDefault());
    tcAcceptAll.addEventListener('click', () => { acceptAllChanges(); body.focus(); });

    tcRejectAll.addEventListener('mousedown', e => e.preventDefault());
    tcRejectAll.addEventListener('click', () => { rejectAllChanges(); body.focus(); });

    // --- beforeinput: intercept when track changes is ON ---

    const TC_INPUT_TYPES = new Set([
      'insertText', 'insertReplacementText',
      'deleteContentBackward', 'deleteContentForward',
      'deleteWordBackward', 'deleteWordForward',
      'deleteHardLineBackward', 'deleteHardLineForward',
      'deleteSoftLineBackward', 'deleteSoftLineForward',
      'deleteByCut', 'insertFromPaste', 'insertFromDrop',
    ]);

    body.addEventListener('beforeinput', e => {
      if (!tc.enabled || !TC_INPUT_TYPES.has(e.inputType)) return;
      e.preventDefault();

      const staticRanges = e.getTargetRanges ? e.getTargetRanges() : [];
      const targetRange = staticRanges[0]
        ? staticToRange(staticRanges[0])
        : (window.getSelection().rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null);
      if (!targetRange) return;

      const type = e.inputType;

      if (type === 'insertText' || type === 'insertReplacementText') {
        // Replace selection (if any) with deletion, then insert tracked text
        if (!targetRange.collapsed) wrapRangeAsDeletion(targetRange, true);
        insertTracked(e.data);
      } else if (type === 'insertFromPaste' || type === 'insertFromDrop') {
        if (!targetRange.collapsed) wrapRangeAsDeletion(targetRange, true);
        const text = (e.dataTransfer || e.clipboardData || null)?.getData('text/plain') || '';
        if (text) insertTracked(text);
      } else if (type === 'deleteByCut') {
        if (!targetRange.collapsed) wrapRangeAsDeletion(targetRange, false);
      } else if (type.startsWith('delete')) {
        // For all other deletes, wrap in <del> — cursor stays before the deletion
        wrapRangeAsDeletion(targetRange, false);
      }

      updateTcBar();
    });

    // --- Active state update ---

    function updateActive() {
      toolbar.querySelectorAll('.gcp-re-btn').forEach(btn => {
        const cmd = btn.dataset.cmd;
        if (!cmd || cmd === 'h2' || cmd === 'h3' || cmd === 'removeFormat') {
          btn.classList.remove('active');
          return;
        }
        try { btn.classList.toggle('active', document.queryCommandState(cmd)); } catch (_) {}
      });
    }

    body.addEventListener('keyup', updateActive);
    body.addEventListener('mouseup', updateActive);
    body.addEventListener('selectionchange', updateActive);

    // Keyboard shortcuts
    body.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === 'b') { e.preventDefault(); execCmd('bold'); updateActive(); }
        if (e.key === 'i') { e.preventDefault(); execCmd('italic'); updateActive(); }
        if (e.key === 'u') { e.preventDefault(); execCmd('underline'); updateActive(); }
      }
    });

    // --- Public API ---

    function getHtml() {
      // Returns HTML as-is (may contain <ins>/<del> tracked-change markup)
      return body.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)*$/, '').trim();
    }

    function setHtml(html) {
      body.innerHTML = html || '';
      updateTcBar(); // refresh count in case loaded HTML has tracked changes
    }

    function destroy() {
      container.innerHTML = '';
    }

    function focus() {
      body.focus();
    }

    // Show TC bar on load if the initial HTML already contains tracked changes
    updateTcBar();

    return { getHtml, getCleanHtml, setHtml, destroy, focus, el: body,
             acceptAllChanges, rejectAllChanges, hasTrackedChanges };
  }

  window.GCP = window.GCP || {};
  window.GCP.RichEditor = RichEditor;

})();
