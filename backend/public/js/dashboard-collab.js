// dashboard-collab.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const eventsTbody = document.getElementById('eventsTbody');
  const eventSelect = document.getElementById('eventSelect');
  const sectionSelect = document.getElementById('sectionSelect');
  const openBtn = document.getElementById('openEditorBtn');
  const msg = document.getElementById('msg');
  const sectionStatusBox = document.getElementById('sectionStatusBox');

  function humanStatus(s){
    const map = {
      draft: 'Draft',
      submitted: 'Submitted',
      returned: 'Returned',
      approved_by_supervisor: 'Approved (Supervisor)',
      approved_by_chairman: 'Approved (Deputy)'
    };
    return map[s] || (s || '');
  }

  function showSectionStatus(tp){
    if (!sectionStatusBox) return;
    if (!tp){
      sectionStatusBox.style.display = 'none';
      sectionStatusBox.textContent = '';
      return;
    }
    const note = (tp.statusComment || '').trim();
    const last = tp.lastUpdatedAt ? window.GCP.formatDateTime(tp.lastUpdatedAt) : '';
    sectionStatusBox.style.display = 'block';
    sectionStatusBox.innerHTML = `
      <div><b>Status:</b> ${window.GCP.escapeHtml(humanStatus(tp.status))}</div>
      ${last ? `<div class="small muted" style="margin-top:4px;">Last updated: ${window.GCP.escapeHtml(last)}${tp.lastUpdatedBy ? ' • ' + window.GCP.escapeHtml(tp.lastUpdatedBy) : ''}</div>` : ''}
      ${note ? `<div style="margin-top:8px; padding:8px 10px; border-radius:10px; border:1px solid rgba(220,38,38,.25); background: rgba(254,226,226,.55);"><b>Supervisor/Deputy comment:</b> ${window.GCP.escapeHtml(note)}</div>` : ''}
    `;
  }

  function setMsg(text, isError=false){
    msg.textContent = text || '';
    msg.style.color = isError ? 'crimson' : '#2b445b';
  }

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    eventsTbody.innerHTML = '';
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    sectionSelect.innerHTML = `<option value="">Select section...</option>`;
    sectionSelect.disabled = true;

    for (const ev of (events || [])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ev.title || ''}</td>
        <td>${ev.country_name_en || ''}</td>
        <td>${ev.occasion || ''}</td>
        <td>${window.GCP.formatDate(ev.deadline_date) || ''}</td>
      `;
      eventsTbody.appendChild(tr);

      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = `${ev.title || 'Event'} (${ev.country_name_en || ''}${ev.deadline_date ? ', ' + window.GCP.formatDate(ev.deadline_date) : ''})`;
      eventSelect.appendChild(opt);
    }
  }

  async function loadSectionsForEvent(eventId){
    sectionSelect.innerHTML = `<option value="">Loading...</option>`;
    sectionSelect.disabled = true;

    const ev = await window.GCP.apiFetch(`/events/${eventId}/my-sections`, { method:'GET' });
        const sections = (ev.required_sections || ev.requiredSections || []).slice().sort((a,b)=> ((a.order_index||a.sort_order||0) - (b.order_index||b.sort_order||0)));

    sectionSelect.innerHTML = `<option value="">Select section...</option>`;
    for (const s of sections){
      const opt = document.createElement('option');
      opt.value = (s.id != null ? s.id : s.section_id);
      opt.textContent = s.label;
      sectionSelect.appendChild(opt);
    }
    sectionSelect.disabled = false;

    // reset status box
    showSectionStatus(null);
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
      showSectionStatus(null);
      return;
    }
    try{
      const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`, { method:'GET' });
      showSectionStatus(tp);
    }catch(e){
      showSectionStatus(null);
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