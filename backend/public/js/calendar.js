// calendar.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const canManage = ['admin','chairman','supervisor','protocol'].includes(role);
  const canEnd = ['admin','chairman','supervisor','protocol'].includes(role);

  const msg = document.getElementById('msg');
  const eventsTbody = document.getElementById('eventsTbody');
  const form = document.getElementById('eventForm');
  const formCard = document.getElementById('formCard');

  const countrySelect = document.getElementById('countryId');
  const titleInput = document.getElementById('title');
  const occasionInput = document.getElementById('occasion');
  const deadlineInput = document.getElementById('deadlineDate');
  const requiredBox = document.getElementById('requiredSectionsBox');
  const saveBtn = document.getElementById('saveEventBtn');
  const resetBtn = document.getElementById('resetFormBtn');

  const monthLabel = document.getElementById('calendarMonthLabel');
  const miniGrid = document.getElementById('calendarMiniGrid');
  const selectedDateLabel = document.getElementById('selectedDateLabel');
  const dayAgendaList = document.getElementById('dayAgendaList');
  const clearDateFilterBtn = document.getElementById('clearDateFilterBtn');
  const monthPrevBtn = document.getElementById('monthPrevBtn');
  const monthNextBtn = document.getElementById('monthNextBtn');
  const statIds = ['eventCountStat','eventCountStatDesktop'];
  const upcomingStatIds = ['upcomingCountStat','upcomingCountStatDesktop'];
  const overdueStatIds = ['overdueCountStatDesktop'];
  const filterButtons = Array.from(document.querySelectorAll('.calendar-filter'));

  let editEventId = null;
  let eventsCache = [];
  let selectedDate = null;
  let activeFilter = 'all';
  const today = new Date();
  const todayKey = toDateKey(today);
  let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  if (!canManage){
    formCard.style.display = 'none';
  }

  function escapeHtml(value){
    return window.GCP.escapeHtml(String(value || ''));
  }

  function toDateKey(value){
    if (!value) return '';
    const d = (value instanceof Date) ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function formatDate(value){
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0,10);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  function formatMonthYear(date){
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  function setText(ids, value){
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    });
  }

  async function loadCountries(){
    const countries = await window.GCP.apiFetch('/countries', { method:'GET' });
    countrySelect.innerHTML = countries.map(c => `<option value="${c.id}">${escapeHtml(c.name_en)}</option>`).join('');
  }

  async function loadSections(){
    const sections = await window.GCP.apiFetch('/sections', { method:'GET' });
    const active = sections.filter(s => s.is_active);
    requiredBox.innerHTML = active.map(s => (
      `<label class="calendar-section-chip">
        <input type="checkbox" value="${s.id}">
        <span>${escapeHtml(s.label)}</span>
      </label>`
    )).join('');
  }

  function getFilteredEvents(){
    const nowKey = todayKey;
    const month = currentMonth.getMonth();
    const year = currentMonth.getFullYear();

    return eventsCache.filter(ev => {
      const key = toDateKey(ev.deadline_date);
      if (selectedDate && key !== selectedDate) return false;
      if (activeFilter === 'upcoming') return key && key >= nowKey;
      if (activeFilter === 'overdue') return key && key < nowKey;
      if (activeFilter === 'thisMonth') {
        if (!key) return false;
        const d = new Date(ev.deadline_date);
        return d.getFullYear() === year && d.getMonth() === month;
      }
      return true;
    });
  }

  function buildStatusBadge(ev){
    const key = toDateKey(ev.deadline_date);
    if (!key) return '<span class="status-badge neutral">No deadline</span>';
    if (key < todayKey) return '<span class="status-badge danger">Overdue</span>';
    if (key === todayKey) return '<span class="status-badge warn">Today</span>';
    return '<span class="status-badge primary">Upcoming</span>';
  }

  function renderEvents(){
    const filtered = getFilteredEvents();
    eventsTbody.innerHTML = '';

    if (!filtered.length){
      eventsTbody.innerHTML = `<tr><td colspan="5"><div class="calendar-empty">No events found for this view.</div></td></tr>`;
      return;
    }

    for (const ev of filtered){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="event-row-title">${escapeHtml(ev.title)}</div>
          <div class="event-row-sub">${escapeHtml(ev.occasion || 'No task details')}</div>
        </td>
        <td>${escapeHtml(ev.country_name_en)}</td>
        <td>${ev.deadline_date ? escapeHtml(formatDate(ev.deadline_date)) : '<span class="muted">—</span>'}</td>
        <td>${buildStatusBadge(ev)}</td>
        <td class="row event-row-actions">
          <button class="btn" data-act="view">View</button>
          ${canManage ? `<button class="btn primary" data-act="edit">Edit</button>` : ''}
          ${canEnd ? `<button class="btn danger" data-act="end">End event</button>` : ''}
        </td>
      `;

      tr.querySelector('[data-act="view"]').addEventListener('click', async () => {
        const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:'GET' });
        const req = (details.required_sections || details.requiredSections || []);
        const labels = Array.isArray(req) ? req.map(s => s.label).filter(Boolean) : [];
        alert(`Required sections:\n\n${labels.length ? labels.join('\n') : '—'}`);
      });

      if (canManage){
        tr.querySelector('[data-act="edit"]').addEventListener('click', async () => {
          const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:'GET' });
          editEventId = ev.id;
          countrySelect.value = String(details.country_id);
          titleInput.value = details.title || '';
          occasionInput.value = details.occasion || '';
          deadlineInput.value = details.deadline_date ? toDateKey(details.deadline_date) : '';
          const req = (details.required_sections || details.requiredSections || []);
          const reqIds = new Set((Array.isArray(req) ? req : []).map(s => String(s.id)));
          for (const cb of requiredBox.querySelectorAll('input[type=checkbox]')){
            cb.checked = reqIds.has(String(cb.value));
          }
          saveBtn.textContent = 'Update event';
          msg.textContent = `Editing event #${ev.id}`;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }

      if (canEnd){
        const endBtn = tr.querySelector('[data-act="end"]');
        endBtn?.addEventListener('click', async () => {
          if (!confirm('End this event?')) return;
          await window.GCP.apiFetch(`/events/${ev.id}/end`, { method:'POST' });
          await loadEvents();
        });
      }

      eventsTbody.appendChild(tr);
    }
  }

  function renderMiniCalendar(){
    monthLabel.textContent = formatMonthYear(currentMonth);
    miniGrid.innerHTML = '';

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const firstWeekday = (first.getDay() + 6) % 7; // Monday start
    const eventMap = new Map();

    eventsCache.forEach(ev => {
      const key = toDateKey(ev.deadline_date);
      if (!key) return;
      const count = eventMap.get(key) || 0;
      eventMap.set(key, count + 1);
    });

    for (let i = 0; i < firstWeekday; i++) {
      const blank = document.createElement('button');
      blank.className = 'cal-cell blank';
      blank.type = 'button';
      blank.disabled = true;
      miniGrid.appendChild(blank);
    }

    for (let day = 1; day <= last.getDate(); day++){
      const key = toDateKey(new Date(year, month, day));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-cell';
      btn.textContent = String(day);
      if (eventMap.has(key)) btn.classList.add('has');
      if (key === todayKey) btn.classList.add('today');
      if (selectedDate === key) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        selectedDate = (selectedDate === key) ? null : key;
        renderMiniCalendar();
        renderAgenda();
        renderEvents();
      });
      miniGrid.appendChild(btn);
    }
  }

  function renderAgenda(){
    const source = selectedDate ? eventsCache.filter(ev => toDateKey(ev.deadline_date) === selectedDate) : getFilteredEvents().slice(0, 4);
    selectedDateLabel.textContent = selectedDate ? formatDate(selectedDate) : 'All events';

    if (!source.length){
      dayAgendaList.innerHTML = '<div class="agenda-empty">No events for this selection.</div>';
      return;
    }

    dayAgendaList.innerHTML = source.slice(0, 4).map(ev => `
      <article class="agenda-item">
        <div class="agenda-item__title">${escapeHtml(ev.title)}</div>
        <div class="agenda-item__meta">${escapeHtml(ev.country_name_en)} · ${ev.deadline_date ? escapeHtml(formatDate(ev.deadline_date)) : 'No deadline'}</div>
      </article>
    `).join('');
  }

  function renderStats(){
    const total = eventsCache.length;
    const upcoming = eventsCache.filter(ev => {
      const key = toDateKey(ev.deadline_date);
      return key && key >= todayKey;
    }).length;
    const overdue = eventsCache.filter(ev => {
      const key = toDateKey(ev.deadline_date);
      return key && key < todayKey;
    }).length;

    setText(statIds, total);
    setText(upcomingStatIds, upcoming);
    setText(overdueStatIds, overdue);
  }

  async function loadEvents(){
    eventsCache = await window.GCP.apiFetch('/events?is_active=true', { method:'GET' });
    renderStats();
    renderMiniCalendar();
    renderAgenda();
    renderEvents();
  }

  function resetForm(){
    editEventId = null;
    form.reset();
    saveBtn.textContent = 'Create event';
    msg.textContent = '';
  }

  resetBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    resetForm();
  });

  clearDateFilterBtn?.addEventListener('click', () => {
    selectedDate = null;
    renderMiniCalendar();
    renderAgenda();
    renderEvents();
  });

  monthPrevBtn?.addEventListener('click', () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    renderMiniCalendar();
  });

  monthNextBtn?.addEventListener('click', () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    renderMiniCalendar();
  });

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter || 'all';
      filterButtons.forEach(b => b.classList.toggle('is-active', b === btn));
      renderAgenda();
      renderEvents();
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canManage) return;

    const requiredSectionIds = Array.from(requiredBox.querySelectorAll('input[type=checkbox]:checked')).map(cb => Number(cb.value));
    const payload = {
      countryId: Number(countrySelect.value),
      title: titleInput.value.trim(),
      occasion: occasionInput.value.trim() || null,
      deadlineDate: deadlineInput.value || null,
      requiredSectionIds,
    };

    try {
      if (!payload.title){
        msg.textContent = 'Title is required.';
        return;
      }
      if (editEventId){
        await window.GCP.apiFetch(`/events/${editEventId}`, { method:'PUT', body: JSON.stringify(payload) });
      } else {
        await window.GCP.apiFetch('/events', { method:'POST', body: JSON.stringify(payload) });
      }
      resetForm();
      await loadEvents();
      msg.textContent = 'Saved.';
    } catch (err){
      msg.textContent = err.message || 'Failed';
    }
  });

  try {
    await Promise.all([loadCountries(), loadSections()]);
    await loadEvents();
  } catch (err){
    msg.textContent = err.message || 'Failed to load';
  }
})();
