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

  // ── Model → DOM renderer ───────────────────────────────────────────────────
  //
  // Pure function: takes a model, returns a DocumentFragment.
  // No side effects, no event listeners, no state.

  function renderModel(doc) {
    const frag = document.createDocumentFragment();
    (doc.blocks || []).forEach(b => {
      const el = renderBlock(b);
      if (el) frag.appendChild(el);
    });
    return frag;
  }

  function renderBlock(block) {
    switch (block._t) {
      case 'paragraph': {
        const el = document.createElement('p');
        applyBlockAttrs(el, block.attrs);
        appendRuns(el, block.runs);
        return el;
      }
      case 'heading': {
        const el = document.createElement('h' + (block.level || 2));
        applyBlockAttrs(el, block.attrs);
        appendRuns(el, block.runs);
        return el;
      }
      case 'list': {
        const el = document.createElement(block.listType === 'ol' ? 'ol' : 'ul');
        applyBlockAttrs(el, block.attrs);
        (block.items || []).forEach(item => {
          const li = document.createElement('li');
          appendRuns(li, item.runs);
          el.appendChild(li);
        });
        return el;
      }
      case 'table': return renderTable(block);
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

    // 4. Track-change wrapper
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

  function renderTable(block) {
    const table  = document.createElement('table');
    table.className = 'gcp-re-v2-table';
    const tbody = document.createElement('tbody');
    (block.rows || []).forEach(row => {
      const tr = document.createElement('tr');
      (row.cells || []).forEach(cell => {
        const td = document.createElement(cell.isHeader ? 'th' : 'td');
        if (cell.attrs) {
          if (cell.attrs.colspan > 1) td.colSpan = cell.attrs.colspan;
          if (cell.attrs.rowspan > 1) td.rowSpan = cell.attrs.rowspan;
          if (cell.attrs.width)       td.style.width   = cell.attrs.width;
          if (cell.attrs.bgColor)     td.style.backgroundColor = cell.attrs.bgColor;
        }
        // Each cell contains block nodes
        (cell.blocks || []).forEach(b => {
          const el = renderBlock(b);
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
    let d = range && !posEqual(range.start, range.end) ? cmdDeleteRange(doc, range) : doc;
    const insertPos = range ? range.start : pos;
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
    const { start, end } = range;
    if (posEqual(start, end)) return doc;

    const sameLeaf = start.blockIdx         === end.blockIdx  &&
                     (start.itemIdx ?? null) === (end.itemIdx ?? null) &&
                     (start.rowIdx  ?? null) === (end.rowIdx  ?? null) &&
                     (start.colIdx  ?? null) === (end.colIdx  ?? null);

    // ── intra-block ──────────────────────────────────────────────────────
    if (sameLeaf) {
      return withLeafRuns(doc, start, runs => {
        const s = runsCharPos(runs, start.runIdx, start.offset);
        const e = runsCharPos(runs, end.runIdx,   end.offset);
        const [before] = splitRunsAt(runs, s);
        const [, after] = splitRunsAt(runs, e);
        return normalizeRuns([...before, ...after]);
      });
    }

    // ── cross-block (top-level paragraphs / headings only) ───────────────
    const startRuns = getLeafRuns(doc, start);
    const endRuns   = getLeafRuns(doc, end);
    const startCp   = runsCharPos(startRuns, start.runIdx, start.offset);
    const endCp     = runsCharPos(endRuns,   end.runIdx,   end.offset);

    const [keptStart] = splitRunsAt(startRuns, startCp);
    const [, keptEnd] = splitRunsAt(endRuns,   endCp);
    const mergedRuns  = normalizeRuns([...keptStart, ...keptEnd]);

    return withBlocks(doc, blocks => {
      const startBlock = blocks[start.blockIdx];
      const result = [];
      blocks.forEach((b, i) => {
        if (i < start.blockIdx)  result.push(b);
        if (i === start.blockIdx) result.push({ ...startBlock, runs: mergedRuns });
        // i > start and i <= end: drop
        if (i > end.blockIdx)   result.push(b);
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
    const { start, end } = range;

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
    if (start.blockIdx === end.blockIdx) {
      return withLeafRuns(doc, start, runs => {
        const s = runsCharPos(runs, start.runIdx, start.offset);
        const e = runsCharPos(runs, end.runIdx,   end.offset);
        return applyToRuns(runs, s, e);
      });
    }

    // Cross-block: apply block by block
    let d = doc;
    for (let bi = start.blockIdx; bi <= end.blockIdx; bi++) {
      const pos = { ...start, blockIdx: bi, runIdx: 0, offset: 0 };
      d = withLeafRuns(d, pos, runs => {
        const from = bi === start.blockIdx
          ? runsCharPos(runs, start.runIdx, start.offset) : 0;
        const to   = bi === end.blockIdx
          ? runsCharPos(runs, end.runIdx, end.offset) : runsLength(runs);
        return applyToRuns(runs, from, to);
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
    const { start, end } = range;
    let allHave = true;

    outer: for (let bi = start.blockIdx; bi <= end.blockIdx; bi++) {
      const pos  = { ...start, blockIdx: bi, runIdx: 0, offset: 0 };
      const runs = getLeafRuns(doc, pos);
      const from = bi === start.blockIdx ? runsCharPos(runs, start.runIdx, start.offset) : 0;
      const to   = bi === end.blockIdx   ? runsCharPos(runs, end.runIdx,   end.offset)   : runsLength(runs);
      let charPos = 0;
      for (const run of runs) {
        const re = charPos + run.text.length;
        if (re > from && charPos < to && run.text && !run.marks[markKey]) {
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
    let d = (range && !posEqual(range.start, range.end))
      ? tcDeleteRange(doc, range, author) : doc;
    const at       = range ? range.start : pos;
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
    const { start, end } = range;
    if (posEqual(start, end)) return doc;

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

    const sameLeaf = start.blockIdx === end.blockIdx
      && (start.itemIdx ?? null) === (end.itemIdx ?? null)
      && (start.rowIdx  ?? null) === (end.rowIdx  ?? null)
      && (start.colIdx  ?? null) === (end.colIdx  ?? null);

    if (sameLeaf) {
      return withLeafRuns(doc, start, runs =>
        markRuns(runs,
          runsCharPos(runs, start.runIdx, start.offset),
          runsCharPos(runs, end.runIdx,   end.offset)));
    }

    // Cross-block: mark each affected block independently
    let d = doc;
    for (let bi = start.blockIdx; bi <= end.blockIdx; bi++) {
      const p = { ...start, blockIdx: bi, runIdx: 0, offset: 0 };
      d = withLeafRuns(d, p, runs => markRuns(runs,
        bi === start.blockIdx ? runsCharPos(runs, start.runIdx, start.offset) : 0,
        bi === end.blockIdx   ? runsCharPos(runs, end.runIdx,   end.offset)   : runsLength(runs)));
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
    const { start, end } = range;
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

    if (start.blockIdx === end.blockIdx) {
      return withLeafRuns(doc, start, runs =>
        applyToRuns(runs,
          runsCharPos(runs, start.runIdx, start.offset),
          runsCharPos(runs, end.runIdx,   end.offset)));
    }
    let d = doc;
    for (let bi = start.blockIdx; bi <= end.blockIdx; bi++) {
      const p = { ...start, blockIdx: bi, runIdx: 0, offset: 0 };
      d = withLeafRuns(d, p, runs => applyToRuns(runs,
        bi === start.blockIdx ? runsCharPos(runs, start.runIdx, start.offset) : 0,
        bi === end.blockIdx   ? runsCharPos(runs, end.runIdx,   end.offset)   : runsLength(runs)));
    }
    return d;
  }

  /** Toggle a boolean mark (bold, italic …) with TC recording. */
  function tcToggleMark(doc, range, markKey, author) {
    const { start, end } = range;
    let allHave = true;
    outer: for (let bi = start.blockIdx; bi <= end.blockIdx; bi++) {
      const runs = getLeafRuns(doc, { ...start, blockIdx: bi });
      const from = bi === start.blockIdx ? runsCharPos(runs, start.runIdx, start.offset) : 0;
      const to   = bi === end.blockIdx   ? runsCharPos(runs, end.runIdx,   end.offset)   : runsLength(runs);
      let cp = 0;
      for (const r of runs) {
        if (cp + r.text.length > from && cp < to && r.text && !r.marks[markKey]) {
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

  // ── RichEditorV2 factory stub (Step 1: load + render only) ────────────────
  //
  // Steps 2-7 will extend this with commands, track-changes, toolbar, etc.
  // For now it proves the model/renderer pipeline works end-to-end and
  // already passes the public API contract expected by editor.js.

  function RichEditorV2({ container, initialHtml /*, future params */ }) {
    // Parse initial HTML into model
    let model = htmlToModel(initialHtml || '');

    // Build a minimal host element
    const host = document.createElement('div');
    host.className = 'gcp-re-v2-host';
    host.style.cssText = 'outline:none;min-height:4em;padding:.5em;';
    host.contentEditable = 'true';

    // Render model into host (full re-render; will be optimised in Step 3)
    function rerender() {
      host.innerHTML = '';
      host.appendChild(renderModel(model));
    }
    rerender();

    container.appendChild(host);

    // ── Public API ────────────────────────────────────────────────────────
    return {
      el: host,

      /** Return clean HTML (accepted-state, no track-change markup). */
      getHtml() { return modelToHtml(model); },

      /** Replace document content — parses new HTML into fresh model. */
      setHtml(html) { model = htmlToModel(html); rerender(); },

      /** Expose model for external tooling / debugging. */
      getModel() { return model; },

      /** True if model contains any pending (unresolved) changes. */
      hasChanges() {
        function check(blocks) {
          return blocks.some(b => {
            const runs = b.runs || (b._t === 'list' ? b.items.flatMap(i => i.runs) : []);
            if (runs.some(r => r.pending)) return true;
            if (b._t === 'table') return b.rows.some(r => r.cells.some(c => check(c.blocks)));
            return false;
          });
        }
        return check(model.blocks);
      },

      // Stubs kept for API compatibility — wired up in later steps
      setComments() {},
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

  // NOTE: window.GCP.RichEditor is intentionally NOT replaced here.
  // That swap happens in Step 7 once the full feature set is in place.
  // During development, load this file alongside rich-editor.js and call
  //   window.GCP._editorModel.htmlToModel(html)
  // to verify the pipeline without affecting the running app.
  window.GCP.RichEditorV2 = RichEditorV2;

})();
