// library.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role || "").toLowerCase();
  const allowed = ["admin","chairman","minister","supervisor","protocol","super_collaborator"];
  if (!allowed.includes(role)){
    document.querySelector(".main").innerHTML = "<div class='card'>Access denied.</div>";
    return;
  }

  const countrySelect = document.getElementById("countrySelect");
  const docsTbody = document.getElementById("docsTbody");
  const msg = document.getElementById("msg");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalContent = document.getElementById("modalContent");
  const closeModalBtn = document.getElementById("closeModalBtn");

  function openModal(html){
    modalContent.innerHTML = html;
    modalBackdrop.style.display = "flex";
  }
  function closeModal(){
    modalBackdrop.style.display = "none";
    modalContent.innerHTML = "";
  }
  closeModalBtn.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = `<option value="">Select country</option>` + countries.map(c => `<option value="${c.id}">${window.GCP.escapeHtml(c.name_en)}</option>`).join("");
  }

  function fmtDate(s){
    return window.GCP.formatDateOnly ? window.GCP.formatDateOnly(s) : (s ? String(s).slice(0,10) : "");
  }
  function fmtDateTime(s){
    return window.GCP.formatDateTime ? window.GCP.formatDateTime(s) : (s ? String(s) : "");
  }

  async function loadDocs(){
    msg.textContent = "";
    docsTbody.innerHTML = "";
    const countryId = countrySelect.value;
    if (!countryId) return;

    const docs = await window.GCP.apiFetch(`/library?country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
    if (!docs.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" class="muted">No approved documents for this country yet.</td>`;
      docsTbody.appendChild(tr);
      return;
    }

    for (const d of docs){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(d.title)}</td>
        <td>${d.deadline_date ? window.GCP.escapeHtml(fmtDate(d.deadline_date)) : '<span class="muted">—</span>'}</td>
        <td>${d.last_updated ? window.GCP.escapeHtml(fmtDateTime(d.last_updated)) : '<span class="muted">—</span>'}</td>
        <td style="white-space:nowrap;">
          <button class="btn" data-act="preview">Preview</button>
          <button class="btn primary" data-act="pdf">Export PDF</button>
        </td>
      `;

      tr.querySelector('[data-act="preview"]').addEventListener("click", () => previewDoc(d.event_id, countryId));
      tr.querySelector('[data-act="pdf"]').addEventListener("click", () => exportPdf(d.event_id, countryId));
      docsTbody.appendChild(tr);
    }
  }

  async function previewDoc(eventId, countryId){
    msg.textContent = "";
    try{
      const doc = await window.GCP.apiFetch(`/library/document?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });

      const parts = [];
      parts.push(`<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <h2 style="margin:0 0 6px;">${window.GCP.escapeHtml(doc.event.title)}</h2>
          <div class="small muted">${window.GCP.escapeHtml(doc.event.countryName)}</div>
        </div>
        <div class="small muted">Last updated: ${doc.documentStatus?.updatedAt ? window.GCP.escapeHtml(new Date(doc.documentStatus.updatedAt).toLocaleString()) : '—'}</div>
      </div>
      <hr style="margin:12px 0; border:none; border-top:1px solid var(--border);" />`);

      for (const s of doc.sections){
        parts.push(`<div style="margin-bottom:14px;">
          <div style="font-weight:900; margin-bottom:6px;">${window.GCP.escapeHtml(s.sectionLabel)}</div>
          <div>${s.htmlContent || ""}</div>
        </div>`);
      }

      openModal(parts.join(""));
    }catch(err){
      msg.textContent = err.message || "Preview failed";
    }
  }

  function slugFilename(title){
    return String(title || "document")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_\-\.]/g, "")
      .slice(0, 80) || "document";
  }

  async function exportPdf(eventId, countryId){
    msg.textContent = "";
    try{
      const doc = await window.GCP.apiFetch(`/library/document?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });

      // Build checkbox list (all checked by default)
      const checklistHtml = doc.sections.map(s => `
        <label class="checkitem">
          <input type="checkbox" class="secCheck" value="${s.sectionId}" checked />
          <span>${window.GCP.escapeHtml(s.sectionLabel)}</span>
        </label>
      `).join("");

      openModal(`
        <h2 style="margin:0 0 6px;">Export PDF</h2>
        <div class="small muted" style="margin-bottom:10px;">
          ${window.GCP.escapeHtml(doc.event.title)} • choose sections to include
        </div>
        <div class="checklist" style="max-height:320px; overflow:auto; margin-bottom:12px;">
          ${checklistHtml}
        </div>
        <div class="row" style="justify-content:flex-end; gap:10px;">
          <button class="btn" id="btnSelectAll">Select all</button>
          <button class="btn" id="btnSelectNone">Select none</button>
          <button class="btn primary" id="btnDoExport">Export</button>
        </div>
      `);

      const checks = Array.from(modalContent.querySelectorAll(".secCheck"));
      modalContent.querySelector("#btnSelectAll").addEventListener("click", () => checks.forEach(c => c.checked = true));
      modalContent.querySelector("#btnSelectNone").addEventListener("click", () => checks.forEach(c => c.checked = false));

      modalContent.querySelector("#btnDoExport").addEventListener("click", async () => {
        const selectedIds = checks.filter(c => c.checked).map(c => Number(c.value));
        if (!selectedIds.length){
          alert("Please select at least one section.");
          return;
        }

        // Build printable HTML
        const selected = doc.sections.filter(s => selectedIds.includes(Number(s.sectionId)));

        const container = document.createElement("div");
        container.style.fontFamily = "Arial, sans-serif";
        container.style.fontSize = "12px";
        container.innerHTML = `
          <div style="text-align:center; margin-bottom:14px;">
            <h1 style="margin:0; font-size:14px;">${window.GCP.escapeHtml(doc.event.title)}</h1>
          </div>
          ${selected.map(s => `
            <div style="page-break-inside:avoid; margin:0 0 14px 0;">
              <h2 style="margin:0 0 6px 0; font-size:14px; border-bottom:1px solid #ddd; padding-bottom:4px;">
                ${window.GCP.escapeHtml(s.sectionLabel)}
              </h2>
              <div>${s.htmlContent || ""}</div>
            </div>
          `).join("")}
        `;

        // Use html2pdf (already loaded in library.html)
        const filename = slugFilename(doc.event.title) + ".pdf";

        const opt = {
          margin: 0.5,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        // Close modal so the export doesn't capture modal chrome
        closeModal();

        await html2pdf().set(opt).from(container).save();
      });

    }catch(err){
      msg.textContent = err.message || "Export failed";
    }
  }

  countrySelect.addEventListener("change", loadDocs);

  try{
    await loadCountries();
  }catch(err){
    msg.textContent = err.message || "Failed to load countries";
  }
})();
