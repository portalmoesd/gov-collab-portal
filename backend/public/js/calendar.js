// calendar.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role).toLowerCase();
  const canEdit = ["admin","chairman","supervisor","protocol"].includes(role);

  const msg = document.getElementById("msg");
  const eventsTbody = document.getElementById("eventsTbody");
  const form = document.getElementById("eventForm");
  const formCard = document.getElementById("formCard");

  const countrySelect = document.getElementById("countryId");
  const titleInput = document.getElementById("title");
  const occasionInput = document.getElementById("occasion");
  const deadlineInput = document.getElementById("deadlineDate");
  const requiredSelect = document.getElementById("requiredSections");
  const saveBtn = document.getElementById("saveEventBtn");
  const resetBtn = document.getElementById("resetFormBtn");

  let editEventId = null;

  if (!canEdit){
    formCard.style.display = "none";
  }

  async function loadCountries(){
    const countries = await window.GCP.apiFetch("/countries", { method:"GET" });
    countrySelect.innerHTML = countries.map(c => `<option value="${c.id}">${window.GCP.escapeHtml(c.name_en)}</option>`).join("");
  }

  async function loadSections(){
    const sections = await window.GCP.apiFetch("/sections", { method:"GET" });
    requiredSelect.innerHTML = sections.filter(s => s.is_active).map(s => `<option value="${s.id}">${window.GCP.escapeHtml(s.label)}</option>`).join("");
  }

  function formatDate(d){
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
        <td>${ev.deadline_date ? window.GCP.escapeHtml(ev.deadline_date) : '<span class="muted">—</span>'}</td>
        <td>${ev.is_active ? 'Yes' : 'No'}</td>
        <td class="row">
          <button class="btn" data-act="view">View</button>
          ${canEdit ? `<button class="btn primary" data-act="edit">Edit</button>` : ''}
        </td>
      `;
      tr.querySelector('[data-act="view"]').addEventListener("click", async () => {
        const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:"GET" });
        alert(`Required sections:\n\n${details.requiredSections.map(s => s.label).join("\n")}`);
      });

      if (canEdit){
        tr.querySelector('[data-act="edit"]').addEventListener("click", async () => {
          const details = await window.GCP.apiFetch(`/events/${ev.id}`, { method:"GET" });
          editEventId = ev.id;
          countrySelect.value = String(details.countryId);
          titleInput.value = details.title || "";
          occasionInput.value = details.occasion || "";
          deadlineInput.value = formatDate(details.deadlineDate);
          // select required sections
          const reqIds = new Set((details.requiredSections || []).map(s => String(s.id)));
          for (const opt of requiredSelect.options){
            opt.selected = reqIds.has(String(opt.value));
          }
          saveBtn.textContent = "Update event";
          msg.textContent = `Editing event #${ev.id}`;
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }

      eventsTbody.appendChild(tr);
    }
  }

  function resetForm(){
    editEventId = null;
    form.reset();
    saveBtn.textContent = "Create event";
    msg.textContent = "";
  }

  resetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    resetForm();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!canEdit) return;

    const requiredSectionIds = Array.from(requiredSelect.selectedOptions).map(o => Number(o.value));
    const payload = {
      countryId: Number(countrySelect.value),
      title: titleInput.value.trim(),
      occasion: occasionInput.value.trim() || null,
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
    await loadEvents();
  }catch(err){
    msg.textContent = err.message || "Failed to load";
  }
})();
