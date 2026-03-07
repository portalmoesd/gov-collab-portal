// calendar.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const canManage = ['admin','chairman','supervisor','protocol','super_collaborator','minister'].includes(role);
  const canEnd = ['admin','chairman','supervisor','protocol','minister'].includes(role);

  const msg = document.getElementById("msg");
  const eventsTbody = document.getElementById("eventsTbody");
  const form = document.getElementById("eventForm");
  const formCard = document.getElementById("calendarEventSection");
  const sectionWrap = document.getElementById('calendarEventSection');

  const countrySelect = document.getElementById("countryId");
  const titleInput = document.getElementById("title");
  const occasionInput = document.getElementById("occasion");
  const deadlineInput = document.getElementById("deadlineDate");
  const submitterSelect = document.getElementById('submitterRole');
  const requiredBox = document.getElementById("requiredSectionsBox");
  const saveBtn = document.getElementById("saveEventBtn");
  const resetBtn = document.getElementById("resetFormBtn");

  let editEventId = null;

  if (!canManage){
    formCard.style.display = "none";
  }

  const dropdownRegistry = new Map();
  function updateOpenState(){
    const hasOpen = Array.from(dropdownRegistry.values()).some(entry => entry && entry.isOpen && entry.isOpen());
    sectionWrap.classList.toggle('dropdown-open', hasOpen);
  }
  function closeAllCustomDropdowns(except){
    dropdownRegistry.forEach((entry, key) => {
      if (!entry || key === except) return;
      entry.close();
    });
    updateOpenState();
  }
  function enhanceSelect(select){
    if (!select || dropdownRegistry.has(select)) return dropdownRegistry.get(select);

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

    trigger.appendChild(triggerText);
    trigger.appendChild(triggerArrow);

    const panel = document.createElement('div');
    panel.className = 'portal-dropdown__panel';
    panel.hidden = true;

    select.insertAdjacentElement('afterend', wrap);
    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    let isOpen = false;

    function selectedOption(){
      return select.options[select.selectedIndex] || null;
    }

    function refresh(){
      const option = selectedOption();
      triggerText.textContent = option ? option.textContent : '';
      trigger.classList.toggle('is-placeholder', !option || !option.value);
      wrap.classList.toggle('is-disabled', !!select.disabled);
      panel.innerHTML = '';
      Array.from(select.options).forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'portal-dropdown__option';
        btn.textContent = opt.textContent;
        if (opt.disabled) btn.disabled = true;
        if (!opt.value) btn.classList.add('is-placeholder');
        if (opt.selected) btn.classList.add('is-selected');
        btn.addEventListener('click', () => {
          if (opt.disabled) return;
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          refresh();
          close();
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
      updateOpenState();
    }
    function close(){
      isOpen = false;
      wrap.classList.remove('is-open');
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      updateOpenState();
    }

    trigger.addEventListener('click', () => {
      if (isOpen) close(); else open();
    });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    select.addEventListener('change', refresh);

    refresh();
    const entry = { refresh, close, open, isOpen: () => isOpen };
    dropdownRegistry.set(select, entry);
    return entry;
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.portal-dropdown')) closeAllCustomDropdowns();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllCustomDropdowns();
  });

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = countries.map(c => `<option value="${c.id}">${window.GCP.escapeHtml(c.name_en)}</option>`).join("");
    if (countrySelect._portalDropdown) countrySelect._portalDropdown.refresh();
  }

  async function loadSections(){
    const sections = await window.GCP.apiFetch('/sections', { method:'GET' });
    const active = sections.filter(s => s.is_active);
    requiredBox.innerHTML = active.map(s => (
      `<label class="calendar-checkitem">
        <input type="checkbox" value="${s.id}">
        <span>${window.GCP.escapeHtml(s.label)}</span>
      </label>`
    )).join('');
  }

  function formatDate(d){
    return d ? String(d).slice(0,10) : "";
  }

  function formatSubmitter(roleKey){
    const map = { supervisor:'Supervisor', chairman:'Deputy', minister:'Minister' };
    return map[String(roleKey||'chairman').toLowerCase()] || 'Deputy';
  }

  function renderStatusPill(ev){
    if (!ev.is_active) return '<span class="calendar-status-pill is-ended">Ended</span>';
    const overdue = ev.deadline_date && new Date(ev.deadline_date) < new Date(new Date().toISOString().slice(0,10));
    if (overdue) return '<span class="calendar-status-pill is-overdue">Overdue</span>';
    return '<span class="calendar-status-pill is-active">Active</span>';
  }

  async function loadEvents(){
    const events = await window.GCP.apiFetch("/events?is_active=true", { method:"GET" });
    eventsTbody.innerHTML = "";
    for (const ev of events){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><div class="calendar-row-title">${window.GCP.escapeHtml(ev.title)}</div></td>
        <td>${window.GCP.escapeHtml(ev.country_name_en)}</td>
        <td>${formatSubmitter(ev.submitter_role)}</td>
        <td>${ev.deadline_date ? window.GCP.escapeHtml(window.GCP.formatDate(ev.deadline_date)) : '<span class="muted">—</span>'}</td>
        <td>${renderStatusPill(ev)}</td>
        <td class="row calendar-row-actions">
          <button class="btn" data-act="view">View</button>
          ${canManage ? `<button class="btn primary" data-act="edit">Edit</button>` : ''}
          ${canEnd ? `<button class="btn danger" data-act="end">End event</button>` : ''}
        </td>
      `;
      tr.querySelector('[data-act="view"]').addEventListener("click", async () => {
        const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:"GET" });
        const req = (details.required_sections || details.requiredSections || []);
        const labels = Array.isArray(req) ? req.map(s => s.label).filter(Boolean) : [];
        alert(`Required sections:

${(labels.length ? labels.join('
') : '—')}`);
      });

      if (canManage){
        tr.querySelector('[data-act="edit"]').addEventListener("click", async () => {
          const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:"GET" });
          editEventId = ev.id;
          countrySelect.value = String(details.country_id);
          titleInput.value = details.title || "";
          occasionInput.value = details.occasion || "";
          submitterSelect.value = String(details.submitter_role || details.submitterRole || 'chairman');
          deadlineInput.value = formatDate(details.deadline_date);
          const req = (details.required_sections || details.requiredSections || []);
          const reqIds = new Set((Array.isArray(req) ? req : []).map(s => String(s.id)));
          for (const cb of requiredBox.querySelectorAll('input[type=checkbox]')){
            cb.checked = reqIds.has(String(cb.value));
          }
          saveBtn.textContent = "Update event";
          msg.textContent = `Editing event #${ev.id}`;
          countrySelect._portalDropdown?.refresh();
          submitterSelect._portalDropdown?.refresh();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }

      if (canEnd){
        const endBtn = tr.querySelector('[data-act="end"]');
        if (endBtn){
          endBtn.addEventListener('click', async () => {
            if (!confirm('End this event?')) return;
            await window.GCP.apiFetch(`/events/${ev.id}/end`, { method:'POST' });
            await loadEvents();
          });
        }
      }

      eventsTbody.appendChild(tr);
    }
  }

  function resetForm(){
    editEventId = null;
    form.reset();
    submitterSelect.value = 'chairman';
    for (const cb of requiredBox.querySelectorAll('input[type=checkbox]')) cb.checked = false;
    saveBtn.textContent = "Create event";
    msg.textContent = "";
    countrySelect._portalDropdown?.refresh();
    submitterSelect._portalDropdown?.refresh();
  }

  resetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    resetForm();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!canManage) return;

    const requiredSectionIds = Array.from(requiredBox.querySelectorAll('input[type=checkbox]:checked')).map(cb => Number(cb.value));
    const payload = {
      countryId: Number(countrySelect.value),
      title: titleInput.value.trim(),
      occasion: occasionInput.value.trim() || null,
      submitterRole: submitterSelect.value || 'chairman',
      deadlineDate: deadlineInput.value || null,
      requiredSectionIds,
    };

    try{
      if (!payload.title){
        msg.textContent = "Title is required.";
        return;
      }
      if (editEventId){
        await window.GCP.apiFetch(`/events/${editEventId}`, { method:"PUT", body: JSON.stringify(payload) });
      } else {
        await window.GCP.apiFetch("/events", { method:"POST", body: JSON.stringify(payload) });
      }
      resetForm();
      await loadEvents();
      msg.textContent = "Saved.";
    }catch(err){
      msg.textContent = err.message || "Failed";
    }
  });

  try{
    await Promise.all([loadCountries(), loadSections()]);
    countrySelect._portalDropdown = enhanceSelect(countrySelect);
    submitterSelect._portalDropdown = enhanceSelect(submitterSelect);
    submitterSelect._portalDropdown.refresh();
    await loadEvents();
  }catch(err){
    msg.textContent = err.message || "Failed to load";
  }
})();
