/**
 * GCP Rich Editor v2
 *
 * Architecture: Model → Renderer → DOM
 *   - The document lives as a plain-JS model tree (no DOM).
 *   - Every edit goes through a Command that returns a new model.
 *   - renderModel() is a pure function: model → DOM fragment.
 *   - Track changes, comments, tables, line-spacing, colour palettes
 *     are all first-class model concepts, not DOM hacks.
 *
 * Step 1 (this file): model schema, HTML↔model, renderer.
 * Steps 2-7 add commands, track changes, toolbar, and replace rich-editor.js.
 *
 * Public API (same contract as rich-editor.js so editor.js needs no changes):
 *   window.GCP.RichEditor({ container, initialHtml, authorName,
 *                            sectionTitle, onCommentsClick,
 *                            onDeleteComment, onReplyComment })
 *   → { el, getHtml(), setHtml(), setComments(), hasChanges() }
 */
(function () {
  'use strict';

  // ── Author colour palette (Word-style, 8 colours) ──────────────────────────
  // Each entry: [ foreground/border, background ]
  const TC_PALETTE = [
    ['#1d4ed8', 'rgba(29,78,216,.12)'],
    ['#b91c1c', 'rgba(185,28,28,.12)'],
    ['#15803d', 'rgba(21,128,61,.12)'],
    ['#7c3aed', 'rgba(124,58,237,.12)'],
    ['#c2410c', 'rgba(194,65,12,.12)'],
    ['#0f766e', 'rgba(15,118,110,.12)'],
    ['#9d174d', 'rgba(157,23,77,.12)'],
    ['#3730a3', 'rgba(55,48,163,.12)'],
  ];

  function authorColorIdx(name) {
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return h % TC_PALETTE.length;
  }

  function getInitials(name) {
    return (name || '').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(s => s[0] && s[0].toUpperCase()).filter(Boolean).join('') || '?';
  }

  // ── Model — factory functions ──────────────────────────────────────────────
  //
  // Every node is a plain JS object.  The renderer reads these; nothing else
  // should touch the DOM directly.

  /**
   * TextRun — the atomic unit of styled text.
   *
   * marks: {
   *   bold, italic, underline, strikethrough  → boolean
   *   fontFamily, fontSize, color, background → string
   * }
   *
   * pending: null  |  {
   *   op      : 'insert' | 'delete' | 'format'
   *   id      : string          — unique change id
   *   author  : string
   *   initials: string
   *   time    : ISO string
   *   oldMarks: object          — only for op='format', marks before the change
   * }
   */
  function mkRun(text, marks, pending) {
    return { _t: 'run', text: text || '', marks: marks || {}, pending: pending || null };
  }

  /**
   * Block nodes.  `attrs` is shared:
   * {
   *   align      : 'left'|'center'|'right'|'justify'
   *   lineSpacing: number  (CSS line-height value, e.g. 1.5)
   *   indent     : number  (indent level, each level = 2em)
   * }
   */
  function mkParagraph(runs, attrs) {
    return { _t: 'paragraph', runs: runs || [], attrs: attrs || {} };
  }

  function mkHeading(level, runs, attrs) {
    return { _t: 'heading', level: level || 2, runs: runs || [], attrs: attrs || {} };
  }

  /** List block.  items is an array of mkListItem(). */
  function mkList(listType, items, attrs) {
    return { _t: 'list', listType: listType || 'ul', items: items || [], attrs: attrs || {} };
  }

  function mkListItem(runs) {
    return { _t: 'listItem', runs: runs || [] };
  }

  /**
   * Table.  rows → mkTableRow → cells → mkTableCell.
   * Each cell holds an array of block nodes (paragraphs, lists …).
   */
  function mkTable(rows) {
    return { _t: 'table', rows: rows || [] };
  }

  function mkTableRow(cells) {
    return { _t: 'tableRow', cells: cells || [] };
  }

  function mkTableCell(blocks, isHeader, attrs) {
    return {
      _t: 'tableCell',
      blocks: blocks && blocks.length ? blocks : [mkParagraph([mkRun('')])],
      isHeader: !!isHeader,
      attrs: attrs || {},   // colspan, rowspan, width, bgColor …
    };
  }

  /** Canonical empty document. */
  function mkEmptyDoc() {
    return { _t: 'doc', blocks: [mkParagraph([mkRun('')])] };
  }

  // ── HTML → Model parser ────────────────────────────────────────────────────
  //
  // Handles:
  //   • structural: p div h1-h6 ul ol li table tr th td blockquote
  //   • inline marks: strong b em i u s strike del ins font span[style]
  //   • track-change markup from rich-editor.js v1 (data-tc-id, data-tc-fmt-id)
  //   • legacy execCommand output (<font face size>, <span style="…">)

  function htmlToModel(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = (html || '').trim();
    const blocks = parseBlockNodes(wrap.childNodes);
    return { _t: 'doc', blocks: blocks.length ? blocks : [mkParagraph([mkRun('')])] };
  }

  // Parse a NodeList/array into an array of block nodes.
  function parseBlockNodes(nodeList) {
    const blocks = [];
    nodeList.forEach(node => {
      const b = nodeToBlock(node);
      if (b) {
        if (Array.isArray(b)) b.forEach(x => blocks.push(x));
        else blocks.push(b);
      }
    });
    return blocks;
  }

  function nodeToBlock(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent;
      if (!t.trim()) return null;
      return mkParagraph([mkRun(t)]);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tag = node.tagName.toLowerCase();

    if (tag === 'p' || tag === 'div') {
      // A div/p containing block children → flatten to blocks
      const hasBlockChild = [...node.childNodes].some(n =>
        n.nodeType === Node.ELEMENT_NODE &&
        ['p','div','ul','ol','table','h1','h2','h3','h4','h5','h6','blockquote'].includes(n.tagName.toLowerCase())
      );
      if (hasBlockChild) return parseBlockNodes(node.childNodes);
      return mkParagraph(parseRuns(node), parseBlockAttrs(node));
    }

    if (/^h[1-6]$/.test(tag)) {
      return mkHeading(parseInt(tag[1], 10), parseRuns(node), parseBlockAttrs(node));
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = [...node.childNodes]
        .filter(n => n.nodeType === Node.ELEMENT_NODE && n.tagName.toLowerCase() === 'li')
        .map(li => mkListItem(parseRuns(li)));
      return mkList(tag, items, parseBlockAttrs(node));
    }

    if (tag === 'li') {
      return mkListItem(parseRuns(node));
    }

    if (tag === 'table') {
      return parseTable(node);
    }

    if (tag === 'blockquote') {
      // Treat as indented paragraphs
      return parseBlockNodes(node.childNodes).map(b => {
        const a = b.attrs || {};
        return { ...b, attrs: { ...a, indent: (a.indent || 0) + 1 } };
      });
    }

    if (tag === 'br') return null;

    // Anything else with only inline content → paragraph
    return mkParagraph(parseRuns(node), parseBlockAttrs(node));
  }

  function parseBlockAttrs(el) {
    const attrs = {};
    const s = el.style;
    if (s.textAlign)  attrs.align       = s.textAlign;
    if (s.lineHeight) attrs.lineSpacing  = parseFloat(s.lineHeight) || undefined;
    if (s.paddingLeft) attrs.indent = Math.max(0, Math.round(parseFloat(s.paddingLeft) / 2));
    return attrs;
  }

  function parseTable(tableEl) {
    const rows = [];
    tableEl.querySelectorAll('tr').forEach(trEl => {
      const cells = [];
      trEl.querySelectorAll('th, td').forEach(cellEl => {
        const isHeader = cellEl.tagName.toLowerCase() === 'th';
        const cellAttrs = {};
        if (cellEl.colSpan > 1) cellAttrs.colspan = cellEl.colSpan;
        if (cellEl.rowSpan > 1) cellAttrs.rowspan = cellEl.rowSpan;
        // Cells may contain block children; if not, wrap runs in a paragraph.
        const hasBlock = [...cellEl.childNodes].some(n =>
          n.nodeType === Node.ELEMENT_NODE &&
          ['p','div','ul','ol','table'].includes(n.tagName.toLowerCase())
        );
        const cellBlocks = hasBlock
          ? parseBlockNodes(cellEl.childNodes)
          : [mkParagraph(parseRuns(cellEl))];
        cells.push(mkTableCell(cellBlocks, isHeader, cellAttrs));
      });
      if (cells.length) rows.push(mkTableRow(cells));
    });
    return mkTable(rows);
  }

  /**
   * Walk an element's subtree collecting TextRun objects.
   * `inherited` accumulates marks from ancestor elements.
   */
  function parseRuns(el) {
    const runs = [];
    walk(el, {}, null);
    return runs.length ? runs : [mkRun('')];

    function walk(node, marks, pending) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) runs.push(mkRun(node.textContent, { ...marks }, pending));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag  = node.tagName.toLowerCase();
      const s    = node.style;
      let m      = { ...marks };
      let p      = pending;

      // Semantic marks
      if (tag === 'strong' || tag === 'b')    m.bold          = true;
      if (tag === 'em'     || tag === 'i')    m.italic        = true;
      if (tag === 'u')                        m.underline     = true;
      if (tag === 's' || tag === 'strike')    m.strikethrough = true;

      // Style-based marks (legacy execCommand output uses <span style="…">)
      if (s.fontWeight === 'bold' || parseInt(s.fontWeight, 10) >= 700) m.bold = true;
      if (s.fontStyle  === 'italic')   m.italic        = true;
      if (s.textDecoration.includes('underline'))     m.underline     = true;
      if (s.textDecoration.includes('line-through'))  m.strikethrough = true;
      if (s.color && s.color !== 'inherit')            m.color      = s.color;
      if (s.backgroundColor && s.backgroundColor !== 'inherit') m.background = s.backgroundColor;
      if (s.fontFamily)  m.fontFamily = s.fontFamily.replace(/['"]/g, '');
      if (s.fontSize)    m.fontSize   = s.fontSize;

      // Legacy <font> element
      if (tag === 'font') {
        if (node.face) m.fontFamily = node.face;
        if (node.color) m.color = node.color;
      }

      // Comment anchor spans
      if (tag === 'span' && node.hasAttribute('data-cmt-anchor-id')) {
        m.cmtAnchorId = node.getAttribute('data-cmt-anchor-id');
      }

      // Track-change markup (v1 compatibility)
      if (tag === 'ins' && node.hasAttribute('data-tc-id')) {
        p = {
          op: 'insert',
          id:       node.getAttribute('data-tc-id'),
          author:   node.getAttribute('data-tc-author')   || '',
          initials: node.getAttribute('data-tc-initials') || '',
          time:     node.getAttribute('data-tc-time')     || '',
        };
      }
      if (tag === 'del' && node.hasAttribute('data-tc-id')) {
        p = {
          op: 'delete',
          id:       node.getAttribute('data-tc-id'),
          author:   node.getAttribute('data-tc-author')   || '',
          initials: node.getAttribute('data-tc-initials') || '',
          time:     node.getAttribute('data-tc-time')     || '',
        };
      }
      if (node.hasAttribute('data-tc-fmt-id')) {
        p = {
          op:       'format',
          id:       node.getAttribute('data-tc-fmt-id'),
          cmd:      node.getAttribute('data-tc-fmt-cmd')  || '',
          oldVal:   node.getAttribute('data-tc-fmt-old')  || '',
          author:   node.getAttribute('data-tc-author')   || '',
          initials: node.getAttribute('data-tc-initials') || '',
          time:     node.getAttribute('data-tc-time')     || '',
        };
      }

      node.childNodes.forEach(child => walk(child, m, p));
    }
  }

  // ── Leaf-container position encoding ─────────────────────────────────────
  //
  // Every "leaf container" element in the rendered DOM — a <p>, <h1-h6>, <li>,
  // or inner-block <p> inside a table cell — gets a `data-v2-lc` attribute that
  // encodes which model node it belongs to.  This lets us convert a DOM cursor
  // position (textNode + offset) into a DocPos without any live model state.

  function encodeLeafMeta(m) {
    let s = String(m.blockIdx);
    if (m.itemIdx     != null) s += ':i' + m.itemIdx;
    if (m.rowIdx      != null) s += ':r' + m.rowIdx + ':c' + m.colIdx + ':b' + (m.cellBlockIdx || 0);
    return s;
  }

  function decodeLeafMeta(s) {
    const blockIdx = parseInt(s, 10);
    const ii  = s.match(/:i(\d+)/);
    const r   = s.match(/:r(\d+)/);
    const c   = s.match(/:c(\d+)/);
    const b   = s.match(/:b(\d+)/);
    return {
      blockIdx,
      itemIdx:      ii ? parseInt(ii[1], 10) : undefined,
      rowIdx:       r  ? parseInt(r[1],  10) : undefined,
      colIdx:       c  ? parseInt(c[1],  10) : undefined,
      cellBlockIdx: b  ? parseInt(b[1],  10) : undefined,
    };
  }

  // ── v2-specific CSS (injected once) ──────────────────────────────────────

  const V2_CSS = `
  /* ── Popups ── */
  .gcp-v2-popup{position:absolute;z-index:10000;background:#fff;border:1px solid #d0d0d0;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.2);padding:8px;min-width:80px}
  [data-theme=dark] .gcp-v2-popup{background:#2a2a2a;border-color:#555;color:#e0e0e0}
  .gcp-v2-swatches{display:grid;grid-template-columns:repeat(8,20px);gap:3px;margin-bottom:6px}
  .gcp-v2-swatch{width:20px;height:20px;border-radius:3px;cursor:pointer;border:1px solid rgba(0,0,0,.15);padding:0}
  .gcp-v2-swatch:hover{outline:2px solid #1d4ed8;outline-offset:1px;transform:scale(1.15)}
  .gcp-v2-custom-row{display:flex;gap:6px;align-items:center;border-top:1px solid #e5e5e5;padding-top:6px;font-size:11px;color:#666}
  [data-theme=dark] .gcp-v2-custom-row{border-top-color:#444}
  .gcp-v2-custom-row input[type=color]{width:28px;height:22px;padding:0;border:1px solid #ccc;border-radius:3px;cursor:pointer}
  .gcp-v2-ls-item{padding:5px 12px;cursor:pointer;font-size:13px;border-radius:3px;white-space:nowrap}
  .gcp-v2-ls-item:hover{background:#f0f4ff}
  .gcp-v2-ls-item.active{background:#e0e8ff;color:#1d4ed8;font-weight:600}
  [data-theme=dark] .gcp-v2-ls-item:hover{background:rgba(255,255,255,.08)}
  .gcp-v2-tpick-grid{display:grid;grid-template-columns:repeat(8,22px);gap:2px}
  .gcp-v2-tpick-cell{width:22px;height:22px;border:1px solid #d0d0d0;border-radius:2px;cursor:pointer;box-sizing:border-box}
  .gcp-v2-tpick-cell.on{background:#cfe2ff;border-color:#1d4ed8}
  .gcp-v2-tpick-label{font-size:11px;color:#888;text-align:center;margin-top:4px;min-height:14px}
  /* ── Table ── */
  .gcp-re-v2-table{border-collapse:collapse;width:100%;margin:.5em 0;table-layout:fixed}
  .gcp-re-v2-table td,.gcp-re-v2-table th{border:1px solid #c9c9c9;padding:4px 8px;vertical-align:top;min-width:32px}
  .gcp-re-v2-table th{background:#f4f4f4;font-weight:600}
  .gcp-re-v2-table td p,.gcp-re-v2-table th p{margin:0}
  /* ── Toolbar buttons ── */
  .gcp-re-btn{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 5px;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;background:transparent;color:inherit;transition:background .1s,color .1s;white-space:nowrap}
  .gcp-re-btn:hover{background:rgba(0,0,0,.07)}
  [data-theme=dark] .gcp-re-btn:hover{background:rgba(255,255,255,.1)}
  .gcp-re-btn.active{background:rgba(29,78,216,.12)!important;color:#1d4ed8!important}
  .gcp-re-sep{display:inline-block;width:1px;height:20px;background:#d0d0d0;margin:0 3px;vertical-align:middle;flex-shrink:0}
  [data-theme=dark] .gcp-re-sep{background:#555}
  /* ── Layout ── */
  .gcp-re-v2-wrapper{position:relative;display:flex;flex-direction:column;border:1px solid #d0d0d0;border-radius:6px;overflow:hidden;font-family:inherit}
  [data-theme=dark] .gcp-re-v2-wrapper{border-color:#555}
  .gcp-re-v2-toolbar{display:flex;flex-wrap:wrap;gap:2px;padding:4px 6px;background:#f8f8f8;border-bottom:1px solid #e0e0e0;align-items:center}
  [data-theme=dark] .gcp-re-v2-toolbar{background:#2a2a2a;border-bottom-color:#444}
  .gcp-re-v2-editor-area{display:flex;flex:1;min-height:0;position:relative}
  .gcp-re-v2-host{flex:1;min-height:200px;padding:12px 16px;outline:none;overflow-y:auto;font-size:14px;line-height:1.6;word-break:break-word}
  .gcp-re-v2-host p,.gcp-re-v2-host h1,.gcp-re-v2-host h2,.gcp-re-v2-host h3,.gcp-re-v2-host h4{margin:.3em 0}
  .gcp-re-v2-host ul,.gcp-re-v2-host ol{padding-left:1.8em;margin:.3em 0}
  /* ── Balloons ── */
  .gcp-re-v2-balloons{width:200px;flex-shrink:0;padding:8px 6px;overflow-y:auto;border-left:1px solid #e8e8e8;display:flex;flex-direction:column;gap:8px;background:#fafafa}
  [data-theme=dark] .gcp-re-v2-balloons{border-left-color:#444;background:#1a1a1a}
  .gcp-re-v2-balloon{border-left:3px solid var(--tc-color,#1d4ed8);border-radius:4px;padding:6px 8px;background:#fff;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  [data-theme=dark] .gcp-re-v2-balloon{background:#252525}
  .gcp-re-v2-balloon-header{display:flex;align-items:center;gap:5px;margin-bottom:4px}
  .gcp-re-v2-balloon-badge{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;color:#fff;font-size:10px;font-weight:700;flex-shrink:0}
  .gcp-re-v2-balloon-info{flex:1;font-size:11px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  [data-theme=dark] .gcp-re-v2-balloon-info{color:#aaa}
  .gcp-re-v2-balloon-desc{color:#333;margin-bottom:5px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px}
  [data-theme=dark] .gcp-re-v2-balloon-desc{color:#ccc}
  .gcp-re-v2-balloon-actions{display:flex;gap:4px}
  .gcp-re-v2-balloon-actions button{flex:1;padding:2px 6px;font-size:11px;border:1px solid #ccc;border-radius:3px;cursor:pointer;background:#fff;transition:background .1s}
  .gcp-re-v2-balloon-actions button:hover{background:#f0f0f0}
  [data-theme=dark] .gcp-re-v2-balloon-actions button{background:#333;border-color:#555;color:#e0e0e0}
  [data-theme=dark] .gcp-re-v2-balloon-actions button:hover{background:#3a3a3a}
  /* ── Track-changes visual ── */
  ins[data-tc-id]{text-decoration:underline;text-decoration-color:var(--tc-color);text-underline-offset:2px;color:var(--tc-color)}
  del[data-tc-id]{text-decoration:line-through;text-decoration-color:var(--tc-color);color:var(--tc-color);opacity:.8}
  span[data-tc-fmt-id]{outline:2px dotted var(--tc-color,#7c3aed);outline-offset:1px;border-radius:2px}
  /* ── TC hidden mode ── */
  .gcp-re-v2-host:not(.tc-visible) ins[data-tc-id]{color:inherit;text-decoration:none}
  .gcp-re-v2-host:not(.tc-visible) del[data-tc-id]{display:none}
  .gcp-re-v2-host:not(.tc-visible) span[data-tc-fmt-id]{outline:none}
  /* ── Comment anchors ── */
  .gcp-re-cmt-anchor{border-bottom:2px solid #f59e0b;cursor:pointer;border-radius:2px;transition:background .1s}
  .gcp-re-cmt-anchor:hover,.gcp-re-cmt-anchor--active{background:rgba(245,158,11,.18)}
  .gcp-re-v2-wrapper.gcp-re-v2-comments-active .gcp-re-cmt-anchor{background:rgba(245,158,11,.10)}
  /* ── Fullscreen ── */
  .gcp-re-v2-fullscreen{position:fixed!important;inset:0!important;z-index:9999!important;border-radius:0!important;border:none!important;height:100vh!important;width:100vw!important;display:flex!important;flex-direction:column!important}
  .gcp-re-v2-fullscreen .gcp-re-v2-host{flex:1!important;height:100%!important;min-height:0!important}
  `;

  // ── Model → DOM renderer ───────────────────────────────────────────────────
  //
  // Pure function: takes a model, returns a DocumentFragment.
  // No side effects, no event listeners, no state.

  function renderModel(doc) {
    const frag = document.createDocumentFragment();
    (doc.blocks || []).forEach((b, bi) => {
      const el = renderBlock(b, { blockIdx: bi });
      if (el) frag.appendChild(el);
    });
    return frag;
  }

  function renderBlock(block, meta) {
    // meta = { blockIdx, [itemIdx], [rowIdx, colIdx, cellBlockIdx] }
    switch (block._t) {
      case 'paragraph': {
        const el = document.createElement('p');
        if (meta) el.setAttribute('data-v2-lc', encodeLeafMeta(meta));
        applyBlockAttrs(el, block.attrs);
        appendRuns(el, block.runs);
        return el;
      }
      case 'heading': {
        const el = document.createElement('h' + (block.level || 2));
        if (meta) el.setAttribute('data-v2-lc', encodeLeafMeta(meta));
        applyBlockAttrs(el, block.attrs);
        appendRuns(el, block.runs);
        return el;
      }
      case 'list': {
        const el = document.createElement(block.listType === 'ol' ? 'ol' : 'ul');
        applyBlockAttrs(el, block.attrs);
        (block.items || []).forEach((item, ii) => {
          const li = document.createElement('li');
          if (meta) li.setAttribute('data-v2-lc', encodeLeafMeta({ ...meta, itemIdx: ii }));
          appendRuns(li, item.runs);
          el.appendChild(li);
        });
        return el;
      }
      case 'table': return renderTable(block, meta);
      default: return null;
    }
  }

  function applyBlockAttrs(el, attrs) {
    if (!attrs) return;
    if (attrs.align && attrs.align !== 'left') el.style.textAlign = attrs.align;
    if (attrs.lineSpacing)  el.style.lineHeight  = String(attrs.lineSpacing);
    if (attrs.indent > 0)   el.style.paddingLeft = (attrs.indent * 2) + 'em';
  }

  function appendRuns(container, runs) {
    if (!runs || !runs.length) { container.appendChild(document.createElement('br')); return; }
    let allEmpty = true;
    runs.forEach(run => {
      if (run.text) allEmpty = false;
      container.appendChild(renderRun(run));
    });
    if (allEmpty) container.appendChild(document.createElement('br'));
  }

  function renderRun(run) {
    // 1. Text node
    let node = document.createTextNode(run.text || '');

    // 2. Style span (colour, background, font) — one element, multiple styles
    const m = run.marks || {};
    const needsSpan = m.color || m.background || m.fontFamily || m.fontSize;
    if (needsSpan) {
      const span = document.createElement('span');
      if (m.color)      span.style.color           = m.color;
      if (m.background) span.style.backgroundColor = m.background;
      if (m.fontFamily) span.style.fontFamily       = m.fontFamily;
      if (m.fontSize)   span.style.fontSize         = m.fontSize;
      span.appendChild(node);
      node = span;
    }

    // 3. Semantic wrappers — innermost first so nesting reads naturally
    if (m.strikethrough) { const el = document.createElement('s');      el.appendChild(node); node = el; }
    if (m.underline)     { const el = document.createElement('u');      el.appendChild(node); node = el; }
    if (m.italic)        { const el = document.createElement('em');     el.appendChild(node); node = el; }
    if (m.bold)          { const el = document.createElement('strong'); el.appendChild(node); node = el; }

    // 4. Comment-anchor wrapper
    if (m.cmtAnchorId) {
      const span = document.createElement('span');
      span.setAttribute('data-cmt-anchor-id', m.cmtAnchorId);
      span.className = 'gcp-re-cmt-anchor';
      span.appendChild(node);
      node = span;
    }

    // 5. Track-change wrapper
    const p = run.pending;
    if (p) {
      const [color] = TC_PALETTE[authorColorIdx(p.author)];
      if (p.op === 'insert') {
        const ins = document.createElement('ins');
        ins.setAttribute('data-tc-id',       p.id);
        ins.setAttribute('data-tc-author',   p.author);
        ins.setAttribute('data-tc-initials', p.initials || getInitials(p.author));
        ins.setAttribute('data-tc-time',     p.time);
        ins.style.setProperty('--tc-color',  color);
        ins.appendChild(node); node = ins;

      } else if (p.op === 'delete') {
        const del = document.createElement('del');
        del.setAttribute('data-tc-id',       p.id);
        del.setAttribute('data-tc-author',   p.author);
        del.setAttribute('data-tc-initials', p.initials || getInitials(p.author));
        del.setAttribute('data-tc-time',     p.time);
        del.style.setProperty('--tc-color',  color);
        del.appendChild(node); node = del;

      } else if (p.op === 'format') {
        const span = document.createElement('span');
        span.setAttribute('data-tc-fmt-id',  p.id);
        span.setAttribute('data-tc-fmt-cmd', p.cmd   || '');
        span.setAttribute('data-tc-fmt-old', p.oldVal || '');
        span.setAttribute('data-tc-author',  p.author);
        span.setAttribute('data-tc-initials',p.initials || getInitials(p.author));
        span.setAttribute('data-tc-time',    p.time);
        span.style.setProperty('--tc-color', color);
        span.appendChild(node); node = span;
      }
    }

    return node;
  }

  function renderTable(block, meta) {
    // meta = { blockIdx } inherited from the table's position in the doc
    const table  = document.createElement('table');
    table.className = 'gcp-re-v2-table';
    const tbody = document.createElement('tbody');
    (block.rows || []).forEach((row, ri) => {
      const tr = document.createElement('tr');
      (row.cells || []).forEach((cell, ci) => {
        const td = document.createElement(cell.isHeader ? 'th' : 'td');
        if (cell.attrs) {
          if (cell.attrs.colspan > 1) td.colSpan = cell.attrs.colspan;
          if (cell.attrs.rowspan > 1) td.rowSpan = cell.attrs.rowspan;
          if (cell.attrs.width)       td.style.width   = cell.attrs.width;
          if (cell.attrs.bgColor)     td.style.backgroundColor = cell.attrs.bgColor;
        }
        // Each cell contains block nodes — each is its own leaf container
        (cell.blocks || []).forEach((b, cbi) => {
          const cellMeta = meta
            ? { blockIdx: meta.blockIdx, rowIdx: ri, colIdx: ci, cellBlockIdx: cbi }
            : undefined;
          const el = renderBlock(b, cellMeta);
          if (el) td.appendChild(el);
        });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  // ── Model → clean HTML serialiser ─────────────────────────────────────────
  //
  // Produces HTML with:
  //   • accepted-state content (pending deletes omitted, pending inserts kept)
  //   • no track-change markup
  //   • no empty wrapper spans

  function modelToHtml(doc) {
    return (doc.blocks || []).map(serBlock).join('');
  }

  function serBlock(block) {
    switch (block._t) {
      case 'paragraph': {
        const inner = serRuns(block.runs);
        return `<p${serBlockAttrs(block.attrs)}>${inner || '<br>'}</p>`;
      }
      case 'heading': {
        const tag = 'h' + (block.level || 2);
        return `<${tag}${serBlockAttrs(block.attrs)}>${serRuns(block.runs)}</${tag}>`;
      }
      case 'list': {
        const tag   = block.listType === 'ol' ? 'ol' : 'ul';
        const items = (block.items || []).map(item => `<li>${serRuns(item.runs)}</li>`).join('');
        return `<${tag}${serBlockAttrs(block.attrs)}>${items}</${tag}>`;
      }
      case 'table': {
        const rows = (block.rows || []).map(row => {
          const cells = (row.cells || []).map(cell => {
            const tag   = cell.isHeader ? 'th' : 'td';
            const attrs = serCellAttrs(cell.attrs);
            const inner = (cell.blocks || []).map(serBlock).join('');
            return `<${tag}${attrs}>${inner}</${tag}>`;
          }).join('');
          return `<tr>${cells}</tr>`;
        }).join('');
        return `<table><tbody>${rows}</tbody></table>`;
      }
      default: return '';
    }
  }

  function serBlockAttrs(attrs) {
    if (!attrs) return '';
    const styles = [];
    if (attrs.align && attrs.align !== 'left') styles.push(`text-align:${attrs.align}`);
    if (attrs.lineSpacing) styles.push(`line-height:${attrs.lineSpacing}`);
    if (attrs.indent > 0)  styles.push(`padding-left:${attrs.indent * 2}em`);
    return styles.length ? ` style="${styles.join(';')}"` : '';
  }

  function serCellAttrs(attrs) {
    if (!attrs) return '';
    let a = '';
    if (attrs.colspan > 1) a += ` colspan="${attrs.colspan}"`;
    if (attrs.rowspan > 1) a += ` rowspan="${attrs.rowspan}"`;
    if (attrs.width)       a += ` style="width:${attrs.width}"`;
    return a;
  }

  function serRuns(runs) {
    return (runs || []).map(run => {
      // Skip pending deletes in clean output
      if (run.pending && run.pending.op === 'delete') return '';
      let html = esc(run.text);
      const m = run.marks || {};
      // Style attributes (outermost wrappers so they don't multiply)
      const styles = [];
      if (m.color)      styles.push(`color:${m.color}`);
      if (m.background) styles.push(`background-color:${m.background}`);
      if (m.fontFamily) styles.push(`font-family:${m.fontFamily}`);
      if (m.fontSize)   styles.push(`font-size:${m.fontSize}`);
      if (styles.length) html = `<span style="${styles.join(';')}">${html}</span>`;
      if (m.strikethrough) html = `<s>${html}</s>`;
      if (m.underline)     html = `<u>${html}</u>`;
      if (m.italic)        html = `<em>${html}</em>`;
      if (m.bold)          html = `<strong>${html}</strong>`;
      if (m.cmtAnchorId)   html = `<span data-cmt-anchor-id="${esc(m.cmtAnchorId)}" class="gcp-re-cmt-anchor">${html}</span>`;
      return html;
    }).join('');
  }

  function esc(s) {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Step 2: Commands ──────────────────────────────────────────────────────
  //
  // All commands are PURE: (doc, …args) → newDoc.  They never mutate their
  // input.  Track-changes (Step 3) wraps each command so the "new" state is
  // stored as a pending op instead of being committed directly.
  //
  // Position model
  // ──────────────
  // A DocPos pinpoints a character inside a leaf block (a block that holds
  // runs directly).  It uses a hierarchical path:
  //
  //   Top-level paragraph / heading:
  //     { blockIdx, runIdx, offset }
  //
  //   List item (blockIdx → list, itemIdx → item):
  //     { blockIdx, itemIdx, runIdx, offset }
  //
  //   Table cell (blockIdx → table, rowIdx, colIdx,
  //               cellBlockIdx → block inside the cell):
  //     { blockIdx, rowIdx, colIdx, cellBlockIdx, runIdx, offset }
  //
  // A DocRange = { start: DocPos, end: DocPos }  (start ≤ end in doc order)

  // ── Leaf-block helpers ────────────────────────────────────────────────────

  /** Return the runs array for the leaf block identified by pos. */
  function getLeafRuns(doc, pos) {
    const b = doc.blocks[pos.blockIdx];
    if (!b) return [];
    if (b._t === 'paragraph' || b._t === 'heading') return b.runs;
    if (b._t === 'list')  return b.items[pos.itemIdx ?? 0]?.runs ?? [];
    if (b._t === 'table') {
      return b.rows[pos.rowIdx ?? 0]
              ?.cells[pos.colIdx ?? 0]
              ?.blocks[pos.cellBlockIdx ?? 0]
              ?.runs ?? [];
    }
    return [];
  }

  /**
   * Return a new doc with the leaf runs at pos replaced by fn(currentRuns).
   * Handles paragraphs, headings, list items, and table cells uniformly.
   */
  function withLeafRuns(doc, pos, fn) {
    const blocks = [...doc.blocks];
    const b = blocks[pos.blockIdx];

    if (b._t === 'paragraph' || b._t === 'heading') {
      blocks[pos.blockIdx] = { ...b, runs: fn(b.runs) };

    } else if (b._t === 'list') {
      const iIdx = pos.itemIdx ?? 0;
      const items = [...b.items];
      items[iIdx] = mkListItem(fn(items[iIdx].runs));
      blocks[pos.blockIdx] = mkList(b.listType, items, b.attrs);

    } else if (b._t === 'table') {
      const rIdx = pos.rowIdx    ?? 0;
      const cIdx = pos.colIdx    ?? 0;
      const bIdx = pos.cellBlockIdx ?? 0;
      const rows = b.rows.map((row, ri) => {
        if (ri !== rIdx) return row;
        const cells = row.cells.map((cell, ci) => {
          if (ci !== cIdx) return cell;
          const cb = [...cell.blocks];
          cb[bIdx] = { ...cb[bIdx], runs: fn(cb[bIdx].runs) };
          return mkTableCell(cb, cell.isHeader, cell.attrs);
        });
        return mkTableRow(cells);
      });
      blocks[pos.blockIdx] = mkTable(rows);
    }

    return { ...doc, blocks };
  }

  /** Replace all top-level blocks (useful for cross-block mutations). */
  function withBlocks(doc, fn) { return { ...doc, blocks: fn([...doc.blocks]) }; }

  // ── Run helpers ───────────────────────────────────────────────────────────

  function marksEqual(a, b) {
    const ka = Object.keys(a || {}), kb = Object.keys(b || {});
    return ka.length === kb.length && ka.every(k => a[k] === b[k]);
  }

  /**
   * Merge adjacent runs that share identical marks and no pending op.
   * Always returns at least one run (even if empty).
   */
  function normalizeRuns(runs) {
    const out = [];
    for (const run of (runs || [])) {
      const last = out[out.length - 1];
      if (last && !last.pending && !run.pending && marksEqual(last.marks, run.marks)) {
        out[out.length - 1] = mkRun(last.text + run.text, last.marks);
      } else {
        out.push(run);
      }
    }
    return out.length ? out : [mkRun('')];
  }

  /**
   * Character offset of (runIdx, offset) from the beginning of the runs array.
   * Used to convert run-relative positions into a flat integer for range math.
   */
  function runsCharPos(runs, runIdx, offset) {
    let pos = 0;
    for (let i = 0; i < runIdx; i++) pos += (runs[i]?.text.length ?? 0);
    return pos + (offset ?? 0);
  }

  /** Total character length of a runs array. */
  function runsLength(runs) {
    return (runs || []).reduce((n, r) => n + r.text.length, 0);
  }

  /**
   * Split runs into [before, after] at character position charPos.
   * The split point boundary does not break pending-tracked runs unless
   * the split falls exactly at the run boundary.
   */
  function splitRunsAt(runs, charPos) {
    const before = [], after = [];
    let pos = 0;
    for (const run of (runs || [])) {
      const end = pos + run.text.length;
      if (end <= charPos) {
        before.push(run);
      } else if (pos >= charPos) {
        after.push(run);
      } else {
        const cut = charPos - pos;
        if (cut > 0) before.push(mkRun(run.text.slice(0, cut), run.marks, run.pending));
        after.push(         mkRun(run.text.slice(cut),     run.marks, run.pending));
      }
      pos = end;
    }
    return [before, after];
  }

  function posEqual(a, b) {
    return a.blockIdx         === b.blockIdx  &&
           (a.itemIdx    ?? null) === (b.itemIdx    ?? null) &&
           (a.rowIdx     ?? null) === (b.rowIdx     ?? null) &&
           (a.colIdx     ?? null) === (b.colIdx     ?? null) &&
           (a.cellBlockIdx ?? null) === (b.cellBlockIdx ?? null) &&
           a.runIdx          === b.runIdx     &&
           a.offset          === b.offset;
  }

  // ── Text commands ─────────────────────────────────────────────────────────

  /**
   * Insert plain text at pos, inheriting the marks of the run at the cursor.
   * If a range is supplied, the range is deleted first.
   */
  function cmdInsertText(doc, pos, text, range) {
    if (!text) return doc;
    let d = range && !posEqual(range.from, range.to) ? cmdDeleteRange(doc, range) : doc;
    const insertPos = range ? range.from : pos;
    return withLeafRuns(d, insertPos, runs => {
      const run = runs[insertPos.runIdx] ?? mkRun('');
      const cp  = runsCharPos(runs, insertPos.runIdx, insertPos.offset);
      const [before, after] = splitRunsAt(runs, cp);
      return normalizeRuns([...before, mkRun(text, { ...run.marks }), ...after]);
    });
  }

  /**
   * Delete the content described by range.
   * Handles intra-block and cross-block ranges.
   * For cross-block: merges the start and end blocks' surviving content.
   */
  function cmdDeleteRange(doc, range) {
    const { from, to } = range;
    if (posEqual(from, to)) return doc;

    const sameLeaf = from.blockIdx         === to.blockIdx  &&
                     (from.itemIdx ?? null) === (to.itemIdx ?? null) &&
                     (from.rowIdx  ?? null) === (to.rowIdx  ?? null) &&
                     (from.colIdx  ?? null) === (to.colIdx  ?? null);

    // ── intra-block ──────────────────────────────────────────────────────
    if (sameLeaf) {
      return withLeafRuns(doc, from, runs => {
        const s = runsCharPos(runs, from.runIdx, from.offset);
        const e = runsCharPos(runs, to.runIdx,   to.offset);
        const [before] = splitRunsAt(runs, s);
        const [, after] = splitRunsAt(runs, e);
        return normalizeRuns([...before, ...after]);
      });
    }

    // ── cross-block (top-level paragraphs / headings only) ───────────────
    const fromRuns = getLeafRuns(doc, from);
    const toRuns   = getLeafRuns(doc, to);
    const fromCp   = runsCharPos(fromRuns, from.runIdx, from.offset);
    const toCp     = runsCharPos(toRuns,   to.runIdx,   to.offset);

    const [keptFrom] = splitRunsAt(fromRuns, fromCp);
    const [, keptTo] = splitRunsAt(toRuns,   toCp);
    const mergedRuns = normalizeRuns([...keptFrom, ...keptTo]);

    return withBlocks(doc, blocks => {
      const fromBlock = blocks[from.blockIdx];
      const result = [];
      blocks.forEach((b, i) => {
        if (i < from.blockIdx)  result.push(b);
        if (i === from.blockIdx) result.push({ ...fromBlock, runs: mergedRuns });
        // i > from.blockIdx and i <= to.blockIdx: drop
        if (i > to.blockIdx)   result.push(b);
      });
      return result.length ? result : [mkParagraph([mkRun('')])];
    });
  }

  // ── Mark commands ─────────────────────────────────────────────────────────

  /**
   * Apply fn(marks) → newMarks to every run that overlaps range.
   * Works intra-block and across multiple top-level blocks.
   */
  function cmdApplyMarkFn(doc, range, fn) {
    const { from, to } = range;

    function applyToRuns(runs, fromChar, toChar) {
      const newRuns = [];
      let pos = 0;
      for (const run of runs) {
        const re = pos + run.text.length;
        if (re <= fromChar || pos >= toChar || !run.text) {
          newRuns.push(run);
        } else if (pos >= fromChar && re <= toChar) {
          newRuns.push(mkRun(run.text, fn({ ...run.marks }), run.pending));
        } else {
          const sl = Math.max(0, fromChar - pos);
          const sr = Math.min(run.text.length, toChar - pos);
          if (sl > 0)  newRuns.push(mkRun(run.text.slice(0, sl), run.marks, run.pending));
          newRuns.push(     mkRun(run.text.slice(sl, sr), fn({ ...run.marks }), run.pending));
          if (sr < run.text.length)
                       newRuns.push(mkRun(run.text.slice(sr), run.marks, run.pending));
        }
        pos = re;
      }
      return normalizeRuns(newRuns);
    }

    // Single leaf block
    if (from.blockIdx === to.blockIdx) {
      return withLeafRuns(doc, from, runs => {
        const s = runsCharPos(runs, from.runIdx, from.offset);
        const e = runsCharPos(runs, to.runIdx,   to.offset);
        return applyToRuns(runs, s, e);
      });
    }

    // Cross-block: apply block by block
    let d = doc;
    for (let bi = from.blockIdx; bi <= to.blockIdx; bi++) {
      const pos = { ...from, blockIdx: bi, runIdx: 0, offset: 0 };
      d = withLeafRuns(d, pos, runs => {
        const fc = bi === from.blockIdx
          ? runsCharPos(runs, from.runIdx, from.offset) : 0;
        const tc = bi === to.blockIdx
          ? runsCharPos(runs, to.runIdx, to.offset) : runsLength(runs);
        return applyToRuns(runs, fc, tc);
      });
    }
    return d;
  }

  /** Set a specific mark key to value across the range. */
  function cmdApplyMark(doc, range, markKey, markValue) {
    return cmdApplyMarkFn(doc, range, m => ({ ...m, [markKey]: markValue }));
  }

  /** Remove a mark key across the range. */
  function cmdRemoveMark(doc, range, markKey) {
    return cmdApplyMarkFn(doc, range, m => { const n = { ...m }; delete n[markKey]; return n; });
  }

  /**
   * Toggle a boolean mark.  If every character in the range already has the
   * mark, remove it; otherwise apply it.  Works across block boundaries.
   */
  function cmdToggleMark(doc, range, markKey) {
    const { from, to } = range;
    let allHave = true;

    outer: for (let bi = from.blockIdx; bi <= to.blockIdx; bi++) {
      const pos  = { ...from, blockIdx: bi, runIdx: 0, offset: 0 };
      const runs = getLeafRuns(doc, pos);
      const fc = bi === from.blockIdx ? runsCharPos(runs, from.runIdx, from.offset) : 0;
      const tc = bi === to.blockIdx   ? runsCharPos(runs, to.runIdx,   to.offset)   : runsLength(runs);
      let charPos = 0;
      for (const run of runs) {
        const re = charPos + run.text.length;
        if (re > fc && charPos < tc && run.text && !run.marks[markKey]) {
          allHave = false; break outer;
        }
        charPos = re;
      }
    }

    return allHave
      ? cmdRemoveMark(doc, range, markKey)
      : cmdApplyMark(doc, range, markKey, true);
  }

  /** Apply a non-boolean mark value (font, colour …) across the range. */
  function cmdSetMark(doc, range, markKey, value) {
    return value == null || value === ''
      ? cmdRemoveMark(doc, range, markKey)
      : cmdApplyMark(doc, range, markKey, value);
  }

  // ── Block commands ────────────────────────────────────────────────────────

  /**
   * Split a block at pos (Enter key).
   * The left block keeps the original type; the right becomes a paragraph.
   * Works for top-level paragraphs and headings; delegates to list-item
   * splitting for list blocks.
   */
  function cmdSplitBlock(doc, pos) {
    return withBlocks(doc, blocks => {
      const b   = blocks[pos.blockIdx];
      const cp  = runsCharPos(b.runs || [], pos.runIdx, pos.offset);
      const [before, after] = splitRunsAt(b.runs || [], cp);

      const left  = { ...b,              runs: normalizeRuns(before.length ? before : [mkRun('')]) };
      const right = mkParagraph(           normalizeRuns(after.length  ? after  : [mkRun('')]));
      blocks.splice(pos.blockIdx, 1, left, right);
      return blocks;
    });
  }

  /**
   * Merge block at blockIdx with the block immediately before it (Backspace
   * at the very start of a block).  Only works for simple blocks with runs.
   */
  function cmdMergeBlockWithPrev(doc, blockIdx) {
    if (blockIdx <= 0) return doc;
    return withBlocks(doc, blocks => {
      const prev = blocks[blockIdx - 1];
      const curr = blocks[blockIdx];
      if (!prev.runs || !curr.runs) return blocks; // can't merge table/list
      const merged = { ...prev, runs: normalizeRuns([...prev.runs, ...curr.runs]) };
      blocks.splice(blockIdx - 1, 2, merged);
      return blocks;
    });
  }

  /**
   * Insert pasted blocks at pos.
   * - Single simple-block paste: merges pasted runs inline at cursor.
   * - Multi-block paste at a top-level paragraph/heading: splits the host
   *   block and stitches the pasted blocks in between.
   * - Paste inside a list-item or table cell, or complex single block
   *   (table): flattens to inline runs or inserts after the host block.
   */
  function cmdPasteBlocks(doc, pos, pastedBlocks) {
    if (!pastedBlocks || !pastedBlocks.length) return doc;
    const b = doc.blocks[pos.blockIdx];
    if (!b) return doc;

    function getSimpleRuns(blk) {
      if (!blk) return null;
      if (blk._t === 'paragraph' || blk._t === 'heading') return blk.runs || [];
      return null;
    }

    const inTopLevel = b._t === 'paragraph' || b._t === 'heading';

    if (pastedBlocks.length === 1 || !inTopLevel) {
      // Flatten all pasted blocks to inline runs and merge at cursor
      const allRuns = [];
      pastedBlocks.forEach(blk => {
        const runs = getSimpleRuns(blk);
        if (runs) allRuns.push(...runs);
      });
      const cp = runsCharPos(getLeafRuns(doc, pos), pos.runIdx, pos.offset);
      const [before, after] = splitRunsAt(getLeafRuns(doc, pos), cp);
      return withLeafRuns(doc, pos, () => normalizeRuns([...before, ...allRuns, ...after]));
    }

    // Multi-block paste into a top-level paragraph / heading
    const cp = runsCharPos(b.runs || [], pos.runIdx, pos.offset);
    const [beforeRuns, afterRuns] = splitRunsAt(b.runs || [], cp);

    let insertBlocks = [...pastedBlocks];
    let leftRuns  = [...beforeRuns];
    let rightRuns = [...afterRuns];

    const firstRuns = getSimpleRuns(insertBlocks[0]);
    if (firstRuns !== null) {
      leftRuns = [...beforeRuns, ...firstRuns];
      insertBlocks = insertBlocks.slice(1);
    }
    if (insertBlocks.length > 0) {
      const lastRuns = getSimpleRuns(insertBlocks[insertBlocks.length - 1]);
      if (lastRuns !== null) {
        rightRuns = [...lastRuns, ...afterRuns];
        insertBlocks = insertBlocks.slice(0, -1);
      }
    }

    const leftBlock  = { ...b, runs: normalizeRuns(leftRuns.length  ? leftRuns  : [mkRun('')]) };
    const rightBlock = mkParagraph(normalizeRuns(rightRuns.length ? rightRuns : [mkRun('')]));

    return withBlocks(doc, blocks => {
      const result = [...blocks];
      result.splice(pos.blockIdx, 1, leftBlock, ...insertBlocks, rightBlock);
      return result.length ? result : [mkParagraph([mkRun('')])];
    });
  }

  /**
   * Convert a block to a different type.
   * newType: 'paragraph' | 'heading' | 'list'
   * level:   heading level (1-6) or list type ('ul' | 'ol')
   */
  function cmdSetBlockType(doc, blockIdx, newType, level) {
    return withBlocks(doc, blocks => {
      const b    = blocks[blockIdx];
      const runs = b.runs ?? (b._t === 'list' ? b.items[0]?.runs : []) ?? [];
      if (newType === 'heading') {
        blocks[blockIdx] = mkHeading(level || 2, runs, b.attrs);
      } else if (newType === 'list') {
        blocks[blockIdx] = mkList(level || 'ul', [mkListItem(runs)], b.attrs);
      } else {
        blocks[blockIdx] = mkParagraph(runs, b.attrs);
      }
      return blocks;
    });
  }

  /**
   * Merge new attrs into a block's existing attrs.
   * Use this for align, lineSpacing, indent.
   */
  function cmdSetBlockAttrs(doc, blockIdx, newAttrs) {
    return withBlocks(doc, blocks => {
      const b = blocks[blockIdx];
      blocks[blockIdx] = { ...b, attrs: { ...(b.attrs || {}), ...newAttrs } };
      return blocks;
    });
  }

  // ── Table commands ────────────────────────────────────────────────────────

  /**
   * Insert a new table with numRows × numCols cells after afterBlockIdx.
   * Row 0 is rendered as a header row (th cells).
   * An empty paragraph is inserted after the table for cursor placement.
   */
  function cmdInsertTable(doc, afterBlockIdx, numRows, numCols) {
    const rows = Array.from({ length: numRows }, (_, ri) =>
      mkTableRow(
        Array.from({ length: numCols }, () =>
          mkTableCell([mkParagraph([mkRun('')])], ri === 0)
        )
      )
    );
    return withBlocks(doc, blocks => {
      blocks.splice(afterBlockIdx + 1, 0, mkTable(rows), mkParagraph([mkRun('')]));
      return blocks;
    });
  }

  /** Insert a new row after afterRowIdx (0-based) in the table at tableIdx. */
  function cmdInsertTableRow(doc, tableIdx, afterRowIdx) {
    return withBlocks(doc, blocks => {
      const t   = blocks[tableIdx];
      if (t?._t !== 'table') return blocks;
      const nCols = t.rows[0]?.cells.length ?? 0;
      const row   = mkTableRow(Array.from({ length: nCols }, () =>
        mkTableCell([mkParagraph([mkRun('')])])
      ));
      const rows = [...t.rows];
      rows.splice(afterRowIdx + 1, 0, row);
      blocks[tableIdx] = mkTable(rows);
      return blocks;
    });
  }

  /** Delete the row at rowIdx in the table at tableIdx (minimum 1 row kept). */
  function cmdDeleteTableRow(doc, tableIdx, rowIdx) {
    return withBlocks(doc, blocks => {
      const t = blocks[tableIdx];
      if (t?._t !== 'table' || t.rows.length <= 1) return blocks;
      blocks[tableIdx] = mkTable(t.rows.filter((_, i) => i !== rowIdx));
      return blocks;
    });
  }

  /** Insert a new column after afterColIdx in every row of the table. */
  function cmdInsertTableCol(doc, tableIdx, afterColIdx) {
    return withBlocks(doc, blocks => {
      const t = blocks[tableIdx];
      if (t?._t !== 'table') return blocks;
      blocks[tableIdx] = mkTable(
        t.rows.map((row, ri) => {
          const cells = [...row.cells];
          cells.splice(afterColIdx + 1, 0, mkTableCell([mkParagraph([mkRun('')])], ri === 0));
          return mkTableRow(cells);
        })
      );
      return blocks;
    });
  }

  /** Delete the column at colIdx from every row (minimum 1 column kept). */
  function cmdDeleteTableCol(doc, tableIdx, colIdx) {
    return withBlocks(doc, blocks => {
      const t = blocks[tableIdx];
      if (t?._t !== 'table' || (t.rows[0]?.cells.length ?? 0) <= 1) return blocks;
      blocks[tableIdx] = mkTable(
        t.rows.map(row => mkTableRow(row.cells.filter((_, i) => i !== colIdx)))
      );
      return blocks;
    });
  }

  // ── Step 3: Track Changes ─────────────────────────────────────────────────
  //
  // TC commands are TC-aware counterparts of the Step 2 commands.
  // They differ in one key way: instead of committing mutations directly
  // they stamp a `pending` object on the affected runs.
  //
  // pending = {
  //   op       : 'insert' | 'delete' | 'format'
  //   id       : string          unique per user-action (not per run)
  //   author   : string
  //   initials : string
  //   time     : ISO string
  //   label    : string          human label for format changes  ('Bold' …)
  //   oldMarks : object          format only — marks before the change
  // }
  //
  // Accept(id) → insert: clear pending  |  delete: remove run  |  format: clear pending
  // Reject(id) → insert: remove run     |  delete: clear pending|  format: restore oldMarks

  let _tcCounter = 0;
  function tcNewId() { return `tc${Date.now()}${++_tcCounter}`; }

  // ── Walk / transform utilities ────────────────────────────────────────────

  /** Call fn(run) for every run in the document, across all block types. */
  function walkAllRuns(doc, fn) {
    function walkBlock(b) {
      if (b._t === 'paragraph' || b._t === 'heading') {
        (b.runs || []).forEach(fn);
      } else if (b._t === 'list') {
        b.items.forEach(item => (item.runs || []).forEach(fn));
      } else if (b._t === 'table') {
        b.rows.forEach(row => row.cells.forEach(cell => cell.blocks.forEach(walkBlock)));
      }
    }
    (doc.blocks || []).forEach(walkBlock);
  }

  /**
   * Return a new doc with every run replaced by fn(run).
   * fn should return the replacement run, or null/undefined to remove it.
   * Runs arrays are re-normalised after transformation.
   */
  function transformAllRuns(doc, fn) {
    function tr(runs) {
      const out = [];
      for (const r of (runs || [])) { const nr = fn(r); if (nr != null) out.push(nr); }
      return normalizeRuns(out);
    }
    function tb(b) {
      if (b._t === 'paragraph' || b._t === 'heading') return { ...b, runs: tr(b.runs) };
      if (b._t === 'list')  return mkList(b.listType, b.items.map(i => mkListItem(tr(i.runs))), b.attrs);
      if (b._t === 'table') return mkTable(b.rows.map(row =>
        mkTableRow(row.cells.map(cell => mkTableCell(cell.blocks.map(tb), cell.isHeader, cell.attrs)))
      ));
      return b;
    }
    return { ...doc, blocks: doc.blocks.map(tb) };
  }

  // ── TC text commands ──────────────────────────────────────────────────────

  /**
   * Insert text at pos, marking the new run as a pending insertion.
   *
   * Self-correction / consecutive-typing optimisation: if the run
   * immediately before the insert point is already a pending insert by the
   * same author with the same marks, the new text is appended to it (same
   * change id) rather than creating a new change entry.  This keeps one-
   * accept/reject granularity for a whole sentence typed in one go.
   *
   * If range is supplied the range is TC-deleted first (replacing selection).
   */
  function tcInsertText(doc, pos, text, author, range) {
    if (!text) return doc;
    let d = (range && !posEqual(range.from, range.to))
      ? tcDeleteRange(doc, range, author) : doc;
    const at       = range ? range.from : pos;
    const id       = tcNewId();
    const time     = new Date().toISOString();
    const initials = getInitials(author);

    return withLeafRuns(d, at, runs => {
      const cur = runs[at.runIdx] ?? mkRun('');
      const cp  = runsCharPos(runs, at.runIdx, at.offset);
      const [before, after] = splitRunsAt(runs, cp);

      // Extend a consecutive insert from the same author (same marks)
      const prev = before[before.length - 1];
      if (prev?.pending?.op === 'insert' && prev.pending.author === author
          && marksEqual(prev.marks, cur.marks || {})) {
        before[before.length - 1] = mkRun(prev.text + text, prev.marks, prev.pending);
        return normalizeRuns([...before, ...after]);
      }

      return normalizeRuns([
        ...before,
        mkRun(text, { ...cur.marks }, { op: 'insert', id, author, initials, time }),
        ...after,
      ]);
    });
  }

  /**
   * Mark the content of range as a pending deletion.
   *
   * Self-correction: a run that is already a pending insert by the same
   * author is removed silently (the insert is cancelled) rather than being
   * wrapped in a pending delete.
   *
   * For cross-block ranges each block's affected portion is marked
   * independently.  Block structure is preserved; the block merge happens
   * at accept-time.
   */
  function tcDeleteRange(doc, range, author) {
    const { from, to } = range;
    if (posEqual(from, to)) return doc;

    const id       = tcNewId();
    const time     = new Date().toISOString();
    const initials = getInitials(author);

    function markRuns(runs, fromChar, toChar) {
      const out = [];
      let pos = 0;
      for (const run of (runs || [])) {
        const re = pos + run.text.length;
        if (re <= fromChar || pos >= toChar) {
          out.push(run);
        } else {
          const sl = Math.max(0, fromChar - pos);
          const sr = Math.min(run.text.length, toChar - pos);
          if (sl > 0) out.push(mkRun(run.text.slice(0, sl), run.marks, run.pending));
          const inner = run.text.slice(sl, sr);
          if (inner) {
            if (run.pending?.op === 'delete') {
              out.push(mkRun(inner, run.marks, run.pending));               // already deleted
            } else if (run.pending?.op === 'insert' && run.pending.author === author) {
              /* self-correction — discard the insert silently */
            } else {
              out.push(mkRun(inner, run.marks, { op: 'delete', id, author, initials, time }));
            }
          }
          if (sr < run.text.length) out.push(mkRun(run.text.slice(sr), run.marks, run.pending));
        }
        pos = re;
      }
      return normalizeRuns(out);
    }

    const sameLeaf = from.blockIdx === to.blockIdx
      && (from.itemIdx ?? null) === (to.itemIdx ?? null)
      && (from.rowIdx  ?? null) === (to.rowIdx  ?? null)
      && (from.colIdx  ?? null) === (to.colIdx  ?? null);

    if (sameLeaf) {
      return withLeafRuns(doc, from, runs =>
        markRuns(runs,
          runsCharPos(runs, from.runIdx, from.offset),
          runsCharPos(runs, to.runIdx,   to.offset)));
    }

    // Cross-block: mark each affected block independently
    let d = doc;
    for (let bi = from.blockIdx; bi <= to.blockIdx; bi++) {
      const p = { ...from, blockIdx: bi, runIdx: 0, offset: 0 };
      d = withLeafRuns(d, p, runs => markRuns(runs,
        bi === from.blockIdx ? runsCharPos(runs, from.runIdx, from.offset) : 0,
        bi === to.blockIdx   ? runsCharPos(runs, to.runIdx,   to.offset)   : runsLength(runs)));
    }
    return d;
  }

  // ── TC mark commands ──────────────────────────────────────────────────────

  /**
   * Apply fn(marks) → newMarks to runs in range, recording old marks in
   * pending so the change can be rejected (undone).
   *
   * label is a human-readable name shown in the balloon ('Bold', 'Colour' …).
   * If a run already has a pending op (insert/delete), the mark is applied
   * silently without adding a format-change pending — it is part of that
   * existing tracked change.
   */
  function tcApplyMarkFn(doc, range, fn, label, author) {
    const { from, to } = range;
    const id       = tcNewId();
    const time     = new Date().toISOString();
    const initials = getInitials(author);

    function applyToRuns(runs, fromChar, toChar) {
      const out = [];
      let pos = 0;
      for (const run of (runs || [])) {
        const re = pos + run.text.length;
        if (re <= fromChar || pos >= toChar || !run.text) {
          out.push(run);
        } else {
          const sl = Math.max(0, fromChar - pos);
          const sr = Math.min(run.text.length, toChar - pos);
          if (sl > 0) out.push(mkRun(run.text.slice(0, sl), run.marks, run.pending));
          const inner = run.text.slice(sl, sr);
          if (inner) {
            if (run.pending) {
              // Already tracked — apply the mark silently (part of that change)
              out.push(mkRun(inner, fn({ ...run.marks }), run.pending));
            } else {
              out.push(mkRun(inner, fn({ ...run.marks }), {
                op: 'format', id, author, initials, time,
                label: label || '',
                oldMarks: { ...run.marks },
              }));
            }
          }
          if (sr < run.text.length) out.push(mkRun(run.text.slice(sr), run.marks, run.pending));
        }
        pos = re;
      }
      return normalizeRuns(out);
    }

    if (from.blockIdx === to.blockIdx) {
      return withLeafRuns(doc, from, runs =>
        applyToRuns(runs,
          runsCharPos(runs, from.runIdx, from.offset),
          runsCharPos(runs, to.runIdx,   to.offset)));
    }
    let d = doc;
    for (let bi = from.blockIdx; bi <= to.blockIdx; bi++) {
      const p = { ...from, blockIdx: bi, runIdx: 0, offset: 0 };
      d = withLeafRuns(d, p, runs => applyToRuns(runs,
        bi === from.blockIdx ? runsCharPos(runs, from.runIdx, from.offset) : 0,
        bi === to.blockIdx   ? runsCharPos(runs, to.runIdx,   to.offset)   : runsLength(runs)));
    }
    return d;
  }

  /** Toggle a boolean mark (bold, italic …) with TC recording. */
  function tcToggleMark(doc, range, markKey, author) {
    const { from, to } = range;
    let allHave = true;
    outer: for (let bi = from.blockIdx; bi <= to.blockIdx; bi++) {
      const runs = getLeafRuns(doc, { ...from, blockIdx: bi });
      const fc = bi === from.blockIdx ? runsCharPos(runs, from.runIdx, from.offset) : 0;
      const tc = bi === to.blockIdx   ? runsCharPos(runs, to.runIdx,   to.offset)   : runsLength(runs);
      let cp = 0;
      for (const r of runs) {
        if (cp + r.text.length > fc && cp < tc && r.text && !r.marks[markKey]) {
          allHave = false; break outer;
        }
        cp += r.text.length;
      }
    }
    const label = markKey[0].toUpperCase() + markKey.slice(1);
    return allHave
      ? tcApplyMarkFn(doc, range, m => { const n = { ...m }; delete n[markKey]; return n; }, 'Remove ' + label, author)
      : tcApplyMarkFn(doc, range, m => ({ ...m, [markKey]: true }), label, author);
  }

  /** Set a value mark (font, colour, size …) with TC recording. */
  function tcSetMark(doc, range, markKey, value, author) {
    const label = markKey[0].toUpperCase() + markKey.slice(1);
    return value == null || value === ''
      ? tcApplyMarkFn(doc, range, m => { const n = { ...m }; delete n[markKey]; return n; }, 'Remove ' + label, author)
      : tcApplyMarkFn(doc, range, m => ({ ...m, [markKey]: value }), label, author);
  }

  // ── Accept / Reject ───────────────────────────────────────────────────────

  /**
   * Accept one change by id.
   *   insert → clear pending (text becomes permanent)
   *   delete → remove the run (deletion is committed)
   *   format → clear pending (new marks stay)
   */
  function tcAccept(doc, id) {
    return transformAllRuns(doc, run => {
      if (run.pending?.id !== id) return run;
      if (run.pending.op === 'delete') return null;
      return mkRun(run.text, run.marks, null);
    });
  }

  /**
   * Reject one change by id.
   *   insert → remove the run (insertion is reverted)
   *   delete → clear pending (text is restored)
   *   format → restore oldMarks, clear pending
   */
  function tcReject(doc, id) {
    return transformAllRuns(doc, run => {
      if (run.pending?.id !== id) return run;
      if (run.pending.op === 'insert') return null;
      if (run.pending.op === 'delete') return mkRun(run.text, run.marks, null);
      if (run.pending.op === 'format') return mkRun(run.text, run.pending.oldMarks || {}, null);
      return run;
    });
  }

  /** Accept every pending change in the document. */
  function tcAcceptAll(doc) {
    return transformAllRuns(doc, run => {
      if (!run.pending) return run;
      if (run.pending.op === 'delete') return null;
      return mkRun(run.text, run.marks, null);
    });
  }

  /** Reject every pending change in the document. */
  function tcRejectAll(doc) {
    return transformAllRuns(doc, run => {
      if (!run.pending) return run;
      if (run.pending.op === 'insert') return null;
      if (run.pending.op === 'delete') return mkRun(run.text, run.marks, null);
      if (run.pending.op === 'format') return mkRun(run.text, run.pending.oldMarks || {}, null);
      return run;
    });
  }

  // ── Change query helpers ──────────────────────────────────────────────────

  /**
   * Return an array of change-entry objects for balloon / reviewing-pane
   * rendering.  Runs that share the same id are de-duplicated; their text
   * is concatenated for the excerpt.
   *
   * Entry shape:
   *   { id, op, label, author, initials, time, color, bg, text }
   */
  function tcGetChanges(doc) {
    const map = new Map();
    walkAllRuns(doc, run => {
      if (!run.pending) return;
      const p = run.pending;
      if (map.has(p.id)) {
        map.get(p.id).text += run.text;
      } else {
        const [color, bg] = TC_PALETTE[authorColorIdx(p.author)];
        map.set(p.id, {
          id:       p.id,
          op:       p.op,
          label:    p.label    || '',
          author:   p.author,
          initials: p.initials || getInitials(p.author),
          time:     p.time,
          color, bg,
          text:     run.text,
        });
      }
    });
    return [...map.values()];
  }

  /** Number of distinct pending changes. */
  function tcCountChanges(doc) { return tcGetChanges(doc).length; }

  /** True if the document contains any pending change. */
  function tcHasChanges(doc) {
    let found = false;
    walkAllRuns(doc, r => { if (r.pending) found = true; });
    return found;
  }

  /** Unique author names of all pending changes. */
  function tcGetAuthors(doc) {
    const s = new Set();
    walkAllRuns(doc, r => { if (r.pending) s.add(r.pending.author); });
    return [...s];
  }

  // ── RichEditorV2 factory ──────────────────────────────────────────────────

  function RichEditorV2({ container, initialHtml, authorName,
                          sectionTitle, onCommentsClick,
                          onDeleteComment, onReplyComment }) {

    // ── State ─────────────────────────────────────────────────────────────
    let model          = htmlToModel(initialHtml || '');
    let tcVisible      = true;
    let comments       = [];       // latest comments array from setComments()
    let commentsActive = false;    // true while a comment-input float is open
    const author       = authorName || 'Unknown';

    // ── CSS injection (once per page) ─────────────────────────────────────
    if (!document.getElementById('gcp-re-v2-style')) {
      const s = document.createElement('style');
      s.id = 'gcp-re-v2-style';
      s.textContent = V2_CSS;
      document.head.appendChild(s);
    }

    // ── DOM scaffold ──────────────────────────────────────────────────────
    const wrapper    = document.createElement('div');
    wrapper.className = 'gcp-re-v2-wrapper';

    const toolbar    = document.createElement('div');
    toolbar.className = 'gcp-re-v2-toolbar';

    const editorArea = document.createElement('div');
    editorArea.className = 'gcp-re-v2-editor-area';

    const host       = document.createElement('div');
    host.className   = 'gcp-re-v2-host';
    host.contentEditable = 'true';

    const balloonArea = document.createElement('div');
    balloonArea.className = 'gcp-re-v2-balloons';

    editorArea.append(host, balloonArea);
    wrapper.append(toolbar, editorArea);
    container.appendChild(wrapper);

    // editor.js does `richEditorInstance.el.contentEditable = 'true'/'false'`
    // which must control the inner host, not the wrapper div.
    Object.defineProperty(wrapper, 'contentEditable', {
      get()  { return host.contentEditable; },
      set(v) { host.contentEditable = v; },
      configurable: true,
    });

    // ── Popup registry ────────────────────────────────────────────────────
    const allPopups = [];

    function makePopup(cls) {
      const p = document.createElement('div');
      p.className = cls;
      p.style.display = 'none';
      allPopups.push(p);
      wrapper.appendChild(p);
      return p;
    }

    function togglePopup(popup, anchorEl) {
      const showing = popup.style.display !== 'none';
      allPopups.forEach(p => { p.style.display = 'none'; });
      if (!showing) {
        const rect  = anchorEl.getBoundingClientRect();
        const wRect = wrapper.getBoundingClientRect();
        popup.style.top  = (rect.bottom - wRect.top + 2) + 'px';
        popup.style.left = Math.max(0, rect.left - wRect.left) + 'px';
        popup.style.display = 'block';
      }
    }

    // ── Bridge: DOM ↔ Model position ──────────────────────────────────────

    function findLeafEl(node) {
      let n = (node instanceof Element) ? node : node.parentElement;
      while (n && n !== host) {
        if (n.hasAttribute && n.hasAttribute('data-v2-lc')) return n;
        n = n.parentElement;
      }
      return null;
    }

    function leafTextOffset(leafEl, targetNode, targetOffset) {
      const walker = document.createTreeWalker(leafEl, NodeFilter.SHOW_TEXT);
      let count = 0, n;
      while ((n = walker.nextNode())) {
        if (n === targetNode) return count + targetOffset;
        count += n.textContent.length;
      }
      return count;
    }

    function domToDocPos(domNode, domOffset) {
      const leafEl = findLeafEl(domNode);
      if (!leafEl) return null;
      const meta = decodeLeafMeta(leafEl.getAttribute('data-v2-lc'));
      let runs;
      try { runs = getLeafRuns(model, meta); } catch (e) { return null; }
      if (!runs) return null;
      const charPos = leafTextOffset(leafEl, domNode, domOffset);
      let rem = charPos;
      for (let ri = 0; ri < runs.length; ri++) {
        const len = (runs[ri].text || '').length;
        if (rem <= len || ri === runs.length - 1) {
          return { ...meta, runIdx: ri, offset: Math.min(rem, len) };
        }
        rem -= len;
      }
      return { ...meta, runIdx: 0, offset: 0 };
    }

    function docPosToDOM(pos) {
      if (!pos) return null;
      const encoded = encodeLeafMeta(pos);
      const attr    = encoded.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const leafEl  = host.querySelector('[data-v2-lc="' + attr + '"]');
      if (!leafEl) return null;
      let runs;
      try { runs = getLeafRuns(model, pos); } catch (e) { return null; }
      if (!runs) return null;
      let charPos = 0;
      for (let ri = 0; ri < (pos.runIdx || 0); ri++) {
        charPos += (runs[ri] ? runs[ri].text.length : 0);
      }
      charPos += (pos.offset || 0);
      const walker = document.createTreeWalker(leafEl, NodeFilter.SHOW_TEXT);
      let node, rem = charPos;
      while ((node = walker.nextNode())) {
        const len = node.textContent.length;
        if (rem <= len) return { node, offset: rem };
        rem -= len;
      }
      if (node) return { node, offset: node.textContent.length };
      return { node: leafEl, offset: leafEl.childNodes.length };
    }

    function getDocRange() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const r = sel.getRangeAt(0);
      if (!host.contains(r.startContainer)) return null;
      const from = domToDocPos(r.startContainer, r.startOffset);
      const to   = domToDocPos(r.endContainer,   r.endOffset);
      if (!from || !to) return null;
      return { from, to };
    }

    function restoreCaret(pos) {
      if (!pos) return;
      try {
        const dp = docPosToDOM(pos);
        if (!dp) return;
        const sel = window.getSelection();
        const r   = document.createRange();
        r.setStart(dp.node, dp.offset);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      } catch (e) {}
    }

    function advancePos(pos, delta) {
      try {
        const runs = getLeafRuns(model, pos);
        if (!runs) return pos;
        let flat = 0;
        for (let i = 0; i < (pos.runIdx || 0); i++) flat += runs[i].text.length;
        flat = Math.max(0, flat + (pos.offset || 0) + delta);
        let rem = flat;
        for (let ri = 0; ri < runs.length; ri++) {
          const len = (runs[ri].text || '').length;
          if (rem <= len || ri === runs.length - 1) {
            return { ...pos, runIdx: ri, offset: Math.min(rem, len) };
          }
          rem -= len;
        }
        return pos;
      } catch (e) { return pos; }
    }

    // ── Render ────────────────────────────────────────────────────────────

    function rerender(cursorPos) {
      host.innerHTML = '';
      host.appendChild(renderModel(model));
      host.classList.toggle('tc-visible', tcVisible);
      updateBalloons();
      updateCommentHighlights();
      updateToolbarState();
      if (cursorPos) restoreCaret(cursorPos);
    }

    // ── Toolbar helpers ───────────────────────────────────────────────────

    function mkBtn(title, html, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = title;
      b.className = 'gcp-re-btn';
      b.innerHTML = html;
      b.addEventListener('mousedown', e => { e.preventDefault(); onClick(e, b); });
      return b;
    }

    function mkSep() {
      const s = document.createElement('span');
      s.className = 'gcp-re-sep';
      return s;
    }

    function markBtn(title, html, markKey) {
      const b = mkBtn(title, html, () => {
        const range = getDocRange();
        if (!range) return;
        model = tcToggleMark(model, range, markKey, author);
        rerender();
      });
      b.dataset.markKey = markKey;
      return b;
    }

    function curBlockIdx() {
      try { const r = getDocRange(); return r ? r.from.blockIdx : 0; } catch (e) { return 0; }
    }

    // ── Formatting buttons ────────────────────────────────────────────────
    const btnBold   = markBtn('Bold (Ctrl+B)',      '<b>B</b>',  'bold');
    const btnItalic = markBtn('Italic (Ctrl+I)',    '<i>I</i>',  'italic');
    const btnULine  = markBtn('Underline (Ctrl+U)', '<u>U</u>',  'underline');
    const btnStrike = markBtn('Strikethrough',      '<s>S</s>',  'strikethrough');
    toolbar.append(btnBold, btnItalic, btnULine, btnStrike, mkSep());

    // ── Block type ────────────────────────────────────────────────────────
    function setBlockType(type, level) {
      model = cmdSetBlockType(model, curBlockIdx(), type, level);
      rerender();
    }

    toolbar.append(
      mkBtn('Paragraph', 'P',  () => setBlockType('paragraph')),
      mkBtn('Heading 1', 'H1', () => setBlockType('heading', 1)),
      mkBtn('Heading 2', 'H2', () => setBlockType('heading', 2)),
      mkBtn('Heading 3', 'H3', () => setBlockType('heading', 3)),
      mkSep()
    );

    // ── Lists ─────────────────────────────────────────────────────────────
    function toggleList(listType) {
      const bi  = curBlockIdx();
      const blk = model.blocks[bi];
      if (blk && blk._t === 'list' && blk.listType === listType) {
        model = cmdSetBlockType(model, bi, 'paragraph');
      } else {
        model = cmdSetBlockType(model, bi, 'list', listType);
      }
      rerender();
    }

    toolbar.append(
      mkBtn('Bullet list',   '&#8226; &#8226; &#8226;', () => toggleList('ul')),
      mkBtn('Numbered list', '1. 2. 3.',                () => toggleList('ol')),
      mkSep()
    );

    // ── Alignment ─────────────────────────────────────────────────────────
    function setAlign(align) {
      model = cmdSetBlockAttrs(model, curBlockIdx(), { align });
      rerender();
    }

    toolbar.append(
      mkBtn('Align left',   '&#8676;', () => setAlign('left')),
      mkBtn('Centre',       '&#8596;', () => setAlign('center')),
      mkBtn('Align right',  '&#8677;', () => setAlign('right')),
      mkBtn('Justify',      '&#8644;', () => setAlign('justify')),
      mkSep()
    );

    // ── Line spacing ──────────────────────────────────────────────────────
    const lsPopup = makePopup('gcp-v2-popup gcp-v2-ls-popup');
    [1, 1.15, 1.5, 2, 2.5, 3].forEach(v => {
      const item = document.createElement('div');
      item.className = 'gcp-v2-ls-item';
      item.textContent = String(v);
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        model = cmdSetBlockAttrs(model, curBlockIdx(), { lineSpacing: v });
        rerender();
        lsPopup.style.display = 'none';
      });
      lsPopup.appendChild(item);
    });
    const btnLs = mkBtn('Line spacing', '&#8645;', (e, b) => togglePopup(lsPopup, b));
    toolbar.append(btnLs, mkSep());

    // ── Indent / Outdent ──────────────────────────────────────────────────
    function changeIndent(delta) {
      const bi  = curBlockIdx();
      const blk = model.blocks[bi];
      const cur = (blk && blk.attrs && blk.attrs.indent) || 0;
      model = cmdSetBlockAttrs(model, bi, { indent: Math.max(0, cur + delta) });
      rerender();
    }

    toolbar.append(
      mkBtn('Decrease indent', '&#8676;&#8676;', () => changeIndent(-1)),
      mkBtn('Increase indent', '&#8677;&#8677;', () => changeIndent(1)),
      mkSep()
    );

    // ── Insert table ──────────────────────────────────────────────────────
    (function buildTablePicker() {
      const ROWS = 8, COLS = 8;
      const popup = makePopup('gcp-v2-popup');
      const grid  = document.createElement('div');
      grid.className = 'gcp-v2-tpick-grid';
      const lbl   = document.createElement('div');
      lbl.className = 'gcp-v2-tpick-label';
      lbl.textContent = '0 \xd7 0';
      const cells = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = document.createElement('div');
          cell.className = 'gcp-v2-tpick-cell';
          cell.dataset.r = r;
          cell.dataset.c = c;
          cell.addEventListener('mouseover', () => {
            const hr = r + 1, hc = c + 1;
            cells.forEach(x => x.classList.toggle('on', +x.dataset.r < hr && +x.dataset.c < hc));
            lbl.textContent = hr + ' \xd7 ' + hc;
          });
          cell.addEventListener('mousedown', e => {
            e.preventDefault();
            const range    = getDocRange();
            const afterIdx = range ? range.from.blockIdx : model.blocks.length - 1;
            model = cmdInsertTable(model, afterIdx, r + 1, c + 1);
            rerender();
            popup.style.display = 'none';
          });
          grid.appendChild(cell);
          cells.push(cell);
        }
      }
      popup.append(grid, lbl);
      const btnT = mkBtn('Insert table', '&#9638;', (e, b) => togglePopup(popup, b));
      toolbar.append(btnT, mkSep());
    })();

    // ── Colour swatches helper ────────────────────────────────────────────
    const SWATCHES = [
      '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#d9d9d9', '#efefef', '#ffffff',
      '#c00000', '#ff0000', '#ff9900', '#ffff00', '#00b050', '#00b0f0', '#0070c0', '#7030a0',
    ];

    function makeSwatchPopup(onPick) {
      const popup = makePopup('gcp-v2-popup');
      const grid  = document.createElement('div');
      grid.className = 'gcp-v2-swatches';
      SWATCHES.forEach(c => {
        const sw = document.createElement('div');
        sw.className  = 'gcp-v2-swatch';
        sw.style.background = c;
        sw.title = c;
        sw.addEventListener('mousedown', e => {
          e.preventDefault();
          onPick(c);
          popup.style.display = 'none';
        });
        grid.appendChild(sw);
      });
      const row = document.createElement('div');
      row.className = 'gcp-v2-custom-row';
      const inp = document.createElement('input');
      inp.type  = 'color';
      inp.value = '#000000';
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        onPick(inp.value);
        popup.style.display = 'none';
      });
      row.append(inp, applyBtn);
      popup.append(grid, row);
      return popup;
    }

    const colorPopup = makeSwatchPopup(c => {
      const range = getDocRange();
      if (range) { model = tcSetMark(model, range, 'color', c, author); rerender(); }
    });
    const btnColor = mkBtn('Text colour', 'A&#9660;', (e, b) => togglePopup(colorPopup, b));
    toolbar.append(btnColor);

    const bgPopup = makeSwatchPopup(c => {
      const range = getDocRange();
      if (range) { model = tcSetMark(model, range, 'background', c, author); rerender(); }
    });
    const btnBg = mkBtn('Highlight / background', '&#9641;&#9660;', (e, b) => togglePopup(bgPopup, b));
    toolbar.append(btnBg, mkSep());

    // ── Clear formatting ──────────────────────────────────────────────────
    toolbar.append(
      mkBtn('Clear formatting', 'T&#10006;', () => {
        const range = getDocRange();
        if (!range) return;
        model = tcApplyMarkFn(model, range, () => ({}), 'Clear formatting', author);
        rerender();
      }),
      mkSep()
    );

    // ── Track-changes controls ────────────────────────────────────────────
    const btnTcToggle = mkBtn('Show / hide tracked changes', '&#128065;', (e, b) => {
      tcVisible = !tcVisible;
      host.classList.toggle('tc-visible', tcVisible);
      b.classList.toggle('active', tcVisible);
      updateBalloons();
    });
    btnTcToggle.classList.add('active');

    const btnAcceptAll = mkBtn('Accept all changes', '&#10003;&#10003;', () => {
      model = tcAcceptAll(model); rerender();
    });
    const btnRejectAll = mkBtn('Reject all changes', '&#10007;&#10007;', () => {
      model = tcRejectAll(model); rerender();
    });
    toolbar.append(btnTcToggle, btnAcceptAll, btnRejectAll);

    // ── Comment anchor button ─────────────────────────────────────────────
    const btnComment = mkBtn('Add comment', '&#128172;', () => {
      if (!onCommentsClick) return;
      const range = getDocRange();
      if (!range) return;
      const anchorId = 'cmt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      // Apply anchor mark without TC tracking (it's not a content change)
      model = cmdApplyMarkFn(model, range, m => ({ ...m, cmtAnchorId: anchorId }));
      rerender();
      onCommentsClick(anchorId);
    });
    if (onCommentsClick) { toolbar.append(mkSep(), btnComment); }

    // ── Fullscreen ────────────────────────────────────────────────────────
    let isFullscreen = false;
    const btnFs = mkBtn('Full screen (Esc to exit)', '&#x26F6;', () => {
      isFullscreen = !isFullscreen;
      wrapper.classList.toggle('gcp-re-v2-fullscreen', isFullscreen);
      btnFs.classList.toggle('active', isFullscreen);
      // Restore focus into editor after toggle
      host.focus();
    });
    toolbar.append(mkSep(), btnFs);

    // Exit fullscreen on Escape
    host.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isFullscreen) {
        isFullscreen = false;
        wrapper.classList.remove('gcp-re-v2-fullscreen');
        btnFs.classList.remove('active');
      }
    });

    // ── Balloons ──────────────────────────────────────────────────────────

    function updateBalloons() {
      balloonArea.innerHTML = '';
      if (!tcVisible) return;
      tcGetChanges(model).forEach(ch => {
        const balloon = document.createElement('div');
        balloon.className = 'gcp-re-v2-balloon';
        balloon.style.setProperty('--tc-color', ch.color);

        const header = document.createElement('div');
        header.className = 'gcp-re-v2-balloon-header';

        const badge = document.createElement('span');
        badge.className = 'gcp-re-v2-balloon-badge';
        badge.textContent = ch.initials;
        badge.style.background = ch.color;

        const info = document.createElement('span');
        info.className = 'gcp-re-v2-balloon-info';
        const d = new Date(ch.time);
        info.textContent = ch.author + (isNaN(d) ? '' :
          '\u2002' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));

        header.append(badge, info);

        const desc = document.createElement('div');
        desc.className = 'gcp-re-v2-balloon-desc';
        desc.textContent = ch.label || ch.op;

        const acts = document.createElement('div');
        acts.className = 'gcp-re-v2-balloon-actions';

        const aBtn = document.createElement('button');
        aBtn.type = 'button';
        aBtn.textContent = 'Accept';
        aBtn.addEventListener('click', () => { model = tcAccept(model, ch.id); rerender(); });

        const rBtn = document.createElement('button');
        rBtn.type = 'button';
        rBtn.textContent = 'Reject';
        rBtn.addEventListener('click', () => { model = tcReject(model, ch.id); rerender(); });

        acts.append(aBtn, rBtn);
        balloon.append(header, desc, acts);
        balloonArea.appendChild(balloon);
      });
    }

    // ── Comment highlights ────────────────────────────────────────────────

    function updateCommentHighlights() {
      const activeIds = new Set((comments || []).map(c => c.anchorId).filter(Boolean));
      host.querySelectorAll('[data-cmt-anchor-id]').forEach(el => {
        const id = el.getAttribute('data-cmt-anchor-id');
        el.classList.toggle('gcp-re-cmt-anchor--active', activeIds.has(id));
        el.onclick = () => { if (onCommentsClick) onCommentsClick(id); };
      });
    }

    function setComments(newComments) {
      comments = newComments || [];
      updateCommentHighlights();
    }

    function removeCommentAnchor(anchorId) {
      model = transformAllRuns(model, run => {
        if (!run.marks || run.marks.cmtAnchorId !== anchorId) return run;
        const { cmtAnchorId, ...rest } = run.marks;
        return { ...run, marks: rest };
      });
      rerender();
    }

    function setCommentsActive(bool) {
      commentsActive = !!bool;
      wrapper.classList.toggle('gcp-re-v2-comments-active', commentsActive);
      if (btnComment) btnComment.classList.toggle('active', commentsActive);
    }

    // ── Toolbar state sync ────────────────────────────────────────────────

    function updateToolbarState() {
      try {
        const range = getDocRange();
        const m = range
          ? ((getLeafRuns(model, range.from) || [])[range.from.runIdx || 0] || {}).marks || {}
          : {};
        btnBold.classList.toggle('active',   !!m.bold);
        btnItalic.classList.toggle('active', !!m.italic);
        btnULine.classList.toggle('active',  !!m.underline);
        btnStrike.classList.toggle('active', !!m.strikethrough);
      } catch (e) {}
    }

    // ── contentEditable event handlers ────────────────────────────────────

    host.addEventListener('beforeinput', e => {
      const type = e.inputType;

      if (type === 'insertText') {
        e.preventDefault();
        const range = getDocRange();
        if (!range) return;
        const sel  = posEqual(range.from, range.to) ? undefined : range;
        const text = e.data || '';
        model = tcInsertText(model, range.from, text, author, sel);
        rerender(advancePos(range.from, text.length));

      } else if (type === 'deleteContentBackward' || type === 'deleteContentForward') {
        e.preventDefault();
        const range = getDocRange();
        if (!range) return;

        if (!posEqual(range.from, range.to)) {
          model = tcDeleteRange(model, range, author);
          rerender(range.from);
          return;
        }

        const pos  = range.from;
        const runs = getLeafRuns(model, pos);
        if (!runs) return;

        if (type === 'deleteContentBackward') {
          if ((pos.offset || 0) > 0) {
            const fromPos = { ...pos, offset: pos.offset - 1 };
            model = tcDeleteRange(model, { from: fromPos, to: pos }, author);
            rerender(fromPos);
          } else if ((pos.runIdx || 0) > 0) {
            // Walk backward past empty runs to find a run with actual content
            let ri = (pos.runIdx || 0) - 1;
            while (ri > 0 && !(runs[ri] && runs[ri].text)) ri--;
            const pr = runs[ri];
            if (pr && pr.text) {
              const prLen = pr.text.length;
              const fromPos = { ...pos, runIdx: ri, offset: prLen - 1 };
              const toPos   = { ...pos, runIdx: ri, offset: prLen };
              model = tcDeleteRange(model, { from: fromPos, to: toPos }, author);
              rerender(fromPos);
            }
          } else if ((pos.blockIdx || 0) > 0) {
            model = cmdMergeBlockWithPrev(model, pos.blockIdx);
            rerender();
          }
        } else { // deleteContentForward
          const curRun = runs[pos.runIdx || 0];
          const runLen = (curRun && curRun.text) ? curRun.text.length : 0;
          if ((pos.offset || 0) < runLen) {
            const toPos = { ...pos, offset: (pos.offset || 0) + 1 };
            model = tcDeleteRange(model, { from: pos, to: toPos }, author);
            rerender(pos);
          } else {
            // Walk forward past empty runs to find a run with content to delete
            let ri = (pos.runIdx || 0) + 1;
            while (ri < runs.length && !(runs[ri] && runs[ri].text)) ri++;
            if (ri < runs.length) {
              const toPos = { ...pos, runIdx: ri, offset: 1 };
              model = tcDeleteRange(model, { from: { ...pos, runIdx: ri, offset: 0 }, to: toPos }, author);
              rerender({ ...pos, runIdx: ri, offset: 0 });
            } else if (pos.blockIdx < model.blocks.length - 1) {
              model = cmdMergeBlockWithPrev(model, pos.blockIdx + 1);
              rerender(pos);
            }
          }
        }

      } else if (type === 'insertParagraph' || type === 'insertLineBreak') {
        e.preventDefault();
        const range = getDocRange();
        if (!range) return;
        model = cmdSplitBlock(model, range.from);
        rerender({ blockIdx: range.from.blockIdx + 1, runIdx: 0, offset: 0 });

      } else if (type === 'historyUndo' || type === 'historyRedo') {
        e.preventDefault(); // undo/redo stack: future work
      }
    });

    host.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        const k = e.key.toLowerCase();
        const doMark = (key) => {
          e.preventDefault();
          const r = getDocRange();
          if (r) { model = tcToggleMark(model, r, key, author); rerender(); }
        };
        if (k === 'b') doMark('bold');
        if (k === 'i') doMark('italic');
        if (k === 'u') doMark('underline');
      }
    });

    host.addEventListener('keyup',   updateToolbarState);
    host.addEventListener('mouseup', updateToolbarState);
    host.addEventListener('focus',   updateToolbarState);

    // ── Paste / Drop ──────────────────────────────────────────────────────
    //
    // The `beforeinput` handler above only covers insertText / deleteContent /
    // insertParagraph.  Paste (and drop) bypass it and write directly into the
    // contentEditable DOM without touching `model`, so `getHtml()` would
    // return the pre-paste state and the pasted content would disappear on
    // save.  We intercept the native `paste` event, parse the clipboard data
    // into model blocks, and insert them properly.

    function handlePasteContent(html, text) {
      const range = getDocRange();
      if (!range) return;
      const src = html ||
        (text ? text.split('\n').map(l => `<p>${esc(l)}</p>`).join('') : '');
      if (!src) return;
      const pastedDoc = htmlToModel(src);
      if (!pastedDoc.blocks.length) return;
      let d = !posEqual(range.from, range.to)
        ? tcDeleteRange(model, { from: range.from, to: range.to }, author)
        : model;
      model = cmdPasteBlocks(d, range.from, pastedDoc.blocks);
      rerender();
    }

    host.addEventListener('paste', e => {
      e.preventDefault();
      const html = e.clipboardData?.getData('text/html') || '';
      const text = e.clipboardData?.getData('text/plain') || '';
      handlePasteContent(html, text);
    });

    host.addEventListener('drop', e => {
      e.preventDefault();
      const html = e.dataTransfer?.getData('text/html') || '';
      const text = e.dataTransfer?.getData('text/plain') || '';
      handlePasteContent(html, text);
    });

    // Close popups when clicking outside the wrapper
    document.addEventListener('mousedown', e => {
      if (!wrapper.contains(e.target)) allPopups.forEach(p => { p.style.display = 'none'; });
    }, true);

    // ── Initial render ────────────────────────────────────────────────────
    rerender();

    // ── Public API ────────────────────────────────────────────────────────
    // Serialise the current model including all track-change markup so it
    // round-trips through the DB without losing pending ins/del/format ops.
    function serializeWithTC() {
      const div = document.createElement('div');
      div.appendChild(renderModel(model));
      return div.innerHTML;
    }

    return {
      el:                    wrapper,
      // Full serialisation (TC markup preserved) — use for save / submit
      getHtml()              { return serializeWithTC(); },
      // Clean serialisation (TC resolved to accepted state) — use for export/print
      getCleanHtml()         { return modelToHtml(model); },
      setHtml(html)          { model = htmlToModel(html || ''); rerender(); },
      getModel()             { return model; },
      hasChanges()           { return tcHasChanges(model); },
      hasTrackedChanges()    { return tcHasChanges(model); },  // alias used by editor.js
      setComments(c)         { setComments(c); },
      removeCommentAnchor(id){ removeCommentAnchor(id); },
      setCommentsActive(b)   { setCommentsActive(b); },
    };
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  window.GCP = window.GCP || {};

  // Expose model primitives + commands for use by later steps (toolbar, TC …)
  window.GCP._editorModel = {
    // ── Model factories ──────────────────────────────────────────────────
    mkRun, mkParagraph, mkHeading, mkList, mkListItem,
    mkTable, mkTableRow, mkTableCell, mkEmptyDoc,
    // ── Serialisation ────────────────────────────────────────────────────
    htmlToModel, renderModel, modelToHtml,
    // ── Helpers ──────────────────────────────────────────────────────────
    TC_PALETTE, authorColorIdx, getInitials,
    normalizeRuns, runsCharPos, runsLength, splitRunsAt,
    getLeafRuns, withLeafRuns, withBlocks, posEqual,
    // ── Text commands ────────────────────────────────────────────────────
    cmdInsertText, cmdDeleteRange,
    // ── Mark commands ────────────────────────────────────────────────────
    cmdApplyMark, cmdRemoveMark, cmdToggleMark, cmdSetMark, cmdApplyMarkFn,
    // ── Block commands ───────────────────────────────────────────────────
    cmdSplitBlock, cmdMergeBlockWithPrev, cmdSetBlockType, cmdSetBlockAttrs,
    // ── Table commands ───────────────────────────────────────────────────
    cmdInsertTable, cmdInsertTableRow, cmdDeleteTableRow,
    cmdInsertTableCol, cmdDeleteTableCol,
    // ── TC utilities ─────────────────────────────────────────────────────
    walkAllRuns, transformAllRuns,
    // ── TC text commands ──────────────────────────────────────────────────
    tcInsertText, tcDeleteRange,
    // ── TC mark commands ──────────────────────────────────────────────────
    tcApplyMarkFn, tcToggleMark, tcSetMark,
    // ── TC accept / reject ────────────────────────────────────────────────
    tcAccept, tcReject, tcAcceptAll, tcRejectAll,
    // ── TC query helpers ──────────────────────────────────────────────────
    tcGetChanges, tcCountChanges, tcHasChanges, tcGetAuthors,
  };

  // Step 7: live cutover — v2 becomes the canonical RichEditor.
  // The v1 implementation (if present) is preserved as _RichEditorV1 so it
  // can still be invoked for debugging: window.GCP._RichEditorV1({…})
  window.GCP.RichEditorV2 = RichEditorV2;
  if (window.GCP.RichEditor) window.GCP._RichEditorV1 = window.GCP.RichEditor;
  window.GCP.RichEditor = RichEditorV2;

})();
