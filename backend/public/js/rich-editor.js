/**
 * GCP Rich Editor — lightweight contenteditable editor (no external deps)
 * Exposes: window.GCP.RichEditor({ container, initialHtml, authorName })
 *
 * Track Changes behaviour:
 *  - Changes are ALWAYS recorded as <ins>/<del> markup in the DOM.
 *  - The TC button is a "Show / Hide Changes" toggle, NOT a tracking toggle.
 *  - By default markup is invisible (ins looks like normal text, del is hidden).
 *  - Clicking TC reveals the markup with colour coding.
 *  - Self-corrections: deleting text that you yourself just inserted removes
 *    the <ins> silently — nothing shows in track changes.
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

    /* Track Changes — TC button */
    .gcp-re-tc-badge { display:inline-flex; align-items:center; justify-content:center; min-width:15px; height:15px; padding:0 3px; border-radius:999px; background:rgba(220,38,38,.16); color:#b91c1c; font-size:10px; font-weight:800; line-height:1; margin-left:3px; vertical-align:middle; }
    .gcp-re-btn.tc-active { background:rgba(245,158,11,.16); border-color:rgba(217,119,6,.40); color:#92400e; }
    .gcp-re-btn.tc-active .gcp-re-tc-badge { background:rgba(59,130,246,.15); color:#1d4ed8; }
    [data-theme="dark"] .gcp-re-btn.tc-active { background:rgba(245,158,11,.22); color:#fcd34d; }

    /* TC bar (shown only when changes are visible) */
    .gcp-re-tc-bar { display:flex; align-items:center; gap:8px; padding:5px 10px; border-bottom:1px solid var(--border,#e5e7eb); background:rgba(245,158,11,.07); font-size:12px; font-weight:600; color:#78350f; flex-wrap:wrap; }
    .gcp-re-tc-status { flex:1; min-width:0; }
    .gcp-re-tc-authors { font-size:11px; font-weight:500; color:#92400e; margin-top:2px; }
    .gcp-re-tc-actions { display:flex; gap:5px; flex-shrink:0; }
    .gcp-re-tc-action { padding:2px 9px; border-radius:6px; border:1px solid; cursor:pointer; font-size:11px; font-weight:700; background:transparent; line-height:1.6; }
    .gcp-re-tc-action.accept { border-color:rgba(22,163,74,.35); color:#15803d; }
    .gcp-re-tc-action.accept:hover { background:rgba(22,163,74,.1); }
    .gcp-re-tc-action.reject { border-color:rgba(220,38,38,.35); color:#b91c1c; }
    .gcp-re-tc-action.reject:hover { background:rgba(220,38,38,.1); }
    [data-theme="dark"] .gcp-re-tc-bar { background:rgba(120,80,10,.18); color:#fcd34d; }

    /* Track Changes markup — HIDDEN by default */
    .gcp-re-body ins[data-tc-id] { text-decoration:none; background:none; padding:0; font-style:normal; }
    .gcp-re-body del[data-tc-id] { display:none; }

    /* Track Changes markup — VISIBLE when .tc-visible is on the wrap */
    .gcp-re-wrap.tc-visible .gcp-re-body ins[data-tc-id] {
      text-decoration:underline; text-decoration-color:rgba(22,163,74,.8);
      background:rgba(22,163,74,.12); border-radius:2px; padding:0 1px; cursor:default; font-style:normal;
    }
    .gcp-re-wrap.tc-visible .gcp-re-body del[data-tc-id] {
      display:inline; text-decoration:line-through; text-decoration-color:rgba(220,38,38,.8);
      background:rgba(220,38,38,.12); border-radius:2px; padding:0 1px; cursor:default;
    }
    [data-theme="dark"] .gcp-re-wrap.tc-visible .gcp-re-body ins[data-tc-id] { background:rgba(22,163,74,.22); }
    [data-theme="dark"] .gcp-re-wrap.tc-visible .gcp-re-body del[data-tc-id] { background:rgba(220,38,38,.22); }
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

    const toolbar = document.createElement('div');
    toolbar.className = 'gcp-re-toolbar';
    toolbar.setAttribute('aria-label', 'Editor toolbar');

    const body = document.createElement('div');
    body.className = 'gcp-re-body';
    body.contentEditable = 'true';
    body.setAttribute('role', 'textbox');
    body.setAttribute('aria-multiline', 'true');
    body.setAttribute('data-placeholder', placeholder || 'Start typing…');
    if (initialHtml) body.innerHTML = initialHtml;

    // ── Track Changes state ──────────────────────────────────────────────────
    // Tracking is ALWAYS on. tc.visible controls the Show/Hide toggle only.
    const tc = {
      visible:    false,
      authorName: authorName || 'Unknown',
      counter:    0,
    };
    function newTcId() { return `tc${Date.now()}${++tc.counter}`; }

    // ── TC bar (between toolbar and body) ────────────────────────────────────
    const tcBar = document.createElement('div');
    tcBar.className = 'gcp-re-tc-bar';
    tcBar.style.display = 'none';

    const tcStatusWrap = document.createElement('div');
    tcStatusWrap.style.flex = '1';

    const tcStatus = document.createElement('div');
    tcStatus.className = 'gcp-re-tc-status';

    const tcAuthors = document.createElement('div');
    tcAuthors.className = 'gcp-re-tc-authors';

    tcStatusWrap.appendChild(tcStatus);
    tcStatusWrap.appendChild(tcAuthors);

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
    tcBar.appendChild(tcStatusWrap);
    tcBar.appendChild(tcActionsEl);

    // ── Selection save/restore ───────────────────────────────────────────────
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
    body.addEventListener('focusout', saveSelection);

    // ── Font family ──────────────────────────────────────────────────────────
    const fontFamilySelect = document.createElement('select');
    fontFamilySelect.className = 'gcp-re-select';
    fontFamilySelect.title = 'Font family';
    fontFamilySelect.setAttribute('aria-label', 'Font family');
    FONT_FAMILIES.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.value; opt.textContent = f.label;
      fontFamilySelect.appendChild(opt);
    });
    fontFamilySelect.addEventListener('mousedown', saveSelection);
    fontFamilySelect.addEventListener('change', () => {
      if (fontFamilySelect.value) { restoreSelection(); execCmd('fontName', fontFamilySelect.value); }
      fontFamilySelect.value = ''; body.focus();
    });
    toolbar.appendChild(fontFamilySelect);

    // ── Font size ────────────────────────────────────────────────────────────
    const fontSizeSelect = document.createElement('select');
    fontSizeSelect.className = 'gcp-re-select';
    fontSizeSelect.title = 'Font size';
    fontSizeSelect.setAttribute('aria-label', 'Font size');
    FONT_SIZES.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.value; opt.textContent = f.label;
      fontSizeSelect.appendChild(opt);
    });
    fontSizeSelect.addEventListener('mousedown', saveSelection);
    fontSizeSelect.addEventListener('change', () => {
      if (fontSizeSelect.value) { restoreSelection(); execCmd('fontSize', fontSizeSelect.value); }
      fontSizeSelect.value = ''; body.focus();
    });
    toolbar.appendChild(fontSizeSelect);

    // ── Color picker ─────────────────────────────────────────────────────────
    const colorWrap = document.createElement('span');
    colorWrap.className = 'gcp-re-color-wrap';
    colorWrap.title = 'Font colour';
    const colorLabel = document.createElement('span');
    colorLabel.className = 'gcp-re-color-label';
    colorLabel.setAttribute('aria-hidden', 'true');
    const colorA = document.createElement('span');
    colorA.className = 'gcp-re-color-a'; colorA.textContent = 'A';
    const colorBar = document.createElement('span');
    colorBar.className = 'gcp-re-color-bar';
    colorLabel.appendChild(colorA); colorLabel.appendChild(colorBar);
    const colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.className = 'gcp-re-color-input';
    colorInput.value = '#000000'; colorInput.setAttribute('aria-label', 'Font colour');
    colorWrap.appendChild(colorLabel); colorWrap.appendChild(colorInput);
    colorInput.addEventListener('mousedown', saveSelection);
    colorInput.addEventListener('change', () => {
      colorBar.style.background = colorInput.value;
      restoreSelection(); execCmd('foreColor', colorInput.value); body.focus();
    });
    toolbar.appendChild(colorWrap);

    // Separator
    const firstSep = document.createElement('span');
    firstSep.className = 'gcp-re-sep'; firstSep.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(firstSep);

    // ── Format buttons ───────────────────────────────────────────────────────
    TOOLS.forEach(tool => {
      if (tool.sep) {
        const sep = document.createElement('span');
        sep.className = 'gcp-re-sep'; sep.setAttribute('aria-hidden', 'true');
        toolbar.appendChild(sep); return;
      }
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'gcp-re-btn';
      btn.innerHTML = tool.icon; btn.title = tool.title;
      btn.setAttribute('aria-label', tool.title); btn.dataset.cmd = tool.cmd;
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        if (tool.cmd === 'h2' || tool.cmd === 'h3') { handleHeading(tool.cmd); }
        else { execCmd(tool.cmd); }
        body.focus(); updateActive();
      });
      toolbar.appendChild(btn);
    });

    // ── Track Changes toggle button ──────────────────────────────────────────
    const tcSep = document.createElement('span');
    tcSep.className = 'gcp-re-sep'; tcSep.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(tcSep);

    const tcBtn = document.createElement('button');
    tcBtn.type = 'button'; tcBtn.className = 'gcp-re-btn';
    tcBtn.setAttribute('aria-label', 'Show or hide tracked changes');
    tcBtn.setAttribute('aria-pressed', 'false');
    tcBtn.title = 'Show / Hide Changes';

    const tcBtnLabel = document.createElement('span');
    tcBtnLabel.textContent = 'Changes';
    const tcBadge = document.createElement('span');
    tcBadge.className = 'gcp-re-tc-badge';
    tcBadge.style.display = 'none';
    tcBtn.appendChild(tcBtnLabel);
    tcBtn.appendChild(tcBadge);
    toolbar.appendChild(tcBtn);

    // ── Assemble DOM ─────────────────────────────────────────────────────────
    wrap.appendChild(toolbar);
    wrap.appendChild(tcBar);
    wrap.appendChild(body);
    container.innerHTML = '';
    container.appendChild(wrap);

    // ── Track Changes helpers ────────────────────────────────────────────────

    function countChanges() {
      const ids = new Set();
      body.querySelectorAll('[data-tc-id]').forEach(el => ids.add(el.getAttribute('data-tc-id')));
      return ids.size;
    }

    // Returns {name, count} for each distinct author with pending changes
    function getAuthors() {
      const map = new Map();
      body.querySelectorAll('[data-tc-id]').forEach(el => {
        const a = el.getAttribute('data-tc-author') || 'Unknown';
        map.set(a, (map.get(a) || 0) + 1);
      });
      return [...map.entries()].map(([name, count]) => ({ name, count }));
    }

    function updateTcBar() {
      const n = countChanges();
      // Badge on button
      if (n > 0) { tcBadge.textContent = String(n); tcBadge.style.display = ''; }
      else { tcBadge.style.display = 'none'; }

      // Wrap class controls CSS visibility
      wrap.classList.toggle('tc-visible', tc.visible);
      tcBtn.classList.toggle('tc-active', tc.visible);
      tcBtn.setAttribute('aria-pressed', String(tc.visible));

      // Bar is only shown when changes are visible
      tcBar.style.display = (tc.visible && n > 0) ? '' : 'none';
      if (tc.visible && n > 0) {
        tcStatus.textContent = `${n} tracked change${n === 1 ? '' : 's'}`;
        const authors = getAuthors();
        tcAuthors.textContent = authors.map(a => a.name).join(', ');
        tcAcceptAll.style.display = '';
        tcRejectAll.style.display = '';
      }
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

    // Find the nearest <ins> ancestor by the same author, if any
    function getSelfIns(node) {
      let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      while (el && el !== body) {
        if (el.tagName === 'INS' && el.getAttribute('data-tc-author') === tc.authorName) return el;
        el = el.parentElement;
      }
      return null;
    }

    function staticToRange(sr) {
      const r = document.createRange();
      r.setStart(sr.startContainer, sr.startOffset);
      r.setEnd(sr.endContainer, sr.endOffset);
      return r;
    }

    // Wrap range in <del>. If range is entirely within own <ins>, just delete (self-correction).
    function wrapRangeAsDeletion(range, placeCursorAfter) {
      if (range.collapsed) return null;

      // Self-correction: deleting own inserted text → remove the <ins> content, don't track
      const selfIns = getSelfIns(range.startContainer);
      if (selfIns && selfIns.contains(range.endContainer)) {
        try {
          range.deleteContents();
          if (selfIns.isConnected && !selfIns.textContent) selfIns.remove();
          // Cursor is already in place (deleteContents collapses the range)
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (_) {}
        updateTcBar();
        return null;
      }

      // Normal tracked deletion
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

    // Insert text as tracked <ins>. Extends adjacent own <ins> when possible.
    function insertTracked(text) {
      if (!text) return;
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // Extend an adjacent <ins> by the same author
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
          sel.removeAllRanges(); sel.addRange(r);
          return;
        }
      }

      const id = newTcId();
      const ins = document.createElement('ins');
      ins.setAttribute('data-tc-id', id);
      ins.setAttribute('data-tc-author', tc.authorName);
      ins.setAttribute('data-tc-time', new Date().toISOString());
      ins.title = `Added by ${tc.authorName}`;
      ins.textContent = text;
      range.insertNode(ins);
      const r = document.createRange();
      r.setStartAfter(ins); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
    }

    // ── TC button events ─────────────────────────────────────────────────────
    tcBtn.addEventListener('mousedown', e => e.preventDefault());
    tcBtn.addEventListener('click', () => {
      tc.visible = !tc.visible;
      updateTcBar();
    });

    tcAcceptAll.addEventListener('mousedown', e => e.preventDefault());
    tcAcceptAll.addEventListener('click', () => { acceptAllChanges(); body.focus(); });

    tcRejectAll.addEventListener('mousedown', e => e.preventDefault());
    tcRejectAll.addEventListener('click', () => { rejectAllChanges(); body.focus(); });

    // ── beforeinput: intercept all text mutations for tracking ───────────────
    const TC_INPUT_TYPES = new Set([
      'insertText', 'insertReplacementText',
      'deleteContentBackward', 'deleteContentForward',
      'deleteWordBackward', 'deleteWordForward',
      'deleteHardLineBackward', 'deleteHardLineForward',
      'deleteSoftLineBackward', 'deleteSoftLineForward',
      'deleteByCut', 'insertFromPaste', 'insertFromDrop',
    ]);

    body.addEventListener('beforeinput', e => {
      if (!TC_INPUT_TYPES.has(e.inputType)) return;
      // Only intercept when editor is actually editable
      if (!body.isContentEditable) return;

      e.preventDefault();

      const staticRanges = e.getTargetRanges ? e.getTargetRanges() : [];
      const targetRange = staticRanges[0]
        ? staticToRange(staticRanges[0])
        : (window.getSelection().rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null);
      if (!targetRange) return;

      const type = e.inputType;

      if (type === 'insertText' || type === 'insertReplacementText') {
        if (!targetRange.collapsed) wrapRangeAsDeletion(targetRange, true);
        insertTracked(e.data);
      } else if (type === 'insertFromPaste' || type === 'insertFromDrop') {
        if (!targetRange.collapsed) wrapRangeAsDeletion(targetRange, true);
        const text = (e.dataTransfer || null)?.getData('text/plain') || '';
        if (text) insertTracked(text);
      } else if (type === 'deleteByCut') {
        if (!targetRange.collapsed) wrapRangeAsDeletion(targetRange, false);
      } else if (type.startsWith('delete')) {
        wrapRangeAsDeletion(targetRange, false);
      }

      updateTcBar();
    });

    // ── Active state update ──────────────────────────────────────────────────
    function updateActive() {
      toolbar.querySelectorAll('.gcp-re-btn').forEach(btn => {
        const cmd = btn.dataset.cmd;
        if (!cmd || cmd === 'h2' || cmd === 'h3' || cmd === 'removeFormat') {
          btn.classList.remove('active'); return;
        }
        try { btn.classList.toggle('active', document.queryCommandState(cmd)); } catch (_) {}
      });
    }

    body.addEventListener('keyup', updateActive);
    body.addEventListener('mouseup', updateActive);
    body.addEventListener('selectionchange', updateActive);

    body.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === 'b') { e.preventDefault(); execCmd('bold'); updateActive(); }
        if (e.key === 'i') { e.preventDefault(); execCmd('italic'); updateActive(); }
        if (e.key === 'u') { e.preventDefault(); execCmd('underline'); updateActive(); }
      }
    });

    // ── Public API ───────────────────────────────────────────────────────────
    function getHtml() {
      return body.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)*$/, '').trim();
    }

    function setHtml(html) {
      body.innerHTML = html || '';
      updateTcBar();
    }

    function destroy() { container.innerHTML = ''; }
    function focus()   { body.focus(); }

    // Initialise badge/bar after loading any pre-existing markup
    updateTcBar();

    return { getHtml, getCleanHtml, setHtml, destroy, focus, el: body,
             acceptAllChanges, rejectAllChanges, hasTrackedChanges };
  }

  window.GCP = window.GCP || {};
  window.GCP.RichEditor = RichEditor;

})();
