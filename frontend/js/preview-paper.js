/**
 * preview-paper.js — A4 paper preview for talking-points dashboards.
 *
 * Renders content as stacked A4-proportioned pages with a document header
 * on the first page. Automatically paginates by measuring element heights.
 *
 * Usage:
 *   window.GCP.renderPaperPreview(modalContent, {
 *     title: 'Event Title',
 *     country: 'Country Name',
 *     sections: [ { label: 'Section 1', html: '<p>...</p>' }, ... ]
 *   });
 */
(function () {
  'use strict';

  // A4 proportions at ~96 DPI: 794 × 1123 px.
  // We use a slightly smaller width for comfortable on-screen reading.
  const PAGE_W = 760;                  // px – paper width (content + padding)
  const PAGE_H = Math.round(PAGE_W * (297 / 210)); // ≈ 1074 px
  const PAD_X = 60;                    // px – horizontal padding inside paper
  const PAD_TOP = 50;                  // px – top padding
  const PAD_BOT = 50;                  // px – bottom padding
  const CONTENT_H = PAGE_H - PAD_TOP - PAD_BOT; // usable height per page

  /**
   * Build the document header HTML shown on the first page.
   */
  function buildHeader(title, country) {
    const esc = window.GCP.escapeHtml;
    const parts = [];
    if (country) {
      parts.push(`<div style="text-align:center;font-size:13px;color:#555;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">${esc(country)}</div>`);
    }
    if (title) {
      parts.push(`<div style="text-align:center;font-size:20px;font-weight:700;color:#1a1a1a;margin-bottom:4px;line-height:1.3;">${esc(title)}</div>`);
    }
    parts.push(`<hr style="border:none;border-top:1.5px solid #bbb;margin:18px 0 10px;">`);
    return parts.join('');
  }

  /**
   * Create a blank A4 page element and return its content area.
   */
  function createPage() {
    const page = document.createElement('div');
    page.className = 'paper-page';
    page.style.cssText = `
      width:${PAGE_W}px; min-height:${PAGE_H}px;
      background:#fff; border:1px solid #d0d0d0;
      box-shadow:0 2px 12px rgba(0,0,0,.18);
      padding:${PAD_TOP}px ${PAD_X}px ${PAD_BOT}px;
      box-sizing:border-box;
      margin:0 auto 32px;
      overflow:hidden;
      position:relative;
    `;
    const content = document.createElement('div');
    content.className = 'paper-page-content';
    page.appendChild(content);
    return { page, content };
  }

  /**
   * Main renderer.
   *
   * @param {HTMLElement} container – the modalContent element to fill
   * @param {Object} opts
   * @param {string} opts.title – event title
   * @param {string} opts.country – country name
   * @param {Array}  opts.sections – [{ label, html }]
   */
  function renderPaperPreview(container, opts) {
    const { title, country, sections } = opts;

    // -- 1. Build a hidden measuring container (same width as page content area)
    const measurer = document.createElement('div');
    measurer.style.cssText = `
      position:absolute; left:-9999px; top:0;
      width:${PAGE_W - PAD_X * 2}px;
      font-family:inherit; font-size:inherit; line-height:inherit;
      visibility:hidden;
    `;
    document.body.appendChild(measurer);

    // Insert header into measurer
    const headerDiv = document.createElement('div');
    headerDiv.innerHTML = buildHeader(title, country);
    measurer.appendChild(headerDiv);

    // Insert all sections into measurer
    for (const sec of sections) {
      const secDiv = document.createElement('div');
      secDiv.className = 'paper-section';
      secDiv.innerHTML =
        `<h2 style="margin:20px 0 8px;font-size:16px;font-weight:600;color:#222;border-bottom:1px solid #e0e0e0;padding-bottom:5px;">${window.GCP.escapeHtml(sec.label)}</h2>` +
        `<div class="paper-section-body" style="font-size:14px;line-height:1.65;color:#222;">${sec.html || '<div style="color:#999;">—</div>'}</div>`;
      measurer.appendChild(secDiv);
    }

    // Force layout
    void measurer.offsetHeight;

    // -- 2. Paginate by walking top-level children in measurer
    const pages = [];
    let currentPage = createPage();
    pages.push(currentPage);
    let usedH = 0;

    const children = Array.from(measurer.children);
    for (const child of children) {
      const childH = child.offsetHeight;

      // If adding this child overflows AND the page already has content, start new page
      if (usedH > 0 && usedH + childH > CONTENT_H) {
        currentPage = createPage();
        pages.push(currentPage);
        usedH = 0;
      }

      // If a single section is taller than a page, try to split its inner elements
      if (childH > CONTENT_H && child.classList.contains('paper-section')) {
        const innerChildren = Array.from(child.children);
        for (const inner of innerChildren) {
          const innerH = inner.offsetHeight;
          if (usedH > 0 && usedH + innerH > CONTENT_H) {
            currentPage = createPage();
            pages.push(currentPage);
            usedH = 0;
          }

          // If a section body is itself too tall, split its children too
          if (innerH > CONTENT_H && inner.classList.contains('paper-section-body')) {
            const bodyChildren = Array.from(inner.children);
            for (const bc of bodyChildren) {
              const bcH = bc.offsetHeight;
              if (usedH > 0 && usedH + bcH > CONTENT_H) {
                currentPage = createPage();
                pages.push(currentPage);
                usedH = 0;
              }
              currentPage.content.appendChild(bc.cloneNode(true));
              usedH += bcH;
            }
            // If inner had no block children (plain text?), append whole thing
            if (bodyChildren.length === 0) {
              currentPage.content.appendChild(inner.cloneNode(true));
              usedH += innerH;
            }
          } else {
            currentPage.content.appendChild(inner.cloneNode(true));
            usedH += innerH;
          }
        }
      } else {
        currentPage.content.appendChild(child.cloneNode(true));
        usedH += childH;
      }
    }

    // -- 3. Clean up measurer
    document.body.removeChild(measurer);

    // -- 4. Build final output
    const wrapper = document.createElement('div');
    wrapper.className = 'paper-preview-wrapper';
    wrapper.style.cssText = `
      padding:32px 16px;
      background:#e8e8e8;
      min-height:100%;
    `;

    // Page counter
    const totalPages = pages.length;
    pages.forEach(({ page }, i) => {
      const counter = document.createElement('div');
      counter.style.cssText = 'text-align:right;font-size:11px;color:#999;margin-top:8px;padding-right:4px;';
      counter.textContent = `${i + 1} / ${totalPages}`;
      page.appendChild(counter);
      wrapper.appendChild(page);
    });

    container.innerHTML = '';
    container.appendChild(wrapper);
  }

  // Expose on GCP namespace
  if (!window.GCP) window.GCP = {};
  window.GCP.renderPaperPreview = renderPaperPreview;
})();
