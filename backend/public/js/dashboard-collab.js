// dashboard-collab.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const eventsTbody = document.getElementById("eventsTbody");
  const eventSelect = document.getElementById("eventSelect");
  const eventsById = new Map();  const sectionSelect = document.getElementById("sectionSelect");
  const openBtn = document.getElementById("openEditorBtn");
  const msg = document.getElementById("msg");

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch("/events/upcoming-for-me", { method:"GET" });
    eventsTbody.innerHTML = "";
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    for (const ev of events){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(ev.title)}</td>
        <td>${window.GCP.escapeHtml(ev.country_name_en)}</td>
        <td>${ev.deadline_date ? window.GCP.escapeHtml(ev.deadline_date) : '<span class="muted">—</span>'}</td>
        <td><button class="btn" data-eid="${ev.id}">Select</button></td>
      `;
      tr.querySelector("button").addEventListener("click", () => {
        eventSelect.value = String(ev.id);
      });
      eventsTbody.appendChild(tr);

      const opt = document.createElement("option");
      opt.value = ev.id;
      opt.textContent = `${ev.title} (${ev.country_name_en}${ev.deadline_date ? ', ' + ev.deadline_date : ''})`;
      eventSelect.appendChild(opt);
    }
  }
  }

  async function loadMySections(){
    const sections = await window.GCP.apiFetch("/sections?mine=1", { method:"GET" });
    sectionSelect.innerHTML = `<option value="">Select section...</option>`;
    for (const s of sections){
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      sectionSelect.appendChild(opt);
    }
  }

  openBtn.addEventListener("click", () => {
    msg.textContent = "";
    const eventId = eventSelect.value;
        const sectionId = sectionSelect.value;
    if (!eventId || !countryId || !sectionId){
      msg.textContent = "Please select event, country and section.";
      return;
    }
    location.href = `editor.html?eventId=${encodeURIComponent(eventId)}&countryId=${encodeURIComponent(countryId)}&sectionId=${encodeURIComponent(sectionId)}`;
  });

  try{
    await Promise.all([loadUpcoming(), loadMySections()]);
  }catch(err){
    msg.textContent = err.message || "Failed to load data";
  }
})();
