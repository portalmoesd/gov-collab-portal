// dashboard-super-collab.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;
  const role = String(me.role || '').toLowerCase();
  const roleHome = {
    super_collaborator: 'dashboard-super-collab.html',
    collaborator: 'dashboard-collab-review.html',
    collaborator_2: 'dashboard-collab-2.html',
    collaborator_1: 'dashboard-collab.html'
  };
  if (role !== 'collaborator') {
    location.href = roleHome[role] || 'dashboard-collab.html';
    return;
  }

  const eventSelect = document.getElementById('eventSelect');
  const sectionsTbody = document.getElementById('sectionsTbody');
  const sectionsCards = document.getElementById('sectionsCards');
  const supervisorControlPanel = document.getElementById('supervisorControlPanel');

  const dropdownRegistry = new Map();

  function syncDropdownOpenState(){
    if (!supervisorControlPanel) return;
    const hasOpen = Array.from(dropdownRegistry.values()).some(entry => entry && entry.isOpen && entry.isOpen());
    supervisorControlPanel.classList.toggle('dropdown-open', hasOpen);
  }

  function closeAllCustomDropdowns(exceptSelect = null){
    dropdownRegistry.forEach((entry, key) => {
      if (key !== exceptSelect) entry.close();
    });
    syncDropdownOpenState();
  }

  function refreshCustomDropdown(select){
    const entry = dropdownRegistry.get(select);
    if (entry) entry.refresh();
  }

  function setupCustomDropdown(select){
    if (!select || dropdownRegistry.has(select)) return;

    select.classList.add('portal-select-native');

    const wrap = document.createElement('div');
    wrap.className = 'portal-dropdown';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'portal-dropdown__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const triggerText = document.createElement('span');
    triggerText.className = 'portal-dropdown__text';

    const triggerArrow = document.createElement('span');
    triggerArrow.className = 'portal-dropdown__arrow';
    triggerArrow.setAttribute('aria-hidden', 'true');

    trigger.appendChild(triggerText);
    trigger.appendChild(triggerArrow);

    const panel = document.createElement('div');
    panel.className = 'portal-dropdown__panel';
    panel.hidden = true;

    select.parentNode.insertBefore(wrap, select.nextSibling);
    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    let isOpen = false;

    function getSelectedOption(){
      return select.options[select.selectedIndex] || select.options[0] || null;
    }

    function updateTrigger(){
      const selected = getSelectedOption();
      const label = selected ? selected.textContent : '';
      triggerText.textContent = label || select.getAttribute('placeholder') || 'Select...';
      const isPlaceholder = !select.value;
      trigger.classList.toggle('is-placeholder', isPlaceholder);
      trigger.disabled = !!select.disabled;
      wrap.classList.toggle('is-disabled', !!select.disabled);
    }

    function buildOptions(){
      panel.innerHTML = '';
      Array.from(select.options).forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'portal-dropdown__option';
        btn.setAttribute('role', 'option');
        btn.dataset.value = opt.value;
        btn.dataset.index = String(idx);
        btn.disabled = !!opt.disabled;

        const label = document.createElement('span');
        label.className = 'portal-dropdown__option-label';
        label.textContent = opt.textContent || '';
        btn.appendChild(label);

        if (!opt.value) btn.classList.add('is-placeholder');
        if (opt.value === select.value) {
          btn.classList.add('is-selected');
          btn.setAttribute('aria-selected', 'true');
        }

        btn.addEventListener('click', () => {
          if (opt.disabled) return;
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          refresh();
          close();
          trigger.focus();
        });

        panel.appendChild(btn);
      });
    }

    function open(){
      if (select.disabled) return;
      closeAllCustomDropdowns(select);
      isOpen = true;
      wrap.classList.add('is-open');
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      syncDropdownOpenState();
    }

    function close(){
      isOpen = false;
      wrap.classList.remove('is-open');
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      syncDropdownOpenState();
    }

    function refresh(){
      buildOptions();
      updateTrigger();
    }

    trigger.addEventListener('click', () => {
      if (isOpen) close();
      else open();
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
      if (e.key === 'Escape') close();
    });

    dropdownRegistry.set(select, { refresh, close, open, isOpen: () => isOpen });
    refresh();
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.portal-dropdown')) closeAllCustomDropdowns();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllCustomDropdowns();
  });
  const approveAllSectionsBtn = document.getElementById('approveAllSectionsBtn');
  const sectionsEmpty = document.getElementById('sectionsEmpty');
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

  function setMsg(text, isError=false){
    msg.textContent = text || '';
    msg.style.color = isError ? 'crimson' : '#2b445b';
  }

  function humanStatus(s){
    const map = {
      draft: 'Draft',
      in_progress: 'Draft',
      submitted_to_collaborator_2: 'Submitted to Collaborator II',
      returned_by_collaborator_2: 'Returned by Collaborator II',
      approved_by_collaborator_2: 'Approved by Collaborator II',
      submitted_to_collaborator: 'Submitted to Collaborator',
      returned_by_collaborator: 'Returned by Collaborator',
      approved_by_collaborator: 'Approved by Collaborator',
      submitted_to_super_collaborator: 'Submitted by Collaborator',
      returned_by_super_collaborator: 'Returned by Super-collaborator',
      approved_by_super_collaborator: 'Approved (Super-collaborator)',
      submitted_to_supervisor: 'Submitted to Supervisor',
      returned_by_supervisor: 'Returned by Supervisor',
      approved_by_supervisor: 'Approved (Supervisor)',
      submitted_to_chairman: 'Submitted to Deputy',
      returned_by_chairman: 'Returned (Deputy)',
      approved_by_chairman: 'Approved (Deputy)',
      approved_by_minister: 'Approved (Minister)',
      locked: 'Locked'
    };
    return map[s] || (s || '');
  }

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    refreshCustomDropdown(eventSelect);
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
    refreshCustomDropdown(eventSelect);
  }



  function statusBadgeClass(status){
    const s = String(status || '').toLowerCase();
    if (['draft','in_progress','locked'].includes(s)) return 'is-draft';
    if (['submitted_to_collaborator_2','submitted_to_collaborator','submitted_to_super_collaborator'].includes(s)) return 'is-review';
    if (['submitted_to_supervisor','submitted_to_chairman'].includes(s)) return 'is-submitted';
    if (['approved_by_collaborator_2','approved_by_collaborator','approved_by_super_collaborator','approved_by_supervisor','approved_by_chairman','approved_by_minister'].includes(s)) return 'is-approved';
    if (['returned_by_collaborator_2','returned_by_collaborator','returned_by_super_collaborator','returned_by_supervisor','returned_by_chairman'].includes(s)) return 'is-returned';
    return 'is-draft';
  }

  function escape(v){ return window.GCP.escapeHtml(v || ''); }

  function createMicroAction(label, kind, onClick){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `micro-action required-action required-action--${kind}`;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<span class="micro-action__icon"></span><span class="micro-action__label">${escape(label)}</span>`;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function appendSectionActions(target, section){
    const wrap = document.createElement('div');
    wrap.className = 'required-actions';

    const canOpen = true;

    if (canOpen) {
      wrap.appendChild(createMicroAction('Open', 'open', () => {
        window.open(`editor.html?event_id=${currentEventId}&section_id=${section.sectionId}`, '_blank');
      }));
    }

    target.appendChild(wrap);
  }

  async function refreshStatusGrid(){
    if (!currentEventId) return;
    const data = await window.GCP.apiFetch(`/tp/status-grid?event_id=${currentEventId}`, { method:'GET' });
    currentSections = data.sections || [];
    sectionsTbody.innerHTML = '';
    if (sectionsCards) sectionsCards.innerHTML = '';
    if (sectionsEmpty) sectionsEmpty.hidden = true;

    if (!currentSections.length){
      if (sectionsEmpty) sectionsEmpty.hidden = false;
      sectionsTbody.innerHTML = `<tr class="required-sections-empty-row"><td colspan="5">No required sections yet.</td></tr>`;
      submitDocBtn.disabled = true;
      return;
    }

    for (const s of currentSections){
      const tr = document.createElement('tr');
      tr.className = 'required-sections-row';
      const last = s.lastUpdatedAt ? window.GCP.formatDateTime(s.lastUpdatedAt) : '';
      const note = (s.statusComment || '').trim();
      const updatedBy = s.lastUpdatedBy || '—';
      const badgeClass = statusBadgeClass(s.status);
      tr.innerHTML = `
        <td>
          <div class="required-section-name">${escape(s.sectionLabel)}</div>
          ${note ? `<div class="required-section-note"><b>Comment:</b> ${escape(note)}</div>` : ''}
        </td>
        <td><span class="required-status-badge ${badgeClass}">${escape(humanStatus(s.status))}</span></td>
        <td><span class="required-updated-at">${escape(last || '—')}</span></td>
        <td><span class="required-updated-by">${escape(updatedBy)}</span></td>
        <td class="required-actions-cell"></td>
      `;
      appendSectionActions(tr.querySelector('.required-actions-cell'), s);
      sectionsTbody.appendChild(tr);

      if (sectionsCards){
        const card = document.createElement('article');
        card.className = 'required-section-card';
        card.innerHTML = `
          <div class="required-section-card__top">
            <div class="required-section-card__meta">
              <div class="required-section-name">${escape(s.sectionLabel)}</div>
              <div class="required-section-meta">Last update · ${escape(last || '—')}</div>
            </div>
            <span class="required-status-badge ${badgeClass}">${escape(humanStatus(s.status))}</span>
          </div>
          <div class="required-section-card__line"><span>Updated by</span><strong>${escape(updatedBy)}</strong></div>
          ${note ? `<div class="required-section-note"><b>Comment:</b> ${escape(note)}</div>` : ''}
          <div class="required-actions-card"></div>
        `;
        appendSectionActions(card.querySelector('.required-actions-card'), s);
        sectionsCards.appendChild(card);
      }
    }

    if (submitDocBtn) submitDocBtn.style.display = '';
  }


  if (approveAllSectionsBtn) approveAllSectionsBtn.style.display = 'none';

  async function refreshDocumentStatus(){
    if (!currentEventId) {
      if (docStatusBox) docStatusBox.innerHTML = '';
      return;
    }
    const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
    const last = ds.updatedAt ? window.GCP.formatDateTime(ds.updatedAt) : '';
    const ev = eventsById.get(currentEventId);
    const submitterRole = (ds.submitterRole || ev?.submitter_role || 'deputy');
    const task = ((ev?.task ?? ev?.occasion) || '').trim();
    if (docStatusBox) {
      docStatusBox.innerHTML = `
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div><b>Status:</b> ${window.GCP.escapeHtml(humanStatus(ds.status) || '')}</div>
          ${last ? `<div class="muted">${window.GCP.escapeHtml(last)}</div>` : ''}
        </div>
        <div class="supervisor-progress-wrap">${window.GCP.renderWorkflowProgress(ds.status, submitterRole)}</div>
        ${task ? `<div style="margin-top:10px;"><b>Task:</b> ${window.GCP.escapeHtml(task)}</div>` : ''}
      `;
    }
  }

eventSelect.addEventListener('change', async () => {
    setMsg('');
    currentEventId = Number(eventSelect.value);
    if (!Number.isFinite(currentEventId) || currentEventId <= 0) {
      currentEventId = null;
      sectionsTbody.innerHTML = '';
      if (sectionsCards) sectionsCards.innerHTML = '';
      if (sectionsEmpty) sectionsEmpty.hidden = false;
      submitDocBtn.disabled = true;
      if (docStatusBox) docStatusBox.innerHTML = '';
      return;
    }
    if (submitDocBtn) submitDocBtn.style.display = '';
    try{
      await refreshStatusGrid();
      await refreshDocumentStatus();
    }catch(e){
      setMsg(e.message || 'Failed to load sections', true);
      sectionsTbody.innerHTML = '';
      if (sectionsCards) sectionsCards.innerHTML = '';
      if (sectionsEmpty) sectionsEmpty.hidden = false;
      if (docStatusBox) docStatusBox.innerHTML = '';
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
    if (!currentEventId || submitDocBtn.disabled) return;
    if (!confirm('Submit all approved assigned sections to Super-collaborator?')) return;
    setMsg('');
    try {
      const result = await window.GCP.apiFetch('/tp/submit-approved-to-super-collaborator', {
        method: 'POST',
        body: JSON.stringify({ eventId: currentEventId })
      });
      if (result && Number(result.submitted || 0) > 0) setMsg('Approved sections submitted to Super-collaborator.');
      else setMsg('No newly approved sections were ready to submit.');
      await refreshStatusGrid();
      await refreshDocumentStatus();
    } catch (e) {
      setMsg(e.message || 'Submit failed', true);
    }
  });

  setupCustomDropdown(eventSelect);

  await loadUpcoming();
  refreshCustomDropdown(eventSelect);
})();