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

  const btnSave = document.getElementById("btnSave");
  const btnSubmit = document.getElementById("btnSubmit");
  const btnApprove = document.getElementById("btnApprove");
  const btnReturn = document.getElementById("btnReturn");

  function setStatus(status){
    statusEl.innerHTML = `<span class="pill ${status}">${status.replaceAll("_"," ")}</span>`;
  }

  if (!eventId || !countryId || !sectionId){
    msg.textContent = "Missing eventId/countryId/sectionId in URL.";
    return;
  }

  // Buttons visible depending on role (Blueprint editor behaviour)
  const canEdit = ["admin","chairman","supervisor","collaborator"].includes(role);
  const isViewer = role === "viewer";
  const isProtocol = role === "protocol";

  if (isProtocol){
    msg.textContent = "Protocol role cannot edit Talking Points.";
    btnSave.disabled = btnSubmit.disabled = btnApprove.disabled = btnReturn.disabled = true;
    return;
  }

  // Approve button depends on role
  if (!(role === "supervisor" || role === "chairman" || role === "admin")){
    btnApprove.style.display = "none";
    btnReturn.style.display = "none";
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
    const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}&section_id=${encodeURIComponent(sectionId)}`, { method:"GET" });

    meta.innerHTML = `
      <div><b>Event:</b> ${window.GCP.escapeHtml(tp.eventTitle)}</div>
      <div><b>Country:</b> ${window.GCP.escapeHtml(tp.countryName)}</div>
      <div><b>Section:</b> ${window.GCP.escapeHtml(tp.sectionLabel)}</div>
      <div class="small muted">Last updated: ${tp.lastUpdatedAt ? window.GCP.escapeHtml(tp.lastUpdatedAt) : '—'} ${tp.lastUpdatedBy ? '• ' + window.GCP.escapeHtml(tp.lastUpdatedBy) : ''}</div>
      ${tp.statusComment ? `<div class="small"><b>Return comment:</b> ${window.GCP.escapeHtml(tp.statusComment)}</div>` : ''}
    `;
    setStatus(tp.status || "draft");

    const textarea = document.getElementById("editor");
    textarea.value = tp.htmlContent || "";

    if (window.CKEDITOR){
      if (editorInstance) editorInstance.destroy(true);
      editorInstance = window.CKEDITOR.replace("editor", { height: 420 });
      if (!canEdit) editorInstance.setReadOnly(true);
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
    try{
      await window.GCP.apiFetch("/tp/save", {
        method:"POST",
        body: JSON.stringify({ eventId, countryId, sectionId, htmlContent: getHtml() })
      });
      await load();
      msg.textContent = "Saved.";
    }catch(err){
      msg.textContent = err.message || "Save failed";
    }
  });

  btnSubmit.addEventListener("click", async () => {
    try{
      await window.GCP.apiFetch("/tp/submit", {
        method:"POST",
        body: JSON.stringify({ eventId, countryId, sectionId })
      });
      await load();
      msg.textContent = "Submitted.";
    }catch(err){
      msg.textContent = err.message || "Submit failed";
    }
  });

  btnApprove.addEventListener("click", async () => {
    try{
      if (role === "chairman"){
        await window.GCP.apiFetch("/tp/approve-section-chairman", {
          method:"POST",
          body: JSON.stringify({ eventId, countryId, sectionId })
        });
      } else {
        await window.GCP.apiFetch("/tp/approve-section", {
          method:"POST",
          body: JSON.stringify({ eventId, countryId, sectionId })
        });
      }
      await load();
      msg.textContent = "Approved.";
    }catch(err){
      msg.textContent = err.message || "Approve failed";
    }
  });

  btnReturn.addEventListener("click", async () => {
    const comment = prompt("Return comment (required):", "");
    if (comment === null) return;
    try{
      await window.GCP.apiFetch("/tp/return", {
        method:"POST",
        body: JSON.stringify({ eventId, countryId, sectionId, comment })
      });
      await load();
      msg.textContent = "Returned.";
    }catch(err){
      msg.textContent = err.message || "Return failed";
    }
  });

  try{
    await load();
  }catch(err){
    msg.textContent = err.message || "Failed to load editor";
  }
})();
