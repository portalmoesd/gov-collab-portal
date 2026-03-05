// dashboard-collab.js
(async function(){
  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  const me = await window.GCP.requireAuth();
  if (!me) return;

  const eventsGrid = document.getElementById('eventsGrid');
  const eventsCalendar = document.getElementById('eventsCalendar');
  const calMonthLabel = document.getElementById('calMonthLabel');
  const calPrevBtn = document.getElementById('calPrevBtn');
  const calNextBtn = document.getElementById('calNextBtn');
  const eventSelect = document.getElementById('eventSelect');
  const sectionSelect = document.getElementById('sectionSelect');
  const openBtn = document.getElementById('openEditorBtn');
  const msg = document.getElementById('msg');
  const sectionStatusBox = document.getElementById('sectionStatusBox');

  let eventMeta = {}; // { [eventId]: { taskText, submitterRole } }
  let taskText = '';
  let submitterRole = 'deputy';

  function humanDocStatus(s){
    const map = {
      draft: 'Draft',
      returned: 'Returned',
      submitted_to_supervisor: 'Submitted to Supervisor',
      submitted_to_chairman: 'Submitted to Deputy',
      submitted_to_minister: 'Submitted to Minister',
      approved: 'Approved'
    };
    return map[s] || (s || '');
  }

  function normalizeSubmitterRole(r){
    const v = String(r || '').toLowerCase();
    return v === 'chairman' ? 'deputy' : v;
  }

  async function showSectionStatus(eventId, tp){
    if (!sectionStatusBox) return;
    if (!tp){
      sectionStatusBox.style.display = 'none';
      sectionStatusBox.textContent = '';
      return;
    }

    // Document status is per-event; fetch it so the progress bar matches the selected submitter flow.
    let doc = null;
    try{
      doc = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(eventId)}`, { method:'GET' });
    }catch(e){
      // keep going; we'll render without it
    }

    const note = (tp.statusComment || '').trim();
    const last = (doc && doc.updatedAt) ? window.GCP.formatDateTime(doc.updatedAt) : (tp.lastUpdatedAt ? window.GCP.formatDateTime(tp.lastUpdatedAt) : '');
    const docStatus = doc ? doc.status : 'draft';

    sectionStatusBox.style.display = 'block';
    sectionStatusBox.innerHTML = `
      <div style="margin-bottom:8px;"><b>Status:</b> ${window.GCP.escapeHtml(humanDocStatus(docStatus))}</div>
      <div>${window.GCP.renderStatusProgress(docStatus, submitterRole)}</div>
      ${last ? `<div class="small muted" style="margin-top:6px;">Last updated: ${window.GCP.escapeHtml(last)}</div>` : ''}
      ${note ? `<div style="margin-top:10px; padding:8px 10px; border-radius:10px; border:1px solid rgba(220,38,38,.25); background: rgba(254,226,226,.55);"><b>Supervisor/Deputy comment:</b> ${window.GCP.escapeHtml(note)}</div>` : ''}
      <div style="margin-top:12px;"><b>Task:</b> ${window.GCP.escapeHtml((taskText || '').trim() || '—')}</div>
    `;
  }



  function setMsg(text, isError=false){
    msg.textContent = text || '';
    msg.style.color = isError ? 'crimson' : '#2b445b';
  }


  // ===== Calendar (monthly) =====
  let calYear = null;
  let calMonth = null; // 0-11
  let upcomingEventsCache = [];

  function toDateOnly(dStr){
    if (!dStr) return null;
    // Accept 'YYYY-MM-DD' or ISO
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function monthName(y,m){
    return new Date(y, m, 1).toLocaleDateString(undefined, { month:'long', year:'numeric' });
  }

  function sameDay(a,b){
    return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  }

  function renderCalendar(){
    if (!eventsCalendar) return;
    if (calYear === null || calMonth === null){
      const today = new Date();
      calYear = today.getFullYear();
      calMonth = today.getMonth();
    }
    if (calMonthLabel) calMonthLabel.textContent = monthName(calYear, calMonth);

    const first = new Date(calYear, calMonth, 1);
    const startDow = first.getDay(); // 0 Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const prevDays = new Date(calYear, calMonth, 0).getDate();

    // Map events by date within visible grid
    const byDay = {};
    for (const ev of (upcomingEventsCache || [])){
      const d = toDateOnly(ev.deadline_date);
      if (!d) continue;
      const key = d.toISOString().slice(0,10);
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(ev);
    }

    const dows = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    let html = '<div class="cal-grid">';
    for (const d of dows){
      html += `<div class="cal-dow">${d}</div>`;
    }

    // 6 weeks grid (42 cells)
    for (let i=0;i<42;i++){
      const cellIndex = i - startDow;
      let dayNum, cellDate, muted = false;
      if (cellIndex < 0){
        dayNum = prevDays + cellIndex + 1;
        cellDate = new Date(calYear, calMonth-1, dayNum);
        muted = true;
      } else if (cellIndex >= daysInMonth){
        dayNum = cellIndex - daysInMonth + 1;
        cellDate = new Date(calYear, calMonth+1, dayNum);
        muted = true;
      } else {
        dayNum = cellIndex + 1;
        cellDate = new Date(calYear, calMonth, dayNum);
      }

      const key = cellDate.toISOString().slice(0,10);
      const hasEv = !!byDay[key]?.length;
      html += `<button type="button" class="cal-cell${muted?' muted':''}${hasEv?' has-event':''}" data-date="${key}" aria-label="${key}">
                <div>${dayNum}</div>
                ${hasEv ? '<div class="cal-dot"></div>' : ''}
              </button>`;
    }
    html += '</div>';
    eventsCalendar.innerHTML = html;

    // click a day: scroll to cards and optionally highlight matching ones
    eventsCalendar.querySelectorAll('.cal-cell').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-date');
        if (!key) return;
        const list = (byDay[key] || []);
        // If there are events that day, gently scroll to cards; we keep cards as source of details
        if (list.length){
          const firstId = String(list[0].id);
          const card = document.querySelector(`.event-card[data-event-id="${firstId}"]`);
          if (card){
            card.scrollIntoView({behavior:'smooth', block:'center'});
            card.classList.add('pulse');
            setTimeout(()=>card.classList.remove('pulse'), 900);
          } else {
            const openSection = document.getElementById('eventsGrid');
            if (openSection) openSection.scrollIntoView({behavior:'smooth', block:'start'});
          }
        }
      });
    });
  }

  function bindCalendarNav(){
    if (calPrevBtn){
      calPrevBtn.addEventListener('click', () => {
        calMonth -= 1;
        if (calMonth < 0){ calMonth = 11; calYear -= 1; }
        renderCalendar();
      });
    }
    if (calNextBtn){
      calNextBtn.addEventListener('click', () => {
        calMonth += 1;
        if (calMonth > 11){ calMonth = 0; calYear += 1; }
        renderCalendar();
      });
    }
  }
  async function loadUpcoming(){
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    upcomingEventsCache = (events || []).slice();
    // If first load, jump calendar to the month of the nearest upcoming deadline (if available)
    if (calYear === null || calMonth === null){
      const dates = upcomingEventsCache.map(e=>toDateOnly(e.deadline_date)).filter(Boolean).sort((a,b)=>a-b);
      if (dates.length){ calYear = dates[0].getFullYear(); calMonth = dates[0].getMonth(); }
    }
    renderCalendar();

    eventMeta = {};
    if (eventsGrid) eventsGrid.innerHTML = '';
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    sectionSelect.innerHTML = `<option value="">Select section...</option>`;
    sectionSelect.disabled = true;

    for (const ev of (events || [])) {
      eventMeta[ev.id] = {
        taskText: ev.task || ev.occasion || '',
        submitterRole: normalizeSubmitterRole(ev.submitter_role)
      };
      if (eventsGrid){
        const card = document.createElement('div');
        card.className = 'event-card';
        card.setAttribute('data-event-id', String(ev.id));
        const deadline = window.GCP.formatDate(ev.deadline_date) || '';
        const country = ev.country_name_en || '';
        const task = ev.task || ev.occasion || '';
        card.innerHTML = `
          <div class="row1">
            <div>
              <div class="title">${escapeHtml(ev.title || '')}</div>
              <div class="meta">
                <span class="badge primary">${escapeHtml(country)}</span>
                ${deadline ? `<span class="badge">Deadline: ${escapeHtml(deadline)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="task">${escapeHtml(task)}</div>
          <div class="actions">
            <button class="openmini" type="button">Open</button>
          </div>
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
      // Cache event meta for status bar
      taskText = (eventMeta[eventId] && eventMeta[eventId].taskText) || '';
      submitterRole = (eventMeta[eventId] && eventMeta[eventId].submitterRole) || 'deputy';
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
      await showSectionStatus(eventId, null);
      return;
    }
    try{
      const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`, { method:'GET' });
      await showSectionStatus(eventId, tp);
    }catch(e){
      await showSectionStatus(eventId, null);
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

  bindCalendarNav();
  await loadUpcoming();
})();