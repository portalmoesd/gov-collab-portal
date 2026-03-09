// dashboard-collab.js
(async function(){
  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  const me = await window.GCP.requireAuth();
  if (!me) return;

  const eventsGrid = document.getElementById('eventsGrid');
  const eventSelect = document.getElementById('eventSelect');
  const countrySelect = document.getElementById('countrySelect');
  const sectionSelect = document.getElementById('sectionSelect');
  const openBtn = document.getElementById('openEditorBtn');
  const msg = document.getElementById('msg');
  const sectionStatusBox = document.getElementById('sectionStatusBox');
  const openEditorSection = document.getElementById('openEditorSection');

  let eventMeta = {}; // { [eventId]: { taskText, submitterRole } }
  let taskText = '';
  let submitterRole = 'deputy';


  // --- Portal custom dropdowns ---
  const dropdownRegistry = new Map();

  function syncDropdownOpenState(){
    if (!openEditorSection) return;
    const hasOpen = Array.from(dropdownRegistry.values()).some(entry => entry && entry.isOpen && entry.isOpen());
    openEditorSection.classList.toggle('dropdown-open', hasOpen);
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
    panel.hidden = true

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


  function humanDocStatus(s){
    const map = {
      draft: 'Draft',
      returned: 'Returned',
      submitted_to_collaborator_2: 'Submitted to Collaborator II',
      returned_by_collaborator_2: 'Returned by Collaborator II',
      approved_by_collaborator_2: 'Approved by Collaborator II',
      submitted_to_collaborator: 'Submitted to Collaborator',
      returned_by_collaborator: 'Returned by Collaborator',
      approved_by_collaborator: 'Approved by Collaborator',
      submitted_to_super_collaborator: 'Submitted to Super-collaborator',
      returned_by_super_collaborator: 'Returned by Super-collaborator',
      approved_by_super_collaborator: 'Approved by Super-collaborator',
      submitted_to_supervisor: 'Submitted to Supervisor',
      returned_by_supervisor: 'Returned by Supervisor',
      submitted_to_chairman: 'Submitted to Deputy',
      submitted_to_minister: 'Submitted to Minister',
      approved: 'Approved'
    };
    return map[s] || (s || '');
  }

  function returnCommentLabel(status){
    const s = String(status || '').toLowerCase();
    if (s === 'returned_by_collaborator_2') return 'Collaborator II comment';
    if (s === 'returned_by_collaborator') return 'Collaborator comment';
    if (s === 'returned_by_super_collaborator') return 'Super-collaborator comment';
    if (s === 'returned_by_supervisor') return 'Supervisor comment';
    if (s === 'returned_by_chairman') return 'Deputy comment';
    if (s === 'returned_by_minister') return 'Minister comment';
    return 'Return comment';
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
      <div>${window.GCP.renderWorkflowProgress(docStatus, submitterRole)}</div>
            ${note ? `<div style="margin-top:10px; padding:8px 10px; border-radius:10px; border:1px solid rgba(220,38,38,.25); background: rgba(254,226,226,.55);"><b>${window.GCP.escapeHtml(returnCommentLabel(tp.status))}:</b> ${window.GCP.escapeHtml(note)}</div>` : ''}
      <div style="margin-top:12px;"><b>Task:</b> ${window.GCP.escapeHtml((taskText || '').trim() || '—')}</div>
    `;
  }



  function setMsg(text, isError=false){
    msg.textContent = text || '';
    msg.style.color = isError ? 'crimson' : '#2b445b';
  }

  setupCustomDropdown(eventSelect);
  setupCustomDropdown(countrySelect);
  setupCustomDropdown(sectionSelect);

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    eventMeta = {};
    if (eventsGrid) eventsGrid.innerHTML = '';
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    if (countrySelect){
      countrySelect.innerHTML = `<option value="">Country</option>`;
      countrySelect.disabled = true;
      refreshCustomDropdown(countrySelect);
    }
    sectionSelect.innerHTML = `<option value="">Select section...</option>`;
    sectionSelect.disabled = true;

    for (const ev of (events || [])) {
      eventMeta[ev.id] = {
        taskText: ev.task || ev.occasion || '',
        submitterRole: normalizeSubmitterRole(ev.submitter_role),
        country: ev.country_name_en || ''
      };
      if (eventsGrid){
        const card = document.createElement('div');
        card.className = 'event-card';
        const deadline = window.GCP.formatDate(ev.deadline_date) || '';
        const country = ev.country_name_en || '';
        const task = ev.task || ev.occasion || '';
        card.innerHTML = `
          <div class="row1">
            <button class="openmini openmini-top" type="button">Open</button>
            <div>
              <div class="title">${escapeHtml(ev.title || '')}</div>
              <div class="meta">
                <span class="badge primary">${escapeHtml(country)}</span>
                ${deadline ? `<span class="badge">Deadline: ${escapeHtml(deadline)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="task">${escapeHtml(task)}</div>
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
    refreshCustomDropdown(eventSelect);
    refreshCustomDropdown(sectionSelect);
  }

  async function loadSectionsForEvent(eventId){
    sectionSelect.innerHTML = `<option value="">Loading...</option>`;
    refreshCustomDropdown(sectionSelect);
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
    refreshCustomDropdown(sectionSelect);

    // reset status box
    showSectionStatus(null);
  }

  eventSelect.addEventListener('change', async () => {
    setMsg('');
    setMsg('');
    const eventId = Number(eventSelect.value);
    if (!Number.isFinite(eventId)) {
      if (countrySelect){
        countrySelect.innerHTML = `<option value="">Country</option>`;
        countrySelect.disabled = true;
        refreshCustomDropdown(countrySelect);
      }
      sectionSelect.innerHTML = `<option value="">Select section...</option>`;
      sectionSelect.disabled = true;
      refreshCustomDropdown(sectionSelect);
      refreshCustomDropdown(sectionSelect);
      return;
    }
    if (countrySelect){
      const meta = eventMeta[eventId] || {};
      countrySelect.innerHTML = `<option value="${window.GCP.escapeHtml(String(meta.country || ''))}">${window.GCP.escapeHtml(meta.country || 'Country')}</option>`;
      countrySelect.disabled = true;
      refreshCustomDropdown(countrySelect);
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
      refreshCustomDropdown(sectionSelect);
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

  await loadUpcoming();
})();