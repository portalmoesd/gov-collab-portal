// editor.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const qs = window.GCP.qs();
  const eventId = Number(qs.event_id || qs.eventId);
  const sectionId = Number(qs.section_id || qs.sectionId);

  const msg = document.getElementById("msg");
  const meta = document.getElementById("meta");
  const statusEl = document.getElementById("statusEl");
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
  const map = {
    draft: "draft",
    submitted: "submitted",
    returned: "returned",
    approved_by_supervisor: "approved by supervisor",
    approved_by_chairman: "approved by deputy",
    approved_by_minister: "approved by minister"
  };
  const label = map[status] || String(status).replaceAll("_"," ");
  statusEl.innerHTML = `<span class="pill ${status}">${window.GCP.escapeHtml(label)}</span>`;
}

  if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)){
    msg.textContent = "Missing event_id and/or section_id in URL.";
    return;
  }

  // Buttons visible depending on role (Blueprint editor behaviour)
  const canEdit = ["admin","chairman","minister","supervisor","collaborator","super_collaborator"].includes(role);
  const isViewer = role === "viewer";
  const isProtocol = role === "protocol";

  if (isProtocol){
    msg.textContent = "Protocol role cannot edit Talking Points.";
    btnSave.disabled = btnSubmit.disabled = btnApprove.disabled = btnReturn.disabled = true;
    return;
  }

  // Approve button depends on role
  if (!(role === "supervisor" || role === "chairman" || role === "minister" || role === "admin")){
    btnApprove.style.display = "none";
    btnReturn.style.display = "none";
  }

  // Submit is only for collaborators (they submit their draft for review)
  if (!(role === "collaborator" || role === "super_collaborator")){
    btnSubmit.style.display = "none";
  }
  if (isViewer){
    btnSave.style.display = "none";
    btnSubmit.style.display = "none";
    btnApprove.style.display = "none";
    btnReturn.style.display = "none";
  }

  let editorInstance = null;

  async function load(){
    msg.textContent = "";
    const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`, { method:"GET" });

    meta.innerHTML = `
      <div class="editor-meta-card">
        <div class="editor-meta-label">Event</div>
        <div class="editor-meta-value">${window.GCP.escapeHtml(tp.eventTitle)}</div>
      </div>
      <div class="editor-meta-card">
        <div class="editor-meta-label">Country</div>
        <div class="editor-meta-value">${window.GCP.escapeHtml(tp.countryName)}</div>
      </div>
      <div class="editor-meta-card">
        <div class="editor-meta-label">Section</div>
        <div class="editor-meta-value">${window.GCP.escapeHtml(tp.sectionLabel)}</div>
      </div>
      <div class="editor-meta-card editor-meta-card--update">
        <div class="editor-meta-label">Last updated</div>
        <div class="editor-meta-value">${tp.lastUpdatedAt ? window.GCP.escapeHtml(tp.lastUpdatedAt) : '—'}</div>
        <div class="editor-meta-note">${tp.lastUpdatedBy ? window.GCP.escapeHtml(tp.lastUpdatedBy) : 'No editor recorded yet'}</div>
      </div>
    `;

    // Show supervisor/deputy return comment prominently (if any)
    if (returnCommentBox){
      const note = (tp.statusComment || '').trim();
      if (note){
        returnCommentBox.style.display = 'block';
        returnCommentBox.innerHTML = `<b>Supervisor/Deputy comment:</b> ${window.GCP.escapeHtml(note)}`;
      } else {
        returnCommentBox.style.display = 'none';
        returnCommentBox.textContent = '';
      }
    }
    setStatus(tp.status || "draft");

    const textarea = document.getElementById("editor");
    textarea.value = tp.htmlContent || "";

    if (window.CKEDITOR){
      if (editorInstance) editorInstance.destroy(true);
      editorInstance = window.CKEDITOR.replace("editor", { height: 420 });
      if (!canEdit && editorInstance && typeof editorInstance.setReadOnly === 'function') editorInstance.setReadOnly(true);
    } else {
      // Fallback: plain textarea
      textarea.disabled = !canEdit;
    }
  }

  function getHtml(){
    if (editorInstance) return editorInstance.getData();
    return document.getElementById("editor").value;
  }

  btnSave.addEventListener("click", async () => {
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

  btnSubmit.addEventListener("click", async () => {
    setActionLoading(btnSubmit, true);
    try{
      await window.GCP.apiFetch("/tp/submit", {
        method:"POST",
        body: JSON.stringify({ eventId, sectionId, htmlContent: getHtml() })
      });
      await load();
      msg.textContent = "Submitted.";
    }catch(err){
      msg.textContent = err.message || "Submit failed";
    } finally {
      setActionLoading(btnSubmit, false);
    }
  });

  btnApprove.addEventListener("click", async () => {
    setActionLoading(btnApprove, true);
    try{
      if (role === "chairman" || role === "minister"){
        await window.GCP.apiFetch("/tp/approve-section-chairman", {
          method:"POST",
          body: JSON.stringify({ eventId, sectionId, htmlContent: getHtml() })
        });
      } else {
        await window.GCP.apiFetch("/tp/approve-section", {
          method:"POST",
          body: JSON.stringify({ eventId, sectionId, htmlContent: getHtml() })
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

  btnReturn.addEventListener("click", async () => {
    const comment = prompt("Return comment (required):", "");
    if (comment === null) return;
    setActionLoading(btnReturn, true);
    try{
      await window.GCP.apiFetch("/tp/return", {
        method:"POST",
        body: JSON.stringify({ eventId, sectionId, note: comment })
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
