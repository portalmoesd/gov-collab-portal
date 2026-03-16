// dashboard-collab.js  —  Collaborator I
(async function(){
  function esc(s){ return window.GCP.escapeHtml(s); }

  const me = await window.GCP.requireAuth();
  if (!me) return;
  const role = String(me.role || '').toLowerCase();
  const roleHome = {
    super_collaborator:'dashboard-super-collab.html',
    collaborator:'dashboard-collab-review.html',
    collaborator_3:'dashboard-collab-3.html',
    collaborator_2:'dashboard-collab-2.html',
    collaborator_1:'dashboard-collab.html'
  };
  if (role !== 'collaborator_1'){ location.href = roleHome[role] || 'login.html'; return; }

  const eventSelect        = document.getElementById('eventSelect');
  const msg                = document.getElementById('msg');
  const sectionsTbody      = document.getElementById('sectionsTbody');
  const sectionsCards      = document.getElementById('sectionsCards');
  const sectionsEmpty      = document.getElementById('sectionsEmpty');

  let eventMeta = {};
  let currentEventId = null;

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
      returned_by_collaborator_2:'Returned by Head Collaborator',
      submitted_to_collaborator_2:'At Head Collaborator',
      submitted_to_collaborator:'At Collaborator',
      approved_by_collaborator_2:'Approved by Head Collaborator',
      submitted_to_super_collaborator:'At Super-collaborator',
      approved_by_collaborator:'Approved by Collaborator',
      approved_by_super_collaborator:'Approved by Super-collaborator',
      submitted_to_supervisor:'At Supervisor',
      approved_by_supervisor:'Approved by Supervisor',
    };
    return map[s]||(s||'Draft');
  }

  function createMicroAction(label, kind, onClick){
    const btn=document.createElement('button'); btn.type='button';
    btn.className=`micro-action required-action required-action--${kind}`;
    btn.setAttribute('aria-label',label);
    btn.innerHTML=`<span class="micro-action__icon"></span><span class="micro-action__label">${esc(label)}</span>`;
    btn.addEventListener('click',onClick);
    return btn;
  }

  function appendSectionActions(target, section){
    const wrap=document.createElement('div'); wrap.className='required-actions';
    const st=String(section.status||'').toLowerCase();
    const rtr=String(section.returnTargetRole||'').toLowerCase();
    // Collab I can open always; can submit when section is draft or explicitly returned to them
    wrap.appendChild(createMicroAction('Open','open',()=>{
      window.location.href=`editor.html?event_id=${currentEventId}&section_id=${section.sectionId}`;
    }));
    const canSubmit=(st==='draft'||rtr==='collaborator_1');
    if(canSubmit){
      wrap.appendChild(createMicroAction('Submit','submit',async()=>{
        if(!confirm('Submit this section to Head Collaborator?')) return;
        try{
          await window.GCP.apiFetch('/tp/submit',{method:'POST',body:JSON.stringify({eventId:currentEventId,sectionId:section.sectionId})});
          await refreshStatusGrid();
        }catch(e){setMsg(e.message||'Submit failed',true);}
      }));
    }
    if(!canSubmit){
      wrap.appendChild(createMicroAction('Ask to Return','ask-to-return',async(e)=>{
        const note=await window.GCP.showCommentDropdown(e.currentTarget,{title:'Ask to Return',placeholder:'Why do you need it back? (optional)…',sendLabel:'Send Request'});
        if(note===null) return;
        try{
          await window.GCP.apiFetch('/tp/ask-to-return',{method:'POST',body:JSON.stringify({eventId:currentEventId,sectionId:section.sectionId,note})});
          setMsg('Return request sent.');
        }catch(e){setMsg(e.message||'Request failed',true);}
      }));
    }
    target.appendChild(wrap);
  }

  function renderRow(s){
    const last=s.lastUpdatedAt?window.GCP.formatDateTime(s.lastUpdatedAt):'';
    const note=(s.statusComment||'').trim();
    const updatedBy=s.lastUpdatedBy||'—';
    const progressHtml=window.GCP.renderCollabSimpleProgress(s.status, s.stepNames, s.lowerSubmitterRole, s.originalSubmitterRole, s.returnTargetRole, s.documentSubmitterRole);
    const tr=document.createElement('tr'); tr.className='required-sections-row';
    tr.innerHTML=`
      <td>
        <div class="required-section-name">${esc(s.sectionLabel)}</div>
        <div class="required-section-meta">${esc(last||'—')} · ${esc(updatedBy)}</div>
        ${note?`<div class="required-section-note"><b>Comment:</b> ${esc(note)}</div>`:''}
        ${s.returnRequest?`<div class="section-return-request-notice"><strong>Return requested</strong> by ${esc(s.returnRequest.from)}: ${esc(s.returnRequest.note||'(no comment)')}</div>`:''}
      </td>
      <td class="required-progress-cell"><div class="lower-progress-inline">${progressHtml}</div><div class="section-history-toggle-mount"></div></td>
      <td class="required-actions-cell"></td>
    `;
    appendSectionActions(tr.querySelector('.required-actions-cell'),s);
    window.GCP.attachSectionHistoryToggle(tr.querySelector('.section-history-toggle-mount'), s, currentEventId, false);
    return tr;
  }

  function renderCard(s){
    const last=s.lastUpdatedAt?window.GCP.formatDateTime(s.lastUpdatedAt):'';
    const note=(s.statusComment||'').trim();
    const updatedBy=s.lastUpdatedBy||'—';
    const progressHtml=window.GCP.renderCollabSimpleProgress(s.status, s.stepNames, s.lowerSubmitterRole, s.originalSubmitterRole, s.returnTargetRole, s.documentSubmitterRole);
    const card=document.createElement('article'); card.className='required-section-card';
    card.innerHTML=`
      <div class="required-section-card__head">
        <div class="required-section-name">${esc(s.sectionLabel)}</div>
        <div class="required-section-meta">${esc(last||'—')} · ${esc(updatedBy)}</div>
        ${note?`<div class="required-section-note"><b>Comment:</b> ${esc(note)}</div>`:''}
        ${s.returnRequest?`<div class="section-return-request-notice"><strong>Return requested</strong> by ${esc(s.returnRequest.from)}: ${esc(s.returnRequest.note||'(no comment)')}</div>`:''}
      </div>
      <div class="lower-progress-inline">${progressHtml}</div>
      <div class="section-history-toggle-mount"></div>
      <div class="required-actions-card"></div>
    `;
    appendSectionActions(card.querySelector('.required-actions-card'),s);
    window.GCP.attachSectionHistoryToggle(card.querySelector('.section-history-toggle-mount'), s, currentEventId, true);
    return card;
  }

  async function refreshStatusGrid(){
    if(!currentEventId) return;
    try{
      const data=await window.GCP.apiFetch(`/tp/status-grid?event_id=${currentEventId}`,{method:'GET'});
      const sections=data.sections||[];
      if(sectionsTbody) sectionsTbody.innerHTML='';
      if(sectionsCards) sectionsCards.innerHTML='';
      if(sectionsEmpty) sectionsEmpty.hidden=true;
      if(!sections.length){
        if(sectionsEmpty) sectionsEmpty.hidden=false;
        if(sectionsTbody) sectionsTbody.innerHTML=`<tr class="required-sections-empty-row"><td colspan="3">No sections assigned to you for this event.</td></tr>`;
        return;
      }
      for(const s of sections){
        if(sectionsTbody) sectionsTbody.appendChild(renderRow(s));
        if(sectionsCards) sectionsCards.appendChild(renderCard(s));
      }
    }catch(e){ /* silently ignore */ }
  }

  setupCustomDropdown(eventSelect);

  async function loadUpcoming(){
    const events = await window.GCP.apiFetch('/events/upcoming',{method:'GET'});
    eventMeta={};
    eventSelect.innerHTML=`<option value="">Select event...</option>`;
    for(const ev of (events||[])){
      eventMeta[ev.id]={ occasion:ev.task||ev.occasion||'', country:ev.country_name_en||'' };
      const opt=document.createElement('option');
      opt.value=ev.id;
      opt.textContent=`${ev.title||'Event'} (${ev.country_name_en||''}${ev.deadline_date?', '+window.GCP.formatDate(ev.deadline_date):''})`;
      eventSelect.appendChild(opt);
    }
    refreshCustomDropdown(eventSelect);
  }

  eventSelect.addEventListener('change', async()=>{
    setMsg('');
    const eventId=Number(eventSelect.value);
    currentEventId=(Number.isFinite(eventId)&&eventId>0)?eventId:null;
    if(!currentEventId){
      if(sectionsTbody) sectionsTbody.innerHTML='';
      if(sectionsCards) sectionsCards.innerHTML='';
      if(sectionsEmpty) sectionsEmpty.hidden=false;
      return;
    }
    try{ await refreshStatusGrid(); }
    catch(e){ setMsg(e.message||'Failed to load sections',true); }
  });

  // Refresh on back-navigation
  window.addEventListener('pageshow',(e)=>{
    if(e.persisted){ loadUpcoming().catch(()=>{}); }
  });

  await loadUpcoming();
})();
