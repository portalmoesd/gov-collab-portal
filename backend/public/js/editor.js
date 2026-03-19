// editor.js

// ── Comment float card styles ──────────────────────────────────────────────
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

  const actionButtons = [btnSave, btnSubmit, btnApprove, btnReturn];

  function showMsg(text, isError) {
    msg.textContent = text;
    msg.className = 'small editor-msg' + (text ? (isError ? ' editor-msg--error' : ' editor-msg--success') : '');
  }

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
      submitted_to_deputy: 'Submitted to Deputy',
      returned_by_deputy: 'Returned by Deputy',
      approved_by_deputy: 'Approved by Deputy',
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
    showMsg("Missing eventId/sectionId in URL.", true);
    return;
  }

  const isViewer = role === "viewer";
  const isProtocol = role === "protocol";

  if (isProtocol){
    showMsg("Protocol role cannot edit Talking Points.", true);
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
    if (role === 'collaborator_2')     return ['submitted_to_collaborator_2','returned_by_collaborator_2'].includes(s) || rtr === 'collaborator_2' || s === 'draft' || s.startsWith('returned_');
    if (role === 'collaborator_3')     return ['submitted_to_collaborator_3','returned_by_collaborator_3','approved_by_collaborator_2','submitted_to_collaborator_2','returned_by_collaborator_2'].includes(s) || rtr === 'collaborator_3' || s === 'draft' || s.startsWith('returned_');
    if (role === 'collaborator')       return ['submitted_to_collaborator','returned_by_collaborator','approved_by_collaborator_2','approved_by_collaborator_3'].includes(s) || rtr === 'collaborator' || s === 'draft';
    if (role === 'super_collaborator') return [
      'submitted_to_super_collaborator','returned_by_super_collaborator','approved_by_collaborator',
      'submitted_to_collaborator','returned_by_collaborator','approved_by_collaborator_3',
      'submitted_to_collaborator_2','returned_by_collaborator_2','approved_by_collaborator_2',
      'submitted_to_collaborator_3','returned_by_collaborator_3',
    ].includes(s) || rtr === 'super_collaborator' || s === 'draft';
    return true; // supervisor / deputy / minister / admin always active
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
      // Exception: deputy/minister who IS the document submitter (final approver) can act
      // even after they've approved (section has moved past their stage).
      const isApprovedState = s.startsWith('approved_by_') || s === 'approved' || s === 'locked';
      if ((role === 'deputy' || role === 'minister') && isApprovedState) {
        const docSubmitter = String(tp.documentSubmitterRole || '').toLowerCase();
        const isApprovedByMe = (role === 'deputy' && s === 'approved_by_deputy') ||
                               (role === 'minister' && s === 'approved_by_minister');
        if (docSubmitter === role && isApprovedByMe) {
          if (btnSave)    btnSave.style.display    = "";
          if (btnApprove) btnApprove.style.display = "";
          if (btnReturn)  btnReturn.style.display  = "";
          if (btnUpload)  btnUpload.style.display  = "";
          return;
        }
      }
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
      if (btnUpload)  btnUpload.style.display  = "";
    } else if (['supervisor','deputy','minister','admin'].includes(role)) {
      const isApprovedState = s.startsWith('approved_by_') || s === 'approved' || s === 'locked';
      if ((role === 'deputy' || role === 'minister') && isApprovedState) {
        // After approval: full editing if this user is the document submitter (final approver), else Ask to Return
        const docSubmitter = String(tp.documentSubmitterRole || '').toLowerCase();
        const isApprovedByMe = (role === 'deputy' && s === 'approved_by_deputy') ||
                               (role === 'minister' && s === 'approved_by_minister');
        if (docSubmitter === role && isApprovedByMe) {
          if (btnSave)    btnSave.style.display    = "";
          if (btnApprove) btnApprove.style.display = "";
          if (btnReturn)  btnReturn.style.display  = "";
          if (btnUpload)  btnUpload.style.display  = "";
        } else {
          if (btnAskToReturn) btnAskToReturn.style.display = "";
        }
      } else {
        if (btnSave)    btnSave.style.display    = "";
        if (btnApprove) btnApprove.style.display = "";
        if (btnReturn)  btnReturn.style.display  = "";
        if (btnUpload)  btnUpload.style.display  = "";
      }
    } else {
      if (btnSave) btnSave.style.display = "";
    }

    // Highlight first visible button
    const firstVisible = actionButtons.find((btn) => btn && btn.style.display !== 'none');
    actionButtons.forEach((btn) => btn && btn.classList.remove('is-expanded'));
    if (firstVisible) firstVisible.classList.add('is-expanded');
  }

  function initSectionLabelEdit(currentLabel) {
    const pill = document.getElementById('sectionLabelPill');
    if (!pill || isViewer || isProtocol) return;
    pill.addEventListener('click', function handler() {
      if (pill.querySelector('input')) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'editor-meta-pill-input';
      input.value = currentLabel;
      pill.textContent = '';
      pill.appendChild(input);
      input.focus();
      input.select();

      async function save() {
        const val = input.value.trim();
        if (!val || val === currentLabel) {
          pill.textContent = currentLabel;
          return;
        }
        pill.textContent = val;
        try {
          await window.GCP.apiFetch('/tp/section-label', {
            method: 'PATCH',
            body: JSON.stringify({ eventId, sectionId, label: val })
          });
          currentLabel = val;
          showMsg('Section title updated.');
        } catch(e) {
          pill.textContent = currentLabel;
          showMsg(e.message || 'Failed to rename section', true);
        }
      }
      input.addEventListener('blur', save);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
      });
    });
  }

  async function load(){
    showMsg('');
    const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`, { method:"GET" });

    if (taskTitleEl) taskTitleEl.textContent = tp.eventTitle || 'Untitled task';
    meta.innerHTML = `
      <span class="editor-meta-pill">${window.GCP.escapeHtml(tp.countryName || 'Unknown country')}</span>
    `;
    const sectionLabelRow = document.getElementById('sectionLabelRow');
    if (sectionLabelRow) {
      sectionLabelRow.innerHTML = `<span class="editor-section-label-pill" id="sectionLabelPill" title="Click to rename section">${window.GCP.escapeHtml(tp.sectionLabel || 'Unknown section')}</span>`;
      initSectionLabelEdit(tp.sectionLabel || '');
    }

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
        richEditorInstance = window.GCP.RichEditor({
          container: editorFrame,
          initialHtml: tp.htmlContent || '',
          authorName: me.fullName || me.username || 'Unknown',
          sectionTitle: tp.sectionLabel || '',
          onCommentsClick: toggleCommentsPanel,
          onDeleteComment: handleDeleteComment,
          onReplyComment: handleReplyComment,
        });
      }
      if (richEditorInstance && richEditorInstance.el){
        richEditorInstance.el.contentEditable = canEdit ? 'true' : 'false';
      }
    } else if (textarea){
      textarea.disabled = !canEdit;
    }
    return tp;
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
      showMsg("Saved.");
    }catch(err){
      showMsg(err.message || "Save failed", true);
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
      const tp = await load();
      const submitMsgMap = {
        submitted_to_collaborator_2: "Submitted to Head Collaborator.",
        submitted_to_collaborator_3: "Submitted to Curator.",
        submitted_to_collaborator: "Submitted to Collaborator.",
        submitted_to_super_collaborator: "Submitted to Super-collaborator.",
        submitted_to_supervisor: "Submitted to Supervisor.",
        submitted_to_deputy: "Submitted to Deputy.",
        submitted_to_minister: "Submitted to Minister.",
      };
      showMsg(submitMsgMap[String(tp.status || '').toLowerCase()] || "Submitted.");
    }catch(err){
      showMsg(err.message || "Submit failed", true);
    } finally {
      setActionLoading(btnSubmit, false);
    }
  });

  if (btnApprove) btnApprove.addEventListener("click", async () => {
    setActionLoading(btnApprove, true);
    try{
      if (role === "deputy" || role === "minister"){
        await window.GCP.apiFetch("/tp/approve-section-deputy", {
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
      showMsg("Approved.");
    }catch(err){
      showMsg(err.message || "Approve failed", true);
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
      showMsg("Returned.");
    }catch(err){
      showMsg(err.message || "Return failed", true);
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
      showMsg("Return request sent.");
    } catch(err) {
      showMsg(err.message || "Failed to send return request.", true);
    } finally {
      btnAskToReturn.disabled = false;
    }
  });

  // ---- Modal ----
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalContent = document.getElementById("modalContent");
  const closeModalBtn = document.getElementById("closeModalBtn");

  function openModal(html){
    modalContent.innerHTML = html;
    modalBackdrop.style.display = "flex";
  }
  function closeModal(){
    modalBackdrop.style.display = "none";
    modalContent.innerHTML = "";
  }
  if(closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
  if(modalBackdrop) modalBackdrop.addEventListener("click", (e) => { if(e.target === modalBackdrop) closeModal(); });

  // ---- File upload ----
  const fileInput = document.getElementById('fileInput');
  const filesSection = document.getElementById('filesSection');
  const btnUploadedFiles = document.getElementById('btnUploadedFiles');
  const uploadedFilesCount = document.getElementById('uploadedFilesCount');
  let cachedFiles = [];

  function renderFilesList(files){
    if(filesSection) filesSection.style.display='none';
  }

  function updateUploadedFilesBtn(){
    if(!btnUploadedFiles) return;
    if(cachedFiles.length){
      btnUploadedFiles.style.display = '';
      if(uploadedFilesCount) uploadedFilesCount.textContent = cachedFiles.length;
    } else {
      btnUploadedFiles.style.display = 'none';
    }
  }

  async function loadFiles(){
    try{
      const data = await window.GCP.apiFetch(`/tp/files?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`,{method:'GET'});
      cachedFiles = data.files || [];
      renderFilesList(cachedFiles);
      updateUploadedFilesBtn();
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
        showMsg(`${files.length} file(s) uploaded.`);
      }catch(err){
        showMsg(err.message || 'Upload failed', true);
      } finally {
        btnUpload.disabled = false;
      }
    });
  }

  // ---- Uploaded Files modal ----
  if(btnUploadedFiles){
    btnUploadedFiles.addEventListener('click', () => {
      if(!cachedFiles.length){
        openModal(`<h2 style="margin:0 0 12px;">Uploaded Files</h2><p class="muted">No files uploaded yet.</p>`);
        return;
      }
      function fmtDDMMYYYY(s){
        if(!s) return '—';
        try{ const d=new Date(s); return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear(); }catch{ return String(s); }
      }
      const rows = cachedFiles.map(f => {
        const safeName = window.GCP.escapeHtml(f.filename);
        const sizeStr = f.size ? Math.ceil(f.size/1024)+' KB' : '';
        const dateStr = fmtDDMMYYYY(f.uploadedAt);
        const uploader = window.GCP.escapeHtml(f.uploadedBy || '—');
        return `<tr>
          <td><button class="event-file-download" data-filename="${safeName}">${safeName}</button></td>
          <td class="small">${dateStr}</td>
          <td class="small">${uploader}</td>
          <td class="small muted">${sizeStr}</td>
        </tr>`;
      }).join('');

      openModal(`
        <h2 style="margin:0 0 12px;">Uploaded Files</h2>
        <div style="overflow:auto; max-height:60vh;">
          <table class="event-files-table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; padding:8px 10px; border-bottom:2px solid var(--border); font-size:13px;">File Name</th>
                <th style="text-align:left; padding:8px 10px; border-bottom:2px solid var(--border); font-size:13px;">Date</th>
                <th style="text-align:left; padding:8px 10px; border-bottom:2px solid var(--border); font-size:13px;">Uploaded By</th>
                <th style="text-align:left; padding:8px 10px; border-bottom:2px solid var(--border); font-size:13px;">Size</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `);

      // Wire download buttons
      modalContent.querySelectorAll('.event-file-download').forEach(btn => {
        btn.addEventListener('click', async () => {
          const fname = btn.dataset.filename;
          try {
            const token = localStorage.getItem('gcp_token');
            const res = await fetch(`/api/tp/files/download?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}&filename=${encodeURIComponent(fname)}`, {
              headers: token ? { 'Authorization': 'Bearer '+token } : {}
            });
            if(!res.ok) throw new Error('Download failed ('+res.status+')');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fname;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
          } catch(e) {
            showMsg(e.message || 'Download failed', true);
          }
        });
      });
    });
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  function cmtGetInitials(name) {
    return (name || '').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(s => s[0] && s[0].toUpperCase()).filter(Boolean).join('') || '?';
  }
  function cmtAuthorColor(name) {
    const p = ['#1d4ed8','#b91c1c','#15803d','#7c3aed','#c2410c','#0f766e','#9d174d','#3730a3'];
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h*31+name.charCodeAt(i))>>>0;
    return p[h % p.length];
  }

  async function handleDeleteComment(commentId, anchorId) {
    try {
      await window.GCP.apiFetch(`/tp/comments/${commentId}`, { method: 'DELETE' });
      // Refresh storedComments BEFORE removing the anchor from the DOM.
      // Removing the anchor triggers the MutationObserver → checkOrphanedComments,
      // which would fire a second delete call if storedComments still has this comment.
      await loadComments();
      if (anchorId && richEditorInstance) richEditorInstance.removeCommentAnchor(anchorId);
    } catch(e) { showMsg(e.message || 'Could not delete comment', true); }
  }

  async function handleReplyComment(parentId, text) {
    try {
      await window.GCP.apiFetch('/tp/comments', {
        method: 'POST',
        body: JSON.stringify({ eventId, sectionId, commentText: text, parentId })
      });
      await loadComments();
    } catch(e) { showMsg(e.message || 'Could not post reply', true); }
  }

  async function loadComments() {
    if (!eventId || !sectionId) return;
    try {
      const data = await window.GCP.apiFetch(
        `/tp/comments?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`,
        { method: 'GET' }
      );
      const comments = data.comments || [];
      if (richEditorInstance) richEditorInstance.setComments(comments);
    } catch(_) {}
  }

  // Floating comment-input card (position:fixed, outside the editor card)
  let _cmtFloat = null;

  function closeCmtFloat() {
    if (!_cmtFloat) return;
    const oldAnchor = _cmtFloat._anchorId;
    _cmtFloat.remove(); _cmtFloat = null;
    if (oldAnchor && richEditorInstance) richEditorInstance.removeCommentAnchor(oldAnchor);
    if (richEditorInstance) richEditorInstance.setCommentsActive(false);
  }

  function toggleCommentsPanel(anchorId) {
    if (_cmtFloat) { closeCmtFloat(); return; }

    const myColor    = cmtAuthorColor(me.fullName || me.username || '');
    const myInitials = cmtGetInitials(me.fullName || me.username || '');
    const card = document.createElement('div');
    card.className = 'gcp-cmt-float';
    card._anchorId  = anchorId;
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
    if (richEditorInstance) richEditorInstance.setCommentsActive(true);

    // Position: near the anchor text, clamped to viewport
    requestAnimationFrame(() => {
      const CARD_W = 292, CARD_H = 200, PAD = 12;
      let top = 120, left = window.innerWidth - CARD_W - PAD;

      if (anchorId && richEditorInstance) {
        const anchor = richEditorInstance.el.querySelector(`[data-cmt-anchor-id="${anchorId}"]`);
        if (anchor) {
          const aRect = anchor.getBoundingClientRect();
          // Prefer placing below the anchor; fall back to above if too close to bottom
          top = aRect.bottom + 6;
          if (top + CARD_H > window.innerHeight - PAD) top = Math.max(aRect.top - CARD_H - 6, PAD);
          left = Math.min(Math.max(aRect.left, PAD), window.innerWidth - CARD_W - PAD);
        }
      } else {
        const editorFrame = document.getElementById('editorFrame');
        const frameRect = editorFrame ? editorFrame.getBoundingClientRect() : null;
        if (frameRect) {
          top  = frameRect.top + 60;
          left = Math.min(frameRect.right + PAD, window.innerWidth - CARD_W - PAD);
        }
      }
      card.style.top  = top  + 'px';
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
        card.remove(); _cmtFloat = null;
        if (richEditorInstance) richEditorInstance.setCommentsActive(false);
        await loadComments();
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
  }

  // Close float when clicking outside it
  document.addEventListener('mousedown', e => {
    if (_cmtFloat && !_cmtFloat.contains(e.target)) closeCmtFloat();
  });

  try{
    await load();
    await loadFiles();
    await loadComments();
  }catch(err){
    showMsg(err.message || "Failed to load editor", true);
  }
})();
