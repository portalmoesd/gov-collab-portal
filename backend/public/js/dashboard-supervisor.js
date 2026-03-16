// dashboard-supervisor.js  —  Supervisor (second approval level)
(async function(){
  function esc(s){ return window.GCP.escapeHtml(s); }

  const me = await window.GCP.requireAuth();
  if (!me) return;
  const role = String(me.role || '').toLowerCase();
  if (role !== 'supervisor'){ location.href = 'login.html'; return; }

  const eventSelect           = document.getElementById('eventSelect');
  const sectionsTbody         = document.getElementById('sectionsTbody');
  const sectionsCards         = document.getElementById('sectionsCards');
  const sectionsEmpty         = document.getElementById('sectionsEmpty');
  const requiredSectionsPanel = document.getElementById('requiredSectionsPanel');
  const submitDocBtn          = document.getElementById('submitDocBtn');
  const approveAllSectionsBtn = document.getElementById('approveAllSectionsBtn');
  const previewFullBtn        = document.getElementById('previewFullBtn');
  const modalBackdrop         = document.getElementById('modalBackdrop');
  const modalContent          = document.getElementById('modalContent');
  const modalCloseBtn         = document.getElementById('modalCloseBtn');
  const msg                   = document.getElementById('msg');
  const docStatusBox          = document.getElementById('docStatusBox');
  const supervisorControlPanel = document.getElementById('supervisorControlPanel');

  let currentEventId = null;
  let currentSections = [];
  const eventsById = new Map();

  // ---- Minimal custom dropdown ----
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
    function getSelectedOption(){ return select.options[select.selectedIndex] || select.options[0] || null; }
    function updateTrigger(){
      const selected = getSelectedOption();
      triggerText.textContent = selected ? selected.textContent : 'Select...';
      trigger.classList.toggle('is-placeholder', !select.value);
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
        if (opt.value === select.value){ btn.classList.add('is-selected'); btn.setAttribute('aria-selected', 'true'); }
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
    function refresh(){ buildOptions(); updateTrigger(); }
    trigger.addEventListener('click', () => { if (isOpen) close(); else open(); });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
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

  function setMsg(text, isError=false){ if(msg){ msg.textContent = text || ''; msg.style.color = isError ? 'crimson' : '#2b445b'; } }

  function humanStatus(s){
    const map = {
      draft: 'Draft', in_progress: 'Draft',
      submitted_to_collaborator_2: 'At Head Collaborator',
      returned_by_collaborator_2: 'Returned by Head Collaborator',
      approved_by_collaborator_2: 'Approved by Head Collaborator',
      submitted_to_collaborator_3: 'At Curator',
      returned_by_collaborator_3: 'Returned by Curator',
      approved_by_collaborator_3: 'Approved by Curator',
      submitted_to_collaborator: 'At Collaborator',
      returned_by_collaborator: 'Returned by Collaborator',
      approved_by_collaborator: 'Approved by Collaborator',
      submitted_to_super_collaborator: 'At Super-collaborator',
      returned_by_super_collaborator: 'Returned by Super-collaborator',
      approved_by_super_collaborator: 'Approved — Ready for Supervisor',
      submitted_to_supervisor: 'At Supervisor',
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

  function createMicroAction(label, kind, onClick){
    const btn = document.createElement('button'); btn.type = 'button';
    btn.className = `micro-action required-action required-action--${kind}`;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<span class="micro-action__icon"></span><span class="micro-action__label">${esc(label)}</span>`;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function appendSectionActions(target, section){
    const wrap = document.createElement('div'); wrap.className = 'required-actions';
    const s = String(section.status || '').toLowerCase();
    const rtr = String(section.returnTargetRole || '').toLowerCase();

    // Open — supervisor opens in new tab
    wrap.appendChild(createMicroAction('Open', 'open', () => {
      window.open(`editor.html?event_id=${currentEventId}&section_id=${section.sectionId}`, '_blank');
    }));

    // Supervisor can approve/return at any stage before their approval level
    const beyondSupervisor = ['approved_by_supervisor','submitted_to_chairman','returned_by_chairman',
      'approved_by_chairman','submitted_to_minister','returned_by_minister','approved_by_minister','approved','locked'];
    const canApprove = s && !beyondSupervisor.includes(s);

    if (canApprove){
      wrap.appendChild(createMicroAction('Approve', 'approve', async () => {
        if (!confirm('Approve this section?')) return;
        try{
          await window.GCP.apiFetch('/tp/approve-section', { method: 'POST', body: JSON.stringify({ eventId: currentEventId, sectionId: section.sectionId }) });
          setMsg('Section approved.'); await refreshStatusGrid();
        }catch(e){ setMsg(e.message || 'Approve failed', true); }
      }));

      wrap.appendChild(createMicroAction('Return', 'return', async (e) => {
        const note = await window.GCP.showCommentDropdown(e.currentTarget, { title: 'Return section', placeholder: 'Add a comment (optional)…', sendLabel: 'Return' });
        if (note === null) return;
        try{
          await window.GCP.apiFetch('/tp/return', { method: 'POST', body: JSON.stringify({ eventId: currentEventId, sectionId: section.sectionId, note }) });
          setMsg('Section returned.'); await refreshStatusGrid();
        }catch(e){ setMsg(e.message || 'Return failed', true); }
      }));
    }

    target.appendChild(wrap);
  }

  function renderRow(s){
    const last = s.lastUpdatedAt ? window.GCP.formatDateTime(s.lastUpdatedAt) : '';
    const note = (s.statusComment || '').trim();
    const updatedBy = s.lastUpdatedBy || '—';
    const progressHtml = window.GCP.renderUpperTierProgress(s.status, s.stepNames, s.lowerSubmitterRole, s.originalSubmitterRole, s.returnTargetRole, s.documentSubmitterRole);
    const tr = document.createElement('tr'); tr.className = 'required-sections-row';
    tr.innerHTML = `
      <td>
        <div class="required-section-name">${esc(s.sectionLabel)}</div>
        <div class="required-section-meta">${esc(last || '—')} · ${esc(updatedBy)}</div>
        ${note ? `<div class="required-section-note"><b>Comment:</b> ${esc(note)}</div>` : ''}
      </td>
      <td class="required-progress-cell"><div class="lower-progress-inline">${progressHtml}</div><div class="section-history-toggle-mount"></div></td>
      <td class="required-actions-cell"></td>
    `;
    appendSectionActions(tr.querySelector('.required-actions-cell'), s);
    window.GCP.attachSectionHistoryToggle(tr.querySelector('.section-history-toggle-mount'), s, currentEventId, false);
    return tr;
  }

  function renderCard(s){
    const last = s.lastUpdatedAt ? window.GCP.formatDateTime(s.lastUpdatedAt) : '';
    const note = (s.statusComment || '').trim();
    const updatedBy = s.lastUpdatedBy || '—';
    const progressHtml = window.GCP.renderUpperTierProgress(s.status, s.stepNames, s.lowerSubmitterRole, s.originalSubmitterRole, s.returnTargetRole, s.documentSubmitterRole);
    const card = document.createElement('article'); card.className = 'required-section-card';
    card.innerHTML = `
      <div class="required-section-card__head">
        <div class="required-section-name">${esc(s.sectionLabel)}</div>
        <div class="required-section-meta">${esc(last || '—')} · ${esc(updatedBy)}</div>
        ${note ? `<div class="required-section-note"><b>Comment:</b> ${esc(note)}</div>` : ''}
        ${s.returnRequest ? `<div class="section-return-request-notice"><strong>Return requested</strong> by ${esc(s.returnRequest.from)}: ${esc(s.returnRequest.note || '(no comment)')}</div>` : ''}
      </div>
      <div class="lower-progress-inline">${progressHtml}</div>
      <div class="section-history-toggle-mount"></div>
      <div class="required-actions-card"></div>
    `;
    appendSectionActions(card.querySelector('.required-actions-card'), s);
    window.GCP.attachSectionHistoryToggle(card.querySelector('.section-history-toggle-mount'), s, currentEventId, true);
    return card;
  }

  async function refreshStatusGrid(){
    if (!currentEventId) return;
    const data = await window.GCP.apiFetch(`/tp/status-grid?event_id=${currentEventId}`, { method: 'GET' });
    currentSections = data.sections || [];
    if (sectionsTbody) sectionsTbody.innerHTML = '';
    if (sectionsCards) sectionsCards.innerHTML = '';
    if (sectionsEmpty) sectionsEmpty.hidden = true;

    if (!currentSections.length){
      if (sectionsEmpty) sectionsEmpty.hidden = false;
      if (sectionsTbody) sectionsTbody.innerHTML = `<tr class="required-sections-empty-row"><td colspan="3">No required sections yet.</td></tr>`;
      if (submitDocBtn) submitDocBtn.disabled = true;
      return;
    }

    for (const s of currentSections){
      if (sectionsTbody) sectionsTbody.appendChild(renderRow(s));
      if (sectionsCards) sectionsCards.appendChild(renderCard(s));
    }

    // Enable submit to Deputy when all sections are approved_by_supervisor or beyond
    const allApproved = currentSections.length > 0 && currentSections.every(s => {
      const st = String(s.status || '').toLowerCase();
      return ['approved_by_supervisor', 'submitted_to_chairman', 'returned_by_chairman',
              'approved_by_chairman', 'submitted_to_minister', 'approved_by_minister',
              'approved', 'locked'].includes(st);
    });
    if (submitDocBtn){ submitDocBtn.disabled = !allApproved; submitDocBtn.style.display = ''; }
  }

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch('/events/upcoming', { method: 'GET' });
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    eventsById.clear();
    for (const ev of (events || [])){
      eventsById.set(Number(ev.id), ev);
      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.dataset.submitterRole = (ev.submitter_role || ev.submitterRole || '').toLowerCase();
      opt.textContent = `${ev.title || 'Event'} (${ev.country_name_en || ''}${ev.deadline_date ? ', ' + window.GCP.formatDate(ev.deadline_date) : ''})`;
      eventSelect.appendChild(opt);
    }
    refreshCustomDropdown(eventSelect);
  }

  eventSelect.addEventListener('change', async () => {
    setMsg('');
    currentEventId = Number(eventSelect.value);
    if (!Number.isFinite(currentEventId) || currentEventId <= 0){
      currentEventId = null;
      if (sectionsTbody) sectionsTbody.innerHTML = '';
      if (sectionsCards) sectionsCards.innerHTML = '';
      if (sectionsEmpty) sectionsEmpty.hidden = false;
      if (submitDocBtn) submitDocBtn.disabled = true;
      if (docStatusBox) docStatusBox.innerHTML = '';
      if (requiredSectionsPanel) requiredSectionsPanel.hidden = true;
      return;
    }
    if (requiredSectionsPanel) requiredSectionsPanel.hidden = false;

    // Adjust submit button label based on configured submitter role
    const selectedOpt = eventSelect.options[eventSelect.selectedIndex];
    let sr = (selectedOpt?.dataset?.submitterRole || '').toLowerCase();
    if (!sr && currentEventId > 0){
      try{
        const evDetails = await window.GCP.apiFetch(`/events/${currentEventId}`, { method: 'GET' });
        sr = String(evDetails?.submitter_role || evDetails?.submitterRole || '').toLowerCase();
      }catch(e){ /* keep default */ }
    }
    if (submitDocBtn){
      submitDocBtn.textContent = sr === 'supervisor' ? 'Send to Library' : (sr === 'minister' ? 'Submit to Deputy' : 'Submit document to Deputy');
      submitDocBtn.dataset.submitterRole = sr || 'chairman';
    }

    try{
      await refreshStatusGrid();

      // Document status / workflow progress bar
      const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(currentEventId)}`, { method: 'GET' });
      const last = ds.updatedAt ? window.GCP.formatDateTime(ds.updatedAt) : '';
      const ev = eventsById.get(currentEventId);
      const submitterRole = (ds.submitterRole || ev?.submitter_role || 'deputy');
      const task = ((ev?.task ?? ev?.occasion) || '').trim();
      if (docStatusBox){
        docStatusBox.innerHTML = `
          <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div><b>Status:</b> ${esc(humanStatus(ds.status) || '')}</div>
            ${last ? `<div class="muted">${esc(last)}</div>` : ''}
          </div>
          <div class="supervisor-progress-wrap">${window.GCP.renderWorkflowProgress(ds.status, submitterRole)}</div>
          ${task ? `<div style="margin-top:10px;"><b>Task:</b> ${esc(task)}</div>` : ''}
        `;
      }
    }catch(e){
      setMsg(e.message || 'Failed to load sections', true);
    }
  });

  if (approveAllSectionsBtn) approveAllSectionsBtn.addEventListener('click', async () => {
    if (!currentEventId) return;
    const eligible = currentSections.filter(s => {
      const st = String(s.status || '').toLowerCase();
      return ['submitted_to_supervisor', 'returned_by_supervisor', 'approved_by_super_collaborator'].includes(st);
    });
    if (!eligible.length){ setMsg('No sections ready for approval.'); return; }
    if (!confirm(`Approve ${eligible.length} section(s)?`)) return;
    setMsg('');
    try{
      for (const s of eligible){
        await window.GCP.apiFetch('/tp/approve-section', { method: 'POST', body: JSON.stringify({ eventId: currentEventId, sectionId: s.sectionId }) });
      }
      setMsg('All eligible sections approved.');
      await refreshStatusGrid();
    }catch(e){ setMsg(e.message || 'Approve failed', true); }
  });

  if (previewFullBtn) previewFullBtn.addEventListener('click', async () => {
    if (!currentEventId) return;
    setMsg('');
    try{
      const parts = [];
      for (const s of currentSections){
        const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(currentEventId)}&section_id=${encodeURIComponent(s.sectionId)}`, { method: 'GET' });
        parts.push(`<h2 style="margin:18px 0 8px;">${window.GCP.escapeHtml(tp.sectionLabel || s.sectionLabel || '')}</h2>`);
        parts.push(tp.htmlContent || '<div class="muted">—</div>');
      }
      if (modalContent) modalContent.innerHTML = `<div style="padding:8px 2px;">${parts.join('')}</div>`;
      if (modalBackdrop) modalBackdrop.style.display = 'flex';
    }catch(e){ setMsg(e.message || 'Failed to preview', true); }
  });

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => { if (modalBackdrop) modalBackdrop.style.display = 'none'; if (modalContent) modalContent.innerHTML = ''; });
  if (modalBackdrop) modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop){ modalBackdrop.style.display = 'none'; if (modalContent) modalContent.innerHTML = ''; } });

  if (submitDocBtn) submitDocBtn.addEventListener('click', async () => {
    if (!currentEventId || submitDocBtn.disabled) return;
    setMsg('');
    try{
      const selectedOpt = eventSelect.options[eventSelect.selectedIndex];
      const sr = String(selectedOpt?.dataset?.submitterRole || '').toLowerCase();
      await window.GCP.apiFetch('/document/submit-to-chairman', { method: 'POST', body: JSON.stringify({ eventId: currentEventId }) });
      setMsg(sr === 'supervisor' ? 'Document finalized and sent to Library.' : 'Submitted to Deputy.');
      await refreshStatusGrid();
    }catch(e){ setMsg(e.message || 'Submit failed', true); }
  });

  setupCustomDropdown(eventSelect);

  // Refresh on back-navigation
  window.addEventListener('pageshow', (e) => {
    const savedId = currentEventId;
    loadUpcoming().then(() => { if (savedId){ eventSelect.value = String(savedId); eventSelect.dispatchEvent(new Event('change')); } }).catch(() => {});
  });

  await loadUpcoming();
})();
