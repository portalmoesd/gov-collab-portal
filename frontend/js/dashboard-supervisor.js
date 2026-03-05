// dashboard-supervisor.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const eventSelect = document.getElementById('eventSelect');
  const sectionsTbody = document.getElementById('sectionsTbody');
  const approveAllSectionsBtn = document.getElementById('approveAllSectionsBtn');
  const submitDocBtn = document.getElementById('submitDocBtn');
  const previewFullBtn = document.getElementById('previewFullBtn');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalContent = document.getElementById('modalContent');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const endEventBtn = document.createElement('button');
  endEventBtn.className = 'btn danger';
  endEventBtn.id = 'endEventBtn';
  endEventBtn.textContent = 'End event';
  endEventBtn.style.display = 'none';
  const msg = document.getElementById('msg');
  const docStatusBox = document.getElementById('docStatusBox');

  let currentEventId = null;
  let currentSections = [];

  const eventsById = new Map();

  function workflowSteps(submitterRole){
    const steps = ['Draft','Supervisor'];
    if(submitterRole === 'deputy' || submitterRole === 'minister') steps.push('Deputy');
    if(submitterRole === 'minister') steps.push('Minister');
    steps.push('Approved');
    return steps;
  }

  function statusStage(status){
    const s = String(status||'').toLowerCase();
    if(s === 'approved' || s === 'locked') return 'Approved';
    if(s.includes('minister')) return 'Minister';
    if(s.includes('chairman')) return 'Deputy';
    if(s.includes('supervisor')) return 'Supervisor';
    return 'Draft';
  }

  function renderProgress(steps, activeLabel){
    const idx = Math.max(0, steps.indexOf(activeLabel));
    return `
      <div class="gcp-progress" role="list">
        ${steps.map((label,i)=>{
          const cls = i < idx ? 'done' : (i===idx ? 'active' : 'todo');
          return `
            <div class="gcp-step ${cls}" role="listitem">
              <div class="gcp-dot"></div>
              <div class="gcp-label">${window.GCP.escapeHtml(label)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function setMsg(text, isError=false){
    msg.textContent = text || '';
    msg.style.color = isError ? 'crimson' : '#2b445b';
  }

  function humanStatus(s){
    const map = {
      draft: 'Draft',
      submitted_to_supervisor: 'Submitted',
      returned_by_supervisor: 'Returned',
      approved_by_supervisor: 'Approved (Supervisor)',
      submitted_to_chairman: 'Submitted to Deputy',
      returned_by_chairman: 'Returned (Deputy)',
      approved_by_chairman: 'Approved (Deputy)',
      locked: 'Locked'
    };
    return map[s] || (s || '');
  }

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    eventsById.clear();
    for (const ev of (events || [])){
      eventsById.set(Number(ev.id), ev);
      const opt = document.createElement('option');
      opt.value = ev.id;
      // carry submitter role so we can set the button label without an extra /events/:id call
      opt.dataset.submitterRole = (ev.submitter_role || ev.submitterRole || '').toLowerCase();
      opt.textContent = `${ev.title || 'Event'} (${ev.country_name_en || ''}${ev.deadline_date ? ', ' + window.GCP.formatDateTime(ev.deadline_date) : ''})`;
      eventSelect.appendChild(opt);
    }
  }

  async function refreshStatusGrid(){
    if (!currentEventId) return;
    const data = await window.GCP.apiFetch(`/tp/status-grid?event_id=${currentEventId}`, { method:'GET' });
    currentSections = data.sections || [];
    sectionsTbody.innerHTML = '';

    for (const s of currentSections){
      const tr = document.createElement('tr');
      const last = s.lastUpdatedAt ? window.GCP.formatDateTime(s.lastUpdatedAt) : '';
      const note = (s.statusComment || '').trim();
      tr.innerHTML = `
        <td>${s.sectionLabel}</td>
        <td>${humanStatus(s.status)}${note ? `<div class="small" style="margin-top:4px; padding:6px 8px; border-radius:10px; border:1px solid rgba(220,38,38,.25); background: rgba(254,226,226,.55);"><b>Comment:</b> ${window.GCP.escapeHtml(note)}</div>` : ''}</td>
        <td>${last}</td>
        <td class="actions"></td>
      `;
      const actionsTd = tr.querySelector('.actions');

      const open = document.createElement('button');
      open.className = 'btn';
      open.textContent = 'Open';
      open.addEventListener('click', () => {
        window.open(`editor.html?event_id=${currentEventId}&section_id=${s.sectionId}`, '_blank');
      });
      actionsTd.appendChild(open);

      // Approve/Return for supervisor stage
      if (s.status === 'submitted_to_supervisor' || s.status === 'returned_by_supervisor' || s.status === 'draft') {
        const approve = document.createElement('button');
        approve.className = 'btn secondary';
        approve.textContent = 'Approve';
        approve.addEventListener('click', async () => {
          setMsg('');
          await window.GCP.apiFetch('/tp/approve-section', {
            method:'POST',
            body: JSON.stringify({ eventId: currentEventId, sectionId: s.sectionId })
          });
          await refreshStatusGrid();
        });
        actionsTd.appendChild(approve);

        const ret = document.createElement('button');
        ret.className = 'btn danger';
        ret.textContent = 'Return';
        ret.addEventListener('click', async () => {
          const note = prompt('Return note (optional):', '');
          await window.GCP.apiFetch('/tp/return', {
            method:'POST',
            body: JSON.stringify({ eventId: currentEventId, sectionId: s.sectionId, note })
          });
          await refreshStatusGrid();
        });
        actionsTd.appendChild(ret);
      }
      sectionsTbody.appendChild(tr);

    }

    // Enable submit to deputy when all sections approved by supervisor
    const ok = currentSections.length > 0 && currentSections.every(s => ['approved_by_supervisor','approved_by_chairman'].includes(s.status));
    submitDocBtn.disabled = !ok;
  }

  
  approveAllSectionsBtn.addEventListener('click', async () => {
    if (!currentEventId) return;
    if (!confirm('Approve all required sections for this event?')) return;
    setMsg('');
    await window.GCP.apiFetch('/tp/approve-all-sections', {
      method:'POST',
      body: JSON.stringify({ eventId: currentEventId })
    });
    await refreshStatusGrid();
  });

eventSelect.addEventListener('change', async () => {
    setMsg('');
    currentEventId = Number(eventSelect.value);
    if (!Number.isFinite(currentEventId) || currentEventId <= 0) {
      currentEventId = null;
      sectionsTbody.innerHTML = '';
      submitDocBtn.disabled = true;
      endEventBtn.style.display = 'none';
      return;
    }
    // Adjust document submit button label based on configured submitter
    // (use data from /events/upcoming to avoid permission/latency issues)
    const selectedOpt = eventSelect.options[eventSelect.selectedIndex];
    let sr = ((selectedOpt?.dataset?.submitterRole || '')).toLowerCase();
    // Fallback: if submitter role wasn't included in the upcoming events list, fetch event details.
    if (!sr && currentEventId > 0) {
      try {
        const evDetails = await window.GCP.apiFetch(`/events/${currentEventId}`, { method: 'GET' });
        sr = String(evDetails?.submitter_role || evDetails?.submitterRole || '').toLowerCase();
      } catch (e) {
        // ignore; keep default
      }
    }
    submitDocBtn.textContent = sr === 'supervisor' ? 'Send to Library' : (sr === 'minister' ? 'Submit to Deputy' : 'Submit document to Deputy');
    submitDocBtn.dataset.submitterRole = sr || 'chairman';
    try{
      await refreshStatusGrid();

      // Document status box (same workflow bar as collaborator)
      const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
      const last = ds.updatedAt ? window.GCP.formatDateTime(ds.updatedAt) : '';
      const ev = eventsById.get(currentEventId);
      const submitterRole = (ds.submitterRole || ev?.submitter_role || 'deputy');
      const steps = workflowSteps(String(submitterRole).toLowerCase());
      const active = statusStage(ds.status);
      const task = (ev?.task || '').trim();
      if (docStatusBox) {
        docStatusBox.innerHTML = `
          <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div><b>Status:</b> ${window.GCP.escapeHtml(humanStatus(ds.status) || '')}</div>
            ${last ? `<div class="muted">${window.GCP.escapeHtml(last)}</div>` : ''}
          </div>
          ${renderProgress(steps, active)}
          ${task ? `<div style="margin-top:10px;"><b>Task:</b> ${window.GCP.escapeHtml(task)}</div>` : ''}
        `;
      }
    }catch(e){
      setMsg(e.message || 'Failed to load sections', true);
      sectionsTbody.innerHTML = '';
      submitDocBtn.disabled = true;
    }
  });
  // Supervisor dashboard does not use a single 'Open editor' button; per-section actions are in the table.
  // (Kept intentionally blank.)

previewFullBtn.addEventListener('click', async () => {
  setMsg('');
  if (!currentEventId) return;
  try{
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

modalCloseBtn.addEventListener('click', () => {
  modalBackdrop.style.display = 'none';
  modalContent.innerHTML = '';
});
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) {
    modalBackdrop.style.display = 'none';
    modalContent.innerHTML = '';
  }
});

  submitDocBtn.addEventListener('click', async () => {
    if (!currentEventId) return;
    setMsg('');
    try {
      // Determine the configured submitter for this event (Supervisor/Deputy/Minister)
      // (use the value stored on the selected <option> from /events/upcoming)
      const selectedOpt = eventSelect.options[eventSelect.selectedIndex];
      const sr = String(selectedOpt?.dataset?.submitterRole || '').toLowerCase();

      await window.GCP.apiFetch('/document/submit-to-chairman', {
        method: 'POST',
        body: JSON.stringify({ eventId: currentEventId })
      });

      if (sr === 'supervisor') {
        setMsg('Document finalized and sent to Library.');
      } else {
        setMsg('Submitted to Deputy.');
      }
      await refreshStatusGrid();
    } catch (e) {
      setMsg(e.message || 'Submit failed', true);
    }
  });

  await loadUpcoming();
})();