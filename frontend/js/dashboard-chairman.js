// dashboard-chairman.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role || '').toLowerCase();

  const eventSelect           = document.getElementById('eventSelect');
  const docStatusBox          = document.getElementById('docStatusBox');
  const sectionsTbody         = document.getElementById('sectionsTbody');
  const sectionsCards         = document.getElementById('sectionsCards');
  const sectionsEmpty         = document.getElementById('sectionsEmpty');
  const requiredSectionsPanel = document.getElementById('requiredSectionsPanel');
  const approveAllSectionsBtn = document.getElementById('approveAllSectionsBtn');
  const approveDocBtn = document.getElementById('approveDocBtn');
  const returnDocBtn = document.getElementById('returnDocBtn');
  const previewBtn = document.getElementById('previewBtn');
  const msg = document.getElementById('msg');
  const chairmanControlPanel = document.getElementById('chairmanControlPanel');

  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalContent = document.getElementById('modalContent');
  const closeModalBtn = document.getElementById('closeModalBtn');

  const dropdownRegistry = new Map();

  function setActionButtonLabel(button, label){
    if (!button) return;
    const labelEl = button.querySelector('.micro-action__label');
    if (labelEl) labelEl.textContent = label;
    else button.textContent = label;
    button.setAttribute('aria-label', label);
  }

  function syncDropdownOpenState(){
    if (!chairmanControlPanel) return;
    const hasOpen = Array.from(dropdownRegistry.values()).some(entry => entry && entry.isOpen && entry.isOpen());
    chairmanControlPanel.classList.toggle('dropdown-open', hasOpen);
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

    let openState = false;

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
          close();
          trigger.focus();
        });

        panel.appendChild(btn);
      });
    }

    function open(){
      if (select.disabled) return;
      closeAllCustomDropdowns(select);
      openState = true;
      wrap.classList.add('is-open');
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      syncDropdownOpenState();
    }

    function close(){
      openState = false;
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
      if (openState) close();
      else open();
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
      if (e.key === 'Escape') {
        close();
      }
    });

    select.addEventListener('change', refresh);

    dropdownRegistry.set(select, {
      close,
      refresh,
      isOpen: () => openState
    });

    refresh();
  }

  document.addEventListener('click', (e) => {
    dropdownRegistry.forEach((entry, select) => {
      const wrap = select.nextElementSibling;
      if (wrap && !wrap.contains(e.target)) entry.close();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllCustomDropdowns();
  });

  const canEndEvent = ['admin','supervisor','protocol'].includes(role);
  const endEventBtn = document.createElement('button');
  endEventBtn.className = 'btn danger';
  endEventBtn.textContent = 'End event';
  endEventBtn.style.display = 'none';
  if (canEndEvent) {
    previewBtn.parentElement.insertBefore(endEventBtn, previewBtn);
  }

  let currentEventId = null;
  let currentSections = [];
  const eventsById = new Map();

  function humanStatus(s){
    const map = {
      draft: 'Draft',
      in_progress: 'Draft',
      submitted_to_collaborator_2: 'Submitted to Head Collaborator',
      returned_by_collaborator_2: 'Returned by Head Collaborator',
      approved_by_collaborator_2: 'Approved by Head Collaborator',
      submitted_to_collaborator: 'Submitted to Collaborator',
      returned_by_collaborator: 'Returned by Collaborator',
      approved_by_collaborator: 'Approved by Collaborator',
      submitted_to_super_collaborator: 'Awaiting Super-collaborator',
      returned_by_super_collaborator: 'Returned (Super-collaborator)',
      approved_by_super_collaborator: 'Approved (Super-collaborator)',
      submitted_to_supervisor: 'Submitted',
      returned_by_supervisor: 'Returned',
      approved_by_supervisor: 'Approved (Supervisor)',
      submitted_to_chairman: 'Submitted to Deputy',
      returned_by_chairman: 'Returned (Deputy)',
      approved_by_chairman: 'Approved (Deputy)',
      locked: 'Locked'
    };
    return map[s] || (s || '');
  }

  function statusBadgeClass(status){
    const s = String(status || '').toLowerCase();
    if (!s || s === 'draft' || s === 'in_progress') return 'is-draft';
    if (s.includes('returned')) return 'is-returned';
    if (s.includes('approved') || s === 'locked') return 'is-approved';
    if (s.includes('submitted')) return 'is-submitted';
    return 'is-review';
  }

  function setMsg(text, isError=false){
    msg.textContent = text || '';
    msg.style.color = isError ? 'crimson' : '#2b445b';
  }

  const escape = window.GCP.escapeHtml;

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
    if (!target) return;
    target.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'required-actions';

    wrap.appendChild(createMicroAction('Open', 'open', () => {
      window.open(`editor.html?event_id=${currentEventId}&section_id=${section.sectionId}`, '_blank');
    }));

    const sectionStatus = String(section.status || '').toLowerCase();
    const canDecision = !['approved_by_chairman', 'approved_by_minister', 'locked'].includes(sectionStatus);
    if (canDecision) {
      wrap.appendChild(createMicroAction('Approve', 'approve', async () => {
        try{
          await window.GCP.apiFetch('/tp/approve-section-chairman', {
            method:'POST',
            body: JSON.stringify({ eventId: currentEventId, sectionId: section.sectionId })
          });
          await refresh();
        }catch(e){
          setMsg(e.message || 'Failed to approve section', true);
        }
      }));

      wrap.appendChild(createMicroAction('Return', 'return', async (e) => {
        const note = await window.GCP.showCommentDropdown(e.currentTarget, { title: 'Return section', placeholder: 'Add a comment (optional)…', sendLabel: 'Return' }) || '';
        if (note === null) return;
        try{
          await window.GCP.apiFetch('/tp/return', {
            method:'POST',
            body: JSON.stringify({ eventId: currentEventId, sectionId: section.sectionId, note })
          });
          await refresh();
        }catch(e){
          setMsg(e.message || 'Failed to return section', true);
        }
      }));
    }

    target.appendChild(wrap);
  }

  async function loadEvents(){
    eventSelect.innerHTML = '<option value="">Select…</option>';
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });

    eventsById.clear();

    for (const ev of (events || [])){
      eventsById.set(Number(ev.id), ev);
      const opt = document.createElement('option');
      opt.value = String(ev.id);
      opt.dataset.submitterRole = String(ev.submitter_role || ev.submitterRole || '').toLowerCase();
      const deadline = ev.deadline_date ? window.GCP.formatDate(ev.deadline_date) : '';
      opt.textContent = `${ev.title || 'Event'} — ${ev.country_name_en || ''}${deadline ? ' ('+deadline+')' : ''}`;
      eventSelect.appendChild(opt);
    }
  }

  async function refresh(){
    setMsg('');
    sectionsTbody.innerHTML = '';
    if (sectionsCards) sectionsCards.innerHTML = '';
    if (sectionsEmpty) sectionsEmpty.hidden = true;
    docStatusBox.innerHTML = '';

    const evId = Number(eventSelect.value);
    if (!Number.isFinite(evId) || evId <= 0) {
      currentEventId = null;
      approveDocBtn.disabled = true;
      returnDocBtn.disabled = true;
      previewBtn.disabled = true;
      if (approveAllSectionsBtn) approveAllSectionsBtn.disabled = true;
      if (sectionsEmpty) sectionsEmpty.hidden = false;
      sectionsTbody.innerHTML = `<tr class="required-sections-empty-row"><td colspan="5">Choose an event to review required sections.</td></tr>`;
      endEventBtn.style.display = 'none';
      if (requiredSectionsPanel) requiredSectionsPanel.hidden = true;
      return;
    }
    if (requiredSectionsPanel) requiredSectionsPanel.hidden = false;
    currentEventId = evId;
    endEventBtn.style.display = canEndEvent ? 'inline-flex' : 'none';

    const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
    const last = ds.updatedAt ? window.GCP.formatDateTime(ds.updatedAt) : '';
    const ev = eventsById.get(currentEventId);
    const submitterRole = (ds.submitterRole || ev?.submitter_role || 'deputy');
    const task = ((ev?.task ?? ev?.occasion) || '').trim();

    docStatusBox.innerHTML = `
      ${ds.chairmanComment ? `<div class="muted" style="margin-top:8px;"><b>Comment:</b> ${escape(ds.chairmanComment)}</div>` : ''}
    `;

    const grid = await window.GCP.apiFetch(`/tp/status-grid?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
    currentSections = grid.sections || [];

    if (!currentSections.length){
      if (sectionsEmpty) sectionsEmpty.hidden = false;
      sectionsTbody.innerHTML = `<tr class="required-sections-empty-row"><td colspan="5">No required sections yet.</td></tr>`;
      if (approveAllSectionsBtn) approveAllSectionsBtn.disabled = true;
    } else {
      if (approveAllSectionsBtn) approveAllSectionsBtn.disabled = false;
      for (const s of currentSections){
        const tr = document.createElement('tr');
        tr.className = 'required-sections-row';
        const lastUpdate = s.lastUpdatedAt ? window.GCP.formatDateTime(s.lastUpdatedAt) : '';
        const note = (s.statusComment || '').trim();
        const updatedBy = s.lastUpdatedBy || '—';
        const badgeClass = statusBadgeClass(s.status);
        tr.innerHTML = `
          <td>
            <div class="required-section-name">${escape(s.sectionLabel || '')}</div>
            ${note ? `<div class="required-section-note"><b>Comment:</b> ${escape(note)}</div>` : ''}
          </td>
          <td><span class="required-status-badge ${badgeClass}">${escape(humanStatus(s.status))}</span></td>
          <td><span class="required-updated-at">${escape(lastUpdate || '—')}</span></td>
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
                <div class="required-section-name">${escape(s.sectionLabel || '')}</div>
                <div class="required-section-meta">Last update · ${escape(lastUpdate || '—')}</div>
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
    }

    try {
      const evDetails = await window.GCP.apiFetch(`/events/${currentEventId}`, { method:'GET' });
      const sr = String(evDetails.submitterRole || evDetails.submitter_role || '').toLowerCase();
      setActionButtonLabel(approveDocBtn, sr === 'minister' ? 'Submit to Minister' : 'Approve');
    } catch (e) {
      setActionButtonLabel(approveDocBtn, 'Approve');
    }

    approveDocBtn.disabled = false;
    returnDocBtn.disabled = false;
    previewBtn.disabled = false;
  }

  approveDocBtn.addEventListener('click', async () => {
    setMsg('');
    if (!currentEventId) return;
    if (!confirm('Approve the full document?')) return;
    try{
      await window.GCP.apiFetch('/document/approve', {
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
    const note = await window.GCP.showCommentDropdown(returnDocBtn, { title: 'Return document', placeholder: 'Add a comment (optional)…', sendLabel: 'Return' });
    if (note === null) return;
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
      const parts = [];
      for (const s of currentSections){
        const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(currentEventId)}&section_id=${encodeURIComponent(s.sectionId)}`, { method:'GET' });
        parts.push(`<h2 style="margin:18px 0 8px;">${escape(tp.sectionLabel || s.sectionLabel || '')}</h2>`);
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

  if (approveAllSectionsBtn) approveAllSectionsBtn.addEventListener('click', async () => {
    if (!currentEventId) return;
    if (!confirm('Approve all required sections for this event?')) return;
    setMsg('');
    try {
      await window.GCP.apiFetch('/tp/approve-all-sections', {
        method:'POST',
        body: JSON.stringify({ eventId: currentEventId })
      });
      await refresh();
    } catch (e) {
      setMsg(e.message || 'Failed to approve all sections', true);
    }
  });

  endEventBtn.addEventListener('click', async () => {
    setMsg('');
    if (!currentEventId) return;
    if (!confirm('End this event? It will be marked as ended.')) return;
    try{
      await window.GCP.apiFetch(`/events/${currentEventId}/end`, { method:'POST' });
      setMsg('Event ended.');
      await loadEvents();
      currentEventId = null;
      eventSelect.value = '';
      refreshCustomDropdown(eventSelect);
      await refresh();
    }catch(e){
      setMsg(e.message || 'Failed to end event', true);
    }
  });

  eventSelect.addEventListener('change', refresh);

  setupCustomDropdown(eventSelect);

  await loadEvents();
  refreshCustomDropdown(eventSelect);
  await refresh();
})();
