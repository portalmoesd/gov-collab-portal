// dashboard-chairman.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role || '').toLowerCase();

  const eventSelect = document.getElementById("eventSelect");
  const docStatusBox = document.getElementById("docStatusBox");
  const sectionsTbody = document.getElementById("sectionsTbody");
  const approveAllSectionsBtn = document.getElementById("approveAllSectionsBtn");
  const approveDocBtn = document.getElementById("approveDocBtn");
  const returnDocBtn = document.getElementById("returnDocBtn");
  const previewBtn = document.getElementById("previewBtn");
  const msg = document.getElementById("msg");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalContent = document.getElementById("modalContent");
  const closeModalBtn = document.getElementById("closeModalBtn");

  // Insert End Event button (admin/supervisor/protocol)
  const canEndEvent = ['admin','supervisor','protocol'].includes(role);
  const endEventBtn = document.createElement('button');
  endEventBtn.className = 'btn danger';
  endEventBtn.textContent = 'End event';
  endEventBtn.style.display = 'none';
  if (canEndEvent) {
    // place next to preview button
    previewBtn.parentElement.insertBefore(endEventBtn, previewBtn);
  }

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
      submitted_to_minister: 'Submitted to Minister',
      approved_by_minister: 'Approved by Minister',
      approved: 'Approved',
      returned: 'Returned'
    };
    return m[s] || s || '';
  }

  async function loadEvents(){
    eventSelect.innerHTML = '<option value="">Select…</option>';
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });

    eventsById.clear();

    for (const ev of (events || [])){
      eventsById.set(Number(ev.id), ev);
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
    // When no event is selected, the <select> value is "" which becomes 0.
    // Guard against calling APIs with event_id=0.
    if (!Number.isFinite(evId) || evId <= 0) {
      currentEventId = null;
      approveDocBtn.disabled = true;
      returnDocBtn.disabled = true;
      previewBtn.disabled = true;
      endEventBtn.style.display = 'none';
      return;
    }
    currentEventId = evId;

    // End event button visibility (Deputy should not see it; Admin/Protocol may)
    endEventBtn.style.display = canEndEvent ? 'inline-flex' : 'none';

    // Document status (workflow bar)
    const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
    const last = ds.updatedAt ? window.GCP.formatDateTime(ds.updatedAt) : '';
    const ev = eventsById.get(currentEventId);
    const submitterRole = (ds.submitterRole || ev?.submitter_role || 'minister');
    const steps = workflowSteps(String(submitterRole).toLowerCase());
    const active = statusStage(ds.status);
    const task = (ev?.task || '').trim();
    docStatusBox.innerHTML = `
      <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div><b>Status:</b> ${window.GCP.escapeHtml(humanStatus(ds.status) || '')}</div>
        ${last ? `<div class="muted">${window.GCP.escapeHtml(last)}</div>` : ''}
      </div>
      ${renderProgress(steps, active)}
      ${task ? `<div style="margin-top:10px;"><b>Task:</b> ${window.GCP.escapeHtml(task)}</div>` : ''}
      ${ds.chairmanComment ? `<div class="muted" style="margin-top:8px;"><b>Comment:</b> ${window.GCP.escapeHtml(ds.chairmanComment)}</div>` : ''}
    `;

    // Per-section status grid
    const grid = await window.GCP.apiFetch(`/tp/status-grid?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
    currentSections = grid.sections || [];

    for (const s of currentSections){
      const tr = document.createElement('tr');
      const lastUpdate = s.lastUpdatedAt ? window.GCP.formatDateTime(s.lastUpdatedAt) : '';
      const note = (s.statusComment || '').trim();
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(s.sectionLabel || '')}</td>
        <td>${pill(s.status)}${note ? `<div class="small" style="margin-top:4px; padding:6px 8px; border-radius:10px; border:1px solid rgba(220,38,38,.25); background: rgba(254,226,226,.55);"><b>Comment:</b> ${window.GCP.escapeHtml(note)}</div>` : ''}</td>
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
        try{
          await window.GCP.apiFetch('/tp/approve-section-chairman', {
            method:'POST',
            body: JSON.stringify({ eventId: currentEventId, sectionId: s.sectionId })
          });
          await refresh();
        }catch(e){
          setMsg(e.message || 'Failed to approve section', true);
        }
      });
      actionsTd.appendChild(approveBtn);

      const returnBtn = document.createElement('button');
      returnBtn.className = 'btn danger';
      returnBtn.textContent = 'Return section';
      returnBtn.style.marginLeft = '8px';
      returnBtn.addEventListener('click', async () => {
        const note = prompt('Return note (optional):', '') || '';
        try{
          await window.GCP.apiFetch('/tp/return', {
            method:'POST',
            body: JSON.stringify({ eventId: currentEventId, sectionId: s.sectionId, note })
          });
          await refresh();
        }catch(e){
          setMsg(e.message || 'Failed to return section', true);
        }
      });
      actionsTd.appendChild(returnBtn);

      sectionsTbody.appendChild(tr);
    }

    // Minister is the final approver when they see the event.
    approveDocBtn.textContent = 'Approve document';

    approveDocBtn.disabled = false;
    returnDocBtn.disabled = false;
    previewBtn.disabled = false;
  }

  approveDocBtn.addEventListener('click', async () => {
    setMsg('');
    if (!currentEventId) return;
    if (!confirm('Approve the full document?')) return;
    try{
      await window.GCP.apiFetch('/document/approve-minister', {
        method:'POST',
        body: JSON.stringify({ eventId: currentEventId })
      });
      await refresh();
    }catch(e){
      setMsg(e.message || 'Failed to approve document', true);
    }
  });

  returnDocBtn.addEventListener('click', async () => {
    setMsg('');
    if (!currentEventId) return;
    const note = prompt('Return note (optional):', '') || '';
    if (!confirm('Return the full document?')) return;
    try{
      await window.GCP.apiFetch('/document/return', {
        method:'POST',
        body: JSON.stringify({ eventId: currentEventId, note })
      });
      await refresh();
    }catch(e){
      setMsg(e.message || 'Failed to return document', true);
    }
  });

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
  
  approveAllSectionsBtn.addEventListener('click', async () => {
    if (!currentEventId) return;
    if (!confirm('Approve all required sections for this event?')) return;
    setMsg('');
    try{
      await window.GCP.apiFetch('/tp/approve-all-sections', {
        method:'POST',
        body: JSON.stringify({ eventId: currentEventId })
      });
      await refresh();
    }catch(e){
      setMsg(e.message || 'Failed to approve all sections', true);
    }
  });

eventSelect.addEventListener('change', refresh);

  await loadEvents();
  await refresh();
})();
