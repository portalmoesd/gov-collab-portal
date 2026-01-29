// dashboard-supervisor.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role || "").toLowerCase();
  if (!["supervisor","admin"].includes(role)){
    document.querySelector(".main").innerHTML = "<div class='card'>Access denied.</div>";
    return;
  }

  const eventSelect = document.getElementById("eventSelect");
  const sectionsTbody = document.getElementById("sectionsTbody");
  const docStatusBox = document.getElementById("docStatusBox");
  const submitDocBtn = document.getElementById("submitDocBtn");
  const previewFullBtn = document.getElementById("previewFullBtn");
  const msg = document.getElementById("msg");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalContent = document.getElementById("modalContent");
  const modalCloseBtn = document.getElementById("modalCloseBtn");

  function openModal(html){
    modalContent.innerHTML = html;
    modalBackdrop.style.display = "flex";
  }
  function closeModal(){
    modalBackdrop.style.display = "none";
    modalContent.innerHTML = "";
  }
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });

  function pill(status){
    return `<span class="pill ${status}">${window.GCP.statusLabel ? window.GCP.statusLabel(status) : String(status||"")}</span>`;
  }

  function fmtDateTime(s){
    return window.GCP.formatDateTime ? window.GCP.formatDateTime(s) : (s ? String(s) : "");
  }
  function fmtDate(s){
    return window.GCP.formatDateOnly ? window.GCP.formatDateOnly(s) : (s ? String(s) : "");
  }

  async function loadEvents(){
    const events = await window.GCP.apiFetch("/events/upcoming", { method:"GET" });
    eventSelect.innerHTML = `<option value="">Select event</option>` + events.map(ev =>
      `<option value="${ev.id}">${window.GCP.escapeHtml(ev.title)}${ev.deadline_date ? " • " + window.GCP.escapeHtml(fmtDate(ev.deadline_date)) : ""}</option>`
    ).join("");
  }

  async function refresh(){
    msg.textContent = "";
    sectionsTbody.innerHTML = "";
    docStatusBox.innerHTML = "";

    const eventId = eventSelect.value;
    if (!eventId){
      msg.textContent = "Please choose an event.";
      return;
    }

    const grid = await window.GCP.apiFetch(`/tp/status-grid?event_id=${encodeURIComponent(eventId)}`, { method:"GET" });

    sectionsTbody.innerHTML = "";
    for (const row of (grid.rows || [])){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(row.section_label)}</td>
        <td>${pill(row.status)}</td>
        <td>${row.last_updated_at ? window.GCP.escapeHtml(fmtDateTime(row.last_updated_at)) : '<span class="muted">—</span>'}</td>
        <td>${row.last_updated_by ? window.GCP.escapeHtml(row.last_updated_by) : '<span class="muted">—</span>'}</td>
        <td><button class="btn" data-act="edit">Open</button></td>
      `;
      tr.querySelector('[data-act="edit"]').addEventListener("click", () => {
        location.href = `editor.html?eventId=${encodeURIComponent(eventId)}&sectionId=${encodeURIComponent(row.section_id)}`;
      });
      sectionsTbody.appendChild(tr);
    }

    const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(eventId)}`, { method:"GET" });
    docStatusBox.innerHTML = `
      <div style="font-weight:900; margin-bottom:8px;">Document status</div>
      <div class="row">
        <div>${pill(ds.status || "draft")}</div>
        <div class="muted">Last updated: ${ds.updated_at ? window.GCP.escapeHtml(fmtDateTime(ds.updated_at)) : "—"}</div>
      </div>
      ${ds.chairman_comment ? `<div style="margin-top:8px;"><b>Deputy comment:</b> ${window.GCP.escapeHtml(ds.chairman_comment)}</div>` : ""}
    `;

    submitDocBtn.disabled = false;
    previewFullBtn.disabled = false;
  }

  submitDocBtn.addEventListener("click", async () => {
    msg.textContent = "";
    const eventId = eventSelect.value;
    if (!eventId) return;

    try{
      await window.GCP.apiFetch(`/tp/submit-document`, { method:"POST", body: JSON.stringify({ eventId: Number(eventId) }) });
      await refresh();
      msg.textContent = "Submitted to Deputy.";
      msg.style.color = "var(--ok)";
    }catch(err){
      msg.textContent = err.message || "Submit failed";
      msg.style.color = "var(--danger)";
    }
  });

  previewFullBtn.addEventListener("click", async () => {
    msg.textContent = "";
    const eventId = eventSelect.value;
    if (!eventId) return;
    try{
      const doc = await window.GCP.apiFetch(`/library/document?event_id=${encodeURIComponent(eventId)}`, { method:"GET" });
      // Use the same preview page used elsewhere if present; fallback modal
      if (doc && doc.html){
        openModal(doc.html);
      }else{
        openModal("<div class='muted'>Nothing to preview.</div>");
      }
    }catch(err){
      msg.textContent = err.message || "Preview failed";
    }
  });

  eventSelect.addEventListener("change", refresh);

  try{
    await loadEvents();
  }catch(err){
    msg.textContent = err.message || "Failed to load";
  }
})();
