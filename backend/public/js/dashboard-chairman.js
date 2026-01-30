// dashboard-chairman.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;  const eventSelect = document.getElementById("eventSelect");
  let currentEventCountryId = null;
  const docStatusBox = document.getElementById("docStatusBox");
  const sectionsTbody = document.getElementById("sectionsTbody");
  const approveDocBtn = document.getElementById("approveDocBtn");
  const returnDocBtn = document.getElementById("returnDocBtn");
  const previewBtn = document.getElementById("previewBtn");
  const msg = document.getElementById("msg");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalContent = document.getElementById("modalContent");
  const closeModalBtn = document.getElementById("closeModalBtn");

  closeModalBtn.addEventListener("click", () => {
    modalBackdrop.style.display = "none";
    modalContent.innerHTML = "";
  });
  }

  async function loadEvents(){
    const events = await window.GCP.apiFetch("/events?is_active=true", { method:"GET" });
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    for (const ev of events){
      const opt = document.createElement("option");
      opt.value = ev.id;
      opt.textContent = `${ev.title} (${ev.country_name_en}${ev.deadline_date ? ', ' + ev.deadline_date : ''})`;
      eventSelect.appendChild(opt);
    }
  }

  function pill(status){
    return `<span class="pill ${status}">${status.replaceAll("_"," ")}</span>`;
  }

  async function refresh(){
    msg.textContent = "";
    const eventId = eventSelect.value;
    const countryId = null;
    if (!eventId || !countryId){
      sectionsTbody.innerHTML = "";
      docStatusBox.innerHTML = `<span class="muted">Select event and country.</span>`;
      return;
    }

    const event = await window.GCP.apiFetch(`/events/${encodeURIComponent(eventId)}?country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
    const ds = await window.GCP.apiFetch(`/document-status?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });

    docStatusBox.innerHTML = `
      <div><b>Document status:</b> ${pill(ds.status)}</div>
      ${ds.chairmanComment ? `<div class="small"><b>Deputy comment:</b> ${window.GCP.escapeHtml(ds.chairmanComment)}</div>` : ''}
      <div class="small muted">Updated: ${window.GCP.escapeHtml(ds.updatedAt)}</div>
    `;

    const stMap = new Map();
    for (const st of (event.sectionStatuses || [])) stMap.set(st.section_id, st);

    sectionsTbody.innerHTML = "";
    for (const sec of event.requiredSections){
      const st = stMap.get(sec.id) || { status: "draft" };
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(sec.label)}</td>
        <td>${pill(st.status || 'draft')}</td>
        <td class="small">${st.last_updated_by ? window.GCP.escapeHtml(st.last_updated_by) : '<span class="muted">—</span>'}<br/>
            <span class="muted">${st.last_updated_at ? window.GCP.escapeHtml(st.last_updated_at) : ''}</span>
            ${st.status_comment ? `<div class="small"><b>Comment:</b> ${window.GCP.escapeHtml(st.status_comment)}</div>` : ''}
        </td>
        <td class="row">
          <button class="btn" data-act="open" data-sid="${sec.id}">Open</button>
          <button class="btn success" data-act="approve" data-sid="${sec.id}">Approve section</button>
          <button class="btn danger" data-act="return" data-sid="${sec.id}">Return section</button>
        </td>
      `;
      tr.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", async () => {
          const act = btn.dataset.act;
          const sid = btn.dataset.sid;
          if (act === "open"){
            location.href = `editor.html?eventId=${encodeURIComponent(eventId)}&countryId=${encodeURIComponent(countryId)}&sectionId=${encodeURIComponent(sid)}`;
            return;
          }
          try{
            if (act === "approve"){
              await window.GCP.apiFetch("/tp/approve-section-chairman", { method:"POST", body: JSON.stringify({ eventId, countryId, sectionId: sid }) });
            } else if (act === "return"){
              const comment = prompt("Return comment (required):", "");
              if (comment === null) return;
              await window.GCP.apiFetch("/tp/return", { method:"POST", body: JSON.stringify({ eventId, countryId, sectionId: sid, comment }) });
            }
            await refresh();
          }catch(err){
            alert(err.message || "Action failed");
          }
        });
      });
      sectionsTbody.appendChild(tr);
    }
  }

  approveDocBtn.addEventListener("click", async () => {
    const eventId = eventSelect.value;
    const countryId = null;
    if (!eventId || !countryId) return;
    if (!confirm("Approve the entire document and send to Library?")) return;
    try{
      await window.GCP.apiFetch("/document/approve", { method:"POST", body: JSON.stringify({ eventId, countryId }) });
      await refresh();
    }catch(err){
      alert(err.message || "Failed");
    }
  });

  returnDocBtn.addEventListener("click", async () => {
    const eventId = eventSelect.value;
    const countryId = null;
    if (!eventId || !countryId) return;
    const comment = prompt("Return document comment (required):", "");
    if (comment === null) return;
    try{
      await window.GCP.apiFetch("/document/return", { method:"POST", body: JSON.stringify({ eventId, countryId, comment }) });
      await refresh();
    }catch(err){
      alert(err.message || "Failed");
    }
  });

  previewBtn.addEventListener("click", async () => {
    const eventId = eventSelect.value;
    const countryId = null;
    if (!eventId || !countryId) return;
    try{
      const doc = await window.GCP.apiFetch(`/library/document?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
      modalBackdrop.style.display = "flex";
      modalContent.innerHTML = renderDocPreview(doc);
    }catch(err){
      alert(err.message || "Failed");
    }
  });

  function renderDocPreview(doc){
    const secHtml = (doc.sections || []).map(s => `
      <div class="card" style="margin-bottom:12px; box-shadow:none;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-weight:900;">${window.GCP.escapeHtml(s.sectionLabel)}</div>
          <div class="small">${s.status ? `<span class="pill ${s.status}">${s.status.replaceAll("_"," ")}</span>` : ''}</div>
        </div>
        <div class="small muted">Last updated: ${s.lastUpdatedAt ? window.GCP.escapeHtml(s.lastUpdatedAt) : '—'}</div>
        <hr style="border:0; border-top:1px solid var(--border); margin:10px 0;">
        <div>${s.htmlContent || '<span class="muted">No content</span>'}</div>
      </div>
    `).join("");

    const title = doc?.event?.title || "Preview";
    const country = doc?.event?.countryName || "";
    const deadline = doc?.event?.deadlineDate || "";

    return `
      <h2>${window.GCP.escapeHtml(title)}</h2>
      <div class="small muted">${window.GCP.escapeHtml(country)} ${deadline ? '• ' + window.GCP.escapeHtml(deadline) : ''}</div>
      <div style="margin-top:12px;">${secHtml}</div>
    `;
  }  eventSelect.addEventListener("change", refresh);

  try{
    await Promise.all([loadEvents()]);
    await refresh();
  }catch(err){
    msg.textContent = err.message || "Failed to load";
  }
})();
