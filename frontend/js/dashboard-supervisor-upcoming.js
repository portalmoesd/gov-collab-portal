// dashboard-supervisor-upcoming.js
(async function(){
  const eventsGrid = document.getElementById('eventsGrid');
  if (!eventsGrid) return;

  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function openEvent(ev){
    if (!ev || !ev.id) return;
    const url = `editor.html?event_id=${encodeURIComponent(ev.id)}`;
    window.open(url, '_blank');
  }

  async function loadUpcoming(){
    let events = [];
    try{
      events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    }catch(e){
      if (eventsGrid) eventsGrid.innerHTML = `<div class="muted">Failed to load upcoming events.</div>`;
      return;
    }
    eventsGrid.innerHTML = '';
    if (!Array.isArray(events) || !events.length){
      eventsGrid.innerHTML = `<div class="muted">No upcoming events.</div>`;
      return;
    }

    for (const ev of events){
      const card = document.createElement('div');
      card.className = 'event-card';
      const deadline = window.GCP.formatDate(ev.deadline_date) || '';
      const country = ev.country_name_en || '';
      const task = (ev.task || ev.occasion || '').trim();
      card.innerHTML = `
        <div class="row1">
          <div>
            <div class="title">${escapeHtml(ev.title || 'Event')}</div>
            <div class="meta">
              ${country ? `<span class="badge badge-blue">${escapeHtml(country)}</span>` : ''}
              ${deadline ? `<span class="badge">Deadline: ${escapeHtml(deadline)}</span>` : ''}
            </div>
          </div>
          <button class="openmini" type="button">Open</button>
        </div>
        ${task ? `<div class="task">${escapeHtml(task)}</div>` : ''}
      `;
      card.querySelector('.openmini').addEventListener('click', () => openEvent(ev));
      eventsGrid.appendChild(card);
    }
  }

  if (window.GCP?.requireAuth) {
    const me = await window.GCP.requireAuth();
    if (!me) return;
  }
  await loadUpcoming();
})();
