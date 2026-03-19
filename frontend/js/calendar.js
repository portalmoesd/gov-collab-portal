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

  const eventsSearchInput = document.getElementById("eventsSearchInput");
  const eventsDateFilter = document.getElementById("eventsDateFilter");
  const eventsCountryFilter = document.getElementById("eventsCountryFilter");

  if (!canManage){
    formCard.style.display = "none";
  }

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = countries.map(c => `<option value="${c.id}">${window.GCP.escapeHtml(c.name_en)}</option>`).join("");
  }

  let allDepartments = [];

  async function loadSections(){
    const [sections, departments] = await Promise.all([
      window.GCP.apiFetch('/sections', { method:'GET' }),
      window.GCP.apiFetch('/departments', { method:'GET' }),
    ]);
    allDepartments = departments || [];
    const active = sections.filter(s => s.is_active);

    // Group departments by section_id
    const deptsBySection = {};
    for (const d of allDepartments) {
      if (!d.section_id) continue;
      if (!deptsBySection[d.section_id]) deptsBySection[d.section_id] = [];
      deptsBySection[d.section_id].push(d);
    }

    requiredBox.innerHTML = '';
    for (const s of active) {
      const sectionDepts = deptsBySection[s.id] || [];
      const group = document.createElement('div');
      group.className = 'section-dept-group';

      // Section-level checkbox (master toggle)
      const sectionLabel = document.createElement('label');
      sectionLabel.className = 'checkitem section-header';
      sectionLabel.innerHTML = `<input type="checkbox" data-section-id="${s.id}" value="${s.id}"><strong>${window.GCP.escapeHtml(s.label)}</strong>`;
      group.appendChild(sectionLabel);

      const sectionCb = sectionLabel.querySelector('input');

      // Department checkboxes (indented under the section)
      if (sectionDepts.length) {
        const deptsWrap = document.createElement('div');
        deptsWrap.className = 'section-depts';
        for (const d of sectionDepts) {
          const dLabel = document.createElement('label');
          dLabel.className = 'checkitem dept-item';
          dLabel.innerHTML = `<input type="checkbox" data-dept-id="${d.id}" data-parent-section="${s.id}" value="${d.id}"><span>${window.GCP.escapeHtml(d.name)}</span>`;
          deptsWrap.appendChild(dLabel);
        }
        group.appendChild(deptsWrap);

        const deptCbs = deptsWrap.querySelectorAll('input[type=checkbox]');

        // Section checkbox toggles all its departments
        sectionCb.addEventListener('change', () => {
          for (const cb of deptCbs) cb.checked = sectionCb.checked;
        });

        // If any dept unchecked, update section indeterminate; if all checked, check section
        for (const cb of deptCbs) {
          cb.addEventListener('change', () => {
            const total = deptCbs.length;
            const checked = Array.from(deptCbs).filter(c => c.checked).length;
            sectionCb.checked = checked > 0;
            sectionCb.indeterminate = checked > 0 && checked < total;
          });
        }
      }

      requiredBox.appendChild(group);
    }
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

      const reqDepts = (details.required_departments || details.requiredDepartments || []);

      html += `
        <div class="event-modal__section">
          <div class="event-modal__label">Required sections &amp; departments</div>
          ${req.length
            ? `<ul class="event-modal__sections">${req.map(s => {
                const sectionDepts = reqDepts.filter(d => d.section_id === s.id).map(d => window.GCP.escapeHtml(d.name));
                return `<li><strong>${window.GCP.escapeHtml(s.label)}</strong>${sectionDepts.length ? `<ul>${sectionDepts.map(dn => `<li>${dn}</li>`).join('')}</ul>` : ''}</li>`;
              }).join('')}</ul>`
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
    const reqDepts = (details.required_departments || details.requiredDepartments || []);
    const reqDeptIds = new Set((Array.isArray(reqDepts) ? reqDepts : []).map(d => String(d.id)));

    // Restore section checkboxes
    for (const cb of requiredBox.querySelectorAll('input[data-section-id]')){
      cb.checked = reqIds.has(String(cb.value));
      cb.indeterminate = false;
    }
    // Restore department checkboxes
    for (const cb of requiredBox.querySelectorAll('input[data-dept-id]')){
      cb.checked = reqDeptIds.has(String(cb.value));
    }
    // Update section indeterminate state based on department selections
    for (const cb of requiredBox.querySelectorAll('input[data-section-id]')){
      const sectionId = cb.dataset.sectionId;
      const deptCbs = requiredBox.querySelectorAll(`input[data-parent-section="${sectionId}"]`);
      if (deptCbs.length) {
        const checked = Array.from(deptCbs).filter(c => c.checked).length;
        cb.checked = checked > 0;
        cb.indeterminate = checked > 0 && checked < deptCbs.length;
      }
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
    let result = [...events];

    const keyword = (eventsSearchInput.value || '').trim().toLowerCase();
    if (keyword) {
      result = result.filter(ev =>
        (ev.title || '').toLowerCase().includes(keyword) ||
        (ev.country_name_en || '').toLowerCase().includes(keyword) ||
        (ev.submitterLabel || '').toLowerCase().includes(keyword)
      );
    }

    const dateVal = (eventsDateFilter.value || '').trim();
    if (dateVal) {
      result = result.filter(ev => {
        const evDate = ev.deadline_date ? String(ev.deadline_date).slice(0, 10) : '';
        return evDate === dateVal;
      });
    }

    const countryVal = eventsCountryFilter.value;
    if (countryVal) {
      result = result.filter(ev => String(ev.country_id) === countryVal);
    }

    result.sort((a,b) => {
      return (a.deadlineSort === Infinity ? Number.MAX_SAFE_INTEGER : a.deadlineSort) - (b.deadlineSort === Infinity ? Number.MAX_SAFE_INTEGER : b.deadlineSort);
    });

    return result;
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
      const hasFilters = eventsSearchInput.value.trim() || eventsDateFilter.value || eventsCountryFilter.value;
      const emptyMsg = hasFilters ? 'No events match your filters.' : (activeTab === 'past' ? 'No past events.' : 'No events yet.');
      eventsEmpty.hidden = false;
      eventsEmpty.textContent = emptyMsg;
      eventsTbody.innerHTML = `<tr class="calendar-events-empty-row"><td colspan="6">${window.GCP.escapeHtml(emptyMsg)}</td></tr>`;
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

    // Populate country filter from loaded events
    const countries = new Map();
    enriched.forEach(ev => {
      if (ev.country_id && ev.country_name_en) countries.set(String(ev.country_id), ev.country_name_en);
    });
    const currentVal = eventsCountryFilter.value;
    eventsCountryFilter.innerHTML = '<option value="">All countries</option>' +
      [...countries.entries()]
        .sort((a,b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => `<option value="${id}">${window.GCP.escapeHtml(name)}</option>`)
        .join('');
    eventsCountryFilter.value = currentVal;

    renderEvents();
  }

  function resetForm(){
    editEventId = null;
    form.reset();
    occasionEditor.clear();
    if (submitterSelect) submitterSelect.value = "deputy";
    if (lowerSubmitterSelect) lowerSubmitterSelect.value = "collaborator_2";
    if (languageSelect) languageSelect.value = "en";
    // Clear indeterminate state on section checkboxes
    for (const cb of requiredBox.querySelectorAll('input[data-section-id]')) {
      cb.indeterminate = false;
    }
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
    const requiredSectionIds = Array.from(requiredBox.querySelectorAll('input[data-section-id]:checked, input[data-section-id]:indeterminate')).map(cb => Number(cb.value)).filter(Number.isFinite);
    // Also include sections that are indeterminate (some depts checked)
    const indeterminateSections = Array.from(requiredBox.querySelectorAll('input[data-section-id]')).filter(cb => cb.indeterminate).map(cb => Number(cb.value));
    for (const sid of indeterminateSections) {
      if (!requiredSectionIds.includes(sid)) requiredSectionIds.push(sid);
    }
    const requiredDepartmentIds = Array.from(requiredBox.querySelectorAll('input[data-dept-id]:checked')).map(cb => Number(cb.value)).filter(Number.isFinite);

    if (!Number.isFinite(countryId) || !title) {
      msg.textContent = "Country and Title are required.";
      return;
    }

    const payload = { countryId, title, occasion, deadlineDate, requiredSectionIds, requiredDepartmentIds, submitterRole, lowerSubmitterRole, language };

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


  function onFilterChange(){
    currentPage = 1;
    renderEvents();
  }
  eventsSearchInput.addEventListener('input', onFilterChange);
  eventsDateFilter.addEventListener('change', onFilterChange);
  eventsCountryFilter.addEventListener('change', onFilterChange);

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
