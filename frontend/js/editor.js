// editor.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const qs = window.GCP.qs();
  const eventId = qs.eventId;
  const countryId = qs.countryId;
  const sectionId = qs.sectionId;

  const msg = document.getElementById("msg");
  const meta = document.getElementById("meta");
  const statusEl = document.getElementById("statusEl");
  const returnCommentBox = document.getElementById("returnCommentBox");

  const btnSave = document.getElementById("btnSave");
  const btnSubmit = document.getElementById("btnSubmit");
  const btnApprove = document.getElementById("btnApprove");
  const btnReturn = document.getElementById("btnReturn");

  const actionButtons = [btnSave, btnSubmit, btnApprove, btnReturn];

  function getStatusTone(status){
    const value = String(status || "draft").toLowerCase();
    if (value.includes("return")) return "return";
    if (value.includes("approve") || value.includes("approved")) return "approve";
    if (value.includes("submit") || value.includes("review") || value.includes("deputy") || value.includes("minister") || value.includes("supervisor")) return "submit";
    return "draft";
  }

  function syncDefaultExpandedAction(){
    actionButtons.forEach((btn) => btn && btn.classList.remove("is-default-expanded"));
    const firstVisible = actionButtons.find((btn) => btn && btn.style.display !== "none");
    if (firstVisible) firstVisible.classList.add("is-default-expanded");
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
    const tone = getStatusTone(status);
    statusEl.innerHTML = `<span class="pill pill--${tone}">${status.replaceAll("_"," ")}</span>`;
  }

  if (!eventId || !countryId || !sectionId){
    msg.textContent = "Missing eventId/countryId/sectionId in URL.";
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

  syncDefaultExpandedAction();

  let editorInstance = null;

  async function load(){
    msg.textContent = "";
    const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}&section_id=${encodeURIComponent(sectionId)}`, { method:"GET" });

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
    syncDefaultExpandedAction();

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
        body: JSON.stringify({ eventId, countryId, sectionId, htmlContent: getHtml() })
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
        body: JSON.stringify({ eventId, countryId, sectionId, htmlContent: getHtml() })
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
      if (role === "chairman"){
        await window.GCP.apiFetch("/tp/approve-section-chairman", {
          method:"POST",
          body: JSON.stringify({ eventId, countryId, sectionId, htmlContent: getHtml() })
        });
      } else {
        await window.GCP.apiFetch("/tp/approve-section", {
          method:"POST",
          body: JSON.stringify({ eventId, countryId, sectionId, htmlContent: getHtml() })
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
        body: JSON.stringify({ eventId, countryId, sectionId, comment })
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
