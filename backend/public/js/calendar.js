// calendar.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const canManage = ['admin','chairman','supervisor','protocol'].includes(role);
  const canEnd = ['admin','chairman','supervisor','protocol'].includes(role);

  const msg = document.getElementById("msg");
  const eventsTbody = document.getElementById("eventsTbody");
  const form = document.getElementById("eventForm");
  const formCard = document.getElementById("formCard");

  const countrySelect = document.getElementById("countryId");
  const titleInput = document.getElementById("title");
  const occasionInput = document.getElementById("occasion");
  const deadlineInput = document.getElementById("deadlineDate");
  const submitterSelect = document.getElementById("submitterRole");
  const requiredBox = document.getElementById("requiredSectionsBox");
  const saveBtn = document.getElementById("saveEventBtn");
  const resetBtn = document.getElementById("resetFormBtn");

  let editEventId = null;

  if (!canManage){
    formCard.style.display = "none";
  }

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = ['<option value="">Select country</option>'].concat(
      countries.map(c => `<option value="${c.id}">${window.GCP.escapeHtml(c.name_en)}</option>`)
    ).join("");
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

  function formatDateValue(d){
    return d ? String(d).slice(0,10) : "";
  }

  function formatSubmitter(role){
    const key = String(role || 'chairman').toLowerCase();
    if (key === 'chairman') return 'Deputy';
    if (key === 'supervisor') return 'Supervisor';
    if (key === 'minister') return 'Minister';
    return key;
  }

  function formatStatus(event){
    return event.is_active ? 'Active' : 'Ended';
  }

  function statusClass(event){
    return event.is_active ? 'approved' : 'returned';
  }

  async function loadEvents(){
    const events = await window.GCP.apiFetch("/events?is_active=true", { method:"GET" });
    eventsTbody.innerHTML = "";
    for (const ev of events){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><div class="calendar-table__title">${window.GCP.escapeHtml(ev.title)}</div></td>
        <td>${window.GCP.escapeHtml(ev.country_name_en)}</td>
        <td>${window.GCP.escapeHtml(formatSubmitter(ev.submitter_role || ev.submitterRole))}</td>
        <td>${ev.deadline_date ? window.GCP.escapeHtml(window.GCP.formatDate(ev.deadline_date)) : '<span class="muted">—</span>'}</td>
        <td><span class="pill ${statusClass(ev)}">${formatStatus(ev)}</span></td>
        <td class="calendar-table__actions">
          <button class="btn" data-act="view">View</button>
          ${canManage ? `<button class="btn primary" data-act="edit">Edit</button>` : ''}
          ${canEnd ? `<button class="btn danger" data-act="end">End event</button>` : ''}
        </td>
      `;
      tr.querySelector('[data-act="view"]').addEventListener("click", async () => {
        const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:"GET" });
        const req = (details.required_sections || details.requiredSections || []);
        const labels = Array.isArray(req) ? req.map(s => s.label).filter(Boolean) : [];
        alert(`Required sections:\n\n${(labels.length ? labels.join('\n') : '—')}`);
      });

      if (canManage){
        tr.querySelector('[data-act="edit"]').addEventListener("click", async () => {
          const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:"GET" });
          editEventId = ev.id;
          countrySelect.value = String(details.country_id || '');
          titleInput.value = details.title || "";
          occasionInput.value = details.occasion || "";
          deadlineInput.value = formatDateValue(details.deadline_date);
          submitterSelect.value = String(details.submitter_role || details.submitterRole || 'chairman').toLowerCase();
          const req = (details.required_sections || details.requiredSections || []);
          const reqIds = new Set((Array.isArray(req) ? req : []).map(s => String(s.id)));
          for (const cb of requiredBox.querySelectorAll('input[type=checkbox]')){
            cb.checked = reqIds.has(String(cb.value));
          }
          saveBtn.textContent = "Update event";
          msg.textContent = `Editing event #${ev.id}`;
          msg.className = 'calendar-message is-info';
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
    saveBtn.textContent = "Create event";
    msg.textContent = "";
    msg.className = 'calendar-message';
    requiredBox.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
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
      deadlineDate: deadlineInput.value || null,
      requiredSectionIds,
      submitterRole: submitterSelect.value || 'chairman',
    };

    try{
      if (!payload.countryId){
        msg.textContent = "Country is required.";
        msg.className = 'calendar-message is-error';
        return;
      }
      if (!payload.title){
        msg.textContent = "Title is required.";
        msg.className = 'calendar-message is-error';
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
      msg.className = 'calendar-message is-success';
    }catch(err){
      msg.textContent = err.message || "Failed";
      msg.className = 'calendar-message is-error';
    }
  });

  try{
    await Promise.all([loadCountries(), loadSections()]);
    submitterSelect.value = 'chairman';
    await loadEvents();
  }catch(err){
    msg.textContent = err.message || "Failed to load";
    msg.className = 'calendar-message is-error';
  }
})();
