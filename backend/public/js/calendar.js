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

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = '<option value="" disabled selected>Select country</option>' + countries.map(c => `<option value="${c.id}">${window.GCP.escapeHtml(c.name_en)}</option>`).join("");
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

  function formatDateForInput(d){
    return d ? String(d).slice(0,10) : "";
  }

  async function loadEvents(){
    const events = await window.GCP.apiFetch("/events?is_active=true", { method:"GET" });
    eventsTbody.innerHTML = "";
    for (const ev of events){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(ev.title)}</td>
        <td>${window.GCP.escapeHtml(ev.country_name_en)}</td>
        <td>${ev.deadline_date ? window.GCP.escapeHtml(window.GCP.formatDate(ev.deadline_date)) : '<span class="muted">—</span>'}</td>
        <td>${ev.is_active ? 'Yes' : 'No'}</td>
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
          deadlineInput.value = formatDateForInput(details.deadline_date);
          const req = (details.required_sections || details.requiredSections || []);
          const reqIds = new Set((Array.isArray(req) ? req : []).map(s => String(s.id)));
          for (const cb of requiredBox.querySelectorAll('input[type=checkbox]')){
            cb.checked = reqIds.has(String(cb.value));
          }
          saveBtn.textContent = "Update event";
          msg.textContent = `Editing event #${ev.id}`;
          msg.style.color = 'var(--text)';
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
    if (countrySelect.options.length){ countrySelect.selectedIndex = 0; }
    if (submitterRoleInput) submitterRoleInput.value = 'chairman';
    for (const cb of requiredBox.querySelectorAll('input[type=checkbox]')) cb.checked = false;
    saveBtn.textContent = "Create event";
    msg.textContent = "";
    msg.style.color = 'var(--danger)';
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
      if (!payload.countryId){
        msg.textContent = "Country is required.";
        return;
      }
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
      msg.style.color = 'var(--ok)';
    }catch(err){
      msg.textContent = err.message || "Failed";
      msg.style.color = 'var(--danger)';
    }
  });

  try{
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
