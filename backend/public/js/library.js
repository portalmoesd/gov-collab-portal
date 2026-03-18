// library.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role || "").toLowerCase();
  const allowed = ["admin","deputy","minister","supervisor","protocol","super_collaborator"];
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
    if (!s) return "—";
    try{ return new Date(s).toLocaleDateString(); }catch{ return String(s); }
  }
  function fmtDateTime(s){
    if (!s) return "—";
    try{ return new Date(s).toLocaleString(); }catch{ return String(s); }
  }
  function fmtDDMMYYYY(s){
    if (!s) return "—";
    try{
      const d = new Date(s);
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yyyy = d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }catch{ return String(s); }
  }
  function langLabel(code){
    const map = { en:'English', fr:'French', ar:'Arabic', es:'Spanish', ru:'Russian', zh:'Chinese', pt:'Portuguese', de:'German' };
    return map[code] || code || '—';
  }

  const docsCards = document.getElementById("docsCards");
  const docsEmpty = document.getElementById("docsEmpty");

  function actionBtn(cls, label){
    return `<button class="micro-action library-action ${cls}" type="button">
      <span class="micro-action__icon"></span>
      <span class="micro-action__label">${label}</span>
    </button>`;
  }

  function actionBtns(){
    return actionBtn("library-action--preview", "Preview")
      + actionBtn("library-action--pdf", "Export PDF")
      + actionBtn("library-action--word", "Export Word")
      + actionBtn("library-action--files", "Other Files");
  }

  function wireActions(el, eventId, countryId){
    el.querySelector(".library-action--preview").addEventListener("click", () => previewDoc(eventId, countryId));
    el.querySelector(".library-action--pdf").addEventListener("click", () => exportPdf(eventId, countryId));
    el.querySelector(".library-action--word").addEventListener("click", () => exportWord(eventId, countryId));
    el.querySelector(".library-action--files").addEventListener("click", () => { /* placeholder */ });
  }

  async function loadDocs(){
    msg.textContent = "";
    docsTbody.innerHTML = "";
    docsCards.innerHTML = "";
    docsEmpty.hidden = true;
    const countryId = countrySelect.value;
    if (!countryId) return;

    const docs = await window.GCP.apiFetch(`/library?country_id=${encodeURIComponent(countryId)}`, { method:"GET" });
    if (!docs.length){
      docsEmpty.hidden = false;
      return;
    }

    for (const d of docs){
      const approvalDateStr = fmtDDMMYYYY(d.approval_date);
      const countryName = d.country_name || '—';
      const lang = langLabel(d.language);
      const approver = d.approver_name || '—';

      // Table row
      const tr = document.createElement("tr");
      tr.className = "required-sections-row";
      tr.innerHTML = `
        <td>
          <div class="required-section-name">${window.GCP.escapeHtml(d.title)}</div>
          <div class="library-pills">
            <span class="library-pill library-pill--country">${window.GCP.escapeHtml(countryName)}</span>
            <span class="library-pill library-pill--lang">${window.GCP.escapeHtml(lang)}</span>
          </div>
        </td>
        <td><div class="library-approval-date">${window.GCP.escapeHtml(approvalDateStr)}</div></td>
        <td><div class="library-approver">${window.GCP.escapeHtml(approver)}</div></td>
        <td><div class="required-actions">${actionBtns()}</div></td>
      `;
      wireActions(tr, d.event_id, countryId);
      docsTbody.appendChild(tr);

      // Card (mobile)
      const card = document.createElement("div");
      card.className = "required-section-card";
      card.innerHTML = `
        <div class="required-section-card__top">
          <div class="required-section-card__meta">
            <div class="required-section-name">${window.GCP.escapeHtml(d.title)}</div>
            <div class="library-pills">
              <span class="library-pill library-pill--country">${window.GCP.escapeHtml(countryName)}</span>
              <span class="library-pill library-pill--lang">${window.GCP.escapeHtml(lang)}</span>
            </div>
          </div>
        </div>
        <div class="required-section-card__line">
          <span>Date</span>
          <strong class="library-approval-date">${window.GCP.escapeHtml(approvalDateStr)}</strong>
        </div>
        <div class="required-section-card__line">
          <span>Document Approver</span>
          <strong>${window.GCP.escapeHtml(approver)}</strong>
        </div>
        <div class="required-actions-card">${actionBtns()}</div>
      `;
      wireActions(card, d.event_id, countryId);
      docsCards.appendChild(card);
    }
  }

  async function previewDoc(eventId, countryId){
    msg.textContent = "";
    try{
      const doc = await window.GCP.apiFetch(`/library/document?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });

      const parts = [];
      parts.push(`<style>
        del[data-tc-id] { display:none !important; }
        ins[data-tc-id] { text-decoration:none; background:none; color:inherit; }
        [data-tc-fmt-id] { background:none; border:none; }
      </style>`);
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
          <style>
            del[data-tc-id] { display:none !important; }
            ins[data-tc-id] { text-decoration:none; background:none; color:inherit; }
            [data-tc-fmt-id] { background:none; border:none; }
            [data-tc-initials] { }
          </style>
          <div style="text-align:center; margin-bottom:14px;">
            <h1 style="margin:0; font-size:20px;">${window.GCP.escapeHtml(doc.event.title)}</h1>
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

  async function exportWord(eventId, countryId){
    msg.textContent = "";
    try{
      const doc = await window.GCP.apiFetch(`/library/document?event_id=${encodeURIComponent(eventId)}&country_id=${encodeURIComponent(countryId)}`, { method:"GET" });

      const checklistHtml = doc.sections.map(s => `
        <label class="checkitem">
          <input type="checkbox" class="secCheck" value="${s.sectionId}" checked />
          <span>${window.GCP.escapeHtml(s.sectionLabel)}</span>
        </label>
      `).join("");

      openModal(`
        <h2 style="margin:0 0 6px;">Export Word</h2>
        <div class="small muted" style="margin-bottom:10px;">
          ${window.GCP.escapeHtml(doc.event.title)} &bull; choose sections to include
        </div>
        <div class="checklist" style="max-height:320px; overflow:auto; margin-bottom:12px;">
          ${checklistHtml}
        </div>
        <div class="small muted" style="margin-bottom:12px;">
          Track changes will be preserved as native Word revisions (accept / reject in Word).
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

        const selected = doc.sections.filter(s => selectedIds.includes(Number(s.sectionId)));
        closeModal();

        try{
          await window.GCP.exportDocx(doc.event.title, selected);
        }catch(e){
          msg.textContent = e.message || "Word export failed";
        }
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
