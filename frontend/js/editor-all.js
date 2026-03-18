// editor-all.js — Read-only view of all required sections for an event

// ── Comment float card styles (shared with editor.js) ──────────────────────
(function injectCmtFloatStyles() {
  if (document.getElementById('gcp-cmt-float-style')) return;
  const s = document.createElement('style');
  s.id = 'gcp-cmt-float-style';
  s.textContent = `
    .gcp-cmt-float {
      position: fixed;
      z-index: 9995;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 14px;
      width: 280px;
      box-shadow: 0 4px 24px rgba(15,23,42,.16);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    [data-theme="dark"] .gcp-cmt-float { background:#1e212c; border-color:rgba(255,255,255,.10); }
    .gcp-cmt-float-header { display:flex; align-items:center; gap:6px; }
    .gcp-cmt-float-avatar { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; font-size:9px; font-weight:800; color:#fff; flex-shrink:0; }
    .gcp-cmt-float-author { font-size:12px; font-weight:700; color:#0f172a; }
    [data-theme="dark"] .gcp-cmt-float-author { color:#f1f5f9; }
    .gcp-cmt-float-input { width:100%; box-sizing:border-box; border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px; font-size:13px; resize:vertical; outline:none; font-family:inherit; line-height:1.5; min-height:80px; }
    .gcp-cmt-float-input:focus { border-color:#93c5fd; box-shadow:0 0 0 2px rgba(147,197,253,.25); }
    [data-theme="dark"] .gcp-cmt-float-input { background:#2a2d3a; border-color:rgba(255,255,255,.12); color:#e8ecf4; }
    .gcp-cmt-float-actions { display:flex; gap:6px; }
    .gcp-cmt-float-save { padding:5px 14px; border-radius:7px; border:none; background:#0a84ff; color:#fff; font-size:12px; font-weight:700; cursor:pointer; }
    .gcp-cmt-float-save:hover { background:#0071e3; }
    .gcp-cmt-float-save:disabled { opacity:.5; cursor:default; }
    .gcp-cmt-float-cancel { padding:5px 10px; border-radius:7px; border:1px solid #e2e8f0; background:transparent; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; }
    .gcp-cmt-float-cancel:hover { background:rgba(0,0,0,.05); }
  `;
  document.head.appendChild(s);
})();

(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const qs = window.GCP.qs();
  const eventId = qs.eventId || qs.event_id;

  const msgEl = document.getElementById('msg');
  const metaEl = document.getElementById('meta');
  const titleEl = document.getElementById('taskTitle');
  const container = document.getElementById('sectionsContainer');

  function showMsg(text, isError) {
    msgEl.textContent = text;
    msgEl.className = 'small editor-msg' + (text ? (isError ? ' editor-msg--error' : ' editor-msg--success') : '');
  }

  if (!eventId) {
    showMsg('Missing event_id in URL.', true);
    return;
  }

  // ── Comment helpers ────────────────────────────────────────────────────
  function cmtAuthorColor(name) {
    const p = ['#1d4ed8','#b91c1c','#15803d','#7c3aed','#c2410c','#0f766e','#9d174d','#3730a3'];
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h*31+name.charCodeAt(i))>>>0;
    return p[h % p.length];
  }
  function cmtGetInitials(name) {
    return (name || '').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(s => s[0] && s[0].toUpperCase()).filter(Boolean).join('') || '?';
  }

  // ── Status label ────────────────────────────────────────────────────────
  const statusLabels = {
    draft:'Draft', in_progress:'Draft',
    submitted_to_collaborator_2:'Submitted to Head Collaborator', returned_by_collaborator_2:'Returned by Head Collaborator', approved_by_collaborator_2:'Approved by Head Collaborator',
    submitted_to_collaborator_3:'Submitted to Curator', returned_by_collaborator_3:'Returned by Curator', approved_by_collaborator_3:'Approved by Curator',
    submitted_to_collaborator:'Submitted to Collaborator', returned_by_collaborator:'Returned by Collaborator', approved_by_collaborator:'Approved by Collaborator',
    submitted_to_super_collaborator:'Submitted to Super-collaborator', returned_by_super_collaborator:'Returned by Super-collaborator', approved_by_super_collaborator:'Approved by Super-collaborator',
    submitted_to_supervisor:'Submitted to Supervisor', returned_by_supervisor:'Returned by Supervisor', approved_by_supervisor:'Approved by Supervisor',
    submitted_to_deputy:'Submitted to Deputy', returned_by_deputy:'Returned by Deputy', approved_by_deputy:'Approved by Deputy',
    submitted_to_minister:'Submitted to Minister', returned_by_minister:'Returned by Minister', approved_by_minister:'Approved by Minister',
    approved:'Approved', locked:'Locked',
  };

  // ── Load event details ─────────────────────────────────────────────────
  let eventDetails;
  try {
    eventDetails = await window.GCP.apiFetch(`/events/${encodeURIComponent(eventId)}`, { method: 'GET' });
  } catch (e) {
    showMsg(e.message || 'Failed to load event.', true);
    return;
  }

  titleEl.textContent = eventDetails.title || 'Untitled event';
  metaEl.innerHTML = `<span class="editor-meta-pill">${window.GCP.escapeHtml(eventDetails.country_name_en || '')}</span>`;

  const sections = eventDetails.required_sections || [];
  if (!sections.length) {
    showMsg('This event has no required sections.');
    return;
  }

  // ── Floating comment card (shared across all section editors) ──────────
  let _cmtFloat = null;
  let _cmtFloatCtx = null; // { sectionId, richEditor }

  function closeCmtFloat() {
    if (!_cmtFloat) return;
    const oldAnchor = _cmtFloat._anchorId;
    const ctx = _cmtFloatCtx;
    _cmtFloat.remove(); _cmtFloat = null; _cmtFloatCtx = null;
    if (oldAnchor && ctx && ctx.richEditor) ctx.richEditor.removeCommentAnchor(oldAnchor);
    if (ctx && ctx.richEditor) ctx.richEditor.setCommentsActive(false);
  }

  document.addEventListener('mousedown', e => {
    if (_cmtFloat && !_cmtFloat.contains(e.target)) closeCmtFloat();
  });

  function makeCommentsClick(sectionId, ref, editorFrame) {
    return function toggleCommentsPanel(anchorId) {
      const richEditor = ref.editor;
      if (_cmtFloat) { closeCmtFloat(); return; }

      const myColor = cmtAuthorColor(me.fullName || me.username || '');
      const myInitials = cmtGetInitials(me.fullName || me.username || '');
      const card = document.createElement('div');
      card.className = 'gcp-cmt-float';
      card._anchorId = anchorId;
      card.innerHTML = `
        <div class="gcp-cmt-float-header">
          <span class="gcp-cmt-float-avatar" style="background:${window.GCP.escapeHtml(myColor)}">${window.GCP.escapeHtml(myInitials)}</span>
          <span class="gcp-cmt-float-author">${window.GCP.escapeHtml(me.fullName || me.username || 'You')}</span>
        </div>
        <textarea class="gcp-cmt-float-input" placeholder="Add a comment…" rows="4"></textarea>
        <div class="gcp-cmt-float-actions">
          <button class="gcp-cmt-float-save" type="button">Save</button>
          <button class="gcp-cmt-float-cancel" type="button">Cancel</button>
        </div>`;
      document.body.appendChild(card);
      _cmtFloat = card;
      _cmtFloatCtx = { sectionId, richEditor };
      if (richEditor) richEditor.setCommentsActive(true);

      requestAnimationFrame(() => {
        const CARD_W = 292, CARD_H = 200, PAD = 12;
        let top = 120, left = window.innerWidth - CARD_W - PAD;
        if (anchorId && richEditor) {
          const anchor = richEditor.el.querySelector(`[data-cmt-anchor-id="${anchorId}"]`);
          if (anchor) {
            const aRect = anchor.getBoundingClientRect();
            top = aRect.bottom + 6;
            if (top + CARD_H > window.innerHeight - PAD) top = Math.max(aRect.top - CARD_H - 6, PAD);
            left = Math.min(Math.max(aRect.left, PAD), window.innerWidth - CARD_W - PAD);
          }
        } else if (editorFrame) {
          const frameRect = editorFrame.getBoundingClientRect();
          top = frameRect.top + 60;
          left = Math.min(frameRect.right + PAD, window.innerWidth - CARD_W - PAD);
        }
        card.style.top = top + 'px';
        card.style.left = left + 'px';
        card.querySelector('.gcp-cmt-float-input').focus();
      });

      card.querySelector('.gcp-cmt-float-save').addEventListener('click', async () => {
        const text = card.querySelector('.gcp-cmt-float-input').value.trim();
        if (!text) return;
        card.querySelector('.gcp-cmt-float-save').disabled = true;
        try {
          await window.GCP.apiFetch('/tp/comments', {
            method: 'POST',
            body: JSON.stringify({ eventId, sectionId, commentText: text, anchorId: anchorId || null })
          });
          card.remove(); _cmtFloat = null; _cmtFloatCtx = null;
          if (richEditor) richEditor.setCommentsActive(false);
          await loadCommentsForSection(sectionId, ref);
        } catch(e) {
          showMsg(e.message || 'Could not post comment', true);
          card.querySelector('.gcp-cmt-float-save').disabled = false;
        }
      });

      card.querySelector('.gcp-cmt-float-cancel').addEventListener('click', closeCmtFloat);
      card.querySelector('.gcp-cmt-float-input').addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); card.querySelector('.gcp-cmt-float-save').click(); }
        if (e.key === 'Escape') closeCmtFloat();
      });
    };
  }

  function makeDeleteComment(sectionId, ref) {
    return async function(commentId, anchorId) {
      try {
        await window.GCP.apiFetch(`/tp/comments/${commentId}`, { method: 'DELETE' });
        await loadCommentsForSection(sectionId, ref);
        if (anchorId && ref.editor) ref.editor.removeCommentAnchor(anchorId);
      } catch(e) { showMsg(e.message || 'Could not delete comment', true); }
    };
  }

  function makeReplyComment(sectionId, ref) {
    return async function(parentId, text) {
      try {
        await window.GCP.apiFetch('/tp/comments', {
          method: 'POST',
          body: JSON.stringify({ eventId, sectionId, commentText: text, parentId })
        });
        await loadCommentsForSection(sectionId, ref);
      } catch(e) { showMsg(e.message || 'Could not post reply', true); }
    };
  }

  async function loadCommentsForSection(sectionId, ref) {
    try {
      const data = await window.GCP.apiFetch(
        `/tp/comments?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`,
        { method: 'GET' }
      );
      if (ref.editor) ref.editor.setComments(data.comments || []);
    } catch(_) {}
  }

  // ── Render each section ────────────────────────────────────────────────
  for (const section of sections) {
    const sectionId = section.id;

    // Section wrapper
    const wrapper = document.createElement('section');
    wrapper.className = 'card col-12 editor-all-section';

    // Section header
    const header = document.createElement('div');
    header.className = 'editor-all-section__head';

    let tp;
    try {
      tp = await window.GCP.apiFetch(
        `/tp?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`,
        { method: 'GET' }
      );
    } catch (e) {
      header.innerHTML = `<h3 class="editor-all-section__title">${window.GCP.escapeHtml(section.label)}</h3>
        <div class="editor-all-section__error">Failed to load: ${window.GCP.escapeHtml(e.message || 'unknown error')}</div>`;
      wrapper.appendChild(header);
      container.appendChild(wrapper);
      continue;
    }

    const s = String(tp.status || 'draft').toLowerCase();
    const statusLabel = statusLabels[s] || s.replaceAll('_', ' ');

    let updatedHtml = '<span class="muted">No updates yet</span>';
    if (tp.lastContentEditedBy && tp.lastContentEditedAt) {
      updatedHtml = `Last updated · ${window.GCP.escapeHtml(window.GCP.formatDateTime(tp.lastContentEditedAt))} · ${window.GCP.escapeHtml(tp.lastContentEditedBy)}`;
    }

    header.innerHTML = `
      <div class="editor-all-section__info">
        <h3 class="editor-all-section__title">${window.GCP.escapeHtml(section.label)}</h3>
        <div class="editor-all-section__updated">${updatedHtml}</div>
      </div>
      <span class="pill pill-status ${window.GCP.escapeHtml(s)}">${window.GCP.escapeHtml(statusLabel)}</span>
    `;
    wrapper.appendChild(header);

    // Return comment if any
    const note = (tp.statusComment || '').trim();
    if (note) {
      const returnBox = document.createElement('div');
      returnBox.className = 'editor-return-box';
      returnBox.innerHTML = `<b>Return comment:</b> ${window.GCP.escapeHtml(note)}`;
      wrapper.appendChild(returnBox);
    }

    // Editor frame
    const editorFrame = document.createElement('div');
    editorFrame.className = 'editor-frame';
    wrapper.appendChild(editorFrame);

    container.appendChild(wrapper);

    // Initialize RichEditor (read-only)
    // Use a mutable ref so callbacks created before RichEditor can access it after
    const ref = { editor: null };
    if (window.GCP && window.GCP.RichEditor) {
      const richEditor = window.GCP.RichEditor({
        container: editorFrame,
        initialHtml: tp.htmlContent || '',
        authorName: me.fullName || me.username || 'Unknown',
        sectionTitle: section.label || '',
        onCommentsClick: makeCommentsClick(sectionId, ref, editorFrame),
        onDeleteComment: makeDeleteComment(sectionId, ref),
        onReplyComment: makeReplyComment(sectionId, ref),
      });
      ref.editor = richEditor;

      // Make read-only
      if (richEditor && richEditor.el) {
        richEditor.el.contentEditable = 'false';
      }

      // Load comments for this section
      await loadCommentsForSection(sectionId, ref);
    }
  }

  if (!sections.length) {
    container.innerHTML = '<div class="editor-all-empty">No required sections for this event.</div>';
  }
})();
