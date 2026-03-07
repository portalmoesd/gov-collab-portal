// calendar.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const canManage = ['admin','chairman','supervisor','protocol','super_collaborator'].includes(role);
  const canEnd = ['admin','chairman','supervisor','protocol'].includes(role);

  const msg = document.getElementById("msg");
  const eventsTbody = document.getElementById("eventsTbody");
  const form = document.getElementById("eventForm");
  const formCard = document.getElementById("formCard");

  const countrySelect = document.getElementById("countryId");
  const titleInput = document.getElementById("title");
  const occasionInput = document.getElementById("occasion");
  const submitterRoleInput = document.getElementById("submitterRole");
  const deadlineInput = document.getElementById("deadlineDate");
  const requiredBox = document.getElementById("requiredSectionsBox");
  const saveBtn = document.getElementById("saveEventBtn");
  const resetBtn = document.getElementById("resetFormBtn");

  let editEventId = null;

  if (!canManage){
    formCard.style.display = "none";
  }

  const dropdownRegistry = new Map();

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

    function updateTrigger(){
      const selected = select.options[select.selectedIndex] || null;
      const label = selected ? selected.textContent : '';
      triggerText.textContent = label || 'Select...';
      const isPlaceholder = !select.value;
      trigger.classList.toggle('is-placeholder', isPlaceholder);
      trigger.disabled = !!select.disabled;
      wrap.classList.toggle('is-disabled', !!select.disabled);
    }

    function buildOptions(){
      panel.innerHTML = '';
      Array.from(select.options).forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'portal-dropdown__option';
        btn.setAttribute('role', 'option');
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
      dropdownRegistry.forEach((entry, key) => { if (key !== select) entry.close(); });
      isOpen = true;
      wrap.classList.add('is-open');
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }

    function close(){
      isOpen = false;
      wrap.classList.remove('is-open');
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    function refresh(){
      buildOptions();
      updateTrigger();
    }

    trigger.addEventListener('click', () => { isOpen ? close() : open(); });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      if (e.key === 'Escape') close();
    });

    dropdownRegistry.set(select, { refresh, close });
    refresh();
  }

  function refreshDropdown(select){
    const entry = dropdownRegistry.get(select);
    if (entry) entry.refresh();
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.portal-dropdown')) dropdownRegistry.forEach(entry => entry.close());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdownRegistry.forEach(entry => entry.close());
  });

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = countries.map(c => `<option value="${c.id}">${window.GCP.escapeHtml(c.name_en)}</option>`).join("");
    refreshDropdown(countrySelect);
  }

  async function loadSections(){
    const sections = await window.GCP.apiFetch('/sections', { method:'GET' });
    const active = sections.filter(s => s.is_active);
    requiredBox.innerHTML = active.map(s => (
      `<label class="checkitem calendar-checkitem">
        <input type="checkbox" value="${s.id}">
        <span>${window.GCP.escapeHtml(s.label)}</span>
      </label>`
    )).join('');
  }

  function formatDate(d){
    return d ? String(d).slice(0,10) : "";
  }

  function humanSubmitter(v){
    const s = String(v || 'chairman').toLowerCase();
    if (s === 'supervisor') return 'Supervisor';
    if (s === 'minister') return 'Minister';
    return 'Deputy';
  }

  function eventStatusBadge(ev){
    if (!ev.is_active || ev.ended_at) return '<span class="calendar-status-badge is-ended">Ended</span>';
    if (ev.deadline_date) {
      const due = new Date(String(ev.deadline_date).slice(0,10) + 'T00:00:00');
      const today = new Date();
      today.setHours(0,0,0,0);
      if (due < today) return '<span class="calendar-status-badge is-overdue">Overdue</span>';
    }
    return '<span class="calendar-status-badge is-active">Active</span>';
  }

  async function loadEvents(){
    const events = await window.GCP.apiFetch("/events?is_active=true", { method:"GET" });
    eventsTbody.innerHTML = "";
    for (const ev of events){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(ev.title)}</td>
        <td>${window.GCP.escapeHtml(ev.country_name_en)}</td>
        <td>${window.GCP.escapeHtml(humanSubmitter(ev.submitter_role || ev.submitterRole))}</td>
        <td>${ev.deadline_date ? window.GCP.escapeHtml(window.GCP.formatDate(ev.deadline_date)) : '<span class="muted">—</span>'}</td>
        <td>${eventStatusBadge(ev)}</td>
        <td class="row">
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
          if (submitterRoleInput) submitterRoleInput.value = (details.submitter_role || details.submitterRole || 'chairman');
          deadlineInput.value = formatDate(details.deadline_date);
          const req = (details.required_sections || details.requiredSections || []);
          const reqIds = new Set((Array.isArray(req) ? req : []).map(s => String(s.id)));
          for (const cb of requiredBox.querySelectorAll('input[type=checkbox]')) cb.checked = reqIds.has(String(cb.value));
          refreshDropdown(countrySelect);
          refreshDropdown(submitterRoleInput);
          saveBtn.textContent = "Update event";
          msg.textContent = `Editing event #${ev.id}`;
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
    if (submitterRoleInput) submitterRoleInput.value = 'chairman';
    refreshDropdown(countrySelect);
    refreshDropdown(submitterRoleInput);
    saveBtn.textContent = "Create event";
    msg.textContent = "";
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
      submitterRole: (submitterRoleInput?.value || 'chairman'),
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
    setupCustomDropdown(countrySelect);
    setupCustomDropdown(submitterRoleInput);
    await Promise.all([loadCountries(), loadSections()]);
    await loadEvents();
  }catch(err){
    msg.textContent = err.message || "Failed to load";
  }
})();

async function endEvent(id){
  if(!confirm('End this event?')) return;
  await window.GCP.apiFetch(`/events/${id}/end`, { method: 'POST' });
}
