// dashboard-supervisor.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const countrySelect = document.getElementById("countrySelect");
  const eventSelect = document.getElementById("eventSelect");
  const docStatusBox = document.getElementById("docStatusBox");
  const sectionsTbody = document.getElementById("sectionsTbody");
  const submitBtn = document.getElementById("submitDocBtn");
  const msg = document.getElementById("msg");

  let currentEvent = null;

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = `<option value="">Select country...</option>`;
    for (const c of countries){
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name_en;
      countrySelect.appendChild(opt);
    }
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
    const countryId = countrySelect.value;
    if (!eventId || !countryId){
      sectionsTbody.innerHTML = "";
      docStatusBox.innerHTML = `<span class="muted">Select event and country.</span>`;
      return;
    }

    currentEvent = await window.GCP.apiFetch(`/events/${encodeURIComponent(eventId)}?country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
    const ds = await window.GCP.apiFetch(`/document-status?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });

    docStatusBox.innerHTML = `
      <div><b>Document status:</b> ${pill(ds.status)}</div>
      ${ds.chairmanComment ? `<div class="small"><b>Chairman comment:</b> ${window.GCP.escapeHtml(ds.chairmanComment)}</div>` : ''}
      <div class="small muted">Updated: ${window.GCP.escapeHtml(ds.updatedAt)}</div>
    `;

    const stMap = new Map();
    for (const st of (currentEvent.sectionStatuses || [])){
      stMap.set(st.section_id, st);
    }

    sectionsTbody.innerHTML = "";
    for (const sec of currentEvent.requiredSections){
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
          <button class="btn success" data-act="approve" data-sid="${sec.id}">Approve</button>
          <button class="btn danger" data-act="return" data-sid="${sec.id}">Return</button>
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
              await window.GCP.apiFetch("/tp/approve-section", { method:"POST", body: JSON.stringify({ eventId, countryId, sectionId: sid }) });
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

  submitBtn.addEventListener("click", async () => {
    const eventId = eventSelect.value;
    const countryId = countrySelect.value;
    if (!eventId || !countryId) return;
    if (!confirm("Submit the entire document to Chairman?")) return;

    try{
      await window.GCP.apiFetch("/document/submit-to-chairman", { method:"POST", body: JSON.stringify({ eventId, countryId }) });
      await refresh();
    }catch(err){
      alert(err.message || "Failed");
    }
  });

  countrySelect.addEventListener("change", refresh);
  eventSelect.addEventListener("change", refresh);

  try{
    await Promise.all([loadCountries(), loadEvents()]);
    await refresh();
  }catch(err){
    msg.textContent = err.message || "Failed to load";
  }
})();
