

async function loadEvents(){
  const events = await window.GCP.apiFetch('/events?is_active=1');
  eventSelect.innerHTML = `<option value="">Select event</option>` + events.map(ev => {
    const deadline = window.GCP.formatDate(ev.deadline_date || '');
    const c = ev.country_name_en ? ` — ${ev.country_name_en}` : '';
    return `<option value="${ev.id}">${window.GCP.escapeHtml(ev.title)}${c}${deadline ? ' (deadline '+window.GCP.escapeHtml(deadline)+')' : ''}</option>`;
  }).join('');
}
// dashboard-supervisor.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  if (!["admin","supervisor"].includes(role)){
    document.querySelector(".main").innerHTML = "<div class='card'>Access denied.</div>";
    return;
  }  const eventSelect = document.getElementById("eventSelect");
  let currentEventCountryId = null;
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
    const events = await window.GCP.apiFetch(`/events?is_active=true&country_id=${encodeURIComponent(currentEventCountryId)}`, { method:"GET" });
    eventSelect.innerHTML = `<option value="">Select event</option>` + events.map(ev => `<option value="${ev.id}">${window.GCP.escapeHtml(ev.title)}</option>`).join("");
  }

  async function refresh(){
    msg.textContent = "";
    sectionsTbody.innerHTML = "";
    docStatusBox.innerHTML = "";

    const currentEventCountryId = null;
    const eventId = eventSelect.value;

    if (!eventId){
      msg.textContent = "Please choose a country and an event.";
      return;
    }

    const data = await window.GCP.apiFetch(`/tp/status-grid?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(currentEventCountryId)}`, { method:"GET" });

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
        location.href = `editor.html?eventId=${encodeURIComponent(eventId)}&currentEventCountryId=${encodeURIComponent(currentEventCountryId)}&sectionId=${encodeURIComponent(row.section_id)}`;
      });
      sectionsTbody.appendChild(tr);
    }

    const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(currentEventCountryId)}`, { method:"GET" });
    docStatusBox.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div><b>Document status:</b> <span class="pill ${ds.documentStatus}">${ds.documentStatus.replaceAll("_"," ")}</span></div>
        <div class="small muted">Last submitted: ${ds.lastSubmittedAt ? window.GCP.escapeHtml(ds.lastSubmittedAt) : '—'}</div>
      </div>
      ${ds.chairmanComment ? `<div class="small"><b>Deputy comment:</b> ${window.GCP.escapeHtml(ds.chairmanComment)}</div>` : ''}
    `;
  }

  async function previewFull(){
    const currentEventCountryId = null;
    const eventId = eventSelect.value;
    if (!eventId){
      msg.textContent = "Choose a country and event first.";
      return;
    }
    try{
      const doc = await window.GCP.apiFetch(`/library/document?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(currentEventCountryId)}`, { method:"GET" });
      openModal(`
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div>
            <h2 style="margin:0 0 6px;">${window.GCP.escapeHtml(doc.eventTitle)}</h2>
            <div class="small muted">${window.GCP.escapeHtml(doc.countryName)}</div>
          </div>
          <div class="small muted">Generated at ${window.GCP.formatDateTime(new Date())}</div>
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
    const currentEventCountryId = null;
    const eventId = eventSelect.value;
    if (!eventId){
      msg.textContent = "Choose a country and event first.";
      return;
    }
    if (!confirm("Submit the entire document to Deputy?")) return;
    try{
      await window.GCP.apiFetch("/tp/submit-document", {
        method:"POST",
        body: JSON.stringify({ eventId: Number(eventId), currentEventCountryId: Number(currentEventCountryId) })
      });
      await refresh();
      msg.textContent = "Submitted to Deputy.";
    }catch(err){
      msg.textContent = err.message || "Submit failed";
    }
  });    eventSelect.value = "";
    sectionsTbody.innerHTML = "";
    docStatusBox.innerHTML = "";
    msg.textContent = "";
  });

  eventSelect.addEventListener("change", refresh);

  try{
    await loadCountries();
  }catch(err){
    msg.textContent = err.message || "Failed to load countries";
    return;
  }
})();
