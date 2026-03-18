// dashboard-minister.js
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
  const sendToLibraryBtn = document.getElementById('sendToLibraryBtn');
  const previewFullBtn = document.getElementById('previewFullBtn');
  const msg = document.getElementById('msg');
  const ministerControlPanel = document.getElementById('ministerControlPanel');

  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalContent = document.getElementById('modalContent');
  const closeModalBtn = document.getElementById('closeModalBtn');

  const dropdownRegistry = new Map();
  const eventsById = new Map();
  let currentEventId = null;
  let currentSections = [];

  function syncDropdownOpenState(){
    if (!ministerControlPanel) return;
    const hasOpen = Array.from(dropdownRegistry.values()).some(entry => entry && entry.isOpen && entry.isOpen());
    ministerControlPanel.classList.toggle('dropdown-open', hasOpen);
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
      if (e.key === 'Escape') close();
    });

    select.addEventListener('change', refresh);

    dropdownRegistry.set(select, { close, refresh, isOpen: () => openState });
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
      window.location.href = `editor.html?event_id=${currentEventId}&section_id=${section.sectionId}`;
    }));

    const sectionStatus = String(section.status || '').toLowerCase();
    const docSubmitter = String(section.documentSubmitterRole || '').toLowerCase();
    const isApprovedByMeAsFinal = sectionStatus === 'approved_by_minister' && docSubmitter === 'minister';
    const canDecision = isApprovedByMeAsFinal || !['approved_by_minister', 'locked'].includes(sectionStatus);

    if (canDecision) {
      wrap.appendChild(createMicroAction('Approve', 'approve', async () => {
        try {
          await window.GCP.apiFetch('/tp/approve-section-deputy', {
            method:'POST',
            body: JSON.stringify({ eventId: currentEventId, sectionId: section.sectionId })
          });
          await refresh();
        } catch (e) {
          setMsg(e.message || 'Failed to approve section', true);
        }
      }));

      wrap.appendChild(createMicroAction('Return', 'return', async (e) => {
        const note = await window.GCP.showCommentDropdown(e.currentTarget, { title: 'Return section', placeholder: 'Add a comment (optional)…', sendLabel: 'Return' }) || '';
        if (note === null) return;
        try {
          await window.GCP.apiFetch('/tp/return', {
            method:'POST',
            body: JSON.stringify({ eventId: currentEventId, sectionId: section.sectionId, note })
          });
          await refresh();
        } catch (e) {
          setMsg(e.message || 'Failed to return section', true);
        }
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
        <div class="required-section-name">${escape(s.sectionLabel)}</div>
        <div class="required-section-meta">${escape(last || '—')} · ${escape(updatedBy)}</div>
        ${note ? `<div class="required-section-note"><b>Comment:</b> ${escape(note)}</div>` : ''}
        ${s.returnRequest ? `<div class="section-return-request-notice"><strong>Return requested</strong> by ${escape(s.returnRequest.from)}: ${escape(s.returnRequest.note || '(no comment)')}</div>` : ''}
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
        <div class="required-section-name">${escape(s.sectionLabel)}</div>
        <div class="required-section-meta">${escape(last || '—')} · ${escape(updatedBy)}</div>
        ${note ? `<div class="required-section-note"><b>Comment:</b> ${escape(note)}</div>` : ''}
        ${s.returnRequest ? `<div class="section-return-request-notice"><strong>Return requested</strong> by ${escape(s.returnRequest.from)}: ${escape(s.returnRequest.note || '(no comment)')}</div>` : ''}
      </div>
      <div class="lower-progress-inline">${progressHtml}</div>
      <div class="section-history-toggle-mount"></div>
      <div class="required-actions-card"></div>
    `;
    appendSectionActions(card.querySelector('.required-actions-card'), s);
    window.GCP.attachSectionHistoryToggle(card.querySelector('.section-history-toggle-mount'), s, currentEventId, true);
    return card;
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
      sendToLibraryBtn.disabled = true;
      sendToLibraryBtn.style.display = 'none';
      previewFullBtn.disabled = true;
      if (approveAllSectionsBtn) approveAllSectionsBtn.disabled = true;
      if (sectionsEmpty) sectionsEmpty.hidden = false;
      sectionsTbody.innerHTML = `<tr class="required-sections-empty-row"><td colspan="3">Choose an event to review required sections.</td></tr>`;
      if (requiredSectionsPanel) requiredSectionsPanel.hidden = true;
      return;
    }
    if (requiredSectionsPanel) requiredSectionsPanel.hidden = false;
    currentEventId = evId;

    const ds = await window.GCP.apiFetch(`/tp/document-status?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
    const ev = eventsById.get(currentEventId);

    docStatusBox.innerHTML = `
      ${ds.deputyComment ? `<div class="muted" style="margin-top:8px;"><b>Comment:</b> ${escape(ds.deputyComment)}</div>` : ''}
    `;

    const grid = await window.GCP.apiFetch(`/tp/status-grid?event_id=${encodeURIComponent(currentEventId)}`, { method:'GET' });
    currentSections = grid.sections || [];

    if (!currentSections.length) {
      if (sectionsEmpty) sectionsEmpty.hidden = false;
      sectionsTbody.innerHTML = `<tr class="required-sections-empty-row"><td colspan="3">No required sections yet.</td></tr>`;
      if (approveAllSectionsBtn) approveAllSectionsBtn.disabled = true;
    } else {
      if (approveAllSectionsBtn) approveAllSectionsBtn.disabled = false;
      for (const s of currentSections){
        sectionsTbody.appendChild(renderRow(s));
        if (sectionsCards) sectionsCards.appendChild(renderCard(s));
      }
    }

    // Show "Send to Library" only when minister is the Document Submitter
    try {
      const evDetails = await window.GCP.apiFetch(`/events/${currentEventId}`, { method:'GET' });
      const sr = String(evDetails.submitterRole || evDetails.submitter_role || '').toLowerCase();
      sendToLibraryBtn.style.display = sr === 'minister' ? '' : 'none';
    } catch (e) {
      sendToLibraryBtn.style.display = 'none';
    }

    sendToLibraryBtn.disabled = false;
    previewFullBtn.disabled = false;
  }

  sendToLibraryBtn.addEventListener('click', async () => {
    setMsg('');
    if (!currentEventId) return;
    if (!confirm('Send this document to the Library?')) return;
    try {
      await window.GCP.apiFetch('/document/approve-minister', {
        method:'POST',
        body: JSON.stringify({ eventId: currentEventId })
      });
      setMsg('Document finalized and sent to Library.');
      await refresh();
    } catch (e) {
      setMsg(e.message || 'Failed to send to library', true);
    }
  });

  previewFullBtn.addEventListener('click', async () => {
    setMsg('');
    if (!currentEventId) return;
    try {
      const sections = [];
      let title = '', country = '';
      for (const s of currentSections){
        const tp = await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(currentEventId)}&section_id=${encodeURIComponent(s.sectionId)}&clean=1`, { method:'GET' });
        if (!title) { title = tp.eventTitle || ''; country = tp.countryName || ''; }
        sections.push({ label: tp.sectionLabel || s.sectionLabel || '', html: tp.htmlContent || '' });
      }
      window.GCP.openPaperPreview({ title, country, sections });
    } catch (e) {
      setMsg(e.message || 'Failed to preview', true);
    }
  });

  if (closeModalBtn) closeModalBtn.addEventListener('click', () => {
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

  eventSelect.addEventListener('change', refresh);
  setupCustomDropdown(eventSelect);

  await loadEvents();
  refreshCustomDropdown(eventSelect);
  await refresh();
})();
