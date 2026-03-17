/**
 * simple-editor.js — Lightweight rich-text editor for the Task field.
 *
 * Provides: Bold, Italic, Underline, Font Size, Text Color.
 * Preserves line breaks (Enter key).
 *
 * Usage:
 *   const editor = window.GCP.createSimpleEditor(containerEl, { placeholder: '...' });
 *   editor.getHtml();   // get content
 *   editor.setHtml(h);  // set content
 *   editor.clear();     // reset
 */
(function () {
  'use strict';

  var cssInjected = false;
  function injectCss() {
    if (cssInjected) return;
    cssInjected = true;
    var style = document.createElement('style');
    style.textContent = [
      '.se-wrap{border:1px solid rgba(43,68,91,.14);border-radius:14px;background:rgba(255,255,255,.96);overflow:hidden;}',
      '.se-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:6px 8px;border-bottom:1px solid rgba(43,68,91,.10);background:rgba(245,247,250,.85);}',
      '.se-toolbar button{background:none;border:none;cursor:pointer;padding:4px 7px;border-radius:6px;font-size:13px;font-weight:700;color:#22395a;line-height:1;min-width:28px;min-height:28px;display:inline-flex;align-items:center;justify-content:center;}',
      '.se-toolbar button:hover{background:rgba(43,68,91,.10);}',
      '.se-toolbar button.active{background:rgba(43,68,91,.18);}',
      '.se-toolbar select{border:1px solid rgba(43,68,91,.12);border-radius:6px;padding:3px 6px;font-size:12px;font-weight:600;color:#22395a;background:#fff;cursor:pointer;height:28px;}',
      '.se-toolbar .se-sep{width:1px;height:20px;background:rgba(43,68,91,.12);margin:0 4px;}',
      '.se-toolbar input[type=color]{width:28px;height:28px;border:1px solid rgba(43,68,91,.12);border-radius:6px;padding:1px;cursor:pointer;background:#fff;}',
      '.se-body{min-height:120px;max-height:400px;overflow-y:auto;padding:12px 16px;font-size:14px;font-weight:500;line-height:1.65;color:#22395a;outline:none;white-space:pre-wrap;word-wrap:break-word;}',
      '.se-body:empty::before{content:attr(data-placeholder);color:rgba(43,68,91,.35);pointer-events:none;font-weight:500;}',
    ].join('\n');
    document.head.appendChild(style);
  }

  var FONT_SIZES = [
    { label: '9', value: '9pt' },
    { label: '10', value: '10pt' },
    { label: '11', value: '11pt' },
    { label: '12', value: '12pt' },
    { label: '14', value: '14pt' },
    { label: '16', value: '16pt' },
    { label: '18', value: '18pt' },
    { label: '24', value: '24pt' },
  ];

  function createSimpleEditor(container, opts) {
    opts = opts || {};
    injectCss();

    var wrap = document.createElement('div');
    wrap.className = 'se-wrap';

    // -- Toolbar --
    var toolbar = document.createElement('div');
    toolbar.className = 'se-toolbar';

    function addBtn(label, title, cmd) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = label;
      btn.title = title;
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () {
        document.execCommand(cmd, false, null);
        body.focus();
        updateActive();
      });
      toolbar.appendChild(btn);
      return btn;
    }

    var boldBtn = addBtn('<b>B</b>', 'Bold', 'bold');
    var italicBtn = addBtn('<i>I</i>', 'Italic', 'italic');
    var underlineBtn = addBtn('<u>U</u>', 'Underline', 'underline');

    // Separator
    var sep1 = document.createElement('span');
    sep1.className = 'se-sep';
    toolbar.appendChild(sep1);

    // Font size
    var sizeSelect = document.createElement('select');
    sizeSelect.title = 'Font size';
    sizeSelect.innerHTML = '<option value="">Size</option>' +
      FONT_SIZES.map(function (s) { return '<option value="' + s.value + '">' + s.label + '</option>'; }).join('');
    sizeSelect.addEventListener('change', function () {
      if (!sizeSelect.value) return;
      applyFontSize(sizeSelect.value);
      body.focus();
      sizeSelect.value = '';
    });
    toolbar.appendChild(sizeSelect);

    // Separator
    var sep2 = document.createElement('span');
    sep2.className = 'se-sep';
    toolbar.appendChild(sep2);

    // Text color
    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#22395a';
    colorInput.title = 'Text color';
    colorInput.addEventListener('input', function () {
      document.execCommand('foreColor', false, colorInput.value);
      body.focus();
    });
    toolbar.appendChild(colorInput);

    wrap.appendChild(toolbar);

    // -- Body (contenteditable) --
    var body = document.createElement('div');
    body.className = 'se-body';
    body.contentEditable = 'true';
    body.setAttribute('data-placeholder', opts.placeholder || 'Enter task description...');
    wrap.appendChild(body);

    container.appendChild(wrap);

    // -- Font size via span style (execCommand fontSize is unreliable) --
    function applyFontSize(size) {
      var sel = window.getSelection();
      if (!sel.rangeCount) return;
      // Use fontSize command then fix the generated <font> tags
      document.execCommand('fontSize', false, '7');
      var fonts = body.querySelectorAll('font[size="7"]');
      for (var i = 0; i < fonts.length; i++) {
        var span = document.createElement('span');
        span.style.fontSize = size;
        span.innerHTML = fonts[i].innerHTML;
        fonts[i].parentNode.replaceChild(span, fonts[i]);
      }
    }

    // -- Active state tracking --
    function updateActive() {
      boldBtn.classList.toggle('active', document.queryCommandState('bold'));
      italicBtn.classList.toggle('active', document.queryCommandState('italic'));
      underlineBtn.classList.toggle('active', document.queryCommandState('underline'));
    }
    body.addEventListener('keyup', updateActive);
    body.addEventListener('mouseup', updateActive);

    // -- API --
    return {
      getHtml: function () {
        return body.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)*$/, '').trim();
      },
      setHtml: function (html) {
        body.innerHTML = html || '';
      },
      clear: function () {
        body.innerHTML = '';
      },
      focus: function () {
        body.focus();
      },
      el: body
    };
  }

  if (!window.GCP) window.GCP = {};
  window.GCP.createSimpleEditor = createSimpleEditor;
})();
