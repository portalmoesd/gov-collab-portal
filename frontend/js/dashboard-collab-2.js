// dashboard-collab-2.js  —  Collaborator II
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
  if (role !== 'collaborator_2'){ location.href = roleHome[role] || 'login.html'; return; }

  const eventSelect        = document.getElementById('eventSelect');
  const sectionsTbody      = document.getElementById('sectionsTbody');
  const sectionsCards      = document.getElementById('sectionsCards');
  const sectionsEmpty      = document.getElementById('sectionsEmpty');
  const submitDocBtn       = document.getElementById('submitDocBtn');
  const previewFullBtn     = document.getElementById('previewFullBtn');
  const modalBackdrop      = document.getElementById('modalBackdrop');
  const modalContent       = document.getElementById('modalContent');
  const modalCloseBtn      = document.getElementById('modalCloseBtn');
  const msg                = document.getElementById('msg');
  const docStatusBox       = document.getElementById('docStatusBox');
  const supervisorControlPanel = document.getElementById('supervisorControlPanel');

  let currentEventId = null;
  let currentSections = [];
  const eventsById = new Map();

  // Update submit button label to be Collaborator II-appropriate
  if (submitDocBtn) {
    submitDocBtn.textContent = 'Submit Approved Sections to Collaborator';
  }

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

  function setMsg(text, isError=false){ if(msg){msg.textContent=text||''; msg.style.color=isError?'crimson':'#2b445b';} }

  function humanStatus(s){
    const map={
      draft:'Draft', in_progress:'Draft',
      submitted_to_collaborator_2:'At Collaborator II',
      returned_by_collaborator_2:'Returned by Collaborator II',
      approved_by_collaborator_2:'Approved by Collaborator II',
      submitted_to_collaborator:'Submitted to Collaborator',
      returned_by_collaborator:'Returned by Collaborator',
      approved_by_collaborator:'Approved by Collaborator',
      submitted_to_super_collaborator:'At Super-collaborator',
      returned_by_super_collaborator:'Returned by Super-collaborator',
      approved_by_super_collaborator:'Approved (Super-collab.)',
      submitted_to_supervisor:'At Supervisor',
      returned_by_supervisor:'Returned by Supervisor',
      approved_by_supervisor:'Approved (Supervisor)',
      submitted_to_chairman:'Submitted to Deputy',
      approved_by_chairman:'Approved (Deputy)',
      approved_by_minister:'Approved (Minister)',
    };
    return map[s]||(s||'');
  }

  function statusBadgeClass(status){
    const s=String(status||'').toLowerCase();
    if(['draft','in_progress','locked'].includes(s)) return 'is-draft';
    if(['submitted_to_collaborator_2','submitted_to_collaborator','submitted_to_super_collaborator'].includes(s)) return 'is-review';
    if(['submitted_to_supervisor','submitted_to_chairman'].includes(s)) return 'is-submitted';
    if(s.startsWith('approved_')) return 'is-approved';
    if(s.startsWith('returned_')) return 'is-returned';
    return 'is-draft';
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
    const s=String(section.status||'').toLowerCase();
    const isAssigned=!!section.isAssigned;
    const isAtMe=['submitted_to_collaborator_2','returned_by_collaborator_2'].includes(s);
    const canOpen=isAssigned||isAtMe;

    if(canOpen){
      wrap.appendChild(createMicroAction('Open','open',()=>{
        window.location.href=`editor.html?event_id=${currentEventId}&section_id=${section.sectionId}`;
      }));
    }

    if(isAtMe){
      wrap.appendChild(createMicroAction('Return','return',async()=>{
        const note=prompt('Return comment (required):','');
        if(note===null) return;
        try{
          await window.GCP.apiFetch('/tp/return',{method:'POST',body:JSON.stringify({eventId:currentEventId,sectionId:section.sectionId,note})});
          setMsg('Section returned.'); await refreshStatusGrid();
        }catch(e){setMsg(e.message||'Return failed',true);}
      }));
      wrap.appendChild(createMicroAction('Submit','submit',async()=>{
        if(!confirm('Submit this section upward to Collaborator?')) return;
        try{
          await window.GCP.apiFetch('/tp/submit',{method:'POST',body:JSON.stringify({eventId:currentEventId,sectionId:section.sectionId,htmlContent:''})});
          setMsg('Section submitted to Collaborator.'); await refreshStatusGrid();
        }catch(e){setMsg(e.message||'Submit failed',true);}
      }));
    }

    if(!canOpen && !isAtMe){
      wrap.innerHTML='<span class="required-actions-muted">—</span>';
    }
    target.appendChild(wrap);
  }

  function renderRow(s){
    const last=s.lastUpdatedAt?window.GCP.formatDateTime(s.lastUpdatedAt):'';
    const note=(s.statusComment||'').trim();
    const updatedBy=s.lastUpdatedBy||'—';
    const badgeClass=statusBadgeClass(s.status);
    const progressHtml=window.GCP.renderLowerTierProgress(s.status, s.stepNames);
    const tr=document.createElement('tr'); tr.className='required-sections-row';
    tr.innerHTML=`
      <td>
        <div class="required-section-name">${esc(s.sectionLabel)}</div>
        <div class="lower-progress-inline">${progressHtml}</div>
        ${note?`<div class="required-section-note"><b>Comment:</b> ${esc(note)}</div>`:''}
      </td>
      <td><span class="required-status-badge ${badgeClass}">${esc(humanStatus(s.status))}</span></td>
      <td><span class="required-updated-at">${esc(last||'—')}</span></td>
      <td><span class="required-updated-by">${esc(updatedBy)}</span></td>
      <td class="required-actions-cell"></td>
    `;
    appendSectionActions(tr.querySelector('.required-actions-cell'),s);
    return tr;
  }

  function renderCard(s){
    const last=s.lastUpdatedAt?window.GCP.formatDateTime(s.lastUpdatedAt):'';
    const note=(s.statusComment||'').trim();
    const updatedBy=s.lastUpdatedBy||'—';
    const badgeClass=statusBadgeClass(s.status);
    const progressHtml=window.GCP.renderLowerTierProgress(s.status, s.stepNames);
    const card=document.createElement('article'); card.className='required-section-card';
    card.innerHTML=`
      <div class="required-section-card__top">
        <div class="required-section-card__meta">
          <div class="required-section-name">${esc(s.sectionLabel)}</div>
          <div class="required-section-meta">Last update · ${esc(last||'—')}</div>
        </div>
        <span class="required-status-badge ${badgeClass}">${esc(humanStatus(s.status))}</span>
      </div>
      <div class="lower-progress-inline" style="margin:8px 0;">${progressHtml}</div>
      <div class="required-section-card__line"><span>Updated by</span><strong>${esc(updatedBy)}</strong></div>
      ${note?`<div class="required-section-note"><b>Comment:</b> ${esc(note)}</div>`:''}
      <div class="required-actions-card"></div>
    `;
    appendSectionActions(card.querySelector('.required-actions-card'),s);
    return card;
  }

  async function refreshStatusGrid(){
    if(!currentEventId) return;
    const data=await window.GCP.apiFetch(`/tp/status-grid?event_id=${currentEventId}`,{method:'GET'});
    currentSections=data.sections||[];
    if(sectionsTbody) sectionsTbody.innerHTML='';
    if(sectionsCards) sectionsCards.innerHTML='';
    if(sectionsEmpty) sectionsEmpty.hidden=true;

    if(!currentSections.length){
      if(sectionsEmpty) sectionsEmpty.hidden=false;
      if(sectionsTbody) sectionsTbody.innerHTML=`<tr class="required-sections-empty-row"><td colspan="5">No sections assigned to you for this event.</td></tr>`;
      if(submitDocBtn) submitDocBtn.disabled=true;
      return;
    }

    for(const s of currentSections){
      if(sectionsTbody) sectionsTbody.appendChild(renderRow(s));
      if(sectionsCards) sectionsCards.appendChild(renderCard(s));
    }

    // Enable submit if any assigned section is approved_by_collaborator_2 or returned_by_collaborator
    const canSubmit=currentSections.some(s=>{
      const st=String(s.status||'').toLowerCase();
      return st==='approved_by_collaborator_2'||st==='returned_by_collaborator';
    });
    if(submitDocBtn){ submitDocBtn.disabled=!canSubmit; submitDocBtn.style.display=''; }
  }

  async function loadUpcoming(){
    const events=await window.GCP.apiFetch('/events/upcoming',{method:'GET'});
    eventSelect.innerHTML=`<option value="">Select event...</option>`;
    eventsById.clear();
    for(const ev of (events||[])){
      eventsById.set(Number(ev.id),ev);
      const opt=document.createElement('option');
      opt.value=ev.id;
      opt.textContent=`${ev.title||'Event'} (${ev.country_name_en||''}${ev.deadline_date?', '+window.GCP.formatDate(ev.deadline_date):''})`;
      eventSelect.appendChild(opt);
    }
    refreshCustomDropdown(eventSelect);
  }

  eventSelect.addEventListener('change', async()=>{
    setMsg('');
    currentEventId=Number(eventSelect.value);
    if(!Number.isFinite(currentEventId)||currentEventId<=0){
      currentEventId=null;
      if(sectionsTbody) sectionsTbody.innerHTML='';
      if(sectionsCards) sectionsCards.innerHTML='';
      if(sectionsEmpty) sectionsEmpty.hidden=false;
      if(submitDocBtn) submitDocBtn.disabled=true;
      if(docStatusBox) docStatusBox.innerHTML='';
      return;
    }
    try{ await refreshStatusGrid(); }
    catch(e){ setMsg(e.message||'Failed to load sections',true); }
  });

  if(submitDocBtn) submitDocBtn.addEventListener('click', async()=>{
    if(!currentEventId||submitDocBtn.disabled) return;
    if(!confirm('Submit approved sections to Collaborator?')) return;
    setMsg('');
    try{
      const result=await window.GCP.apiFetch('/tp/submit-approved-to-collaborator',{method:'POST',body:JSON.stringify({eventId:currentEventId})});
      if(result&&Number(result.submitted||0)>0) setMsg('Sections submitted to Collaborator.');
      else setMsg('No sections were ready to submit. Approve sections first.');
      await refreshStatusGrid();
    }catch(e){ setMsg(e.message||'Submit failed',true); }
  });

  if(previewFullBtn) previewFullBtn.addEventListener('click', async()=>{
    if(!currentEventId) return;
    try{
      const parts=[];
      for(const s of currentSections){
        const tp=await window.GCP.apiFetch(`/tp?event_id=${encodeURIComponent(currentEventId)}&section_id=${encodeURIComponent(s.sectionId)}`,{method:'GET'});
        parts.push(`<h2 style="margin:18px 0 8px;">${window.GCP.escapeHtml(tp.sectionLabel||s.sectionLabel||'')}</h2>`);
        parts.push(tp.htmlContent||'<div class="muted">—</div>');
      }
      if(modalContent) modalContent.innerHTML=`<div style="padding:8px 2px;">${parts.join('')}</div>`;
      if(modalBackdrop) modalBackdrop.style.display='flex';
    }catch(e){ setMsg(e.message||'Failed to preview',true); }
  });

  if(modalCloseBtn) modalCloseBtn.addEventListener('click',()=>{ if(modalBackdrop)modalBackdrop.style.display='none'; if(modalContent)modalContent.innerHTML=''; });
  if(modalBackdrop) modalBackdrop.addEventListener('click',(e)=>{ if(e.target===modalBackdrop){modalBackdrop.style.display='none'; if(modalContent)modalContent.innerHTML='';} });

  setupCustomDropdown(eventSelect);

  // Refresh on back-navigation
  window.addEventListener('pageshow',(e)=>{
    const savedId=currentEventId;
    loadUpcoming().then(()=>{ if(savedId){ eventSelect.value=String(savedId); eventSelect.dispatchEvent(new Event('change')); } }).catch(()=>{});
  });

  await loadUpcoming();
})();
