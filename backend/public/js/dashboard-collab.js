// dashboard-collab.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  const role = String(me.role || "").toLowerCase();
  if (!["collaborator","super_collaborator"].includes(role)){
    document.querySelector(".main").innerHTML = "<div class='card'>Access denied.</div>";
    return;
  }

  const eventsTbody = document.getElementById("eventsTbody");
  const eventSelect = document.getElementById("eventSelect");
  const sectionSelect = document.getElementById("sectionSelect");
  const openBtn = document.getElementById("openEditorBtn");
  const msg = document.getElementById("msg");

  let mySections = [];

  function fmtDate(s){
    return window.GCP.formatDateOnly ? window.GCP.formatDateOnly(s) : (s ? String(s) : "");
  }

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch("/events/upcoming", { method:"GET" });
    eventsTbody.innerHTML = "";
    eventSelect.innerHTML = `<option value="">Select event...</option>`;
    for (const ev of events){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(ev.title)}</td>
        <td>${window.GCP.escapeHtml(ev.country_name_en || "")}</td>
        <td>${window.GCP.escapeHtml(fmtDate(ev.deadline_date) || "")}</td>
      `;
      eventsTbody.appendChild(tr);

      const opt = document.createElement("option");
      opt.value = ev.id;
      opt.textContent = `${ev.title} (${ev.country_name_en || ""}${ev.deadline_date ? ", " + fmtDate(ev.deadline_date) : ""})`;
      eventSelect.appendChild(opt);
    }
  }

  async function loadMySections(){
    mySections = await window.GCP.apiFetch("/sections?mine=1", { method:"GET" });
  }

  function setSectionOptions(sections){
    sectionSelect.innerHTML = `<option value="">Select section...</option>`;
    for (const s of sections){
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      sectionSelect.appendChild(opt);
    }
  }

  async function refreshSectionOptionsForEvent(){
    const eventId = eventSelect.value;
    if (!eventId){
      setSectionOptions(mySections);
      return;
    }
    try{
      const ev = await window.GCP.apiFetch(`/events/${encodeURIComponent(eventId)}`, { method:"GET" });
      const reqList = (ev.requiredSections || ev.required_sections || []);
      const requiredIds = reqList.map(x => Number(x.sectionId || x.section_id || x.id)).filter(Number.isFinite);
      if (!requiredIds.length){
        setSectionOptions(mySections);
        return;
      }
      const filtered = mySections.filter(s => requiredIds.includes(Number(s.id)));
      setSectionOptions(filtered);
    }catch(err){
      // fallback
      setSectionOptions(mySections);
    }
  }

  openBtn.addEventListener("click", () => {
    msg.textContent = "";
    const eventId = eventSelect.value;
    const sectionId = sectionSelect.value;
    if (!eventId || !sectionId){
      msg.textContent = "Please select event and section.";
      return;
    }
    location.href = `editor.html?eventId=${encodeURIComponent(eventId)}&sectionId=${encodeURIComponent(sectionId)}`;
  });

  eventSelect.addEventListener("change", refreshSectionOptionsForEvent);

  try{
    await loadMySections();
    await loadUpcoming();
    setSectionOptions(mySections);
  }catch(err){
    msg.textContent = err.message || "Failed to load dashboard";
  }
})();
