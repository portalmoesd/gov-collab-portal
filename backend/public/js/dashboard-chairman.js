// dashboard-chairman.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role || '').toLowerCase();

  const eventSelect = document.getElementById("eventSelect");
  const docStatusBox = document.getElementById("docStatusBox");
  const sectionsTbody = document.getElementById("sectionsTbody");
  const approveDocBtn = document.getElementById("approveDocBtn");
  const previewBtn = document.getElementById("previewBtn");
  const msg = document.getElementById("msg");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalContent = document.getElementById("modalContent");
  const closeModalBtn = document.getElementById("closeModalBtn");

  // Insert End Event button (admin/supervisor/chairman/protocol)
  const canEndEvent = ['admin','supervisor','chairman','protocol'].includes(role);
  endEventBtn.className = 'btn danger';
  endEventBtn.textContent = 'End event';
  endEventBtn.style.display = 'none';
  if (canEndEvent) {
    // place next to preview button
    previewBtn.parentElement.insertBefore(endEventBtn, previewBtn);
  }

  let currentEventId = null;
  let currentSections = [];

  function setMsg(text, isError=false){
    msg.textContent = text || '';
    msg.style.color = isError ? 'crimson' : '#2b445b';
  }

  function pill(status){
    const s = String(status || '').toLowerCase();
    const cls = (s === 'approved') ? 'pill success' :
                (s.includes('returned')) ? 'pill danger' :
                (s.includes('submitted')) ? 'pill warn' : 'pill';
    return `<span class="${cls}">${window.GCP.escapeHtml(humanStatus(s))}</span>`;
  }

  function humanStatus(s){
    const m = {
      draft: 'Draft',
      submitted: 'Submitted',
      submitted_to_supervisor: 'Submitted to Supervisor',
      approved_by_supervisor: 'Approved by Supervisor',
      submitted_to_chairman: 'Submitted to Deputy',
      approved_by_chairman: 'Approved by Deputy',
      approved: 'Approved',
      returned: 'Returned'
    };
    return m[s] || s || '';
  }

  async function loadEvents(){
    eventSelect.innerHTML = '<option value="">Select…</option>';
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });

    for (const ev of (events || [])){
      const opt = document.createElement('option');
      opt.value = String(ev.id);
      const deadline = ev.deadline_date ? window.GCP.formatDate(ev.deadline_date) : '';
      opt.textContent = `${ev.title || 'Event'} — ${ev.country_name_en || ''}${deadline ? ' ('+deadline+')' : ''}`;
      eventSelect.appendChild(opt);
    }
  }

  async function refresh(){
    setMsg('');
    sectionsTbody.innerHTML = '';
    docStatusBox.innerHTML = '';
    const evId = Number(eventSelect.value);
    if (!Number.isFinite(evId)) {
      currentEventId = null;
      approveDocBtn.disabled = true;
      
      previewBtn.disabled = true;
      endEventBtn.style.display = 'none';
      return;
    }
    currentEventId = evId;

    if (canEndEvent) endEventBtn.style.display = 'inline-block';

    // Document status
    const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
    const last = ds.updatedAt ? window.GCP.formatDateTime(ds.updatedAt) : '';
    docStatusBox.innerHTML = `
      <div><b>Document status:</b> ${pill(ds.status)} ${last ? `<span class="muted">(${window.GCP.escapeHtml(last)})</span>` : ''}</div>
      ${ds.chairmanComment ? `<div class="muted" style="margin-top:6px;"><b>Comment:</b> ${window.GCP.escapeHtml(ds.chairmanComment)}</div>` : ''}
    `;

    // Per-section status grid
    const grid = await window.GCP.apiFetch(`/tp/status-grid?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
    currentSections = grid.sections || [];

    for (const s of currentSections){
      const tr = document.createElement('tr');
      const lastUpdate = s.lastUpdatedAt ? window.GCP.formatDateTime(s.lastUpdatedAt) : '';
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(s.sectionLabel || '')}</td>
        <td>${pill(s.status)}</td>
        <td>${window.GCP.escapeHtml(lastUpdate)}</td>
        <td class="actions"></td>
      `;
      const actionsTd = tr.querySelector('.actions');

      const openBtn = document.createElement('button');
      openBtn.className = 'btn';
      openBtn.textContent = 'Open editor';
      openBtn.addEventListener('click', () => {
        window.open(`editor.html?event_id=${currentEventId}&section_id=${s.sectionId}`, '_blank');
      });
      actionsTd.appendChild(openBtn);

      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn success';
      approveBtn.textContent = 'Approve section';
      approveBtn.style.marginLeft = '8px';
      approveBtn.addEventListener('click', async () => {
        msgEl.classList.add('hidden');
        try {
          await window.GCP.apiFetch('/tp/approve-section-chairman', {
            method: 'POST',
            body: JSON.stringify({ eventId: currentEventId, sectionId: s.sectionId })
          });
          await refresh();
        } catch (e) {
          console.error(e);
          msgEl.textContent = 'Server error';
          msgEl.classList.remove('hidden');
        }
      });
      actionsTd.appendChild(approveBtn);

      sectionsTbody.appendChild(tr);
    }

    approveDocBtn.disabled = false;
    
    previewBtn.disabled = false;
  }

  approveDocBtn.addEventListener('click', async () => {
    setMsg('');
    if (!currentEventId) return;
    if (!confirm('Approve the full document?')) return;
    try{
      await window.GCP.apiFetch('/document/approve', {
        method:'POST',
        body: JSON.stringify({ eventId: currentEventId })
      });
      await refresh();
    }catch(e){
      setMsg(e.message || 'Failed to approve document', true);
    }
  });
await refresh();

  previewBtn.addEventListener('click', async () => {
    setMsg('');
    if (!currentEventId) return;
    try{
      // Build a full preview from TP HTML per required section
      const parts = [];
      for (const s of currentSections){
        const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(currentEventId)}&section_id=${encodeURIComponent(s.sectionId)}`, { method:'GET' });
        parts.push(`<h2 style="margin:18px 0 8px;">${window.GCP.escapeHtml(tp.sectionLabel || s.sectionLabel || '')}</h2>`);
        parts.push(tp.htmlContent || '<div class="muted">—</div>');
      }
      modalContent.innerHTML = `<div style="padding:8px 2px;">${parts.join('')}</div>`;
      modalBackdrop.style.display = 'flex';
    }catch(e){
      setMsg(e.message || 'Failed to preview', true);
    }
  });

  closeModalBtn.addEventListener('click', () => {
    modalBackdrop.style.display = 'none';
    modalContent.innerHTML = '';
  });
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      modalBackdrop.style.display = 'none';
      modalContent.innerHTML = '';
    }
  });
eventSelect.addEventListener('change', refresh);

  await loadEvents();
  await refresh();
})();