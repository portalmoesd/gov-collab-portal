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
  const editorFrame = document.getElementById("editorFrame");

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

  if (btnSubmit) btnSubmit.style.display = "none";
  if (btnApprove) btnApprove.style.display = "none";
  if (btnReturn) btnReturn.style.display = "none";
  if (isViewer) { if(btnSave) btnSave.style.display = "none"; }

  // Rich editor instance
  let richEditor = null;

  function initRichEditor(html, readOnly) {
    if (richEditor) { richEditor.destroy(); richEditor = null; }
    if (!editorFrame) return;
    richEditor = window.GCP.RichEditor({
      container: editorFrame,
      initialHtml: html || '',
      placeholder: 'Start typing your talking points…',
    });
    if (readOnly && richEditor.el) {
      richEditor.el.contentEditable = 'false';
      richEditor.el.style.background = 'transparent';
      richEditor.el.style.cursor = 'default';
    }
  }

  function applyButtonRules(tp){
    const s = String(tp.status || 'draft').toLowerCase();
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

    const canEdit = !isViewer && !isProtocol;
    initRichEditor(tp.htmlContent || '', !canEdit);
  }

  function getHtml(){
    return richEditor ? richEditor.getHtml() : '';
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

  try{
    await load();
  }catch(err){
    msg.textContent = err.message || "Failed to load editor";
  }
})();
