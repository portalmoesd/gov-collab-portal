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
  const commentsPanel = document.getElementById("commentsPanel");
  const commentsList = document.getElementById("commentsList");
  const commentInput = document.getElementById("commentInput");
  const addCommentBtn = document.getElementById("addCommentBtn");
  const closePanelBtn = document.getElementById("closePanelBtn");

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

  // ---- Comments panel ----

  function formatCommentTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch(_) { return iso || ''; }
  }

  function renderComments(comments) {
    if (!commentsList) return;
    if (richEditorInstance) richEditorInstance.setCommentsBadge((comments || []).length);
    if (!comments || !comments.length) {
      commentsList.innerHTML = '<div class="ecp-empty">No comments yet.</div>';
      return;
    }
    commentsList.innerHTML = comments.map(c => {
      const author = window.GCP.escapeHtml(c.author_name || 'Unknown');
      const text   = window.GCP.escapeHtml(c.comment_text || '');
      const time   = window.GCP.escapeHtml(formatCommentTime(c.created_at));
      const delBtn = c.is_own
        ? `<button class="ecp-comment-del" data-id="${c.id}" type="button">Delete</button>`
        : '';
      return `<div class="ecp-comment" data-comment-id="${c.id}">
        <div class="ecp-comment-meta">
          <span class="ecp-comment-author">${author}</span>
          <span class="ecp-comment-time">${time}</span>
        </div>
        <div class="ecp-comment-text">${text}</div>
        ${delBtn}
      </div>`;
    }).join('');
    // Wire delete buttons
    commentsList.querySelectorAll('.ecp-comment-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          await window.GCP.apiFetch(`/tp/comments/${id}`, { method: 'DELETE' });
          await loadComments();
        } catch(e) {
          msg.textContent = e.message || 'Delete failed';
        }
      });
    });
  }

  async function loadComments() {
    if (!commentsList || !eventId || !sectionId) return;
    try {
      const data = await window.GCP.apiFetch(
        `/tp/comments?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`,
        { method: 'GET' }
      );
      renderComments(data.comments || []);
    } catch(e) {
      if (commentsList) commentsList.innerHTML = `<div class="ecp-empty" style="color:#dc2626">Could not load comments.</div>`;
    }
  }

  function toggleCommentsPanel() {
    if (!commentsPanel) return;
    const open = commentsPanel.style.display !== 'none';
    commentsPanel.style.display = open ? 'none' : '';
    if (richEditorInstance) richEditorInstance.setCommentsActive(!open);
    if (!open) loadComments();
  }

  if (closePanelBtn && commentsPanel) {
    closePanelBtn.addEventListener('click', () => {
      commentsPanel.style.display = 'none';
      if (richEditorInstance) richEditorInstance.setCommentsActive(false);
    });
  }

  if (addCommentBtn && commentInput) {
    addCommentBtn.addEventListener('click', async () => {
      const text = (commentInput.value || '').trim();
      if (!text) return;
      addCommentBtn.disabled = true;
      try {
        await window.GCP.apiFetch('/tp/comments', {
          method: 'POST',
          body: JSON.stringify({ eventId, sectionId, commentText: text })
        });
        commentInput.value = '';
        await loadComments();
      } catch(e) {
        msg.textContent = e.message || 'Could not post comment';
      } finally {
        addCommentBtn.disabled = false;
      }
    });
    // Post on Ctrl+Enter
    commentInput.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addCommentBtn.click(); }
    });
  }

  try{
    await load();
    await loadFiles();
    await loadComments();
  }catch(err){
    msg.textContent = err.message || "Failed to load editor";
  }
})();
