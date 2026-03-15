// editor.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const qs = window.GCP.qs();
  const eventId = qs.eventId || qs.event_id;
  const sectionId = qs.sectionId || qs.section_id;

  const msg = document.getElementById("msg");
  const meta = document.getElementById("meta");
  const statusEl = document.getElementById("statusEl");
  const taskTitleEl = document.getElementById("taskTitle");
  const lastUpdatedEl = document.getElementById("lastUpdated");
  const returnCommentBox = document.getElementById("returnCommentBox");

  const btnSave = document.getElementById("btnSave");
  const btnSubmit = document.getElementById("btnSubmit");
  const btnApprove = document.getElementById("btnApprove");
  const btnReturn = document.getElementById("btnReturn");
  const btnUpload = document.getElementById("btnUpload");
  const btnAskToReturn = document.getElementById("btnAskToReturn");
  const cmtCol     = document.getElementById("cmtCol");
  const cmtOverlay = document.getElementById("cmtOverlay");

  const actionButtons = [btnSave, btnSubmit, btnApprove, btnReturn];

  function setActionLoading(activeBtn, loading){
    actionButtons.forEach((btn) => {
      if (!btn || btn.style.display === "none") return;
      if (loading){
        btn.disabled = true;
        if (btn === activeBtn) btn.classList.add("is-loading");
      } else {
        btn.disabled = false;
        btn.classList.remove("is-loading");
      }
    });
  }

  function setStatus(status){
    const labels = {
      draft: 'Draft',
      in_progress: 'Draft',
      submitted_to_collaborator_2: 'Submitted to Head Collaborator',
      returned_by_collaborator_2: 'Returned by Head Collaborator',
      approved_by_collaborator_2: 'Approved by Head Collaborator',
      submitted_to_collaborator_3: 'Submitted to Curator',
      returned_by_collaborator_3: 'Returned by Curator',
      approved_by_collaborator_3: 'Approved by Curator',
      submitted_to_collaborator: 'Submitted to Collaborator',
      returned_by_collaborator: 'Returned by Collaborator',
      approved_by_collaborator: 'Approved by Collaborator',
      submitted_to_super_collaborator: 'Submitted to Super-collaborator',
      returned_by_super_collaborator: 'Returned by Super-collaborator',
      approved_by_super_collaborator: 'Approved by Super-collaborator',
      submitted_to_supervisor: 'Submitted to Supervisor',
      returned_by_supervisor: 'Returned by Supervisor',
      approved_by_supervisor: 'Approved by Supervisor',
      submitted_to_chairman: 'Submitted to Deputy',
      returned_by_chairman: 'Returned by Deputy',
      approved_by_chairman: 'Approved by Deputy',
      submitted_to_minister: 'Submitted to Minister',
      returned_by_minister: 'Returned by Minister',
      approved_by_minister: 'Approved by Minister',
      approved: 'Approved',
      locked: 'Locked',
    };
    const s = String(status || 'draft').toLowerCase();
    const pretty = labels[s] || s.replaceAll('_', ' ');
    statusEl.innerHTML = `<span class="pill pill-status ${s}">${pretty}</span>`;
  }

  if (!eventId || !sectionId){
    msg.textContent = "Missing eventId/sectionId in URL.";
    return;
  }

  const isViewer = role === "viewer";
  const isProtocol = role === "protocol";

  if (isProtocol){
    msg.textContent = "Protocol role cannot edit Talking Points.";
    actionButtons.forEach(b => b && (b.disabled = true));
    return;
  }

  // Initially hide all action buttons; applyButtonRules() sets them correctly after load
  actionButtons.forEach(b => b && (b.style.display = "none"));
  if (btnUpload)      btnUpload.style.display      = "none";
  if (btnAskToReturn) btnAskToReturn.style.display = "none";

  let editorInstance = null;
  let richEditorInstance = null;

  // Returns true when it is the current user's active turn to act on the section.
  function isMyTurn(tp) {
    const s   = String(tp.status || 'draft').toLowerCase();
    const rtr = String(tp.returnTargetRole || '').toLowerCase();
    if (role === 'collaborator_1')     return s === 'draft' || rtr === 'collaborator_1';
    if (role === 'collaborator_2')     return ['submitted_to_collaborator_2','returned_by_collaborator_2'].includes(s) || rtr === 'collaborator_2' || s === 'draft';
    if (role === 'collaborator_3')     return ['submitted_to_collaborator_3','returned_by_collaborator_3','approved_by_collaborator_2','submitted_to_collaborator_2','returned_by_collaborator_2'].includes(s) || rtr === 'collaborator_3' || s === 'draft';
    if (role === 'collaborator')       return ['submitted_to_collaborator','returned_by_collaborator','approved_by_collaborator_2','approved_by_collaborator_3'].includes(s) || rtr === 'collaborator' || s === 'draft';
    if (role === 'super_collaborator') return [
      'submitted_to_super_collaborator','returned_by_super_collaborator','approved_by_collaborator',
      'submitted_to_collaborator','returned_by_collaborator','approved_by_collaborator_3',
      'submitted_to_collaborator_2','returned_by_collaborator_2','approved_by_collaborator_2',
      'submitted_to_collaborator_3','returned_by_collaborator_3',
    ].includes(s) || rtr === 'super_collaborator' || s === 'draft';
    return true; // supervisor / chairman / minister / admin always active
  }

  function applyButtonRules(tp){
    const s = String(tp.status || 'draft').toLowerCase();

    // Reset all action buttons + Ask to Return
    actionButtons.forEach(b => b && (b.style.display = "none"));
    if (btnUpload)       btnUpload.style.display       = "none";
    if (btnAskToReturn)  btnAskToReturn.style.display  = "none";
    if (isViewer) return;

    if (!isMyTurn(tp)) {
      // Not this user's turn — editor is read-only.
      // Only show Ask to Return when someone else holds the section (non-draft).
      // In draft state there is no current holder, so Ask to Return is meaningless.
      if (s !== 'draft' && btnAskToReturn) btnAskToReturn.style.display = "";
      return;
    }

    // It IS this user's turn — show the normal role-specific buttons
    if (role === 'collaborator_1') {
      if (btnSave)   btnSave.style.display   = "";
      if (btnSubmit) btnSubmit.style.display = "";
      if (btnUpload) btnUpload.style.display = "";
    } else if (role === 'collaborator_2') {
      if (btnSave)   btnSave.style.display   = "";
      if (btnSubmit) btnSubmit.style.display = "";
      if (btnUpload) btnUpload.style.display = "";
      const canReturn = ['submitted_to_collaborator_2', 'returned_by_collaborator_2'].includes(s);
      if (btnReturn) btnReturn.style.display = canReturn ? "" : "none";
    } else if (role === 'collaborator_3') {
      if (btnSave)   btnSave.style.display   = "";
      if (btnSubmit) btnSubmit.style.display = "";
      if (btnUpload) btnUpload.style.display = "";
      const canReturn = ['submitted_to_collaborator_3','returned_by_collaborator_3','approved_by_collaborator_2','submitted_to_collaborator_2','returned_by_collaborator_2'].includes(s);
      if (btnReturn) btnReturn.style.display = canReturn ? "" : "none";
    } else if (role === 'collaborator') {
      if (btnSave)   btnSave.style.display   = "";
      if (btnSubmit) btnSubmit.style.display = "";
      if (btnUpload) btnUpload.style.display = "";
      const canReturn = ['submitted_to_collaborator', 'returned_by_collaborator'].includes(s);
      if (btnReturn) btnReturn.style.display = canReturn ? "" : "none";
    } else if (role === 'super_collaborator') {
      if (btnSave)    btnSave.style.display    = "";
      if (btnApprove) btnApprove.style.display = "";
      if (btnReturn)  btnReturn.style.display  = "";
    } else if (['supervisor','chairman','minister','admin'].includes(role)) {
      if (btnSave)    btnSave.style.display    = "";
      if (btnApprove) btnApprove.style.display = "";
      if (btnReturn)  btnReturn.style.display  = "";
    } else {
      if (btnSave) btnSave.style.display = "";
    }

    // Highlight first visible button
    const firstVisible = actionButtons.find((btn) => btn && btn.style.display !== 'none');
    actionButtons.forEach((btn) => btn && btn.classList.remove('is-expanded'));
    if (firstVisible) firstVisible.classList.add('is-expanded');
  }

  async function load(){
    msg.textContent = "";
    const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`, { method:"GET" });

    if (taskTitleEl) taskTitleEl.textContent = tp.eventTitle || 'Untitled task';
    meta.innerHTML = `
      <span class="editor-meta-pill">${window.GCP.escapeHtml(tp.countryName || 'Unknown country')}</span>
      <span class="editor-meta-pill">${window.GCP.escapeHtml(tp.sectionLabel || 'Unknown section')}</span>
    `;

    // Show last content edit (actual text change), not workflow actions
    if (lastUpdatedEl){
      if (tp.lastContentEditedBy && tp.lastContentEditedAt) {
        const updatedAt = window.GCP.escapeHtml(window.GCP.formatDateTime(tp.lastContentEditedAt));
        const updatedBy = window.GCP.escapeHtml(tp.lastContentEditedBy);
        lastUpdatedEl.innerHTML = `<span>Last updated · ${updatedAt}</span><span>· ${updatedBy}</span>`;
      } else {
        lastUpdatedEl.innerHTML = `<span class="muted">No updates yet</span>`;
      }
    }

    if (returnCommentBox){
      const note = (tp.statusComment || '').trim();
      if (note){
        returnCommentBox.style.display = 'block';
        returnCommentBox.innerHTML = `<b>Return comment:</b> ${window.GCP.escapeHtml(note)}`;
      } else {
        returnCommentBox.style.display = 'none';
        returnCommentBox.textContent = '';
      }
    }

    setStatus(tp.status || "draft");
    applyButtonRules(tp);

    const textarea = document.getElementById("editor");
    if (textarea) textarea.value = tp.htmlContent || "";
    const editorFrame = document.getElementById("editorFrame");

    const canEdit = !isViewer && !isProtocol;
    if (window.CKEDITOR && textarea){
      if (editorInstance) editorInstance.destroy(true);
      editorInstance = window.CKEDITOR.replace("editor", { height: 420 });
      if (!canEdit && editorInstance && typeof editorInstance.setReadOnly === 'function') editorInstance.setReadOnly(true);
    } else if (window.GCP && window.GCP.RichEditor && editorFrame){
      if (richEditorInstance){
        richEditorInstance.setHtml(tp.htmlContent || '');
      } else {
        richEditorInstance = window.GCP.RichEditor({ container: editorFrame, initialHtml: tp.htmlContent || '', authorName: me.full_name || me.username || 'Unknown', onCommentsClick: toggleCommentsPanel });
      }
      if (richEditorInstance && richEditorInstance.el){
        richEditorInstance.el.contentEditable = canEdit ? 'true' : 'false';
      }
    } else if (textarea){
      textarea.disabled = !canEdit;
    }
  }

  function getHtml(){
    if (editorInstance) return editorInstance.getData();
    if (richEditorInstance) return richEditorInstance.getHtml();
    const ta = document.getElementById("editor");
    return ta ? ta.value : '';
  }

  if (btnSave) btnSave.addEventListener("click", async () => {
    setActionLoading(btnSave, true);
    try{
      await window.GCP.apiFetch("/tp/save", {
        method:"POST",
        body: JSON.stringify({ eventId, sectionId, htmlContent: getHtml() })
      });
      await load();
      msg.textContent = "Saved.";
    }catch(err){
      msg.textContent = err.message || "Save failed";
    } finally {
      setActionLoading(btnSave, false);
    }
  });

  if (btnSubmit) btnSubmit.addEventListener("click", async () => {
    setActionLoading(btnSubmit, true);
    try{
      await window.GCP.apiFetch("/tp/submit", {
        method:"POST",
        body: JSON.stringify({ eventId, sectionId, htmlContent: getHtml() })
      });
      await load();
      const msgMap = {
        collaborator_1: "Submitted to Head Collaborator.",
        collaborator_2: "Submitted to Curator.",
        collaborator_3: "Submitted to Collaborator.",
        collaborator: "Submitted to Super-collaborator.",
        super_collaborator: "Submitted to Supervisor.",
      };
      msg.textContent = msgMap[role] || "Submitted.";
    }catch(err){
      msg.textContent = err.message || "Submit failed";
    } finally {
      setActionLoading(btnSubmit, false);
    }
  });

  if (btnApprove) btnApprove.addEventListener("click", async () => {
    if (richEditorInstance && richEditorInstance.hasTrackedChanges()) {
      msg.textContent = "Accept or reject all tracked changes before approving.";
      return;
    }
    setActionLoading(btnApprove, true);
    try{
      if (role === "chairman" || role === "minister"){
        await window.GCP.apiFetch("/tp/approve-section-chairman", {
          method:"POST",
          body: JSON.stringify({ eventId, sectionId })
        });
      } else {
        // supervisor, super_collaborator, admin
        await window.GCP.apiFetch("/tp/approve-section", {
          method:"POST",
          body: JSON.stringify({ eventId, sectionId })
        });
      }
      await load();
      msg.textContent = "Approved.";
    }catch(err){
      msg.textContent = err.message || "Approve failed";
    } finally {
      setActionLoading(btnApprove, false);
    }
  });

  if (btnReturn) btnReturn.addEventListener("click", async () => {
    const comment = await window.GCP.showCommentDropdown(btnReturn, {
      title: 'Return section',
      placeholder: 'Add a comment (optional)…',
      sendLabel: 'Return',
    });
    if (comment === null) return;
    setActionLoading(btnReturn, true);
    try{
      await window.GCP.apiFetch("/tp/return", {
        method:"POST",
        body: JSON.stringify({ eventId, sectionId, comment })
      });
      await load();
      msg.textContent = "Returned.";
    }catch(err){
      msg.textContent = err.message || "Return failed";
    } finally {
      setActionLoading(btnReturn, false);
    }
  });

  // ---- Ask to Return ----
  if (btnAskToReturn) btnAskToReturn.addEventListener("click", async () => {
    const note = await window.GCP.showCommentDropdown(btnAskToReturn, {
      title: 'Ask to Return',
      placeholder: 'Why do you need it back? (optional)…',
      sendLabel: 'Send Request',
    });
    if (note === null) return;
    try {
      btnAskToReturn.disabled = true;
      await window.GCP.apiFetch("/tp/ask-to-return", {
        method: "POST",
        body: JSON.stringify({ eventId, sectionId, note })
      });
      msg.textContent = "Return request sent.";
      msg.style.color = "#16a34a";
    } catch(err) {
      msg.textContent = err.message || "Failed to send return request.";
      msg.style.color = "crimson";
    } finally {
      btnAskToReturn.disabled = false;
    }
  });

  // ---- File upload ----
  const fileInput = document.getElementById('fileInput');
  const filesSection = document.getElementById('filesSection');

  function renderFilesList(files){
    if(!filesSection) return;
    if(!files||!files.length){ filesSection.style.display='none'; return; }
    filesSection.style.display='';
    filesSection.innerHTML = files.map(f=>{
      const safeName = window.GCP.escapeHtml(f.filename);
      const sizeStr = f.size ? Math.ceil(f.size/1024)+'KB' : '';
      return `<div class="editor-file-item"><button class="editor-file-download" data-filename="${safeName}">${safeName}</button><span class="editor-file-size">${sizeStr}</span></div>`;
    }).join('');
    filesSection.querySelectorAll('.editor-file-download').forEach(btn=>{
      btn.addEventListener('click', async()=>{
        const filename = btn.dataset.filename;
        try{
          const token = localStorage.getItem('gcp_token');
          const res = await fetch(`/api/tp/files/download?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}&filename=${encodeURIComponent(filename)}`, {
            headers: token ? { 'Authorization': 'Bearer '+token } : {}
          });
          if(!res.ok) throw new Error('Download failed ('+res.status+')');
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href=url; a.download=filename;
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        }catch(e){ msg.textContent = e.message||'Download failed'; }
      });
    });
  }

  async function loadFiles(){
    try{
      const data = await window.GCP.apiFetch(`/tp/files?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`,{method:'GET'});
      renderFilesList(data.files||[]);
    }catch(e){
      if(filesSection){ filesSection.style.display=''; filesSection.innerHTML=`<div class="editor-file-error">Files unavailable: ${window.GCP.escapeHtml(e.message||'unknown error')}</div>`; }
    }
  }

  if(btnUpload && fileInput){
    btnUpload.addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change', async()=>{
      const files = Array.from(fileInput.files||[]);
      if(!files.length) return;
      btnUpload.disabled = true;
      try{
        for(const file of files){
          const base64 = await new Promise((resolve,reject)=>{
            const reader = new FileReader();
            reader.onload = ()=>resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          await window.GCP.apiFetch('/tp/files/upload',{
            method:'POST',
            body: JSON.stringify({eventId, sectionId, filename: file.name, mimeType: file.type, base64})
          });
        }
        fileInput.value = '';
        await loadFiles();
        msg.textContent = `${files.length} file(s) uploaded.`;
      }catch(err){
        msg.textContent = err.message || 'Upload failed';
      } finally {
        btnUpload.disabled = false;
      }
    });
  }

  // ── Comments (Word-style bubbles) ────────────────────────────────────────

  function cmtGetInitials(name) {
    return (name || '').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(s => s[0] && s[0].toUpperCase()).filter(Boolean).join('') || '?';
  }

  function cmtAuthorColor(name) {
    const palette = ['#1d4ed8','#b91c1c','#15803d','#7c3aed','#c2410c','#0f766e','#9d174d','#3730a3'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  function cmtRelTime(iso) {
    if (!iso) return '';
    try {
      const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
      if (diff < 60)    return 'just now';
      if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return new Date(iso).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch(_) { return ''; }
  }

  function positionBubbles() {
    if (!cmtOverlay || !richEditorInstance) return;
    const overlayTop = cmtOverlay.getBoundingClientRect().top + window.scrollY;
    const bubbles = Array.from(cmtOverlay.querySelectorAll('.gcp-cmt-bubble'));
    let minTop = 0;
    bubbles.forEach(bubble => {
      const anchorId = bubble.dataset.anchorId;
      let idealTop = minTop;
      if (anchorId) {
        const anchor = richEditorInstance.el.querySelector(`[data-cmt-anchor-id="${anchorId}"]`);
        if (anchor) {
          const absY = anchor.getBoundingClientRect().top + window.scrollY;
          idealTop = Math.max(absY - overlayTop, minTop);
        }
      }
      bubble.style.top = idealTop + 'px';
      minTop = idealTop + bubble.offsetHeight + 8;
    });
    if (bubbles.length) {
      const last = bubbles[bubbles.length - 1];
      cmtOverlay.style.minHeight = (parseFloat(last.style.top) + last.offsetHeight + 20) + 'px';
    }
  }

  function createCommentBubble(c) {
    const color    = cmtAuthorColor(c.author_name || '');
    const initials = cmtGetInitials(c.author_name || '');
    const div = document.createElement('div');
    div.className = 'gcp-cmt-bubble';
    if (c.anchor_id) div.dataset.anchorId = c.anchor_id;
    div.dataset.commentId = String(c.id);
    div.innerHTML = `
      <div class="gcp-cmt-header">
        <span class="gcp-cmt-avatar" style="background:${window.GCP.escapeHtml(color)}">${window.GCP.escapeHtml(initials)}</span>
        <span class="gcp-cmt-author">${window.GCP.escapeHtml(c.author_name || 'Unknown')}</span>
        <span class="gcp-cmt-time">${window.GCP.escapeHtml(cmtRelTime(c.created_at))}</span>
      </div>
      <div class="gcp-cmt-text">${window.GCP.escapeHtml(c.comment_text || '')}</div>
      ${c.is_own ? `<div class="gcp-cmt-actions"><button class="gcp-cmt-resolve" type="button">Resolve</button></div>` : ''}
    `;
    if (c.is_own) {
      div.querySelector('.gcp-cmt-resolve').addEventListener('click', async () => {
        try {
          await window.GCP.apiFetch(`/tp/comments/${c.id}`, { method: 'DELETE' });
          if (c.anchor_id && richEditorInstance) richEditorInstance.removeCommentAnchor(c.anchor_id);
          await loadComments();
        } catch(e) { msg.textContent = e.message || 'Could not resolve comment'; }
      });
    }
    return div;
  }

  function renderComments(comments) {
    if (!cmtOverlay) return;
    if (richEditorInstance) richEditorInstance.setCommentsBadge((comments || []).length);
    // Remove existing comment bubbles (keep the new-comment bubble if present)
    cmtOverlay.querySelectorAll('.gcp-cmt-bubble:not(.gcp-cmt-bubble--new)').forEach(el => el.remove());
    (comments || []).forEach(c => cmtOverlay.appendChild(createCommentBubble(c)));
    requestAnimationFrame(positionBubbles);
  }

  async function loadComments() {
    if (!cmtOverlay || !eventId || !sectionId) return;
    try {
      const data = await window.GCP.apiFetch(
        `/tp/comments?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`,
        { method: 'GET' }
      );
      renderComments(data.comments || []);
    } catch(e) {
      if (cmtOverlay) cmtOverlay.innerHTML = `<div class="gcp-cmt-error">Could not load comments.</div>`;
    }
  }

  // New-comment input bubble (shown when toolbar Comments button is clicked)
  let _newCmtBubble = null;

  function toggleCommentsPanel(anchorId) {
    // If a new-comment bubble is already open, cancel it
    if (_newCmtBubble) {
      const oldAnchor = _newCmtBubble._anchorId;
      _newCmtBubble.remove();
      _newCmtBubble = null;
      if (oldAnchor && richEditorInstance) richEditorInstance.removeCommentAnchor(oldAnchor);
      if (richEditorInstance) richEditorInstance.setCommentsActive(false);
      return;
    }

    if (!cmtOverlay) return;

    const myColor    = cmtAuthorColor(me.full_name || me.username || '');
    const myInitials = cmtGetInitials(me.full_name || me.username || '');
    const bubble = document.createElement('div');
    bubble.className = 'gcp-cmt-bubble gcp-cmt-bubble--new';
    bubble._anchorId = anchorId;
    bubble.innerHTML = `
      <div class="gcp-cmt-header">
        <span class="gcp-cmt-avatar" style="background:${window.GCP.escapeHtml(myColor)}">${window.GCP.escapeHtml(myInitials)}</span>
        <span class="gcp-cmt-author">${window.GCP.escapeHtml(me.full_name || me.username || 'You')}</span>
      </div>
      <textarea class="gcp-cmt-input" placeholder="Add a comment…" rows="3"></textarea>
      <div class="gcp-cmt-actions">
        <button class="gcp-cmt-save" type="button">Save</button>
        <button class="gcp-cmt-cancel" type="button">Cancel</button>
      </div>
    `;
    cmtOverlay.appendChild(bubble);
    _newCmtBubble = bubble;
    if (richEditorInstance) richEditorInstance.setCommentsActive(true);

    // Position the bubble next to its anchor
    requestAnimationFrame(() => {
      if (anchorId && richEditorInstance) {
        const anchor = richEditorInstance.el.querySelector(`[data-cmt-anchor-id="${anchorId}"]`);
        if (anchor) {
          const overlayTop = cmtOverlay.getBoundingClientRect().top + window.scrollY;
          const absY = anchor.getBoundingClientRect().top + window.scrollY;
          bubble.style.top = Math.max(0, absY - overlayTop) + 'px';
        }
      }
      bubble.querySelector('.gcp-cmt-input').focus();
    });

    bubble.querySelector('.gcp-cmt-save').addEventListener('click', async () => {
      const text = bubble.querySelector('.gcp-cmt-input').value.trim();
      if (!text) return;
      bubble.querySelector('.gcp-cmt-save').disabled = true;
      try {
        await window.GCP.apiFetch('/tp/comments', {
          method: 'POST',
          body: JSON.stringify({ eventId, sectionId, commentText: text, anchorId: anchorId || null })
        });
        bubble.remove(); _newCmtBubble = null;
        if (richEditorInstance) richEditorInstance.setCommentsActive(false);
        await loadComments();
      } catch(e) {
        msg.textContent = e.message || 'Could not post comment';
        bubble.querySelector('.gcp-cmt-save').disabled = false;
      }
    });

    bubble.querySelector('.gcp-cmt-cancel').addEventListener('click', () => {
      if (anchorId && richEditorInstance) richEditorInstance.removeCommentAnchor(anchorId);
      bubble.remove(); _newCmtBubble = null;
      if (richEditorInstance) richEditorInstance.setCommentsActive(false);
    });

    bubble.querySelector('.gcp-cmt-input').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); bubble.querySelector('.gcp-cmt-save').click(); }
      if (e.key === 'Escape') bubble.querySelector('.gcp-cmt-cancel').click();
    });
  }

  // Re-position bubbles on window scroll/resize
  window.addEventListener('scroll', () => requestAnimationFrame(positionBubbles), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(positionBubbles), { passive: true });

  try{
    await load();
    await loadFiles();
    await loadComments();
  }catch(err){
    msg.textContent = err.message || "Failed to load editor";
  }
})();
