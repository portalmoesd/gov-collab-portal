// dashboard-collab.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const eventsTbody = document.getElementById('eventsTbody');
  const eventSelect = document.getElementById('eventSelect');
  const sectionSelect = document.getElementById('sectionSelect');
  const openBtn = document.getElementById('openEditorBtn');
  const msg = document.getElementById('msg');

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

    const ev = await window.GCP.apiFetch(`/events/${eventId}`, { method:'GET' });
        const sections = (ev.required_sections || ev.requiredSections || []).slice().sort((a,b)=> (a.order_index||0)-(b.order_index||0));

    sectionSelect.innerHTML = `<option value="">Select section...</option>`;
    for (const s of sections){
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      sectionSelect.appendChild(opt);
    }
    sectionSelect.disabled = false;
  }

  eventSelect.addEventListener('change', async () => {
    setMsg('', false);
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