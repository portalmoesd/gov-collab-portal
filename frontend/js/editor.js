// editor.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const qs = window.GCP.qs();
  const eventId = qs.eventId || qs.event_id;
  const countryId = qs.countryId || qs.country_id || null;
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

  function formatUpdatedAt(value){
    const raw = String(value || '').trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return `${m[4]}:${m[5]} ${m[3]}.${m[2]}.${m[1]}`;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())){
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2,'0');
      const mi = String(d.getMinutes()).padStart(2,'0');
      return `${hh}:${mi} ${dd}.${mm}.${yyyy}`;
    }
    return raw || '—';
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
    const pretty = String(status || 'draft').replaceAll('_',' ');
    statusEl.innerHTML = `<span class="pill pill-status ${status}">${pretty}</span>`;
  }

  if (!eventId || !sectionId){
    msg.textContent = "Missing eventId/sectionId in URL.";
    return;
  }

  // Buttons visible depending on role (Blueprint editor behaviour)
  const canEdit = ["admin","chairman","minister","supervisor","collaborator_1","collaborator_2","collaborator","super_collaborator"].includes(role);
  const isViewer = role === "viewer";
  const isProtocol = role === "protocol";

  if (isProtocol){
    msg.textContent = "Protocol role cannot edit Talking Points.";
    btnSave.disabled = btnSubmit.disabled = btnApprove.disabled = btnReturn.disabled = true;
    return;
  }

  // Approve/Return buttons depend on role
  if (!(role === "supervisor" || role === "chairman" || role === "minister" || role === "admin")){
    btnApprove.style.display = "none";
  }
  if (!(role === "collaborator_2" || role === "supervisor" || role === "chairman" || role === "minister" || role === "admin")){
    btnReturn.style.display = "none";
  }

  // Submit is only for collaborators (they submit their draft for review)
  if (!(role === "collaborator_1" || role === "collaborator_2" || role === "collaborator" || role === "super_collaborator")){
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

    if (taskTitleEl) taskTitleEl.textContent = tp.eventTitle || 'Untitled task';
    meta.innerHTML = `
      <span class="editor-meta-pill">${window.GCP.escapeHtml(tp.countryName || 'Unknown country')}</span>
      <span class="editor-meta-pill">${window.GCP.escapeHtml(tp.sectionLabel || 'Unknown section')}</span>
    `;
    if (lastUpdatedEl){
      const updatedAt = tp.lastUpdatedAt ? window.GCP.escapeHtml(formatUpdatedAt(tp.lastUpdatedAt)) : '—';
      const updatedBy = tp.lastUpdatedBy ? window.GCP.escapeHtml(tp.lastUpdatedBy) : 'No editor recorded yet';
      lastUpdatedEl.innerHTML = `<span>Last updated · ${updatedAt}</span><span>· ${updatedBy}</span>`;
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
    const firstVisible = actionButtons.find((btn) => btn && btn.style.display !== 'none');
    actionButtons.forEach((btn) => btn && btn.classList.remove('is-expanded'));
    if (firstVisible) firstVisible.classList.add('is-expanded');

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
      msg.textContent = role === "collaborator_1" ? "Submitted to Collaborator II." : role === "collaborator_2" ? "Submitted to Collaborator." : role === "super_collaborator" ? "Submitted to Supervisor." : "Submitted to Super-collaborator.";
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
