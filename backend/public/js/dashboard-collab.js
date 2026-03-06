// dashboard-collab.js
(async function(){
  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  const me = await window.GCP.requireAuth();
  if (!me) return;

  const eventsGrid = document.getElementById('eventsGrid');
  const eventSelect = document.getElementById('eventSelect');
  const sectionSelect = document.getElementById('sectionSelect');
  const openBtn = document.getElementById('openEditorBtn');
  const msg = document.getElementById('msg');
  const sectionStatusBox = document.getElementById('sectionStatusBox');
  const eventsById = new Map();


  function humanStatus(s){
    const map = {
      // document workflow
      in_progress: 'Draft',
      draft: 'Draft',
      returned: 'Returned',
      submitted_to_supervisor: 'Submitted',
      submitted_to_chairman: 'Submitted',
      submitted_to_deputy: 'Submitted',
      submitted_to_minister: 'Submitted',
      approved: 'Approved',

      // legacy section values (fallback)
      submitted: 'Submitted',
      approved_by_supervisor: 'Approved',
      approved_by_chairman: 'Approved'
    };
    return map[s] || (s || '');
  }


  function showSectionStatus(tp, taskText, docStatus){
    if (!sectionStatusBox) return;
    if (!tp){
      sectionStatusBox.style.display = 'none';
      sectionStatusBox.textContent = '';
      return;
    }
    const note = (tp.statusComment || '').trim();
    const last = tp.lastUpdatedAt ? window.GCP.formatDateTime(tp.lastUpdatedAt) : '';
    const docStatusKey = String(docStatus?.status || 'in_progress').toLowerCase();
    const submitterRole = docStatus?.submitterRole || docStatus?.submitter_role || 'chairman';
    sectionStatusBox.style.display = 'block';
    sectionStatusBox.innerHTML = `
      <div style="margin-bottom:8px;"><b>Status:</b> ${window.GCP.escapeHtml(humanStatus(docStatusKey))}</div>
      <div>${window.GCP.renderWorkflowProgress(docStatusKey, submitterRole)}</div>
            ${note ? `<div style="margin-top:10px; padding:8px 10px; border-radius:10px; border:1px solid rgba(220,38,38,.25); background: rgba(254,226,226,.55);"><b>Supervisor/Deputy comment:</b> ${window.GCP.escapeHtml(note)}</div>` : ''}
      <div style="margin-top:12px;"><b>Task:</b> ${window.GCP.escapeHtml((taskText || '').trim() || '—')}</div>
    `;
  }

  async function fetchDocStatus(eventId){
    if (!Number.isFinite(eventId)) return null;
    try{
      return await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(eventId)}`, { method: 'GET' });
    }catch(e){
      return null;
    }
  }



  function setMsg(text, isError=false){
    msg.textContent = text || '';
    msg.style.color = isError ? 'crimson' : '#2b445b';
  }

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    eventsById.clear();
    for (const ev of (events || [])) eventsById.set(Number(ev.id), ev);

    if (eventsGrid) eventsGrid.innerHTML = '';
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    sectionSelect.innerHTML = `<option value="">Select section...</option>`;
    sectionSelect.disabled = true;

    for (const ev of (events || [])) {
      if (eventsGrid){
        const card = document.createElement('div');
        card.className = 'event-card';
        const deadline = window.GCP.formatDate(ev.deadline_date) || '';
        const country = ev.country_name_en || '';
        const task = ev.task || ev.occasion || '';
        card.innerHTML = `
          <div class="row1">
            <button class="openmini openmini-top" type="button">Open</button>
            <div>
              <div class="title">${escapeHtml(ev.title || '')}</div>
              <div class="meta">
                <span class="badge primary">${escapeHtml(country)}</span>
                ${deadline ? `<span class="badge">Deadline: ${escapeHtml(deadline)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="task">${escapeHtml(task)}</div>
`;
        card.querySelector('button.openmini').addEventListener('click', () => {
          // Preselect the event in the editor launcher below
          eventSelect.value = String(ev.id);
          eventSelect.dispatchEvent(new Event('change'));
          const openSection = document.getElementById('openEditorSection');
          if (openSection) openSection.scrollIntoView({behavior:'smooth', block:'start'});
        });
        eventsGrid.appendChild(card);
      }

      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = `${ev.title || 'Event'} (${ev.country_name_en || ''}${ev.deadline_date ? ', ' + window.GCP.formatDate(ev.deadline_date) : ''})`;
      eventSelect.appendChild(opt);
    }
  }

  async function loadSectionsForEvent(eventId){
    sectionSelect.innerHTML = `<option value="">Loading...</option>`;
    console.debug('Loading allowed sections for event', eventId);

    sectionSelect.disabled = true;

    // Single source of truth: backend filters by assignments for collaborators/super-collaborators.
    const r = await window.GCP.apiFetch(`/my/sections?event_id=${encodeURIComponent(eventId)}`, { method:'GET' });
    const sections = (r.sections || []).slice().sort((a,b)=> ((a.order_index||a.sort_order||0) - (b.order_index||b.sort_order||0)));

    sectionSelect.innerHTML = `<option value="">Select section...</option>`;
    for (const s of sections){
      const opt = document.createElement('option');
      opt.value = (s.id != null ? s.id : s.section_id);
      opt.textContent = s.label;
      sectionSelect.appendChild(opt);
    }
    sectionSelect.disabled = false;

    // reset status box
    showSectionStatus(null, (eventsById.get(Number(eventSelect.value))||{}).occasion||'');
  }

  eventSelect.addEventListener('change', async () => {
    setMsg('');
    setMsg('');
    const eventId = Number(eventSelect.value);
    if (!Number.isFinite(eventId)) {
      sectionSelect.innerHTML = `<option value="">Select section...</option>`;
      sectionSelect.disabled = true;
      return;
    }
    try{
      await loadSectionsForEvent(eventId);
    }catch(e){
      setMsg(e.message || 'Failed to load event', true);
      sectionSelect.innerHTML = `<option value="">Select section...</option>`;
      sectionSelect.disabled = true;
    }
  });

  sectionSelect.addEventListener('change', async () => {
    setMsg('');
    const eventId = Number(eventSelect.value);
    const sectionId = Number(sectionSelect.value);
    if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
      return;
    }
    try{
      const [tp, ds] = await Promise.all([
        window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`, { method:'GET' }),
        fetchDocStatus(eventId),
      ]);
      showSectionStatus(tp, (eventsById.get(eventId)||{}).occasion||'', ds);
    }catch(e){
      console.warn(e);
    }
  });

  openBtn.addEventListener('click', () => {
    setMsg('');
    const eventId = Number(eventSelect.value);
    const sectionId = Number(sectionSelect.value);
    if (!Number.isFinite(eventId) || !Number.isFinite(sectionId)) {
      setMsg('Please select an event and a section.', true);
      return;
    }
    window.location.href = `editor.html?event_id=${eventId}&section_id=${sectionId}`;
  });

  await loadUpcoming();
})();