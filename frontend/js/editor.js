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
    const pretty = String(status || 'draft').replaceAll('_',' ');
    statusEl.innerHTML = `<span class="pill pill-status ${status}">${pretty}</span>`;
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

  // Initially hide dynamic buttons; applyButtonRules() sets them correctly after load
  if (btnSubmit) btnSubmit.style.display = "none";
  if (btnApprove) btnApprove.style.display = "none";
  if (btnReturn) btnReturn.style.display = "none";
  if (isViewer) { if(btnSave) btnSave.style.display = "none"; }

  let editorInstance = null;
  let richEditorInstance = null;

  function applyButtonRules(tp){
    const s = String(tp.status || 'draft').toLowerCase();

    // Reset all
    actionButtons.forEach(b => b && (b.style.display = "none"));
    if (isViewer) return;

    if (role === 'collaborator_1') {
      if (btnSave) btnSave.style.display = "";
      if (btnSubmit) btnSubmit.style.display = "";
    } else if (role === 'collaborator_2') {
      if (btnSave) btnSave.style.display = "";
      if (btnSubmit) btnSubmit.style.display = "";
      const canReturn = ['submitted_to_collaborator_2', 'returned_by_collaborator_2'].includes(s);
      if (btnReturn) btnReturn.style.display = canReturn ? "" : "none";
    } else if (role === 'collaborator') {
      if (btnSave) btnSave.style.display = "";
      if (btnSubmit) btnSubmit.style.display = "";
      // Return only if section came from lower tiers
      const canReturn = ['submitted_to_collaborator', 'returned_by_collaborator'].includes(s);
      if (btnReturn) btnReturn.style.display = canReturn ? "" : "none";
    } else if (role === 'super_collaborator') {
      if (btnSave) btnSave.style.display = "";
      if (btnApprove) btnApprove.style.display = "";
      if (btnReturn) btnReturn.style.display = "";
    } else if (['supervisor','chairman','minister','admin'].includes(role)) {
      if (btnSave) btnSave.style.display = "";
      if (btnApprove) btnApprove.style.display = "";
      if (btnReturn) btnReturn.style.display = "";
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

    // Only show last-updated when a real user has made a meaningful update
    if (lastUpdatedEl){
      if (tp.lastUpdatedBy && tp.lastUpdatedAt) {
        const updatedAt = window.GCP.escapeHtml(window.GCP.formatDateTime(tp.lastUpdatedAt));
        const updatedBy = window.GCP.escapeHtml(tp.lastUpdatedBy);
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
        richEditorInstance = window.GCP.RichEditor({ container: editorFrame, initialHtml: tp.htmlContent || '' });
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
        collaborator_1: "Submitted to Collaborator II.",
        collaborator_2: "Submitted to Collaborator.",
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
    const comment = prompt("Return comment (required):", "");
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

  // ---- File upload ----
  const btnUpload = document.getElementById('btnUpload');
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

  try{
    await load();
    await loadFiles();
  }catch(err){
    msg.textContent = err.message || "Failed to load editor";
  }
})();
