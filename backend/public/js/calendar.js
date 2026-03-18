// calendar.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const canManage = ['admin','deputy','minister','supervisor','protocol','super_collaborator'].includes(role);
  const canEnd = ['admin','deputy','supervisor','protocol'].includes(role);

  const msg = document.getElementById("msg");
  const eventsTbody = document.getElementById("eventsTbody");
  const form = document.getElementById("eventForm");
  const formCard = document.getElementById("formCard");

  const countrySelect = document.getElementById("countryId");
  const titleInput = document.getElementById("title");
  const occasionEditorContainer = document.getElementById("occasionEditor");
  const occasionEditor = window.GCP.createSimpleEditor(occasionEditorContainer, { placeholder: 'Enter task description...' });
  const deadlineInput = document.getElementById("deadlineDate");
  const submitterSelect = document.getElementById("submitterRole");
  const lowerSubmitterSelect = document.getElementById("lowerSubmitterRole");
  const languageSelect = document.getElementById("language");
  const requiredBox = document.getElementById("requiredSectionsBox");
  const saveBtn = document.getElementById("saveEventBtn");
  const resetBtn = document.getElementById("resetFormBtn");
  const eventsCards = document.getElementById("eventsCards");
  const eventsEmpty = document.getElementById("eventsEmpty");

  let editEventId = null;
  let allEvents = [];
  let activeTab = 'upcoming';
  const PAGE_SIZE = 5;
  let currentPage = 1;
  const eventsPagination = document.getElementById("eventsPagination");

  if (!canManage){
    formCard.style.display = "none";
  }

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = countries.map(c => `<option value="${c.id}">${window.GCP.escapeHtml(c.name_en)}</option>`).join("");
  }

  async function loadSections(){
    const sections = await window.GCP.apiFetch('/sections', { method:'GET' });
    const active = sections.filter(s => s.is_active);
    requiredBox.innerHTML = active.map(s => (
      `<label class="checkitem">
        <input type="checkbox" value="${s.id}">
        <span>${window.GCP.escapeHtml(s.label)}</span>
      </label>`
    )).join('');
  }

  function formatDate(d){
    return d ? String(d).slice(0,10) : "";
  }

  function submitterLabel(role){
    const key = String(role || 'deputy').toLowerCase();
    if (key === 'supervisor') return 'Supervisor';
    if (key === 'super_collaborator') return 'Super-collaborator';
    if (key === 'minister') return 'Minister';
    return 'Deputy';
  }

  function statusMeta(rawStatus, isActive){
    if (!isActive) return { key:'ended', label:'Ended', cls:'is-ended' };
    const s = String(rawStatus || 'draft').toLowerCase();
    const map = {
      draft: ['draft','Draft','is-draft'],
      in_progress: ['in_review','In review','is-review'],
      submitted_to_supervisor: ['in_review','In review','is-review'],
      approved_by_supervisor: ['in_review','In review','is-review'],
      submitted_to_deputy: ['submitted_to_deputy','Submitted to Deputy','is-submitted'],
      approved_by_deputy: ['approved','Approved','is-approved'],
      submitted_to_minister: ['submitted_to_minister','Submitted to Minister','is-submitted'],
      approved_by_minister: ['submitted_to_minister','Submitted to Minister','is-submitted'],
      returned: ['returned','Returned','is-returned'],
      approved: ['approved','Approved','is-approved'],
      locked: ['approved','Approved','is-approved']
    };
    const found = map[s] || ['in_review','In review','is-review'];
    return { key:found[0], label:found[1], cls:found[2] };
  }

  function dateMeta(value, isActive){
    if (!value) return { text:'—', sort:Number.POSITIVE_INFINITY, cls:'is-empty', iso:'' };
    const date = new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date(String(value)) : date;
    const dd = String(safeDate.getDate()).padStart(2,'0');
    const mm = String(safeDate.getMonth()+1).padStart(2,'0');
    const yyyy = safeDate.getFullYear();
    const text = `${dd}.${mm}.${yyyy}`;
    const sort = new Date(yyyy, safeDate.getMonth(), safeDate.getDate()).getTime();
    const today = new Date();
    const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    let cls = '';
    if (isActive && sort < todayFloor) cls = 'is-overdue';
    else if (isActive && sort <= todayFloor + 7*24*60*60*1000) cls = 'is-upcoming';
    return { text, sort, cls, iso: `${yyyy}-${mm}-${dd}` };
  }

  function escapeAttr(v){ return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

  function lowerSubmitterLabel(role){
    const key = String(role || 'collaborator_2').toLowerCase();
    if (key === 'collaborator_3') return 'Curator';
    return 'Head Collaborator';
  }

  function languageLabel(lang){
    const key = String(lang || 'en').toLowerCase();
    if (key === 'ka') return 'Georgian';
    if (key === 'ru') return 'Russian';
    return 'English';
  }

  function renderActions(ev, isPast){
    return `<div class="calendar-event-actions">
      <button class="micro-action calendar-micro-action calendar-action--view" data-act="view" data-id="${ev.id}" aria-label="View">
        <span class="micro-action__icon"></span><span class="micro-action__label">View</span>
      </button>
      ${canManage && !isPast ? `<button class="micro-action calendar-micro-action calendar-action--edit" data-act="edit" data-id="${ev.id}" aria-label="Edit"><span class="micro-action__icon"></span><span class="micro-action__label">Edit</span></button>` : ''}
      ${canEnd && !isPast ? `<button class="micro-action calendar-micro-action calendar-action--end" data-act="end" data-id="${ev.id}" aria-label="End event"><span class="micro-action__icon"></span><span class="micro-action__label">End event</span></button>` : ''}
    </div>`;
  }

  // --- Event detail modal ---
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'event-modal-overlay';
  modalOverlay.hidden = true;
  modalOverlay.innerHTML = `
    <div class="event-modal">
      <button class="event-modal__close" aria-label="Close">&times;</button>
      <div class="event-modal__body"></div>
    </div>`;
  document.body.appendChild(modalOverlay);
  const modalBody = modalOverlay.querySelector('.event-modal__body');
  const modalCloseBtn = modalOverlay.querySelector('.event-modal__close');

  function closeModal(){ modalOverlay.hidden = true; }
  modalCloseBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalOverlay.hidden) closeModal(); });

  function formatDateFull(d){
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    const dd = String(dt.getDate()).padStart(2,'0');
    const mm = String(dt.getMonth()+1).padStart(2,'0');
    const yyyy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2,'0');
    const min = String(dt.getMinutes()).padStart(2,'0');
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
  }

  async function handleViewEvent(ev){
    modalBody.innerHTML = '<div style="text-align:center;padding:32px;color:#73829c;">Loading...</div>';
    modalOverlay.hidden = false;

    try {
      const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:"GET" });
      const req = (details.required_sections || details.requiredSections || []);
      const sections = Array.isArray(req) ? req.map(s => window.GCP.escapeHtml(s.label)).filter(Boolean) : [];

      const isPast = !!details.ended_at;
      const status = statusMeta(null, !isPast);
      const deadline = dateMeta(details.deadline_date, !isPast);

      let html = `
        <div class="event-modal__header">
          <h2 class="event-modal__title">${window.GCP.escapeHtml(details.title || '—')}</h2>
          <span class="calendar-status-badge ${isPast ? 'is-ended' : (ev.statusClass || '')}">${isPast ? 'Ended' : window.GCP.escapeHtml(ev.statusLabel || 'Active')}</span>
        </div>
        <div class="event-modal__grid">
          <div class="event-modal__field">
            <span class="event-modal__label">Country</span>
            <span class="event-modal__value">${window.GCP.escapeHtml(details.country_name_en || '—')}</span>
          </div>
          <div class="event-modal__field">
            <span class="event-modal__label">Deadline</span>
            <span class="event-modal__value"><span class="calendar-deadline ${deadline.cls}">${window.GCP.escapeHtml(deadline.text)}</span></span>
          </div>
          <div class="event-modal__field">
            <span class="event-modal__label">Document submitter</span>
            <span class="event-modal__value">${window.GCP.escapeHtml(submitterLabel(details.submitter_role))}</span>
          </div>
          <div class="event-modal__field">
            <span class="event-modal__label">Lower level submitter</span>
            <span class="event-modal__value">${window.GCP.escapeHtml(lowerSubmitterLabel(details.lower_submitter_role))}</span>
          </div>
          <div class="event-modal__field">
            <span class="event-modal__label">Language</span>
            <span class="event-modal__value">${window.GCP.escapeHtml(languageLabel(details.language))}</span>
          </div>
          <div class="event-modal__field">
            <span class="event-modal__label">Created</span>
            <span class="event-modal__value">${window.GCP.escapeHtml(formatDateFull(details.created_at))}</span>
          </div>
          ${isPast ? `<div class="event-modal__field">
            <span class="event-modal__label">Ended</span>
            <span class="event-modal__value">${window.GCP.escapeHtml(formatDateFull(details.ended_at))}</span>
          </div>` : ''}
        </div>`;

      if (details.occasion) {
        html += `
        <div class="event-modal__section">
          <div class="event-modal__label">Task</div>
          <div class="event-modal__task">${details.occasion}</div>
        </div>`;
      }

      html += `
        <div class="event-modal__section">
          <div class="event-modal__label">Required sections</div>
          ${sections.length
            ? `<ul class="event-modal__sections">${sections.map(s => `<li>${s}</li>`).join('')}</ul>`
            : '<div class="event-modal__empty">No sections assigned.</div>'}
        </div>`;

      modalBody.innerHTML = html;
    } catch (e) {
      modalBody.innerHTML = `<div style="text-align:center;padding:32px;color:var(--danger);font-weight:700;">${window.GCP.escapeHtml(e.message || 'Failed to load event details')}</div>`;
    }
  }

  async function handleEditEvent(ev){
    const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:"GET" });
    editEventId = ev.id;
    countrySelect.value = String(details.country_id);
    titleInput.value = details.title || "";
    occasionEditor.setHtml(details.occasion || "");
    deadlineInput.value = formatDate(details.deadline_date);
    if (submitterSelect) submitterSelect.value = String(details.submitterRole || details.submitter_role || "deputy");
    if (lowerSubmitterSelect) lowerSubmitterSelect.value = String(details.lowerSubmitterRole || details.lower_submitter_role || "collaborator_2");
    if (languageSelect) languageSelect.value = String(details.language || "en");
    const req = (details.required_sections || details.requiredSections || []);
    const reqIds = new Set((Array.isArray(req) ? req : []).map(s => String(s.id)));
    for (const cb of requiredBox.querySelectorAll('input[type=checkbox]')){
      cb.checked = reqIds.has(String(cb.value));
    }
    saveBtn.textContent = "Update event";
    msg.textContent = `Editing event #${ev.id}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleEndEvent(ev){
    if (!confirm('End this event?')) return;
    await window.GCP.apiFetch(`/events/${ev.id}/end`, { method:'POST' });
    await loadEvents();
  }

  function attachEventActions(){
    document.querySelectorAll('[data-act="view"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ev = allEvents.find(item => String(item.id) === String(btn.dataset.id));
        if (ev) await handleViewEvent(ev);
      });
    });
    document.querySelectorAll('[data-act="edit"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ev = allEvents.find(item => String(item.id) === String(btn.dataset.id));
        if (ev) await handleEditEvent(ev);
      });
    });
    document.querySelectorAll('[data-act="end"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ev = allEvents.find(item => String(item.id) === String(btn.dataset.id));
        if (ev) await handleEndEvent(ev);
      });
    });
  }

  function applyFilters(events){
    return [...events].sort((a,b) => {
      return (a.deadlineSort === Infinity ? Number.MAX_SAFE_INTEGER : a.deadlineSort) - (b.deadlineSort === Infinity ? Number.MAX_SAFE_INTEGER : b.deadlineSort);
    });
  }

  function renderPagination(totalItems){
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    if (totalPages <= 1){ eventsPagination.hidden = true; return; }
    eventsPagination.hidden = false;

    let html = '';
    html += `<button class="calendar-page-btn calendar-page-arrow" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>&lsaquo;</button>`;
    for (let p = 1; p <= totalPages; p++){
      html += `<button class="calendar-page-btn${p === currentPage ? ' is-active' : ''}" data-page="${p}">${p}</button>`;
    }
    html += `<button class="calendar-page-btn calendar-page-arrow" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>&rsaquo;</button>`;
    eventsPagination.innerHTML = html;

    eventsPagination.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = Number(btn.dataset.page);
        if (p >= 1 && p <= totalPages && p !== currentPage){
          currentPage = p;
          renderEvents();
        }
      });
    });
  }

  function renderEvents(){
    const tabEvents = allEvents.filter(ev => {
      if (activeTab === 'past') return !!ev.ended_at;
      return !ev.ended_at;
    });
    const filtered = applyFilters(tabEvents);
    eventsTbody.innerHTML = '';
    eventsCards.innerHTML = '';

    if (!filtered.length){
      eventsEmpty.hidden = false;
      eventsEmpty.textContent = activeTab === 'past' ? 'No past events.' : 'No events yet.';
      eventsTbody.innerHTML = `<tr class="calendar-events-empty-row"><td colspan="6">${activeTab === 'past' ? 'No past events.' : 'No events yet.'}</td></tr>`;
      eventsPagination.hidden = true;
      return;
    }
    eventsEmpty.hidden = true;

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);
    const isPast = activeTab === 'past';

    pageItems.forEach((ev, index) => {
      const row = document.createElement('tr');
      row.className = 'calendar-events-row';
      row.innerHTML = `
        <td>
          <div class="calendar-event-title">${window.GCP.escapeHtml(ev.title)}</div>
          <div class="calendar-event-meta">Created ${window.GCP.escapeHtml(ev.createdLabel || '—')}</div>
        </td>
        <td>${window.GCP.escapeHtml(ev.country_name_en)}</td>
        <td><span class="calendar-deadline ${ev.deadlineClass}">${window.GCP.escapeHtml(ev.deadlineLabel)}</span></td>
        <td>${window.GCP.escapeHtml(ev.submitterLabel)}</td>
        <td><span class="calendar-status-badge ${ev.statusClass}">${window.GCP.escapeHtml(ev.statusLabel)}</span></td>
        <td>${renderActions(ev, isPast)}</td>
      `;
      eventsTbody.appendChild(row);

      const card = document.createElement('article');
      card.className = 'calendar-event-card';
      card.innerHTML = `
        <div class="calendar-event-card__top">
          <div>
            <div class="calendar-event-title">${window.GCP.escapeHtml(ev.title)}</div>
            <div class="calendar-event-meta">${window.GCP.escapeHtml(ev.country_name_en)} · ${window.GCP.escapeHtml(ev.submitterLabel)}</div>
          </div>
          <span class="calendar-status-badge ${ev.statusClass}">${window.GCP.escapeHtml(ev.statusLabel)}</span>
        </div>
        <div class="calendar-event-card__body">
          <div class="calendar-event-card__line"><span>Deadline</span><strong class="calendar-deadline ${ev.deadlineClass}">${window.GCP.escapeHtml(ev.deadlineLabel)}</strong></div>
        </div>
        ${renderActions(ev, isPast)}
      `;
      eventsCards.appendChild(card);
    });

    attachEventActions();
    renderPagination(filtered.length);
  }

  async function loadEvents(){
    const events = await window.GCP.apiFetch("/events?include_ended=1", { method:"GET" });
    const enriched = await Promise.all(events.map(async (ev) => {
      let doc = null;
      try {
        doc = await window.GCP.apiFetch(`/document-status?event_id=${ev.id}`, { method:'GET' });
      } catch (_) {}
      const status = statusMeta(doc?.status, !!ev.is_active);
      const deadline = dateMeta(ev.deadline_date, !!ev.is_active);
      const created = ev.created_at ? new Date(ev.created_at) : null;
      const createdLabel = created && !Number.isNaN(created.getTime())
        ? `${String(created.getDate()).padStart(2,'0')}.${String(created.getMonth()+1).padStart(2,'0')}.${created.getFullYear()}`
        : '';
      return {
        ...ev,
        statusKey: status.key,
        statusLabel: status.label,
        statusClass: status.cls,
        deadlineLabel: deadline.text,
        deadlineClass: deadline.cls,
        deadlineSort: deadline.sort,
        submitterLabel: submitterLabel(ev.submitter_role),
        createdLabel,
      };
    }));
    allEvents = enriched;
    renderEvents();
  }

  function resetForm(){
    editEventId = null;
    form.reset();
    occasionEditor.clear();
    if (submitterSelect) submitterSelect.value = "deputy";
    if (lowerSubmitterSelect) lowerSubmitterSelect.value = "collaborator_2";
    if (languageSelect) languageSelect.value = "en";
    saveBtn.textContent = "Create event";
    msg.style.color = "var(--danger)";
    msg.textContent = "";
  }

  resetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    resetForm();
  });


  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.style.color = "var(--danger)";
    msg.textContent = "";
    if (!canManage) return;

    const countryId = Number(countrySelect.value);
    const title = (titleInput.value || "").trim();
    const occasion = occasionEditor.getHtml();
    const deadlineDate = (deadlineInput.value || "").trim();
    const submitterRole = submitterSelect ? String(submitterSelect.value || "deputy") : "deputy";
    const lowerSubmitterRole = lowerSubmitterSelect ? String(lowerSubmitterSelect.value || "collaborator_2") : "collaborator_2";
    const language = languageSelect ? String(languageSelect.value || "en") : "en";
    const requiredSectionIds = Array.from(requiredBox.querySelectorAll('input[type=checkbox]:checked')).map(cb => Number(cb.value)).filter(Number.isFinite);

    if (!Number.isFinite(countryId) || !title) {
      msg.textContent = "Country and Title are required.";
      return;
    }

    const payload = { countryId, title, occasion, deadlineDate, requiredSectionIds, submitterRole, lowerSubmitterRole, language };

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = editEventId ? "Updating..." : "Creating...";

      if (editEventId) {
        await window.GCP.apiFetch(`/events/${editEventId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await window.GCP.apiFetch('/events', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      const wasEditing = !!editEventId;
      resetForm();
      msg.style.color = 'var(--success)';
      msg.textContent = wasEditing ? 'Event updated.' : 'Event created.';
      await loadEvents();
    } catch (err) {
      msg.style.color = 'var(--danger)';
      msg.textContent = err?.message || 'Failed to save event';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = editEventId ? 'Update event' : 'Create event';
    }
  });


  document.querySelectorAll('.calendar-events-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.calendar-events-tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeTab = btn.dataset.tab;
      currentPage = 1;
      renderEvents();
    });
  });

  try{
    await Promise.all([loadCountries(), loadSections()]);
    await loadEvents();
  }catch(err){
    msg.textContent = err.message || "Failed to load";
  }
})();
