// dashboard-super-collab-upcoming.js
(async function(){
  const mount = document.getElementById('eventsGrid');
  const eventSelect = document.getElementById('eventSelect');
  if (!mount) return;

  const me = await window.GCP.requireAuth();
  if (!me) return;

  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function selectEvent(ev){
    if (!eventSelect) return;
    eventSelect.value = String(ev.id);
    // Update custom dropdown trigger text if present
    const wrap = eventSelect.nextElementSibling;
    if (wrap && wrap.classList.contains('portal-dropdown')){
      const text = wrap.querySelector('.portal-dropdown__text');
      const opt = Array.from(eventSelect.options).find(o => o.value === String(ev.id));
      if (text && opt) text.textContent = opt.textContent;
    }
    eventSelect.dispatchEvent(new Event('change', { bubbles:true }));
    const target = document.getElementById('docStatusBox') || document.querySelector('.grid');
    if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
  }

  try{
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    mount.innerHTML = '';
    for (const ev of (events || [])){
      const card = document.createElement('div');
      card.className = 'event-card event-card--clickable';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      const deadline = window.GCP.formatDate(ev.deadline_date) || '';
      const country = ev.country_name_en || '';
      const task = ev.task || ev.occasion || '';
      card.innerHTML = `
        <div class="row1">
          <div>
            <div class="title">${escapeHtml(ev.title || '')}</div>
            <div class="meta">
              <span class="badge primary">${escapeHtml(country)}</span>
              ${deadline ? `<span class="badge">Deadline: ${escapeHtml(deadline)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="task">${escapeHtml(task)}</div>`;
      card.addEventListener('click', () => selectEvent(ev));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); selectEvent(ev); } });
      mount.appendChild(card);
    }
  }catch(e){
    mount.innerHTML = '<div class="muted">Failed to load upcoming events.</div>';
  }
})();
