// library.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const countrySelect = document.getElementById("countrySelect");
  const docsTbody = document.getElementById("docsTbody");
  const msg = document.getElementById("msg");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalContent = document.getElementById("modalContent");
  const closeModalBtn = document.getElementById("closeModalBtn");

  closeModalBtn.addEventListener("click", () => {
    modalBackdrop.style.display = "none";
    modalContent.innerHTML = "";
  });

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

  async function loadLibrary(){
    msg.textContent = "";
    docsTbody.innerHTML = "";
    const countryId = countrySelect.value;
    if (!countryId) return;

    const docs = await window.GCP.apiFetch(`/library?country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
    for (const d of docs){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(d.title)}</td>
        <td>${d.deadline_date ? window.GCP.escapeHtml(d.deadline_date) : '<span class="muted">—</span>'}</td>
        <td>${window.GCP.escapeHtml(d.last_updated)}</td>
        <td class="row">
          <button class="btn" data-act="preview">Preview</button>
        </td>
      `;
      tr.querySelector('[data-act="preview"]').addEventListener("click", async () => {
        try{
          const doc = await window.GCP.apiFetch(`/library/document?event_id=${encodeURIComponent(d.event_id)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
          modalBackdrop.style.display = "flex";
          modalContent.innerHTML = renderDocPreview(doc);
        }catch(err){
          alert(err.message || "Failed");
        }
      });
      docsTbody.appendChild(tr);
    }
    if (!docs.length){
      docsTbody.innerHTML = `<tr><td colspan="4" class="muted">No approved documents for this country.</td></tr>`;
    }
  }

  function renderDocPreview(doc){
    const secHtml = (doc.sections || []).map(s => `
      <div class="card" style="margin-bottom:12px; box-shadow:none;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-weight:900;">${window.GCP.escapeHtml(s.sectionLabel)}</div>
          <div class="small">${s.status ? `<span class="pill ${s.status}">${s.status.replaceAll("_"," ")}</span>` : ''}</div>
        </div>
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
  }

  countrySelect.addEventListener("change", loadLibrary);

  try{
    await loadCountries();
  }catch(err){
    msg.textContent = err.message || "Failed to load";
  }
})();
