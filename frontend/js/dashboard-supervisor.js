// dashboard-supervisor.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  if (!["admin","supervisor"].includes(role)){
    document.querySelector(".main").innerHTML = "<div class='card'>Access denied.</div>";
    return;
  }

  const countrySelect = document.getElementById("countrySelect");
  const eventSelect = document.getElementById("eventSelect");
  const sectionsTbody = document.getElementById("sectionsTbody");
  const docStatusBox = document.getElementById("docStatusBox");
  const submitDocBtn = document.getElementById("submitDocBtn");

  let eventsCache = new Map();

  function getSelectedEvent(){
    const id = String(eventSelect.value || '');
    return eventsCache.get(id) || null;
  }

  function updateSubmitButton(){
    const ev = getSelectedEvent();
    if (!ev){
      submitDocBtn.textContent = 'Submit document';
      submitDocBtn.dataset.mode = '';
      return;
    }
    const submitter = String(ev.submitter_role || 'chairman').toLowerCase();
    if (submitter === 'supervisor'){
      submitDocBtn.textContent = 'Send to Library';
      submitDocBtn.dataset.mode = 'library';
    } else {
      submitDocBtn.textContent = 'Submit document to Deputy';
      submitDocBtn.dataset.mode = 'deputy';
    }
  }
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

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = `<option value="">Select country</option>` + countries.map(c => `<option value="${c.id}">${window.GCP.escapeHtml(c.name_en)}</option>`).join("");
  }

  async function loadEventsForCountry(countryId){
    if (!countryId){
      eventSelect.innerHTML = `<option value="">Select event</option>`;
      return;
    }
    const events = await window.GCP.apiFetch(`/events?is_active=true&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
    eventsCache = new Map(events.map(ev => [String(ev.id), ev]));
    eventSelect.innerHTML = `<option value="">Select event</option>` + events.map(ev => `<option value="${ev.id}">${window.GCP.escapeHtml(ev.title)}</option>`).join("");
    updateSubmitButton();
  }

  async function refresh(){
    msg.textContent = "";
    sectionsTbody.innerHTML = "";
    docStatusBox.innerHTML = "";

    const countryId = countrySelect.value;
    const eventId = eventSelect.value;
    updateSubmitButton();

    if (!countryId || !eventId){
      msg.textContent = "Please choose a country and an event.";
      return;
    }

    const data = await window.GCP.apiFetch(`/tp/status-grid?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });

    sectionsTbody.innerHTML = "";
    for (const row of data.rows){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(row.section_label)}</td>
        <td><span class="pill ${row.status}">${row.status.replaceAll("_"," ")}</span></td>
        <td>${row.last_updated_at ? window.GCP.escapeHtml(row.last_updated_at) : '<span class="muted">—</span>'}</td>
        <td>${row.last_updated_by ? window.GCP.escapeHtml(row.last_updated_by) : '<span class="muted">—</span>'}</td>
        <td><button class="btn" data-act="edit">Open</button></td>
      `;
      tr.querySelector('[data-act="edit"]').addEventListener("click", () => {
        location.href = `editor.html?eventId=${encodeURIComponent(eventId)}&countryId=${encodeURIComponent(countryId)}&sectionId=${encodeURIComponent(row.section_id)}`;
      });
      sectionsTbody.appendChild(tr);
    }

    const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
    docStatusBox.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div><b>Document status:</b> <span class="pill ${ds.documentStatus}">${ds.documentStatus.replaceAll("_"," ")}</span></div>
        <div class="small muted">Last submitted: ${ds.lastSubmittedAt ? window.GCP.escapeHtml(ds.lastSubmittedAt) : '—'}</div>
      </div>
      ${ds.chairmanComment ? `<div class="small"><b>Deputy comment:</b> ${window.GCP.escapeHtml(ds.chairmanComment)}</div>` : ''}
    `;
  }

  async function previewFull(){
    const countryId = countrySelect.value;
    const eventId = eventSelect.value;
    if (!countryId || !eventId){
      msg.textContent = "Choose a country and event first.";
      return;
    }
    try{
      const doc = await window.GCP.apiFetch(`/library/document?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
      openModal(`
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div>
            <h2 style="margin:0 0 6px;">${window.GCP.escapeHtml(doc.eventTitle)}</h2>
            <div class="small muted">${window.GCP.escapeHtml(doc.countryName)}</div>
          </div>
          <div class="small muted">Generated at ${new Date().toLocaleString()}</div>
        </div>
        <hr style="margin:12px 0; border:none; border-top:1px solid var(--border);" />
        <div>${doc.html || ""}</div>
      `);
    }catch(err){
      msg.textContent = err.message || "Preview failed";
    }
  }

  previewFullBtn.addEventListener("click", previewFull);

  submitDocBtn.addEventListener("click", async () => {
    const countryId = countrySelect.value;
    const eventId = eventSelect.value;
    if (!countryId || !eventId){
      msg.textContent = "Choose a country and event first.";
      return;
    }
    const mode = submitDocBtn.dataset.mode;
    const confirmMsg = (mode === "library") ? "Send the entire document to Library?" : "Submit the entire document to Deputy?";
    if (!confirm(confirmMsg)) return;
    try{
      await window.GCP.apiFetch("/tp/submit-document", {
        method:"POST",
        body: JSON.stringify({ eventId: Number(eventId), countryId: Number(countryId) })
      });
      await refresh();
      msg.textContent = (mode === "library") ? "Sent to Library." : "Submitted to Deputy.";
    }catch(err){
      msg.textContent = err.message || "Submit failed";
    }
  });

  countrySelect.addEventListener("change", async () => {
    await loadEventsForCountry(countrySelect.value);
    eventSelect.value = "";
    sectionsTbody.innerHTML = "";
    docStatusBox.innerHTML = "";
    msg.textContent = "";
  });

  eventSelect.addEventListener("change", () => { updateSubmitButton(); refresh(); });

  try{
    await loadCountries();
  }catch(err){
    msg.textContent = err.message || "Failed to load countries";
    return;
  }
})();
