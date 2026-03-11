// dashboard-collab.js  —  Collaborator I
(async function(){
  function esc(s){ return window.GCP.escapeHtml(s); }

  const me = await window.GCP.requireAuth();
  if (!me) return;
  const role = String(me.role || '').toLowerCase();
  const roleHome = {
    super_collaborator:'dashboard-super-collab.html',
    collaborator:'dashboard-collab-review.html',
    collaborator_2:'dashboard-collab-2.html',
    collaborator_1:'dashboard-collab.html'
  };
  if (role !== 'collaborator_1'){ location.href = roleHome[role] || 'login.html'; return; }

  const eventSelect        = document.getElementById('eventSelect');
  const sectionSelect      = document.getElementById('sectionSelect');
  const openBtn            = document.getElementById('openEditorBtn');
  const msg                = document.getElementById('msg');
  const sectionStatusBox   = document.getElementById('sectionStatusBox');
  const openEditorSection  = document.getElementById('openEditorSection');

  let eventMeta = {};

  // ---- Minimal custom dropdown ----
  const dropdownRegistry = new Map();

  function syncDropdownOpenState(){
    const panel = document.getElementById("supervisorControlPanel");
    if (!panel) return;
    const hasOpen = Array.from(dropdownRegistry.values()).some(entry => entry && entry.isOpen && entry.isOpen());
    panel.classList.toggle("dropdown-open", hasOpen);
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
    select.classList.add("portal-select-native");
    const wrap = document.createElement("div");
    wrap.className = "portal-dropdown";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "portal-dropdown__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const triggerText = document.createElement("span");
    triggerText.className = "portal-dropdown__text";
    const triggerArrow = document.createElement("span");
    triggerArrow.className = "portal-dropdown__arrow";
    triggerArrow.setAttribute("aria-hidden", "true");
    trigger.appendChild(triggerText);
    trigger.appendChild(triggerArrow);
    const panel = document.createElement("div");
    panel.className = "portal-dropdown__panel";
    panel.hidden = true;
    select.parentNode.insertBefore(wrap, select.nextSibling);
    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    let isOpen = false;
    function getSelectedOption(){ return select.options[select.selectedIndex] || select.options[0] || null; }
    function updateTrigger(){
      const selected = getSelectedOption();
      triggerText.textContent = selected ? selected.textContent : "Select...";
      trigger.classList.toggle("is-placeholder", !select.value);
      trigger.disabled = !!select.disabled;
      wrap.classList.toggle("is-disabled", !!select.disabled);
    }
    function buildOptions(){
      panel.innerHTML = "";
      Array.from(select.options).forEach((opt, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "portal-dropdown__option";
        btn.setAttribute("role", "option");
        btn.dataset.value = opt.value;
        btn.dataset.index = String(idx);
        btn.disabled = !!opt.disabled;
        const label = document.createElement("span");
        label.className = "portal-dropdown__option-label";
        label.textContent = opt.textContent || "";
        btn.appendChild(label);
        if (!opt.value) btn.classList.add("is-placeholder");
        if (opt.value === select.value){ btn.classList.add("is-selected"); btn.setAttribute("aria-selected", "true"); }
        btn.addEventListener("click", () => {
          if (opt.disabled) return;
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
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
      wrap.classList.add("is-open");
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      syncDropdownOpenState();
    }
    function close(){
      isOpen = false;
      wrap.classList.remove("is-open");
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      syncDropdownOpenState();
    }
    function refresh(){ buildOptions(); updateTrigger(); }
    trigger.addEventListener("click", () => { if (isOpen) close(); else open(); });
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); }
      if (e.key === "Escape") close();
    });
    dropdownRegistry.set(select, { refresh, close, open, isOpen: () => isOpen });
    refresh();
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".portal-dropdown")) closeAllCustomDropdowns();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllCustomDropdowns();
  });

  function setMsg(text, isError=false){ msg.textContent=text||''; msg.style.color=isError?'crimson':'#2b445b'; }

  function humanSectionStatus(s){
    const map={
      draft:'Draft', returned:'Draft (Returned)',
      returned_by_collaborator_2:'Returned by Collaborator II',
      submitted_to_collaborator_2:'At Collaborator II',
      submitted_to_collaborator:'At Collaborator',
      approved_by_collaborator_2:'Approved by Collaborator II',
      submitted_to_super_collaborator:'At Super-collaborator',
      approved_by_collaborator:'Approved by Collaborator',
      approved_by_super_collaborator:'Approved by Super-collaborator',
      submitted_to_supervisor:'At Supervisor',
      approved_by_supervisor:'Approved by Supervisor',
    };
    return map[s]||(s||'Draft');
  }

  async function showSectionStatus(eventId, tp){
    if(!sectionStatusBox) return;
    if(!tp){ sectionStatusBox.style.display='none'; return; }
    const note=(tp.statusComment||'').trim();
    const status=tp.status||'draft';
    const progressHtml = window.GCP.renderCollabSimpleProgress(status, tp.stepNames);
    sectionStatusBox.style.display='block';
    sectionStatusBox.innerHTML=`
      <div style="margin-bottom:8px;"><b>Status:</b> ${esc(humanSectionStatus(status))}</div>
      <details class="progress-toggle" style="margin:10px 0;"><summary>Progress</summary><div class="lower-progress-inline">${progressHtml}</div></details>
      ${note?`<div style="margin-top:8px;padding:8px 10px;border-radius:10px;border:1px solid rgba(220,38,38,.25);background:rgba(254,226,226,.55);"><b>Return comment:</b> ${esc(note)}</div>`:''}
    `;
  }

  setupCustomDropdown(eventSelect);
  setupCustomDropdown(sectionSelect);

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch('/events/upcoming',{method:'GET'});
    eventMeta={};
    eventSelect.innerHTML=`<option value="">Select event...</option>`;
    sectionSelect.innerHTML=`<option value="">Select section...</option>`;
    sectionSelect.disabled=true;
    for(const ev of (events||[])){
      eventMeta[ev.id]={ occasion:ev.task||ev.occasion||'', country:ev.country_name_en||'' };
      const opt=document.createElement('option');
      opt.value=ev.id;
      opt.textContent=`${ev.title||'Event'} (${ev.country_name_en||''}${ev.deadline_date?', '+window.GCP.formatDate(ev.deadline_date):''})`;
      eventSelect.appendChild(opt);
    }
    refreshCustomDropdown(eventSelect);
    refreshCustomDropdown(sectionSelect);
  }

  async function loadSectionsForEvent(eventId){
    sectionSelect.innerHTML=`<option value="">Loading...</option>`;
    sectionSelect.disabled=true;
    refreshCustomDropdown(sectionSelect);
    const r=await window.GCP.apiFetch(`/my/sections?event_id=${encodeURIComponent(eventId)}`,{method:'GET'});
    const sections=(r.sections||[]).slice().sort((a,b)=>((a.order_index||0)-(b.order_index||0)));
    sectionSelect.innerHTML=`<option value="">Select section...</option>`;
    for(const s of sections){
      const opt=document.createElement('option');
      opt.value=(s.id!=null?s.id:s.section_id);
      opt.textContent=s.label;
      sectionSelect.appendChild(opt);
    }
    sectionSelect.disabled=false;
    refreshCustomDropdown(sectionSelect);
  }

  eventSelect.addEventListener('change', async()=>{
    setMsg('');
    const eventId=Number(eventSelect.value);
    if(!Number.isFinite(eventId)){ sectionSelect.innerHTML=`<option value="">Select section...</option>`; sectionSelect.disabled=true; refreshCustomDropdown(sectionSelect); showSectionStatus(null,null); return; }
    try{ await loadSectionsForEvent(eventId); showSectionStatus(eventId,null); }
    catch(e){ setMsg(e.message||'Failed to load sections',true); }
  });

  sectionSelect.addEventListener('change', async()=>{
    setMsg('');
    const eventId=Number(eventSelect.value);
    const sectionId=Number(sectionSelect.value);
    if(!Number.isFinite(eventId)||!Number.isFinite(sectionId)){ showSectionStatus(eventId,null); return; }
    try{
      const tp=await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(sectionId)}`,{method:'GET'});
      showSectionStatus(eventId,tp);
    }catch(e){ showSectionStatus(eventId,null); }
  });

  if(openBtn) openBtn.addEventListener('click',()=>{
    setMsg('');
    const eventId=Number(eventSelect.value);
    const sectionId=Number(sectionSelect.value);
    if(!Number.isFinite(eventId)||!Number.isFinite(sectionId)){ setMsg('Please select an event and a section.',true); return; }
    window.location.href=`editor.html?event_id=${eventId}&section_id=${sectionId}`;
  });

  // Refresh on back-navigation
  window.addEventListener('pageshow',(e)=>{
    if(e.persisted){ loadUpcoming().catch(()=>{}); }
  });

  await loadUpcoming();
})();
