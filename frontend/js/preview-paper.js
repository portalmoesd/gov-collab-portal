/**
 * preview-paper.js — A4 paper preview for talking-points dashboards.
 *
 * Opens a new browser tab with content formatted for A4 paper.
 * The browser's native @page CSS handles pagination perfectly.
 * Users can print / "Save as PDF" directly from the tab.
 *
 * Usage:
 *   window.GCP.openPaperPreview({
 *     title: 'Event Title',
 *     country: 'Country Name',
 *     sections: [ { label: 'Section 1', html: '<p>...</p>' }, ... ]
 *   });
 */
(function () {
  'use strict';

  function esc(s) {
    return (window.GCP && window.GCP.escapeHtml)
      ? window.GCP.escapeHtml(s)
      : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function openPaperPreview(opts) {
    const { title, country, sections } = opts;

    // Build sections HTML
    const sectionsHtml = sections.map(function (sec) {
      const body = sec.html || '<div style="color:#999;">—</div>';
      return '<div class="tp-section">' +
        '<h2>' + esc(sec.label) + '</h2>' +
        '<div class="tp-body">' + body + '</div>' +
        '</div>';
    }).join('');

    const html = '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<title>' + esc(title || 'Preview') + '</title>' +
      '<style>' +
      // -- Print: A4 page rules (browser handles pagination) --
      '@page{size:A4;margin:20mm 25mm;}' +
      '@media print{' +
        'body{margin:0;padding:0;background:#fff;}' +
        '.doc{box-shadow:none;border:none;margin:0;padding:0;width:auto;max-width:none;border-radius:0;}' +
        '.print-bar{display:none!important;}' +
      '}' +
      // -- Screen: looks like a sheet of paper --
      '@media screen{' +
        'body{margin:0;padding:32px 16px;background:#e8e8e8;min-height:100vh;box-sizing:border-box;}' +
        '.doc{' +
          'width:210mm;max-width:100%;margin:0 auto;background:#fff;' +
          'border:1px solid #d0d0d0;border-radius:4px;' +
          'box-shadow:0 2px 12px rgba(0,0,0,.18);' +
          'padding:20mm 25mm;box-sizing:border-box;' +
        '}' +
        '.print-bar{' +
          'position:sticky;top:0;z-index:10;background:#555;color:#fff;' +
          'padding:8px 20px;text-align:center;font-family:sans-serif;font-size:14px;' +
        '}' +
        '.print-bar button{' +
          'background:#fff;color:#333;border:none;border-radius:6px;' +
          'padding:6px 20px;font-size:14px;cursor:pointer;margin-left:12px;' +
        '}' +
        '.print-bar button:hover{background:#e0e0e0;}' +
      '}' +
      // -- Content typography --
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.65;color:#222;}' +
      '.doc-header{text-align:center;margin-bottom:10px;}' +
      '.doc-header .country{font-size:13px;color:#555;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;}' +
      '.doc-header .title{font-size:20px;font-weight:700;color:#1a1a1a;line-height:1.3;margin-bottom:4px;}' +
      '.doc-header hr{border:none;border-top:1.5px solid #bbb;margin:18px 0 10px;}' +
      '.tp-section h2{font-size:16px;font-weight:600;color:#222;border-bottom:1px solid #e0e0e0;padding-bottom:5px;margin:20px 0 8px;break-after:avoid;page-break-after:avoid;}' +
      '.tp-body{font-size:14px;line-height:1.65;color:#222;}' +
      '.tp-body p{margin:0 0 8px;}' +
      '</style></head><body>' +
      '<div class="print-bar">Preview — ' + esc(title || 'Document') +
        '<button onclick="window.print()">Print / Save PDF</button></div>' +
      '<div class="doc">' +
        '<div class="doc-header">' +
          (country ? '<div class="country">' + esc(country) + '</div>' : '') +
          (title ? '<div class="title">' + esc(title) + '</div>' : '') +
          '<hr>' +
        '</div>' +
        sectionsHtml +
      '</div>' +
      '</body></html>';

    var win = window.open('', '_blank');
    if (!win) {
      alert('Please allow pop-ups for this site to use the preview feature.');
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  if (!window.GCP) window.GCP = {};
  window.GCP.openPaperPreview = openPaperPreview;
})();
