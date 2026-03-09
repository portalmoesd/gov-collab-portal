// dashboard-supervisor-upcoming.js
(async function(){
  const mount = document.getElementById('eventsGrid');
  const eventSelect = document.getElementById('eventSelect');
  if (!mount) return;

  const me = await window.GCP.requireAuth();
  if (!me) return;

  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  try{
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    mount.innerHTML = '';
    for (const ev of (events || [])){
      const card = document.createElement('div');
      card.className = 'event-card';
      const deadline = window.GCP.formatDate(ev.deadline_date) || '';
      const country = ev.country_name_en || '';
      const task = ev.task || ev.occasion || '';
      card.innerHTML = `
        <div class="row1">
          <button class="openmini openmini-top" type="button">Open</button>
          <div>
            <div class="title">${escapeHtml(ev.title || '')}</div>
            <div class="meta">
              <span class="badge primary">${escapeHtml(country)}</span>
              ${deadline ? `<span class="badge">Deadline: ${escapeHtml(deadline)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="task">${escapeHtml(task)}</div>`;
      card.querySelector('.openmini').addEventListener('click', () => {
        if (eventSelect){
          eventSelect.value = String(ev.id);
          eventSelect.dispatchEvent(new Event('change', { bubbles:true }));
          const target = document.getElementById('docStatusBox') || document.querySelector('.grid');
          if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
        }
      });
      mount.appendChild(card);
    }
  }catch(e){
    mount.innerHTML = '<div class="muted">Failed to load upcoming events.</div>';
  }
})();
