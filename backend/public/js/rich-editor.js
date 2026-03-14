/**
 * GCP Rich Editor — lightweight contenteditable editor (no external deps)
 * Exposes: window.GCP.RichEditor({ container, initialHtml, authorName, onCommentsClick })
 *
 * Track Changes:
 *  - Always recording — no toggle needed to start.
 *  - "Changes" button = Show / Hide markup only.
 *  - Each author gets a unique Word-style colour (8-colour palette).
 *  - Author initials shown as inline chips on every change when visible.
 *  - Reviewing pane lists every change with author, excerpt, time,
 *    and per-change Accept / Reject buttons.
 *  - Self-corrections silently cancel: deleting your own insertion removes
 *    the <ins> without adding a <del>.
 */
(function () {

  // ── Constants ──────────────────────────────────────────────────────────────

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

  // Word-style 8-colour author palette  [text/border, background]
  const TC_PALETTE = [
    ['#1d4ed8', 'rgba(29,78,216,.11)'],   // blue
    ['#b91c1c', 'rgba(185,28,28,.11)'],   // red
    ['#15803d', 'rgba(21,128,61,.11)'],   // green
    ['#7c3aed', 'rgba(124,58,237,.11)'],  // purple
    ['#c2410c', 'rgba(194,65,12,.11)'],   // orange
    ['#0f766e', 'rgba(15,118,110,.11)'],  // teal
    ['#9d174d', 'rgba(157,23,77,.11)'],   // pink
    ['#3730a3', 'rgba(55,48,163,.11)'],   // indigo
  ];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function authorColorIdx(name) {
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return h % TC_PALETTE.length;
  }

  function getInitials(name) {
    return (name || '').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(s => s[0] && s[0].toUpperCase()).filter(Boolean).join('') || '?';
  }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const TOOLBAR_CSS = `
    .gcp-re-wrap { display:flex; flex-direction:column; border:1px solid var(--border,#e5e7eb); border-radius:14px; overflow:hidden; background:var(--card,#fff); }
    .gcp-re-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:2px; padding:6px 8px; border-bottom:1px solid var(--border,#e5e7eb); background:rgba(0,0,0,.02); }
    .gcp-re-btn { display:inline-flex; align-items:center; justify-content:center; gap:4px; min-width:30px; height:30px; padding:0 7px; border-radius:8px; border:1px solid transparent; background:transparent; cursor:pointer; font-size:13px; font-weight:700; color:var(--text,#1f2a37); transition:background .12s,border-color .12s; }
    .gcp-re-btn:hover { background:rgba(0,0,0,.06); border-color:rgba(0,0,0,.10); }
    .gcp-re-btn.active { background:rgba(10,132,255,.14); border-color:rgba(10,132,255,.30); color:#0a84ff; }
    .gcp-re-sep { width:1px; height:22px; background:var(--border,#e5e7eb); margin:0 3px; align-self:center; flex-shrink:0; }
    .gcp-re-select { height:30px; padding:0 5px; border-radius:8px; border:1px solid transparent; background:transparent; cursor:pointer; font-size:12px; font-weight:600; color:var(--text,#1f2a37); outline:none; max-width:130px; transition:background .12s,border-color .12s; }
    .gcp-re-select:hover { background:rgba(0,0,0,.06); border-color:rgba(0,0,0,.10); }
    .gcp-re-color-wrap { position:relative; display:inline-flex; align-items:center; justify-content:center; min-width:30px; height:30px; padding:0 7px; border-radius:8px; border:1px solid transparent; background:transparent; cursor:pointer; transition:background .12s,border-color .12s; overflow:hidden; }
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

    /* ── Track Changes button & badge ── */
    .gcp-re-tc-badge { display:inline-flex; align-items:center; justify-content:center; min-width:15px; height:15px; padding:0 3px; border-radius:999px; background:rgba(220,38,38,.15); color:#b91c1c; font-size:10px; font-weight:800; line-height:1; }
    .gcp-re-btn.tc-active { background:rgba(245,158,11,.15); border-color:rgba(217,119,6,.38); color:#92400e; }
    .gcp-re-btn.tc-active .gcp-re-tc-badge { background:rgba(59,130,246,.14); color:#1d4ed8; }
    [data-theme="dark"] .gcp-re-btn.tc-active { background:rgba(245,158,11,.20); color:#fcd34d; }

    /* ── Comments button badge ── */
    .gcp-re-cmt-badge { display:inline-flex; align-items:center; justify-content:center; min-width:15px; height:15px; padding:0 3px; border-radius:999px; background:rgba(3,105,161,.14); color:#0369a1; font-size:10px; font-weight:800; line-height:1; }

    /* ── TC bar (header row, always visible when tc.visible) ── */
    .gcp-re-tc-bar { display:flex; align-items:center; gap:8px; padding:5px 10px; border-bottom:1px solid var(--border,#e5e7eb); background:rgba(245,158,11,.06); font-size:12px; font-weight:600; color:#78350f; }
    .gcp-re-tc-bar-left { flex:1; display:flex; flex-direction:column; gap:1px; min-width:0; }
    .gcp-re-tc-summary { font-size:12px; font-weight:700; }
    .gcp-re-tc-authors-row { font-size:11px; font-weight:500; color:#92400e; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .gcp-re-tc-bar-actions { display:flex; gap:5px; flex-shrink:0; }
    .gcp-re-tc-action { padding:2px 9px; border-radius:6px; border:1px solid; cursor:pointer; font-size:11px; font-weight:700; background:transparent; line-height:1.6; }
    .gcp-re-tc-action.accept { border-color:rgba(22,163,74,.35); color:#15803d; }
    .gcp-re-tc-action.accept:hover { background:rgba(22,163,74,.10); }
    .gcp-re-tc-action.reject { border-color:rgba(220,38,38,.35); color:#b91c1c; }
    .gcp-re-tc-action.reject:hover { background:rgba(220,38,38,.10); }
    [data-theme="dark"] .gcp-re-tc-bar { background:rgba(120,80,10,.16); color:#fcd34d; }
    [data-theme="dark"] .gcp-re-tc-authors-row { color:#fbbf24; }

    /* ── Reviewing pane ── */
    .gcp-re-tc-pane { border-bottom:1px solid var(--border,#e5e7eb); background:rgba(248,250,252,.9); max-height:168px; overflow-y:auto; }
    .gcp-re-tc-pane-empty { padding:10px 14px; font-size:12px; color:#94a3b8; text-align:center; }
    .gcp-re-tc-pane-item { display:flex; align-items:flex-start; gap:8px; padding:7px 12px; border-bottom:1px solid rgba(17,24,39,.04); cursor:pointer; transition:background .1s; }
    .gcp-re-tc-pane-item:hover { background:rgba(0,0,0,.025); }
    .gcp-re-tc-pane-item:last-child { border-bottom:none; }
    .gcp-re-tc-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-top:4px; }
    .gcp-re-tc-pane-body { flex:1; min-width:0; }
    .gcp-re-tc-pane-who { font-size:11px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
    .gcp-re-tc-pane-kind { font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px; }
    .gcp-re-tc-pane-kind.ins { background:rgba(21,128,61,.12); color:#15803d; }
    .gcp-re-tc-pane-kind.del { background:rgba(185,28,28,.12); color:#b91c1c; }
    .gcp-re-tc-pane-excerpt { font-size:11px; color:#64748b; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .gcp-re-tc-pane-meta { display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0; }
    .gcp-re-tc-pane-time { font-size:10px; color:#94a3b8; white-space:nowrap; }
    .gcp-re-tc-pane-btns { display:flex; gap:3px; }
    .gcp-re-tc-pane-acc,.gcp-re-tc-pane-rej { font-size:10px; font-weight:800; border:none; border-radius:4px; padding:2px 6px; cursor:pointer; transition:background .1s; line-height:1.4; }
    .gcp-re-tc-pane-acc { background:rgba(21,128,61,.12); color:#15803d; }
    .gcp-re-tc-pane-acc:hover { background:rgba(21,128,61,.22); }
    .gcp-re-tc-pane-rej { background:rgba(185,28,28,.12); color:#b91c1c; }
    .gcp-re-tc-pane-rej:hover { background:rgba(185,28,28,.22); }
    [data-theme="dark"] .gcp-re-tc-pane { background:rgba(22,25,34,.7); }
    [data-theme="dark"] .gcp-re-tc-pane-who { color:#e8ecf4; }
    [data-theme="dark"] .gcp-re-tc-pane-excerpt { color:#8899b4; }

    /* ── Track-change markup — HIDDEN by default ── */
    .gcp-re-body ins[data-tc-id] { text-decoration:none; background:none; padding:0; font-style:normal; }
    .gcp-re-body del[data-tc-id] { display:none; }

    /* ── Track-change markup — VISIBLE when .tc-visible ── */
    .gcp-re-wrap.tc-visible .gcp-re-body ins[data-tc-id] {
      text-decoration:underline;
      text-decoration-color:var(--tc-color,#1d4ed8);
      background:var(--tc-bg,rgba(29,78,216,.11));
      border-radius:2px; padding:0 1px; cursor:default; font-style:normal;
    }
    .gcp-re-wrap.tc-visible .gcp-re-body del[data-tc-id] {
      display:inline;
      text-decoration:line-through;
      text-decoration-color:var(--tc-color,#1d4ed8);
      background:var(--tc-bg,rgba(29,78,216,.11));
      border-radius:2px; padding:0 1px; cursor:default;
    }
    /* Author initials chip after each marked-up element */
    .gcp-re-wrap.tc-visible .gcp-re-body ins[data-tc-id]::after,
    .gcp-re-wrap.tc-visible .gcp-re-body del[data-tc-id]::after {
      content: attr(data-tc-initials);
      font-size:8px; font-weight:900; letter-spacing:.04em;
      color:var(--tc-color,#1d4ed8);
      border:1px solid var(--tc-color,#1d4ed8);
      border-radius:3px; padding:0 3px; margin-left:3px;
      vertical-align:middle; line-height:1.5;
      white-space:nowrap; pointer-events:none;
    }
    [data-theme="dark"] .gcp-re-wrap.tc-visible .gcp-re-body ins[data-tc-id] { background:color-mix(in srgb, var(--tc-color,#1d4ed8) 18%, transparent); }
    [data-theme="dark"] .gcp-re-wrap.tc-visible .gcp-re-body del[data-tc-id] { background:color-mix(in srgb, var(--tc-color,#1d4ed8) 18%, transparent); }
  `;

  let styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const s = document.createElement('style');
    s.textContent = TOOLBAR_CSS;
    document.head.appendChild(s);
  }

  function execCmd(cmd, value) { document.execCommand(cmd, false, value || null); }

  function handleHeading(tag) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    let block = range.commonAncestorContainer;
    while (block && block.nodeType !== Node.ELEMENT_NODE) block = block.parentNode;
    if (block && block.tagName && block.tagName.toLowerCase() === tag)
      document.execCommand('formatBlock', false, 'p');
    else
      document.execCommand('formatBlock', false, tag);
  }

  // ── RichEditor factory ─────────────────────────────────────────────────────

  function RichEditor({ container, initialHtml, placeholder, authorName, onCommentsClick }) {
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
    const tc = { visible: false, authorName: authorName || 'Unknown', counter: 0 };
    function newTcId() { return `tc${Date.now()}${++tc.counter}`; }

    // ── TC bar (header row) ──────────────────────────────────────────────────
    const tcBar = document.createElement('div');
    tcBar.className = 'gcp-re-tc-bar';
    tcBar.style.display = 'none';

    const tcBarLeft = document.createElement('div');
    tcBarLeft.className = 'gcp-re-tc-bar-left';
    const tcSummary = document.createElement('div');
    tcSummary.className = 'gcp-re-tc-summary';
    const tcAuthorsRow = document.createElement('div');
    tcAuthorsRow.className = 'gcp-re-tc-authors-row';
    tcBarLeft.appendChild(tcSummary);
    tcBarLeft.appendChild(tcAuthorsRow);

    const tcBarActions = document.createElement('div');
    tcBarActions.className = 'gcp-re-tc-bar-actions';
    const tcAcceptAll = document.createElement('button');
    tcAcceptAll.type = 'button'; tcAcceptAll.className = 'gcp-re-tc-action accept';
    tcAcceptAll.textContent = 'Accept All';
    const tcRejectAll = document.createElement('button');
    tcRejectAll.type = 'button'; tcRejectAll.className = 'gcp-re-tc-action reject';
    tcRejectAll.textContent = 'Reject All';
    tcBarActions.appendChild(tcAcceptAll);
    tcBarActions.appendChild(tcRejectAll);
    tcBar.appendChild(tcBarLeft);
    tcBar.appendChild(tcBarActions);

    // ── Reviewing pane ───────────────────────────────────────────────────────
    const tcPane = document.createElement('div');
    tcPane.className = 'gcp-re-tc-pane';
    tcPane.style.display = 'none';

    // ── Selection save/restore ───────────────────────────────────────────────
    let savedRange = null;
    function saveSelection() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
    }
    function restoreSelection() {
      if (!savedRange) return;
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(savedRange);
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
    colorWrap.className = 'gcp-re-color-wrap'; colorWrap.title = 'Font colour';
    const colorLabel = document.createElement('span');
    colorLabel.className = 'gcp-re-color-label'; colorLabel.setAttribute('aria-hidden', 'true');
    const colorA = document.createElement('span');
    colorA.className = 'gcp-re-color-a'; colorA.textContent = 'A';
    const colorBar = document.createElement('span'); colorBar.className = 'gcp-re-color-bar';
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
        if (tool.cmd === 'h2' || tool.cmd === 'h3') handleHeading(tool.cmd);
        else execCmd(tool.cmd);
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
    tcBtn.title = 'Show / Hide Changes';
    tcBtn.setAttribute('aria-label', 'Show or hide tracked changes');
    tcBtn.setAttribute('aria-pressed', 'false');

    const tcBtnLabel = document.createElement('span');
    tcBtnLabel.textContent = 'Changes';
    const tcBadge = document.createElement('span');
    tcBadge.className = 'gcp-re-tc-badge'; tcBadge.style.display = 'none';
    tcBtn.appendChild(tcBtnLabel); tcBtn.appendChild(tcBadge);
    toolbar.appendChild(tcBtn);

    // ── Comments button ──────────────────────────────────────────────────────
    const cmtSep = document.createElement('span');
    cmtSep.className = 'gcp-re-sep'; cmtSep.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(cmtSep);

    const cmtBtn = document.createElement('button');
    cmtBtn.type = 'button'; cmtBtn.className = 'gcp-re-btn';
    cmtBtn.title = 'Comments';
    cmtBtn.setAttribute('aria-label', 'Toggle comments panel');
    // Speech-bubble icon
    cmtBtn.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><path d="M14 1H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h5.586l2.707 2.707a1 1 0 0 0 1.414 0L14 12h0a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"/></svg>`;
    const cmtBadge = document.createElement('span');
    cmtBadge.className = 'gcp-re-cmt-badge'; cmtBadge.style.display = 'none';
    cmtBtn.appendChild(cmtBadge);
    toolbar.appendChild(cmtBtn);

    // ── DOM assembly ─────────────────────────────────────────────────────────
    wrap.appendChild(toolbar);
    wrap.appendChild(tcBar);
    wrap.appendChild(tcPane);
    wrap.appendChild(body);
    container.innerHTML = '';
    container.appendChild(wrap);

    // ── TC helpers ───────────────────────────────────────────────────────────

    // Collect unique change IDs in document order
    function getChangeEntries() {
      const seen = new Set();
      const entries = [];
      body.querySelectorAll('[data-tc-id]').forEach(el => {
        const id = el.getAttribute('data-tc-id');
        if (seen.has(id)) return;
        seen.add(id);
        entries.push({
          id,
          kind:     el.tagName.toLowerCase(),   // 'ins' | 'del'
          author:   el.getAttribute('data-tc-author')   || 'Unknown',
          initials: el.getAttribute('data-tc-initials') || '?',
          time:     el.getAttribute('data-tc-time')     || '',
          color:    el.style.getPropertyValue('--tc-color') || '#1d4ed8',
          text:     el.textContent || '',
        });
      });
      return entries;
    }

    function countChanges()  { return new Set([...body.querySelectorAll('[data-tc-id]')].map(e => e.getAttribute('data-tc-id'))).size; }

    function getAuthors() {
      const map = new Map();
      body.querySelectorAll('[data-tc-id]').forEach(el => {
        const a = el.getAttribute('data-tc-author') || 'Unknown';
        map.set(a, (map.get(a) || 0) + 1);
      });
      return [...map.keys()];
    }

    function updateTcBar() {
      const n = countChanges();

      // Badge on TC button
      if (n > 0) { tcBadge.textContent = String(n); tcBadge.style.display = ''; }
      else tcBadge.style.display = 'none';

      // CSS class for markup visibility
      wrap.classList.toggle('tc-visible', tc.visible);
      tcBtn.classList.toggle('tc-active', tc.visible);
      tcBtn.setAttribute('aria-pressed', String(tc.visible));

      const show = tc.visible && n > 0;
      tcBar.style.display = show ? '' : 'none';
      tcPane.style.display = show ? '' : 'none';

      if (show) {
        tcSummary.textContent = `${n} tracked change${n === 1 ? '' : 's'}`;
        const authors = getAuthors();
        tcAuthorsRow.textContent = authors.join(' · ');
        updateReviewingPane();
      }
    }

    function updateReviewingPane() {
      tcPane.innerHTML = '';
      const entries = getChangeEntries();
      if (!entries.length) {
        tcPane.innerHTML = '<div class="gcp-re-tc-pane-empty">No tracked changes</div>';
        return;
      }
      entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'gcp-re-tc-pane-item';
        item.title = `${entry.author} · ${entry.time ? new Date(entry.time).toLocaleString() : ''}`;

        const excerpt = entry.text.length > 48
          ? entry.text.slice(0, 48) + '…'
          : (entry.text || '(empty)');

        const kindLabel = entry.kind === 'ins' ? 'Added' : 'Removed';

        item.innerHTML = `
          <span class="gcp-re-tc-dot" style="background:${escHtml(entry.color)}"></span>
          <div class="gcp-re-tc-pane-body">
            <div class="gcp-re-tc-pane-who">
              ${escHtml(entry.author)}
              <span class="gcp-re-tc-pane-kind ${entry.kind}">${kindLabel}</span>
            </div>
            <div class="gcp-re-tc-pane-excerpt">&ldquo;${escHtml(excerpt)}&rdquo;</div>
          </div>
          <div class="gcp-re-tc-pane-meta">
            <span class="gcp-re-tc-pane-time">${escHtml(fmtTime(entry.time))}</span>
            <div class="gcp-re-tc-pane-btns">
              <button class="gcp-re-tc-pane-acc" type="button" data-id="${escHtml(entry.id)}" title="Accept this change">✓</button>
              <button class="gcp-re-tc-pane-rej" type="button" data-id="${escHtml(entry.id)}" title="Reject this change">✗</button>
            </div>
          </div>`;

        // Click row → scroll to change
        item.addEventListener('click', e => {
          if (e.target.closest('.gcp-re-tc-pane-btns')) return;
          const target = body.querySelector(`[data-tc-id="${CSS.escape(entry.id)}"]`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        // Per-change accept/reject
        item.querySelector('.gcp-re-tc-pane-acc').addEventListener('click', e => {
          e.stopPropagation();
          acceptChange(entry.id);
        });
        item.querySelector('.gcp-re-tc-pane-rej').addEventListener('click', e => {
          e.stopPropagation();
          rejectChange(entry.id);
        });

        tcPane.appendChild(item);
      });
    }

    function acceptChange(id) {
      body.querySelectorAll(`del[data-tc-id="${CSS.escape(id)}"]`).forEach(el => el.remove());
      body.querySelectorAll(`ins[data-tc-id="${CSS.escape(id)}"]`).forEach(el => {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      });
      body.normalize(); updateTcBar();
    }

    function rejectChange(id) {
      body.querySelectorAll(`ins[data-tc-id="${CSS.escape(id)}"]`).forEach(el => el.remove());
      body.querySelectorAll(`del[data-tc-id="${CSS.escape(id)}"]`).forEach(el => {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      });
      body.normalize(); updateTcBar();
    }

    function acceptAllChanges() {
      body.querySelectorAll('del[data-tc-id]').forEach(el => el.remove());
      body.querySelectorAll('ins[data-tc-id]').forEach(el => {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      });
      body.normalize(); updateTcBar();
    }

    function rejectAllChanges() {
      body.querySelectorAll('ins[data-tc-id]').forEach(el => el.remove());
      body.querySelectorAll('del[data-tc-id]').forEach(el => {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      });
      body.normalize(); updateTcBar();
    }

    function hasTrackedChanges() { return !!body.querySelector('[data-tc-id]'); }

    function getCleanHtml() {
      const clone = body.cloneNode(true);
      clone.querySelectorAll('del[data-tc-id]').forEach(el => el.remove());
      clone.querySelectorAll('ins[data-tc-id]').forEach(el => {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      });
      return clone.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)*$/, '').trim();
    }

    // ── TC mutation helpers ──────────────────────────────────────────────────

    // Apply author colour/initials attributes to a new ins/del element
    function applyAuthorAttrs(el) {
      const idx = authorColorIdx(tc.authorName);
      const [color, bg] = TC_PALETTE[idx];
      el.setAttribute('data-tc-author',   tc.authorName);
      el.setAttribute('data-tc-initials', getInitials(tc.authorName));
      el.setAttribute('data-tc-color',    String(idx));
      el.setAttribute('data-tc-time',     new Date().toISOString());
      el.style.setProperty('--tc-color', color);
      el.style.setProperty('--tc-bg', bg);
      el.title = `${tc.authorName}`;
    }

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

    function wrapRangeAsDeletion(range, placeCursorAfter) {
      if (range.collapsed) return null;

      // Self-correction: deleting own inserted text → just remove silently
      const selfIns = getSelfIns(range.startContainer);
      if (selfIns && selfIns.contains(range.endContainer)) {
        try {
          range.deleteContents();
          if (selfIns.isConnected && !selfIns.textContent) selfIns.remove();
          const sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
        } catch (_) {}
        updateTcBar();
        return null;
      }

      try {
        const id = newTcId();
        const frag = range.cloneContents();
        const del = document.createElement('del');
        del.setAttribute('data-tc-id', id);
        applyAuthorAttrs(del);
        del.appendChild(frag);
        range.deleteContents();
        range.insertNode(del);

        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = document.createRange();
        placeCursorAfter ? r.setStartAfter(del) : r.setStartBefore(del);
        r.collapse(true); sel.addRange(r);
        return del;
      } catch (_) {
        try { range.deleteContents(); } catch (__) {}
        return null;
      }
    }

    function insertTracked(text) {
      if (!text) return;
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // Extend / edit within an existing same-author <ins>
      const { startContainer, startOffset } = range;
      if (startContainer.nodeType === Node.TEXT_NODE) {
        const parent = startContainer.parentElement;
        if (parent && parent.tagName === 'INS' &&
            parent.getAttribute('data-tc-author') === tc.authorName) {
          // Cursor is anywhere inside our own <ins> — just splice the text in
          const before = startContainer.textContent.slice(0, startOffset);
          const after  = startContainer.textContent.slice(startOffset);
          startContainer.textContent = before + text + after;
          const r = document.createRange();
          r.setStart(startContainer, before.length + text.length);
          r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
          return;
        }
      }

      const id = newTcId();
      const ins = document.createElement('ins');
      ins.setAttribute('data-tc-id', id);
      applyAuthorAttrs(ins);
      ins.textContent = text;
      range.insertNode(ins);

      // Place cursor INSIDE the <ins> text node so the next keystroke
      // finds itself inside a same-author <ins> and extends it rather
      // than creating a new element for every character.
      const r = document.createRange();
      const tn = ins.firstChild;
      r.setStart(tn, tn.length); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
    }

    // ── Button event handlers ────────────────────────────────────────────────

    tcBtn.addEventListener('mousedown', e => e.preventDefault());
    tcBtn.addEventListener('click', () => { tc.visible = !tc.visible; updateTcBar(); });

    tcAcceptAll.addEventListener('mousedown', e => e.preventDefault());
    tcAcceptAll.addEventListener('click', () => { acceptAllChanges(); body.focus(); });
    tcRejectAll.addEventListener('mousedown', e => e.preventDefault());
    tcRejectAll.addEventListener('click', () => { rejectAllChanges(); body.focus(); });

    cmtBtn.addEventListener('mousedown', e => e.preventDefault());
    cmtBtn.addEventListener('click', () => {
      if (onCommentsClick) onCommentsClick();
    });

    // ── beforeinput: always intercept text mutations ─────────────────────────

    const TC_INPUT_TYPES = new Set([
      'insertText', 'insertReplacementText',
      'deleteContentBackward', 'deleteContentForward',
      'deleteWordBackward', 'deleteWordForward',
      'deleteHardLineBackward', 'deleteHardLineForward',
      'deleteSoftLineBackward', 'deleteSoftLineForward',
      'deleteByCut', 'insertFromPaste', 'insertFromDrop',
    ]);

    body.addEventListener('beforeinput', e => {
      if (!TC_INPUT_TYPES.has(e.inputType) || !body.isContentEditable) return;
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
        if (e.key === 'b') { e.preventDefault(); execCmd('bold');      updateActive(); }
        if (e.key === 'i') { e.preventDefault(); execCmd('italic');    updateActive(); }
        if (e.key === 'u') { e.preventDefault(); execCmd('underline'); updateActive(); }
      }
    });

    // ── Public API ───────────────────────────────────────────────────────────

    function getHtml() {
      return body.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)*$/, '').trim();
    }

    function setHtml(html) { body.innerHTML = html || ''; updateTcBar(); }
    function destroy()     { container.innerHTML = ''; }
    function focus()       { body.focus(); }

    function setCommentsActive(active) { cmtBtn.classList.toggle('active', active); }
    function setCommentsBadge(n) {
      if (n > 0) { cmtBadge.textContent = String(n); cmtBadge.style.display = ''; }
      else cmtBadge.style.display = 'none';
    }

    updateTcBar();

    return {
      getHtml, getCleanHtml, setHtml, destroy, focus, el: body,
      acceptAllChanges, rejectAllChanges, hasTrackedChanges,
      setCommentsActive, setCommentsBadge,
    };
  }

  window.GCP = window.GCP || {};
  window.GCP.RichEditor = RichEditor;

})();
