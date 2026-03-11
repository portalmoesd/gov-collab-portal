/**
 * GCP Rich Editor — lightweight contenteditable editor (no external deps)
 * Exposes: window.GCP.RichEditor({ container, initialHtml }) → { getHtml, setHtml, destroy }
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

  function RichEditor({ container, initialHtml, placeholder }) {
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

    wrap.appendChild(toolbar);
    wrap.appendChild(body);
    container.innerHTML = '';
    container.appendChild(wrap);

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

    function getHtml() {
      // Clean up empty paragraphs at end
      return body.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)*$/, '').trim();
    }

    function setHtml(html) {
      body.innerHTML = html || '';
    }

    function destroy() {
      container.innerHTML = '';
    }

    function focus() {
      body.focus();
    }

    return { getHtml, setHtml, destroy, focus, el: body };
  }

  window.GCP = window.GCP || {};
  window.GCP.RichEditor = RichEditor;

})();
